import { BaseQueue } from "./base.queue";

export interface WebhookEventData {
  provider: string;
  eventId: string;
  eventType?: string;
  timestamp: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  payload?: Record<string, any>;
}

export class WebhookQueue extends BaseQueue<WebhookEventData> {
  constructor() {
    super({
      name: "webhooks",
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      },
      rateLimiter: {
        max: 300,
        duration: 60_000,
      },
    });
  }

  async enqueueWebhook(data: WebhookEventData) {
    return this.add("webhook", data);
  }
}

export const webhookQueue = new WebhookQueue();
