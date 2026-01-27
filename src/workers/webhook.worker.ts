import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { WebhookEventData } from "../queue/webhook.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { routeWebhook } from "./webhook-handlers";
import { logger } from "../utils/logger";

export class WebhookWorker extends BaseWorker<WebhookEventData> {
  constructor() {
    super("webhooks", { concurrency: 10 });
  }

  async process(job: Job<WebhookEventData>): Promise<void> {
    const { provider, eventId, eventType } = job.data;
    await job.updateProgress(20);
    logger.info("Processing webhook", { provider, eventId, eventType, jobId: job.id });

    try {
      await job.updateProgress(50);
      await routeWebhook(job.data);
      await job.updateProgress(100);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Webhook processing failed", { provider, eventId, message });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "webhooks",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: message,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const webhookWorker = new WebhookWorker();
