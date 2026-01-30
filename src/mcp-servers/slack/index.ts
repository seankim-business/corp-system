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
};

export function registerTools(): string[] {
  return [
    "slack__sendMessage",
    "slack__getUser",
    "slack__listChannels",
    "slack__searchMessages",
    "slack__addReaction",
    "slack__removeReaction",
    "slack__getThreadMessages",
    "slack__getChannelInfo",
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
