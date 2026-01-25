import { Queue, Job } from "bullmq";
import { createQueue } from "./base.queue";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  organizationId: string;
  failedReason: string;
  attemptsMade: number;
  originalData: any;
  failedAt: number;
  metadata?: Record<string, any>;
}

export const deadLetterQueue: Queue<DeadLetterJobData> = createQueue(
  "dead-letter",
  {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  },
);

export async function moveToDLQ(
  job: Job,
  queue: string,
  reason: string,
): Promise<void> {
  const dlqJob = await deadLetterQueue.add("failed-job", {
    originalQueue: queue,
    originalJobId: job.id!,
    organizationId: job.data.organizationId,
    failedReason: reason,
    attemptsMade: job.attemptsMade,
    originalData: job.data,
    failedAt: Date.now(),
    metadata: {
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      stacktrace: job.stacktrace,
    },
  });

  logger.error("Job moved to DLQ", {
    originalQueue: queue,
    originalJobId: job.id,
    dlqJobId: dlqJob.id,
    reason,
    organizationId: job.data.organizationId,
  });

  metrics.increment("queue.dlq.moved", {
    queue,
    organizationId: job.data.organizationId,
  });
}

export async function getFailedJobsByOrganization(organizationId: string) {
  const jobs = await deadLetterQueue.getJobs([
    "waiting",
    "active",
    "completed",
  ]);
  return jobs.filter((job) => job.data.organizationId === organizationId);
}

export async function retryFromDLQ(dlqJobId: string): Promise<boolean> {
  const job = await deadLetterQueue.getJob(dlqJobId);
  if (!job) return false;

  logger.info("Retrying job from DLQ", {
    dlqJobId,
    originalQueue: job.data.originalQueue,
    originalJobId: job.data.originalJobId,
  });

  await job.remove();
  return true;
}

export async function getDLQMetrics(organizationId?: string) {
  const jobs = await deadLetterQueue.getJobs([
    "waiting",
    "active",
    "completed",
  ]);
  const filtered = organizationId
    ? jobs.filter((j) => j.data.organizationId === organizationId)
    : jobs;

  const byQueue = filtered.reduce(
    (acc, job) => {
      const queue = job.data.originalQueue;
      acc[queue] = (acc[queue] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    total: filtered.length,
    byQueue,
    oldestFailure: filtered.reduce(
      (oldest, job) =>
        job.data.failedAt < oldest ? job.data.failedAt : oldest,
      Date.now(),
    ),
  };
}
