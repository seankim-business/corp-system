/**
 * Create Task Tool
 * 
 * 기획:
 * - Notion 데이터베이스에 새 Task 생성
 * 
 * 구조:
 * - Input: databaseId, title, status, assignee, dueDate
 * - Output: created task
 */

import { NotionClient } from '../client';
import { CreateTaskInput, CreateTaskOutput } from '../types';

export async function createTaskTool(
  apiKey: string,
  input: CreateTaskInput
): Promise<CreateTaskOutput> {
  const client = new NotionClient(apiKey);

  const { databaseId, title, status, assignee, dueDate, properties } = input;

  if (!databaseId) {
    throw new Error('databaseId is required');
  }

  if (!title) {
    throw new Error('title is required');
  }

  const task = await client.createTask(databaseId, title, {
    status,
    assignee,
    dueDate,
    ...properties,
  });

  return { task };
}
