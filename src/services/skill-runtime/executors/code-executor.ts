import { Worker } from 'worker_threads';
import { Extension } from '../../extension-registry';
import {
  SkillExecutor,
  SkillInput,
  SkillOutput,
  ExecutionContext,
  ExecutorConfig,
} from '../types';
import { logger } from '../../../utils/logger';

const DEFAULT_CONFIG: ExecutorConfig = {
  timeoutMs: 5000,
  memoryLimitMB: 64,
};

export class CodeExecutor implements SkillExecutor {
  private config: ExecutorConfig;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canExecute(skill: Extension): boolean {
    return skill.runtimeType === 'code';
  }

  async execute(
    skill: Extension,
    input: SkillInput,
    context: ExecutionContext
  ): Promise<SkillOutput> {
    const startTime = Date.now();

    try {
      const runtimeConfig = skill.runtimeConfig as Record<string, unknown> | undefined;
      const code = runtimeConfig?.code as string | undefined;

      if (!code) {
        return {
          success: false,
          error: {
            code: 'NO_CODE',
            message: 'Skill has no executable code',
          },
          metadata: { executionTimeMs: Date.now() - startTime },
        };
      }

      // Execute in worker thread with timeout
      const result = await this.executeInWorker(code, input, context);

      return {
        success: true,
        result,
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    } catch (error) {
      logger.error('Code execution failed', { skill: skill.slug }, error as Error);
      return {
        success: false,
        error: {
          code: 'CODE_EXECUTION_FAILED',
          message: (error as Error).message,
        },
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  }

  private executeInWorker(
    code: string,
    input: SkillInput,
    _context: ExecutionContext
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const workerCode = `
        const { parentPort, workerData } = require('worker_threads');

        try {
          const fn = new Function('input', 'context', workerData.code);
          const result = fn(workerData.input, workerData.context);

          Promise.resolve(result).then(r => {
            parentPort.postMessage({ success: true, result: r });
          }).catch(e => {
            parentPort.postMessage({ success: false, error: e.message });
          });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message });
        }
      `;

      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          code: `return (async () => { ${code} })()`,
          input: input.parameters,
          context: input.context,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: this.config.memoryLimitMB,
          maxYoungGenerationSizeMb: this.config.memoryLimitMB / 2,
        },
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Execution timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      worker.on('message', (msg: { success: boolean; result?: unknown; error?: string }) => {
        clearTimeout(timeout);
        if (msg.success) {
          resolve(msg.result);
        } else {
          reject(new Error(msg.error || 'Unknown error'));
        }
        worker.terminate();
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
        worker.terminate();
      });
    });
  }
}
