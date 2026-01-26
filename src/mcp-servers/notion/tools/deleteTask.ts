/**
 * Delete Task Tool
 *
 * 기획:
 * - Notion Task 삭제 (아카이브)
 *
 * 구조:
 * - Input: taskId
 * - Output: success, taskId
 */

import { getNotionClient } from "../client";
import { DeleteTaskInput, DeleteTaskOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function deleteTaskTool(
  apiKey: string,
  input: DeleteTaskInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<DeleteTaskOutput> {
  const { client, release } = await getNotionClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { taskId } = input;

  if (!taskId) {
    throw new Error("taskId is required");
  }

  try {
    const success = await client.deleteTask(taskId);

    return { success, taskId };
  } finally {
    release();
  }
}
