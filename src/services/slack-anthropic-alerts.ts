import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";
import { anthropicMetricsTracker } from "./anthropic-metrics";

export interface AnthropicAlertConfig {
  slackToken: string;
  alertChannel: string; // e.g., "#eng-alerts"
}

export class SlackAnthropicAlerts {
  private client: WebClient;
  private alertChannel: string;
  private lastAlertTime: Map<string, number> = new Map();
  private readonly ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: AnthropicAlertConfig) {
    this.client = new WebClient(config.slackToken);
    this.alertChannel = config.alertChannel;
  }

  /**
   * Send rate limit alert to Slack
   * Includes cooldown to prevent spam
   */
  async sendRateLimitAlert(data: {
    accountName?: string;
    error: string;
    timestamp: Date;
  }): Promise<void> {
    const alertKey = `rate_limit_${data.accountName || "default"}`;
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;

    // Check cooldown
    if (now - lastAlert < this.ALERT_COOLDOWN_MS) {
      logger.debug("Rate limit alert skipped due to cooldown", {
        accountName: data.accountName,
        cooldownRemaining: Math.ceil((this.ALERT_COOLDOWN_MS - (now - lastAlert)) / 1000),
      });
      return;
    }

    try {
      // Get current usage stats
      const [dayStats, quota] = await Promise.all([
        anthropicMetricsTracker.getUsageStats("day"),
        anthropicMetricsTracker.getQuotaEstimate(),
      ]);

      await this.client.chat.postMessage({
        channel: this.alertChannel,
        text: `⚠️ Claude API Rate Limit Hit`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "⚠️ Claude API Rate Limit Hit",
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Account:*\n${data.accountName || "Default"}`,
              },
              {
                type: "mrkdwn",
                text: `*Time:*\n${data.timestamp.toLocaleString()}`,
              },
              {
                type: "mrkdwn",
                text: `*Requests Today:*\n${dayStats.requests}`,
              },
              {
                type: "mrkdwn",
                text: `*Quota Remaining:*\n${quota.quotaRemaining}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error:*\n\`\`\`${data.error}\`\`\``,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Recommendation:* Consider enabling multi-account setup to distribute load.",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Total rate limit hits today: ${dayStats.rateLimitHits} | Cost: $${dayStats.cost.toFixed(4)} | Tokens: ${dayStats.tokens.toLocaleString()}`,
              },
            ],
          },
        ],
      });

      this.lastAlertTime.set(alertKey, now);

      logger.info("Rate limit alert sent to Slack", {
        accountName: data.accountName,
        channel: this.alertChannel,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to send rate limit alert to Slack", {
        error: message,
        accountName: data.accountName,
      });
    }
  }

  /**
   * Send quota warning alert (when approaching limits)
   */
  async sendQuotaWarningAlert(data: {
    quotaRemaining: string;
    estimatedDailyRequests: number;
    maxRequestsPerDay: number;
  }): Promise<void> {
    const alertKey = "quota_warning";
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;

    // Longer cooldown for quota warnings (30 minutes)
    const QUOTA_WARNING_COOLDOWN = 30 * 60 * 1000;
    if (now - lastAlert < QUOTA_WARNING_COOLDOWN) {
      return;
    }

    try {
      await this.client.chat.postMessage({
        channel: this.alertChannel,
        text: `🚨 Claude API Quota Warning: ${data.quotaRemaining} remaining`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🚨 Claude API Quota Warning",
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Quota Remaining:*\n${data.quotaRemaining}`,
              },
              {
                type: "mrkdwn",
                text: `*Estimated Daily:*\n${data.estimatedDailyRequests} / ${data.maxRequestsPerDay}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Action Required:* Consider reducing usage or upgrading tier.",
            },
          },
        ],
      });

      this.lastAlertTime.set(alertKey, now);

      logger.info("Quota warning alert sent to Slack", {
        quotaRemaining: data.quotaRemaining,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to send quota warning alert to Slack", {
        error: message,
      });
    }
  }

  async validateConfiguration(): Promise<void> {
    try {
      const result = await this.client.conversations.info({
        channel: this.alertChannel,
      });

      if (!result.ok) {
        throw new Error(`Cannot access channel ${this.alertChannel}`);
      }

      logger.info("Slack alert channel validated", {
        channel: this.alertChannel,
        channelName: result.channel?.name,
      });
    } catch (error) {
      throw new Error(
        `Slack alert validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// Singleton instance (will be initialized from environment)
let slackAnthropicAlerts: SlackAnthropicAlerts | null = null;

export function initializeSlackAlerts(config: AnthropicAlertConfig): void {
  slackAnthropicAlerts = new SlackAnthropicAlerts(config);
  logger.info("Slack Anthropic alerts initialized", {
    channel: config.alertChannel,
  });
}

export function getSlackAlerts(): SlackAnthropicAlerts | null {
  return slackAnthropicAlerts;
}
