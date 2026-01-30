/**
 * Priority Optimizer Service
 *
 * Optimizes task priorities based on goals, deadlines, resource availability,
 * and organizational objectives. Uses multi-factor scoring to dynamically
 * adjust priorities across the organization.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export interface PriorityFactor {
  name: string;
  weight: number;
  score: number;
  reasoning: string;
}

export interface TaskPriorityScore {
  taskId: string;
  originalPriority: number;
  optimizedPriority: number;
  factors: PriorityFactor[];
  totalScore: number;
  recommendation: 'urgent' | 'high' | 'medium' | 'low' | 'defer';
  reasoning: string;
}

export interface PriorityOptimizationResult {
  organizationId: string;
  optimizedAt: Date;
  tasksAnalyzed: number;
  tasksReprioritized: number;
  priorities: TaskPriorityScore[];
  insights: string[];
}

export interface OptimizationConfig {
  weights: {
    deadline: number;      // Weight for deadline proximity
    goalAlignment: number; // Weight for goal alignment
    blockingOthers: number; // Weight for blocking other tasks
    resourceMatch: number; // Weight for resource availability
    businessValue: number; // Weight for business value
    dependencyChain: number; // Weight for dependency chain depth
  };
  thresholds: {
    urgentScore: number;
    highScore: number;
    mediumScore: number;
  };
}

const DEFAULT_CONFIG: OptimizationConfig = {
  weights: {
    deadline: 0.25,
    goalAlignment: 0.20,
    blockingOthers: 0.15,
    resourceMatch: 0.15,
    businessValue: 0.15,
    dependencyChain: 0.10,
  },
  thresholds: {
    urgentScore: 85,
    highScore: 70,
    mediumScore: 50,
  },
};

// =============================================================================
// SERVICE
// =============================================================================

export class PriorityOptimizerService {
  private config: OptimizationConfig;

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...config?.thresholds },
    };
  }

  /**
   * Optimize priorities for all active tasks in an organization
   */
  async optimizeOrganizationPriorities(
    organizationId: string
  ): Promise<PriorityOptimizationResult> {
    logger.info("Starting priority optimization", { organizationId });

    const startTime = Date.now();

    // Get all active tasks
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: {
          in: ['1_NotStarted', '2_InProgress', '3_Pending', '4_Blocked'],
        },
      },
      include: {
        project: true,
      },
    });

    // Get organizational goals for alignment scoring
    const goals = await this.getOrganizationalGoals(organizationId);

    // Get agent assignments for resource matching
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      include: {
        agent: true,
        position: true,
      },
    });

    // Calculate priority scores for each task
    const priorities: TaskPriorityScore[] = [];
    const insights: string[] = [];

    for (const task of tasks) {
      const priorityScore = this.calculateTaskPriority(
        task,
        goals,
        assignments,
        tasks
      );
      priorities.push(priorityScore);
    }

    // Sort by optimized priority
    priorities.sort((a, b) => b.totalScore - a.totalScore);

    // Generate insights
    const urgentTasks = priorities.filter(p => p.recommendation === 'urgent');
    const blockedHighPriority = priorities.filter(
      p => p.totalScore > this.config.thresholds.highScore &&
           p.factors.some(f => f.name === 'blocking_others' && f.score > 50)
    );

    if (urgentTasks.length > 0) {
      insights.push(
        `${urgentTasks.length} tasks require urgent attention based on deadline and impact`
      );
    }

    if (blockedHighPriority.length > 0) {
      insights.push(
        `${blockedHighPriority.length} high-priority tasks are blocking other work`
      );
    }

    const reprioritizedCount = priorities.filter(
      p => Math.abs(p.originalPriority - p.optimizedPriority) > 1
    ).length;

    // Cache the result
    const cacheKey = `ar:priority:${organizationId}`;
    await redis.set(
      cacheKey,
      JSON.stringify({ priorities, optimizedAt: new Date() }),
      300 // 5 minutes cache
    );

    logger.info("Priority optimization complete", {
      organizationId,
      tasksAnalyzed: tasks.length,
      reprioritized: reprioritizedCount,
      durationMs: Date.now() - startTime,
    });

    return {
      organizationId,
      optimizedAt: new Date(),
      tasksAnalyzed: tasks.length,
      tasksReprioritized: reprioritizedCount,
      priorities,
      insights,
    };
  }

  /**
   * Calculate priority score for a single task
   */
  private calculateTaskPriority(
    task: any,
    goals: any[],
    assignments: any[],
    allTasks: any[]
  ): TaskPriorityScore {
    const factors: PriorityFactor[] = [];

    // Factor 1: Deadline proximity
    const deadlineScore = this.calculateDeadlineScore(task);
    factors.push({
      name: 'deadline',
      weight: this.config.weights.deadline,
      score: deadlineScore.score,
      reasoning: deadlineScore.reasoning,
    });

    // Factor 2: Goal alignment
    const goalScore = this.calculateGoalAlignmentScore(task, goals);
    factors.push({
      name: 'goal_alignment',
      weight: this.config.weights.goalAlignment,
      score: goalScore.score,
      reasoning: goalScore.reasoning,
    });

    // Factor 3: Blocking others
    const blockingScore = this.calculateBlockingScore(task, allTasks);
    factors.push({
      name: 'blocking_others',
      weight: this.config.weights.blockingOthers,
      score: blockingScore.score,
      reasoning: blockingScore.reasoning,
    });

    // Factor 4: Resource availability
    const resourceScore = this.calculateResourceMatchScore(task, assignments);
    factors.push({
      name: 'resource_match',
      weight: this.config.weights.resourceMatch,
      score: resourceScore.score,
      reasoning: resourceScore.reasoning,
    });

    // Factor 5: Business value
    const valueScore = this.calculateBusinessValueScore(task);
    factors.push({
      name: 'business_value',
      weight: this.config.weights.businessValue,
      score: valueScore.score,
      reasoning: valueScore.reasoning,
    });

    // Factor 6: Dependency chain depth
    const dependencyScore = this.calculateDependencyChainScore(task, allTasks);
    factors.push({
      name: 'dependency_chain',
      weight: this.config.weights.dependencyChain,
      score: dependencyScore.score,
      reasoning: dependencyScore.reasoning,
    });

    // Calculate weighted total
    const totalScore = factors.reduce(
      (sum, f) => sum + f.score * f.weight,
      0
    );

    // Determine recommendation
    const recommendation = this.scoreToRecommendation(totalScore);

    // Map to priority number (1-5)
    const optimizedPriority = this.scoreToNumericPriority(totalScore);

    return {
      taskId: task.id,
      originalPriority: task.priority || 3,
      optimizedPriority,
      factors,
      totalScore,
      recommendation,
      reasoning: this.generatePriorityReasoning(factors, totalScore),
    };
  }

  /**
   * Calculate deadline-based score
   */
  private calculateDeadlineScore(task: any): { score: number; reasoning: string } {
    if (!task.dueDate) {
      return { score: 50, reasoning: 'No deadline set' };
    }

    const now = new Date();
    const due = new Date(task.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      return { score: 100, reasoning: `Overdue by ${Math.abs(daysUntilDue)} days` };
    } else if (daysUntilDue <= 1) {
      return { score: 95, reasoning: 'Due today or tomorrow' };
    } else if (daysUntilDue <= 3) {
      return { score: 85, reasoning: `Due in ${daysUntilDue} days` };
    } else if (daysUntilDue <= 7) {
      return { score: 70, reasoning: 'Due this week' };
    } else if (daysUntilDue <= 14) {
      return { score: 50, reasoning: 'Due in 1-2 weeks' };
    } else {
      return { score: 30, reasoning: 'Due in more than 2 weeks' };
    }
  }

  /**
   * Calculate goal alignment score
   */
  private calculateGoalAlignmentScore(
    task: any,
    goals: any[]
  ): { score: number; reasoning: string } {
    if (goals.length === 0) {
      return { score: 50, reasoning: 'No organizational goals defined' };
    }

    // Check if task is linked to goals via project or tags
    const taskTags = (task.metadata as any)?.tags || [];
    const projectGoals = task.project?.metadata?.alignedGoals || [];

    let alignedGoalCount = 0;
    const alignedGoalNames: string[] = [];

    for (const goal of goals) {
      const goalKeywords = goal.keywords || [];
      const hasTagMatch = taskTags.some((tag: string) =>
        goalKeywords.some((kw: string) =>
          tag.toLowerCase().includes(kw.toLowerCase())
        )
      );
      const hasProjectMatch = projectGoals.includes(goal.id);

      if (hasTagMatch || hasProjectMatch) {
        alignedGoalCount++;
        alignedGoalNames.push(goal.name);
      }
    }

    if (alignedGoalCount === 0) {
      return { score: 30, reasoning: 'Not aligned with organizational goals' };
    } else if (alignedGoalCount === 1) {
      return { score: 70, reasoning: `Aligned with: ${alignedGoalNames[0]}` };
    } else {
      return {
        score: 90,
        reasoning: `Aligned with ${alignedGoalCount} goals: ${alignedGoalNames.join(', ')}`
      };
    }
  }

  /**
   * Calculate blocking score (how many tasks does this block)
   */
  private calculateBlockingScore(
    task: any,
    allTasks: any[]
  ): { score: number; reasoning: string } {
    const blockedTasks = allTasks.filter(t => {
      const dependencies = (t.metadata as any)?.dependencies || [];
      return dependencies.includes(task.id);
    });

    if (blockedTasks.length === 0) {
      return { score: 30, reasoning: 'Not blocking any tasks' };
    } else if (blockedTasks.length <= 2) {
      return { score: 60, reasoning: `Blocking ${blockedTasks.length} tasks` };
    } else if (blockedTasks.length <= 5) {
      return { score: 80, reasoning: `Blocking ${blockedTasks.length} tasks` };
    } else {
      return { score: 100, reasoning: `Critical: Blocking ${blockedTasks.length} tasks` };
    }
  }

  /**
   * Calculate resource availability score
   */
  private calculateResourceMatchScore(
    task: any,
    assignments: any[]
  ): { score: number; reasoning: string } {
    const responsible = task.responsible || [];
    if (responsible.length === 0) {
      return { score: 40, reasoning: 'No assignee' };
    }

    // Check if assigned agents have capacity
    const assignedAgents = assignments.filter(a =>
      responsible.includes(a.agentId)
    );

    if (assignedAgents.length === 0) {
      return { score: 30, reasoning: 'Assigned agents not in AR system' };
    }

    const avgWorkload = assignedAgents.reduce((sum, a) => sum + a.workload, 0) / assignedAgents.length;

    if (avgWorkload < 0.5) {
      return { score: 90, reasoning: 'Resources have high availability' };
    } else if (avgWorkload < 0.8) {
      return { score: 70, reasoning: 'Resources have moderate availability' };
    } else if (avgWorkload < 1.0) {
      return { score: 50, reasoning: 'Resources near capacity' };
    } else {
      return { score: 30, reasoning: 'Resources overloaded' };
    }
  }

  /**
   * Calculate business value score
   */
  private calculateBusinessValueScore(task: any): { score: number; reasoning: string } {
    const metadata = task.metadata as any || {};

    // Check for explicit business value indicators
    if (metadata.businessValue === 'critical') {
      return { score: 100, reasoning: 'Critical business value' };
    } else if (metadata.businessValue === 'high') {
      return { score: 80, reasoning: 'High business value' };
    } else if (metadata.businessValue === 'medium') {
      return { score: 60, reasoning: 'Medium business value' };
    } else if (metadata.businessValue === 'low') {
      return { score: 40, reasoning: 'Low business value' };
    }

    // Infer from task type/tags
    const tags = metadata.tags || [];
    if (tags.includes('revenue') || tags.includes('customer')) {
      return { score: 80, reasoning: 'Revenue/customer impacting' };
    } else if (tags.includes('bug') || tags.includes('fix')) {
      return { score: 70, reasoning: 'Bug fix' };
    }

    return { score: 50, reasoning: 'Standard business value' };
  }

  /**
   * Calculate dependency chain depth score
   */
  private calculateDependencyChainScore(
    task: any,
    allTasks: any[]
  ): { score: number; reasoning: string } {
    const depth = this.getDependencyChainDepth(task, allTasks, new Set());

    if (depth === 0) {
      return { score: 40, reasoning: 'No downstream dependencies' };
    } else if (depth <= 2) {
      return { score: 60, reasoning: `Dependency chain depth: ${depth}` };
    } else if (depth <= 4) {
      return { score: 80, reasoning: `Long dependency chain: ${depth} levels` };
    } else {
      return { score: 95, reasoning: `Critical path: ${depth} levels deep` };
    }
  }

  /**
   * Get dependency chain depth recursively
   */
  private getDependencyChainDepth(
    task: any,
    allTasks: any[],
    visited: Set<string>
  ): number {
    if (visited.has(task.id)) return 0;
    visited.add(task.id);

    const dependentTasks = allTasks.filter(t => {
      const deps = (t.metadata as any)?.dependencies || [];
      return deps.includes(task.id);
    });

    if (dependentTasks.length === 0) return 0;

    let maxDepth = 0;
    for (const depTask of dependentTasks) {
      const depth = this.getDependencyChainDepth(depTask, allTasks, visited);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  /**
   * Convert score to recommendation
   */
  private scoreToRecommendation(score: number): 'urgent' | 'high' | 'medium' | 'low' | 'defer' {
    if (score >= this.config.thresholds.urgentScore) return 'urgent';
    if (score >= this.config.thresholds.highScore) return 'high';
    if (score >= this.config.thresholds.mediumScore) return 'medium';
    if (score >= 30) return 'low';
    return 'defer';
  }

  /**
   * Convert score to numeric priority (1-5)
   */
  private scoreToNumericPriority(score: number): number {
    if (score >= 85) return 1; // Highest
    if (score >= 70) return 2;
    if (score >= 50) return 3;
    if (score >= 30) return 4;
    return 5; // Lowest
  }

  /**
   * Generate human-readable reasoning
   */
  private generatePriorityReasoning(factors: PriorityFactor[], totalScore: number): string {
    const topFactors = factors
      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
      .slice(0, 2);

    const reasons = topFactors.map(f => f.reasoning).join('. ');
    return `Priority score: ${Math.round(totalScore)}. ${reasons}`;
  }

  /**
   * Get organizational goals
   */
  private async getOrganizationalGoals(organizationId: string): Promise<any[]> {
    // Try to get from cache first
    const cacheKey = `ar:goals:${organizationId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // For now, return goals from organization settings
    // In production, this would query a dedicated goals table
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    const settings = org?.settings as Record<string, unknown> | null;
    const goals = (settings?.strategicGoals as any[]) || [];

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(goals), 3600);

    return goals;
  }

  /**
   * Apply optimized priorities to tasks
   * Updates urgencyScore and importanceScore based on optimization results
   */
  async applyOptimizedPriorities(
    organizationId: string,
    priorities: TaskPriorityScore[],
    options?: { dryRun?: boolean; threshold?: number }
  ): Promise<{ applied: number; skipped: number }> {
    const threshold = options?.threshold ?? 1;
    let applied = 0;
    let skipped = 0;

    for (const priority of priorities) {
      const diff = Math.abs(priority.originalPriority - priority.optimizedPriority);

      if (diff >= threshold) {
        if (!options?.dryRun) {
          // Map optimized priority to urgency/importance scores
          // Priority 1 (highest) -> urgencyScore 100, importanceScore 100
          // Priority 5 (lowest) -> urgencyScore 20, importanceScore 20
          const scoreValue = Math.round(100 - (priority.optimizedPriority - 1) * 20);

          await prisma.task.update({
            where: { id: priority.taskId },
            data: {
              urgencyScore: scoreValue,
              importanceScore: scoreValue,
            },
          });
        }
        applied++;
      } else {
        skipped++;
      }
    }

    logger.info("Applied priority optimizations", {
      organizationId,
      applied,
      skipped,
    });

    return { applied, skipped };
  }
}

// Export singleton instance
export const priorityOptimizerService = new PriorityOptimizerService();
