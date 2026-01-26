import { Job } from "bullmq";
import { WebClient } from "@slack/web-api";
import { BaseWorker } from "../queue/base.queue";
import { NotificationData } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";

export class NotificationWorker extends BaseWorker<NotificationData> {
  constructor() {
    super("notifications", {
      concurrency: 10,
    });
  }

  async process(job: Job<NotificationData>): Promise<void> {
    const { channel, threadTs, text, blocks, eventId, organizationId } = job.data;

    logger.info(`Sending notification for event ${eventId}`, {
      channel,
      organizationId,
      textPreview: text.substring(0, 50),
    });

    const integration = await getSlackIntegrationByOrg(organizationId);

    if (!integration) {
      throw new Error(`No Slack integration found for organization ${organizationId}`);
    }

    if (!integration.enabled) {
      throw new Error(`Slack integration is disabled for organization ${organizationId}`);
    }

    const slackClient = new WebClient(integration.botToken);

    try {
      await slackClient.chat.postMessage({
        channel,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
        blocks,
      });

      logger.info(`Notification sent for event ${eventId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send notification for event ${eventId}:`, { error: errorMessage });

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
