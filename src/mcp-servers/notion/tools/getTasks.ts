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

import { getNotionClient } from "../client";
import { GetTasksInput, GetTasksOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getTasksTool(
  apiKey: string,
  input: GetTasksInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetTasksOutput> {
  const { client, release } = await getNotionClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { databaseId, filter, limit = 50 } = input;

  if (!databaseId) {
    throw new Error("databaseId is required");
  }

  try {
    const result = await client.getTasks(databaseId, filter, limit);

    return {
      tasks: result.tasks,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  } finally {
    release();
  }
}
