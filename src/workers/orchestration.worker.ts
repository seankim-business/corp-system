import { Worker, Job } from "bullmq";
import { createRedisConnection } from "../queue/base.queue";
import { OrchestrationJobData } from "../queue/orchestration.queue";
import { sendSlackThreadReply } from "../queue/notification.queue";
import { moveToDLQ } from "../queue/dead-letter.queue";
import { orchestrate } from "../orchestrator";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const concurrency = parseInt(
  process.env.QUEUE_ORCHESTRATION_CONCURRENCY || "3",
  10,
);

export const orchestrationWorker = new Worker<OrchestrationJobData>(
  "orchestration",
  async (job: Job<OrchestrationJobData>) => {
    const startTime = Date.now();
    const { organizationId, userId, sessionId, userRequest, metadata } =
      job.data;

    logger.info("Processing orchestration", {
      jobId: job.id,
      organizationId,
      userId,
      sessionId,
      source: metadata.source,
    });

    await job.updateProgress(10);

    try {
      const result = await orchestrate({
        organizationId,
        userId,
        sessionId,
        userRequest,
      });

      await job.updateProgress(90);

      logger.info("Orchestration completed", {
        jobId: job.id,
        status: result.status,
        category: result.metadata.category,
        skills: result.metadata.skills,
        duration: result.metadata.duration,
      });

      if (
        metadata.source === "slack" &&
        metadata.channelId &&
        metadata.threadTs
      ) {
        await sendSlackThreadReply(
          organizationId,
          userId,
          metadata.channelId,
          metadata.threadTs,
          result.output,
          undefined,
          job.id,
        );
      }

      metrics.increment("orchestration.completed", {
        organizationId,
        category: result.metadata.category,
        status: result.status,
      });

      metrics.timing("orchestration.duration", Date.now() - startTime, {
        category: result.metadata.category,
      });

      await job.updateProgress(100);

      return result;
    } catch (error: any) {
      logger.error("Orchestration failed", {
        jobId: job.id,
        error: error.message,
        organizationId,
      });

      metrics.increment("orchestration.failed", {
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

orchestrationWorker.on("completed", (job) => {
  logger.debug("Orchestration worker completed", {
    jobId: job.id,
    category: job.returnvalue?.metadata?.category,
    duration: job.returnvalue?.metadata?.duration,
  });
});

orchestrationWorker.on("failed", async (job, err) => {
  if (!job) return;

  logger.error("Orchestration worker failed", {
    jobId: job.id,
    error: err.message,
    attemptsMade: job.attemptsMade,
  });

  if (job.attemptsMade >= 3) {
    await moveToDLQ(job, "orchestration", err.message);

    if (
      job.data.metadata.source === "slack" &&
      job.data.metadata.channelId &&
      job.data.metadata.threadTs
    ) {
      await sendSlackThreadReply(
        job.data.organizationId,
        job.data.userId,
        job.data.metadata.channelId,
        job.data.metadata.threadTs,
        `❌ I encountered an error while processing your request:\n\n${err.message}\n\nPlease try again or contact support if the issue persists.`,
      );
    }
  }
});

orchestrationWorker.on("progress", (job, progress) => {
  logger.debug("Orchestration progress", {
    jobId: job.id,
    progress,
  });
});

orchestrationWorker.on("error", (err) => {
  logger.error("Orchestration worker error", { error: err.message });
});

logger.info("Orchestration worker started", { concurrency });
