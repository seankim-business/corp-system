/**
 * Get Thread Messages Tool
 *
 * Retrieve all messages in a Slack thread.
 * Useful for understanding conversation context.
 */

import { getSlackClient } from "../client";
import { MCPConnection } from "../../../orchestrator/types";
import { SlackMessage } from "../types";

export interface GetThreadMessagesInput {
  channel: string;
  thread_ts: string;
  limit?: number;
  include_parent?: boolean;
}

export interface GetThreadMessagesOutput {
  ok: boolean;
  messages: SlackMessage[];
  message_count: number;
  error?: string;
}

export async function getThreadMessagesTool(
  token: string,
  input: GetThreadMessagesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetThreadMessagesOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { channel, thread_ts, limit = 50, include_parent = true } = input;

  if (!channel) {
    throw new Error("channel is required");
  }

  if (!thread_ts) {
    throw new Error("thread_ts is required");
  }

  try {
    const response = await (client as any).client.conversations.replies({
      channel,
      ts: thread_ts,
      limit,
      inclusive: true,
    });

    if (!response.ok || !response.messages) {
      return {
        ok: false,
        messages: [],
        message_count: 0,
        error: response.error || "Failed to fetch thread messages",
      };
    }

    // Filter out parent message if not requested
    const messages = include_parent
      ? response.messages
      : response.messages.filter((msg: any) => msg.ts !== thread_ts);

    const formattedMessages: SlackMessage[] = messages.map((msg: any) => ({
      type: msg.type || "message",
      subtype: msg.subtype,
      text: msg.text || "",
      user: msg.user,
      username: msg.username,
      botId: msg.bot_id,
      ts: msg.ts,
      threadTs: msg.thread_ts,
      channel,
      team: msg.team || "",
      edited: msg.edited
        ? { user: msg.edited.user, ts: msg.edited.ts }
        : undefined,
      reactions: msg.reactions?.map((r: any) => ({
        name: r.name,
        users: r.users || [],
        count: r.count,
      })),
      attachments: msg.attachments,
      blocks: msg.blocks,
    }));

    return {
      ok: true,
      messages: formattedMessages,
      message_count: formattedMessages.length,
    };
  } catch (error: any) {
    return {
      ok: false,
      messages: [],
      message_count: 0,
      error: error.message || String(error),
    };
  } finally {
    release();
  }
}
