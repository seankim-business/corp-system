/**
 * Urgency Scorer Service
 * Calculates urgency scores (0-100) based on deadline proximity.
 */

import { logger } from "../../utils/logger";

export interface UrgencyScoreResult {
  score: number; // 0-100
  tier: UrgencyTier;
  daysUntilDue: number | null;
  reasoning: string;
}

export type UrgencyTier =
  | "overdue"
  | "critical" // Due today
  | "high" // Due within 3 days
  | "medium" // Due within 7 days
  | "low" // Due within 14 days
  | "minimal" // Due within 30 days
  | "none" // No due date or > 30 days
  | "distant"; // > 30 days

interface UrgencyConfig {
  overdueScore: number;
  criticalScore: number;
  highScore: number;
  mediumScore: number;
  lowScore: number;
  minimalScore: number;
  distantScore: number;
  noDueDateScore: number;
}

const DEFAULT_CONFIG: UrgencyConfig = {
  overdueScore: 100,
  criticalScore: 95,
  highScore: 80,
  mediumScore: 60,
  lowScore: 40,
  minimalScore: 20,
  distantScore: 10,
  noDueDateScore: 30, // Baseline for tasks without due dates
};

export function calculateUrgencyScore(
  dueDate: Date | null | undefined,
  currentTime: Date = new Date(),
  config: Partial<UrgencyConfig> = {},
): UrgencyScoreResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!dueDate) {
    return {
      score: cfg.noDueDateScore,
      tier: "none",
      daysUntilDue: null,
      reasoning: "No due date set - using baseline urgency",
    };
  }

  const diffMs = dueDate.getTime() - currentTime.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const daysUntilDue = Math.round(diffDays * 10) / 10;

  // Overdue
  if (diffDays < 0) {
    const daysOverdue = Math.abs(Math.floor(diffDays));
    return {
      score: cfg.overdueScore,
      tier: "overdue",
      daysUntilDue,
      reasoning: `Overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} - requires immediate attention`,
    };
  }

  // Due today (within 24 hours)
  if (diffDays <= 1) {
    const hoursLeft = Math.floor(diffDays * 24);
    return {
      score: cfg.criticalScore,
      tier: "critical",
      daysUntilDue,
      reasoning:
        hoursLeft <= 0
          ? "Due within the hour - critical urgency"
          : `Due in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""} - critical urgency`,
    };
  }

  // Due within 3 days
  if (diffDays <= 3) {
    return {
      score: cfg.highScore,
      tier: "high",
      daysUntilDue,
      reasoning: `Due in ${Math.ceil(diffDays)} days - high urgency`,
    };
  }

  // Due within 7 days
  if (diffDays <= 7) {
    return {
      score: cfg.mediumScore,
      tier: "medium",
      daysUntilDue,
      reasoning: `Due in ${Math.ceil(diffDays)} days - medium urgency`,
    };
  }

  // Due within 14 days
  if (diffDays <= 14) {
    return {
      score: cfg.lowScore,
      tier: "low",
      daysUntilDue,
      reasoning: `Due in ${Math.ceil(diffDays)} days - low urgency`,
    };
  }

  // Due within 30 days
  if (diffDays <= 30) {
    return {
      score: cfg.minimalScore,
      tier: "minimal",
      daysUntilDue,
      reasoning: `Due in ${Math.ceil(diffDays)} days - minimal urgency`,
    };
  }

  // More than 30 days away
  return {
    score: cfg.distantScore,
    tier: "distant",
    daysUntilDue,
    reasoning: `Due in ${Math.ceil(diffDays)} days - distant deadline`,
  };
}

export function calculateBatchUrgencyScores(
  tasks: Array<{ id: string; dueDate: Date | null | undefined }>,
  currentTime: Date = new Date(),
): Map<string, UrgencyScoreResult> {
  const results = new Map<string, UrgencyScoreResult>();

  for (const task of tasks) {
    results.set(task.id, calculateUrgencyScore(task.dueDate, currentTime));
  }

  logger.debug("Batch urgency scores calculated", {
    taskCount: tasks.length,
    overdueCount: [...results.values()].filter((r) => r.tier === "overdue").length,
    criticalCount: [...results.values()].filter((r) => r.tier === "critical").length,
  });

  return results;
}

export function getUrgencyTierThreshold(tier: UrgencyTier): number {
  const thresholds: Record<UrgencyTier, number> = {
    overdue: 0,
    critical: 1,
    high: 3,
    medium: 7,
    low: 14,
    minimal: 30,
    distant: Infinity,
    none: Infinity,
  };
  return thresholds[tier];
}
