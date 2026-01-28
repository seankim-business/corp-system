import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { ScheduledTaskData } from "../queue/scheduled-task.queue";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { recordTaskExecution } from "../services/scheduled-tasks";
import { db as prisma } from "../db/client";
import { runWithContext } from "../utils/async-context";
import { emitOrgEvent } from "../services/sse-service";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";

export class ScheduledTaskWorker extends BaseWorker<ScheduledTaskData> {
  constructor() {
    super("scheduled-tasks", {
      concurrency: 5,
      lockDuration: 300000,
      stalledInterval: 180000,
      maxStalledCount: 2,
    });
  }

  async process(job: Job<ScheduledTaskData>): Promise<void> {
    const { organizationId, createdBy } = job.data;

    return runWithContext({ organizationId, userId: createdBy }, () =>
      this.processWithContext(job),
    );
  }

  private async processWithContext(job: Job<ScheduledTaskData>): Promise<void> {
    const { scheduleId, organizationId, taskType, taskName, workflowId, payload, createdBy } =
      job.data;

    const startTime = Date.now();

    await job.updateProgress(PROGRESS_PERCENTAGES.STARTED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.STARTED, PROGRESS_PERCENTAGES.STARTED, {
      scheduleId,
      taskType,
      taskName,
    });

    logger.info("Processing scheduled task", {
      scheduleId,
      organizationId,
      taskType,
      taskName,
    });

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.VALIDATED,
        PROGRESS_PERCENTAGES.VALIDATED,
        {
          scheduleId,
          taskType,
          action: "executing_task",
        },
      );

      switch (taskType) {
        case "workflow":
          await this.executeWorkflow(organizationId, workflowId!, payload, createdBy);
          break;

        case "briefing":
          await this.executeBriefing(organizationId, payload);
          break;

        case "report":
          await this.executeReport(organizationId, payload);
          break;

        case "cleanup":
          await this.executeCleanup(organizationId, payload);
          break;

        case "custom":
          await this.executeCustomTask(organizationId, payload);
          break;

        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }

      await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.PROCESSING,
        PROGRESS_PERCENTAGES.PROCESSING,
        {
          scheduleId,
          taskType,
          action: "recording_execution",
        },
      );

      const duration = Date.now() - startTime;

      await recordTaskExecution(organizationId, scheduleId, true);

      await job.updateProgress(PROGRESS_PERCENTAGES.FINALIZING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.FINALIZING,
        PROGRESS_PERCENTAGES.FINALIZING,
        {
          scheduleId,
          taskType,
          action: "emitting_events",
        },
      );

      metrics.increment("scheduled_task.completed", { taskType });
      metrics.histogram("scheduled_task.duration_ms", duration, { taskType });

      emitOrgEvent(organizationId, "scheduled_task.completed", {
        scheduleId,
        taskType,
        taskName,
        duration,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          scheduleId,
          taskType,
          duration,
          status: "success",
        },
      );

      logger.info("Scheduled task completed", {
        scheduleId,
        taskType,
        duration,
      });
    } catch (error: any) {
      logger.error("Scheduled task failed", {
        scheduleId,
        taskType,
        error: error.message,
      });

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        scheduleId,
        taskType,
        error: error.message,
      });

      await recordTaskExecution(organizationId, scheduleId, false);

      metrics.increment("scheduled_task.failed", { taskType });

      emitOrgEvent(organizationId, "scheduled_task.failed", {
        scheduleId,
        taskType,
        taskName,
        error: error.message,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "scheduled-tasks",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: error.message,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }

  private async executeWorkflow(
    organizationId: string,
    workflowId: string,
    payload: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!workflow.enabled) {
      logger.warn("Skipping disabled workflow", { workflowId });
      return;
    }

    const eventId = `sched_wf_${Date.now()}`;

    await orchestrationQueue.enqueueOrchestration({
      userRequest: `Execute workflow: ${workflow.name}. Input: ${JSON.stringify(payload)}`,
      sessionId: `sched_${workflowId}_${Date.now()}`,
      organizationId,
      userId,
      eventId,
      slackChannel: "",
      slackThreadTs: "",
    });

    logger.info("Workflow execution queued", { workflowId, eventId });
  }

  private async executeBriefing(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { sendDailyBriefing } = await import("../services/daily-briefing");

    const userId = payload.userId as string;
    if (!userId) {
      throw new Error("userId required for briefing");
    }

    const result = await sendDailyBriefing(userId, organizationId);
    if (!result.success) {
      throw new Error(result.error || "Failed to send briefing");
    }

    logger.info("Daily briefing sent", { organizationId, userId });
  }

  private async executeReport(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const reportType = payload.reportType as string;
    const userId = payload.userId as string;

    logger.info("Generating scheduled report", {
      organizationId,
      reportType,
      userId,
    });

    const eventId = `sched_report_${Date.now()}`;

    await orchestrationQueue.enqueueOrchestration({
      userRequest: `Generate ${reportType} report for the organization. Include key metrics, achievements, and areas needing attention.`,
      sessionId: `sched_report_${Date.now()}`,
      organizationId,
      userId,
      eventId,
      slackChannel: "",
      slackThreadTs: "",
    });
  }

  private async executeCleanup(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const cleanupType = payload.type as string;

    logger.info("Executing cleanup task", { organizationId, cleanupType });

    switch (cleanupType) {
      case "old_sessions": {
        const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await prisma.session.deleteMany({
          where: {
            organizationId,
            lastUsedAt: { lt: sessionCutoff },
          },
        });
        break;
      }

      case "old_executions": {
        const executionCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await prisma.orchestratorExecution.deleteMany({
          where: {
            organizationId,
            createdAt: { lt: executionCutoff },
          },
        });
        break;
      }

      default:
        logger.warn("Unknown cleanup type", { cleanupType });
    }
  }

  private async executeCustomTask(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const customAction = payload.action as string;
    const customParams = payload.params as Record<string, unknown>;

    logger.info("Executing custom scheduled task", {
      organizationId,
      action: customAction,
      params: customParams,
    });

    const eventId = `sched_custom_${Date.now()}`;

    await orchestrationQueue.enqueueOrchestration({
      userRequest: `Execute custom task: ${customAction}. Parameters: ${JSON.stringify(customParams)}`,
      sessionId: `sched_custom_${Date.now()}`,
      organizationId,
      userId: "",
      eventId,
      slackChannel: "",
      slackThreadTs: "",
    });
  }
}

export const scheduledTaskWorker = new ScheduledTaskWorker();
