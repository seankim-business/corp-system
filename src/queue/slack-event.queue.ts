import { Queue } from "bullmq";
import { createQueue, defaultRateLimits } from "./base.queue";

/**
 * Slack Event Queue
 *
 * Processes Slack events asynchronously:
 * - app_mention
 * - direct_message
 * - slash_command
 * - interactive components
 *
 * Benefits:
 * - Non-blocking Slack event handlers (<100ms response)
 * - Rate limiting per organization
 * - Retry with exponential backoff
 * - Dead letter queue for failures
 */

export interface SlackEventJobData {
  eventType: "app_mention" | "direct_message" | "slash_command" | "interactive";
  organizationId: string;
  userId: string;
  slackUserId: string;
  slackWorkspaceId: string;
  channelId: string;
  threadTs?: string;
  text: string;
  event: Record<string, any>; // Full Slack event payload
  metadata?: Record<string, any>;
}

export const slackEventQueue: Queue<SlackEventJobData> = createQueue(
  "slack-events",
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      // Rate limiting: 100 events per minute per organization
      ...defaultRateLimits["slack-events"],
    },
  },
);

/**
 * Add a Slack event to the queue
 */
export async function enqueueSlackEvent(data: SlackEventJobData) {
  const job = await slackEventQueue.add(
    `${data.eventType}-${data.organizationId}`,
    data,
    {
      // Job-specific options
      jobId: `${data.eventType}-${data.slackWorkspaceId}-${data.event.ts || Date.now()}`,
      removeOnComplete: true, // Remove after processing (logged elsewhere)
      removeOnFail: {
        age: 24 * 3600, // Keep failures for 24 hours
      },
    },
  );

  return job;
}

/**
 * Get pending Slack events for an organization
 */
export async function getPendingSlackEvents(organizationId: string) {
  const jobs = await slackEventQueue.getJobs(["waiting", "active", "delayed"]);
  return jobs.filter((job) => job.data.organizationId === organizationId);
}
