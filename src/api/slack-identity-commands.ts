/**
 * Slack Identity Commands
 *
 * Handles /identity slash command for managing linked identities via Slack.
 *
 * Commands:
 *   /identity status     - Show your linked identities
 *   /identity suggestions - Show pending suggestions
 *   /identity accept <id> - Accept a suggestion
 *   /identity reject <id> - Reject a suggestion
 *   /identity help       - Show help
 */

import type { App } from "@slack/bolt";
import { db } from "../db/client";
import { redis } from "../db/redis";
import { identityResolver, identityLinker, suggestionEngine } from "../services/identity";
import { logger } from "../utils/logger";
import { auditLogger } from "../services/audit-logger";

/**
 * Register identity commands with Slack app
 */
/**
 * Rate limit configuration
 */
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;

/**
 * Check rate limit for a user
 * Returns true if allowed, false if rate limited
 */
async function checkRateLimit(slackUserId: string): Promise<boolean> {
  const rateLimitKey = `identity:ratelimit:${slackUserId}`;

  try {
    const requests = await redis.incr(rateLimitKey);

    // Set expiry on first request in the window
    if (requests === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }

    return requests <= RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    logger.error("Rate limit check failed", { error, slackUserId });
    // Allow request if rate limit check fails
    return true;
  }
}

/**
 * Log rate limit event for metrics
 */
async function logRateLimitEvent(
  slackUserId: string,
  organizationId: string,
  subcommand: string,
): Promise<void> {
  try {
    await auditLogger.log({
      action: "api.rate_limited",
      organizationId,
      userId: undefined,
      resourceType: "identity_command",
      resourceId: subcommand,
      details: {
        slackUserId,
        command: `/identity ${subcommand}`,
        limitWindow: `${RATE_LIMIT_MAX_REQUESTS}/${RATE_LIMIT_WINDOW_SECONDS}s`,
      },
      success: false,
      errorMessage: `Rate limit exceeded for /identity command`,
    });
  } catch (error) {
    logger.error("Failed to log rate limit event", { error, slackUserId });
  }
}

export function registerIdentityCommands(app: App): void {
  app.command("/identity", async ({ command, ack, respond, client: _client }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase() || "help";
    const slackUserId = command.user_id;

    try {
      // Check rate limit first
      const isAllowed = await checkRateLimit(slackUserId);
      if (!isAllowed) {
        // Find organization for audit logging (best effort)
        try {
          const slackUser = await db.slackUser.findUnique({
            where: { slackUserId },
          });

          if (slackUser) {
            await logRateLimitEvent(slackUserId, slackUser.organizationId, subcommand);
          }
        } catch (error) {
          logger.error("Failed to log rate limit event", { error, slackUserId });
        }

        await respond({
          text: "⏳ Rate limit exceeded. Please wait a moment before trying again.\n_(Limited to 10 requests per minute)_",
          response_type: "ephemeral",
        });
        return;
      }

      // Find user and organization
      const slackUser = await db.slackUser.findUnique({
        where: { slackUserId },
        include: { user: true },
      });

      if (!slackUser) {
        await respond({
          text: "❌ Your Slack account is not linked to Nubabel. Please contact your admin.",
          response_type: "ephemeral",
        });
        return;
      }

      const { userId, organizationId } = slackUser;

      switch (subcommand) {
        case "status":
          await handleStatus(respond, organizationId, userId);
          break;

        case "suggestions":
          await handleSuggestions(respond, organizationId, userId);
          break;

        case "accept":
          await handleAccept(respond, args[1], organizationId, userId);
          break;

        case "reject":
          await handleReject(respond, args[1], organizationId, userId, args.slice(2).join(" "));
          break;

        case "help":
        default:
          await handleHelp(respond);
          break;
      }
    } catch (error) {
      logger.error("Identity command error", { error, command: subcommand });
      await respond({
        text: "❌ An error occurred. Please try again later.",
        response_type: "ephemeral",
      });
    }
  });
}

/**
 * Handle /identity status
 */
async function handleStatus(
  respond: (msg: any) => Promise<void>,
  organizationId: string,
  userId: string,
): Promise<void> {
  const identities = await identityResolver.getIdentitiesForUser(organizationId, userId);

  if (identities.length === 0) {
    await respond({
      text: "📋 You have no linked external identities.",
      response_type: "ephemeral",
    });
    return;
  }

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📋 Your Linked Identities*",
      },
    },
    { type: "divider" },
  ];

  for (const identity of identities) {
    const providerEmoji = getProviderEmoji(identity.provider);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${providerEmoji} *${identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1)}*\n` +
          `• Email: ${identity.email || "N/A"}\n` +
          `• Name: ${identity.displayName || "N/A"}\n` +
          `• Linked: ${identity.linkedAt ? new Date(identity.linkedAt).toLocaleDateString() : "N/A"}`,
      },
    } as any);
  }

  await respond({
    blocks,
    response_type: "ephemeral",
  });
}

/**
 * Handle /identity suggestions
 */
async function handleSuggestions(
  respond: (msg: any) => Promise<void>,
  organizationId: string,
  userId: string,
): Promise<void> {
  const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);

  if (suggestions.length === 0) {
    await respond({
      text: "✅ You have no pending identity suggestions.",
      response_type: "ephemeral",
    });
    return;
  }

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🔔 Pending Identity Suggestions (${suggestions.length})*\n_These accounts might belong to you:_`,
      },
    },
    { type: "divider" },
  ];

  for (const suggestion of suggestions) {
    const identity = suggestion.externalIdentity;
    const providerEmoji = getProviderEmoji(identity.provider);
    const confidence = Math.round(suggestion.confidenceScore * 100);
    const shortId = suggestion.id.substring(0, 8);

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${providerEmoji} *${identity.provider}* (${confidence}% match)\n` +
          `• Email: ${identity.email || "N/A"}\n` +
          `• Name: ${identity.displayName || "N/A"}\n` +
          `• ID: \`${shortId}\``,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "✅ Accept" },
        action_id: `identity_accept_${suggestion.id}`,
        style: "primary",
      },
    });

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `To accept: \`/identity accept ${shortId}\` | To reject: \`/identity reject ${shortId}\``,
        },
      ],
    });
  }

  await respond({
    blocks,
    response_type: "ephemeral",
  });
}

/**
 * Handle /identity accept <id>
 */
async function handleAccept(
  respond: (msg: any) => Promise<void>,
  suggestionIdPrefix: string | undefined,
  organizationId: string,
  userId: string,
): Promise<void> {
  if (!suggestionIdPrefix) {
    await respond({
      text: "❌ Please provide a suggestion ID: `/identity accept <id>`",
      response_type: "ephemeral",
    });
    return;
  }

  // Find suggestion by prefix
  const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);
  const suggestion = suggestions.find((s) => s.id.startsWith(suggestionIdPrefix));

  if (!suggestion) {
    await respond({
      text: `❌ Suggestion not found: \`${suggestionIdPrefix}\`\nUse \`/identity suggestions\` to see your pending suggestions.`,
      response_type: "ephemeral",
    });
    return;
  }

  try {
    await identityLinker.processSuggestionDecision({
      suggestionId: suggestion.id,
      accepted: true,
      reviewedBy: userId,
      reason: "Accepted via Slack command",
    });

    const providerEmoji = getProviderEmoji(suggestion.externalIdentity.provider);
    await respond({
      text:
        `✅ ${providerEmoji} Identity linked successfully!\n` +
        `*${suggestion.externalIdentity.provider}* account (${suggestion.externalIdentity.email || suggestion.externalIdentity.displayName}) is now linked to your Nubabel account.`,
      response_type: "ephemeral",
    });
  } catch (error: any) {
    await respond({
      text: `❌ Failed to accept suggestion: ${error.message}`,
      response_type: "ephemeral",
    });
  }
}

/**
 * Handle /identity reject <id> [reason]
 */
async function handleReject(
  respond: (msg: any) => Promise<void>,
  suggestionIdPrefix: string | undefined,
  organizationId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  if (!suggestionIdPrefix) {
    await respond({
      text: "❌ Please provide a suggestion ID: `/identity reject <id> [reason]`",
      response_type: "ephemeral",
    });
    return;
  }

  // Find suggestion by prefix
  const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);
  const suggestion = suggestions.find((s) => s.id.startsWith(suggestionIdPrefix));

  if (!suggestion) {
    await respond({
      text: `❌ Suggestion not found: \`${suggestionIdPrefix}\`\nUse \`/identity suggestions\` to see your pending suggestions.`,
      response_type: "ephemeral",
    });
    return;
  }

  try {
    await identityLinker.processSuggestionDecision({
      suggestionId: suggestion.id,
      accepted: false,
      reviewedBy: userId,
      reason: reason || "Rejected via Slack command",
    });

    await respond({
      text: `✅ Suggestion rejected.\nThe ${suggestion.externalIdentity.provider} account will not be linked to your account.`,
      response_type: "ephemeral",
    });
  } catch (error: any) {
    await respond({
      text: `❌ Failed to reject suggestion: ${error.message}`,
      response_type: "ephemeral",
    });
  }
}

/**
 * Handle /identity help
 */
async function handleHelp(respond: (msg: any) => Promise<void>): Promise<void> {
  await respond({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*🔗 Identity Management Commands*\n\n" +
            "Manage your linked external identities (Slack, Google, Notion):\n\n" +
            "• `/identity status` - View your linked identities\n" +
            "• `/identity suggestions` - View pending identity suggestions\n" +
            "• `/identity accept <id>` - Accept a suggestion and link identity\n" +
            "• `/identity reject <id> [reason]` - Reject a suggestion\n" +
            "• `/identity help` - Show this help message\n\n" +
            "_For more options, visit Settings in the Nubabel dashboard._",
        },
      },
    ],
    response_type: "ephemeral",
  });
}

/**
 * Get emoji for provider
 */
function getProviderEmoji(provider: string): string {
  switch (provider) {
    case "slack":
      return "💬";
    case "google":
      return "🔵";
    case "notion":
      return "📝";
    default:
      return "🔗";
  }
}

export default registerIdentityCommands;
