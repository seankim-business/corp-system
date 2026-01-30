/**
 * Slack Agent Notifier Service
 * Sends agent activity notifications to Slack channels
 */

import { WebClient } from "@slack/web-api";
import { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";
import { activityHub, ActivityEvent } from "../activity-hub";

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface SlackNotifierConfig {
  defaultChannel?: string;
  notifyOnStart?: boolean;
  notifyOnProgress?: boolean;
  notifyOnComplete?: boolean;
  notifyOnFailed?: boolean;
  notifyOnToolUse?: boolean;
}

// ============================================================================
// Slack Agent Notifier Service
// ============================================================================

export class SlackAgentNotifier {
  private client: WebClient | null = null;
  private config: SlackNotifierConfig;

  constructor(config: SlackNotifierConfig = {}) {
    this.config = {
      notifyOnStart: true,
      notifyOnProgress: false, // Too noisy by default
      notifyOnComplete: true,
      notifyOnFailed: true,
      notifyOnToolUse: false,
      ...config,
    };
  }

  /**
   * Initialize with Slack client
   */
  initialize(slackClient: WebClient): void {
    this.client = slackClient;

    // Subscribe to activity hub events
    activityHub.on("execution:start", (event: ActivityEvent) => {
      if (this.config.notifyOnStart) {
        this.notifyExecutionStart(event).catch((e) =>
          logger.error("Failed to notify execution start", { error: e })
        );
      }
    });

    activityHub.on("execution:complete", (event: ActivityEvent) => {
      if (this.config.notifyOnComplete) {
        this.notifyExecutionComplete(event).catch((e) =>
          logger.error("Failed to notify execution complete", { error: e })
        );
      }
    });

    activityHub.on("execution:failed", (event: ActivityEvent) => {
      if (this.config.notifyOnFailed) {
        this.notifyExecutionFailed(event).catch((e) =>
          logger.error("Failed to notify execution failed", { error: e })
        );
      }
    });

    activityHub.on("tool:call", (event: ActivityEvent) => {
      if (this.config.notifyOnToolUse) {
        this.notifyToolCall(event).catch((e) =>
          logger.error("Failed to notify tool call", { error: e })
        );
      }
    });

    logger.info("Slack Agent Notifier initialized");
  }

  /**
   * Notify execution start
   */
  async notifyExecutionStart(event: ActivityEvent): Promise<void> {
    if (!this.client) return;

    const execution = await prisma.agentExecution.findUnique({
      where: { id: event.executionId },
      include: { agent: { select: { displayName: true, avatar: true, position: true } } },
    });

    if (!execution || !execution.slackChannelId) return;

    const agentName = execution.agent.displayName || event.agentName;
    const agentEmoji = execution.agent.avatar || ":robot_face:";

    const message = await this.client.chat.postMessage({
      channel: execution.slackChannelId,
      thread_ts: execution.slackThreadTs || undefined,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${agentEmoji} *${agentName}* started working`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `> ${this.truncate(execution.taskDescription, 200)}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Position:* ${execution.agent.position || "Agent"} | *Status:* 🔄 In Progress`,
            },
          ],
        },
      ],
    });

    // Store message ts for threading updates
    if (message.ts && !execution.slackMessageTs) {
      await prisma.agentExecution.update({
        where: { id: execution.id },
        data: { slackMessageTs: message.ts },
      });
    }

    logger.debug("Sent execution start notification", {
      executionId: event.executionId,
      channel: execution.slackChannelId,
    });
  }

  /**
   * Notify execution complete
   */
  async notifyExecutionComplete(event: ActivityEvent): Promise<void> {
    if (!this.client) return;

    const execution = await prisma.agentExecution.findUnique({
      where: { id: event.executionId },
      include: { agent: { select: { displayName: true, avatar: true } } },
    });

    if (!execution || !execution.slackChannelId) return;

    const agentName = execution.agent.displayName || event.agentName;
    const durationSec = execution.durationMs ? Math.round(execution.durationMs / 1000) : 0;

    await this.client.chat.postMessage({
      channel: execution.slackChannelId,
      thread_ts: execution.slackThreadTs || execution.slackMessageTs || undefined,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *${agentName}* completed in ${durationSec}s`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Execution ID: \`${execution.id.slice(0, 8)}\``,
            },
          ],
        },
      ],
    });

    logger.debug("Sent execution complete notification", {
      executionId: event.executionId,
    });
  }

  /**
   * Notify execution failed
   */
  async notifyExecutionFailed(event: ActivityEvent): Promise<void> {
    if (!this.client) return;

    const execution = await prisma.agentExecution.findUnique({
      where: { id: event.executionId },
      include: { agent: { select: { displayName: true, avatar: true } } },
    });

    if (!execution || !execution.slackChannelId) return;

    const agentName = execution.agent.displayName || event.agentName;
    const errorMessage = execution.errorMessage || "Unknown error";

    await this.client.chat.postMessage({
      channel: execution.slackChannelId,
      thread_ts: execution.slackThreadTs || execution.slackMessageTs || undefined,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *${agentName}* failed`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`\`\`${this.truncate(errorMessage, 300)}\`\`\``,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Execution ID: \`${execution.id.slice(0, 8)}\` | Error Type: \`${execution.errorType || "unknown"}\``,
            },
          ],
        },
      ],
    });

    logger.debug("Sent execution failed notification", {
      executionId: event.executionId,
    });
  }

  /**
   * Notify tool call
   */
  async notifyToolCall(event: ActivityEvent): Promise<void> {
    if (!this.client) return;

    const execution = await prisma.agentExecution.findUnique({
      where: { id: event.executionId },
    });

    if (!execution || !execution.slackChannelId || !execution.slackMessageTs) return;

    const toolName = event.data.toolName as string;

    await this.client.chat.postMessage({
      channel: execution.slackChannelId,
      thread_ts: execution.slackMessageTs,
      text: `🔧 Using tool: \`${toolName}\``,
    });

    logger.debug("Sent tool call notification", {
      executionId: event.executionId,
      toolName,
    });
  }

  /**
   * Notify delegation between agents
   */
  async notifyDelegation(
    fromAgentName: string,
    toAgentName: string,
    taskDescription: string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    if (!this.client) return;

    await this.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `↪️ *${fromAgentName}* delegated to *${toAgentName}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `> ${this.truncate(taskDescription, 150)}`,
          },
        },
      ],
    });

    logger.debug("Sent delegation notification", {
      from: fromAgentName,
      to: toAgentName,
    });
  }

  /**
   * Notify escalation to manager
   */
  async notifyEscalation(
    fromAgentName: string,
    toManagerName: string,
    reason: string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    if (!this.client) return;

    await this.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⬆️ *${fromAgentName}* escalated to *${toManagerName}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `_Reason:_ ${this.truncate(reason, 200)}`,
          },
        },
      ],
    });

    logger.debug("Sent escalation notification", {
      from: fromAgentName,
      to: toManagerName,
    });
  }

  /**
   * Update progress in existing message
   */
  async updateProgress(
    executionId: string,
    progress: number,
    currentAction: string
  ): Promise<void> {
    if (!this.client) return;

    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      include: { agent: { select: { displayName: true, avatar: true } } },
    });

    if (!execution || !execution.slackChannelId || !execution.slackMessageTs) return;

    const agentName = execution.agent.displayName || "Agent";
    const agentEmoji = execution.agent.avatar || ":robot_face:";
    const progressBar = this.createProgressBar(progress);

    await this.client.chat.update({
      channel: execution.slackChannelId,
      ts: execution.slackMessageTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${agentEmoji} *${agentName}* is working...`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${progressBar} ${progress}%\n_${currentAction}_`,
          },
        },
      ],
    });
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
  }

  private createProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "▓".repeat(filled) + "░".repeat(empty);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const slackAgentNotifier = new SlackAgentNotifier();
export default slackAgentNotifier;
