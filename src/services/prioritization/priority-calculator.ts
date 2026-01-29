/**
 * Priority Calculator Service
 * Combines urgency, importance, dependency, and pattern scores
 * into a unified priority system with actionable recommendations.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { calculateUrgencyScore, UrgencyScoreResult } from "./urgency-scorer";
import { calculateImportanceScore, ImportanceScoreResult } from "./importance-scorer";
import { analyzeDependencies, DependencyScoreResult } from "./dependency-analyzer";
import { calculatePatternScore, PatternScoreResult } from "./pattern-analyzer";

export interface TaskPriority {
  taskId: string;
  taskName: string;

  // Component scores (0-100)
  urgencyScore: number;
  importanceScore: number;
  dependencyScore: number;
  patternScore: number;

  // Combined score
  overallScore: number;

  // Recommendation
  recommendation: Recommendation;
  reasoning: string;

  // Detailed breakdowns
  urgencyDetails: UrgencyScoreResult;
  importanceDetails: ImportanceScoreResult;
  dependencyDetails: DependencyScoreResult;
  patternDetails: PatternScoreResult;
}

export type Recommendation = "do_now" | "schedule" | "delegate" | "defer";

interface PriorityWeights {
  urgency: number;
  importance: number;
  dependency: number;
  pattern: number;
}

interface PriorityCalculatorConfig {
  weights: PriorityWeights;
  thresholds: {
    doNow: number;
    schedule: number;
    delegate: number;
  };
}

const DEFAULT_CONFIG: PriorityCalculatorConfig = {
  weights: {
    urgency: 0.30,
    importance: 0.30,
    dependency: 0.25,
    pattern: 0.15,
  },
  thresholds: {
    doNow: 75,
    schedule: 50,
    delegate: 30,
  },
};

interface TaskRecord {
  id: string;
  name: string;
  organizationId: string;
  projectId: string | null;
  status: string;
  dueDate: Date | null;
  description: string | null;
  urgencyScore: number | null;
  importanceScore: number | null;
  responsible: string[];
  accountable: string[];
  backup: string[];
  support: string[];
  informed: string[];
  consulted: string[];
}

export class PriorityCalculator {
  private config: PriorityCalculatorConfig;

  constructor(config: Partial<PriorityCalculatorConfig> = {}) {
    this.config = {
      weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds },
    };
  }

  async calculatePriority(
    task: TaskRecord,
    context: {
      userId: string;
      currentTime: Date;
      workload: TaskRecord[];
    },
  ): Promise<TaskPriority> {
    const { userId, currentTime } = context;

    // Calculate component scores in parallel
    const [urgencyDetails, importanceDetails, dependencyDetails, patternDetails] =
      await Promise.all([
        Promise.resolve(calculateUrgencyScore(task.dueDate, currentTime)),
        Promise.resolve(
          calculateImportanceScore({
            id: task.id,
            name: task.name,
            description: task.description,
            importanceScore: task.importanceScore,
            projectId: task.projectId,
            responsible: task.responsible,
            accountable: task.accountable,
            backup: task.backup,
            support: task.support,
            informed: task.informed,
            consulted: task.consulted,
          }),
        ),
        analyzeDependencies(task.id, task.organizationId),
        calculatePatternScore(task.id, userId, task.organizationId, currentTime),
      ]);

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(
      urgencyDetails.score,
      importanceDetails.score,
      dependencyDetails.score,
      patternDetails.score,
    );

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      overallScore,
      urgencyDetails,
      importanceDetails,
      dependencyDetails,
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      recommendation,
      urgencyDetails,
      importanceDetails,
      dependencyDetails,
      patternDetails,
    );

    return {
      taskId: task.id,
      taskName: task.name,
      urgencyScore: urgencyDetails.score,
      importanceScore: importanceDetails.score,
      dependencyScore: dependencyDetails.score,
      patternScore: patternDetails.score,
      overallScore,
      recommendation,
      reasoning,
      urgencyDetails,
      importanceDetails,
      dependencyDetails,
      patternDetails,
    };
  }

  private calculateOverallScore(
    urgency: number,
    importance: number,
    dependency: number,
    pattern: number,
  ): number {
    const { weights } = this.config;
    const weighted =
      urgency * weights.urgency +
      importance * weights.importance +
      dependency * weights.dependency +
      pattern * weights.pattern;

    return Math.round(Math.min(100, Math.max(0, weighted)));
  }

  private determineRecommendation(
    overallScore: number,
    urgency: UrgencyScoreResult,
    importance: ImportanceScoreResult,
    dependency: DependencyScoreResult,
  ): Recommendation {
    const { thresholds } = this.config;

    // Override rules
    // Overdue tasks are always "do_now"
    if (urgency.tier === "overdue") {
      return "do_now";
    }

    // Critical path tasks get elevated priority
    if (dependency.criticalPathPosition === "critical" && overallScore >= thresholds.schedule) {
      return "do_now";
    }

    // Root tasks (unblock others) should be started
    if (dependency.criticalPathPosition === "root" && overallScore >= thresholds.schedule) {
      return "do_now";
    }

    // Low importance tasks could be delegated
    if (importance.tier === "low" || importance.tier === "minimal") {
      if (urgency.tier === "high" || urgency.tier === "critical") {
        return "delegate";
      }
      return "defer";
    }

    // Standard threshold-based classification
    if (overallScore >= thresholds.doNow) {
      return "do_now";
    }

    if (overallScore >= thresholds.schedule) {
      return "schedule";
    }

    if (overallScore >= thresholds.delegate) {
      return "delegate";
    }

    return "defer";
  }

  private generateReasoning(
    recommendation: Recommendation,
    urgency: UrgencyScoreResult,
    importance: ImportanceScoreResult,
    dependency: DependencyScoreResult,
    pattern: PatternScoreResult,
  ): string {
    const reasons: string[] = [];

    // Urgency reasoning
    if (urgency.tier === "overdue") {
      reasons.push("Task is overdue");
    } else if (urgency.tier === "critical") {
      reasons.push("Due today");
    } else if (urgency.tier === "high") {
      reasons.push(`Due in ${Math.ceil(urgency.daysUntilDue!)} days`);
    }

    // Importance reasoning
    if (importance.tier === "critical" || importance.tier === "high") {
      const topFactor = importance.factors.reduce((a, b) =>
        a.contribution > b.contribution ? a : b,
      );
      reasons.push(`High importance (${topFactor.name.toLowerCase()})`);
    }

    // Dependency reasoning
    if (dependency.dependents.length > 0) {
      reasons.push(`Blocks ${dependency.dependents.length} other task(s)`);
    }
    if (dependency.criticalPathPosition === "critical") {
      reasons.push("On critical path");
    }

    // Pattern reasoning
    if (pattern.score >= 70) {
      reasons.push("Good time to work on this");
    }

    // Recommendation action
    const actionPhrases: Record<Recommendation, string> = {
      do_now: "Start immediately",
      schedule: "Schedule dedicated time",
      delegate: "Consider delegating",
      defer: "Can be deferred",
    };

    const baseReason = actionPhrases[recommendation];
    return reasons.length > 0 ? `${baseReason}: ${reasons.join(", ")}` : baseReason;
  }

  async prioritizeAll(tasks: TaskRecord[], userId: string): Promise<TaskPriority[]> {
    const currentTime = new Date();

    logger.info("Prioritizing all tasks", {
      taskCount: tasks.length,
      userId,
    });

    // Calculate priorities for all tasks
    const priorities = await Promise.all(
      tasks.map((task) =>
        this.calculatePriority(task, {
          userId,
          currentTime,
          workload: tasks,
        }),
      ),
    );

    // Sort by overall score descending
    priorities.sort((a, b) => b.overallScore - a.overallScore);

    logger.debug("Tasks prioritized", {
      topTask: priorities[0]?.taskName,
      topScore: priorities[0]?.overallScore,
    });

    return priorities;
  }

  async suggestNextTask(
    userId: string,
    organizationId: string,
  ): Promise<{ task: TaskRecord; priority: TaskPriority; reasoning: string } | null> {
    // Fetch active tasks for the user
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: { in: ["1_ToDo", "2_InProgress"] },
        OR: [{ responsible: { has: userId } }, { accountable: { has: userId } }],
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        projectId: true,
        status: true,
        dueDate: true,
        description: true,
        urgencyScore: true,
        importanceScore: true,
        responsible: true,
        accountable: true,
        backup: true,
        support: true,
        informed: true,
        consulted: true,
      },
      take: 50,
    });

    if (tasks.length === 0) {
      return null;
    }

    const priorities = await this.prioritizeAll(tasks, userId);

    // Get the highest priority task that's not blocked
    for (const priority of priorities) {
      if (priority.dependencyDetails.blockers.length === 0 || priority.recommendation === "do_now") {
        const task = tasks.find((t) => t.id === priority.taskId)!;
        return {
          task,
          priority,
          reasoning: this.generateNextTaskReasoning(priority),
        };
      }
    }

    // Fallback to highest priority even if blocked
    const topPriority = priorities[0];
    const task = tasks.find((t) => t.id === topPriority.taskId)!;

    return {
      task,
      priority: topPriority,
      reasoning: this.generateNextTaskReasoning(topPriority),
    };
  }

  private generateNextTaskReasoning(priority: TaskPriority): string {
    const parts: string[] = [];

    if (priority.urgencyDetails.tier === "overdue") {
      parts.push("This task is overdue and needs immediate attention.");
    } else if (priority.urgencyDetails.tier === "critical") {
      parts.push("This task is due today.");
    }

    if (priority.dependencyDetails.dependents.length > 0) {
      parts.push(
        `Completing this will unblock ${priority.dependencyDetails.dependents.length} other task(s).`,
      );
    }

    if (priority.importanceDetails.tier === "critical") {
      parts.push("High impact task.");
    }

    if (priority.patternDetails.score >= 70) {
      parts.push("This aligns well with your productive hours.");
    }

    if (parts.length === 0) {
      parts.push(`This task has the highest overall priority score (${priority.overallScore}).`);
    }

    return parts.join(" ");
  }
}

// Singleton instance
let calculatorInstance: PriorityCalculator | null = null;

export function getPriorityCalculator(
  config?: Partial<PriorityCalculatorConfig>,
): PriorityCalculator {
  if (!calculatorInstance || config) {
    calculatorInstance = new PriorityCalculator(config);
  }
  return calculatorInstance;
}

export async function calculateTaskPriority(
  taskId: string,
  userId: string,
  _organizationId: string,
): Promise<TaskPriority | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
      description: true,
      urgencyScore: true,
      importanceScore: true,
      responsible: true,
      accountable: true,
      backup: true,
      support: true,
      informed: true,
      consulted: true,
    },
  });

  if (!task) {
    return null;
  }

  const calculator = getPriorityCalculator();
  return calculator.calculatePriority(task, {
    userId,
    currentTime: new Date(),
    workload: [],
  });
}

export async function getPrioritizedTasks(
  userId: string,
  organizationId: string,
  options?: { projectId?: string; limit?: number },
): Promise<TaskPriority[]> {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId,
      ...(options?.projectId && { projectId: options.projectId }),
      status: { not: "5_Done" },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
      description: true,
      urgencyScore: true,
      importanceScore: true,
      responsible: true,
      accountable: true,
      backup: true,
      support: true,
      informed: true,
      consulted: true,
    },
    take: options?.limit || 100,
  });

  const calculator = getPriorityCalculator();
  return calculator.prioritizeAll(tasks, userId);
}

export async function suggestNextTask(
  userId: string,
  organizationId: string,
): Promise<{ task: TaskRecord; priority: TaskPriority; reasoning: string } | null> {
  const calculator = getPriorityCalculator();
  return calculator.suggestNextTask(userId, organizationId);
}
