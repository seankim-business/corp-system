/**
 * Slack MCP Server Entry Point
 *
 * 기획:
 * - Workflow에서 호출 가능한 MCP 인터페이스
 * - Tool 라우팅 및 실행
 *
 * 구조:
 * - executeSlackTool: tool name으로 분기하여 실행
 */

import { sendMessageTool } from "./tools/sendMessage";
import { getUserTool } from "./tools/getUser";
import { listChannelsTool } from "./tools/listChannels";
import { searchMessagesTool } from "./tools/searchMessages";
import { addReactionTool } from "./tools/addReaction";
import { removeReactionTool } from "./tools/removeReaction";
import { getThreadMessagesTool } from "./tools/getThreadMessages";
import { getChannelInfoTool } from "./tools/getChannelInfo";
import { getSlackClient } from "./client";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { recordMcpToolCall } from "../../services/metrics";

const legacyToolMap: Record<string, string> = {
  send_message: "sendMessage",
  get_user: "getUser",
  list_channels: "listChannels",
  search_messages: "searchMessages",
  add_reaction: "addReaction",
  remove_reaction: "removeReaction",
  get_thread_messages: "getThreadMessages",
  get_channel_info: "getChannelInfo",
  update_message: "updateMessage",
  delete_message: "deleteMessage",
  upload_file: "uploadFile",
  pin_message: "pinMessage",
  unpin_message: "unpinMessage",
  get_permalink: "getPermalink",
  list_users: "listUsers",
  get_user_presence: "getUserPresence",
  schedule_message: "scheduleMessage",
  create_channel: "createChannel",
  invite_to_channel: "inviteToChannel",
  kick_from_channel: "kickFromChannel",
  set_channel_topic: "setChannelTopic",
  archive_channel: "archiveChannel",
  get_channel_history: "getChannelHistory",
};

export function registerTools(): string[] {
  return [
    // Original tools
    "slack__sendMessage",
    "slack__getUser",
    "slack__listChannels",
    "slack__searchMessages",
    "slack__addReaction",
    "slack__removeReaction",
    "slack__getThreadMessages",
    "slack__getChannelInfo",
    // New OpenClaw-style tools
    "slack__updateMessage",
    "slack__deleteMessage",
    "slack__uploadFile",
    "slack__pinMessage",
    "slack__unpinMessage",
    "slack__getPermalink",
    "slack__listUsers",
    "slack__getUserPresence",
    "slack__scheduleMessage",
    "slack__createChannel",
    "slack__inviteToChannel",
    "slack__kickFromChannel",
    "slack__setChannelTopic",
    "slack__archiveChannel",
    "slack__getChannelHistory",
  ];
}

export async function executeSlackTool(
  token: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "slack", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "slack",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        switch (resolvedToolName) {
          case "sendMessage":
            return await sendMessageTool(token, input, connection, userId);

          case "getUser":
            return await getUserTool(token, input, connection, userId);

          case "listChannels":
            return await listChannelsTool(token, input, connection, userId);

          case "searchMessages":
            return await searchMessagesTool(token, input, connection, userId);

          case "addReaction":
            return await addReactionTool(token, input, connection, userId);

          case "removeReaction":
            return await removeReactionTool(token, input, connection, userId);

          case "getThreadMessages":
            return await getThreadMessagesTool(token, input, connection, userId);

          case "getChannelInfo":
            return await getChannelInfoTool(token, input, connection, userId);

          // New OpenClaw-style tools - use SlackClient directly
          case "updateMessage": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.updateMessage(input.channel, input.ts, input.text, input.blocks);
            } finally {
              release();
            }
          }

          case "deleteMessage": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.deleteMessage(input.channel, input.ts);
            } finally {
              release();
            }
          }

          case "uploadFile": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.uploadFile(input);
            } finally {
              release();
            }
          }

          case "pinMessage": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.pinMessage(input.channel, input.timestamp);
            } finally {
              release();
            }
          }

          case "unpinMessage": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.unpinMessage(input.channel, input.timestamp);
            } finally {
              release();
            }
          }

          case "getPermalink": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getPermalink(input.channel, input.message_ts);
            } finally {
              release();
            }
          }

          case "listUsers": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.listUsers(input);
            } finally {
              release();
            }
          }

          case "getUserPresence": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getUserPresence(input.user);
            } finally {
              release();
            }
          }

          case "scheduleMessage": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.scheduleMessage(input.channel, input.text, input.post_at, {
                thread_ts: input.thread_ts,
                blocks: input.blocks,
              });
            } finally {
              release();
            }
          }

          case "createChannel": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.createChannel(input.name, input.is_private);
            } finally {
              release();
            }
          }

          case "inviteToChannel": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.inviteToChannel(input.channel, input.users);
            } finally {
              release();
            }
          }

          case "kickFromChannel": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.kickFromChannel(input.channel, input.user);
            } finally {
              release();
            }
          }

          case "setChannelTopic": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.setChannelTopic(input.channel, input.topic);
            } finally {
              release();
            }
          }

          case "archiveChannel": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.archiveChannel(input.channel);
            } finally {
              release();
            }
          }

          case "getChannelHistory": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getChannelHistory(input.channel, input);
            } finally {
              release();
            }
          }

          default:
            throw new Error(`Unknown Slack tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "slack",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

export { SlackClient, getSlackClient } from "./client";
