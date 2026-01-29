/**
 * Usage Tracking Service
 *
 * Tracks usage metrics per organization for limit enforcement and billing.
 * Uses Redis for fast increments and Postgres for persistence.
 */

import { db as prisma } from "../../db/client";
import { redis } from "../../db/redis";
import { logger } from "../../utils/logger";
import { format } from "date-fns";

export type UsageMetric =
  | "executions"
  | "api_requests"
  | "storage_bytes"
  | "team_members"
  | "agents"
  | "workflows";

export interface UsageRecord {
  organizationId: string;
  metric: UsageMetric;
  value: number;
  period: string; // YYYY-MM
  updatedAt: Date;
}

export interface UsageSummary {
  executions: number;
  api_requests: number;
  storage_bytes: number;
  team_members: number;
  agents: number;
  workflows: number;
}

const REDIS_KEY_PREFIX = "usage:";
const REDIS_TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days (covers month boundary)

/**
 * Get Redis key for usage tracking
 */
function getRedisKey(orgId: string, metric: UsageMetric, period: string): string {
  return `${REDIS_KEY_PREFIX}${orgId}:${metric}:${period}`;
}

/**
 * Get current period (YYYY-MM)
 */
export function getCurrentPeriod(): string {
  return format(new Date(), "yyyy-MM");
}

/**
 * Increment usage counter
 */
export async function increment(
  orgId: string,
  metric: UsageMetric,
  amount: number = 1,
): Promise<number> {
  const period = getCurrentPeriod();
  const redisKey = getRedisKey(orgId, metric, period);

  try {
    // Increment in Redis for fast access
    const newValue = await redis.incrby(redisKey, amount);
    await redis.expire(redisKey, REDIS_TTL_SECONDS);

    // Async update to Postgres (fire and forget for performance)
    persistUsage(orgId, metric, period, newValue).catch((err) => {
      logger.warn("Failed to persist usage to database", {
        organizationId: orgId,
        metric,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return newValue;
  } catch (error) {
    logger.error(
      "Failed to increment usage",
      { organizationId: orgId, metric },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Set absolute usage value (for metrics like storage, team_members, agents)
 */
export async function setValue(
  orgId: string,
  metric: UsageMetric,
  value: number,
): Promise<void> {
  const period = getCurrentPeriod();
  const redisKey = getRedisKey(orgId, metric, period);

  try {
    await redis.set(redisKey, String(value));
    await redis.expire(redisKey, REDIS_TTL_SECONDS);
    await persistUsage(orgId, metric, period, value);
  } catch (error) {
    logger.error(
      "Failed to set usage value",
      { organizationId: orgId, metric, value },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Persist usage to Postgres
 */
async function persistUsage(
  orgId: string,
  metric: UsageMetric,
  period: string,
  value: number,
): Promise<void> {
  await prisma.usageRecord.upsert({
    where: {
      organizationId_metric_period: {
        organizationId: orgId,
        metric,
        period,
      },
    },
    create: {
      organizationId: orgId,
      metric,
      period,
      value,
    },
    update: {
      value,
    },
  });
}

/**
 * Get current usage for a specific metric
 */
export async function getUsage(
  orgId: string,
  metric: UsageMetric,
): Promise<number> {
  const period = getCurrentPeriod();
  const redisKey = getRedisKey(orgId, metric, period);

  try {
    // Try Redis first
    const cachedValue = await redis.get(redisKey);
    if (cachedValue !== null) {
      return parseInt(cachedValue, 10);
    }

    // Fallback to database
    const record = await prisma.usageRecord.findUnique({
      where: {
        organizationId_metric_period: {
          organizationId: orgId,
          metric,
          period,
        },
      },
    });

    const value = record?.value ?? 0;

    // Cache in Redis
    await redis.set(redisKey, String(value));
    await redis.expire(redisKey, REDIS_TTL_SECONDS);

    return value;
  } catch (error) {
    logger.error(
      "Failed to get usage",
      { organizationId: orgId, metric },
      error instanceof Error ? error : new Error(String(error)),
    );
    return 0;
  }
}

/**
 * Get current usage for all metrics
 */
export async function getCurrentUsage(orgId: string): Promise<UsageSummary> {
  const metrics: UsageMetric[] = [
    "executions",
    "api_requests",
    "storage_bytes",
    "team_members",
    "agents",
    "workflows",
  ];

  const results = await Promise.all(
    metrics.map(async (metric) => ({
      metric,
      value: await getUsage(orgId, metric),
    })),
  );

  const summary: UsageSummary = {
    executions: 0,
    api_requests: 0,
    storage_bytes: 0,
    team_members: 0,
    agents: 0,
    workflows: 0,
  };

  for (const result of results) {
    summary[result.metric] = result.value;
  }

  return summary;
}

/**
 * Get usage history for specified months
 */
export async function getHistory(
  orgId: string,
  months: number = 6,
): Promise<UsageRecord[]> {
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const startPeriod = format(startDate, "yyyy-MM");

    const records = await prisma.usageRecord.findMany({
      where: {
        organizationId: orgId,
        period: {
          gte: startPeriod,
        },
      },
      orderBy: [
        { period: "desc" },
        { metric: "asc" },
      ],
    });

    return records.map((r) => ({
      organizationId: r.organizationId,
      metric: r.metric as UsageMetric,
      value: r.value,
      period: r.period,
      updatedAt: r.updatedAt,
    }));
  } catch (error) {
    logger.error(
      "Failed to get usage history",
      { organizationId: orgId, months },
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/**
 * Sync count-based metrics from database
 * Called periodically to ensure accuracy for agents, workflows, team_members
 */
export async function syncCountMetrics(orgId: string): Promise<void> {
  try {
    const [agentCount, workflowCount, memberCount] = await Promise.all([
      prisma.agent.count({
        where: { organizationId: orgId, status: "active" },
      }),
      prisma.workflow.count({
        where: { organizationId: orgId, enabled: true },
      }),
      prisma.membership.count({
        where: { organizationId: orgId },
      }),
    ]);

    await Promise.all([
      setValue(orgId, "agents", agentCount),
      setValue(orgId, "workflows", workflowCount),
      setValue(orgId, "team_members", memberCount),
    ]);

    logger.debug("Synced count metrics", {
      organizationId: orgId,
      agents: agentCount,
      workflows: workflowCount,
      team_members: memberCount,
    });
  } catch (error) {
    logger.error(
      "Failed to sync count metrics",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Reset daily metrics (api_requests)
 * Should be called at midnight UTC
 */
export async function resetDailyMetrics(orgId: string): Promise<void> {
  const period = getCurrentPeriod();
  const redisKey = getRedisKey(orgId, "api_requests", period);

  try {
    await redis.set(redisKey, "0");
    await redis.expire(redisKey, REDIS_TTL_SECONDS);
    logger.debug("Reset daily metrics", { organizationId: orgId });
  } catch (error) {
    logger.error(
      "Failed to reset daily metrics",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Get usage percentage (current/limit)
 */
export async function getUsagePercentage(
  orgId: string,
  metric: UsageMetric,
  limit: number,
): Promise<number> {
  if (limit === -1) {
    return 0; // Unlimited
  }

  const current = await getUsage(orgId, metric);
  return Math.min((current / limit) * 100, 100);
}
