/**
 * Slack Agent Status Utilities
 *
 * Uses Slack's AI Agent APIs to show status under the bot profile
 * instead of sending "Processing..." messages.
 *
 * Docs: https://docs.slack.dev/reference/methods/assistant.threads.setStatus
 */

import { WebClient } from "@slack/web-api";
import { logger } from "./logger";

/**
 * Status messages with i18n support
 */
export const AGENT_STATUS_MESSAGES = {
  thinking: {
    en: "is thinking...",
    ko: "생각하는 중...",
  },
  processing: {
    en: "is processing your request...",
    ko: "요청을 처리하는 중...",
  },
  searching: {
    en: "is searching...",
    ko: "검색하는 중...",
  },
  analyzing: {
    en: "is analyzing...",
    ko: "분석하는 중...",
  },
  generating: {
    en: "is generating a response...",
    ko: "응답을 생성하는 중...",
  },
  executing: {
    en: "is executing a task...",
    ko: "작업을 실행하는 중...",
  },
} as const;

export type AgentStatusType = keyof typeof AGENT_STATUS_MESSAGES;

/**
 * Set the agent status indicator under the bot profile.
 *
 * This shows "<App Name> is thinking..." under the profile instead of
 * sending a message like "🤔 Processing...".
 *
 * The status is automatically cleared when the app sends a reply,
 * or can be manually cleared with clearAgentStatus().
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param statusType - Type of status to show
 * @param locale - User's locale for i18n (default: 'en')
 * @returns true if status was set, false if API not supported
 */
export async function setAgentStatus(
  client: WebClient,
  channelId: string,
  threadTs: string,
  statusType: AgentStatusType = "thinking",
  locale: "en" | "ko" = "en",
): Promise<boolean> {
  const statusMessage = AGENT_STATUS_MESSAGES[statusType][locale];

  try {
    // Call Slack's assistant.threads.setStatus API
    // This API may not be available for all apps (requires AI Apps feature)
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: statusMessage,
    });

    logger.debug("Agent status set", {
      channelId,
      threadTs,
      status: statusMessage,
    });

    return true;
  } catch (error: any) {
    // If the API is not available (feature not enabled), log and return false
    if (
      error.data?.error === "not_allowed" ||
      error.data?.error === "missing_scope" ||
      error.data?.error === "method_not_supported_for_channel_type" ||
      error.data?.error === "invalid_arguments"
    ) {
      logger.debug("Agent status API not available, using fallback", {
        channelId,
        error: error.data?.error,
      });
      return false;
    }

    // For other errors, log warning but don't throw
    logger.warn("Failed to set agent status", {
      channelId,
      threadTs,
      error: error.message,
    });
    return false;
  }
}

/**
 * Clear the agent status indicator.
 *
 * Note: Status is automatically cleared when sending a message,
 * but this can be used to clear it explicitly without sending.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 */
export async function clearAgentStatus(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<void> {
  try {
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "", // Empty string clears the status
    });

    logger.debug("Agent status cleared", { channelId, threadTs });
  } catch (error: any) {
    // Silently ignore errors when clearing status
    logger.debug("Could not clear agent status", {
      channelId,
      error: error.message,
    });
  }
}

/**
 * Set agent status with rotating loading messages.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param messages - Array of status messages to rotate through
 * @returns true if status was set, false if API not supported
 */
export async function setAgentStatusWithLoadingMessages(
  client: WebClient,
  channelId: string,
  threadTs: string,
  messages: string[],
): Promise<boolean> {
  try {
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: messages[0],
      loading_messages: messages,
    });

    logger.debug("Agent status with loading messages set", {
      channelId,
      threadTs,
      messageCount: messages.length,
    });

    return true;
  } catch (error: any) {
    logger.debug("Could not set agent status with loading messages", {
      channelId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Wrapper that tries Agent Status API first, falls back to reaction.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param messageTs - The original message timestamp (for reaction fallback)
 * @param statusType - Type of status to show
 * @param locale - User's locale
 * @returns 'agent-status' | 'reaction' | 'none' indicating what was used
 */
export async function setProcessingIndicator(
  client: WebClient,
  channelId: string,
  threadTs: string,
  messageTs: string,
  statusType: AgentStatusType = "thinking",
  locale: "en" | "ko" = "en",
): Promise<"agent-status" | "reaction" | "none"> {
  // Try Agent Status API first
  const agentStatusSet = await setAgentStatus(
    client,
    channelId,
    threadTs,
    statusType,
    locale,
  );

  if (agentStatusSet) {
    return "agent-status";
  }

  // Fall back to reaction
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: messageTs,
      name: "eyes", // 👀
    });
    return "reaction";
  } catch (error: any) {
    if (error.data?.error !== "already_reacted") {
      logger.warn("Failed to add processing reaction", {
        channelId,
        messageTs,
        error: error.message,
      });
    }
    return error.data?.error === "already_reacted" ? "reaction" : "none";
  }
}
