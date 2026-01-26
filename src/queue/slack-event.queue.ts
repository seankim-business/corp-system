import { BaseQueue } from "./base.queue";

export interface SlackEventData {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  eventId: string;
}

export class SlackEventQueue extends BaseQueue<SlackEventData> {
  constructor() {
    super({
      name: "slack-events",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
      rateLimiter: {
        max: 100,
        duration: 60000,
      },
    });
  }

  async enqueueEvent(data: SlackEventData): Promise<void> {
    await this.add("process-slack-event", data, {
      jobId: data.eventId,
    });
  }
}

export const slackEventQueue = new SlackEventQueue();
