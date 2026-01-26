import { BaseQueue } from "./base.queue";

export interface DeadLetterData {
  originalQueue: string;
  originalJobId: string;
  jobName: string;
  jobData: any;
  failedReason: string;
  attempts: number;
  timestamp: number;
}

export class DeadLetterQueue extends BaseQueue<DeadLetterData> {
  constructor() {
    super({
      name: "dead-letter",
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
        attempts: 1,
      },
    });
  }

  async enqueueFailedJob(data: DeadLetterData): Promise<void> {
    await this.add("store-failed-job", data, {
      jobId: `dlq-${data.originalQueue}-${data.originalJobId}`,
    });
  }
}

export const deadLetterQueue = new DeadLetterQueue();
