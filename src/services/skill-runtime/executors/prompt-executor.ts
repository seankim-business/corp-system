import { Extension } from '../../extension-registry';
import { SkillExecutor, SkillInput, SkillOutput, ExecutionContext } from '../types';
import { logger } from '../../../utils/logger';

export class PromptExecutor implements SkillExecutor {
  canExecute(skill: Extension): boolean {
    return skill.runtimeType === 'prompt';
  }

  async execute(
    skill: Extension,
    input: SkillInput,
    _context: ExecutionContext
  ): Promise<SkillOutput> {
    const startTime = Date.now();

    try {
      // Prompt-based skills return a structured prompt for AI execution
      // The actual AI call is handled by the orchestrator
      const runtimeConfig = skill.runtimeConfig as Record<string, unknown> | undefined;
      const promptTemplate = (runtimeConfig?.template as string) || skill.description;

      // Simple variable substitution
      let prompt = promptTemplate;
      for (const [key, value] of Object.entries(input.parameters)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      }

      return {
        success: true,
        result: {
          type: 'prompt',
          prompt,
          skillSlug: skill.slug,
        },
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    } catch (error) {
      logger.error('Prompt execution failed', { skill: skill.slug }, error as Error);
      return {
        success: false,
        error: {
          code: 'PROMPT_EXECUTION_FAILED',
          message: (error as Error).message,
        },
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  }
}
