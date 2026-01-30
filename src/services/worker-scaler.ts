import { logger } from "../utils/logger";
import { redis } from "../db/redis";

export interface ScalingConfig {
  queueName: string;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownMs: number;
  scaleUpStep: number;
  scaleDownStep: number;
}

export interface WorkerMetrics {
  queueName: string;
  activeWorkers: number;
  queueDepth: number;
  processingRate: number;
  avgProcessingTime: number;
  lastScaleAction: Date | null;
  lastScaleDirection: "up" | "down" | null;
}

export interface ScalingDecision {
  action: "scale_up" | "scale_down" | "none";
  currentWorkers: number;
  targetWorkers: number;
  reason: string;
}

const SCALING_HISTORY_KEY_PREFIX = "worker-scaler:history:";
const SCALING_HISTORY_TTL_SECONDS = 86400; // 24 hours
const SCALING_HISTORY_MAX_ENTRIES = 100;

function defaultConfig(partial: Partial<ScalingConfig> & { queueName: string }): ScalingConfig {
  return {
    queueName: partial.queueName,
    minWorkers: partial.minWorkers ?? 1,
    maxWorkers: partial.maxWorkers ?? 10,
    scaleUpThreshold: partial.scaleUpThreshold ?? 50,
    scaleDownThreshold: partial.scaleDownThreshold ?? 5,
    cooldownMs: partial.cooldownMs ?? 60000,
    scaleUpStep: partial.scaleUpStep ?? 1,
    scaleDownStep: partial.scaleDownStep ?? 1,
  };
}

export class WorkerScaler {
  private configs: Map<string, ScalingConfig> = new Map();
  private metricsMap: Map<string, WorkerMetrics> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(configs: ScalingConfig[]) {
    for (const config of configs) {
      this.configs.set(config.queueName, config);
      this.metricsMap.set(config.queueName, {
        queueName: config.queueName,
        activeWorkers: config.minWorkers,
        queueDepth: 0,
        processingRate: 0,
        avgProcessingTime: 0,
        lastScaleAction: null,
        lastScaleDirection: null,
      });
    }

    logger.info("WorkerScaler initialized", {
      queues: configs.map((c) => c.queueName),
    });
  }

  start(intervalMs: number = 30000): void {
    if (this.intervalId) {
      logger.warn("WorkerScaler is already running");
      return;
    }

    logger.info("Starting WorkerScaler", { intervalMs });

    void this.evaluateAll();

    this.intervalId = setInterval(() => {
      void this.evaluateAll();
    }, intervalMs);

    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("WorkerScaler stopped");
    }
  }

  async evaluate(queueName: string): Promise<ScalingDecision> {
    const config = this.configs.get(queueName);
    if (!config) {
      return {
        action: "none",
        currentWorkers: 0,
        targetWorkers: 0,
        reason: `No configuration found for queue "${queueName}"`,
      };
    }

    const metrics = this.metricsMap.get(queueName);
    if (!metrics) {
      return {
        action: "none",
        currentWorkers: 0,
        targetWorkers: 0,
        reason: `No metrics found for queue "${queueName}"`,
      };
    }

    try {
      const queueDepth = await this.getQueueDepth(queueName);
      metrics.queueDepth = queueDepth;

      const currentWorkers = metrics.activeWorkers;

      // Check cooldown period
      if (metrics.lastScaleAction) {
        const elapsed = Date.now() - metrics.lastScaleAction.getTime();
        if (elapsed < config.cooldownMs) {
          const remaining = config.cooldownMs - elapsed;
          return {
            action: "none",
            currentWorkers,
            targetWorkers: currentWorkers,
            reason: `Cooldown active, ${remaining}ms remaining`,
          };
        }
      }

      // Evaluate scale up
      if (queueDepth >= config.scaleUpThreshold && currentWorkers < config.maxWorkers) {
        const targetWorkers = Math.min(
          currentWorkers + config.scaleUpStep,
          config.maxWorkers,
        );

        const decision: ScalingDecision = {
          action: "scale_up",
          currentWorkers,
          targetWorkers,
          reason: `Queue depth ${queueDepth} >= threshold ${config.scaleUpThreshold}`,
        };

        metrics.activeWorkers = targetWorkers;
        metrics.lastScaleAction = new Date();
        metrics.lastScaleDirection = "up";

        logger.info("Scaling up workers", {
          queueName,
          currentWorkers,
          targetWorkers,
          queueDepth,
          threshold: config.scaleUpThreshold,
        });

        await this.recordScalingHistory(queueName, decision);
        return decision;
      }

      // Evaluate scale down
      if (queueDepth <= config.scaleDownThreshold && currentWorkers > config.minWorkers) {
        const targetWorkers = Math.max(
          currentWorkers - config.scaleDownStep,
          config.minWorkers,
        );

        const decision: ScalingDecision = {
          action: "scale_down",
          currentWorkers,
          targetWorkers,
          reason: `Queue depth ${queueDepth} <= threshold ${config.scaleDownThreshold}`,
        };

        metrics.activeWorkers = targetWorkers;
        metrics.lastScaleAction = new Date();
        metrics.lastScaleDirection = "down";

        logger.info("Scaling down workers", {
          queueName,
          currentWorkers,
          targetWorkers,
          queueDepth,
          threshold: config.scaleDownThreshold,
        });

        await this.recordScalingHistory(queueName, decision);
        return decision;
      }

      return {
        action: "none",
        currentWorkers,
        targetWorkers: currentWorkers,
        reason: `Queue depth ${queueDepth} within thresholds (up: ${config.scaleUpThreshold}, down: ${config.scaleDownThreshold})`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to evaluate scaling for queue", {
        queueName,
        error: message,
      });
      return {
        action: "none",
        currentWorkers: metrics.activeWorkers,
        targetWorkers: metrics.activeWorkers,
        reason: `Evaluation error: ${message}`,
      };
    }
  }

  async evaluateAll(): Promise<Map<string, ScalingDecision>> {
    const decisions = new Map<string, ScalingDecision>();

    for (const queueName of this.configs.keys()) {
      try {
        const decision = await this.evaluate(queueName);
        decisions.set(queueName, decision);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to evaluate queue during evaluateAll", {
          queueName,
          error: message,
        });
      }
    }

    return decisions;
  }

  recordMetric(
    queueName: string,
    metric: {
      queueDepth: number;
      activeWorkers: number;
      processingRate: number;
      avgProcessingTime: number;
    },
  ): void {
    const existing = this.metricsMap.get(queueName);
    if (!existing) {
      logger.warn("Cannot record metric for unknown queue", { queueName });
      return;
    }

    existing.queueDepth = metric.queueDepth;
    existing.activeWorkers = metric.activeWorkers;
    existing.processingRate = metric.processingRate;
    existing.avgProcessingTime = metric.avgProcessingTime;

    logger.debug("Worker metric recorded", { queueName, ...metric });
  }

  getMetrics(queueName?: string): WorkerMetrics | WorkerMetrics[] | null {
    if (queueName) {
      return this.metricsMap.get(queueName) ?? null;
    }
    return Array.from(this.metricsMap.values());
  }

  async getScalingHistory(
    queueName: string,
    limit: number = 20,
  ): Promise<ScalingDecision[]> {
    try {
      const key = `${SCALING_HISTORY_KEY_PREFIX}${queueName}`;
      const raw = await redis.lrange(key, 0, limit - 1);
      return raw.map((entry) => JSON.parse(entry) as ScalingDecision);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to retrieve scaling history", {
        queueName,
        error: message,
      });
      return [];
    }
  }

  private async getQueueDepth(queueName: string): Promise<number> {
    try {
      const waitingKey = `bull:${queueName}:wait`;
      const items = await redis.lrange(waitingKey, 0, -1);
      return items.length;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get queue depth", {
        queueName,
        error: message,
      });
      return 0;
    }
  }

  private async recordScalingHistory(
    queueName: string,
    decision: ScalingDecision,
  ): Promise<void> {
    try {
      const key = `${SCALING_HISTORY_KEY_PREFIX}${queueName}`;
      const entry = JSON.stringify({
        ...decision,
        timestamp: new Date().toISOString(),
      });

      await redis.lpush(key, entry);
      await redis.expire(key, SCALING_HISTORY_TTL_SECONDS);

      // Trim to keep only the most recent entries. Use eval since
      // the redis wrapper does not expose ltrim directly.
      await redis.eval(
        "redis.call('ltrim', KEYS[1], 0, ARGV[1])",
        1,
        key,
        SCALING_HISTORY_MAX_ENTRIES - 1,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to record scaling history", {
        queueName,
        error: message,
      });
    }
  }
}

export const workerScaler = new WorkerScaler([
  defaultConfig({ queueName: "orchestration" }),
  defaultConfig({ queueName: "slack-events" }),
  defaultConfig({ queueName: "notifications" }),
]);
