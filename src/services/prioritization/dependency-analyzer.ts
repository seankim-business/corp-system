/**
 * Dependency Analyzer Service
 * Analyzes task dependency chains and calculates dependency-based scores.
 * Identifies blockers, critical path tasks, and dependency impact.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface DependencyScoreResult {
  score: number; // 0-100
  blockers: TaskDependency[];
  dependents: TaskDependency[];
  criticalPathPosition: CriticalPathPosition;
  reasoning: string;
}

export interface TaskDependency {
  taskId: string;
  taskName: string;
  status: string;
  relationship: "blocks" | "blocked_by";
}

export type CriticalPathPosition = "root" | "critical" | "secondary" | "leaf" | "isolated";

interface DependencyConfig {
  blockerWeight: number;
  dependentWeight: number;
  criticalPathBonus: number;
  maxDependencyDepth: number;
}

const DEFAULT_CONFIG: DependencyConfig = {
  blockerWeight: 0.4,
  dependentWeight: 0.4,
  criticalPathBonus: 0.2,
  maxDependencyDepth: 5,
};

interface TaskRecord {
  id: string;
  name: string;
  organizationId: string;
  projectId: string | null;
  status: string;
  dueDate: Date | null;
}

export async function analyzeDependencies(
  taskId: string,
  organizationId: string,
  config: Partial<DependencyConfig> = {},
): Promise<DependencyScoreResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Fetch the task and related tasks in the same project/org
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
    },
  });

  if (!task) {
    return {
      score: 0,
      blockers: [],
      dependents: [],
      criticalPathPosition: "isolated",
      reasoning: "Task not found",
    };
  }

  // Get all tasks in same context (project or org)
  const relatedTasks = await prisma.task.findMany({
    where: {
      organizationId,
      projectId: task.projectId,
      status: { not: "5_Done" },
      id: { not: taskId },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
    },
  });

  // Analyze blocking relationships based on due dates and status
  const { blockers, dependents } = analyzeBlockingRelationships(task, relatedTasks);

  // Calculate critical path position
  const criticalPathPosition = determineCriticalPathPosition(
    task,
    blockers.length,
    dependents.length,
  );

  // Calculate dependency score
  const score = calculateDependencyScore(
    blockers.length,
    dependents.length,
    criticalPathPosition,
    cfg,
  );

  const reasoning = generateDependencyReasoning(blockers.length, dependents.length, criticalPathPosition);

  logger.debug("Dependencies analyzed", {
    taskId,
    blockerCount: blockers.length,
    dependentCount: dependents.length,
    criticalPathPosition,
    score,
  });

  return {
    score,
    blockers,
    dependents,
    criticalPathPosition,
    reasoning,
  };
}

function analyzeBlockingRelationships(
  task: TaskRecord,
  relatedTasks: TaskRecord[],
): { blockers: TaskDependency[]; dependents: TaskDependency[] } {
  const blockers: TaskDependency[] = [];
  const dependents: TaskDependency[] = [];

  for (const related of relatedTasks) {
    // In-progress tasks with earlier due dates block todo tasks
    if (task.status === "1_ToDo" && related.status === "2_InProgress") {
      if (task.dueDate && related.dueDate && related.dueDate <= task.dueDate) {
        blockers.push({
          taskId: related.id,
          taskName: related.name,
          status: related.status,
          relationship: "blocked_by",
        });
      }
    }

    // This task blocks other todo tasks with later due dates
    if (task.status === "2_InProgress" && related.status === "1_ToDo") {
      if (task.dueDate && related.dueDate && task.dueDate <= related.dueDate) {
        dependents.push({
          taskId: related.id,
          taskName: related.name,
          status: related.status,
          relationship: "blocks",
        });
      }
    }

    // Tasks with same due date but different statuses
    if (
      task.dueDate &&
      related.dueDate &&
      Math.abs(task.dueDate.getTime() - related.dueDate.getTime()) < 24 * 60 * 60 * 1000
    ) {
      if (task.status === "1_ToDo" && related.status === "2_InProgress") {
        blockers.push({
          taskId: related.id,
          taskName: related.name,
          status: related.status,
          relationship: "blocked_by",
        });
      }
    }
  }

  return { blockers, dependents };
}

function determineCriticalPathPosition(
  task: TaskRecord,
  blockerCount: number,
  dependentCount: number,
): CriticalPathPosition {
  // Root: No blockers but has dependents (starting point of work chain)
  if (blockerCount === 0 && dependentCount > 0) {
    return "root";
  }

  // Critical: Has both blockers and dependents (middle of critical chain)
  if (blockerCount > 0 && dependentCount > 0) {
    return "critical";
  }

  // Leaf: Has blockers but no dependents (end of chain)
  if (blockerCount > 0 && dependentCount === 0) {
    return "leaf";
  }

  // In progress with dependents is critical
  if (task.status === "2_InProgress" && dependentCount > 0) {
    return "critical";
  }

  // Secondary: Has some connections but not critical
  if (blockerCount + dependentCount > 0) {
    return "secondary";
  }

  // Isolated: No dependencies at all
  return "isolated";
}

function calculateDependencyScore(
  blockerCount: number,
  dependentCount: number,
  criticalPathPosition: CriticalPathPosition,
  config: DependencyConfig,
): number {
  // More dependents = higher priority (blocking more work)
  // More blockers = might need to wait (but still important to unblock)
  const dependentScore = Math.min(100, dependentCount * 20);
  const blockerScore = Math.min(100, blockerCount * 15);

  // Critical path bonus
  const pathBonuses: Record<CriticalPathPosition, number> = {
    root: 90, // High priority - start the chain
    critical: 100, // Highest - in the middle
    secondary: 50,
    leaf: 30,
    isolated: 10,
  };

  const pathScore = pathBonuses[criticalPathPosition];

  const score =
    dependentScore * config.dependentWeight +
    blockerScore * config.blockerWeight +
    pathScore * config.criticalPathBonus;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function generateDependencyReasoning(
  blockerCount: number,
  dependentCount: number,
  position: CriticalPathPosition,
): string {
  const parts: string[] = [];

  if (dependentCount > 0) {
    parts.push(`blocks ${dependentCount} other task${dependentCount !== 1 ? "s" : ""}`);
  }

  if (blockerCount > 0) {
    parts.push(`blocked by ${blockerCount} task${blockerCount !== 1 ? "s" : ""}`);
  }

  const positionDescriptions: Record<CriticalPathPosition, string> = {
    root: "This is a root task - completing it unblocks dependent work",
    critical: "On critical path - delays cascade to dependent tasks",
    secondary: "Has some dependencies - monitor progress",
    leaf: "End of dependency chain - can be completed after blockers",
    isolated: "Independent task - no dependency constraints",
  };

  if (parts.length > 0) {
    return `${positionDescriptions[position]}. Task ${parts.join(" and ")}`;
  }

  return positionDescriptions[position];
}

export async function analyzeBatchDependencies(
  taskIds: string[],
  organizationId: string,
): Promise<Map<string, DependencyScoreResult>> {
  const results = new Map<string, DependencyScoreResult>();

  // Batch analyze - could be optimized with single query
  for (const taskId of taskIds) {
    const result = await analyzeDependencies(taskId, organizationId);
    results.set(taskId, result);
  }

  logger.debug("Batch dependencies analyzed", {
    taskCount: taskIds.length,
    criticalCount: [...results.values()].filter((r) => r.criticalPathPosition === "critical")
      .length,
  });

  return results;
}

export async function findCriticalPathTasks(
  organizationId: string,
  projectId?: string,
): Promise<string[]> {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId,
      ...(projectId && { projectId }),
      status: { not: "5_Done" },
    },
    select: { id: true },
  });

  const results = await analyzeBatchDependencies(
    tasks.map((t) => t.id),
    organizationId,
  );

  return [...results.entries()]
    .filter(([, r]) => r.criticalPathPosition === "critical" || r.criticalPathPosition === "root")
    .map(([id]) => id);
}
