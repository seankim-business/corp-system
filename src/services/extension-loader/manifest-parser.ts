/**
 * Manifest Parser
 *
 * Parses and validates extension.yaml manifests
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  ExtensionManifest,
  ExtensionManifestSchema,
} from './types';
import { logger } from '../../utils/logger';

export interface ManifestParseResult {
  success: boolean;
  manifest?: ExtensionManifest;
  errors?: string[];
  warnings?: string[];
}

export interface ManifestValidationOptions {
  strict?: boolean;
  checkPaths?: boolean;
  basePath?: string;
}

/**
 * Parse an extension manifest from YAML content
 */
export function parseManifestContent(content: string): ManifestParseResult {
  const warnings: string[] = [];

  try {
    const parsed = yaml.load(content);

    if (!parsed || typeof parsed !== 'object') {
      return {
        success: false,
        errors: ['Invalid YAML: must be an object'],
      };
    }

    // Validate against schema
    const result = ExtensionManifestSchema.safeParse(parsed);

    if (!result.success) {
      const zodErrors = result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return {
        success: false,
        errors: zodErrors,
      };
    }

    return {
      success: true,
      manifest: result.data,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`YAML parse error: ${(error as Error).message}`],
    };
  }
}

/**
 * Parse an extension manifest from a file path
 */
export function parseManifestFile(filePath: string): ManifestParseResult {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        errors: [`Manifest file not found: ${filePath}`],
      };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return parseManifestContent(content);
  } catch (error) {
    return {
      success: false,
      errors: [`Failed to read manifest file: ${(error as Error).message}`],
    };
  }
}

/**
 * Find and parse manifest from a directory
 */
export function parseManifestFromDirectory(dirPath: string): ManifestParseResult {
  const manifestNames = ['extension.yaml', 'extension.yml', 'manifest.yaml', 'manifest.yml'];

  for (const name of manifestNames) {
    const manifestPath = path.join(dirPath, name);
    if (fs.existsSync(manifestPath)) {
      logger.debug('Found manifest file', { path: manifestPath });
      return parseManifestFile(manifestPath);
    }
  }

  return {
    success: false,
    errors: [`No manifest file found in directory: ${dirPath}`],
  };
}

/**
 * Validate manifest paths exist
 */
export function validateManifestPaths(
  manifest: ExtensionManifest,
  basePath: string
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const checkPath = (relativePath: string, context: string): boolean => {
    const fullPath = path.join(basePath, relativePath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${context}: File not found: ${relativePath}`);
      return false;
    }
    return true;
  };

  // Check agent configs
  if (manifest.components?.agents) {
    for (const agent of manifest.components.agents) {
      checkPath(agent.configPath, `Agent ${agent.id}`);
    }
  }

  // Check skill configs
  if (manifest.components?.skills) {
    for (const skill of manifest.components.skills) {
      checkPath(skill.configPath, `Skill ${skill.id}`);
    }
  }

  // Check MCP tool handlers
  if (manifest.components?.mcpTools) {
    for (const tool of manifest.components.mcpTools) {
      checkPath(tool.handler, `MCP Tool ${tool.id}`);
    }
  }

  // Check workflow configs
  if (manifest.components?.workflows) {
    for (const workflow of manifest.components.workflows) {
      checkPath(workflow.configPath, `Workflow ${workflow.id}`);
    }
  }

  // Check UI components
  if (manifest.components?.uiComponents) {
    for (const ui of manifest.components.uiComponents) {
      checkPath(ui.componentPath, `UI Component ${ui.id}`);
    }
  }

  // Check route handlers
  if (manifest.components?.routes) {
    for (const route of manifest.components.routes) {
      checkPath(route.handler, `Route ${route.path}`);
    }
  }

  // Check hooks
  if (manifest.hooks) {
    const hookNames: (keyof typeof manifest.hooks)[] = [
      'onInstall',
      'onUninstall',
      'onUpdate',
      'onEnable',
      'onDisable',
      'onConfigChange',
    ];

    for (const hookName of hookNames) {
      const hookPath = manifest.hooks[hookName];
      if (hookPath) {
        checkPath(hookPath, `Hook ${hookName}`);
      }
    }
  }

  // Check icon
  if (manifest.icon) {
    if (!checkPath(manifest.icon, 'Icon')) {
      warnings.push(`Icon file missing, will use default`);
      errors.pop(); // Remove the error, add as warning
    }
  }

  // Check i18n translations
  if (manifest.i18n?.translationsPath) {
    if (!checkPath(manifest.i18n.translationsPath, 'Translations')) {
      warnings.push(`Translations directory missing, i18n disabled`);
      errors.pop();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Resolve relative paths in manifest to absolute paths
 */
export function resolveManifestPaths(
  manifest: ExtensionManifest,
  basePath: string
): ExtensionManifest {
  const resolved = { ...manifest };

  if (resolved.components) {
    resolved.components = { ...resolved.components };

    if (resolved.components.agents) {
      resolved.components.agents = resolved.components.agents.map((agent) => ({
        ...agent,
        configPath: path.resolve(basePath, agent.configPath),
      }));
    }

    if (resolved.components.skills) {
      resolved.components.skills = resolved.components.skills.map((skill) => ({
        ...skill,
        configPath: path.resolve(basePath, skill.configPath),
      }));
    }

    if (resolved.components.mcpTools) {
      resolved.components.mcpTools = resolved.components.mcpTools.map((tool) => ({
        ...tool,
        handler: path.resolve(basePath, tool.handler),
      }));
    }

    if (resolved.components.workflows) {
      resolved.components.workflows = resolved.components.workflows.map((workflow) => ({
        ...workflow,
        configPath: path.resolve(basePath, workflow.configPath),
      }));
    }

    if (resolved.components.uiComponents) {
      resolved.components.uiComponents = resolved.components.uiComponents.map((ui) => ({
        ...ui,
        componentPath: path.resolve(basePath, ui.componentPath),
      }));
    }

    if (resolved.components.routes) {
      resolved.components.routes = resolved.components.routes.map((route) => ({
        ...route,
        handler: path.resolve(basePath, route.handler),
      }));
    }
  }

  if (resolved.hooks) {
    resolved.hooks = { ...resolved.hooks };
    const hookKeys: (keyof typeof resolved.hooks)[] = [
      'onInstall',
      'onUninstall',
      'onUpdate',
      'onEnable',
      'onDisable',
      'onConfigChange',
    ];

    for (const key of hookKeys) {
      if (resolved.hooks[key]) {
        resolved.hooks[key] = path.resolve(basePath, resolved.hooks[key]!);
      }
    }
  }

  if (resolved.icon) {
    resolved.icon = path.resolve(basePath, resolved.icon);
  }

  if (resolved.screenshots) {
    resolved.screenshots = resolved.screenshots.map((s) => path.resolve(basePath, s));
  }

  if (resolved.i18n?.translationsPath) {
    resolved.i18n = {
      ...resolved.i18n,
      translationsPath: path.resolve(basePath, resolved.i18n.translationsPath),
    };
  }

  return resolved;
}

/**
 * Extract component IDs from manifest
 */
export function extractComponentIds(manifest: ExtensionManifest): {
  agents: string[];
  skills: string[];
  mcpTools: string[];
  workflows: string[];
  uiComponents: string[];
  routes: string[];
} {
  return {
    agents: manifest.components?.agents?.map((a) => a.id) || [],
    skills: manifest.components?.skills?.map((s) => s.id) || [],
    mcpTools: manifest.components?.mcpTools?.map((t) => t.id) || [],
    workflows: manifest.components?.workflows?.map((w) => w.id) || [],
    uiComponents: manifest.components?.uiComponents?.map((u) => u.id) || [],
    routes: manifest.components?.routes?.map((r) => r.path) || [],
  };
}

/**
 * Validate version compatibility
 */
export function validateVersionCompatibility(
  manifestVersion: string | undefined,
  currentVersion: string
): { compatible: boolean; message?: string } {
  if (!manifestVersion) {
    return { compatible: true };
  }

  // Parse version requirement (e.g., ">=2.0.0", "^1.0.0", "~1.0.0")
  const versionMatch = manifestVersion.match(/^([<>=~^]*)(\d+)\.(\d+)\.(\d+)$/);
  if (!versionMatch) {
    return {
      compatible: false,
      message: `Invalid version format: ${manifestVersion}`,
    };
  }

  const [, operator, major, minor, patch] = versionMatch;
  const requiredVersion = [parseInt(major), parseInt(minor), parseInt(patch)];

  const currentMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!currentMatch) {
    return {
      compatible: false,
      message: `Invalid current version format: ${currentVersion}`,
    };
  }

  const current = [
    parseInt(currentMatch[1]),
    parseInt(currentMatch[2]),
    parseInt(currentMatch[3]),
  ];

  const compare = (a: number[], b: number[]): number => {
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  };

  let compatible = false;
  switch (operator) {
    case '>=':
      compatible = compare(current, requiredVersion) >= 0;
      break;
    case '>':
      compatible = compare(current, requiredVersion) > 0;
      break;
    case '<=':
      compatible = compare(current, requiredVersion) <= 0;
      break;
    case '<':
      compatible = compare(current, requiredVersion) < 0;
      break;
    case '=':
    case '':
      compatible = compare(current, requiredVersion) === 0;
      break;
    case '^':
      // Compatible with same major version
      compatible = current[0] === requiredVersion[0] && compare(current, requiredVersion) >= 0;
      break;
    case '~':
      // Compatible with same major.minor version
      compatible =
        current[0] === requiredVersion[0] &&
        current[1] === requiredVersion[1] &&
        compare(current, requiredVersion) >= 0;
      break;
    default:
      return {
        compatible: false,
        message: `Unknown version operator: ${operator}`,
      };
  }

  if (!compatible) {
    return {
      compatible: false,
      message: `Version ${currentVersion} does not satisfy requirement ${manifestVersion}`,
    };
  }

  return { compatible: true };
}

/**
 * Merge partial manifest updates
 */
export function mergeManifestUpdates(
  original: ExtensionManifest,
  updates: Partial<ExtensionManifest>
): ExtensionManifest {
  const merged = { ...original };

  // Simple fields
  if (updates.name !== undefined) merged.name = updates.name;
  if (updates.version !== undefined) merged.version = updates.version;
  if (updates.description !== undefined) merged.description = updates.description;
  if (updates.category !== undefined) merged.category = updates.category;
  if (updates.runtime !== undefined) merged.runtime = updates.runtime;

  // Arrays (replace entirely)
  if (updates.tags !== undefined) merged.tags = updates.tags;
  if (updates.permissions !== undefined) merged.permissions = updates.permissions;
  if (updates.dependencies !== undefined) merged.dependencies = updates.dependencies;
  if (updates.screenshots !== undefined) merged.screenshots = updates.screenshots;

  // Objects (deep merge)
  if (updates.author !== undefined) {
    merged.author = { ...original.author, ...updates.author };
  }

  if (updates.components !== undefined) {
    merged.components = {
      ...original.components,
      ...updates.components,
    };
  }

  if (updates.hooks !== undefined) {
    merged.hooks = { ...original.hooks, ...updates.hooks };
  }

  if (updates.configSchema !== undefined) {
    merged.configSchema = updates.configSchema;
  }

  if (updates.i18n !== undefined) {
    merged.i18n = { ...original.i18n, ...updates.i18n };
  }

  return merged;
}
