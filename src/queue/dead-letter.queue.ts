import { BaseQueue } from "./base.queue";
import { logger } from "../utils/logger";

export interface DeadLetterData {
  originalQueue: string;
  originalJobId: string;
  jobName: string;
  jobData: any;
  failedReason: string;
  attempts: number;
  timestamp: number;
}

const DLQ_RETENTION_MS = parseInt(
  process.env.DLQ_RETENTION_MS || String(7 * 24 * 60 * 60 * 1000),
  10,
);

export class DeadLetterQueue extends BaseQueue<DeadLetterData> {
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    super({
      name: "dead-letter",
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000,
        attempts: 1,
      },
    });
  }

  async enqueueFailedJob(data: DeadLetterData): Promise<void> {
    await this.add("store-failed-job", data, {
      jobId: `dlq-${data.originalQueue}-${data.originalJobId}`,
    });
  }

  async cleanupOldJobs(): Promise<{ completed: number; failed: number }> {
    const queue = this.getQueue();
    const gracePeriodMs = DLQ_RETENTION_MS;

    const [completedRemoved, failedRemoved] = await Promise.all([
      queue.clean(gracePeriodMs, 1000, "completed"),
      queue.clean(gracePeriodMs, 1000, "failed"),
    ]);

    logger.info("DLQ cleanup completed", {
      completedRemoved: completedRemoved.length,
      failedRemoved: failedRemoved.length,
      retentionDays: Math.round(gracePeriodMs / (24 * 60 * 60 * 1000)),
    });

    return {
      completed: completedRemoved.length,
      failed: failedRemoved.length,
    };
  }

  startPeriodicCleanup(intervalMs: number = 6 * 60 * 60 * 1000): void {
    if (this.cleanupIntervalId) {
      return;
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldJobs().catch((err) => {
        logger.error("DLQ periodic cleanup failed", err);
      });
    }, intervalMs);

    logger.info("DLQ periodic cleanup started", {
      intervalHours: intervalMs / (60 * 60 * 1000),
    });
  }

  stopPeriodicCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      logger.info("DLQ periodic cleanup stopped");
    }
  }

  async close(): Promise<void> {
    this.stopPeriodicCleanup();
    await super.close();
  }
}

export const deadLetterQueue = new DeadLetterQueue();
