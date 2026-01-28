import { Queue, QueueOptions, Worker, WorkerOptions, Job } from "bullmq";
import type Redis from "ioredis";
import { logger } from "../utils/logger";
import {
  getQueueConnectionSync,
  getWorkerConnectionSync,
  releaseQueueConnection,
  releaseWorkerConnection,
} from "../db/redis";

export interface BaseQueueOptions {
  name: string;
  defaultJobOptions?: {
    removeOnComplete?: number | boolean;
    removeOnFail?: number | boolean;
    attempts?: number;
    backoff?: {
      type: "exponential" | "fixed";
      delay: number;
    };
  };
  rateLimiter?: {
    max: number;
    duration: number;
  };
  maxQueueDepth?: number;
}

export class QueueDepthExceededError extends Error {
  constructor(queueName: string, currentDepth: number, maxDepth: number) {
    super(`Queue ${queueName} depth (${currentDepth}) exceeds limit (${maxDepth})`);
    this.name = "QueueDepthExceededError";
  }
}

const DEFAULT_MAX_QUEUE_DEPTH = parseInt(process.env.MAX_QUEUE_DEPTH || "10000", 10);

export class BaseQueue<T = any> {
  protected queue: Queue<T>;
  protected queueName: string;
  protected connection: Redis;
  protected maxQueueDepth: number;

  constructor(options: BaseQueueOptions) {
    this.queueName = options.name;
    this.maxQueueDepth = options.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH;

    this.connection = getQueueConnectionSync();

    const queueOptions: QueueOptions = {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        ...options.defaultJobOptions,
      },
      ...(options.rateLimiter && {
        limiter: {
          max: options.rateLimiter.max,
          duration: options.rateLimiter.duration,
        },
      }),
    };

    this.queue = new Queue<T>(this.queueName, queueOptions);

    this.queue.on("error", (err: Error) => {
      logger.error(`Queue ${this.queueName} error:`, err);
    });

    logger.info(`Queue ${this.queueName} initialized`);
  }

  async add(jobName: string, data: T, opts?: any): Promise<Job<any, any, string>> {
    try {
      if (this.maxQueueDepth > 0) {
        const counts = await this.queue.getJobCounts("waiting", "active", "delayed");
        const currentDepth = counts.waiting + counts.active + counts.delayed;
        if (currentDepth >= this.maxQueueDepth) {
          throw new QueueDepthExceededError(this.queueName, currentDepth, this.maxQueueDepth);
        }
      }

      const job = await this.queue.add(jobName as any, data as any, opts);
      logger.debug(`Job ${job.id} added to ${this.queueName}`, {
        jobName,
        jobId: job.id,
      });
      return job as any;
    } catch (error: any) {
      if (error instanceof QueueDepthExceededError) {
        logger.warn(`Queue depth limit exceeded for ${this.queueName}`, {
          maxDepth: this.maxQueueDepth,
        });
      } else {
        logger.error(`Failed to add job to ${this.queueName}:`, error);
      }
      throw error;
    }
  }

  async getQueueDepth(): Promise<number> {
    const counts = await this.queue.getJobCounts("waiting", "active", "delayed");
    return counts.waiting + counts.active + counts.delayed;
  }

  async close(): Promise<void> {
    await this.queue.close();
    releaseQueueConnection(this.connection);
    logger.info(`Queue ${this.queueName} closed`);
  }

  getQueue(): Queue<T> {
    return this.queue;
  }
}

export interface BaseWorkerOptions {
  concurrency?: number;
  lockDuration?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
}

export abstract class BaseWorker<T = any> {
  protected worker: Worker<T>;
  protected workerName: string;
  protected connection: Redis;

  constructor(queueName: string, options: BaseWorkerOptions = {}) {
    this.workerName = queueName;

    this.connection = getWorkerConnectionSync();

    const workerOptions: WorkerOptions = {
      connection: this.connection,
      concurrency: options.concurrency || 1,
      lockDuration: options.lockDuration || 60000,
      stalledInterval: options.stalledInterval || 120000,
      maxStalledCount: options.maxStalledCount || 3,
    };

    this.worker = new Worker<T>(
      queueName,
      async (job: Job<T>) => {
        logger.debug(`Processing job ${job.id} in ${this.workerName}`, {
          jobId: job.id,
          jobName: job.name,
        });

        try {
          const result = await this.process(job);
          logger.info(`Job ${job.id} completed in ${this.workerName}`, {
            jobId: job.id,
          });
          return result;
        } catch (error: any) {
          logger.error(`Job ${job.id} failed in ${this.workerName}:`, error);
          throw error;
        }
      },
      workerOptions,
    );

    this.worker.on("completed", (job: Job<T>) => {
      logger.debug(`Worker ${this.workerName} completed job ${job.id}`);
    });

    this.worker.on("failed", (job: Job<T> | undefined, err: Error) => {
      logger.error(`Worker ${this.workerName} failed job ${job?.id}:`, err);
    });

    this.worker.on("stalled", (jobId: string) => {
      logger.warn(`[${this.workerName}] Job stalled (may be stuck)`, {
        jobId,
        message: "Job exceeded lock duration without completing",
      });
    });

    logger.info(`Worker ${this.workerName} initialized`);
  }

  abstract process(job: Job<T>): Promise<any>;

  async close(): Promise<void> {
    await this.worker.close();
    releaseWorkerConnection(this.connection);
    logger.info(`Worker ${this.workerName} closed`);
  }

  public getWorker(): Worker<T> {
    return this.worker;
  }
}
