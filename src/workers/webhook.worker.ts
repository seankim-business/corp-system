import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { WebhookEventData } from "../queue/webhook.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { routeWebhook } from "./webhook-handlers";
import { logger } from "../utils/logger";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";

export class WebhookWorker extends BaseWorker<WebhookEventData> {
  constructor() {
    super("webhooks", { concurrency: 10 });
  }

  async process(job: Job<WebhookEventData>): Promise<void> {
    const { provider, eventId, eventType } = job.data;

    await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.VALIDATED, PROGRESS_PERCENTAGES.VALIDATED, {
      provider,
      eventId,
      eventType,
    });

    logger.info("Processing webhook", { provider, eventId, eventType, jobId: job.id });

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.PROCESSING,
        PROGRESS_PERCENTAGES.PROCESSING,
        {
          provider,
          eventId,
          action: "routing_webhook",
        },
      );

      await routeWebhook(job.data);

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          provider,
          eventId,
          status: "processed",
        },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Webhook processing failed", { provider, eventId, message });

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        provider,
        eventId,
        error: message,
      });

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
