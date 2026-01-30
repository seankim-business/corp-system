/**
 * Extension Loader
 *
 * Main service for loading, unloading, and managing extensions
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Express } from 'express';
import {
  ExtensionLoader as IExtensionLoader,
  ExtensionLoaderOptions,
  LoadResult,
  UnloadResult,
  LoadedExtension,
  HookManager,
  HookEventName,
  HookContext,
  HookHandler,
  ExtensionManifest,
  DependencyGraph,
  DependencyNode,
  DependencyError,
} from './types';
import {
  parseManifestFromDirectory,
  validateManifestPaths,
  resolveManifestPaths,
  validateVersionCompatibility,
} from './manifest-parser';
import { RouteRegistrar, getRouteRegistrar } from './route-registrar';
import { logger } from '../../utils/logger';
import { getExtensionRegistry, ExtensionRegistry } from '../extension-registry';

const NUBABEL_VERSION = '2.0.0';

/**
 * Default Hook Manager implementation
 */
export class DefaultHookManager implements HookManager {
  private handlers: Map<HookEventName, Map<string, HookHandler>> = new Map();

  register(event: HookEventName, extensionId: string, handler: HookHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Map());
    }
    this.handlers.get(event)!.set(extensionId, handler);
    logger.debug('Registered hook handler', { event, extensionId });
  }

  unregister(event: HookEventName, extensionId: string): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(extensionId);
      logger.debug('Unregistered hook handler', { event, extensionId });
    }
  }

  async emit(event: HookEventName, context: HookContext): Promise<void> {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    const promises: Promise<void>[] = [];
    for (const [extensionId, handler] of eventHandlers) {
      promises.push(
        handler(context).catch((error) => {
          logger.error(
            'Hook handler error',
            { event, extensionId },
            error as Error
          );
        })
      );
    }

    await Promise.all(promises);
  }

  getHandlers(event: HookEventName): Map<string, HookHandler> {
    return this.handlers.get(event) || new Map();
  }

  /**
   * Get all handlers for an event as array
   */
  getHandlersArray(event: HookEventName): Array<[string, HookHandler]> {
    const handlers = this.handlers.get(event);
    return handlers ? Array.from(handlers.entries()) : [];
  }
}

/**
 * Extension Loader Service
 */
export class ExtensionLoaderService implements IExtensionLoader {
  private extensions: Map<string, LoadedExtension> = new Map();
  private options: ExtensionLoaderOptions;
  private hookManager: HookManager;
  private routeRegistrar: RouteRegistrar;
  private extensionRegistry: ExtensionRegistry | null = null;

  constructor(
    options: ExtensionLoaderOptions = {},
    hookManager?: HookManager
  ) {
    this.options = {
      extensionsDir: path.join(process.cwd(), 'extensions'),
      enableHotReload: process.env.NODE_ENV === 'development',
      validateManifest: true,
      loadTimeout: 30000,
      ...options,
    };
    this.hookManager = hookManager || new DefaultHookManager();
    this.routeRegistrar = getRouteRegistrar();

    try {
      this.extensionRegistry = getExtensionRegistry();
    } catch {
      logger.warn('Extension registry not available');
    }
  }

  /**
   * Load extension from a directory
   */
  async loadFromDirectory(dirPath: string): Promise<LoadResult> {
    const warnings: string[] = [];

    logger.info('Loading extension from directory', { path: dirPath });

    // Verify directory exists
    if (!fs.existsSync(dirPath)) {
      return {
        success: false,
        errors: [`Directory not found: ${dirPath}`],
      };
    }

    // Parse manifest
    const manifestResult = parseManifestFromDirectory(dirPath);
    if (!manifestResult.success) {
      return {
        success: false,
        errors: manifestResult.errors,
      };
    }

    const manifest = manifestResult.manifest!;
    if (manifestResult.warnings) {
      warnings.push(...manifestResult.warnings);
    }

    // Check if already loaded
    if (this.extensions.has(manifest.id)) {
      return {
        success: false,
        errors: [`Extension already loaded: ${manifest.id}`],
      };
    }

    // Validate version compatibility
    const versionCheck = validateVersionCompatibility(
      manifest.nubabelVersion,
      NUBABEL_VERSION
    );
    if (!versionCheck.compatible) {
      return {
        success: false,
        errors: [versionCheck.message!],
      };
    }

    // Validate paths
    if (this.options.validateManifest) {
      const pathValidation = validateManifestPaths(manifest, dirPath);
      if (!pathValidation.valid) {
        return {
          success: false,
          errors: pathValidation.errors,
        };
      }
      warnings.push(...pathValidation.warnings);
    }

    // Resolve dependencies
    const depResult = await this.resolveDependencies(manifest);
    if (depResult.errors.length > 0) {
      return {
        success: false,
        errors: depResult.errors.map((e) => e.message),
      };
    }

    // Create loaded extension object
    const extension: LoadedExtension = {
      id: manifest.id,
      manifest: resolveManifestPaths(manifest, dirPath),
      basePath: dirPath,
      source: 'directory',
      agents: [],
      skills: [],
      mcpTools: [],
      routes: [],
      hooks: new Map(),
      config: {},
      status: 'loading',
      loadedAt: new Date(),
    };

    try {
      // Load components
      await this.loadAgents(extension);
      await this.loadSkills(extension);
      await this.loadMCPTools(extension);
      await this.loadHooks(extension);

      extension.status = 'loaded';
      this.extensions.set(extension.id, extension);

      // Emit install hook
      await this.emitHook('extension:install', extension, {});

      extension.status = 'active';

      logger.info('Extension loaded successfully', {
        extensionId: extension.id,
        agents: extension.agents.length,
        skills: extension.skills.length,
        mcpTools: extension.mcpTools.length,
        routes: extension.manifest.components?.routes?.length || 0,
      });

      return {
        success: true,
        extension,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      extension.status = 'error';
      extension.error = (error as Error).message;

      logger.error(
        'Failed to load extension',
        { extensionId: manifest.id },
        error as Error
      );

      return {
        success: false,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Load extension from npm package
   */
  async loadFromPackage(packageName: string): Promise<LoadResult> {
    logger.info('Loading extension from package', { packageName });

    try {
      // Resolve package path
      const packagePath = require.resolve(packageName);
      const packageDir = path.dirname(packagePath);

      // Look for extension manifest in package
      const result = await this.loadFromDirectory(packageDir);

      if (result.success && result.extension) {
        result.extension.source = 'package';
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to resolve package: ${packageName} - ${(error as Error).message}`],
      };
    }
  }

  /**
   * Unload an extension
   */
  async unload(extensionId: string): Promise<UnloadResult> {
    const extension = this.extensions.get(extensionId);
    if (!extension) {
      return {
        success: false,
        errors: [`Extension not found: ${extensionId}`],
      };
    }

    logger.info('Unloading extension', { extensionId });

    try {
      extension.status = 'unloading';

      // Emit uninstall hook
      await this.emitHook('extension:uninstall', extension, {});

      // Unregister routes
      this.routeRegistrar.unregisterExtensionRoutes(extensionId);

      // Unregister hooks
      this.unregisterHooks(extension);

      // Remove from registry
      this.extensions.delete(extensionId);

      // Clear require cache for hot reload
      this.clearExtensionCache(extension);

      logger.info('Extension unloaded successfully', { extensionId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to unload extension', { extensionId }, error as Error);
      return {
        success: false,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Reload an extension (hot reload)
   */
  async reload(extensionId: string): Promise<LoadResult> {
    const extension = this.extensions.get(extensionId);
    if (!extension) {
      return {
        success: false,
        errors: [`Extension not found: ${extensionId}`],
      };
    }

    logger.info('Reloading extension', { extensionId });

    const basePath = extension.basePath;

    // Unload first
    const unloadResult = await this.unload(extensionId);
    if (!unloadResult.success) {
      return {
        success: false,
        errors: unloadResult.errors,
      };
    }

    // Load again
    return this.loadFromDirectory(basePath);
  }

  /**
   * Get all loaded extensions
   */
  getLoadedExtensions(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get a specific extension
   */
  getExtension(extensionId: string): LoadedExtension | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * Register routes from extension
   */
  registerRoutes(extension: LoadedExtension, app: Express): void {
    this.routeRegistrar.initialize(app);
    this.routeRegistrar.registerExtensionRoutes(extension);
  }

  /**
   * Register hooks from extension
   */
  registerHooks(extension: LoadedExtension, hookManager: HookManager): void {
    for (const [name, hook] of extension.hooks) {
      const eventName = this.mapHookNameToEvent(name);
      if (eventName) {
        hookManager.register(eventName, extension.id, hook.handler);
      }
    }
  }

  /**
   * Register MCP tools from extension
   */
  async registerMCPTools(extension: LoadedExtension): Promise<void> {
    for (const tool of extension.mcpTools) {
      logger.info('Registering MCP tool', {
        extensionId: extension.id,
        toolId: tool.id,
        toolName: tool.name,
      });

      // MCP tools are registered through the MCP registry service
      // The actual registration happens during runtime when MCP connections are established
    }
  }

  /**
   * Register skills from extension
   */
  async registerSkills(extension: LoadedExtension): Promise<void> {
    if (!this.extensionRegistry) {
      logger.warn('Extension registry not available, skipping skill registration');
      return;
    }

    for (const skill of extension.skills) {
      try {
        // Register skill with the extension registry
        await this.extensionRegistry.registerExtension(
          '', // Global org for now
          {
            slug: `${extension.id}-${skill.id}`,
            name: (skill.config as any).name || skill.id,
            description: (skill.config as any).description || '',
            version: extension.manifest.version,
            extensionType: 'skill',
            category: (skill.config as any).category || 'extension',
            tags: (skill.config as any).tags || [],
            runtimeType: extension.manifest.runtime,
            triggers: (skill.config as any).triggers || [],
            parameters: (skill.config as any).parameters || [],
            outputs: (skill.config as any).outputs || [],
            toolsRequired: (skill.config as any).tools_required || [],
            mcpProviders: (skill.config as any).mcp_providers || [],
            dependencies: extension.manifest.dependencies || [],
            isPublic: true,
            enabled: true,
          }
        );

        logger.info('Registered skill', {
          extensionId: extension.id,
          skillId: skill.id,
        });
      } catch (error) {
        logger.error(
          'Failed to register skill',
          { extensionId: extension.id, skillId: skill.id },
          error as Error
        );
      }
    }
  }

  /**
   * Register agents from extension
   */
  async registerAgents(extension: LoadedExtension): Promise<void> {
    for (const agent of extension.agents) {
      logger.info('Registering agent', {
        extensionId: extension.id,
        agentId: agent.id,
      });

      // Agent registration would integrate with the agent orchestration system
      // This is a placeholder for the actual implementation
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Load agents from manifest
   */
  private async loadAgents(extension: LoadedExtension): Promise<void> {
    const agents = extension.manifest.components?.agents || [];

    for (const agentDef of agents) {
      try {
        const configPath = agentDef.configPath;
        const config = await this.loadYamlConfig(configPath);

        extension.agents.push({
          id: agentDef.id,
          config,
          configPath,
        });

        logger.debug('Loaded agent config', {
          extensionId: extension.id,
          agentId: agentDef.id,
        });
      } catch (error) {
        logger.error(
          'Failed to load agent config',
          { extensionId: extension.id, agentId: agentDef.id },
          error as Error
        );
        throw error;
      }
    }
  }

  /**
   * Load skills from manifest
   */
  private async loadSkills(extension: LoadedExtension): Promise<void> {
    const skills = extension.manifest.components?.skills || [];

    for (const skillDef of skills) {
      try {
        const configPath = skillDef.configPath;
        const config = await this.loadYamlConfig(configPath);

        extension.skills.push({
          id: skillDef.id,
          config,
          configPath,
        });

        logger.debug('Loaded skill config', {
          extensionId: extension.id,
          skillId: skillDef.id,
        });
      } catch (error) {
        logger.error(
          'Failed to load skill config',
          { extensionId: extension.id, skillId: skillDef.id },
          error as Error
        );
        throw error;
      }
    }
  }

  /**
   * Load MCP tools from manifest
   */
  private async loadMCPTools(extension: LoadedExtension): Promise<void> {
    const tools = extension.manifest.components?.mcpTools || [];

    for (const toolDef of tools) {
      try {
        const handlerPath = toolDef.handler;
        const handler = await this.loadToolHandler(handlerPath);

        extension.mcpTools.push({
          id: toolDef.id,
          name: toolDef.name,
          description: toolDef.description,
          handler,
          schema: toolDef.schema,
        });

        logger.debug('Loaded MCP tool', {
          extensionId: extension.id,
          toolId: toolDef.id,
        });
      } catch (error) {
        logger.error(
          'Failed to load MCP tool',
          { extensionId: extension.id, toolId: toolDef.id },
          error as Error
        );
        throw error;
      }
    }
  }

  /**
   * Load hooks from manifest
   */
  private async loadHooks(extension: LoadedExtension): Promise<void> {
    const hooks = extension.manifest.hooks;
    if (!hooks) return;

    const hookNames: (keyof typeof hooks)[] = [
      'onInstall',
      'onUninstall',
      'onUpdate',
      'onEnable',
      'onDisable',
      'onConfigChange',
    ];

    for (const hookName of hookNames) {
      const hookPath = hooks[hookName];
      if (!hookPath) continue;

      try {
        const handler = await this.loadHookHandler(hookPath);

        extension.hooks.set(hookName, {
          name: hookName,
          handler: handler as (...args: unknown[]) => Promise<void>,
        });

        logger.debug('Loaded hook', {
          extensionId: extension.id,
          hookName,
        });
      } catch (error) {
        logger.error(
          'Failed to load hook',
          { extensionId: extension.id, hookName },
          error as Error
        );
        // Hooks are optional, don't throw
      }
    }
  }

  /**
   * Load YAML config file
   */
  private async loadYamlConfig(configPath: string): Promise<Record<string, unknown>> {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf8');
    return yaml.load(content) as Record<string, unknown>;
  }

  /**
   * Load tool handler function
   */
  private async loadToolHandler(
    handlerPath: string
  ): Promise<(args: Record<string, unknown>) => Promise<unknown>> {
    // Clear cache for hot reload
    delete require.cache[require.resolve(handlerPath)];

    let module: unknown;
    try {
      module = require(handlerPath);
    } catch {
      module = await import(handlerPath);
    }

    const mod = module as {
      default?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
      execute?: (args: Record<string, unknown>) => Promise<unknown>;
    };

    if (mod.default) return mod.default;
    if (mod.handler) return mod.handler;
    if (mod.execute) return mod.execute;
    if (typeof module === 'function') {
      return module as (args: Record<string, unknown>) => Promise<unknown>;
    }

    throw new Error(`No valid handler export found in ${handlerPath}`);
  }

  /**
   * Load hook handler function
   */
  private async loadHookHandler(
    hookPath: string
  ): Promise<(context: HookContext) => Promise<void>> {
    // Clear cache for hot reload
    delete require.cache[require.resolve(hookPath)];

    let module: unknown;
    try {
      module = require(hookPath);
    } catch {
      module = await import(hookPath);
    }

    const mod = module as {
      default?: (context: HookContext) => Promise<void>;
      handler?: (context: HookContext) => Promise<void>;
    };

    if (mod.default) return mod.default;
    if (mod.handler) return mod.handler;
    if (typeof module === 'function') {
      return module as (context: HookContext) => Promise<void>;
    }

    throw new Error(`No valid handler export found in ${hookPath}`);
  }

  /**
   * Resolve extension dependencies
   */
  private async resolveDependencies(
    manifest: ExtensionManifest
  ): Promise<{ graph: DependencyGraph; errors: DependencyError[] }> {
    const errors: DependencyError[] = [];
    const nodes = new Map<string, DependencyNode>();
    const order: string[] = [];

    nodes.set(manifest.id, {
      id: manifest.id,
      version: manifest.version,
      dependencies: manifest.dependencies || [],
      resolved: false,
    });

    // Check each dependency
    for (const dep of manifest.dependencies || []) {
      // Parse dependency string (e.g., "other-extension@^1.0.0")
      const [depId, depVersion] = dep.split('@');

      // Check if dependency is loaded
      const loadedDep = this.extensions.get(depId);
      if (!loadedDep) {
        errors.push({
          type: 'missing',
          extensionId: manifest.id,
          dependencyId: depId,
          message: `Missing dependency: ${depId}`,
        });
        continue;
      }

      // Check version compatibility
      if (depVersion) {
        const versionCheck = validateVersionCompatibility(
          depVersion,
          loadedDep.manifest.version
        );
        if (!versionCheck.compatible) {
          errors.push({
            type: 'version_mismatch',
            extensionId: manifest.id,
            dependencyId: depId,
            message: versionCheck.message!,
          });
        }
      }

      nodes.set(depId, {
        id: depId,
        version: loadedDep.manifest.version,
        dependencies: loadedDep.manifest.dependencies || [],
        resolved: true,
      });
    }

    // Detect circular dependencies
    const visited = new Set<string>();
    const stack = new Set<string>();

    const detectCycle = (nodeId: string): boolean => {
      if (stack.has(nodeId)) {
        errors.push({
          type: 'circular',
          extensionId: manifest.id,
          dependencyId: nodeId,
          message: `Circular dependency detected: ${nodeId}`,
        });
        return true;
      }

      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      stack.add(nodeId);

      const node = nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          const [depId] = dep.split('@');
          if (detectCycle(depId)) return true;
        }
      }

      stack.delete(nodeId);
      order.push(nodeId);
      return false;
    };

    detectCycle(manifest.id);

    return {
      graph: { nodes, order },
      errors,
    };
  }

  /**
   * Map hook name to event name
   */
  private mapHookNameToEvent(hookName: string): HookEventName | null {
    const mapping: Record<string, HookEventName> = {
      onInstall: 'extension:install',
      onUninstall: 'extension:uninstall',
      onUpdate: 'extension:update',
      onEnable: 'extension:enable',
      onDisable: 'extension:disable',
      onConfigChange: 'extension:configChange',
    };
    return mapping[hookName] || null;
  }

  /**
   * Emit a hook event
   */
  private async emitHook(
    event: HookEventName,
    extension: LoadedExtension,
    data: Record<string, unknown>
  ): Promise<void> {
    const context: HookContext = {
      extensionId: extension.id,
      timestamp: new Date(),
      data,
    };

    // First, call the extension's own hook
    const hookName = event.replace('extension:', 'on') as keyof LoadedExtension['hooks'];
    const hook = extension.hooks.get(hookName as string);
    if (hook) {
      try {
        await hook.handler(context);
      } catch (error) {
        logger.error(
          'Extension hook error',
          { extensionId: extension.id, event },
          error as Error
        );
      }
    }

    // Then emit to global hook manager
    await this.hookManager.emit(event, context);
  }

  /**
   * Unregister all hooks for an extension
   */
  private unregisterHooks(extension: LoadedExtension): void {
    for (const [name] of extension.hooks) {
      const eventName = this.mapHookNameToEvent(name);
      if (eventName) {
        this.hookManager.unregister(eventName, extension.id);
      }
    }
  }

  /**
   * Clear require cache for extension files
   */
  private clearExtensionCache(extension: LoadedExtension): void {
    const basePath = extension.basePath;

    // Clear all cached modules from extension directory
    Object.keys(require.cache).forEach((key) => {
      if (key.startsWith(basePath)) {
        delete require.cache[key];
      }
    });
  }

  /**
   * Load all extensions from extensions directory
   */
  async loadAllFromDirectory(dirPath?: string): Promise<LoadResult[]> {
    const extensionsDir = dirPath || this.options.extensionsDir!;
    const results: LoadResult[] = [];

    if (!fs.existsSync(extensionsDir)) {
      logger.warn('Extensions directory not found', { path: extensionsDir });
      return results;
    }

    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extPath = path.join(extensionsDir, entry.name);
        const result = await this.loadFromDirectory(extPath);
        results.push(result);
      }
    }

    logger.info('Loaded extensions from directory', {
      path: extensionsDir,
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    return results;
  }
}

// Singleton instance
let loaderInstance: ExtensionLoaderService | null = null;

export function getExtensionLoader(
  options?: ExtensionLoaderOptions,
  hookManager?: HookManager
): ExtensionLoaderService {
  if (!loaderInstance) {
    loaderInstance = new ExtensionLoaderService(options, hookManager);
  }
  return loaderInstance;
}

export function resetExtensionLoader(): void {
  loaderInstance = null;
}
