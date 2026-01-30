import { SkillFormatParser, ParseResult } from './types';
import * as yaml from 'js-yaml';

/**
 * Parser for native YAML skill definitions
 */
export class YamlSkillParser implements SkillFormatParser {
  readonly format = 'yaml';

  canParse(content: string): boolean {
    const trimmed = content.trim();
    // Check if it's YAML (not starting with ---, not JSON)
    return !trimmed.startsWith('---') && !trimmed.startsWith('{') &&
           (trimmed.includes(':') || trimmed.startsWith('id:') || trimmed.startsWith('name:'));
  }

  parse(content: string): ParseResult {
    try {
      const data = yaml.load(content) as Record<string, any>;

      if (!data || typeof data !== 'object') {
        return { success: false, errors: ['Invalid YAML structure'] };
      }

      const definition = {
        slug: data.id || data.slug || this.slugify(data.name),
        name: data.name,
        description: data.description || '',
        version: data.version || '1.0.0',
        extensionType: 'skill' as const,
        category: data.category || 'general',
        tags: data.tags || [],
        format: 'native' as const,
        runtimeType: (data.runtime_type || data.runtimeType || 'prompt') as 'mcp' | 'code' | 'prompt' | 'composite',
        runtimeConfig: data.runtime_config || data.runtimeConfig || {},
        triggers: data.triggers || [],
        parameters: data.parameters || [],
        outputs: data.outputs || [],
        toolsRequired: data.tools_required || data.toolsRequired || [],
        mcpProviders: data.mcp_providers || data.mcpProviders || [],
        dependencies: data.dependencies || [],
      };

      return { success: true, definition };
    } catch (error) {
      return {
        success: false,
        errors: [`YAML parse error: ${(error as Error).message}`]
      };
    }
  }

  private slugify(name: string): string {
    return (name || 'unnamed')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
