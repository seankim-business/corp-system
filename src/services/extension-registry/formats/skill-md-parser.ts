import { SkillFormatParser, ParseResult } from './types';
import * as yaml from 'js-yaml';

/**
 * Parser for Claude SKILL.md format
 * Format: YAML frontmatter + Markdown body
 */
export class SkillMdParser implements SkillFormatParser {
  readonly format = 'skill-md';

  canParse(content: string): boolean {
    return content.trim().startsWith('---');
  }

  parse(content: string): ParseResult {
    try {
      // Extract YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        return { success: false, errors: ['No YAML frontmatter found'] };
      }

      const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, any>;
      const body = content.slice(frontmatterMatch[0].length).trim();

      // Map SKILL.md format to ExtensionDefinition
      const definition = {
        slug: frontmatter.name || this.slugify(frontmatter.name),
        name: frontmatter.name,
        description: frontmatter.description || body.split('\n')[0] || '',
        version: frontmatter.version || '1.0.0',
        extensionType: 'skill' as const,
        category: frontmatter.category || 'general',
        tags: frontmatter.tags || [],
        format: 'skill-md' as const,
        runtimeType: 'prompt' as const,
        runtimeConfig: {
          template: body,
          model: frontmatter.model,
          agent: frontmatter.agent,
          allowedTools: frontmatter['allowed-tools']?.split(',').map((t: string) => t.trim()) || [],
        },
        triggers: this.extractTriggers(frontmatter, body),
        parameters: this.extractParameters(frontmatter),
      };

      return { success: true, definition };
    } catch (error) {
      return {
        success: false,
        errors: [`Parse error: ${(error as Error).message}`]
      };
    }
  }

  private slugify(name: string): string {
    return (name || 'unnamed')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private extractTriggers(frontmatter: Record<string, any>, body: string): string[] {
    const triggers: string[] = [];

    if (frontmatter.name) triggers.push(frontmatter.name);
    if (frontmatter['argument-hint']) {
      triggers.push(...frontmatter['argument-hint'].split(/\s+/).filter(Boolean));
    }

    // Extract keywords from description
    const description = frontmatter.description || body.split('\n')[0] || '';
    const words = description.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    triggers.push(...words.slice(0, 5));

    return [...new Set(triggers)];
  }

  private extractParameters(frontmatter: Record<string, any>): any[] {
    const params: any[] = [];

    if (frontmatter['argument-hint']) {
      const args = frontmatter['argument-hint'].match(/\[([^\]]+)\]/g) || [];
      args.forEach((arg: string, index: number) => {
        params.push({
          name: arg.replace(/[\[\]]/g, ''),
          type: 'string',
          description: `Argument ${index + 1}`,
          required: !arg.includes('?'),
        });
      });
    }

    return params;
  }
}
