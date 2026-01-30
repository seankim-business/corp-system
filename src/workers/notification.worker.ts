import { Job } from "bullmq";
import { WebClient } from "@slack/web-api";
import { BaseWorker } from "../queue/base.queue";
import { NotificationData } from "../queue/notification.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { runWithContext } from "../utils/async-context";
import { markMessageComplete } from "../api/slack";
import { prepareSlackMessages } from "../utils/slack-format";

export class NotificationWorker extends BaseWorker<NotificationData> {
  constructor() {
    super("notifications", {
      concurrency: 10,
    });
  }

  async process(job: Job<NotificationData>): Promise<void> {
    const { organizationId, userId } = job.data;
    return runWithContext({ organizationId, userId }, () => this.processWithContext(job));
  }

  private async processWithContext(job: Job<NotificationData>): Promise<void> {
    const { channel, threadTs, text, eventId, organizationId } = job.data;

    await job.updateProgress(PROGRESS_PERCENTAGES.STARTED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.STARTED, PROGRESS_PERCENTAGES.STARTED, {
      eventId,
      channel,
    });

    logger.info(`Sending notification for event ${eventId}`, {
      channel,
      organizationId,
      textPreview: text.substring(0, 50),
    });

    await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.VALIDATED, PROGRESS_PERCENTAGES.VALIDATED, {
      eventId,
      action: "fetching_integration",
    });

    const integration = await getSlackIntegrationByOrg(organizationId);

    if (!integration) {
      throw new Error(`No Slack integration found for organization ${organizationId}`);
    }

    if (!integration.enabled) {
      throw new Error(`Slack integration is disabled for organization ${organizationId}`);
    }

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(
      job.id || "",
      PROGRESS_STAGES.PROCESSING,
      PROGRESS_PERCENTAGES.PROCESSING,
      {
        eventId,
        action: "creating_slack_client",
      },
    );

    const slackClient = new WebClient(integration.botToken);

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.FINALIZING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.FINALIZING,
        PROGRESS_PERCENTAGES.FINALIZING,
        {
          eventId,
          action: "posting_message",
        },
      );

      // Get the progress message timestamp if it exists
      const { redis } = await import("../db/redis");
      const progressTs = await redis.get(`slack:progress:${eventId}`);

      // Prepare chunked messages
      const messages = prepareSlackMessages(text, {
        channel,
        threadTs: threadTs,
      });

      let firstMessageTs: string | undefined;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (i === 0 && progressTs) {
          // Update the progress message with the first chunk
          try {
            const updateResult = await slackClient.chat.update({
              channel,
              ts: progressTs,
              text: msg.text,
              blocks: msg.blocks,
            });
            firstMessageTs = updateResult.ts;

            // Delete progress key since we've updated it
            await redis.del(`slack:progress:${eventId}`);
          } catch (updateError) {
            // If update fails, fall back to posting new message
            logger.warn("Failed to update progress message, posting new", {
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
            const postResult = await slackClient.chat.postMessage({
              channel: msg.channel,
              text: msg.text,
              thread_ts: msg.thread_ts,
              blocks: msg.blocks,
            });
            firstMessageTs = postResult.ts;
          }
        } else {
          // Post subsequent chunks or first message if no progress message
          const result = await slackClient.chat.postMessage({
            channel: msg.channel,
            text: msg.text,
            thread_ts: msg.thread_ts || firstMessageTs,
            blocks: msg.blocks,
          });

          if (i === 0) {
            firstMessageTs = result.ts;
          }
        }
      }

      // Store bot message timestamp for feedback tracking (use first message ts)
      if (firstMessageTs && eventId) {
        await redis.set(`slack:bot_message:${eventId}`, firstMessageTs, 86400); // 24 hour expiry
        // Also store reverse mapping: message timestamp -> eventId
        await redis.set(`slack:bot_message_reverse:${channel}:${firstMessageTs}`, eventId, 86400);

        // Mark the original message as complete with check mark (OpenClaw-style ack)
        const originalTs = await redis.get(`slack:original_ts:${eventId}`);
        if (originalTs) {
          await markMessageComplete(slackClient, channel, originalTs);
          await redis.del(`slack:original_ts:${eventId}`);
        }
      }

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.COMPLETED,
        PROGRESS_PERCENTAGES.COMPLETED,
        {
          eventId,
          status: "sent",
        },
      );

      logger.info(`Notification sent for event ${eventId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send notification for event ${eventId}:`, { error: errorMessage });

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        eventId,
        error: errorMessage,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "notifications",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: errorMessage,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const notificationWorker = new NotificationWorker();
