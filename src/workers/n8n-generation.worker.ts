import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { N8nGenerationJobData, N8nGenerationJobResult } from "../queue/n8n-generation.queue";
import { logger } from "../utils/logger";

export class N8nGenerationWorker extends BaseWorker {
  constructor() {
    super("n8n-generation", {
      concurrency: 2,
      lockDuration: 180000,
    });
  }

  async process(job: Job<N8nGenerationJobData>): Promise<N8nGenerationJobResult> {
    const { type, organizationId, userId } = job.data;

    logger.info("Processing n8n generation job", { jobId: job.id, type, organizationId, userId });

    try {
      switch (type) {
        case "ai-generate":
          return await this.generateFromAI(job);
        case "sop-convert":
          return await this.convertSop(job);
        case "pattern-pipeline":
          return await this.runPatternPipeline(job);
        default:
          throw new Error(`Unknown generation type: ${type}`);
      }
    } catch (error) {
      logger.error("n8n generation job failed", { jobId: job.id, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async generateFromAI(job: Job<N8nGenerationJobData>): Promise<N8nGenerationJobResult> {
    const { prompt } = job.data;

    logger.info("Generating workflow from AI", { prompt: prompt?.substring(0, 100) });

    return {
      success: true,
      workflowJson: {
        name: "Generated Workflow",
        nodes: [],
        connections: {},
      },
    };
  }

  private async convertSop(job: Job<N8nGenerationJobData>): Promise<N8nGenerationJobResult> {
    const { direction, sopId, workflowId } = job.data;

    logger.info("Converting SOP", { direction, sopId, workflowId });

    return { success: true };
  }

  private async runPatternPipeline(
    job: Job<N8nGenerationJobData>,
  ): Promise<N8nGenerationJobResult> {
    const { patternId } = job.data;

    logger.info("Running pattern pipeline", { patternId });

    return { success: true };
  }
}

export const n8nGenerationWorker = new N8nGenerationWorker();
