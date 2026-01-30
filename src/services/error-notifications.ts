import { logger } from "../utils/logger";
import { redis } from "../db/redis";

interface AlertThreshold {
  maxFailures: number;
  windowSeconds: number;
}

const DEFAULT_ALERT_THRESHOLDS: Record<string, AlertThreshold> = {
  orchestration: { maxFailures: 5, windowSeconds: 300 },
  notification: { maxFailures: 5, windowSeconds: 300 },
  webhook: { maxFailures: 5, windowSeconds: 300 },
  "slack-event": { maxFailures: 5, windowSeconds: 300 },
  "scheduled-task": { maxFailures: 5, windowSeconds: 300 },
};

const FALLBACK_THRESHOLD: AlertThreshold = { maxFailures: 5, windowSeconds: 300 };

function getThreshold(queueName: string): AlertThreshold {
  return DEFAULT_ALERT_THRESHOLDS[queueName] ?? FALLBACK_THRESHOLD;
}

function getRedisKey(queueName: string): string {
  return `errors:${queueName}:count`;
}

export class ErrorNotificationService {
  /**
   * Record a job failure. Increments the failure counter in Redis and
   * sets or refreshes the TTL to the alert window duration. If the
   * failure count crosses the alert threshold, an alert is dispatched.
   */
  async recordFailure(
    queueName: string,
    jobId: string,
    error: string,
    organizationId?: string,
  ): Promise<void> {
    const key = getRedisKey(queueName);
    const threshold = getThreshold(queueName);

    try {
      const count = await redis.incr(key);

      // Set TTL on the first failure to define the sliding window
      if (count === 1) {
        await redis.expire(key, threshold.windowSeconds);
      }

      logger.warn(`Job failure recorded for queue "${queueName}"`, {
        queueName,
        jobId,
        error,
        organizationId,
        failureCount: count,
      });

      if (count >= threshold.maxFailures) {
        await this.sendAlert(queueName, count, error);
      }
    } catch (err) {
      logger.error(`Failed to record failure for queue "${queueName}"`, {
        queueName,
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Check whether the current failure count for a queue has exceeded
   * the alert threshold within the configured time window.
   */
  async shouldAlert(queueName: string): Promise<boolean> {
    const key = getRedisKey(queueName);
    const threshold = getThreshold(queueName);

    try {
      const raw = await redis.get(key);
      if (raw === null) {
        return false;
      }
      const count = parseInt(raw, 10);
      return !isNaN(count) && count > threshold.maxFailures;
    } catch (err) {
      logger.error(`Failed to check alert status for queue "${queueName}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Return the current failure count and the window duration (in ms)
   * for a given queue.
   */
  async getFailureStats(
    queueName: string,
  ): Promise<{ count: number; windowMs: number }> {
    const key = getRedisKey(queueName);
    const threshold = getThreshold(queueName);

    try {
      const raw = await redis.get(key);
      const count = raw !== null ? parseInt(raw, 10) : 0;
      return {
        count: isNaN(count) ? 0 : count,
        windowMs: threshold.windowSeconds * 1000,
      };
    } catch (err) {
      logger.error(`Failed to get failure stats for queue "${queueName}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return { count: 0, windowMs: threshold.windowSeconds * 1000 };
    }
  }

  /**
   * Clear all recorded failures for a queue, resetting the counter.
   */
  async clearFailures(queueName: string): Promise<void> {
    const key = getRedisKey(queueName);

    try {
      await redis.del(key);
      logger.info(`Cleared failure counter for queue "${queueName}"`, { queueName });
    } catch (err) {
      logger.error(`Failed to clear failures for queue "${queueName}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Send an alert for repeated failures on a queue.
   * In production this would integrate with PagerDuty, Slack, or another
   * alerting system. Currently logs at critical level.
   */
  async sendAlert(
    queueName: string,
    failureCount: number,
    recentError: string,
  ): Promise<void> {
    logger.error(
      `CRITICAL: Queue "${queueName}" has ${failureCount} failures within the alert window`,
      {
        queueName,
        failureCount,
        recentError,
        action: "alert_triggered",
      },
    );
  }
}

export const errorNotifications = new ErrorNotificationService();
