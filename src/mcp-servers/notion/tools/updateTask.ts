/**
 * Update Task Tool
 *
 * 기획:
 * - Notion Task 업데이트
 *
 * 구조:
 * - Input: taskId, updates
 * - Output: updated task
 */

import { getNotionClient } from "../client";
import { UpdateTaskInput, UpdateTaskOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function updateTaskTool(
  apiKey: string,
  input: UpdateTaskInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<UpdateTaskOutput> {
  const { client, release } = await getNotionClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { taskId, ...updates } = input;

  if (!taskId) {
    throw new Error("taskId is required");
  }

  try {
    const task = await client.updateTask(taskId, updates);

    return { task };
  } finally {
    release();
  }
}
