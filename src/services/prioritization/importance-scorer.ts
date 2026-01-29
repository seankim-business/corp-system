/**
 * Importance Scorer Service
 * Calculates importance scores (0-100) based on impact factors:
 * - Stakeholder count (RABSIC fields)
 * - Project association
 * - Task keywords
 * - Explicit importance ratings
 */

import { logger } from "../../utils/logger";

export interface ImportanceScoreResult {
  score: number; // 0-100
  tier: ImportanceTier;
  factors: ImportanceFactor[];
  reasoning: string;
}

export type ImportanceTier = "critical" | "high" | "medium" | "low" | "minimal";

export interface ImportanceFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
}

interface TaskImportanceInput {
  id: string;
  name: string;
  description?: string | null;
  importanceScore?: number | null; // Explicit 0-10 rating
  projectId?: string | null;
  responsible?: string[];
  accountable?: string[];
  backup?: string[];
  support?: string[];
  informed?: string[];
  consulted?: string[];
}

interface ImportanceConfig {
  weights: {
    explicitRating: number;
    stakeholderCount: number;
    projectAssociation: number;
    keywordBoost: number;
  };
  keywordPatterns: {
    critical: RegExp;
    high: RegExp;
    medium: RegExp;
    low: RegExp;
  };
}

const DEFAULT_CONFIG: ImportanceConfig = {
  weights: {
    explicitRating: 0.4, // Highest weight for explicit user ratings
    stakeholderCount: 0.25,
    projectAssociation: 0.15,
    keywordBoost: 0.2,
  },
  keywordPatterns: {
    critical: /\b(critical|urgent|emergency|blocker|blocking|asap|immediately|showstopper)\b/i,
    high: /\b(important|priority|high-priority|key|essential|must|required|deadline)\b/i,
    medium: /\b(should|needed|helpful|improvement|enhance|update)\b/i,
    low: /\b(nice-to-have|optional|maybe|consider|explore|idea|backlog)\b/i,
  },
};

export function calculateImportanceScore(
  task: TaskImportanceInput,
  config: Partial<ImportanceConfig> = {},
): ImportanceScoreResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const factors: ImportanceFactor[] = [];

  // Factor 1: Explicit importance rating (if provided)
  const explicitRating = task.importanceScore ?? 5; // Default to middle
  const explicitScore = (explicitRating / 10) * 100;
  factors.push({
    name: "Explicit Rating",
    weight: cfg.weights.explicitRating,
    value: explicitRating,
    contribution: explicitScore * cfg.weights.explicitRating,
  });

  // Factor 2: Stakeholder count from RABSIC fields
  const stakeholderCount = countStakeholders(task);
  const stakeholderScore = calculateStakeholderScore(stakeholderCount);
  factors.push({
    name: "Stakeholder Count",
    weight: cfg.weights.stakeholderCount,
    value: stakeholderCount,
    contribution: stakeholderScore * cfg.weights.stakeholderCount,
  });

  // Factor 3: Project association
  const projectScore = task.projectId ? 80 : 40; // Project tasks often more important
  factors.push({
    name: "Project Association",
    weight: cfg.weights.projectAssociation,
    value: task.projectId ? 1 : 0,
    contribution: projectScore * cfg.weights.projectAssociation,
  });

  // Factor 4: Keyword analysis
  const keywordScore = analyzeKeywords(task.name, task.description, cfg.keywordPatterns);
  factors.push({
    name: "Keyword Analysis",
    weight: cfg.weights.keywordBoost,
    value: keywordScore,
    contribution: keywordScore * cfg.weights.keywordBoost,
  });

  // Calculate total score
  const totalScore = Math.min(
    100,
    Math.max(0, factors.reduce((sum, f) => sum + f.contribution, 0)),
  );

  const tier = determineImportanceTier(totalScore);
  const reasoning = generateReasoning(factors, tier);

  return {
    score: Math.round(totalScore),
    tier,
    factors,
    reasoning,
  };
}

function countStakeholders(task: TaskImportanceInput): number {
  const uniqueStakeholders = new Set<string>();

  const addStakeholders = (arr?: string[]) => {
    if (arr) {
      arr.forEach((s) => uniqueStakeholders.add(s));
    }
  };

  addStakeholders(task.responsible);
  addStakeholders(task.accountable);
  addStakeholders(task.backup);
  addStakeholders(task.support);
  addStakeholders(task.informed);
  addStakeholders(task.consulted);

  return uniqueStakeholders.size;
}

function calculateStakeholderScore(count: number): number {
  // Diminishing returns for stakeholder count
  // 0 stakeholders = 20 (minimal)
  // 1-2 stakeholders = 40-60
  // 3-5 stakeholders = 70-85
  // 6+ stakeholders = 90-100
  if (count === 0) return 20;
  if (count <= 2) return 40 + count * 10;
  if (count <= 5) return 60 + (count - 2) * 8;
  return Math.min(100, 84 + (count - 5) * 3);
}

function analyzeKeywords(
  name: string,
  description: string | null | undefined,
  patterns: ImportanceConfig["keywordPatterns"],
): number {
  const text = `${name} ${description || ""}`;

  if (patterns.critical.test(text)) return 100;
  if (patterns.high.test(text)) return 75;
  if (patterns.medium.test(text)) return 50;
  if (patterns.low.test(text)) return 25;

  return 50; // Neutral if no keywords detected
}

function determineImportanceTier(score: number): ImportanceTier {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "minimal";
}

function generateReasoning(factors: ImportanceFactor[], tier: ImportanceTier): string {
  const topFactor = factors.reduce((a, b) => (a.contribution > b.contribution ? a : b));
  const tierDescriptions: Record<ImportanceTier, string> = {
    critical: "Critical importance - immediate attention required",
    high: "High importance - should be prioritized",
    medium: "Medium importance - schedule appropriately",
    low: "Low importance - can be deferred if needed",
    minimal: "Minimal importance - consider if still needed",
  };

  return `${tierDescriptions[tier]}. Primary factor: ${topFactor.name}`;
}

export function calculateBatchImportanceScores(
  tasks: TaskImportanceInput[],
): Map<string, ImportanceScoreResult> {
  const results = new Map<string, ImportanceScoreResult>();

  for (const task of tasks) {
    results.set(task.id, calculateImportanceScore(task));
  }

  logger.debug("Batch importance scores calculated", {
    taskCount: tasks.length,
    criticalCount: [...results.values()].filter((r) => r.tier === "critical").length,
    highCount: [...results.values()].filter((r) => r.tier === "high").length,
  });

  return results;
}
