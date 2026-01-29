/**
 * Notification Sender Service
 *
 * Sends anomaly alert notifications via multiple channels.
 */

import { WebClient } from "@slack/web-api";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { getSlackIntegrationByOrg } from "../../api/slack-integration";
import { emitOrgEvent } from "../sse-service";
import {
  NotificationPayload,
  NotificationResult,
  NotificationChannel,
  SlackNotificationOptions,
  WebhookNotificationOptions,
  EmailNotificationOptions,
  AnomalySeverity,
} from "./types";

const SEVERITY_EMOJI: Record<AnomalySeverity, string> = {
  critical: "🚨",
  warning: "⚠️",
};

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  error_spike: "Error Spike",
  latency: "Performance Degradation",
  usage: "Usage Anomaly",
  cost: "Cost Anomaly",
};

export class NotificationSender {
  /**
   * Send notification to multiple channels
   */
  async sendNotification(
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const sendPromises = channels.map(async (channel) => {
      try {
        switch (channel) {
          case "slack":
            return await this.sendSlackNotification(payload);
          case "webhook":
            return await this.sendWebhookNotification(payload);
          case "sse":
            return await this.sendSSENotification(payload);
          case "email":
            return await this.sendEmailNotification(payload);
          default:
            return {
              channel,
              success: false,
              error: `Unknown channel: ${channel}`,
            };
        }
      } catch (error) {
        return {
          channel,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const settledResults = await Promise.allSettled(sendPromises);

    for (const result of settledResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          channel: "unknown" as NotificationChannel,
          success: false,
          error: result.reason?.message || "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(
    payload: NotificationPayload,
    options?: SlackNotificationOptions,
  ): Promise<NotificationResult> {
    try {
      const integration = await getSlackIntegrationByOrg(payload.organization.id);

      if (!integration || !integration.enabled) {
        return {
          channel: "slack",
          success: false,
          error: "Slack integration not available",
        };
      }

      const client = new WebClient(options?.botToken || integration.botToken);

      // Get channel from options or org settings
      let channel = options?.channel;
      if (!channel) {
        const org = await prisma.organization.findUnique({
          where: { id: payload.organization.id },
          select: { settings: true },
        });
        const settings = (org?.settings || {}) as Record<string, unknown>;
        channel = (settings.slackAlertChannel as string) || "#nubabel-alerts";
      }

      const blocks = this.buildSlackBlocks(payload);

      const result = await client.chat.postMessage({
        channel,
        text: this.buildSlackFallbackText(payload),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blocks: blocks as any,
      });

      logger.debug("Slack notification sent", {
        alertId: payload.alert.id,
        channel,
        ts: result.ts,
      });

      return {
        channel: "slack",
        success: true,
        messageId: result.ts,
      };
    } catch (error) {
      logger.error("Failed to send Slack notification", {
        alertId: payload.alert.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        channel: "slack",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(
    payload: NotificationPayload,
    options?: WebhookNotificationOptions,
  ): Promise<NotificationResult> {
    try {
      let webhookUrl = options?.url;

      if (!webhookUrl) {
        const org = await prisma.organization.findUnique({
          where: { id: payload.organization.id },
          select: { settings: true },
        });
        const settings = (org?.settings || {}) as Record<string, unknown>;
        webhookUrl = settings.alertWebhookUrl as string;
      }

      if (!webhookUrl) {
        return {
          channel: "webhook",
          success: false,
          error: "No webhook URL configured",
        };
      }

      const webhookPayload = {
        event: "anomaly_alert",
        timestamp: new Date().toISOString(),
        organization: payload.organization,
        alert: {
          id: payload.alert.id,
          status: payload.alert.status,
          createdAt: payload.alert.createdAt,
        },
        anomaly: {
          id: payload.anomaly.id,
          type: payload.anomaly.type,
          severity: payload.anomaly.severity,
          description: payload.anomaly.description,
          metric: payload.anomaly.metric,
          expectedValue: payload.anomaly.expectedValue,
          actualValue: payload.anomaly.actualValue,
          deviation: payload.anomaly.deviation,
          suggestedActions: payload.anomaly.suggestedActions,
          timeRange: payload.anomaly.timeRange,
          metadata: payload.anomaly.metadata,
        },
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nubabel-Event": "anomaly_alert",
          "X-Nubabel-Alert-Severity": payload.anomaly.severity,
          ...(options?.headers || {}),
        },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.debug("Webhook notification sent", {
        alertId: payload.alert.id,
        webhookUrl,
      });

      return {
        channel: "webhook",
        success: true,
      };
    } catch (error) {
      logger.error("Failed to send webhook notification", {
        alertId: payload.alert.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        channel: "webhook",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send SSE (Server-Sent Events) notification
   */
  async sendSSENotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      emitOrgEvent(payload.organization.id, "anomaly_alert", {
        alert: {
          id: payload.alert.id,
          status: payload.alert.status,
          anomalyId: payload.alert.anomalyId,
          createdAt: payload.alert.createdAt.toISOString(),
        },
        anomaly: {
          id: payload.anomaly.id,
          type: payload.anomaly.type,
          severity: payload.anomaly.severity,
          description: payload.anomaly.description,
          metric: payload.anomaly.metric,
          expectedValue: payload.anomaly.expectedValue,
          actualValue: payload.anomaly.actualValue,
          suggestedActions: payload.anomaly.suggestedActions,
        },
      });

      logger.debug("SSE notification sent", {
        alertId: payload.alert.id,
        organizationId: payload.organization.id,
      });

      return {
        channel: "sse",
        success: true,
      };
    } catch (error) {
      logger.error("Failed to send SSE notification", {
        alertId: payload.alert.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        channel: "sse",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send email notification (placeholder - implement with actual email service)
   */
  async sendEmailNotification(
    payload: NotificationPayload,
    _options?: EmailNotificationOptions,
  ): Promise<NotificationResult> {
    // Placeholder implementation
    // In production, integrate with SendGrid, AWS SES, etc.
    logger.info("Email notification placeholder", {
      alertId: payload.alert.id,
      type: payload.anomaly.type,
      severity: payload.anomaly.severity,
    });

    return {
      channel: "email",
      success: true,
      messageId: `email_placeholder_${Date.now()}`,
    };
  }

  /**
   * Build Slack message blocks
   */
  private buildSlackBlocks(payload: NotificationPayload): object[] {
    const { anomaly } = payload;
    const emoji = SEVERITY_EMOJI[anomaly.severity];
    const typeLabel = ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type;

    const blocks: object[] = [
      // Header
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} ${typeLabel} Detected`,
          emoji: true,
        },
      },
      // Description
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: anomaly.description,
        },
      },
      // Metrics
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Metric:*\n${anomaly.metric}`,
          },
          {
            type: "mrkdwn",
            text: `*Severity:*\n${anomaly.severity.toUpperCase()}`,
          },
          {
            type: "mrkdwn",
            text: `*Expected:*\n${this.formatValue(anomaly.expectedValue, anomaly.metric)}`,
          },
          {
            type: "mrkdwn",
            text: `*Actual:*\n${this.formatValue(anomaly.actualValue, anomaly.metric)}`,
          },
        ],
      },
      // Context
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Organization:* ${payload.organization.name} | *Time:* ${anomaly.timeRange.start.toLocaleString()} - ${anomaly.timeRange.end.toLocaleString()}`,
          },
        ],
      },
    ];

    // Suggested actions
    if (anomaly.suggestedActions.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Suggested Actions:*\n${anomaly.suggestedActions.map((a) => `• ${a}`).join("\n")}`,
        },
      });
    }

    // Divider and actions
    blocks.push(
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Details",
              emoji: true,
            },
            url: `${process.env.APP_URL || "https://app.nubabel.com"}/alerts/${payload.alert.id}`,
            action_id: "view_alert_details",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Acknowledge",
              emoji: true,
            },
            style: "primary",
            action_id: `acknowledge_alert_${payload.alert.id}`,
          },
        ],
      },
    );

    return blocks;
  }

  /**
   * Build fallback text for Slack (when blocks aren't rendered)
   */
  private buildSlackFallbackText(payload: NotificationPayload): string {
    const { anomaly, organization } = payload;
    const emoji = SEVERITY_EMOJI[anomaly.severity];
    const typeLabel = ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type;

    return `${emoji} ${typeLabel} in ${organization.name}: ${anomaly.description}`;
  }

  /**
   * Format value based on metric type
   */
  private formatValue(value: number, metric: string): string {
    if (metric.includes("percent") || metric.includes("rate")) {
      return `${value.toFixed(1)}%`;
    }
    if (metric.includes("cost") || metric.includes("cents")) {
      return `$${(value / 100).toFixed(2)}`;
    }
    if (metric.includes("latency") || metric.includes("duration")) {
      if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}s`;
      }
      return `${value.toFixed(0)}ms`;
    }
    if (metric.includes("per_minute") || metric.includes("rpm")) {
      return `${value.toFixed(1)}/min`;
    }
    return value.toFixed(2);
  }
}

export const notificationSender = new NotificationSender();
