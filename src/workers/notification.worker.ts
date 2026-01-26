import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { NotificationData } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";

interface SlackClient {
  chat: {
    postMessage(options: {
      channel: string;
      text: string;
      thread_ts?: string;
      blocks?: any[];
    }): Promise<any>;
  };
}

let slackClient: SlackClient | null = null;

export function setSlackClient(client: SlackClient): void {
  slackClient = client;
}

export class NotificationWorker extends BaseWorker<NotificationData> {
  constructor() {
    super("notifications", {
      concurrency: 10,
    });
  }

  async process(job: Job<NotificationData>): Promise<void> {
    const { channel, threadTs, text, blocks, eventId } = job.data;

    logger.info(`Sending notification for event ${eventId}`, {
      channel,
      textPreview: text.substring(0, 50),
    });

    if (!slackClient) {
      throw new Error("Slack client not initialized");
    }

    try {
      await slackClient.chat.postMessage({
        channel,
        text,
        thread_ts: threadTs,
        blocks,
      });

      logger.info(`Notification sent for event ${eventId}`);
    } catch (error: any) {
      logger.error(`Failed to send notification for event ${eventId}:`, error);

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "notifications",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: error.message,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const notificationWorker = new NotificationWorker();
