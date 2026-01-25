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

import { NotionClient } from '../client';
import { UpdateTaskInput, UpdateTaskOutput } from '../types';

export async function updateTaskTool(
  apiKey: string,
  input: UpdateTaskInput
): Promise<UpdateTaskOutput> {
  const client = new NotionClient(apiKey);

  const { taskId, ...updates } = input;

  if (!taskId) {
    throw new Error('taskId is required');
  }

  const task = await client.updateTask(taskId, updates);

  return { task };
}
