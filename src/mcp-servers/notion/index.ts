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

export async function executeNotionTool(
  apiKey: string,
  toolName: string,
  input: any,
): Promise<any> {
  switch (toolName) {
    case "notion_get_tasks":
      return await getTasksTool(apiKey, input);

    case "notion_create_task":
      return await createTaskTool(apiKey, input);

    case "notion_update_task":
      return await updateTaskTool(apiKey, input);

    case "notion_delete_task":
      return await deleteTaskTool(apiKey, input);

    default:
      throw new Error(`Unknown Notion tool: ${toolName}`);
  }
}
