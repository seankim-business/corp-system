import express, { Request, Response } from "express";
import { anthropicMetricsTracker } from "../services/anthropic-metrics";
import { logger } from "../utils/logger";

const router = express.Router();

/**
 * GET /api/health/anthropic
 * Returns current Claude API usage metrics
 */
router.get("/anthropic", async (_req: Request, res: Response) => {
  try {
    const [minuteStats, hourStats, dayStats, quota, detailed] = await Promise.all([
      anthropicMetricsTracker.getUsageStats("minute"),
      anthropicMetricsTracker.getUsageStats("hour"),
      anthropicMetricsTracker.getUsageStats("day"),
      anthropicMetricsTracker.getQuotaEstimate(),
      anthropicMetricsTracker.getDetailedMetrics(),
    ]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      current_usage: {
        last_minute: {
          requests: minuteStats.requests,
          tokens: minuteStats.tokens,
          cost: parseFloat(minuteStats.cost.toFixed(4)),
          errors: minuteStats.errors,
          rate_limit_hits: minuteStats.rateLimitHits,
        },
        last_hour: {
          requests: hourStats.requests,
          tokens: hourStats.tokens,
          cost: parseFloat(hourStats.cost.toFixed(4)),
          errors: hourStats.errors,
          rate_limit_hits: hourStats.rateLimitHits,
        },
        today: {
          requests: dayStats.requests,
          tokens: dayStats.tokens,
          cost: parseFloat(dayStats.cost.toFixed(4)),
          errors: dayStats.errors,
          rate_limit_hits: dayStats.rateLimitHits,
        },
      },
      quota: {
        max_requests_per_day: quota.maxRequestsPerDay,
        current_requests: quota.currentRequests,
        quota_remaining: quota.quotaRemaining,
        estimated_daily_requests: quota.estimatedDailyRequests,
      },
      breakdown: {
        by_model: detailed.byModel,
        by_category: detailed.byCategory,
      },
      warnings: generateWarnings(dayStats, quota),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to fetch Anthropic health metrics", { error: message });

    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Generate warnings based on usage patterns
 */
function generateWarnings(
  dayStats: { requests: number; rateLimitHits: number; errors: number },
  quota: { quotaRemaining: string; estimatedDailyRequests: number; maxRequestsPerDay: number },
): string[] {
  const warnings: string[] = [];

  // Check quota remaining
  const quotaPercent = parseFloat(quota.quotaRemaining.replace("%", ""));
  if (quotaPercent < 20) {
    warnings.push(`Low quota remaining: ${quota.quotaRemaining}`);
  }

  // Check rate limit hits
  if (dayStats.rateLimitHits > 0) {
    warnings.push(`Rate limit hit ${dayStats.rateLimitHits} times today`);
  }

  // Check error rate
  const errorRate = dayStats.requests > 0 ? (dayStats.errors / dayStats.requests) * 100 : 0;
  if (errorRate > 5) {
    warnings.push(`High error rate: ${errorRate.toFixed(1)}%`);
  }

  // Check if approaching limits
  if (quota.estimatedDailyRequests > quota.maxRequestsPerDay * 0.8) {
    warnings.push(
      `Estimated daily requests (${quota.estimatedDailyRequests}) approaching limit (${quota.maxRequestsPerDay})`,
    );
  }

  return warnings;
}

export default router;
