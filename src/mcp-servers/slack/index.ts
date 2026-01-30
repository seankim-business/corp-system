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
    // Message management
    "slack__updateMessage",
    "slack__deleteMessage",
    "slack__uploadFile",
    "slack__pinMessage",
    "slack__unpinMessage",
    "slack__getPermalink",
    "slack__scheduleMessage",
    "slack__postEphemeral",
    // User management
    "slack__listUsers",
    "slack__getUserPresence",
    // Channel management
    "slack__createChannel",
    "slack__inviteToChannel",
    "slack__kickFromChannel",
    "slack__setChannelTopic",
    "slack__setChannelPurpose",
    "slack__archiveChannel",
    "slack__getChannelHistory",
    "slack__getChannelMembers",
    // Canvas API
    "slack__createCanvas",
    "slack__editCanvas",
    "slack__deleteCanvas",
    "slack__createChannelCanvas",
    // Bookmarks API
    "slack__addBookmark",
    "slack__listBookmarks",
    "slack__removeBookmark",
    "slack__editBookmark",
    // Views/Modals API
    "slack__openView",
    "slack__updateView",
    "slack__pushView",
    "slack__publishHomeView",
    // Usergroups API
    "slack__listUsergroups",
    "slack__createUsergroup",
    "slack__updateUsergroupMembers",
    // Calls API
    "slack__addCall",
    "slack__endCall",
    // DND API
    "slack__getDndInfo",
    "slack__setSnooze",
    "slack__endSnooze",
    // Search API
    "slack__searchAll",
    // Emoji API
    "slack__listEmoji",
    // Files API
    "slack__deleteFile",
    "slack__getFileInfo",
    "slack__listFiles",
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

          // Canvas API
          case "createCanvas": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.createCanvas(input.title, input.document_content);
            } finally {
              release();
            }
          }

          case "editCanvas": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.editCanvas(input.canvas_id, input.changes);
            } finally {
              release();
            }
          }

          case "deleteCanvas": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.deleteCanvas(input.canvas_id);
            } finally {
              release();
            }
          }

          case "createChannelCanvas": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.createChannelCanvas(input.channel_id, input.document_content);
            } finally {
              release();
            }
          }

          // Bookmarks API
          case "addBookmark": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.addBookmark(input.channel_id, input.title, input.type, input.link, input.emoji);
            } finally {
              release();
            }
          }

          case "listBookmarks": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.listBookmarks(input.channel_id);
            } finally {
              release();
            }
          }

          case "removeBookmark": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.removeBookmark(input.channel_id, input.bookmark_id);
            } finally {
              release();
            }
          }

          case "editBookmark": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.editBookmark(input.channel_id, input.bookmark_id, input);
            } finally {
              release();
            }
          }

          // Views/Modals API
          case "openView": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.openView(input.trigger_id, input.view);
            } finally {
              release();
            }
          }

          case "updateView": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.updateView(input.view_id, input.view, input.hash);
            } finally {
              release();
            }
          }

          case "pushView": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.pushView(input.trigger_id, input.view);
            } finally {
              release();
            }
          }

          case "publishHomeView": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.publishHomeView(input.user_id, input.view);
            } finally {
              release();
            }
          }

          // Usergroups API
          case "listUsergroups": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.listUsergroups();
            } finally {
              release();
            }
          }

          case "createUsergroup": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.createUsergroup(input.name, input);
            } finally {
              release();
            }
          }

          case "updateUsergroupMembers": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.updateUsergroupMembers(input.usergroup_id, input.users);
            } finally {
              release();
            }
          }

          // Calls API
          case "addCall": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.addCall(input.external_unique_id, input.join_url, input);
            } finally {
              release();
            }
          }

          case "endCall": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.endCall(input.call_id);
            } finally {
              release();
            }
          }

          // DND API
          case "getDndInfo": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getDndInfo(input.user);
            } finally {
              release();
            }
          }

          case "setSnooze": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.setSnooze(input.num_minutes);
            } finally {
              release();
            }
          }

          case "endSnooze": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.endSnooze();
            } finally {
              release();
            }
          }

          // Search API
          case "searchAll": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.searchAll(input.query, input);
            } finally {
              release();
            }
          }

          // Emoji API
          case "listEmoji": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.listEmoji();
            } finally {
              release();
            }
          }

          // Additional Conversations
          case "getChannelMembers": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getConversationMembers(input.channel, input);
            } finally {
              release();
            }
          }

          case "setChannelPurpose": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.setConversationPurpose(input.channel, input.purpose);
            } finally {
              release();
            }
          }

          case "postEphemeral": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.postEphemeral(input.channel, input.user, input.text, input);
            } finally {
              release();
            }
          }

          // Files API
          case "deleteFile": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.deleteFile(input.file_id);
            } finally {
              release();
            }
          }

          case "getFileInfo": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.getFileInfo(input.file_id);
            } finally {
              release();
            }
          }

          case "listFiles": {
            const { client, release } = await getSlackClient({ token, connection, userId });
            try {
              return await client.listFiles(input);
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
