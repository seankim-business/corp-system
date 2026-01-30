import { SkillFormatParser, ParseResult } from './types';

/**
 * Parser for OpenAI Actions (OpenAPI 3.0 schema)
 */
export class OpenAIActionParser implements SkillFormatParser {
  readonly format = 'openai-action';

  canParse(content: string): boolean {
    try {
      const data = JSON.parse(content);
      return data.openapi && data.info && data.paths;
    } catch {
      return false;
    }
  }

  parse(content: string): ParseResult {
    try {
      const schema = JSON.parse(content);

      if (!schema.openapi || !schema.info) {
        return { success: false, errors: ['Invalid OpenAPI schema'] };
      }

      const info = schema.info;
      const paths = schema.paths || {};

      // Extract operations as triggers
      const triggers: string[] = [];
      const parameters: any[] = [];

      for (const [_path, methods] of Object.entries(paths)) {
        for (const [_method, operation] of Object.entries(methods as any)) {
          if (operation.operationId) {
            triggers.push(operation.operationId);
          }
          if (operation.summary) {
            triggers.push(...operation.summary.toLowerCase().split(/\s+/).slice(0, 3));
          }

          // Extract parameters
          if (operation.parameters) {
            for (const param of operation.parameters) {
              parameters.push({
                name: param.name,
                type: param.schema?.type || 'string',
                description: param.description || '',
                required: param.required || false,
              });
            }
          }
        }
      }

      const definition = {
        slug: this.slugify(info.title),
        name: info.title,
        description: info.description || '',
        version: info.version || '1.0.0',
        extensionType: 'skill' as const,
        category: 'api',
        tags: ['openai-action', 'api'],
        format: 'openai-action' as const,
        runtimeType: 'mcp' as const,
        runtimeConfig: {
          openapi: schema,
          servers: schema.servers || [],
        },
        triggers: [...new Set(triggers)],
        parameters,
      };

      return { success: true, definition };
    } catch (error) {
      return {
        success: false,
        errors: [`OpenAPI parse error: ${(error as Error).message}`]
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
