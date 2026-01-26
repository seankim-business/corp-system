import { BaseQueue } from "./base.queue";

export interface NotificationData {
  channel: string;
  threadTs?: string;
  text: string;
  blocks?: any[];
  organizationId: string;
  userId: string;
  eventId: string;
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
    await this.add("send-notification", data, {
      jobId: `notif-${data.eventId}-${Date.now()}`,
    });
  }
}

export const notificationQueue = new NotificationQueue();
