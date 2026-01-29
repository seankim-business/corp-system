/**
 * Recommendation Engine Service
 * Generates AI-powered recommendations for "work on this next" decisions.
 * Maps scores to actionable recommendations with human-readable reasoning.
 */

import { logger } from "../../utils/logger";
import {
  TaskPriority,
  Recommendation,
  getPrioritizedTasks,
  suggestNextTask,
} from "./priority-calculator";

export interface TaskRecommendation {
  taskId: string;
  taskName: string;
  action: Recommendation;
  reasoning: string;
  confidence: number; // 0-1
  alternativeActions: AlternativeAction[];
  contextFactors: ContextFactor[];
}

export interface AlternativeAction {
  action: Recommendation;
  reasoning: string;
  whenAppropriate: string;
}

export interface ContextFactor {
  name: string;
  impact: "positive" | "negative" | "neutral";
  description: string;
}

export interface PrioritizedTaskList {
  mustDo: TaskPriority[]; // Do today
  shouldDo: TaskPriority[]; // Try to do today
  canDefer: TaskPriority[]; // Can wait
}

export interface FocusRecommendation {
  task: {
    id: string;
    name: string;
  };
  reasoning: string;
  estimatedTime: number; // minutes
  nextSteps: string[];
}

interface RecommendationConfig {
  mustDoThreshold: number;
  shouldDoThreshold: number;
  maxMustDoTasks: number;
  maxShouldDoTasks: number;
  defaultEstimatedTime: number;
}

const DEFAULT_CONFIG: RecommendationConfig = {
  mustDoThreshold: 75,
  shouldDoThreshold: 50,
  maxMustDoTasks: 3,
  maxShouldDoTasks: 5,
  defaultEstimatedTime: 30,
};

export function generateRecommendation(priority: TaskPriority): TaskRecommendation {
  const contextFactors = analyzeContextFactors(priority);
  const confidence = calculateConfidence(priority, contextFactors);
  const alternativeActions = generateAlternatives(priority);

  return {
    taskId: priority.taskId,
    taskName: priority.taskName,
    action: priority.recommendation,
    reasoning: generateDetailedReasoning(priority, contextFactors),
    confidence,
    alternativeActions,
    contextFactors,
  };
}

function analyzeContextFactors(priority: TaskPriority): ContextFactor[] {
  const factors: ContextFactor[] = [];

  // Urgency factors
  if (priority.urgencyDetails.tier === "overdue") {
    factors.push({
      name: "Overdue",
      impact: "negative",
      description: `Task is ${Math.abs(Math.floor(priority.urgencyDetails.daysUntilDue!))} days past due`,
    });
  } else if (priority.urgencyDetails.tier === "critical") {
    factors.push({
      name: "Due Today",
      impact: "negative",
      description: "Task must be completed today",
    });
  } else if (priority.urgencyDetails.daysUntilDue && priority.urgencyDetails.daysUntilDue > 14) {
    factors.push({
      name: "Flexible Timeline",
      impact: "positive",
      description: `${Math.ceil(priority.urgencyDetails.daysUntilDue)} days until deadline`,
    });
  }

  // Dependency factors
  if (priority.dependencyDetails.dependents.length > 0) {
    factors.push({
      name: "Blocking Work",
      impact: "negative",
      description: `Blocking ${priority.dependencyDetails.dependents.length} other task(s)`,
    });
  }

  if (priority.dependencyDetails.blockers.length > 0) {
    factors.push({
      name: "Has Blockers",
      impact: "negative",
      description: `Waiting on ${priority.dependencyDetails.blockers.length} task(s)`,
    });
  }

  if (priority.dependencyDetails.criticalPathPosition === "critical") {
    factors.push({
      name: "Critical Path",
      impact: "negative",
      description: "On the critical path - delays cascade",
    });
  }

  // Importance factors
  if (priority.importanceDetails.tier === "critical") {
    factors.push({
      name: "High Impact",
      impact: "positive",
      description: "High business impact task",
    });
  }

  // Pattern factors
  if (priority.patternDetails.score >= 70) {
    factors.push({
      name: "Good Timing",
      impact: "positive",
      description: "Aligns with your productive hours",
    });
  } else if (priority.patternDetails.score < 40) {
    factors.push({
      name: "Off-Peak Hours",
      impact: "neutral",
      description: "Outside typical productive hours",
    });
  }

  return factors;
}

function calculateConfidence(priority: TaskPriority, factors: ContextFactor[]): number {
  // Base confidence from score clarity
  let confidence = 0.5;

  // High scores are more confident
  if (priority.overallScore >= 80 || priority.overallScore <= 20) {
    confidence += 0.2;
  }

  // Clear urgency signals increase confidence
  if (priority.urgencyDetails.tier === "overdue" || priority.urgencyDetails.tier === "critical") {
    confidence += 0.15;
  }

  // Dependency clarity
  if (
    priority.dependencyDetails.criticalPathPosition === "critical" ||
    priority.dependencyDetails.criticalPathPosition === "root"
  ) {
    confidence += 0.1;
  }

  // More context factors = more confident analysis
  confidence += Math.min(0.15, factors.length * 0.03);

  return Math.min(1, confidence);
}

function generateAlternatives(priority: TaskPriority): AlternativeAction[] {
  const alternatives: AlternativeAction[] = [];
  const currentAction = priority.recommendation;

  if (currentAction !== "do_now") {
    alternatives.push({
      action: "do_now",
      reasoning: "Start immediately if other priorities are handled",
      whenAppropriate: "If you have cleared your urgent tasks",
    });
  }

  if (currentAction !== "schedule") {
    alternatives.push({
      action: "schedule",
      reasoning: "Block dedicated time for focused work",
      whenAppropriate: "If you need uninterrupted time to complete this",
    });
  }

  if (currentAction !== "delegate" && priority.importanceDetails.tier !== "critical") {
    alternatives.push({
      action: "delegate",
      reasoning: "Consider if someone else could handle this",
      whenAppropriate:
        "If you're overloaded or someone else has better context",
    });
  }

  if (currentAction !== "defer" && priority.urgencyDetails.tier !== "overdue") {
    alternatives.push({
      action: "defer",
      reasoning: "Postpone if higher priorities emerge",
      whenAppropriate: "If more urgent tasks need attention first",
    });
  }

  return alternatives;
}

function generateDetailedReasoning(priority: TaskPriority, factors: ContextFactor[]): string {
  const parts: string[] = [];

  // Action phrase
  const actionPhrases: Record<Recommendation, string> = {
    do_now: "This task needs your immediate attention",
    schedule: "Schedule time to work on this task",
    delegate: "Consider delegating this task",
    defer: "This task can be safely deferred",
  };
  parts.push(actionPhrases[priority.recommendation]);

  // Key factors
  const negativeFactors = factors.filter((f) => f.impact === "negative");
  const positiveFactors = factors.filter((f) => f.impact === "positive");

  if (negativeFactors.length > 0) {
    const topNegative = negativeFactors[0];
    parts.push(topNegative.description);
  }

  if (positiveFactors.length > 0 && priority.recommendation === "do_now") {
    const topPositive = positiveFactors[0];
    parts.push(topPositive.description);
  }

  // Score context
  if (priority.overallScore >= 80) {
    parts.push("High priority based on all factors");
  } else if (priority.overallScore <= 30) {
    parts.push("Lower priority compared to other tasks");
  }

  return parts.join(". ") + ".";
}

export async function getPrioritizedTaskList(
  userId: string,
  organizationId: string,
  config: Partial<RecommendationConfig> = {},
): Promise<PrioritizedTaskList> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const allPriorities = await getPrioritizedTasks(userId, organizationId);

  const mustDo = allPriorities
    .filter(
      (p) =>
        p.overallScore >= cfg.mustDoThreshold ||
        p.recommendation === "do_now" ||
        p.urgencyDetails.tier === "overdue" ||
        p.urgencyDetails.tier === "critical",
    )
    .slice(0, cfg.maxMustDoTasks);

  const shouldDo = allPriorities
    .filter(
      (p) =>
        p.overallScore >= cfg.shouldDoThreshold &&
        p.overallScore < cfg.mustDoThreshold &&
        p.recommendation !== "defer" &&
        !mustDo.some((m) => m.taskId === p.taskId),
    )
    .slice(0, cfg.maxShouldDoTasks);

  const canDefer = allPriorities.filter(
    (p) =>
      !mustDo.some((m) => m.taskId === p.taskId) &&
      !shouldDo.some((s) => s.taskId === p.taskId),
  );

  logger.info("Prioritized task list generated", {
    userId,
    organizationId,
    mustDoCount: mustDo.length,
    shouldDoCount: shouldDo.length,
    canDeferCount: canDefer.length,
  });

  return { mustDo, shouldDo, canDefer };
}

export async function getFocusRecommendation(
  userId: string,
  organizationId: string,
  config: Partial<RecommendationConfig> = {},
): Promise<FocusRecommendation | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const nextTask = await suggestNextTask(userId, organizationId);

  if (!nextTask) {
    return null;
  }

  const { task, priority, reasoning } = nextTask;

  const nextSteps = generateNextSteps(priority);

  return {
    task: {
      id: task.id,
      name: task.name,
    },
    reasoning,
    estimatedTime: estimateTaskTime(priority, cfg.defaultEstimatedTime),
    nextSteps,
  };
}

function estimateTaskTime(priority: TaskPriority, defaultTime: number): number {
  // Adjust based on complexity signals
  let estimate = defaultTime;

  // More dependents suggests larger task
  if (priority.dependencyDetails.dependents.length > 2) {
    estimate += 15;
  }

  // Critical importance tasks often take longer
  if (priority.importanceDetails.tier === "critical") {
    estimate += 15;
  }

  // Overdue tasks might have accumulated complexity
  if (priority.urgencyDetails.tier === "overdue") {
    estimate += 10;
  }

  return estimate;
}

function generateNextSteps(priority: TaskPriority): string[] {
  const steps: string[] = [];

  // Check blockers first
  if (priority.dependencyDetails.blockers.length > 0) {
    steps.push(
      `Check status of blocking tasks: ${priority.dependencyDetails.blockers.map((b) => b.taskName).join(", ")}`,
    );
  }

  // Action based on recommendation
  switch (priority.recommendation) {
    case "do_now":
      steps.push("Clear your current work and focus on this task");
      steps.push("Set a timer for focused work (25-50 minutes)");
      break;
    case "schedule":
      steps.push("Block time on your calendar for this task");
      steps.push("Gather any required resources or information beforehand");
      break;
    case "delegate":
      steps.push("Identify team members who could take this on");
      steps.push("Prepare context and handoff documentation");
      break;
    case "defer":
      steps.push("Set a reminder to review this task later");
      steps.push("Focus on higher priority items first");
      break;
  }

  // If has dependents, note the impact
  if (priority.dependencyDetails.dependents.length > 0) {
    steps.push("Completing this will unblock dependent tasks");
  }

  return steps;
}

export async function batchGenerateRecommendations(
  priorities: TaskPriority[],
): Promise<TaskRecommendation[]> {
  return priorities.map(generateRecommendation);
}
