import { Queue, QueueOptions, Worker, WorkerOptions, Job } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error("Redis connection failed after 10 retries");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisConnection.on("error", (err: Error) => {
      logger.error("Redis connection error:", err);
    });

    redisConnection.on("connect", () => {
      logger.info("Redis connected for BullMQ");
    });
  }

  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (!redisConnection) return;
  const conn = redisConnection;
  redisConnection = null;

  try {
    await conn.quit();
  } catch (error) {
    try {
      conn.disconnect();
    } catch (disconnectError) {
      void disconnectError;
    }
  }
}

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
}

export class BaseQueue<T = any> {
  protected queue: Queue<T>;
  protected queueName: string;

  constructor(options: BaseQueueOptions) {
    this.queueName = options.name;

    const queueOptions: QueueOptions = {
      connection: getRedisConnection(),
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
    };

    this.queue = new Queue<T>(this.queueName, queueOptions);

    this.queue.on("error", (err: Error) => {
      logger.error(`Queue ${this.queueName} error:`, err);
    });

    logger.info(`Queue ${this.queueName} initialized`);
  }

  async add(jobName: string, data: T, opts?: any): Promise<Job<any, any, string>> {
    try {
      const job = await this.queue.add(jobName as any, data as any, opts);
      logger.debug(`Job ${job.id} added to ${this.queueName}`, {
        jobName,
        jobId: job.id,
      });
      return job as any;
    } catch (error: any) {
      logger.error(`Failed to add job to ${this.queueName}:`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
    logger.info(`Queue ${this.queueName} closed`);
  }

  getQueue(): Queue<T> {
    return this.queue;
  }
}

export interface BaseWorkerOptions {
  concurrency?: number;
}

export abstract class BaseWorker<T = any> {
  protected worker: Worker<T>;
  protected workerName: string;

  constructor(queueName: string, options: BaseWorkerOptions = {}) {
    this.workerName = queueName;

    const workerOptions: WorkerOptions = {
      connection: getRedisConnection(),
      concurrency: options.concurrency || 1,
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

    logger.info(`Worker ${this.workerName} initialized`);
  }

  abstract process(job: Job<T>): Promise<any>;

  async close(): Promise<void> {
    await this.worker.close();
    logger.info(`Worker ${this.workerName} closed`);
  }
}
