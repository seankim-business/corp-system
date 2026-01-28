import Redis from "ioredis";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import {
  scheduledTaskQueue,
  ScheduledTaskData,
  ScheduleConfig,
  ScheduleFrequency,
} from "../queue/scheduled-task.queue";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export interface ScheduledTask {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  taskType: "workflow" | "briefing" | "report" | "cleanup" | "custom";
  workflowId?: string;
  config: ScheduleConfig;
  payload: Record<string, unknown>;
  enabled: boolean;
  createdBy: string;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const SCHEDULE_PREFIX = "scheduled_task:";
const SCHEDULE_INDEX_PREFIX = "scheduled_tasks_index:";

export async function createScheduledTask(
  organizationId: string,
  task: Omit<
    ScheduledTask,
    "id" | "organizationId" | "createdAt" | "updatedAt" | "runCount" | "lastRun" | "nextRun"
  >,
): Promise<ScheduledTask> {
  const id = generateScheduleId();
  const now = new Date();

  const scheduledTask: ScheduledTask = {
    ...task,
    id,
    organizationId,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await saveScheduledTask(scheduledTask);

  if (task.enabled) {
    await activateSchedule(scheduledTask);
  }

  metrics.increment("scheduled_tasks.created", { taskType: task.taskType });

  logger.info("Scheduled task created", {
    scheduleId: id,
    organizationId,
    taskType: task.taskType,
    name: task.name,
  });

  return scheduledTask;
}

export async function updateScheduledTask(
  organizationId: string,
  scheduleId: string,
  updates: Partial<Omit<ScheduledTask, "id" | "organizationId" | "createdAt" | "createdBy">>,
): Promise<ScheduledTask | null> {
  const existing = await getScheduledTask(organizationId, scheduleId);
  if (!existing) {
    return null;
  }

  const wasEnabled = existing.enabled;
  const updated: ScheduledTask = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
  };

  await saveScheduledTask(updated);

  if (wasEnabled && !updated.enabled) {
    await deactivateSchedule(scheduleId);
  } else if (!wasEnabled && updated.enabled) {
    await activateSchedule(updated);
  } else if (updated.enabled && updates.config) {
    await deactivateSchedule(scheduleId);
    await activateSchedule(updated);
  }

  logger.info("Scheduled task updated", {
    scheduleId,
    organizationId,
    enabled: updated.enabled,
  });

  return updated;
}

export async function deleteScheduledTask(
  organizationId: string,
  scheduleId: string,
): Promise<boolean> {
  const existing = await getScheduledTask(organizationId, scheduleId);
  if (!existing) {
    return false;
  }

  if (existing.enabled) {
    await deactivateSchedule(scheduleId);
  }

  const taskKey = `${SCHEDULE_PREFIX}${organizationId}:${scheduleId}`;
  const indexKey = `${SCHEDULE_INDEX_PREFIX}${organizationId}`;

  await redis.del(taskKey);
  await redis.srem(indexKey, scheduleId);

  metrics.increment("scheduled_tasks.deleted", { taskType: existing.taskType });

  logger.info("Scheduled task deleted", {
    scheduleId,
    organizationId,
  });

  return true;
}

export async function getScheduledTask(
  organizationId: string,
  scheduleId: string,
): Promise<ScheduledTask | null> {
  const taskKey = `${SCHEDULE_PREFIX}${organizationId}:${scheduleId}`;
  const data = await redis.get(taskKey);

  if (!data) {
    return null;
  }

  const task = JSON.parse(data);
  return {
    ...task,
    lastRun: task.lastRun ? new Date(task.lastRun) : undefined,
    nextRun: task.nextRun ? new Date(task.nextRun) : undefined,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
  };
}

export async function getScheduledTasksForOrg(organizationId: string): Promise<ScheduledTask[]> {
  const indexKey = `${SCHEDULE_INDEX_PREFIX}${organizationId}`;
  const scheduleIds = await redis.smembers(indexKey);

  const tasks: ScheduledTask[] = [];
  for (const scheduleId of scheduleIds) {
    const task = await getScheduledTask(organizationId, scheduleId);
    if (task) {
      tasks.push(task);
    }
  }

  return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function enableScheduledTask(
  organizationId: string,
  scheduleId: string,
): Promise<boolean> {
  const task = await getScheduledTask(organizationId, scheduleId);
  if (!task || task.enabled) {
    return false;
  }

  task.enabled = true;
  task.updatedAt = new Date();
  await saveScheduledTask(task);
  await activateSchedule(task);

  logger.info("Scheduled task enabled", { scheduleId, organizationId });
  return true;
}

export async function disableScheduledTask(
  organizationId: string,
  scheduleId: string,
): Promise<boolean> {
  const task = await getScheduledTask(organizationId, scheduleId);
  if (!task || !task.enabled) {
    return false;
  }

  task.enabled = false;
  task.updatedAt = new Date();
  await saveScheduledTask(task);
  await deactivateSchedule(scheduleId);

  logger.info("Scheduled task disabled", { scheduleId, organizationId });
  return true;
}

export async function recordTaskExecution(
  organizationId: string,
  scheduleId: string,
  success: boolean,
): Promise<void> {
  const task = await getScheduledTask(organizationId, scheduleId);
  if (!task) {
    return;
  }

  task.lastRun = new Date();
  task.runCount++;
  task.updatedAt = new Date();
  await saveScheduledTask(task);

  metrics.increment("scheduled_tasks.executed", {
    taskType: task.taskType,
    success: success.toString(),
  });
}

async function saveScheduledTask(task: ScheduledTask): Promise<void> {
  const taskKey = `${SCHEDULE_PREFIX}${task.organizationId}:${task.id}`;
  const indexKey = `${SCHEDULE_INDEX_PREFIX}${task.organizationId}`;

  await redis.set(taskKey, JSON.stringify(task));
  await redis.sadd(indexKey, task.id);
}

async function activateSchedule(task: ScheduledTask): Promise<void> {
  const data: ScheduledTaskData = {
    scheduleId: task.id,
    organizationId: task.organizationId,
    workflowId: task.workflowId,
    taskType: task.taskType,
    taskName: task.name,
    payload: task.payload,
    createdBy: task.createdBy,
  };

  await scheduledTaskQueue.scheduleTask(data, task.config);

  logger.info("Schedule activated", {
    scheduleId: task.id,
    frequency: task.config.frequency,
  });
}

async function deactivateSchedule(scheduleId: string): Promise<void> {
  await scheduledTaskQueue.removeSchedule(scheduleId);

  logger.info("Schedule deactivated", { scheduleId });
}

export async function createDailyBriefingSchedule(
  organizationId: string,
  userId: string,
  hour: number,
  minute: number,
  timezone: string,
): Promise<ScheduledTask> {
  return createScheduledTask(organizationId, {
    name: "Daily Briefing",
    description: "Automated daily briefing with insights and pending items",
    taskType: "briefing",
    config: {
      frequency: "daily",
      hour,
      minute,
      timezone,
    },
    payload: { userId },
    enabled: true,
    createdBy: userId,
  });
}

export async function createWeeklyReportSchedule(
  organizationId: string,
  userId: string,
  dayOfWeek: number,
  hour: number,
  timezone: string,
): Promise<ScheduledTask> {
  return createScheduledTask(organizationId, {
    name: "Weekly Report",
    description: "Automated weekly summary report",
    taskType: "report",
    config: {
      frequency: "weekly",
      dayOfWeek,
      hour,
      minute: 0,
      timezone,
    },
    payload: { userId, reportType: "weekly" },
    enabled: true,
    createdBy: userId,
  });
}

export async function createWorkflowSchedule(
  organizationId: string,
  workflowId: string,
  workflowName: string,
  config: ScheduleConfig,
  createdBy: string,
): Promise<ScheduledTask> {
  return createScheduledTask(organizationId, {
    name: `Scheduled: ${workflowName}`,
    description: `Automatically run workflow "${workflowName}"`,
    taskType: "workflow",
    workflowId,
    config,
    payload: {},
    enabled: true,
    createdBy,
  });
}

export async function getUpcomingSchedules(
  organizationId: string,
  limit: number = 10,
): Promise<Array<{ task: ScheduledTask; nextRun: Date }>> {
  const tasks = await getScheduledTasksForOrg(organizationId);
  const activeSchedules = await scheduledTaskQueue.getActiveSchedules();

  const upcoming: Array<{ task: ScheduledTask; nextRun: Date }> = [];

  for (const task of tasks) {
    if (!task.enabled) continue;

    const schedule = activeSchedules.find((s) => s.id === `sched-${task.id}`);
    if (schedule?.next) {
      upcoming.push({ task, nextRun: schedule.next });
    }
  }

  return upcoming.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime()).slice(0, limit);
}

function generateScheduleId(): string {
  return `sched_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export { ScheduleConfig, ScheduleFrequency };
