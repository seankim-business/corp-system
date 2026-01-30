/**
 * AR Slack Notifier Service
 *
 * Sends AR-specific notifications to Slack:
 * - Assignment changes (new, updated, ended)
 * - Approval requests with interactive buttons
 * - Daily reports and summaries
 * - Health alerts and warnings
 * - Coaching session reminders
 */

import { WebClient, KnownBlock } from "@slack/web-api";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type ARNotificationType =
  | 'assignment_created'
  | 'assignment_updated'
  | 'assignment_ended'
  | 'approval_requested'
  | 'approval_decided'
  | 'approval_escalated'
  | 'daily_report'
  | 'health_alert'
  | 'workload_warning'
  | 'coaching_reminder'
  | 'recommendation';

export interface ARNotificationPayload {
  type: ARNotificationType;
  organizationId: string;
  data: Record<string, unknown>;
  recipientUserId?: string;
  recipientChannelId?: string;
  threadTs?: string;
}

export interface SlackApprovalAction {
  requestId: string;
  action: 'approve' | 'reject';
  responderId: string;
  note?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ARSlackNotifierService {
  private client: WebClient | null = null;
  private defaultChannel: string | null = null;

  /**
   * Initialize with Slack client
   */
  initialize(slackClient: WebClient, defaultChannel?: string): void {
    this.client = slackClient;
    this.defaultChannel = defaultChannel || null;
    logger.info("AR Slack Notifier initialized");
  }

  /**
   * Send notification based on type
   */
  async sendNotification(payload: ARNotificationPayload): Promise<string | null> {
    if (!this.client) {
      logger.warn("AR Slack Notifier not initialized");
      return null;
    }

    try {
      switch (payload.type) {
        case 'assignment_created':
          return await this.notifyAssignmentCreated(payload);
        case 'assignment_updated':
          return await this.notifyAssignmentUpdated(payload);
        case 'assignment_ended':
          return await this.notifyAssignmentEnded(payload);
        case 'approval_requested':
          return await this.notifyApprovalRequested(payload);
        case 'approval_decided':
          return await this.notifyApprovalDecided(payload);
        case 'approval_escalated':
          return await this.notifyApprovalEscalated(payload);
        case 'daily_report':
          return await this.notifyDailyReport(payload);
        case 'health_alert':
          return await this.notifyHealthAlert(payload);
        case 'workload_warning':
          return await this.notifyWorkloadWarning(payload);
        case 'coaching_reminder':
          return await this.notifyCoachingReminder(payload);
        case 'recommendation':
          return await this.notifyRecommendation(payload);
        default:
          logger.warn("Unknown AR notification type", { type: payload.type });
          return null;
      }
    } catch (error) {
      logger.error("Failed to send AR notification", {
        type: payload.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ===========================================================================
  // ASSIGNMENT NOTIFICATIONS
  // ===========================================================================

  private async notifyAssignmentCreated(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { agentName, positionTitle, departmentName, assignmentType } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "👤 New Agent Assignment",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Agent:*\n${agentName}`,
            },
            {
              type: "mrkdwn",
              text: `*Position:*\n${positionTitle}`,
            },
            {
              type: "mrkdwn",
              text: `*Department:*\n${departmentName}`,
            },
            {
              type: "mrkdwn",
              text: `*Type:*\n${assignmentType}`,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 Assigned: ${new Date().toLocaleDateString()}`,
            },
          ],
        },
      ],
    });

    return response.ts || null;
  }

  private async notifyAssignmentUpdated(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { agentName, changes } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const changesList = Object.entries(changes as Record<string, { from: unknown; to: unknown }>)
      .map(([field, { from, to }]) => `• *${field}:* ${from} → ${to}`)
      .join('\n');

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📝 *Assignment Updated* for *${agentName}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: changesList,
          },
        },
      ],
    });

    return response.ts || null;
  }

  private async notifyAssignmentEnded(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { agentName, positionTitle, reason } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔚 *Assignment Ended*\n*${agentName}* is no longer assigned to *${positionTitle}*`,
          },
        },
        reason ? {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Reason: ${reason}_`,
            },
          ],
        } : null,
      ].filter(Boolean) as KnownBlock[],
    });

    return response.ts || null;
  }

  // ===========================================================================
  // APPROVAL NOTIFICATIONS
  // ===========================================================================

  private async notifyApprovalRequested(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const {
      requestId,
      title,
      description,
      requesterName,
      level,
      impactScope,
      estimatedValue,
    } = payload.data;

    const channel = await this.getNotificationChannel(payload);
    if (!channel) return null;

    const levelEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][Number(level) - 1] || '🔢';

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔔 Approval Request",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${title}*\n${description}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Requester:*\n${requesterName}`,
            },
            {
              type: "mrkdwn",
              text: `*Level:*\n${levelEmoji} Level ${level}`,
            },
            {
              type: "mrkdwn",
              text: `*Scope:*\n${impactScope || 'N/A'}`,
            },
            estimatedValue ? {
              type: "mrkdwn",
              text: `*Value:*\n$${(Number(estimatedValue) / 100).toFixed(2)}`,
            } : null,
          ].filter(Boolean) as { type: "mrkdwn"; text: string }[],
        },
        {
          type: "actions",
          block_id: `approval_${requestId}`,
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "✅ Approve",
                emoji: true,
              },
              style: "primary",
              action_id: "ar_approve",
              value: requestId as string,
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "❌ Reject",
                emoji: true,
              },
              style: "danger",
              action_id: "ar_reject",
              value: requestId as string,
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "📝 View Details",
                emoji: true,
              },
              action_id: "ar_view_details",
              value: requestId as string,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Request ID: \`${(requestId as string).slice(0, 8)}\` | ⏰ Awaiting response`,
            },
          ],
        },
      ],
    });

    return response.ts || null;
  }

  private async notifyApprovalDecided(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { title, decision, approverName, note } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const isApproved = decision === 'approved';

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${isApproved ? '✅' : '❌'} *Request ${isApproved ? 'Approved' : 'Rejected'}*\n*${title}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Decision by:*\n${approverName}`,
            },
            {
              type: "mrkdwn",
              text: `*Status:*\n${isApproved ? '✅ Approved' : '❌ Rejected'}`,
            },
          ],
        },
        note ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `_Note: ${note}_`,
          },
        } : null,
      ].filter(Boolean) as KnownBlock[],
    });

    return response.ts || null;
  }

  private async notifyApprovalEscalated(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { title, fromLevel, toLevel, reason } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⬆️ *Approval Escalated*\n*${title}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*From Level:*\n${fromLevel}`,
            },
            {
              type: "mrkdwn",
              text: `*To Level:*\n${toLevel}`,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Reason: ${reason || 'Timeout exceeded'}_`,
            },
          ],
        },
      ],
    });

    return response.ts || null;
  }

  // ===========================================================================
  // REPORT & ALERT NOTIFICATIONS
  // ===========================================================================

  private async notifyDailyReport(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { summary, highlights, warnings } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const summaryData = summary as Record<string, number>;
    const highlightList = (highlights as string[]) || [];
    const warningList = (warnings as string[]) || [];

    const blocks: KnownBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📊 AR Daily Report",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Active Agents:*\n${summaryData.activeAgents || 0}`,
          },
          {
            type: "mrkdwn",
            text: `*Tasks Completed:*\n${summaryData.tasksCompleted || 0}`,
          },
          {
            type: "mrkdwn",
            text: `*Avg Workload:*\n${summaryData.avgWorkload || 0}%`,
          },
          {
            type: "mrkdwn",
            text: `*Issues Detected:*\n${summaryData.issues || 0}`,
          },
        ],
      },
      {
        type: "divider",
      },
    ];

    if (highlightList.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✨ Highlights:*\n${highlightList.map(h => `• ${h}`).join('\n')}`,
        },
      });
    }

    if (warningList.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚠️ Warnings:*\n${warningList.map(w => `• ${w}`).join('\n')}`,
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Generated: ${new Date().toLocaleString()}`,
        },
      ],
    });

    const response = await this.client!.chat.postMessage({
      channel,
      blocks,
    });

    return response.ts || null;
  }

  private async notifyHealthAlert(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { agentName, status, issues, workload } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const statusEmoji = status === 'critical' ? '🔴' : status === 'warning' ? '🟡' : '🟢';
    const issueList = (issues as string[]) || [];

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${statusEmoji} *Health Alert: ${agentName}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Status:*\n${String(status).toUpperCase()}`,
            },
            {
              type: "mrkdwn",
              text: `*Workload:*\n${workload}%`,
            },
          ],
        },
        issueList.length > 0 ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Issues:*\n${issueList.map(i => `• ${i}`).join('\n')}`,
          },
        } : null,
      ].filter(Boolean) as KnownBlock[],
    });

    return response.ts || null;
  }

  private async notifyWorkloadWarning(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { overloadedAgents, underutilizedAgents } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const overloaded = (overloadedAgents as Array<{ name: string; workload: number }>) || [];
    const underutilized = (underutilizedAgents as Array<{ name: string; workload: number }>) || [];

    const blocks: KnownBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "⚖️ *Workload Imbalance Detected*",
        },
      },
    ];

    if (overloaded.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🔴 Overloaded:*\n${overloaded.map(a => `• ${a.name} (${Math.round(a.workload * 100)}%)`).join('\n')}`,
        },
      });
    }

    if (underutilized.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🔵 Underutilized:*\n${underutilized.map(a => `• ${a.name} (${Math.round(a.workload * 100)}%)`).join('\n')}`,
        },
      });
    }

    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🔄 Auto-Rebalance",
            emoji: true,
          },
          action_id: "ar_auto_rebalance",
          value: payload.organizationId,
        },
      ],
    });

    const response = await this.client!.chat.postMessage({
      channel,
      blocks,
    });

    return response.ts || null;
  }

  private async notifyCoachingReminder(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { agentName, sessionType, scheduledAt, topics } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const topicList = (topics as string[]) || [];

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📅 *Coaching Session Reminder*\n*Agent:* ${agentName}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Type:*\n${sessionType}`,
            },
            {
              type: "mrkdwn",
              text: `*Scheduled:*\n${new Date(scheduledAt as string).toLocaleString()}`,
            },
          ],
        },
        topicList.length > 0 ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Topics:*\n${topicList.map(t => `• ${t}`).join('\n')}`,
          },
        } : null,
      ].filter(Boolean) as KnownBlock[],
    });

    return response.ts || null;
  }

  private async notifyRecommendation(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    const { title, description, priority, actions } = payload.data;
    const channel = await this.getNotificationChannel(payload);

    if (!channel) return null;

    const priorityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    }[priority as string] || '⚪';

    const response = await this.client!.chat.postMessage({
      channel,
      thread_ts: payload.threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `💡 *Recommendation*\n${priorityEmoji} *${title}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: description as string,
          },
        },
        (actions as string[])?.length > 0 ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Suggested Actions:*\n${(actions as string[]).map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
          },
        } : null,
      ].filter(Boolean) as KnownBlock[],
    });

    return response.ts || null;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async getNotificationChannel(
    payload: ARNotificationPayload
  ): Promise<string | null> {
    // Priority: explicit channel > user DM > org default > service default
    if (payload.recipientChannelId) {
      return payload.recipientChannelId;
    }

    if (payload.recipientUserId) {
      // Get user's Slack ID from ExternalIdentity for DM
      const slackIdentity = await prisma.externalIdentity.findFirst({
        where: {
          userId: payload.recipientUserId,
          provider: 'slack',
          linkStatus: 'linked',
        },
      });
      if (slackIdentity?.providerUserId) {
        return slackIdentity.providerUserId;
      }
    }

    // Try to get organization's AR notification channel
    const org = await prisma.organization.findUnique({
      where: { id: payload.organizationId },
    });
    const settings = org?.settings as Record<string, unknown> | null;
    if (settings?.arNotificationChannel) {
      return settings.arNotificationChannel as string;
    }

    return this.defaultChannel;
  }

  /**
   * Send notification to user DM
   */
  async sendDirectMessage(
    userId: string,
    message: string,
    blocks?: KnownBlock[]
  ): Promise<string | null> {
    if (!this.client) return null;

    // Get user's Slack ID from ExternalIdentity
    const slackIdentity = await prisma.externalIdentity.findFirst({
      where: {
        userId,
        provider: 'slack',
        linkStatus: 'linked',
      },
    });

    if (!slackIdentity?.providerUserId) {
      logger.warn("User has no linked Slack identity", { userId });
      return null;
    }

    const response = await this.client.chat.postMessage({
      channel: slackIdentity.providerUserId,
      text: message,
      blocks,
    });

    return response.ts || null;
  }

  /**
   * Update existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    blocks: KnownBlock[]
  ): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.chat.update({
        channel,
        ts,
        blocks,
      });
      return true;
    } catch (error) {
      logger.error("Failed to update Slack message", { channel, ts, error });
      return false;
    }
  }
}

// Export singleton
export const arSlackNotifier = new ARSlackNotifierService();
