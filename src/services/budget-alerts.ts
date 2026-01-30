import { WebClient } from "@slack/web-api";
import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { checkBudget, BudgetStatus } from "./cost-tracker";
import { decrypt } from "../utils/encryption";

export type AlertType = "warning" | "critical" | "exceeded";

export interface BudgetAlertResult {
  budgetStatus: BudgetStatus;
  shouldAlert: boolean;
  alertType: AlertType | null;
  message: string | null;
}

// Cache key for tracking sent alerts (prevent duplicate notifications)
const ALERT_SENT_KEY_PREFIX = "budget_alert_sent:";

/**
 * Get the cache key for tracking sent alerts
 */
function getAlertSentKey(organizationId: string, threshold: number): string {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return `${ALERT_SENT_KEY_PREFIX}${organizationId}:${month}:${threshold}`;
}

/**
 * Check if an alert has already been sent for this threshold this month
 */
async function hasAlertBeenSent(organizationId: string, threshold: number): Promise<boolean> {
  const key = getAlertSentKey(organizationId, threshold);
  const sent = await redis.get(key);
  return sent === "1";
}

/**
 * Mark an alert as sent
 */
async function markAlertSent(organizationId: string, threshold: number): Promise<void> {
  const key = getAlertSentKey(organizationId, threshold);
  // Keep for the rest of the month (max 31 days)
  await redis.set(key, "1", 86400 * 31);
}

/**
 * Check if a budget alert should be sent
 */
export async function checkBudgetAlert(organizationId: string): Promise<BudgetAlertResult> {
  const budgetStatus = await checkBudget(organizationId);

  // No budget set, no alerts needed
  if (!budgetStatus.budgetCents) {
    return {
      budgetStatus,
      shouldAlert: false,
      alertType: null,
      message: null,
    };
  }

  let alertType: AlertType | null = null;
  let threshold: number | null = null;
  let message: string | null = null;

  const percentUsed = budgetStatus.usedPercent;
  const budgetDollars = (budgetStatus.budgetCents / 100).toFixed(2);
  const spentDollars = (budgetStatus.spentCents / 100).toFixed(2);
  const remainingDollars = (budgetStatus.remainingCents / 100).toFixed(2);

  if (percentUsed >= 100) {
    alertType = "exceeded";
    threshold = 100;
    message =
      `Budget EXCEEDED! You have spent $${spentDollars} of your $${budgetDollars} monthly budget. ` +
      `LLM execution is now blocked. Please increase your budget or wait until next month.`;
  } else if (percentUsed >= 90) {
    alertType = "critical";
    threshold = 90;
    message =
      `Budget at ${percentUsed}%! You have spent $${spentDollars} of your $${budgetDollars} monthly budget. ` +
      `Only $${remainingDollars} remaining. Consider increasing your budget to avoid service interruption.`;
  } else if (percentUsed >= 80) {
    alertType = "warning";
    threshold = 80;
    message =
      `Budget at ${percentUsed}%. You have spent $${spentDollars} of your $${budgetDollars} monthly budget. ` +
      `$${remainingDollars} remaining this month.`;
  }

  // Check if we've already sent this alert
  if (threshold && (await hasAlertBeenSent(organizationId, threshold))) {
    return {
      budgetStatus,
      shouldAlert: false,
      alertType,
      message: null,
    };
  }

  return {
    budgetStatus,
    shouldAlert: alertType !== null,
    alertType,
    message,
  };
}

/**
 * Send budget alert via Slack
 */
async function sendSlackAlert(
  organizationId: string,
  alertResult: BudgetAlertResult,
): Promise<boolean> {
  try {
    // Get Slack integration
    const slackIntegration = await prisma.slackIntegration.findFirst({
      where: {
        organizationId,
        enabled: true,
      },
    });

    if (!slackIntegration) {
      logger.debug("No Slack integration for budget alert", { organizationId });
      return false;
    }

    // Decrypt bot token
    const botToken = decrypt(slackIntegration.botToken);
    const client = new WebClient(botToken);

    // Get org settings for notification channel
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, name: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const notificationChannel =
      (settings.budgetAlertChannel as string) || (settings.defaultChannel as string) || "general";

    const emoji = alertResult.alertType === "exceeded" ? ":rotating_light:" :
                  alertResult.alertType === "critical" ? ":warning:" : ":chart_with_upwards_trend:";

    const color = alertResult.alertType === "exceeded" ? "#dc2626" :
                  alertResult.alertType === "critical" ? "#f59e0b" : "#3b82f6";

    const status = alertResult.budgetStatus;

    await client.chat.postMessage({
      channel: notificationChannel,
      text: `${emoji} Budget Alert: ${alertResult.message}`,
      attachments: [
        {
          color,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: alertResult.message || "",
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Budget:*\n$${((status.budgetCents || 0) / 100).toFixed(2)}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Spent:*\n$${(status.spentCents / 100).toFixed(2)}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Remaining:*\n$${(status.remainingCents / 100).toFixed(2)}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Usage:*\n${status.usedPercent}%`,
                },
              ],
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Organization: ${org?.name || organizationId}`,
                },
              ],
            },
          ],
        },
      ],
    });

    logger.info("Slack budget alert sent", {
      organizationId,
      alertType: alertResult.alertType,
      channel: notificationChannel,
    });

    return true;
  } catch (error) {
    logger.error("Failed to send Slack budget alert", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Send budget alert via email (placeholder - implement with your email service)
 */
async function sendEmailAlert(
  organizationId: string,
  alertResult: BudgetAlertResult,
): Promise<boolean> {
  try {
    // Get organization admins/owners for email notification
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId,
        role: { in: ["owner", "admin"] },
      },
      include: {
        user: {
          select: { email: true, displayName: true },
        },
      },
    });

    if (memberships.length === 0) {
      logger.debug("No admin users for email budget alert", { organizationId });
      return false;
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    // NOTE: Email integration point - connect to SendGrid/SES/Resend
    // Currently logs alert intent for debugging
    // Production: Replace with actual email send via configured email provider
    for (const membership of memberships) {
      logger.info("Email budget alert would be sent", {
        organizationId,
        orgName: org?.name,
        alertType: alertResult.alertType,
        recipient: membership.user.email,
        message: alertResult.message,
      });
    }

    // Placeholder: Return true if email service integration is complete
    // return await emailService.send({...});
    return false;
  } catch (error) {
    logger.error("Failed to send email budget alert", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Send budget alert through all configured channels
 */
export async function sendBudgetAlert(
  organizationId: string,
  alertResult: BudgetAlertResult,
): Promise<{ slack: boolean; email: boolean }> {
  if (!alertResult.shouldAlert || !alertResult.alertType) {
    return { slack: false, email: false };
  }

  // Send alerts in parallel
  const [slackSent, emailSent] = await Promise.all([
    sendSlackAlert(organizationId, alertResult),
    sendEmailAlert(organizationId, alertResult),
  ]);

  // Mark alert as sent if at least one channel succeeded
  if (slackSent || emailSent) {
    const threshold =
      alertResult.alertType === "exceeded" ? 100 : alertResult.alertType === "critical" ? 90 : 80;
    await markAlertSent(organizationId, threshold);
  }

  return { slack: slackSent, email: emailSent };
}

/**
 * Check and send budget alerts for all organizations (called by scheduler)
 */
export async function checkAllOrgBudgetAlerts(): Promise<void> {
  try {
    // Find organizations with budgets set
    const orgsWithBudgets = await prisma.organization.findMany({
      where: {
        monthlyBudgetCents: { not: null },
      },
      select: { id: true, name: true },
    });

    logger.info("Checking budget alerts for organizations", {
      count: orgsWithBudgets.length,
    });

    for (const org of orgsWithBudgets) {
      try {
        const alertResult = await checkBudgetAlert(org.id);

        if (alertResult.shouldAlert) {
          await sendBudgetAlert(org.id, alertResult);
        }
      } catch (error) {
        logger.error("Failed to check budget alert for organization", {
          organizationId: org.id,
          orgName: org.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("Failed to check budget alerts", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check budget and potentially block execution
 * Call this before executing LLM requests
 */
export async function enforceBudgetWithAlert(organizationId: string): Promise<void> {
  const alertResult = await checkBudgetAlert(organizationId);

  // Send alert if threshold reached
  if (alertResult.shouldAlert) {
    await sendBudgetAlert(organizationId, alertResult);
  }

  // Block execution if budget exceeded
  if (alertResult.budgetStatus.status === "exceeded") {
    throw new Error(
      `LLM execution blocked: Monthly budget of $${((alertResult.budgetStatus.budgetCents || 0) / 100).toFixed(2)} has been exceeded. ` +
        `Current spend: $${(alertResult.budgetStatus.spentCents / 100).toFixed(2)}`,
    );
  }
}
