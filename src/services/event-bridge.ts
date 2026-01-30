import { Worker, Job } from "bullmq";
import { sseManager } from "../api/sse";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_TTL_SECONDS = 1;

type JobProgress = string | boolean | number | object;

interface WorkerRegistration {
  worker: Worker;
  queueName: string;
  listeners: {
    completed: (job: Job) => void;
    failed: (job: Job | undefined, err: Error) => void;
    active: (job: Job) => void;
    progress: (job: Job, progress: JobProgress) => void;
  };
}

class EventBridge {
  private registrations: WorkerRegistration[] = [];

  /**
   * Attach to a BullMQ Worker instance and bridge its lifecycle events to SSE.
   */
  attachToWorker(worker: Worker, queueName: string): void {
    const onCompleted = (job: Job): void => {
      const organizationId = job.data?.organizationId as string | undefined;
      if (!organizationId) return;

      void this.emitRateLimited(organizationId, "job:completed", {
        jobId: job.id,
        queueName,
        result: job.returnvalue,
      });
    };

    const onFailed = (job: Job | undefined, err: Error): void => {
      if (!job) return;
      const organizationId = job.data?.organizationId as string | undefined;
      if (!organizationId) return;

      void this.emitRateLimited(organizationId, "job:failed", {
        jobId: job.id,
        queueName,
        error: err.message,
        attempt: job.attemptsMade,
      });
    };

    const onActive = (job: Job): void => {
      const organizationId = job.data?.organizationId as string | undefined;
      if (!organizationId) return;

      void this.emitRateLimited(organizationId, "job:started", {
        jobId: job.id,
        queueName,
      });
    };

    const onProgress = (job: Job, progress: JobProgress): void => {
      const organizationId = job.data?.organizationId as string | undefined;
      if (!organizationId) return;

      void this.emitRateLimited(organizationId, "job:progress", {
        jobId: job.id,
        queueName,
        progress,
      });
    };

    worker.on("completed", onCompleted);
    worker.on("failed", onFailed);
    worker.on("active", onActive);
    worker.on("progress", onProgress);

    this.registrations.push({
      worker,
      queueName,
      listeners: {
        completed: onCompleted,
        failed: onFailed,
        active: onActive,
        progress: onProgress,
      },
    });

    logger.info("EventBridge attached to worker", { queueName });
  }

  /**
   * Remove all listeners from every attached worker.
   */
  detachAll(): void {
    for (const reg of this.registrations) {
      reg.worker.off("completed", reg.listeners.completed);
      reg.worker.off("failed", reg.listeners.failed);
      reg.worker.off("active", reg.listeners.active);
      reg.worker.off("progress", reg.listeners.progress);
    }

    const count = this.registrations.length;
    this.registrations = [];
    logger.info("EventBridge detached from all workers", { count });
  }

  /**
   * Emit an SSE event, rate-limited to RATE_LIMIT_MAX events per org per second.
   * Events that exceed the limit are silently dropped.
   */
  private async emitRateLimited(
    organizationId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const key = `event-bridge:rate:${organizationId}`;
      const count = await redis.incr(key);

      // Set TTL on the first increment so the counter expires after 1 second
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_TTL_SECONDS);
      }

      if (count > RATE_LIMIT_MAX) {
        logger.debug("EventBridge rate limit exceeded, dropping event", {
          organizationId,
          event,
          count,
        });
        return;
      }

      sseManager.sendToOrganization(organizationId, event, data);
    } catch (err) {
      logger.error("EventBridge failed to emit SSE event", {
        organizationId,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const eventBridge = new EventBridge();

/**
 * Convenience function to attach the EventBridge to an array of BullMQ Workers.
 * Each worker must be accompanied by its queue name, inferred from the worker's name property.
 */
export function initEventBridge(workers: Worker[]): void {
  for (const worker of workers) {
    eventBridge.attachToWorker(worker, worker.name);
  }
  logger.info("EventBridge initialized", { workerCount: workers.length });
}
