/**
 * Notion MCP Server Entry Point
 *
 * 기획:
 * - Workflow에서 호출 가능한 MCP 인터페이스
 * - Tool 라우팅 및 실행
 *
 * 구조:
 * - executeNotionTool: tool name으로 분기하여 실행
 */

import { getTasksTool } from "./tools/getTasks";
import { createTaskTool } from "./tools/createTask";
import { updateTaskTool } from "./tools/updateTask";
import { deleteTaskTool } from "./tools/deleteTask";
import { validateToolAccess } from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";

const legacyToolMap: Record<string, string> = {
  get_tasks: "getTasks",
  create_task: "createTask",
  update_task: "updateTask",
  delete_task: "deleteTask",
};

export function registerTools(): string[] {
  return ["notion__getTasks", "notion__createTask", "notion__updateTask", "notion__deleteTask"];
}

export async function executeNotionTool(
  apiKey: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "notion", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  switch (resolvedToolName) {
    case "getTasks":
      return await getTasksTool(apiKey, input, connection, userId);

    case "createTask":
      return await createTaskTool(apiKey, input, connection, userId);

    case "updateTask":
      return await updateTaskTool(apiKey, input, connection, userId);

    case "deleteTask":
      return await deleteTaskTool(apiKey, input, connection, userId);

    default:
      throw new Error(`Unknown Notion tool: ${toolName}`);
  }
}

export { NotionClient, getNotionClient } from "./client";
