import { BaseQueue } from "./base.queue";

export interface N8nGenerationJobData {
  type: "ai-generate" | "sop-convert" | "pattern-pipeline";
  organizationId: string;
  userId: string;
  prompt?: string;
  sopId?: string;
  direction?: "sop-to-n8n" | "n8n-to-sop";
  workflowId?: string;
  patternId?: string;
}

export interface N8nGenerationJobResult {
  success: boolean;
  workflowId?: string;
  workflowJson?: Record<string, unknown>;
  sopSteps?: unknown[];
  error?: string;
}

class N8nGenerationQueueClass extends BaseQueue<N8nGenerationJobData> {
  constructor() {
    super({
      name: "n8n-generation",
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
      rateLimiter: {
        max: 10,
        duration: 60000,
      },
    });
  }

  async enqueueAIGeneration(
    organizationId: string,
    userId: string,
    prompt: string,
  ): Promise<string> {
    const job = await this.add("ai-generate", {
      type: "ai-generate",
      organizationId,
      userId,
      prompt,
    });
    return job.id!;
  }

  async enqueueSopConversion(
    organizationId: string,
    userId: string,
    direction: "sop-to-n8n" | "n8n-to-sop",
    options: { sopId?: string; workflowId?: string },
  ): Promise<string> {
    const job = await this.add("sop-convert", {
      type: "sop-convert",
      organizationId,
      userId,
      direction,
      ...options,
    });
    return job.id!;
  }

  async enqueuePatternPipeline(
    organizationId: string,
    userId: string,
    patternId: string,
  ): Promise<string> {
    const job = await this.add("pattern-pipeline", {
      type: "pattern-pipeline",
      organizationId,
      userId,
      patternId,
    });
    return job.id!;
  }
}

export const n8nGenerationQueue = new N8nGenerationQueueClass();
