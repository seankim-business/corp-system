import { WebClient } from "@slack/web-api";
import { logger } from "../../utils/logger";
import { getSlackIntegrationByOrg } from "../../api/slack-integration";

/**
 * Agent activity data structure for Slack notifications
 */
export interface AgentActivity {
  id: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  agentType: string;
  model: string;
  category: string;
  taskDescription: string;
  status: "started" | "in_progress" | "completed" | "failed";
  progress?: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  result?: {
    summary?: string;
    filesModified?: string[];
    tokensUsed?: number;
    error?: string;
  };
}

/**
 * Rate limiting state for message updates
 */
interface UpdateThrottle {
  lastUpdateTs: number;
  lastProgress: number;
}

const updateThrottles = new Map<string, UpdateThrottle>();
const UPDATE_INTERVAL_MS = 10000; // 10 seconds minimum between updates
const PROGRESS_THRESHOLD = 5; // Only update if progress changed by 5%+

/**
 * SlackActivityService - Posts agent activities to #it-test channel with @Nubabel mentions
 *
 * Features:
 * - Rich Block Kit formatting
 * - Message threading for progress updates
 * - Rate limiting (max 1 update per 10 seconds)
 * - Real-time notifications
 */
export class SlackActivityService {
  private channelName = "it-test";
  private nubabelBotUserId: string | null = null;

  /**
   * Get Slack WebClient for organization
   */
  private async getClient(organizationId: string): Promise<WebClient | null> {
    try {
      const integration = await getSlackIntegrationByOrg(organizationId);

      if (!integration || !integration.enabled || !integration.botToken) {
        logger.debug("No active Slack integration for organization", { organizationId });
        return null;
      }

      return new WebClient(integration.botToken);
    } catch (error) {
      logger.error(
        "Failed to get Slack client",
        { organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Get Nubabel bot user ID (cached)
   */
  private async getNubabelBotUserId(client: WebClient): Promise<string> {
    if (this.nubabelBotUserId) {
      return this.nubabelBotUserId;
    }

    try {
      // Try environment variable first
      if (process.env.NUBABEL_BOT_USER_ID) {
        this.nubabelBotUserId = process.env.NUBABEL_BOT_USER_ID;
        return this.nubabelBotUserId;
      }

      // Fallback: Get from auth.test
      const authResult = await client.auth.test();
      if (authResult.user_id) {
        this.nubabelBotUserId = authResult.user_id;
        return this.nubabelBotUserId;
      }

      throw new Error("Could not determine bot user ID");
    } catch (error) {
      logger.error(
        "Failed to get Nubabel bot user ID",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      // Fallback to generic mention
      return "UNKNOWN";
    }
  }

  /**
   * Get channel ID for #it-test
   */
  private async getChannelId(client: WebClient): Promise<string | null> {
    try {
      const result = await client.conversations.list({
        types: "public_channel,private_channel",
        limit: 1000,
      });

      const channel = result.channels?.find((ch) => ch.name === this.channelName);

      if (!channel?.id) {
        logger.warn(`Channel #${this.channelName} not found`);
        return null;
      }

      return channel.id;
    } catch (error) {
      logger.error(
        "Failed to get channel ID",
        { channelName: this.channelName },
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Truncate text to max length with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Format timestamp for Slack (relative time)
   */
  private formatTimestamp(date: Date): string {
    const unixTimestamp = Math.floor(date.getTime() / 1000);
    return `<!date^${unixTimestamp}^{date_short_pretty} at {time}|${date.toISOString()}>`;
  }

  /**
   * Calculate duration in human-readable format
   */
  private formatDuration(startedAt: Date, completedAt: Date): string {
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Build progress bar (10 blocks)
   */
  private buildProgressBar(progress: number): string {
    const filled = Math.floor(progress / 10);
    const empty = 10 - filled;
    return "▓".repeat(filled) + "░".repeat(empty);
  }

  /**
   * Check if update should be throttled
   */
  private shouldThrottle(activityId: string, progress?: number): boolean {
    const throttle = updateThrottles.get(activityId);

    if (!throttle) {
      return false; // First update, allow
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - throttle.lastUpdateTs;

    // Always allow if enough time has passed
    if (timeSinceLastUpdate >= UPDATE_INTERVAL_MS) {
      return false;
    }

    // If progress provided, check if it changed significantly
    if (progress !== undefined) {
      const progressDelta = Math.abs(progress - throttle.lastProgress);
      if (progressDelta >= PROGRESS_THRESHOLD) {
        return false; // Significant progress change, allow
      }
    }

    return true; // Throttle
  }

  /**
   * Update throttle state
   */
  private updateThrottle(activityId: string, progress: number): void {
    updateThrottles.set(activityId, {
      lastUpdateTs: Date.now(),
      lastProgress: progress,
    });
  }

  /**
   * Post agent start notification
   *
   * @returns Message timestamp (ts) for threading, or null if failed
   */
  async postAgentStart(activity: AgentActivity): Promise<string | null> {
    try {
      const client = await this.getClient(activity.organizationId);
      if (!client) return null;

      const channelId = await this.getChannelId(client);
      if (!channelId) return null;

      const botUserId = await this.getNubabelBotUserId(client);
      const truncatedTask = this.truncate(activity.taskDescription, 500);

      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🤖 Agent Started",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${botUserId}> *New agent activity detected*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Agent Type:*\n\`${activity.agentType}\``,
            },
            {
              type: "mrkdwn",
              text: `*Model:*\n\`${activity.model}\``,
            },
            {
              type: "mrkdwn",
              text: `*Category:*\n\`${activity.category}\``,
            },
            {
              type: "mrkdwn",
              text: `*Started:*\n${this.formatTimestamp(activity.startedAt)}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Task Description:*\n${truncatedTask}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Session: \`${activity.sessionId.substring(0, 8)}\` | Activity: \`${activity.id.substring(0, 8)}\``,
            },
          ],
        },
      ];

      const result = await client.chat.postMessage({
        channel: channelId,
        text: `🤖 Agent Started: ${activity.agentType}`,
        blocks,
      });

      if (!result.ok || !result.ts) {
        logger.error("Failed to post agent start message", { activity: activity.id });
        return null;
      }

      logger.info("Posted agent start notification", {
        activityId: activity.id,
        messageTs: result.ts,
        channel: this.channelName,
      });

      // Initialize throttle
      this.updateThrottle(activity.id, 0);

      return result.ts;
    } catch (error) {
      logger.error(
        "Failed to post agent start notification",
        { activityId: activity.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Update agent progress (threaded reply)
   *
   * Rate limited: max 1 update per 10 seconds, or if progress changed by 5%+
   */
  async updateAgentProgress(activity: AgentActivity, messageTs: string): Promise<void> {
    try {
      // Check throttle
      if (this.shouldThrottle(activity.id, activity.progress)) {
        logger.debug("Throttled progress update", {
          activityId: activity.id,
          progress: activity.progress,
        });
        return;
      }

      const client = await this.getClient(activity.organizationId);
      if (!client) return;

      const channelId = await this.getChannelId(client);
      if (!channelId) return;

      const progress = activity.progress ?? 0;
      const progressBar = this.buildProgressBar(progress);

      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⏳ *In Progress*\n\n${progressBar} ${progress}%`,
          },
        },
      ];

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: `⏳ Progress: ${progress}%`,
        blocks,
      });

      // Update throttle
      this.updateThrottle(activity.id, progress);

      logger.debug("Updated agent progress", {
        activityId: activity.id,
        progress,
        messageTs,
      });
    } catch (error) {
      logger.error(
        "Failed to update agent progress",
        { activityId: activity.id },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Post agent completion (update original message)
   */
  async postAgentComplete(activity: AgentActivity, messageTs: string): Promise<void> {
    try {
      const client = await this.getClient(activity.organizationId);
      if (!client) return;

      const channelId = await this.getChannelId(client);
      if (!channelId) return;

      const botUserId = await this.getNubabelBotUserId(client);
      const isSuccess = activity.status === "completed";
      const statusEmoji = isSuccess ? "✅" : "❌";
      const statusText = isSuccess ? "Completed" : "Failed";

      const duration = activity.completedAt
        ? this.formatDuration(activity.startedAt, activity.completedAt)
        : "N/A";

      const truncatedTask = this.truncate(activity.taskDescription, 500);

      const blocks: any[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${statusEmoji} Agent ${statusText}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${botUserId}> *Agent activity ${statusText.toLowerCase()}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Agent Type:*\n\`${activity.agentType}\``,
            },
            {
              type: "mrkdwn",
              text: `*Model:*\n\`${activity.model}\``,
            },
            {
              type: "mrkdwn",
              text: `*Category:*\n\`${activity.category}\``,
            },
            {
              type: "mrkdwn",
              text: `*Duration:*\n${duration}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Task Description:*\n${truncatedTask}`,
          },
        },
      ];

      // Add result summary
      if (isSuccess && activity.result?.summary) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Result:*\n${this.truncate(activity.result.summary, 300)}`,
          },
        });
      }

      // Add error message
      if (!isSuccess && activity.result?.error) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error:*\n\`\`\`${this.truncate(activity.result.error, 300)}\`\`\``,
          },
        });
      }

      // Add metadata
      const metadataElements: string[] = [];

      if (activity.result?.filesModified && activity.result.filesModified.length > 0) {
        const fileCount = activity.result.filesModified.length;
        const fileList = activity.result.filesModified.slice(0, 3).join(", ");
        const moreFiles = fileCount > 3 ? ` (+${fileCount - 3} more)` : "";
        metadataElements.push(`📁 Files: ${fileList}${moreFiles}`);
      }

      if (activity.result?.tokensUsed) {
        metadataElements.push(`🎫 Tokens: ${activity.result.tokensUsed.toLocaleString()}`);
      }

      metadataElements.push(
        `Session: \`${activity.sessionId.substring(0, 8)}\` | Activity: \`${activity.id.substring(0, 8)}\``,
      );

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: metadataElements.join(" | "),
          },
        ],
      });

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `${statusEmoji} Agent ${statusText}: ${activity.agentType}`,
        blocks,
      });

      logger.info("Updated agent completion message", {
        activityId: activity.id,
        status: activity.status,
        messageTs,
      });

      // Clean up throttle
      updateThrottles.delete(activity.id);
    } catch (error) {
      logger.error(
        "Failed to post agent completion",
        { activityId: activity.id },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/**
 * Singleton instance
 */
export const slackActivityService = new SlackActivityService();
