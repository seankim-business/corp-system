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
import { slackStatusUpdater } from "../services/slack-status-updater";
import { agentActivityService } from "../services/monitoring/agent-activity.service";

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

    // Track agent start for Activity page real-time monitoring
    let activityId: string | undefined;
    try {
      activityId = await agentActivityService.trackStart({
        organizationId,
        sessionId,
        agentType: "orchestrator",
        agentName: "Nubabel Orchestrator",
        category: "orchestration",
        inputData: { userRequest: userRequest.substring(0, 200), eventId },
        metadata: { jobId: job.id, slackChannel, slackThreadTs },
      });
      logger.info(`Agent activity tracking started for event ${eventId}`, { activityId });
    } catch (activityErr) {
      logger.error(`Failed to track agent start for event ${eventId}`, { error: String(activityErr) });
    }

    // Store Slack context and update status with thinking messages
    if (eventId && slackChannel && slackThreadTs) {
      await slackStatusUpdater.storeContext(eventId, {
        channelId: slackChannel,
        threadTs: slackThreadTs,
        organizationId,
        locale: "en",
      });
      await slackStatusUpdater.updateStageStatusWithThinking(eventId, "analyzing");
    }

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

      // Update Slack status with thinking messages
      if (eventId) {
        await slackStatusUpdater.updateStageStatusWithThinking(eventId, "selectingApproach");
      }

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
        eventId,
      });

      // Track orchestration progress
      if (activityId) {
        try {
          await agentActivityService.trackProgress(activityId, {
            message: `Processing with ${result.metadata.category}`,
            progress: 60,
            metadata: { category: result.metadata.category, skills: result.metadata.skills },
          });
        } catch (progressErr) {
          logger.error(`Failed to track agent progress for event ${eventId}`, { error: String(progressErr) });
        }
      }

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

      // Update Slack status
      if (eventId) {
        await slackStatusUpdater.updateStageStatusWithThinking(eventId, "processing");
      }

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

      // Update Slack status
      if (eventId) {
        await slackStatusUpdater.updateStageStatusWithThinking(eventId, "generating");
      }

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

      // Determine agent type for dynamic identity based on category/skills
      // MCP providers take priority, then fall back to "generating" for response
      const mcpProviders = ["notion", "linear", "github", "slack"];
      const detectedProvider = result.metadata.skills?.find((s: string) =>
        mcpProviders.some((p) => s.toLowerCase().includes(p)),
      );
      const agentType = detectedProvider
        ? mcpProviders.find((p) => detectedProvider.toLowerCase().includes(p)) || "generating"
        : "generating";

      await notificationQueue.enqueueNotification({
        channel: slackChannel,
        threadTs: slackThreadTs,
        text: result.output,
        blocks: message.blocks,
        organizationId,
        userId,
        eventId,
        agentType,
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

      // Clear Slack status on completion
      if (eventId) {
        await slackStatusUpdater.clearStatus(eventId);
      }

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

      // Track agent completion for Activity page
      if (activityId) {
        try {
          await agentActivityService.trackComplete(activityId, {
            outputData: {
              status: result.status,
              category: result.metadata.category,
              skills: result.metadata.skills,
              model: result.metadata.model,
            },
            metadata: { duration, eventId },
          });
          logger.info(`Agent activity tracking completed for event ${eventId}`, { activityId });
        } catch (completeErr) {
          logger.error(`Failed to track agent completion for event ${eventId}`, { error: String(completeErr) });
        }
      }
    } catch (error: any) {
      logger.error(`Orchestration failed for event ${eventId}:`, error);

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        eventId,
        error: error.message,
      });

      // Clear Slack status on failure
      if (eventId) {
        await slackStatusUpdater.clearStatus(eventId);
      }

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

      // Track agent failure for Activity page
      if (activityId) {
        try {
          await agentActivityService.trackComplete(activityId, {
            errorMessage: error.message,
            metadata: { eventId, attemptsMade: job.attemptsMade },
          });
          logger.info(`Agent activity tracking failed for event ${eventId}`, { activityId });
        } catch (failErr) {
          logger.error(`Failed to track agent failure for event ${eventId}`, { error: String(failErr) });
        }
      }

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
