/**
 * Extension Loader Types
 *
 * Types for dynamic extension loading, manifest parsing, and runtime registration
 */
import { z } from 'zod';
import { Express, Router } from 'express';

// ============================================================================
// Manifest Schemas
// ============================================================================

export const AuthorSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const AgentComponentSchema = z.object({
  id: z.string(),
  configPath: z.string(),
});

export const SkillComponentSchema = z.object({
  id: z.string(),
  configPath: z.string(),
});

export const MCPToolSchemaPropertySchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

export const MCPToolComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  handler: z.string(),
  description: z.string(),
  schema: z.object({
    type: z.literal('object'),
    required: z.array(z.string()).optional(),
    properties: z.record(MCPToolSchemaPropertySchema).optional(),
  }).optional(),
});

export const WorkflowComponentSchema = z.object({
  id: z.string(),
  configPath: z.string(),
});

export const UIComponentSchema = z.object({
  id: z.string(),
  type: z.enum(['page', 'widget', 'modal', 'drawer']),
  path: z.string().optional(),
  componentPath: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
});

export const RouteComponentSchema = z.object({
  path: z.string(),
  handler: z.string(),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])).optional(),
});

export const ComponentsSchema = z.object({
  agents: z.array(AgentComponentSchema).optional().default([]),
  skills: z.array(SkillComponentSchema).optional().default([]),
  mcpTools: z.array(MCPToolComponentSchema).optional().default([]),
  workflows: z.array(WorkflowComponentSchema).optional().default([]),
  uiComponents: z.array(UIComponentSchema).optional().default([]),
  routes: z.array(RouteComponentSchema).optional().default([]),
});

export const HooksSchema = z.object({
  onInstall: z.string().optional(),
  onUninstall: z.string().optional(),
  onUpdate: z.string().optional(),
  onEnable: z.string().optional(),
  onDisable: z.string().optional(),
  onConfigChange: z.string().optional(),
});

export const ConfigSchemaPropertySchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  secret: z.boolean().optional(),
  default: z.unknown().optional(),
});

export const ConfigSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(ConfigSchemaPropertySchema).optional(),
  required: z.array(z.string()).optional(),
});

export const I18nSchema = z.object({
  defaultLocale: z.string().default('en'),
  supportedLocales: z.array(z.string()).optional().default(['en']),
  translationsPath: z.string().optional(),
});

export const ExtensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: AuthorSchema.optional(),
  category: z.string().optional().default('general'),
  tags: z.array(z.string()).optional().default([]),
  nubabelVersion: z.string().optional(),
  runtime: z.enum(['mcp', 'code', 'prompt', 'composite']).optional().default('mcp'),
  components: ComponentsSchema.optional().default({}),
  permissions: z.array(z.string()).optional().default([]),
  configSchema: ConfigSchemaSchema.optional(),
  hooks: HooksSchema.optional(),
  icon: z.string().optional(),
  screenshots: z.array(z.string()).optional().default([]),
  i18n: I18nSchema.optional(),
  dependencies: z.array(z.string()).optional().default([]),
});

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type AgentComponent = z.infer<typeof AgentComponentSchema>;
export type SkillComponent = z.infer<typeof SkillComponentSchema>;
export type MCPToolComponent = z.infer<typeof MCPToolComponentSchema>;
export type WorkflowComponent = z.infer<typeof WorkflowComponentSchema>;
export type UIComponent = z.infer<typeof UIComponentSchema>;
export type RouteComponent = z.infer<typeof RouteComponentSchema>;
export type Components = z.infer<typeof ComponentsSchema>;
export type Hooks = z.infer<typeof HooksSchema>;
export type ConfigSchema = z.infer<typeof ConfigSchemaSchema>;
export type I18n = z.infer<typeof I18nSchema>;

// ============================================================================
// Loaded Extension Types
// ============================================================================

export interface LoadedAgent {
  id: string;
  config: Record<string, unknown>;
  configPath: string;
}

export interface LoadedSkill {
  id: string;
  config: Record<string, unknown>;
  configPath: string;
}

export interface LoadedMCPTool {
  id: string;
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  schema?: MCPToolComponent['schema'];
}

export interface LoadedRoute {
  path: string;
  router: Router;
  methods: string[];
}

export interface LoadedHook {
  name: string;
  handler: (...args: unknown[]) => Promise<void>;
}

export interface LoadedExtension {
  id: string;
  manifest: ExtensionManifest;
  basePath: string;
  source: 'directory' | 'package';

  agents: LoadedAgent[];
  skills: LoadedSkill[];
  mcpTools: LoadedMCPTool[];
  routes: LoadedRoute[];
  hooks: Map<string, LoadedHook>;

  config: Record<string, unknown>;
  status: ExtensionStatus;
  loadedAt: Date;
  error?: string;
}

export type ExtensionStatus =
  | 'loading'
  | 'loaded'
  | 'active'
  | 'disabled'
  | 'error'
  | 'unloading';

// ============================================================================
// Hook Manager Types
// ============================================================================

export type HookEventName =
  | 'extension:install'
  | 'extension:uninstall'
  | 'extension:update'
  | 'extension:enable'
  | 'extension:disable'
  | 'extension:configChange'
  | 'agent:beforeExecute'
  | 'agent:afterExecute'
  | 'skill:beforeExecute'
  | 'skill:afterExecute'
  | 'mcp:toolCall'
  | 'mcp:toolResult';

export interface HookContext {
  extensionId: string;
  organizationId?: string;
  userId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export type HookHandler = (context: HookContext) => Promise<void>;

export interface HookManager {
  register(event: HookEventName, extensionId: string, handler: HookHandler): void;
  unregister(event: HookEventName, extensionId: string): void;
  emit(event: HookEventName, context: HookContext): Promise<void>;
  getHandlers(event: HookEventName): Map<string, HookHandler>;
}

// ============================================================================
// Extension Loader Interface
// ============================================================================

export interface ExtensionLoaderOptions {
  extensionsDir?: string;
  enableHotReload?: boolean;
  validateManifest?: boolean;
  loadTimeout?: number;
}

export interface LoadResult {
  success: boolean;
  extension?: LoadedExtension;
  errors?: string[];
  warnings?: string[];
}

export interface UnloadResult {
  success: boolean;
  errors?: string[];
}

export interface ExtensionLoader {
  loadFromDirectory(path: string): Promise<LoadResult>;
  loadFromPackage(packageName: string): Promise<LoadResult>;
  unload(extensionId: string): Promise<UnloadResult>;
  reload(extensionId: string): Promise<LoadResult>;
  getLoadedExtensions(): LoadedExtension[];
  getExtension(extensionId: string): LoadedExtension | undefined;

  // Runtime registration
  registerRoutes(extension: LoadedExtension, app: Express): void;
  registerHooks(extension: LoadedExtension, hookManager: HookManager): void;
  registerMCPTools(extension: LoadedExtension): Promise<void>;
  registerSkills(extension: LoadedExtension): Promise<void>;
  registerAgents(extension: LoadedExtension): Promise<void>;
}

// ============================================================================
// Dependency Resolution
// ============================================================================

export interface DependencyNode {
  id: string;
  version: string;
  dependencies: string[];
  resolved: boolean;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  order: string[];
}

export interface DependencyError {
  type: 'missing' | 'circular' | 'version_mismatch';
  extensionId: string;
  dependencyId: string;
  message: string;
}
