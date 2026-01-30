import { PrismaClient } from '@prisma/client';
import { ExtensionRegistry } from '../extension-registry';
import { GeneratedSkillSuggestion } from './types';
import { logger } from '../../utils/logger';

export class SkillGenerator {
  private prisma: PrismaClient;
  private registry: ExtensionRegistry;

  constructor(prisma: PrismaClient, registry: ExtensionRegistry) {
    this.prisma = prisma;
    this.registry = registry;
  }

  /**
   * Generate a skill from a validated pattern
   */
  async generateSkill(
    organizationId: string,
    suggestion: GeneratedSkillSuggestion,
    customizations?: {
      name?: string;
      description?: string;
      triggers?: string[];
    }
  ): Promise<any> {
    const pattern = suggestion.pattern;

    // Build skill definition from pattern
    const definition = {
      slug: customizations?.name || suggestion.suggestedName,
      name: customizations?.name || suggestion.suggestedName,
      description: customizations?.description || suggestion.suggestedDescription,
      version: '1.0.0',
      extensionType: 'skill' as const,
      category: 'generated',
      tags: ['auto-generated', ...pattern.contextTags],
      source: 'generated' as const,
      format: 'native' as const,
      runtimeType: 'composite' as const,
      runtimeConfig: {
        steps: pattern.steps.map((step, index) => ({
          order: index + 1,
          type: step.skillId ? 'skill' : 'tool',
          target: step.skillId || step.toolName,
          provider: step.provider,
          inputMapping: Object.keys(step.input),
        })),
        patternId: pattern.id,
      },
      triggers: customizations?.triggers || suggestion.suggestedTriggers,
      parameters: this.extractParameters(pattern),
      outputs: [],
      dependencies: [],
      toolsRequired: this.extractTools(pattern),
      mcpProviders: this.extractProviders(pattern),
      isPublic: false,
      enabled: true,
    };

    try {
      // Register the generated skill
      const skill = await this.registry.registerExtension(
        organizationId,
        definition,
        'system'
      );

      // Mark pattern as converted
      await this.prisma.skillLearningPattern.update({
        where: { id: pattern.id },
        data: {
          status: 'converted',
        },
      });

      logger.info('Skill generated from pattern', {
        skillId: skill.id,
        patternId: pattern.id,
        organizationId,
      });

      return skill;
    } catch (error) {
      logger.error('Failed to generate skill', { pattern: pattern.id }, error as Error);
      throw error;
    }
  }

  private extractParameters(pattern: any): any[] {
    const params = new Map<string, any>();

    for (const step of pattern.steps) {
      for (const [key, value] of Object.entries(step.input)) {
        if (!params.has(key)) {
          params.set(key, {
            name: key,
            type: typeof value,
            description: `Parameter from step ${step.skillId || step.toolName}`,
            required: true,
          });
        }
      }
    }

    return Array.from(params.values());
  }

  private extractTools(pattern: any): string[] {
    return pattern.steps
      .filter((s: any) => s.toolName)
      .map((s: any) => s.toolName);
  }

  private extractProviders(pattern: any): string[] {
    return [...new Set<string>(
      pattern.steps
        .filter((s: any) => s.provider)
        .map((s: any) => s.provider as string)
    )];
  }
}
