import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { OrchestrationData } from "../queue/orchestration.queue";
import { notificationQueue } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { orchestrate } from "../orchestrator";
import { logger } from "../utils/logger";
import { buildSuccessMessage, buildErrorMessage } from "../services/slack-block-kit";
import { emitOrgEvent } from "../services/sse-service";

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

    logger.info(`Executing orchestration for event ${eventId}`, {
      sessionId,
      organizationId,
      requestPreview: userRequest.substring(0, 50),
    });

    try {
      const startTime = Date.now();

      const result = await orchestrate({
        userRequest,
        sessionId,
        organizationId,
        userId,
      });

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

      await notificationQueue.enqueueNotification({
        channel: slackChannel,
        threadTs: slackThreadTs,
        text: result.output,
        blocks: message.blocks,
        organizationId,
        userId,
        eventId,
      });

      emitOrgEvent(organizationId, "orchestration.completed", {
        eventId,
        sessionId,
        status: result.status,
        duration,
      });
    } catch (error: any) {
      logger.error(`Orchestration failed for event ${eventId}:`, error);

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
