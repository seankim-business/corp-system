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

import { NotionClient } from '../client';
import { DeleteTaskInput, DeleteTaskOutput } from '../types';

export async function deleteTaskTool(
  apiKey: string,
  input: DeleteTaskInput
): Promise<DeleteTaskOutput> {
  const client = new NotionClient(apiKey);

  const { taskId } = input;

  if (!taskId) {
    throw new Error('taskId is required');
  }

  const success = await client.deleteTask(taskId);

  return { success, taskId };
}
