/**
 * Slack Thread Context Collector
 *
 * OpenClaw-style thread context collection for AI conversations.
 * Provides thread history and conversation context to make the bot
 * more context-aware (e.g., understanding "my message" references).
 */

import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";

export interface ThreadMessage {
  ts: string;
  user?: string;
  userName?: string;
  userDisplayName?: string;
  text: string;
  threadTs?: string;
  reactions?: Array<{
    name: string;
    count: number;
    users: string[];
  }>;
  isBot: boolean;
  botId?: string;
  subtype?: string;
}

export interface ThreadContext {
  channel: string;
  channelName?: string;
  threadTs: string;
  messageCount: number;
  messages: ThreadMessage[];
  participants: string[];
  currentUser?: {
    id: string;
    name?: string;
    displayName?: string;
  };
}

export interface SlackContext {
  channel: string;
  channelName?: string;
  threadTs?: string;
  messageTs: string;
  userId: string;
  userName?: string;
  userDisplayName?: string;
  threadContext?: ThreadContext;
  recentMessages?: ThreadMessage[];
}

/**
 * Get all messages in a Slack thread
 */
export async function getThreadMessages(
  client: WebClient,
  channel: string,
  threadTs: string,
  options?: {
    limit?: number;
    includeParent?: boolean;
  },
): Promise<ThreadMessage[]> {
  const limit = options?.limit ?? 50;

  try {
    const response = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit,
      inclusive: true,
    });

    if (!response.ok || !response.messages) {
      logger.warn("Failed to get thread messages", {
        channel,
        threadTs,
        error: response.error,
      });
      return [];
    }

    const messages = response.messages;

    // Optionally exclude the parent message
    const filteredMessages = options?.includeParent !== false
      ? messages
      : messages.filter((msg) => msg.ts !== threadTs);

    // Resolve user names for context
    const userIds = new Set<string>();
    for (const msg of filteredMessages) {
      if (msg.user) {
        userIds.add(msg.user);
      }
    }

    const userMap = await resolveUserNames(client, Array.from(userIds));

    return filteredMessages.map((msg: any) => ({
      ts: msg.ts || "",
      user: msg.user,
      userName: msg.user ? userMap.get(msg.user)?.name : undefined,
      userDisplayName: msg.user ? userMap.get(msg.user)?.displayName : undefined,
      text: msg.text || "",
      threadTs: msg.thread_ts,
      reactions: msg.reactions?.map((r: any) => ({
        name: r.name,
        count: r.count,
        users: r.users || [],
      })),
      isBot: !!msg.bot_id || msg.subtype === "bot_message",
      botId: msg.bot_id,
      subtype: msg.subtype,
    }));
  } catch (error) {
    logger.error("Error fetching thread messages", {
      channel,
      threadTs,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get recent messages from a channel (for DM context or non-threaded messages)
 */
export async function getRecentChannelMessages(
  client: WebClient,
  channel: string,
  options?: {
    limit?: number;
    beforeTs?: string;
  },
): Promise<ThreadMessage[]> {
  const limit = options?.limit ?? 10;

  try {
    const response = await client.conversations.history({
      channel,
      limit,
      latest: options?.beforeTs,
      inclusive: false,
    });

    if (!response.ok || !response.messages) {
      logger.warn("Failed to get channel history", {
        channel,
        error: response.error,
      });
      return [];
    }

    const userIds = new Set<string>();
    for (const msg of response.messages) {
      if (msg.user) {
        userIds.add(msg.user);
      }
    }

    const userMap = await resolveUserNames(client, Array.from(userIds));

    return response.messages.map((msg) => ({
      ts: msg.ts || "",
      user: msg.user,
      userName: msg.user ? userMap.get(msg.user)?.name : undefined,
      userDisplayName: msg.user ? userMap.get(msg.user)?.displayName : undefined,
      text: msg.text || "",
      threadTs: msg.thread_ts,
      reactions: (msg.reactions as any)?.map((r: any) => ({
        name: r.name,
        count: r.count,
        users: r.users || [],
      })),
      isBot: !!msg.bot_id || msg.subtype === "bot_message",
      botId: msg.bot_id,
      subtype: msg.subtype,
    }));
  } catch (error) {
    logger.error("Error fetching channel history", {
      channel,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Build conversation context for AI consumption
 */
export function buildConversationContext(
  messages: ThreadMessage[],
  options?: {
    maxMessages?: number;
    maxLength?: number;
    includeReactions?: boolean;
  },
): string {
  const maxMessages = options?.maxMessages ?? 20;
  const maxLength = options?.maxLength ?? 4000;
  const includeReactions = options?.includeReactions ?? true;

  // Take most recent messages up to limit
  const recentMessages = messages.slice(-maxMessages);

  const lines: string[] = [];
  lines.push("=== Conversation History ===");

  for (const msg of recentMessages) {
    const sender = msg.isBot
      ? "[Bot]"
      : msg.userDisplayName || msg.userName || msg.user || "[Unknown]";

    let line = `${sender}: ${msg.text}`;

    if (includeReactions && msg.reactions && msg.reactions.length > 0) {
      const reactionStr = msg.reactions
        .map((r) => `:${r.name}: x${r.count}`)
        .join(" ");
      line += ` [Reactions: ${reactionStr}]`;
    }

    lines.push(line);
  }

  lines.push("=== End History ===");

  let context = lines.join("\n");

  // Truncate if too long
  if (context.length > maxLength) {
    context = context.substring(context.length - maxLength);
    // Find first newline to avoid cutting mid-message
    const firstNewline = context.indexOf("\n");
    if (firstNewline > 0) {
      context = "..." + context.substring(firstNewline);
    }
  }

  return context;
}

/**
 * Resolve thread context including channel info
 */
export async function resolveSlackThreadContext(
  client: WebClient,
  channel: string,
  threadTs: string | undefined,
  currentMessageTs: string,
  currentUserId: string,
): Promise<SlackContext> {
  const context: SlackContext = {
    channel,
    messageTs: currentMessageTs,
    userId: currentUserId,
  };

  // Try to get channel info
  try {
    const channelInfo = await client.conversations.info({ channel });
    if (channelInfo.ok && channelInfo.channel) {
      context.channelName = (channelInfo.channel as any).name;
    }
  } catch (error) {
    logger.debug("Could not get channel info", { channel });
  }

  // Try to get user info
  try {
    const userInfo = await client.users.info({ user: currentUserId });
    if (userInfo.ok && userInfo.user) {
      context.userName = userInfo.user.name;
      context.userDisplayName = userInfo.user.profile?.display_name || userInfo.user.real_name;
    }
  } catch (error) {
    logger.debug("Could not get user info", { userId: currentUserId });
  }

  // Get thread context if we're in a thread
  if (threadTs) {
    context.threadTs = threadTs;

    const threadMessages = await getThreadMessages(client, channel, threadTs);

    if (threadMessages.length > 0) {
      const participants = new Set<string>();
      for (const msg of threadMessages) {
        if (msg.user && !msg.isBot) {
          participants.add(msg.user);
        }
      }

      context.threadContext = {
        channel,
        channelName: context.channelName,
        threadTs,
        messageCount: threadMessages.length,
        messages: threadMessages,
        participants: Array.from(participants),
        currentUser: context.userName
          ? {
              id: currentUserId,
              name: context.userName,
              displayName: context.userDisplayName,
            }
          : undefined,
      };
    }
  } else {
    // Not in a thread - get recent channel messages for context
    const recentMessages = await getRecentChannelMessages(client, channel, {
      limit: 10,
      beforeTs: currentMessageTs,
    });

    if (recentMessages.length > 0) {
      context.recentMessages = recentMessages;
    }
  }

  return context;
}

/**
 * Build a system prompt addition for Slack context
 */
export function buildSlackContextPrompt(context: SlackContext): string {
  const parts: string[] = [];

  parts.push("## SLACK CONTEXT - READ CAREFULLY");
  parts.push("");
  parts.push("You are responding to a Slack message. You have FULL CONTEXT of the conversation.");
  parts.push("");

  // Explicit channel and message info for tools
  parts.push("### Current Location (USE THESE VALUES FOR TOOLS)");
  parts.push(`- Channel ID: ${context.channel}`);
  if (context.channelName) {
    parts.push(`- Channel Name: #${context.channelName}`);
  }
  parts.push(`- Current Message Timestamp: ${context.messageTs}`);
  if (context.threadTs) {
    parts.push(`- Thread Timestamp: ${context.threadTs}`);
  }

  parts.push("");
  parts.push("### User Information");
  if (context.userDisplayName || context.userName) {
    parts.push(`- User: ${context.userDisplayName || context.userName}`);
  }
  parts.push(`- User ID: ${context.userId}`);

  parts.push("");

  // Add conversation history
  if (context.threadContext && context.threadContext.messages.length > 0) {
    const conversationText = buildConversationContext(context.threadContext.messages, {
      maxMessages: 15,
      maxLength: 3000,
    });
    parts.push(conversationText);

    // Identify user's messages for "my message" references
    const userMessages = context.threadContext.messages.filter(
      (m) => m.user === context.userId && !m.isBot
    );
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      parts.push("");
      parts.push(`### User's Last Message (for "my message" reference)`);
      parts.push(`- Timestamp: ${lastUserMsg.ts}`);
      parts.push(`- Text: "${lastUserMsg.text}"`);
    }
  } else if (context.recentMessages && context.recentMessages.length > 0) {
    const conversationText = buildConversationContext(context.recentMessages, {
      maxMessages: 5,
      maxLength: 1000,
    });
    parts.push("### Recent Channel Messages");
    parts.push(conversationText);

    // Identify user's messages
    const userMessages = context.recentMessages.filter(
      (m) => m.user === context.userId && !m.isBot
    );
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      parts.push("");
      parts.push(`### User's Last Message (for "my message" reference)`);
      parts.push(`- Timestamp: ${lastUserMsg.ts}`);
      parts.push(`- Text: "${lastUserMsg.text}"`);
    }
  }

  parts.push("");
  parts.push("## CRITICAL INSTRUCTIONS - MUST FOLLOW");
  parts.push("");
  parts.push("1. **DO NOT ASK QUESTIONS** - You have all the context you need above.");
  parts.push("2. **ACT IMMEDIATELY** - Use the tools provided to complete the task.");
  parts.push("3. When user says 'my message' or 'this message' → Use the timestamp from 'User's Last Message' above.");
  parts.push("4. When user says 'add emoji/reaction' → Use the slack__addReaction tool with channel and timestamp from above.");
  parts.push("5. **NEVER** say 'I need more information' or 'please specify' - just use the context provided.");
  parts.push("6. If user asks for emoji without specifying which → default to 'thumbsup' (👍)");
  parts.push("");

  return parts.join("\n");
}

/**
 * Resolve user names from IDs
 */
async function resolveUserNames(
  client: WebClient,
  userIds: string[],
): Promise<Map<string, { name?: string; displayName?: string }>> {
  const userMap = new Map<string, { name?: string; displayName?: string }>();

  // Batch user lookups (Slack rate limits apply)
  const batchSize = 5;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (userId) => {
        try {
          const info = await client.users.info({ user: userId });
          if (info.ok && info.user) {
            userMap.set(userId, {
              name: info.user.name,
              displayName: info.user.profile?.display_name || info.user.real_name,
            });
          }
        } catch (error) {
          logger.debug("Could not resolve user", { userId });
        }
      }),
    );
  }

  return userMap;
}

/**
 * Get channel info
 */
export async function getChannelInfo(
  client: WebClient,
  channel: string,
): Promise<{
  id: string;
  name?: string;
  isPrivate: boolean;
  topic?: string;
  purpose?: string;
} | null> {
  try {
    const response = await client.conversations.info({ channel });
    if (!response.ok || !response.channel) {
      return null;
    }

    const ch = response.channel as any;
    return {
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private || false,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value,
    };
  } catch (error) {
    logger.error("Error fetching channel info", {
      channel,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get user info
 */
export async function getUserInfo(
  client: WebClient,
  userId: string,
): Promise<{
  id: string;
  name: string;
  displayName?: string;
  realName?: string;
  email?: string;
  isBot: boolean;
} | null> {
  try {
    const response = await client.users.info({ user: userId });
    if (!response.ok || !response.user) {
      return null;
    }

    const user = response.user as any;
    return {
      id: user.id,
      name: user.name,
      displayName: user.profile?.display_name,
      realName: user.real_name,
      email: user.profile?.email,
      isBot: user.is_bot || false,
    };
  } catch (error) {
    logger.error("Error fetching user info", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
