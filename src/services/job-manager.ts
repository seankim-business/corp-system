import { Queue, Job } from "bullmq";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

export interface JobOptions {
  priority?: number; // 1 (highest) to 10 (lowest), default 5
  deduplicationKey?: string; // Prevent duplicate jobs
  timeout?: number; // Max execution time in ms
  delay?: number; // Delay before processing in ms
  maxRetries?: number; // Override default retry count
}

export interface JobProgress {
  jobId: string;
  progress: number; // 0-100
  message?: string;
  updatedAt: Date;
}

export interface JobResult {
  jobId: string;
  status: "completed" | "failed" | "active" | "waiting" | "delayed" | "unknown";
  result?: unknown;
  error?: string;
  progress: number;
  attempts: number;
  createdAt?: Date;
  completedAt?: Date;
}

const DEDUP_TTL_SECONDS = 3600; // 1 hour
const PROGRESS_TTL_SECONDS = 7200; // 2 hours

function dedupKey(key: string): string {
  return `job:dedup:${key}`;
}

function progressKey(jobId: string): string {
  return `job:progress:${jobId}`;
}

/**
 * Add a job to a queue with extended options including deduplication,
 * priority mapping, timeout, delay, and retry overrides.
 */
export async function addJobWithOptions(
  queue: Queue,
  name: string,
  data: unknown,
  options?: JobOptions,
): Promise<Job> {
  const opts = options ?? {};

  // Deduplication check
  if (opts.deduplicationKey) {
    const existing = await redis.get(dedupKey(opts.deduplicationKey));
    if (existing) {
      logger.info("Duplicate job detected, returning existing job", {
        deduplicationKey: opts.deduplicationKey,
        existingJobId: existing,
        queue: queue.name,
      });

      const existingJob = await queue.getJob(existing);
      if (existingJob) {
        return existingJob;
      }

      // Existing job reference is stale; clear the dedup key and proceed
      logger.warn("Dedup key pointed to missing job, creating new job", {
        deduplicationKey: opts.deduplicationKey,
        staleJobId: existing,
        queue: queue.name,
      });
      await redis.del(dedupKey(opts.deduplicationKey));
    }
  }

  // Map priority 1-10 to BullMQ priority (BullMQ uses lower = higher priority)
  const priority = opts.priority != null ? Math.max(1, Math.min(10, opts.priority)) : 5;

  const jobOpts: Record<string, unknown> = {
    priority,
  };

  if (opts.timeout != null && opts.timeout > 0) {
    jobOpts.timeout = opts.timeout;
  }

  if (opts.delay != null && opts.delay > 0) {
    jobOpts.delay = opts.delay;
  }

  if (opts.maxRetries != null && opts.maxRetries >= 0) {
    jobOpts.attempts = opts.maxRetries + 1; // BullMQ counts initial attempt
    jobOpts.backoff = {
      type: "exponential",
      delay: 1000,
    };
  }

  const job = await queue.add(name, data, jobOpts);

  logger.info("Job added to queue", {
    jobId: job.id,
    jobName: name,
    queue: queue.name,
    priority,
    delay: opts.delay,
    timeout: opts.timeout,
    deduplicationKey: opts.deduplicationKey,
  });

  // Store dedup key with 1h TTL
  if (opts.deduplicationKey && job.id) {
    await redis.set(dedupKey(opts.deduplicationKey), String(job.id), DEDUP_TTL_SECONDS);
  }

  return job;
}

/**
 * Retrieve the current status and metadata for a job.
 */
export async function getJobStatus(queue: Queue, jobId: string): Promise<JobResult> {
  const job = await queue.getJob(jobId);

  if (!job) {
    return {
      jobId,
      status: "unknown",
      progress: 0,
      attempts: 0,
    };
  }

  const state = await job.getState();

  const status: JobResult["status"] =
    state === "completed" || state === "failed" || state === "active" || state === "waiting" || state === "delayed"
      ? state
      : "unknown";

  const progress = typeof job.progress === "number" ? job.progress : 0;

  return {
    jobId: String(job.id),
    status,
    result: job.returnvalue ?? undefined,
    error: job.failedReason ?? undefined,
    progress,
    attempts: job.attemptsMade,
    createdAt: job.timestamp ? new Date(job.timestamp) : undefined,
    completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
  };
}

/**
 * Cancel a job if it is in a waiting or delayed state.
 * Returns true if the job was successfully removed.
 */
export async function cancelJob(queue: Queue, jobId: string): Promise<boolean> {
  const job = await queue.getJob(jobId);

  if (!job) {
    logger.warn("Cannot cancel job: not found", { jobId, queue: queue.name });
    return false;
  }

  const state = await job.getState();

  if (state !== "waiting" && state !== "delayed") {
    logger.warn("Cannot cancel job: not in a cancellable state", {
      jobId,
      state,
      queue: queue.name,
    });
    return false;
  }

  await job.remove();

  logger.info("Job cancelled and removed", {
    jobId,
    previousState: state,
    queue: queue.name,
  });

  return true;
}

/**
 * Update a job's progress and store it in Redis for SSE consumption.
 */
export async function updateJobProgress(
  job: Job,
  progress: number,
  message?: string,
): Promise<void> {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  await job.updateProgress(clampedProgress);

  const progressData: JobProgress = {
    jobId: String(job.id),
    progress: clampedProgress,
    message,
    updatedAt: new Date(),
  };

  await redis.set(
    progressKey(String(job.id)),
    JSON.stringify(progressData),
    PROGRESS_TTL_SECONDS,
  );

  logger.debug("Job progress updated", {
    jobId: job.id,
    progress: clampedProgress,
    message,
  });
}

/**
 * Clean completed and failed jobs older than the specified threshold.
 * Returns the total number of jobs cleaned.
 */
export async function cleanupOldJobs(queue: Queue, olderThanMs: number): Promise<number> {
  const cleanedCompleted = await queue.clean(olderThanMs, 1000, "completed");
  const cleanedFailed = await queue.clean(olderThanMs, 1000, "failed");

  const totalCleaned = cleanedCompleted.length + cleanedFailed.length;

  logger.info("Old jobs cleaned from queue", {
    queue: queue.name,
    olderThanMs,
    completedCleaned: cleanedCompleted.length,
    failedCleaned: cleanedFailed.length,
    totalCleaned,
  });

  return totalCleaned;
}

/**
 * Get the current health/counts for a queue.
 */
export async function getQueueHealth(
  queue: Queue,
): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}
