import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { Category } from "../orchestrator/types";
import { recordBudgetRemainingCents, recordBudgetSpendCents } from "./metrics";

export const OPUS_COST_PER_1K_TOKENS = { input: 15, output: 75 };
export const SONNET_COST_PER_1K_TOKENS = { input: 3, output: 15 };
export const HAIKU_COST_PER_1K_TOKENS = { input: 0.25, output: 1.25 };

type ModelTier = "opus" | "sonnet" | "haiku";

const CATEGORY_MODEL_TIER: Record<Category, ModelTier> = {
  ultrabrain: "opus",
  "visual-engineering": "sonnet",
  writing: "sonnet",
  artistry: "sonnet",
  "unspecified-high": "sonnet",
  quick: "haiku",
  "unspecified-low": "haiku",
};

// Decision: keep estimation lightweight (no tiktoken dependency) using category averages.
const CATEGORY_TOKEN_ESTIMATES: Record<Category, { input: number; output: number }> = {
  ultrabrain: { input: 5000, output: 3000 },
  "visual-engineering": { input: 3000, output: 2000 },
  quick: { input: 500, output: 300 },
  writing: { input: 2000, output: 1500 },
  artistry: { input: 3000, output: 2500 },
  // Conservative defaults for unspecified categories.
  "unspecified-low": { input: 500, output: 300 },
  "unspecified-high": { input: 3000, output: 2000 },
};

const EXHAUSTED_BUDGET_THRESHOLD_CENTS = 10;

function getCostPer1KTokens(tier: ModelTier): { input: number; output: number } {
  if (tier === "opus") return OPUS_COST_PER_1K_TOKENS;
  if (tier === "haiku") return HAIKU_COST_PER_1K_TOKENS;
  return SONNET_COST_PER_1K_TOKENS;
}

function resolveModelTier(model: string): ModelTier {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("haiku")) return "haiku";
  return "sonnet";
}

function startOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function estimateCostForCategory(
  category: Category,
  estimatedInputTokens?: number,
  estimatedOutputTokens?: number,
): number {
  const defaults = CATEGORY_TOKEN_ESTIMATES[category];
  const inputTokens = estimatedInputTokens ?? defaults.input;
  const outputTokens = estimatedOutputTokens ?? defaults.output;
  const tier = CATEGORY_MODEL_TIER[category];
  const costs = getCostPer1KTokens(tier);

  const cost = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
  // Round up estimates to avoid underestimating budget impact.
  return Math.ceil(cost);
}

export function calculateActualCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const tier = resolveModelTier(model);
  const costs = getCostPer1KTokens(tier);
  const cost = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
  return Math.round(cost);
}

export async function getBudgetRemaining(organizationId: string): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      monthlyBudgetCents: true,
      currentMonthSpendCents: true,
      budgetResetAt: true,
    },
  });

  if (!org) {
    logger.warn("Budget lookup failed: organization not found", { organizationId });
    return 0;
  }

  if (org.monthlyBudgetCents == null) {
    recordBudgetSpendCents(organizationId, org.currentMonthSpendCents);
    return Number.POSITIVE_INFINITY;
  }

  const remaining = Math.max(0, org.monthlyBudgetCents - org.currentMonthSpendCents);
  recordBudgetRemainingCents(organizationId, remaining);
  recordBudgetSpendCents(organizationId, org.currentMonthSpendCents);
  return remaining;
}

export async function checkBudgetSufficient(
  organizationId: string,
  estimatedCostCents: number,
): Promise<boolean> {
  const remaining = await getBudgetRemaining(organizationId);
  if (!Number.isFinite(remaining)) {
    return true;
  }
  return remaining >= estimatedCostCents;
}

export async function reserveBudget(
  organizationId: string,
  estimatedCostCents: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!Number.isFinite(estimatedCostCents) || estimatedCostCents <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      monthlyBudgetCents: true,
      currentMonthSpendCents: true,
      budgetResetAt: true,
    },
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  if (org.monthlyBudgetCents == null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  const currentRemaining = org.monthlyBudgetCents - org.currentMonthSpendCents;
  if (currentRemaining < estimatedCostCents) {
    recordBudgetRemainingCents(organizationId, Math.max(0, currentRemaining));
    return { allowed: false, remaining: Math.max(0, currentRemaining) };
  }

  const resetAt = org.budgetResetAt ?? startOfMonth();
  const updated = await prisma.organization.updateMany({
    where: {
      id: organizationId,
      currentMonthSpendCents: org.currentMonthSpendCents,
    },
    data: {
      currentMonthSpendCents: { increment: Math.round(estimatedCostCents) },
      budgetResetAt: resetAt,
    },
  });

  if (updated.count === 0) {
    return reserveBudget(organizationId, estimatedCostCents);
  }

  const newRemaining = currentRemaining - estimatedCostCents;
  recordBudgetRemainingCents(organizationId, Math.max(0, newRemaining));
  return { allowed: true, remaining: Math.max(0, newRemaining) };
}

export async function refundBudget(organizationId: string, refundCents: number): Promise<void> {
  if (!Number.isFinite(refundCents) || refundCents <= 0) {
    return;
  }

  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        currentMonthSpendCents: { decrement: Math.round(refundCents) },
      },
    });
  } catch (error) {
    logger.error("Failed to refund budget", {
      organizationId,
      refundCents,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateSpend(organizationId: string, actualCostCents: number): Promise<void> {
  if (!Number.isFinite(actualCostCents) || actualCostCents <= 0) {
    return;
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { budgetResetAt: true },
    });

    const resetAt = org?.budgetResetAt ?? startOfMonth();

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        currentMonthSpendCents: { increment: Math.round(actualCostCents) },
        budgetResetAt: resetAt,
      },
    });
  } catch (error) {
    logger.error("Failed to update organization spend", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function resetMonthlyBudgets(): Promise<void> {
  // NOTE: Manual-only reset. Do not schedule automatically without explicit org consent.
  const resetAt = startOfMonth();

  await prisma.organization.updateMany({
    where: {
      monthlyBudgetCents: { not: null },
      OR: [{ budgetResetAt: null }, { budgetResetAt: { lt: resetAt } }],
    },
    data: {
      currentMonthSpendCents: 0,
      budgetResetAt: resetAt,
    },
  });
}

export function isBudgetExhausted(remainingCents: number): boolean {
  if (!Number.isFinite(remainingCents)) {
    return false;
  }
  return remainingCents < EXHAUSTED_BUDGET_THRESHOLD_CENTS;
}
