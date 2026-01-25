import { Worker, Job } from "bullmq";
import { createRedisConnection } from "../queue/base.queue";
import { SlackEventJobData } from "../queue/slack-event.queue";
import { enqueueOrchestration } from "../queue/orchestration.queue";
import { sendSlackThreadReply } from "../queue/notification.queue";
import { moveToDLQ } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const concurrency = parseInt(process.env.QUEUE_SLACK_CONCURRENCY || "5", 10);

export const slackEventWorker = new Worker<SlackEventJobData>(
  "slack-events",
  async (job: Job<SlackEventJobData>) => {
    const startTime = Date.now();
    const { eventType, organizationId, userId, text, channelId, threadTs } =
      job.data;

    logger.info("Processing Slack event", {
      jobId: job.id,
      eventType,
      organizationId,
      userId,
    });

    try {
      const sessionId = `slack-${threadTs || job.id}`;

      const orchestrationJobId = await enqueueOrchestration({
        organizationId,
        userId,
        sessionId,
        userRequest: text,
        metadata: {
          source: "slack",
          channelId,
          threadTs,
        },
      });

      logger.info("Orchestration enqueued", {
        jobId: job.id,
        orchestrationJobId,
        sessionId,
      });

      metrics.increment("slack_event.processed", {
        eventType,
        organizationId,
      });

      metrics.timing("slack_event.duration", Date.now() - startTime, {
        eventType,
      });

      return {
        orchestrationJobId,
        sessionId,
      };
    } catch (error: any) {
      logger.error("Slack event processing failed", {
        jobId: job.id,
        error: error.message,
        organizationId,
      });

      metrics.increment("slack_event.failed", {
        eventType,
        organizationId,
      });

      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency,
  },
);

slackEventWorker.on("completed", (job) => {
  logger.debug("Slack event worker completed", {
    jobId: job.id,
    result: job.returnvalue,
  });
});

slackEventWorker.on("failed", async (job, err) => {
  if (!job) return;

  logger.error("Slack event worker failed", {
    jobId: job.id,
    error: err.message,
    attemptsMade: job.attemptsMade,
  });

  if (job.attemptsMade >= 3) {
    await moveToDLQ(job, "slack-events", err.message);

    if (job.data.channelId && job.data.threadTs) {
      await sendSlackThreadReply(
        job.data.organizationId,
        job.data.userId,
        job.data.channelId,
        job.data.threadTs,
        "I encountered an error processing your request. Please try again later or contact support.",
      );
    }
  }
});

slackEventWorker.on("error", (err) => {
  logger.error("Slack event worker error", { error: err.message });
});

logger.info("Slack event worker started", { concurrency });
