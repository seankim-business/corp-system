/**
 * Slack Feature Request Integration
 *
 * Captures feature requests from:
 * 1. Direct @nubabel mentions with "feature" or "기능"
 * 2. :bulb: emoji reactions
 * 3. Keyword detection: "기능 요청", "feature request", "이런거 있으면"
 */

import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { redis } from "../db/redis";
import {
  getUserBySlackId,
  getOrganizationBySlackWorkspace,
} from "../services/slack-service";
import {
  getThreadMessages,
  getUserInfo,
  getChannelInfo,
} from "../services/slack-thread-context";
import { captureFromSlack } from "../services/mega-app/feature-request-pipeline/capture.service";
import { SlackCaptureData } from "../services/mega-app/feature-request-pipeline/types";

/**
 * Detect if message is a feature request
 */
export function isFeatureRequest(text: string): boolean {
  const triggers = [
    "기능 요청",
    "기능요청",
    "feature request",
    "이런거 있으면",
    "이런 기능",
    "추가해주세요",
    "있었으면",
    "만들어주세요",
    "can we have",
    "would be nice if",
    "it would help if",
    "필요한 기능",
    "이런 것",
    "could you add",
    "please add",
  ];

  const lowerText = text.toLowerCase();
  return triggers.some((t) => lowerText.includes(t.toLowerCase()));
}

/**
 * Handle app_mention events for feature requests
 */
export async function handleFeatureRequestMention(
  event: {
    user: string;
    text: string;
    channel: string;
    thread_ts?: string;
    ts: string;
  },
  client: WebClient,
): Promise<void> {
  const { user, text, channel, thread_ts, ts } = event;

  try {
    // Check if this is a feature request
    if (!isFeatureRequest(text)) {
      logger.debug("Mention does not appear to be a feature request", {
        channel,
        ts,
      });
      return;
    }

    logger.info("Feature request detected in mention", {
      user,
      channel,
      hasThread: !!thread_ts,
    });

    // Get workspace and organization
    const slackWorkspace = await client.team.info();
    const workspaceId = slackWorkspace.team?.id;

    if (!workspaceId) {
      logger.warn("Could not get workspace ID");
      return;
    }

    const organization = await getOrganizationBySlackWorkspace(workspaceId);
    if (!organization) {
      logger.warn("Organization not found for Slack workspace", {
        workspaceId,
      });
      await client.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts,
        text: "❌ Organization not found. Please connect your Slack workspace in Settings.",
      });
      return;
    }

    // Get user
    const nubabelUser = await getUserBySlackId(user, client);
    const requesterId = nubabelUser?.id;

    // Collect Slack context
    const slackData = await collectSlackContext(
      client,
      channel,
      ts,
      thread_ts,
      user,
      text,
    );

    // Capture the feature request
    const result = await captureFromSlack(
      organization.id,
      requesterId,
      slackData,
    );

    if (result.success) {
      // React with memo emoji to acknowledge
      await client.reactions.add({
        channel,
        timestamp: ts,
        name: "memo",
      });

      // Send confirmation
      await client.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts,
        text: `✅ Feature request captured! ID: \`${result.id}\`\n\nWe'll analyze this and add it to our backlog. You can track its status at https://nubabel.com/feature-requests/${result.id}`,
      });

      metrics.increment("feature_request.slack.captured");
      logger.info("Feature request captured from Slack mention", {
        requestId: result.id,
        channel,
        organizationId: organization.id,
      });
    } else {
      logger.error("Failed to capture feature request", {
        error: result.error,
        channel,
      });

      await client.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts,
        text: `❌ Failed to capture feature request: ${result.error}`,
      });
    }
  } catch (error) {
    logger.error(
      "Error handling feature request mention",
      { channel, ts },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Handle :bulb: emoji reactions as feature requests
 */
export async function handleFeatureRequestReaction(
  event: {
    reaction: string;
    item: { channel: string; ts: string };
    user: string;
  },
  client: WebClient,
): Promise<void> {
  const { reaction, item, user } = event;

  // Only handle bulb emoji
  if (reaction !== "bulb") {
    return;
  }

  const { channel, ts: messageTs } = item;

  try {
    logger.info("Feature request detected via :bulb: reaction", {
      channel,
      messageTs,
      user,
    });

    // Dedupe: check if already captured
    const dedupeKey = `slack:feature_request:reaction:${channel}:${messageTs}`;
    const alreadyCaptured = await redis.exists(dedupeKey);
    if (alreadyCaptured) {
      logger.debug("Feature request already captured from this reaction", {
        channel,
        messageTs,
      });
      return;
    }

    await redis.set(dedupeKey, "1", 86400); // 24 hour TTL

    // Get workspace and organization
    const slackWorkspace = await client.team.info();
    const workspaceId = slackWorkspace.team?.id;

    if (!workspaceId) {
      logger.warn("Could not get workspace ID");
      return;
    }

    const organization = await getOrganizationBySlackWorkspace(workspaceId);
    if (!organization) {
      logger.warn("Organization not found for Slack workspace", {
        workspaceId,
      });
      return;
    }

    // Fetch the original message
    const messageInfo = await client.conversations.history({
      channel,
      latest: messageTs,
      limit: 1,
      inclusive: true,
    });

    if (
      !messageInfo.messages ||
      messageInfo.messages.length === 0
    ) {
      logger.warn("Could not fetch original message for reaction", {
        channel,
        messageTs,
      });
      return;
    }

    const originalMessage = messageInfo.messages[0];
    const messageText = originalMessage.text || "";
    const messageUser = originalMessage.user || user;
    const threadTs = originalMessage.thread_ts;

    // Get user who added reaction
    const nubabelUser = await getUserBySlackId(user, client);
    const requesterId = nubabelUser?.id;

    // Collect Slack context
    const slackData = await collectSlackContext(
      client,
      channel,
      messageTs,
      threadTs,
      messageUser,
      messageText,
    );

    // Add metadata about who reacted
    slackData.reactions = [reaction];

    // Capture the feature request
    const result = await captureFromSlack(
      organization.id,
      requesterId,
      slackData,
    );

    if (result.success) {
      // React with memo emoji to acknowledge
      await client.reactions.add({
        channel,
        timestamp: messageTs,
        name: "memo",
      });

      // Notify user who added reaction
      await client.chat.postEphemeral({
        channel,
        user,
        text: `✅ Feature request captured from this message! ID: \`${result.id}\`\n\nTrack status at: https://nubabel.com/feature-requests/${result.id}`,
      });

      metrics.increment("feature_request.slack.reaction");
      logger.info("Feature request captured from :bulb: reaction", {
        requestId: result.id,
        channel,
        organizationId: organization.id,
      });
    } else {
      logger.error("Failed to capture feature request from reaction", {
        error: result.error,
        channel,
        messageTs,
      });
    }
  } catch (error) {
    logger.error(
      "Error handling feature request reaction",
      { channel, messageTs },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Collect full Slack context for a message
 */
async function collectSlackContext(
  client: WebClient,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  userId: string,
  text: string,
): Promise<SlackCaptureData> {
  const slackData: SlackCaptureData = {
    channelId: channel,
    messageTs,
    threadTs,
    userId,
    text,
  };

  // Get channel info
  const channelInfo = await getChannelInfo(client, channel);
  if (channelInfo) {
    slackData.channelName = channelInfo.name;
  }

  // Get user info
  const userInfo = await getUserInfo(client, userId);
  if (userInfo) {
    slackData.userName = userInfo.displayName || userInfo.name;
  }

  // Get thread context if in a thread
  if (threadTs) {
    const threadMessages = await getThreadMessages(client, channel, threadTs, {
      limit: 20,
    });

    if (threadMessages.length > 0) {
      slackData.threadContext = threadMessages.map((msg) => ({
        userId: msg.user || "unknown",
        text: msg.text,
        ts: msg.ts,
      }));
    }
  }

  return slackData;
}

/**
 * Register feature request handlers with Slack app
 *
 * Note: We don't register separate handlers here.
 * Instead, the main app_mention handler in slack.ts will call
 * handleFeatureRequestMention when appropriate.
 * The reaction handler is registered in the main slack.ts
 */
export function registerFeatureRequestHandlers(_app: App): void {
  logger.info("Registering Slack feature request handlers");
  // Handlers are integrated into main slack.ts event handlers
}
