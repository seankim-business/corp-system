import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { SlackEventData } from "../queue/slack-event.queue";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { runWithContext } from "../utils/async-context";

export class SlackEventWorker extends BaseWorker<SlackEventData> {
  constructor() {
    super("slack-events", {
      concurrency: 5,
    });
  }

  async process(job: Job<SlackEventData>): Promise<void> {
    const { organizationId, userId } = job.data;
    return runWithContext({ organizationId, userId }, () => this.processWithContext(job));
  }

  private async processWithContext(job: Job<SlackEventData>): Promise<void> {
    const { eventId, text, channel, user, ts, organizationId, userId, sessionId } = job.data;

    await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.VALIDATED, PROGRESS_PERCENTAGES.VALIDATED, {
      eventId,
      channel,
    });

    logger.info(`Processing Slack event ${eventId}`, {
      channel,
      user,
      textPreview: text.substring(0, 50),
    });

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.PROCESSING,
        PROGRESS_PERCENTAGES.PROCESSING,
        {
          eventId,
          action: "enqueuing_orchestration",
        },
      );

      await orchestrationQueue.enqueueOrchestration({
        userRequest: text,
        sessionId,
        organizationId,
        userId,
        eventId,
        slackChannel: channel,
        slackThreadTs: ts,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          eventId,
          status: "orchestration_enqueued",
        },
      );

      logger.info(`Enqueued orchestration for event ${eventId}`);
    } catch (error: any) {
      logger.error(`Failed to process Slack event ${eventId}:`, error);

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        eventId,
        error: error.message,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "slack-events",
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

export const slackEventWorker = new SlackEventWorker();
