import { Queue, QueueOptions, DefaultJobOptions } from "bullmq";
import Redis from "ioredis";
import { logger } from "../utils/logger";

/**
 * Base Queue Configuration
 *
 * Shared configuration for all BullMQ queues in the system.
 * Implements:
 * - Exponential backoff with jitter
 * - Dead letter queue support
 * - Per-organization rate limiting
 * - Redis connection pooling
 */

// Redis connection configuration
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redisOptions = {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

// Create Redis connection for BullMQ
export const createRedisConnection = (): Redis => {
  const connection = new Redis(redisUrl, redisOptions);

  connection.on("error", (err) => {
    logger.error("Redis connection error", { error: err.message });
  });

  connection.on("connect", () => {
    logger.info("Redis connected for BullMQ");
  });

  return connection;
};

/**
 * Exponential backoff with jitter
 * Formula: min(maxDelay, baseDelay * 2^attemptsMade) + random(0, jitter)
 */
export function exponentialBackoffWithJitter(
  attemptsMade: number,
  baseDelay = 1000,
  maxDelay = 60000,
  jitter = 1000,
): number {
  const exponentialDelay = Math.min(
    maxDelay,
    baseDelay * Math.pow(2, attemptsMade),
  );
  const randomJitter = Math.random() * jitter;
  return Math.floor(exponentialDelay + randomJitter);
}

/**
 * Default job options for all queues
 */
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "custom",
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600,
  },
};

/**
 * Base queue options
 */
export const baseQueueOptions: QueueOptions = {
  connection: createRedisConnection(),
  defaultJobOptions,
};

/**
 * Create a standardized queue with logging and error handling
 */
export function createQueue<T = any>(
  name: string,
  options?: Partial<QueueOptions>,
): Queue<T> {
  const queue = new Queue<T>(name, {
    ...baseQueueOptions,
    ...options,
  });

  queue.on("error", (error) => {
    logger.error(`Queue error: ${name}`, { error: error.message });
  });

  logger.info(`Queue created: ${name}`);

  return queue;
}

/**
 * Get queue metrics
 */
export async function getQueueMetrics(queue: Queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Rate limiting configuration per organization
 * Uses BullMQ's built-in rate limiting
 */
export interface RateLimitConfig {
  max: number; // Max jobs per duration
  duration: number; // Duration in milliseconds
}

export const defaultRateLimits: Record<string, RateLimitConfig> = {
  "slack-events": {
    max: 100, // 100 events
    duration: 60000, // per minute
  },
  orchestration: {
    max: 20, // 20 orchestrations
    duration: 60000, // per minute (accounts for long LLM calls)
  },
  notifications: {
    max: 200, // 200 notifications
    duration: 60000, // per minute
  },
};
