import { Job } from "bullmq";
import { WebClient } from "@slack/web-api";
import { BaseWorker } from "../queue/base.queue";
import { NotificationData } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { runWithContext } from "../utils/async-context";

export class NotificationWorker extends BaseWorker<NotificationData> {
  constructor() {
    super("notifications", {
      concurrency: 10,
    });
  }

  async process(job: Job<NotificationData>): Promise<void> {
    const { organizationId, userId } = job.data;
    return runWithContext({ organizationId, userId }, () => this.processWithContext(job));
  }

  private async processWithContext(job: Job<NotificationData>): Promise<void> {
    const { channel, threadTs, text, blocks, eventId, organizationId } = job.data;

    await job.updateProgress(PROGRESS_PERCENTAGES.STARTED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.STARTED, PROGRESS_PERCENTAGES.STARTED, {
      eventId,
      channel,
    });

    logger.info(`Sending notification for event ${eventId}`, {
      channel,
      organizationId,
      textPreview: text.substring(0, 50),
    });

    await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.VALIDATED, PROGRESS_PERCENTAGES.VALIDATED, {
      eventId,
      action: "fetching_integration",
    });

    const integration = await getSlackIntegrationByOrg(organizationId);

    if (!integration) {
      throw new Error(`No Slack integration found for organization ${organizationId}`);
    }

    if (!integration.enabled) {
      throw new Error(`Slack integration is disabled for organization ${organizationId}`);
    }

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(
      job.id || "",
      PROGRESS_STAGES.PROCESSING,
      PROGRESS_PERCENTAGES.PROCESSING,
      {
        eventId,
        action: "creating_slack_client",
      },
    );

    const slackClient = new WebClient(integration.botToken);

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.FINALIZING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.FINALIZING,
        PROGRESS_PERCENTAGES.FINALIZING,
        {
          eventId,
          action: "posting_message",
        },
      );

      const result = await slackClient.chat.postMessage({
        channel,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
        blocks,
      });

      // Store bot message timestamp for feedback tracking
      if (result.ts && eventId) {
        const { redis } = await import("../db/redis");
        await redis.set(`slack:bot_message:${eventId}`, result.ts, 86400); // 24 hour expiry
        // Also store reverse mapping: message timestamp -> eventId
        await redis.set(`slack:bot_message_reverse:${channel}:${result.ts}`, eventId, 86400);
      }

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          eventId,
          status: "sent",
        },
      );

      logger.info(`Notification sent for event ${eventId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send notification for event ${eventId}:`, { error: errorMessage });

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        eventId,
        error: errorMessage,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "notifications",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: errorMessage,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const notificationWorker = new NotificationWorker();
