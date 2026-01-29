import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { Category } from "../orchestrator/types";

export interface UsageRecord {
  organizationId: string;
  userId: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  category: Category;
}

export interface UsageSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  byModel: Record<string, { cost: number; requests: number }>;
  byCategory: Record<string, { cost: number; requests: number }>;
}

const DAILY_USAGE_KEY_PREFIX = "usage:daily:";
const MONTHLY_USAGE_KEY_PREFIX = "usage:monthly:";

function getDailyKey(organizationId: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `${DAILY_USAGE_KEY_PREFIX}${organizationId}:${today}`;
}

function getMonthlyKey(organizationId: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${MONTHLY_USAGE_KEY_PREFIX}${organizationId}:${month}`;
}

export async function trackUsage(record: UsageRecord): Promise<void> {
  try {
    const dailyKey = getDailyKey(record.organizationId);
    const monthlyKey = getMonthlyKey(record.organizationId);

    const usageData = JSON.stringify({
      ...record,
      timestamp: new Date().toISOString(),
    });

    await Promise.all([
      redis.lpush(dailyKey, usageData),
      redis.expire(dailyKey, 86400 * 7),
      redis.hincrby(monthlyKey, "totalCost", Math.round(record.cost * 1000000)),
      redis.hincrby(monthlyKey, "totalInputTokens", record.inputTokens),
      redis.hincrby(monthlyKey, "totalOutputTokens", record.outputTokens),
      redis.hincrby(monthlyKey, "requestCount", 1),
      redis.hincrby(monthlyKey, `model:${record.model}:cost`, Math.round(record.cost * 1000000)),
      redis.hincrby(monthlyKey, `model:${record.model}:requests`, 1),
      redis.hincrby(
        monthlyKey,
        `category:${record.category}:cost`,
        Math.round(record.cost * 1000000),
      ),
      redis.hincrby(monthlyKey, `category:${record.category}:requests`, 1),
      redis.expire(monthlyKey, 86400 * 45),
    ]);

    logger.debug("Usage tracked", {
      organizationId: record.organizationId,
      model: record.model,
      cost: record.cost,
    });
  } catch (error) {
    logger.error("Failed to track usage", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: record.organizationId,
    });
  }
}

export async function getDailyUsage(organizationId: string): Promise<UsageRecord[]> {
  const key = getDailyKey(organizationId);
  const records = await redis.lrange(key, 0, -1);
  return records.map((r: string) => JSON.parse(r));
}

export async function getMonthlyUsageSummary(organizationId: string): Promise<UsageSummary> {
  const key = getMonthlyKey(organizationId);
  const data = await redis.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    return {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      requestCount: 0,
      byModel: {},
      byCategory: {},
    };
  }

  const byModel: Record<string, { cost: number; requests: number }> = {};
  const byCategory: Record<string, { cost: number; requests: number }> = {};

  for (const [k, v] of Object.entries(data)) {
    const value = String(v);
    if (k.startsWith("model:") && k.endsWith(":cost")) {
      const model = k.replace("model:", "").replace(":cost", "");
      byModel[model] = byModel[model] || { cost: 0, requests: 0 };
      byModel[model].cost = parseInt(value, 10) / 1000000;
    } else if (k.startsWith("model:") && k.endsWith(":requests")) {
      const model = k.replace("model:", "").replace(":requests", "");
      byModel[model] = byModel[model] || { cost: 0, requests: 0 };
      byModel[model].requests = parseInt(value, 10);
    } else if (k.startsWith("category:") && k.endsWith(":cost")) {
      const category = k.replace("category:", "").replace(":cost", "");
      byCategory[category] = byCategory[category] || { cost: 0, requests: 0 };
      byCategory[category].cost = parseInt(value, 10) / 1000000;
    } else if (k.startsWith("category:") && k.endsWith(":requests")) {
      const category = k.replace("category:", "").replace(":requests", "");
      byCategory[category] = byCategory[category] || { cost: 0, requests: 0 };
      byCategory[category].requests = parseInt(value, 10);
    }
  }

  return {
    totalCost: parseInt(data.totalCost || "0", 10) / 1000000,
    totalInputTokens: parseInt(data.totalInputTokens || "0", 10),
    totalOutputTokens: parseInt(data.totalOutputTokens || "0", 10),
    requestCount: parseInt(data.requestCount || "0", 10),
    byModel,
    byCategory,
  };
}

export async function checkBudgetLimit(
  organizationId: string,
  budgetLimit: number,
): Promise<{ withinBudget: boolean; currentUsage: number; remaining: number }> {
  const summary = await getMonthlyUsageSummary(organizationId);
  const remaining = budgetLimit - summary.totalCost;

  return {
    withinBudget: summary.totalCost < budgetLimit,
    currentUsage: summary.totalCost,
    remaining: Math.max(0, remaining),
  };
}

export async function getOrganizationBudget(organizationId: string): Promise<number | null> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    if (!org?.settings || typeof org.settings !== "object") {
      return null;
    }

    const settings = org.settings as Record<string, unknown>;
    return typeof settings.monthlyBudget === "number" ? settings.monthlyBudget : null;
  } catch {
    return null;
  }
}

// Additional types for costs API
export interface BudgetStatus {
  withinBudget: boolean;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  warningThreshold: boolean;
  criticalThreshold: boolean;
}

export interface OrgCostSummary {
  organizationId: string;
  period: string;
  totalCostCents: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { costCents: number; requests: number }>;
  byAgent: Record<string, { costCents: number; requests: number }>;
  byDay: DailyTrend[];
}

export interface AgentCostSummary {
  agentId: string;
  agentName: string;
  totalCostCents: number;
  totalRequests: number;
  avgCostPerRequest: number;
  byModel: Record<string, { costCents: number; requests: number }>;
}

export interface DailyTrend {
  date: string;
  costCents: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export async function getOrgCosts(organizationId: string, period: string): Promise<OrgCostSummary> {
  const summary = await getMonthlyUsageSummary(organizationId);

  return {
    organizationId,
    period,
    totalCostCents: Math.round(summary.totalCost * 100),
    totalRequests: summary.requestCount,
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    byModel: Object.fromEntries(
      Object.entries(summary.byModel).map(([k, v]) => [k, { costCents: Math.round(v.cost * 100), requests: v.requests }])
    ),
    byAgent: {},
    byDay: [],
  };
}

export async function getAgentCosts(_organizationId: string, agentId: string): Promise<AgentCostSummary> {
  // For now return a placeholder - would need agent-specific tracking
  return {
    agentId,
    agentName: agentId,
    totalCostCents: 0,
    totalRequests: 0,
    avgCostPerRequest: 0,
    byModel: {},
  };
}

export async function getDailyTrend(_organizationId: string, days: number): Promise<DailyTrend[]> {
  const trends: DailyTrend[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    trends.push({
      date: dateStr,
      costCents: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  }

  return trends.reverse();
}

export async function checkBudget(organizationId: string): Promise<BudgetStatus> {
  const budget = await getOrganizationBudget(organizationId);
  const summary = await getMonthlyUsageSummary(organizationId);

  const budgetCents = budget ? Math.round(budget * 100) : 0;
  const spentCents = Math.round(summary.totalCost * 100);
  const remainingCents = Math.max(0, budgetCents - spentCents);
  const percentUsed = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0;

  return {
    withinBudget: budgetCents === 0 || spentCents < budgetCents,
    budgetCents,
    spentCents,
    remainingCents,
    percentUsed,
    warningThreshold: percentUsed >= 80,
    criticalThreshold: percentUsed >= 95,
  };
}

export async function setBudget(organizationId: string, budgetCents: number): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        monthlyBudget: budgetCents / 100,
      },
    },
  });
}
