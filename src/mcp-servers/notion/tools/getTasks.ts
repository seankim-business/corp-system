/**
 * Get Tasks Tool
 * 
 * 기획:
 * - Notion 데이터베이스에서 Task 목록 조회
 * - 필터링 및 페이지네이션 지원
 * 
 * 구조:
 * - Input: databaseId, filter, limit
 * - Output: tasks[], hasMore, nextCursor
 */

import { NotionClient } from '../client';
import { GetTasksInput, GetTasksOutput } from '../types';

export async function getTasksTool(
  apiKey: string,
  input: GetTasksInput
): Promise<GetTasksOutput> {
  const client = new NotionClient(apiKey);

  const { databaseId, filter, limit = 50 } = input;

  if (!databaseId) {
    throw new Error('databaseId is required');
  }

  const result = await client.getTasks(databaseId, filter, limit);

  return {
    tasks: result.tasks,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  };
}
