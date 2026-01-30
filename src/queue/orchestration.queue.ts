import { BaseQueue } from "./base.queue";

export interface OrchestrationData {
  userRequest: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  eventId: string;
  slackChannel: string;
  slackThreadTs: string;
  /** Thread context prompt for AI - includes conversation history */
  threadContext?: string;
}

export class OrchestrationQueue extends BaseQueue<OrchestrationData> {
  constructor() {
    super({
      name: "orchestration",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
      rateLimiter: {
        max: 20,
        duration: 60000,
      },
    });
  }

  async enqueueOrchestration(data: OrchestrationData): Promise<void> {
    await this.add("execute-orchestration", data, {
      jobId: `orch-${data.eventId}`,
    });
  }
}

export const orchestrationQueue = new OrchestrationQueue();
