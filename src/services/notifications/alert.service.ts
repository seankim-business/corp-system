import { WebClient } from "@slack/web-api";
import { redis } from "../../db/redis";
import { db as prisma } from "../../db/client";
import { getSlackIntegrationByOrg } from "../../api/slack-integration";
import { logger } from "../../utils/logger";

export interface QuotaAlert {
  accountId: string;
  accountName: string;
  organizationId: string;
  severity: "warning" | "critical";
  thresholdType: "daily" | "monthly" | "rate_limit";
  percentageUsed: number;
  currentValue: number;
  limit: number;
  recommendation: string;
}

export interface CircuitBreakerAlert {
  accountId: string;
  accountName: string;
  organizationId: string;
  reason: string;
  failureCount: number;
  lastFailureTime: Date;
}

export class AlertService {
  private defaultChannel: string;

  constructor() {
    this.defaultChannel = process.env.SLACK_ALERT_CHANNEL || "#eng-alerts";
  }

  /**
   * Send quota threshold alert to Slack
   * Applies 30-minute cooldown per account+alertType combination
   */
  async sendQuotaAlert(alert: QuotaAlert): Promise<void> {
    try {
      // Check cooldown
      const cooldownKey = `alert:cooldown:${alert.accountId}:quota_${alert.thresholdType}`;
      const cooldownExists = await redis.exists(cooldownKey);

      if (cooldownExists) {
        logger.debug("Quota alert skipped due to cooldown", {
          accountId: alert.accountId,
          thresholdType: alert.thresholdType,
        });
        return;
      }

      // Get Slack integration for organization
      const integration = await getSlackIntegrationByOrg(alert.organizationId);
      if (!integration || !integration.enabled) {
        logger.warn("Slack integration not available for quota alert", {
          organizationId: alert.organizationId,
        });
        return;
      }

      const client = new WebClient(integration.botToken);

      // Format Block Kit message
      const emoji = alert.severity === "critical" ? "🚨" : "⚠️";
      const color = alert.severity === "critical" ? "#FF0000" : "#FFA500";

      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} Quota Alert: ${alert.accountName}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Severity:*\n${alert.severity.toUpperCase()}`,
            },
            {
              type: "mrkdwn",
              text: `*Threshold Type:*\n${alert.thresholdType.replace("_", " ").toUpperCase()}`,
            },
            {
              type: "mrkdwn",
              text: `*Usage:*\n${alert.percentageUsed.toFixed(1)}%`,
            },
            {
              type: "mrkdwn",
              text: `*Current / Limit:*\n${alert.currentValue.toLocaleString()} / ${alert.limit.toLocaleString()}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Recommendation:*\n${alert.recommendation}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Account ID: \`${alert.accountId}\` | Organization: \`${alert.organizationId}\``,
            },
          ],
        },
      ];

      // Post to Slack
      await client.chat.postMessage({
        channel: this.defaultChannel,
        text: `${emoji} Quota Alert: ${alert.accountName} - ${alert.percentageUsed.toFixed(1)}% used`,
        blocks,
        attachments: [
          {
            color,
            fallback: `${alert.severity.toUpperCase()}: ${alert.accountName} quota at ${alert.percentageUsed.toFixed(1)}%`,
          },
        ],
      });

      // Set cooldown (30 minutes)
      await redis.set(cooldownKey, "1", 30 * 60);

      logger.info("Quota alert sent to Slack", {
        accountId: alert.accountId,
        severity: alert.severity,
        percentageUsed: alert.percentageUsed,
      });
    } catch (error) {
      logger.error("Failed to send quota alert", {
        error: error instanceof Error ? error.message : String(error),
        accountId: alert.accountId,
      });
    }
  }

  /**
   * Send circuit breaker alert to Slack
   * Applies 5-minute cooldown per account
   */
  async sendCircuitBreakerAlert(
    accountId: string,
    reason: string,
    organizationId?: string,
  ): Promise<void> {
    try {
      // Check cooldown
      const cooldownKey = `alert:cooldown:${accountId}:circuit_breaker`;
      const cooldownExists = await redis.exists(cooldownKey);

      if (cooldownExists) {
        logger.debug("Circuit breaker alert skipped due to cooldown", { accountId });
        return;
      }

      const account = await prisma.claudeAccount.findUnique({
        where: { id: accountId },
        include: { organization: true },
      });

      if (!account) {
        logger.warn("Account not found for circuit breaker alert", { accountId });
        return;
      }

      const orgId = organizationId || account.organizationId;

      const integration = await getSlackIntegrationByOrg(orgId);
      if (!integration || !integration.enabled) {
        logger.warn("Slack integration not available for circuit breaker alert", {
          organizationId: orgId,
        });
        return;
      }

      const client = new WebClient(integration.botToken);

      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `🔴 Circuit Breaker Opened: ${account.name}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Account:*\n${account.name}`,
            },
            {
              type: "mrkdwn",
              text: `*Status:*\nCIRCUIT OPEN`,
            },
            {
              type: "mrkdwn",
              text: `*Reason:*\n${reason}`,
            },
            {
              type: "mrkdwn",
              text: `*Consecutive Failures:*\n${account.consecutiveFailures}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Last Failure:*\n${account.lastFailureAt ? new Date(account.lastFailureAt).toLocaleString() : "N/A"}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Account ID: \`${accountId}\` | Organization: \`${orgId}\``,
            },
          ],
        },
      ];

      await client.chat.postMessage({
        channel: this.defaultChannel,
        text: `🔴 Circuit Breaker Opened: ${account.name} - ${reason}`,
        blocks,
        attachments: [
          {
            color: "#FF0000",
            fallback: `Circuit breaker opened for ${account.name} due to ${reason}`,
          },
        ],
      });

      await redis.set(cooldownKey, "1", 5 * 60);

      logger.info("Circuit breaker alert sent to Slack", {
        accountId,
        reason,
        consecutiveFailures: account.consecutiveFailures,
      });
    } catch (error) {
      logger.error("Failed to send circuit breaker alert", {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      });
    }
  }

  /**
   * Send critical alert when ALL active accounts are exhausted
   * Applies 1-hour cooldown (only send once per hour)
   * Includes @channel mention for immediate attention
   */
  async sendAllAccountsExhaustedAlert(organizationId: string): Promise<void> {
    try {
      // Check cooldown
      const cooldownKey = `alert:cooldown:${organizationId}:all_accounts_exhausted`;
      const cooldownExists = await redis.exists(cooldownKey);

      if (cooldownExists) {
        logger.debug("All accounts exhausted alert skipped due to cooldown", { organizationId });
        return;
      }

      // Get Slack integration
      const integration = await getSlackIntegrationByOrg(organizationId);
      if (!integration || !integration.enabled) {
        logger.warn("Slack integration not available for all accounts exhausted alert", {
          organizationId,
        });
        return;
      }

      const client = new WebClient(integration.botToken);

      const totalAccounts = await prisma.claudeAccount.count({
        where: { organizationId, status: "active" },
      });

      const exhaustedAccounts = await prisma.claudeAccount.count({
        where: {
          organizationId,
          status: "active",
          circuitOpensAt: { not: null },
        },
      });

      // Format Block Kit message with @channel mention
      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨🚨🚨 CRITICAL: All Accounts Exhausted 🚨🚨🚨",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<!channel> *All active Claude accounts are currently exhausted or unavailable.*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Total Active Accounts:*\n${totalAccounts}`,
            },
            {
              type: "mrkdwn",
              text: `*Exhausted/Unavailable:*\n${exhaustedAccounts}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Immediate Actions Required:*\n• Add new Claude accounts\n• Increase quota limits on existing accounts\n• Check for circuit breaker issues\n• Review recent usage patterns",
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Organization: \`${organizationId}\` | Time: ${new Date().toLocaleString()}`,
            },
          ],
        },
      ];

      // Post to Slack with @channel mention
      await client.chat.postMessage({
        channel: this.defaultChannel,
        text: "🚨 CRITICAL: All Claude accounts exhausted - immediate action required!",
        blocks,
        attachments: [
          {
            color: "#FF0000",
            fallback: "CRITICAL: All active Claude accounts are exhausted",
          },
        ],
      });

      // Set cooldown (1 hour)
      await redis.set(cooldownKey, "1", 60 * 60);

      logger.error("All accounts exhausted alert sent to Slack", {
        organizationId,
        totalAccounts,
        exhaustedAccounts,
      });
    } catch (error) {
      logger.error("Failed to send all accounts exhausted alert", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }

  /**
   * Check if an alert is currently in cooldown
   * Useful for testing or manual alert management
   */
  async isInCooldown(accountId: string, alertType: string): Promise<boolean> {
    const cooldownKey = `alert:cooldown:${accountId}:${alertType}`;
    return await redis.exists(cooldownKey);
  }

  /**
   * Clear cooldown for an alert (for testing or manual override)
   */
  async clearCooldown(accountId: string, alertType: string): Promise<void> {
    const cooldownKey = `alert:cooldown:${accountId}:${alertType}`;
    await redis.del(cooldownKey);
    logger.info("Alert cooldown cleared", { accountId, alertType });
  }
}

// Singleton instance
export const alertService = new AlertService();
