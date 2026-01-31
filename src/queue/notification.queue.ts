import { BaseQueue } from "./base.queue";
import { logger } from "../utils/logger";

export interface NotificationData {
  channel: string;
  threadTs?: string;
  text: string;
  blocks?: any[];
  organizationId: string;
  userId: string;
  eventId: string;
  agentType?: string; // Optional agent type for dynamic identity (e.g., "notion", "analyzing", "executing")
}

export class NotificationQueue extends BaseQueue<NotificationData> {
  constructor() {
    super({
      name: "notifications",
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
      rateLimiter: {
        max: 200,
        duration: 60000,
      },
    });
  }

  async enqueueNotification(data: NotificationData): Promise<void> {
    const jobId = `notif-${data.eventId}-${Date.now()}`;
    logger.info(`NotificationQueue.enqueueNotification called`, {
      eventId: data.eventId,
      channel: data.channel,
      textLength: data.text?.length || 0,
      jobId,
    });
    await this.add("send-notification", data, {
      jobId,
    });
    logger.info(`NotificationQueue.add completed`, { jobId, eventId: data.eventId });
  }
}

export const notificationQueue = new NotificationQueue();
