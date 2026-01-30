import { Worker, Queue } from "bullmq";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

const REDIS_KEY_PREFIX = "worker:health:";
const HEARTBEAT_TTL_SECONDS = 60;
const STALE_THRESHOLD_MS = 45_000;

export type WorkerStatusType = "healthy" | "stalled" | "stopped";

export interface WorkerStatus {
  name: string;
  status: WorkerStatusType;
  lastHeartbeat: number | null;
  jobsProcessed: number;
  jobsFailed: number;
  avgProcessingTimeMs: number;
  activeJobs: number;
}

export interface WorkerHealthReport {
  workers: WorkerStatus[];
  totalActive: number;
  totalStalled: number;
  timestamp: number;
}

interface RegisteredWorker {
  name: string;
  worker: Worker;
  jobsProcessed: number;
  jobsFailed: number;
  totalProcessingTimeMs: number;
}

export class WorkerHealthMonitor {
  private registeredWorkers: Map<string, RegisteredWorker> = new Map();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Register a BullMQ worker for health monitoring.
   * Attaches event listeners to track job completion and failure metrics.
   */
  register(workerName: string, worker: Worker): void {
    if (this.registeredWorkers.has(workerName)) {
      logger.warn(`Worker "${workerName}" is already registered for health monitoring`);
      return;
    }

    const entry: RegisteredWorker = {
      name: workerName,
      worker,
      jobsProcessed: 0,
      jobsFailed: 0,
      totalProcessingTimeMs: 0,
    };

    worker.on("completed", (job) => {
      entry.jobsProcessed++;
      if (job?.processedOn && job?.finishedOn) {
        entry.totalProcessingTimeMs += job.finishedOn - job.processedOn;
      }
    });

    worker.on("failed", () => {
      entry.jobsFailed++;
    });

    this.registeredWorkers.set(workerName, entry);
    logger.info(`Worker "${workerName}" registered for health monitoring`);
  }

  /**
   * Start the periodic health check loop.
   * Each tick stores a heartbeat in Redis and logs any stalled workers.
   */
  start(intervalMs: number = 15_000): void {
    if (this.intervalHandle) {
      logger.warn("WorkerHealthMonitor is already running");
      return;
    }

    logger.info("Starting WorkerHealthMonitor", {
      intervalMs,
      workerCount: this.registeredWorkers.size,
    });

    // Run an immediate check, then schedule recurring
    void this.tick();

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, intervalMs);

    // Allow the process to exit even if the interval is still active
    this.intervalHandle.unref?.();
  }

  /**
   * Stop the periodic health check loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("WorkerHealthMonitor stopped");
    }
  }

  /**
   * Get a full health report for all registered workers.
   */
  async getHealth(): Promise<WorkerHealthReport> {
    const workers: WorkerStatus[] = [];

    for (const [name] of this.registeredWorkers) {
      const status = await this.getWorkerHealth(name);
      workers.push(status);
    }

    const totalActive = workers.filter((w) => w.status === "healthy").length;
    const totalStalled = workers.filter((w) => w.status === "stalled").length;

    return {
      workers,
      totalActive,
      totalStalled,
      timestamp: Date.now(),
    };
  }

  /**
   * Get the health status for a single registered worker by name.
   */
  async getWorkerHealth(workerName: string): Promise<WorkerStatus> {
    const entry = this.registeredWorkers.get(workerName);
    if (!entry) {
      return {
        name: workerName,
        status: "stopped",
        lastHeartbeat: null,
        jobsProcessed: 0,
        jobsFailed: 0,
        avgProcessingTimeMs: 0,
        activeJobs: 0,
      };
    }

    const { worker } = entry;
    const status = await this.determineStatus(workerName, worker);
    const activeJobs = await this.getActiveJobCount(worker);

    const avgProcessingTimeMs =
      entry.jobsProcessed > 0
        ? Math.round(entry.totalProcessingTimeMs / entry.jobsProcessed)
        : 0;

    const heartbeatRaw = await redis.get(`${REDIS_KEY_PREFIX}${workerName}`);
    const lastHeartbeat = heartbeatRaw ? parseInt(heartbeatRaw, 10) : null;

    return {
      name: workerName,
      status,
      lastHeartbeat,
      jobsProcessed: entry.jobsProcessed,
      jobsFailed: entry.jobsFailed,
      avgProcessingTimeMs,
      activeJobs,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async tick(): Promise<void> {
    for (const [name, entry] of this.registeredWorkers) {
      try {
        const { worker } = entry;

        // Store a heartbeat only if the worker is actively running
        if (worker.isRunning() && !worker.isPaused()) {
          const now = Date.now();
          await redis.set(
            `${REDIS_KEY_PREFIX}${name}`,
            String(now),
            HEARTBEAT_TTL_SECONDS,
          );
        }

        // Log warnings for stalled workers
        const status = await this.determineStatus(name, worker);
        if (status === "stalled") {
          logger.warn(`Worker "${name}" appears stalled — no heartbeat within ${STALE_THRESHOLD_MS}ms`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Health check failed for worker "${name}"`, { error: message });
      }
    }
  }

  private async determineStatus(
    workerName: string,
    worker: Worker,
  ): Promise<WorkerStatusType> {
    // If BullMQ reports the worker as not running, it is stopped
    if (!worker.isRunning()) {
      return "stopped";
    }

    // Check heartbeat freshness in Redis
    const heartbeatRaw = await redis.get(`${REDIS_KEY_PREFIX}${workerName}`);
    if (!heartbeatRaw) {
      // No heartbeat found and TTL expired — consider stalled
      return "stalled";
    }

    const lastBeat = parseInt(heartbeatRaw, 10);
    if (Number.isNaN(lastBeat)) {
      return "stalled";
    }

    const age = Date.now() - lastBeat;
    if (age > STALE_THRESHOLD_MS) {
      return "stalled";
    }

    return "healthy";
  }

  private async getActiveJobCount(worker: Worker): Promise<number> {
    try {
      // Access the underlying queue to query job counts
      const queueName = worker.name;
      const queue = new Queue(queueName, {
        connection: worker.opts.connection as any,
      });

      try {
        const counts = await queue.getJobCounts("active");
        return counts.active ?? 0;
      } finally {
        await queue.close();
      }
    } catch {
      return 0;
    }
  }
}

export const workerHealthMonitor = new WorkerHealthMonitor();
