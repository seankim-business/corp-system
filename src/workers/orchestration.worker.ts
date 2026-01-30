import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { OrchestrationData } from "../queue/orchestration.queue";
import { notificationQueue } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { orchestrate } from "../orchestrator";
import { logger } from "../utils/logger";
import { buildSuccessMessage, buildErrorMessage } from "../services/slack-block-kit";
import { emitOrgEvent } from "../services/sse-service";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { runWithContext } from "../utils/async-context";
import { getSlackProgressService } from "../services/slack-progress.service";

export class OrchestrationWorker extends BaseWorker<OrchestrationData> {
  constructor() {
    super("orchestration", {
      concurrency: 3,
      lockDuration: 300000,
      stalledInterval: 180000,
      maxStalledCount: 2,
    });
  }

  async process(job: Job<OrchestrationData>): Promise<void> {
    const { userRequest, sessionId, organizationId, userId, eventId, slackChannel, slackThreadTs } =
      job.data;

    return runWithContext({ organizationId, userId }, () =>
      this.processWithContext(job, {
        userRequest,
        sessionId,
        organizationId,
        userId,
        eventId,
        slackChannel,
        slackThreadTs,
      }),
    );
  }

  private async processWithContext(
    job: Job<OrchestrationData>,
    data: OrchestrationData,
  ): Promise<void> {
    const { userRequest, sessionId, organizationId, userId, eventId, slackChannel, slackThreadTs, threadContext } =
      data;

    await job.updateProgress(PROGRESS_PERCENTAGES.STARTED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.STARTED, PROGRESS_PERCENTAGES.STARTED, {
      eventId,
      sessionId,
    });

    // Update Slack progress message
    if (slackChannel && slackThreadTs) {
      await getSlackProgressService().updateProgress({
        eventId,
        organizationId,
        channel: slackChannel,
        threadTs: slackThreadTs,
        stage: PROGRESS_STAGES.STARTED,
        percentage: PROGRESS_PERCENTAGES.STARTED,
      });
    }

    logger.info(`Executing orchestration for event ${eventId}`, {
      sessionId,
      organizationId,
      requestPreview: userRequest.substring(0, 50),
    });

    try {
      const startTime = Date.now();

      await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.VALIDATED,
        PROGRESS_PERCENTAGES.VALIDATED,
        {
          eventId,
          action: "analyzing_request",
        },
      );

      // Update Slack progress message
      if (slackChannel && slackThreadTs) {
        await getSlackProgressService().updateProgress({
          eventId,
          organizationId,
          channel: slackChannel,
          threadTs: slackThreadTs,
          stage: PROGRESS_STAGES.VALIDATED,
          percentage: PROGRESS_PERCENTAGES.VALIDATED,
        });
      }

      const result = await orchestrate({
        userRequest,
        sessionId,
        organizationId,
        userId,
        threadContext,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.PROCESSING,
        PROGRESS_PERCENTAGES.PROCESSING,
        {
          eventId,
          category: result.metadata.category,
          skills: result.metadata.skills,
        },
      );

      // Update Slack progress message
      if (slackChannel && slackThreadTs) {
        await getSlackProgressService().updateProgress({
          eventId,
          organizationId,
          channel: slackChannel,
          threadTs: slackThreadTs,
          stage: PROGRESS_STAGES.PROCESSING,
          percentage: PROGRESS_PERCENTAGES.PROCESSING,
        });
      }

      const duration = Date.now() - startTime;

      logger.info(`Orchestration completed for event ${eventId}`, {
        duration,
        status: result.status,
      });

      const message = buildSuccessMessage({
        output: result.output,
        category: result.metadata.category,
        skills: result.metadata.skills,
        duration,
        model: result.metadata.model,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.FINALIZING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.FINALIZING,
        PROGRESS_PERCENTAGES.FINALIZING,
        {
          eventId,
          action: "sending_notification",
        },
      );

      // Update Slack progress message
      if (slackChannel && slackThreadTs) {
        await getSlackProgressService().updateProgress({
          eventId,
          organizationId,
          channel: slackChannel,
          threadTs: slackThreadTs,
          stage: PROGRESS_STAGES.FINALIZING,
          percentage: PROGRESS_PERCENTAGES.FINALIZING,
        });
      }

      await notificationQueue.enqueueNotification({
        channel: slackChannel,
        threadTs: slackThreadTs,
        text: result.output,
        blocks: message.blocks,
        organizationId,
        userId,
        eventId,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          eventId,
          duration,
          status: result.status,
        },
      );

      // Update Slack progress message
      if (slackChannel && slackThreadTs) {
        await getSlackProgressService().updateProgress({
          eventId,
          organizationId,
          channel: slackChannel,
          threadTs: slackThreadTs,
          stage: PROGRESS_STAGES.COMPLETED,
          percentage: PROGRESS_PERCENTAGES.COMPLETED,
        });
      }

      emitOrgEvent(organizationId, "orchestration.completed", {
        eventId,
        sessionId,
        status: result.status,
        duration,
      });
    } catch (error: any) {
      logger.error(`Orchestration failed for event ${eventId}:`, error);

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        eventId,
        error: error.message,
      });

      // Update Slack progress message with failure
      if (slackChannel && slackThreadTs) {
        await getSlackProgressService().updateProgress({
          eventId,
          organizationId,
          channel: slackChannel,
          threadTs: slackThreadTs,
          stage: PROGRESS_STAGES.FAILED,
          percentage: 0,
          metadata: { error: error.message },
        });
      }

      const errorMessage = buildErrorMessage({
        error: error.message,
        eventId,
      });

      await notificationQueue.enqueueNotification({
        channel: slackChannel,
        threadTs: slackThreadTs,
        text: `Error: ${error.message}`,
        blocks: errorMessage.blocks,
        organizationId,
        userId,
        eventId,
      });

      emitOrgEvent(organizationId, "orchestration.failed", {
        eventId,
        sessionId,
        error: error.message,
      });

      if (job.attemptsMade >= (job.opts.attempts || 2)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "orchestration",
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
}

export const orchestrationWorker = new OrchestrationWorker();
