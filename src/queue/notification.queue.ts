import { Queue } from "bullmq";
import { createQueue, defaultRateLimits } from "./base.queue";

/**
 * Notification Queue
 *
 * Processes notification delivery asynchronously:
 * - Slack thread replies
 * - Slack DMs
 * - Email notifications (future)
 * - Webhook callbacks (future)
 *
 * Benefits:
 * - Decoupled notification logic
 * - Retry on delivery failures
 * - Bulk notification support
 * - Rate limiting per channel
 */

export type NotificationType =
  | "slack_thread"
  | "slack_dm"
  | "email"
  | "webhook";

export interface NotificationJobData {
  type: NotificationType;
  organizationId: string;
  userId: string;

  // Slack-specific
  slackChannel?: string;
  slackThreadTs?: string;
  slackUserId?: string;

  // Notification content
  title?: string;
  message: string;
  richContent?: Record<string, any>; // Slack Block Kit or HTML email

  // Metadata
  metadata?: Record<string, any>;
  relatedJobId?: string; // Link to orchestration job
}

export const notificationQueue: Queue<NotificationJobData> = createQueue(
  "notifications",
  {
    defaultJobOptions: {
      attempts: 5, // More retries for notifications (transient failures)
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      // Rate limiting: 200 notifications per minute
      ...defaultRateLimits["notifications"],
    },
  },
);

/**
 * Send a notification
 */
export async function sendNotification(data: NotificationJobData) {
  const job = await notificationQueue.add(
    `${data.type}-${data.organizationId}`,
    data,
    {
      // Job-specific options
      priority: data.type === "slack_thread" ? 1 : 5, // Prioritize Slack thread replies
      removeOnComplete: true,
    },
  );

  return job;
}

/**
 * Send a Slack thread reply notification
 */
export async function sendSlackThreadReply(
  organizationId: string,
  userId: string,
  channel: string,
  threadTs: string,
  message: string,
  richContent?: Record<string, any>,
  relatedJobId?: string,
) {
  return sendNotification({
    type: "slack_thread",
    organizationId,
    userId,
    slackChannel: channel,
    slackThreadTs: threadTs,
    message,
    richContent,
    relatedJobId,
  });
}

/**
 * Send a Slack DM notification
 */
export async function sendSlackDM(
  organizationId: string,
  userId: string,
  slackUserId: string,
  message: string,
  richContent?: Record<string, any>,
) {
  return sendNotification({
    type: "slack_dm",
    organizationId,
    userId,
    slackUserId,
    message,
    richContent,
  });
}

/**
 * Get pending notifications for an organization
 */
export async function getPendingNotifications(organizationId: string) {
  const jobs = await notificationQueue.getJobs([
    "waiting",
    "active",
    "delayed",
  ]);
  return jobs.filter((job) => job.data.organizationId === organizationId);
}
