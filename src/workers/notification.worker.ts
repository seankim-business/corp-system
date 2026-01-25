import { Worker, Job } from "bullmq";
import { App as SlackApp } from "@slack/bolt";
import { createRedisConnection } from "../queue/base.queue";
import { NotificationJobData } from "../queue/notification.queue";
import { moveToDLQ } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const concurrency = parseInt(
  process.env.QUEUE_NOTIFICATION_CONCURRENCY || "10",
  10,
);

const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

export const notificationWorker = new Worker<NotificationJobData>(
  "notifications",
  async (job: Job<NotificationJobData>) => {
    const startTime = Date.now();
    const { type, organizationId, message, richContent } = job.data;

    logger.info("Processing notification", {
      jobId: job.id,
      type,
      organizationId,
    });

    try {
      if (
        type === "slack_thread" &&
        job.data.slackChannel &&
        job.data.slackThreadTs
      ) {
        await slackApp.client.chat.postMessage({
          channel: job.data.slackChannel,
          thread_ts: job.data.slackThreadTs,
          text: message,
          blocks: richContent?.blocks,
        });

        logger.info("Slack thread reply sent", {
          jobId: job.id,
          channel: job.data.slackChannel,
          threadTs: job.data.slackThreadTs,
        });
      } else if (type === "slack_dm" && job.data.slackUserId) {
        const dmChannel = await slackApp.client.conversations.open({
          users: job.data.slackUserId,
        });

        await slackApp.client.chat.postMessage({
          channel: dmChannel.channel!.id!,
          text: message,
          blocks: richContent?.blocks,
        });

        logger.info("Slack DM sent", {
          jobId: job.id,
          userId: job.data.slackUserId,
        });
      } else if (type === "email") {
        logger.warn("Email notifications not implemented yet", {
          jobId: job.id,
        });
      } else if (type === "webhook") {
        logger.warn("Webhook notifications not implemented yet", {
          jobId: job.id,
        });
      }

      metrics.increment("notification.sent", {
        type,
        organizationId,
      });

      metrics.timing("notification.duration", Date.now() - startTime, {
        type,
      });

      return { sent: true };
    } catch (error: any) {
      logger.error("Notification failed", {
        jobId: job.id,
        type,
        error: error.message,
        organizationId,
      });

      metrics.increment("notification.failed", {
        type,
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

notificationWorker.on("completed", (job) => {
  logger.debug("Notification worker completed", {
    jobId: job.id,
    type: job.data.type,
  });
});

notificationWorker.on("failed", async (job, err) => {
  if (!job) return;

  logger.error("Notification worker failed", {
    jobId: job.id,
    type: job.data.type,
    error: err.message,
    attemptsMade: job.attemptsMade,
  });

  if (job.attemptsMade >= 5) {
    await moveToDLQ(job, "notifications", err.message);
  }
});

notificationWorker.on("error", (err) => {
  logger.error("Notification worker error", { error: err.message });
});

logger.info("Notification worker started", { concurrency });
