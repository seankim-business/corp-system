import { BaseQueue } from "./base.queue";

export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly" | "custom";

export interface ScheduledTaskData {
  scheduleId: string;
  organizationId: string;
  workflowId?: string;
  taskType: "workflow" | "briefing" | "report" | "cleanup" | "custom";
  taskName: string;
  payload: Record<string, unknown>;
  createdBy: string;
}

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  cronExpression?: string;
  timezone?: string;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export class ScheduledTaskQueue extends BaseQueue<ScheduledTaskData> {
  constructor() {
    super({
      name: "scheduled-tasks",
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
      },
    });
  }

  async scheduleTask(data: ScheduledTaskData, config: ScheduleConfig): Promise<string> {
    const cronPattern = this.buildCronPattern(config);
    const jobId = `sched-${data.scheduleId}`;

    await this.add("execute-scheduled-task", data, {
      jobId,
      repeat: {
        pattern: cronPattern,
        tz: config.timezone || "UTC",
      },
    });

    return jobId;
  }

  async removeSchedule(scheduleId: string): Promise<boolean> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === `sched-${scheduleId}`);

    if (job) {
      await this.queue.removeRepeatableByKey(job.key);
      return true;
    }

    return false;
  }

  async getActiveSchedules(): Promise<
    Array<{
      id: string;
      name: string;
      pattern: string;
      next: Date | null;
      timezone: string;
    }>
  > {
    const repeatableJobs = await this.queue.getRepeatableJobs();

    return repeatableJobs.map((job) => ({
      id: job.id || job.key,
      name: job.name,
      pattern: job.pattern || "",
      next: job.next ? new Date(job.next) : null,
      timezone: job.tz || "UTC",
    }));
  }

  async pauseSchedule(scheduleId: string): Promise<boolean> {
    return this.removeSchedule(scheduleId);
  }

  private buildCronPattern(config: ScheduleConfig): string {
    if (config.cronExpression) {
      return config.cronExpression;
    }

    const minute = config.minute ?? 0;
    const hour = config.hour ?? 9;

    switch (config.frequency) {
      case "hourly":
        return `${minute} * * * *`;
      case "daily":
        return `${minute} ${hour} * * *`;
      case "weekly": {
        const dow = config.dayOfWeek ?? 1;
        return `${minute} ${hour} * * ${dow}`;
      }
      case "monthly": {
        const dom = config.dayOfMonth ?? 1;
        return `${minute} ${hour} ${dom} * *`;
      }
      case "custom":
        return config.cronExpression || `${minute} ${hour} * * *`;
      default:
        return `${minute} ${hour} * * *`;
    }
  }
}

export const scheduledTaskQueue = new ScheduledTaskQueue();
