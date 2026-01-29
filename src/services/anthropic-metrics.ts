import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { metricsCollector } from "./metrics";

// =============================================================================
// Type Definitions
// =============================================================================

export interface AnthropicRequestData {
  model: string;
  category: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface UsageStats {
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
  rateLimitHits: number;
}

export interface QuotaEstimate {
  maxRequestsPerDay: number;
  currentRequests: number;
  quotaRemaining: string;
  estimatedDailyRequests: number;
}

type TimeWindow = "minute" | "hour" | "day";

// =============================================================================
// Constants
// =============================================================================

const REDIS_KEY_PREFIX = "anthropic:stats";
const MINUTE_TTL = 120;
const HOUR_TTL = 7200;
const DAY_TTL = 172800;

const TIER_LIMITS = {
  free: 50,
  standard: 1000,
  pro: 5000,
  max: 40000,
} as const;

// =============================================================================
// Metrics Definitions
// =============================================================================

metricsCollector.describeMetric("anthropic_requests_total", {
  help: "Total Claude API requests",
  type: "counter",
});

metricsCollector.describeMetric("anthropic_tokens_total", {
  help: "Total tokens used (input + output)",
  type: "counter",
});

metricsCollector.describeMetric("anthropic_cost_total", {
  help: "Total cost in USD",
  type: "counter",
});

metricsCollector.describeMetric("anthropic_rate_limit_hits_total", {
  help: "Total 429 rate limit errors",
  type: "counter",
});

metricsCollector.describeMetric("anthropic_request_duration_seconds", {
  help: "Request duration histogram",
  type: "histogram",
});

metricsCollector.describeMetric("anthropic_errors_total", {
  help: "Total Anthropic API errors by type",
  type: "counter",
});

// =============================================================================
// Redis Key Helpers
// =============================================================================

function getTimeWindowKey(window: TimeWindow): string {
  const now = new Date();
  let timestamp: string;

  switch (window) {
    case "minute":
      timestamp = `${now.toISOString().slice(0, 16)}`;
      break;
    case "hour":
      timestamp = `${now.toISOString().slice(0, 13)}`;
      break;
    case "day":
      timestamp = `${now.toISOString().slice(0, 10)}`;
      break;
  }

  return `${REDIS_KEY_PREFIX}:${window}:${timestamp}`;
}

function getTTL(window: TimeWindow): number {
  switch (window) {
    case "minute":
      return MINUTE_TTL;
    case "hour":
      return HOUR_TTL;
    case "day":
      return DAY_TTL;
  }
}

// =============================================================================
// AnthropicMetricsTracker Class
// =============================================================================

export class AnthropicMetricsTracker {
  /**
   * Record a single Anthropic API request with all relevant metrics
   */
  async recordRequest(data: AnthropicRequestData): Promise<void> {
    try {
      const totalTokens = data.inputTokens + data.outputTokens;

      metricsCollector.incrementCounter(
        "anthropic_requests_total",
        {
          model: data.model,
          category: data.category,
          success: String(data.success),
        },
        1,
      );

      metricsCollector.incrementCounter(
        "anthropic_tokens_total",
        {
          model: data.model,
          type: "input",
        },
        data.inputTokens,
      );

      metricsCollector.incrementCounter(
        "anthropic_tokens_total",
        {
          model: data.model,
          type: "output",
        },
        data.outputTokens,
      );

      metricsCollector.incrementCounter(
        "anthropic_tokens_total",
        {
          model: data.model,
          type: "total",
        },
        totalTokens,
      );

      metricsCollector.incrementCounter(
        "anthropic_cost_total",
        {
          model: data.model,
          category: data.category,
        },
        data.cost,
      );

      metricsCollector.observeHistogram(
        "anthropic_request_duration_seconds",
        {
          model: data.model,
          category: data.category,
        },
        data.duration / 1000,
      );

      if (!data.success && data.error) {
        metricsCollector.incrementCounter(
          "anthropic_errors_total",
          {
            error_type: data.error,
          },
          1,
        );
      }

      await this.updateTimeSeriesData(data, totalTokens);

      logger.debug("Anthropic metrics recorded", {
        model: data.model,
        tokens: totalTokens,
        cost: data.cost,
        duration: data.duration,
      });
    } catch (error) {
      logger.error("Failed to record Anthropic metrics", {
        error: error instanceof Error ? error.message : String(error),
        model: data.model,
      });
    }
  }

  /**
   * Record a 429 rate limit hit
   */
  async recordRateLimit(accountName?: string): Promise<void> {
    try {
      metricsCollector.incrementCounter(
        "anthropic_rate_limit_hits_total",
        {
          account: accountName || "default",
        },
        1,
      );

      const windows: TimeWindow[] = ["minute", "hour", "day"];
      await Promise.all(
        windows.map(async (window) => {
          const key = getTimeWindowKey(window);
          const ttl = getTTL(window);
          await redis.eval(
            `
            redis.call('HINCRBY', KEYS[1], 'rateLimitHits', 1)
            redis.call('EXPIRE', KEYS[1], ARGV[1])
            return 1
            `,
            1,
            key,
            ttl,
          );
        }),
      );

      logger.warn("Anthropic rate limit hit", { account: accountName });
    } catch (error) {
      logger.error("Failed to record rate limit", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get usage statistics for a specific time window
   */
  async getUsageStats(timeWindow: TimeWindow): Promise<UsageStats> {
    try {
      const key = getTimeWindowKey(timeWindow);
      const data = await redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        return {
          requests: 0,
          tokens: 0,
          cost: 0,
          errors: 0,
          rateLimitHits: 0,
        };
      }

      return {
        requests: parseInt(data.requests || "0", 10),
        tokens: parseInt(data.tokens || "0", 10),
        cost: parseFloat(data.cost || "0") / 1000000,
        errors: parseInt(data.errors || "0", 10),
        rateLimitHits: parseInt(data.rateLimitHits || "0", 10),
      };
    } catch (error) {
      logger.error("Failed to get usage stats", {
        error: error instanceof Error ? error.message : String(error),
        timeWindow,
      });
      return {
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        rateLimitHits: 0,
      };
    }
  }

  /**
   * Get quota estimation based on current usage patterns
   */
  async getQuotaEstimate(): Promise<QuotaEstimate> {
    try {
      const dayStats = await this.getUsageStats("day");
      const hourStats = await this.getUsageStats("hour");

      const currentHour = new Date().getHours();
      const hoursInDay = 24;
      const estimatedDailyRequests =
        currentHour > 0 ? Math.round((hourStats.requests / currentHour) * hoursInDay) : 0;

      const maxRequestsPerDay = this.estimateTier(dayStats.requests, estimatedDailyRequests);

      const remaining = Math.max(0, maxRequestsPerDay - dayStats.requests);
      const quotaRemaining =
        maxRequestsPerDay > 0 ? ((remaining / maxRequestsPerDay) * 100).toFixed(1) : "0.0";

      return {
        maxRequestsPerDay,
        currentRequests: dayStats.requests,
        quotaRemaining: `${quotaRemaining}%`,
        estimatedDailyRequests: Math.max(estimatedDailyRequests, dayStats.requests),
      };
    } catch (error) {
      logger.error("Failed to get quota estimate", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        maxRequestsPerDay: TIER_LIMITS.standard,
        currentRequests: 0,
        quotaRemaining: "100.0%",
        estimatedDailyRequests: 0,
      };
    }
  }

  /**
   * Update time-series data in Redis for all time windows
   */
  private async updateTimeSeriesData(
    data: AnthropicRequestData,
    totalTokens: number,
  ): Promise<void> {
    const windows: TimeWindow[] = ["minute", "hour", "day"];

    await Promise.all(
      windows.map(async (window) => {
        const key = getTimeWindowKey(window);
        const ttl = getTTL(window);

        try {
          await Promise.all([
            redis.hincrby(key, "requests", 1),
            redis.hincrby(key, "tokens", totalTokens),
            redis.hincrby(key, "cost", Math.round(data.cost * 1000000)),
            redis.hincrby(key, "errors", data.success ? 0 : 1),
            redis.expire(key, ttl),
          ]);
        } catch (error) {
          logger.error("Failed to update time-series data", {
            error: error instanceof Error ? error.message : String(error),
            window,
          });
        }
      }),
    );
  }

  /**
   * Estimate tier based on observed traffic
   */
  private estimateTier(currentRequests: number, estimatedDailyRequests: number): number {
    const maxObserved = Math.max(currentRequests, estimatedDailyRequests);
    const buffered = maxObserved * 1.2;

    if (buffered <= TIER_LIMITS.free) {
      return TIER_LIMITS.free;
    } else if (buffered <= TIER_LIMITS.standard) {
      return TIER_LIMITS.standard;
    } else if (buffered <= TIER_LIMITS.pro) {
      return TIER_LIMITS.pro;
    } else {
      return TIER_LIMITS.max;
    }
  }

  /**
   * Get detailed metrics breakdown by model and category
   */
  async getDetailedMetrics(): Promise<{
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    byCategory: Record<string, { requests: number; cost: number }>;
  }> {
    const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byCategory: Record<string, { requests: number; cost: number }> = {};

    try {
      const requestCounters = metricsCollector.getCounterValues("anthropic_requests_total");
      const tokenCounters = metricsCollector.getCounterValues("anthropic_tokens_total");
      const costCounters = metricsCollector.getCounterValues("anthropic_cost_total");

      for (const counter of requestCounters) {
        const model = counter.labels.model;
        if (model) {
          byModel[model] = byModel[model] || { requests: 0, tokens: 0, cost: 0 };
          byModel[model].requests += counter.value;
        }
      }

      for (const counter of tokenCounters) {
        const model = counter.labels.model;
        const type = counter.labels.type;
        if (model && type === "total") {
          byModel[model] = byModel[model] || { requests: 0, tokens: 0, cost: 0 };
          byModel[model].tokens += counter.value;
        }
      }

      for (const counter of costCounters) {
        const model = counter.labels.model;
        const category = counter.labels.category;

        if (model) {
          byModel[model] = byModel[model] || { requests: 0, tokens: 0, cost: 0 };
          byModel[model].cost += counter.value;
        }

        if (category) {
          byCategory[category] = byCategory[category] || { requests: 0, cost: 0 };
          byCategory[category].cost += counter.value;
        }
      }

      for (const counter of requestCounters) {
        const category = counter.labels.category;
        if (category) {
          byCategory[category] = byCategory[category] || { requests: 0, cost: 0 };
          byCategory[category].requests += counter.value;
        }
      }

      return { byModel, byCategory };
    } catch (error) {
      logger.error("Failed to get detailed metrics", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { byModel: {}, byCategory: {} };
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const anthropicMetricsTracker = new AnthropicMetricsTracker();
