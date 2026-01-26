import { Job } from "bullmq";
import { deadLetterQueue, DeadLetterData } from "../queue/dead-letter.queue";
import { webhookQueue } from "../queue/webhook.queue";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { notificationQueue } from "../queue/notification.queue";
import { slackEventQueue } from "../queue/slack-event.queue";
import { logger } from "../utils/logger";

type QueueRegistry = Record<string, { add: (name: string, data: any, opts?: any) => Promise<Job> }>;

const queueRegistry: QueueRegistry = {
  webhooks: webhookQueue,
  orchestration: orchestrationQueue,
  notifications: notificationQueue,
  "slack-events": slackEventQueue,
};

export interface FailedJobInfo {
  id: string;
  originalQueue: string;
  originalJobId: string;
  jobName: string;
  failedReason: string;
  attempts: number;
  timestamp: number;
  data: any;
}

export async function getFailedJobs(limit = 100): Promise<FailedJobInfo[]> {
  const queue = deadLetterQueue.getQueue();
  const jobs = await queue.getJobs(["waiting", "delayed", "completed"], 0, limit);

  return jobs.map((job) => ({
    id: job.id || "",
    originalQueue: job.data.originalQueue,
    originalJobId: job.data.originalJobId,
    jobName: job.data.jobName,
    failedReason: job.data.failedReason,
    attempts: job.data.attempts,
    timestamp: job.data.timestamp,
    data: job.data.jobData,
  }));
}

export async function getFailedJobsByQueue(
  queueName: string,
  limit = 100,
): Promise<FailedJobInfo[]> {
  const allJobs = await getFailedJobs(limit * 2);
  return allJobs.filter((job) => job.originalQueue === queueName).slice(0, limit);
}

export async function retryFailedJob(
  dlqJobId: string,
): Promise<{ success: boolean; newJobId?: string; error?: string }> {
  try {
    const queue = deadLetterQueue.getQueue();
    const job = await queue.getJob(dlqJobId);

    if (!job) {
      return { success: false, error: "Job not found in dead letter queue" };
    }

    const data: DeadLetterData = job.data;
    const targetQueue = queueRegistry[data.originalQueue];

    if (!targetQueue) {
      return { success: false, error: `Unknown queue: ${data.originalQueue}` };
    }

    const newJob = await targetQueue.add(data.jobName, data.jobData, {
      jobId: `retry-${data.originalJobId}-${Date.now()}`,
    });

    await job.remove();

    logger.info("Retried failed job", {
      dlqJobId,
      originalQueue: data.originalQueue,
      newJobId: newJob.id,
    });

    return { success: true, newJobId: newJob.id || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to retry job", { dlqJobId, error: message });
    return { success: false, error: message };
  }
}

export async function retryAllFailedJobs(queueName?: string): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const jobs = queueName ? await getFailedJobsByQueue(queueName) : await getFailedJobs(1000);

  const result = {
    total: jobs.length,
    succeeded: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const job of jobs) {
    const retryResult = await retryFailedJob(job.id);
    if (retryResult.success) {
      result.succeeded++;
    } else {
      result.failed++;
      result.errors.push(`${job.id}: ${retryResult.error}`);
    }
  }

  logger.info("Bulk retry completed", result);
  return result;
}

export async function deleteFailedJob(dlqJobId: string): Promise<boolean> {
  try {
    const queue = deadLetterQueue.getQueue();
    const job = await queue.getJob(dlqJobId);

    if (!job) {
      return false;
    }

    await job.remove();
    logger.info("Deleted failed job", { dlqJobId });
    return true;
  } catch (error) {
    logger.error("Failed to delete job", { dlqJobId, error });
    return false;
  }
}

export async function purgeFailedJobs(queueName?: string): Promise<number> {
  const jobs = queueName
    ? await getFailedJobsByQueue(queueName, 10000)
    : await getFailedJobs(10000);

  let deleted = 0;
  for (const job of jobs) {
    if (await deleteFailedJob(job.id)) {
      deleted++;
    }
  }

  logger.info("Purged failed jobs", { queueName: queueName || "all", deleted });
  return deleted;
}

export async function getDeadLetterStats(): Promise<{
  total: number;
  byQueue: Record<string, number>;
  byReason: Record<string, number>;
  oldest?: number;
  newest?: number;
}> {
  const jobs = await getFailedJobs(10000);

  const stats = {
    total: jobs.length,
    byQueue: {} as Record<string, number>,
    byReason: {} as Record<string, number>,
    oldest: undefined as number | undefined,
    newest: undefined as number | undefined,
  };

  for (const job of jobs) {
    stats.byQueue[job.originalQueue] = (stats.byQueue[job.originalQueue] || 0) + 1;

    const reasonKey = job.failedReason.substring(0, 50);
    stats.byReason[reasonKey] = (stats.byReason[reasonKey] || 0) + 1;

    if (!stats.oldest || job.timestamp < stats.oldest) {
      stats.oldest = job.timestamp;
    }
    if (!stats.newest || job.timestamp > stats.newest) {
      stats.newest = job.timestamp;
    }
  }

  return stats;
}
