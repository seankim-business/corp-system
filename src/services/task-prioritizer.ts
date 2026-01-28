import { logger } from "../utils/logger";
import { db as prisma } from "../db/client";

export interface PrioritizedTask {
  id: string;
  name: string;
  organizationId: string;
  projectId?: string;
  status: string;
  dueDate?: Date;
  urgencyScore: number;
  importanceScore: number;
  priorityScore: number;
  eisenhowerQuadrant: EisenhowerQuadrant;
  blockers: string[];
  dependents: string[];
  suggestedAction?: string;
}

export type EisenhowerQuadrant = "do_first" | "schedule" | "delegate" | "eliminate";

interface PriorityWeights {
  urgency: number;
  importance: number;
  dueDate: number;
  blockerImpact: number;
  dependentCount: number;
}

const DEFAULT_WEIGHTS: PriorityWeights = {
  urgency: 0.25,
  importance: 0.25,
  dueDate: 0.3,
  blockerImpact: 0.1,
  dependentCount: 0.1,
};

export async function prioritizeTasks(
  organizationId: string,
  options?: {
    projectId?: string;
    includeCompleted?: boolean;
    limit?: number;
    weights?: Partial<PriorityWeights>;
  },
): Promise<PrioritizedTask[]> {
  const weights = { ...DEFAULT_WEIGHTS, ...options?.weights };

  const whereClause: Record<string, unknown> = {
    organizationId,
  };

  if (options?.projectId) {
    whereClause.projectId = options.projectId;
  }

  if (!options?.includeCompleted) {
    whereClause.status = { not: "5_Done" };
  }

  const tasks = await prisma.task.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      status: true,
      dueDate: true,
      urgencyScore: true,
      importanceScore: true,
      eisenhowerQuad: true,
      responsible: true,
      accountable: true,
      backup: true,
    },
    take: options?.limit || 100,
  });

  interface TaskRecord {
    id: string;
    name: string;
    organizationId: string;
    projectId: string | null;
    status: string;
    dueDate: Date | null;
    urgencyScore: number | null;
    importanceScore: number | null;
    eisenhowerQuad: string | null;
    responsible: string[];
    accountable: string[];
    backup: string[];
  }

  const tasksByProject = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const projectKey = task.projectId || "no-project";
    if (!tasksByProject.has(projectKey)) {
      tasksByProject.set(projectKey, []);
    }
    tasksByProject.get(projectKey)!.push(task);
  }

  const blockerMap = new Map<string, string[]>();
  const dependentMap = new Map<string, string[]>();

  for (const [, projectTasks] of tasksByProject) {
    const inProgressTasks = projectTasks.filter((t) => t.status === "2_InProgress");
    const todoTasks = projectTasks.filter((t) => t.status === "1_ToDo");

    for (const todoTask of todoTasks) {
      const blockers = inProgressTasks
        .filter((inProgress) => {
          if (!todoTask.dueDate || !inProgress.dueDate) return false;
          return inProgress.dueDate < todoTask.dueDate;
        })
        .map((t) => t.id);

      if (blockers.length > 0) {
        blockerMap.set(todoTask.id, blockers);
      }
    }

    for (const inProgress of inProgressTasks) {
      const dependents = todoTasks
        .filter((todo) => {
          if (!todo.dueDate || !inProgress.dueDate) return false;
          return inProgress.dueDate < todo.dueDate;
        })
        .map((t) => t.id);

      if (dependents.length > 0) {
        dependentMap.set(inProgress.id, dependents);
      }
    }
  }

  const prioritizedTasks: PrioritizedTask[] = tasks.map((task: TaskRecord) => {
    const urgency = normalizeScore(task.urgencyScore || 0);
    const importance = normalizeScore(task.importanceScore || 0);
    const dueDateScore = calculateDueDateScore(task.dueDate);

    const taskBlockers = blockerMap.get(task.id) || [];
    const taskDependents = dependentMap.get(task.id) || [];

    const blockerScore = normalizeScore(taskBlockers.length, 5);
    const dependentScore = normalizeScore(taskDependents.length, 5);

    const priorityScore =
      urgency * weights.urgency +
      importance * weights.importance +
      dueDateScore * weights.dueDate +
      blockerScore * weights.blockerImpact +
      dependentScore * weights.dependentCount;

    const quadrant = determineEisenhowerQuadrant(urgency, importance);

    return {
      id: task.id,
      name: task.name,
      organizationId: task.organizationId,
      projectId: task.projectId || undefined,
      status: task.status,
      dueDate: task.dueDate || undefined,
      urgencyScore: urgency,
      importanceScore: importance,
      priorityScore: Math.round(priorityScore * 100),
      eisenhowerQuadrant: quadrant,
      blockers: taskBlockers,
      dependents: taskDependents,
      suggestedAction: getSuggestedAction(quadrant, task.status),
    };
  });

  prioritizedTasks.sort((a, b) => b.priorityScore - a.priorityScore);

  logger.debug("Tasks prioritized", {
    organizationId,
    taskCount: prioritizedTasks.length,
    topPriority: prioritizedTasks[0]?.name,
  });

  return prioritizedTasks;
}

function normalizeScore(score: number, maxScore: number = 10): number {
  return Math.max(0, Math.min(1, score / maxScore));
}

function calculateDueDateScore(dueDate: Date | null): number {
  if (!dueDate) {
    return 0.3;
  }

  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    return 1.0;
  }

  if (diffDays <= 1) {
    return 0.95;
  }

  if (diffDays <= 3) {
    return 0.8;
  }

  if (diffDays <= 7) {
    return 0.6;
  }

  if (diffDays <= 14) {
    return 0.4;
  }

  if (diffDays <= 30) {
    return 0.2;
  }

  return 0.1;
}

function determineEisenhowerQuadrant(urgency: number, importance: number): EisenhowerQuadrant {
  const urgentThreshold = 0.6;
  const importantThreshold = 0.6;

  const isUrgent = urgency >= urgentThreshold;
  const isImportant = importance >= importantThreshold;

  if (isUrgent && isImportant) {
    return "do_first";
  }

  if (!isUrgent && isImportant) {
    return "schedule";
  }

  if (isUrgent && !isImportant) {
    return "delegate";
  }

  return "eliminate";
}

function getSuggestedAction(quadrant: EisenhowerQuadrant, status: string): string {
  const quadrantActions: Record<EisenhowerQuadrant, string> = {
    do_first: "Focus on this task immediately - it's both urgent and important",
    schedule: "Schedule dedicated time for this important but not urgent task",
    delegate: "Consider delegating this urgent but less important task",
    eliminate: "Review if this task is still necessary - consider removing or postponing",
  };

  if (status === "1_ToDo") {
    return `Start: ${quadrantActions[quadrant]}`;
  }

  if (status === "2_InProgress") {
    return `Continue: ${quadrantActions[quadrant]}`;
  }

  return quadrantActions[quadrant];
}

export async function getTasksByQuadrant(
  organizationId: string,
  quadrant: EisenhowerQuadrant,
): Promise<PrioritizedTask[]> {
  const allTasks = await prioritizeTasks(organizationId);
  return allTasks.filter((t) => t.eisenhowerQuadrant === quadrant);
}

export async function getTopPriorityTasks(
  organizationId: string,
  limit: number = 5,
): Promise<PrioritizedTask[]> {
  return prioritizeTasks(organizationId, { limit });
}

export async function getOverdueTasks(organizationId: string): Promise<PrioritizedTask[]> {
  const now = new Date();
  const allTasks = await prioritizeTasks(organizationId);
  return allTasks.filter((t) => t.dueDate && t.dueDate < now);
}

export async function recalculatePriorities(
  organizationId: string,
  projectId?: string,
): Promise<number> {
  const tasks = await prioritizeTasks(organizationId, { projectId });

  let updated = 0;

  for (const task of tasks) {
    const quadrantMap: Record<EisenhowerQuadrant, string> = {
      do_first: "Q1_Do",
      schedule: "Q2_Schedule",
      delegate: "Q3_Delegate",
      eliminate: "Q4_Eliminate",
    };

    try {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          eisenhowerQuad: quadrantMap[task.eisenhowerQuadrant],
        },
      });
      updated++;
    } catch (error) {
      logger.warn("Failed to update task priority", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Priorities recalculated", {
    organizationId,
    projectId,
    tasksUpdated: updated,
  });

  return updated;
}

export interface PrioritySummary {
  totalTasks: number;
  byQuadrant: Record<EisenhowerQuadrant, number>;
  overdueTasks: number;
  dueSoon: number;
  highPriority: number;
  recommendations: string[];
}

export async function getPrioritySummary(organizationId: string): Promise<PrioritySummary> {
  const tasks = await prioritizeTasks(organizationId);

  const byQuadrant: Record<EisenhowerQuadrant, number> = {
    do_first: 0,
    schedule: 0,
    delegate: 0,
    eliminate: 0,
  };

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let overdueTasks = 0;
  let dueSoon = 0;
  let highPriority = 0;

  for (const task of tasks) {
    byQuadrant[task.eisenhowerQuadrant]++;

    if (task.dueDate && task.dueDate < now) {
      overdueTasks++;
    } else if (task.dueDate && task.dueDate <= threeDaysFromNow) {
      dueSoon++;
    }

    if (task.priorityScore >= 70) {
      highPriority++;
    }
  }

  const recommendations: string[] = [];

  if (overdueTasks > 0) {
    recommendations.push(
      `You have ${overdueTasks} overdue task(s). Review and update due dates or complete them.`,
    );
  }

  if (byQuadrant.do_first > 5) {
    recommendations.push(
      `Too many urgent+important tasks (${byQuadrant.do_first}). Consider delegating or rescheduling some.`,
    );
  }

  if (byQuadrant.eliminate > 10) {
    recommendations.push(
      `Consider cleaning up ${byQuadrant.eliminate} low-priority tasks that may no longer be needed.`,
    );
  }

  if (dueSoon > 5) {
    recommendations.push(`${dueSoon} tasks due in the next 3 days. Plan your time accordingly.`);
  }

  return {
    totalTasks: tasks.length,
    byQuadrant,
    overdueTasks,
    dueSoon,
    highPriority,
    recommendations,
  };
}
