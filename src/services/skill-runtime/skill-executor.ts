import { Extension } from '../extension-registry';
import {
  SkillExecutor,
  SkillInput,
  SkillOutput,
  ExecutionContext,
  ExecutorConfig,
} from './types';
import { MCPExecutor } from './executors/mcp-executor';
import { PromptExecutor } from './executors/prompt-executor';
import { CodeExecutor } from './executors/code-executor';
import { logger } from '../../utils/logger';

export class SkillExecutorService {
  private executors: SkillExecutor[];

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.executors = [
      new MCPExecutor(),
      new PromptExecutor(),
      new CodeExecutor(config),
    ];
  }

  async execute(
    skill: Extension,
    input: SkillInput,
    context: ExecutionContext
  ): Promise<SkillOutput> {
    const executor = this.executors.find((e) => e.canExecute(skill));

    if (!executor) {
      logger.warn('No executor found for skill', {
        skillSlug: skill.slug,
        runtimeType: skill.runtimeType,
      });

      return {
        success: false,
        error: {
          code: 'NO_EXECUTOR',
          message: `No executor available for runtime type: ${skill.runtimeType}`,
        },
        metadata: { executionTimeMs: 0 },
      };
    }

    logger.info('Executing skill', {
      skillSlug: skill.slug,
      runtimeType: skill.runtimeType,
      executor: executor.constructor.name,
    });

    return executor.execute(skill, input, context);
  }

  canExecute(skill: Extension): boolean {
    return this.executors.some((e) => e.canExecute(skill));
  }
}
