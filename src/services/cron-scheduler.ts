/**
 * Cron Scheduler Service
 * Manages scheduled tasks for backups, maintenance, analytics refresh, etc.
 */

import { CronJob } from "cron";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

interface ScheduledTask {
  name: string;
  schedule: string; // cron expression
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  lastStatus?: "success" | "failed";
  lastError?: string;
}

interface TaskExecutionRecord {
  taskName: string;
  startTime: string;
  endTime?: string;
  status: "running" | "success" | "failed";
  error?: string;
  duration?: number;
}

class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private tasks: Map<string, ScheduledTask> = new Map();
  private isRunning = false;
  private instanceId: string;

  constructor() {
    this.instanceId = `scheduler_${process.pid}_${Date.now()}`;
  }

  async registerTask(task: Omit<ScheduledTask, "lastRun" | "lastStatus">): Promise<void> {
    if (this.tasks.has(task.name)) {
      logger.warn("Task already registered, updating", { taskName: task.name });
      this.unregisterTask(task.name);
    }

    this.tasks.set(task.name, { ...task, enabled: task.enabled ?? true });

    if (task.enabled) {
      await this.scheduleTask(task.name);
    }

    logger.info("Registered scheduled task", {
      taskName: task.name,
      schedule: task.schedule,
      enabled: task.enabled,
    });
  }

  private async scheduleTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) return;

    const job = new CronJob(
      task.schedule,
      async () => {
        await this.executeTask(taskName);
      },
      null,
      false,
      "UTC"
    );

    this.jobs.set(taskName, job);

    if (this.isRunning) {
      job.start();
    }
  }

  private async acquireLock(taskName: string): Promise<boolean> {
    const lockKey = `cron:lock:${taskName}`;
    const lockValue = this.instanceId;
    const lockTtl = 3600; // 1 hour max lock

    const result = await redis.eval(
      `if redis.call("setnx", KEYS[1], ARGV[1]) == 1 then
        redis.call("expire", KEYS[1], ARGV[2])
        return 1
      else
        return 0
      end`,
      1,
      lockKey,
      lockValue,
      lockTtl.toString()
    );

    return result === 1;
  }

  private async releaseLock(taskName: string): Promise<void> {
    const lockKey = `cron:lock:${taskName}`;
    await redis.del(lockKey);
  }

  private async executeTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) return;

    // Acquire distributed lock for multi-instance deployments
    const hasLock = await this.acquireLock(taskName);
    if (!hasLock) {
      logger.debug("Skipping task, another instance has lock", { taskName });
      return;
    }

    const execution: TaskExecutionRecord = {
      taskName,
      startTime: new Date().toISOString(),
      status: "running",
    };

    await this.recordExecution(execution);

    const startTime = Date.now();

    try {
      logger.info("Executing scheduled task", { taskName });
      await task.handler();

      const duration = Date.now() - startTime;
      task.lastRun = new Date();
      task.lastStatus = "success";
      delete task.lastError;

      execution.endTime = new Date().toISOString();
      execution.status = "success";
      execution.duration = duration;

      await this.recordExecution(execution);
      logger.info("Scheduled task completed", { taskName, duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      task.lastRun = new Date();
      task.lastStatus = "failed";
      task.lastError = errorMessage;

      execution.endTime = new Date().toISOString();
      execution.status = "failed";
      execution.error = errorMessage;
      execution.duration = duration;

      await this.recordExecution(execution);
      logger.error("Scheduled task failed", { taskName, error: errorMessage, duration });
    } finally {
      await this.releaseLock(taskName);
    }
  }

  private async recordExecution(execution: TaskExecutionRecord): Promise<void> {
    const key = `cron:executions:${execution.taskName}`;
    await redis.lpush(key, JSON.stringify(execution));
    // Keep last 100 executions
    await redis.ltrim(key, 0, 99);
    await redis.expire(key, 86400 * 7); // 7 days
  }

  async getExecutionHistory(taskName: string, limit = 10): Promise<TaskExecutionRecord[]> {
    const key = `cron:executions:${taskName}`;
    const records = await redis.lrange(key, 0, limit - 1);
    return records.map((r) => JSON.parse(r));
  }

  unregisterTask(taskName: string): void {
    const job = this.jobs.get(taskName);
    if (job) {
      job.stop();
      this.jobs.delete(taskName);
    }
    this.tasks.delete(taskName);
    logger.info("Unregistered scheduled task", { taskName });
  }

  enableTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (task) {
      task.enabled = true;
      const job = this.jobs.get(taskName);
      if (job && this.isRunning) {
        job.start();
      }
    }
  }

  disableTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (task) {
      task.enabled = false;
      const job = this.jobs.get(taskName);
      if (job) {
        job.stop();
      }
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    Array.from(this.jobs.entries()).forEach(([taskName, job]) => {
      const task = this.tasks.get(taskName);
      if (task?.enabled) {
        job.start();
      }
    });
    logger.info("Cron scheduler started", { instanceId: this.instanceId, taskCount: this.jobs.size });
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    Array.from(this.jobs.values()).forEach((job) => {
      job.stop();
    });
    logger.info("Cron scheduler stopped", { instanceId: this.instanceId });
  }

  getStatus(): Record<string, unknown> {
    const taskStatuses: Record<string, unknown>[] = [];

    Array.from(this.tasks.entries()).forEach(([name, task]) => {
      const job = this.jobs.get(name);
      taskStatuses.push({
        name,
        schedule: task.schedule,
        enabled: task.enabled,
        running: job?.isActive ?? false,
        nextRun: job?.nextDate()?.toISO() ?? null,
        lastRun: task.lastRun?.toISOString() ?? null,
        lastStatus: task.lastStatus ?? null,
        lastError: task.lastError ?? null,
      });
    });

    return {
      instanceId: this.instanceId,
      isRunning: this.isRunning,
      taskCount: this.tasks.size,
      tasks: taskStatuses,
    };
  }

  async runTaskNow(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }
    await this.executeTask(taskName);
  }
}

export const cronScheduler = new CronScheduler();

// Default tasks registration
export function registerDefaultTasks(): void {
  // Analytics materialized views refresh
  cronScheduler.registerTask({
    name: "refresh-analytics-views",
    schedule: "0 * * * *", // Every hour
    enabled: true,
    handler: async () => {
      const { db } = await import("../db/client");
      await db.$executeRaw`SELECT refresh_all_materialized_views(true)`;
    },
  });

  // Cleanup expired sessions
  cronScheduler.registerTask({
    name: "cleanup-expired-sessions",
    schedule: "0 3 * * *", // Daily at 3 AM UTC
    enabled: true,
    handler: async () => {
      const { db } = await import("../db/client");
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
      const result = await db.session.deleteMany({
        where: { updatedAt: { lt: cutoff } },
      });
      logger.info("Cleaned up expired sessions", { count: result.count });
    },
  });

  // Redis memory check
  cronScheduler.registerTask({
    name: "redis-memory-check",
    schedule: "*/15 * * * *", // Every 15 minutes
    enabled: true,
    handler: async () => {
      const info = await redis.eval(`return redis.call('INFO', 'memory')`, 0);
      const match = String(info).match(/used_memory_human:([^\r\n]+)/);
      const usedMemory = match ? match[1] : "unknown";
      logger.info("Redis memory check", { usedMemory });
    },
  });
}
