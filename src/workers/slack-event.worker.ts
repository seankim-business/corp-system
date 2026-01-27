import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { SlackEventData } from "../queue/slack-event.queue";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";

export class SlackEventWorker extends BaseWorker<SlackEventData> {
  constructor() {
    super("slack-events", {
      concurrency: 5,
    });
  }

  async process(job: Job<SlackEventData>): Promise<void> {
    const { eventId, text, channel, user, ts, organizationId, userId, sessionId } = job.data;

    await job.updateProgress(20);
    logger.info(`Processing Slack event ${eventId}`, {
      channel,
      user,
      textPreview: text.substring(0, 50),
    });

    try {
      await job.updateProgress(50);
      await orchestrationQueue.enqueueOrchestration({
        userRequest: text,
        sessionId,
        organizationId,
        userId,
        eventId,
        slackChannel: channel,
        slackThreadTs: ts,
      });

      await job.updateProgress(100);
      logger.info(`Enqueued orchestration for event ${eventId}`);
    } catch (error: any) {
      logger.error(`Failed to process Slack event ${eventId}:`, error);

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
