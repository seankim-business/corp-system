/**
 * Search Messages Tool
 *
 * 기획:
 * - Slack 워크스페이스에서 메시지 검색
 * - 페이지네이션 및 정렬 옵션 지원
 *
 * 구조:
 * - Input: query, count?, page?, sort?, sortDir?
 * - Output: messages[], total, matches, hasMore
 */

import { getSlackClient } from "../client";
import { SearchMessagesInput, SearchMessagesOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function searchMessagesTool(
  token: string,
  input: SearchMessagesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<SearchMessagesOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { query, count = 20, page = 1, sort = "score", sortDir = "desc" } = input;

  if (!query) {
    throw new Error("query is required");
  }

  try {
    const result = await client.searchMessages(query, {
      count,
      page,
      sort,
      sortDir,
    });

    return {
      messages: result.messages,
      total: result.total,
      matches: result.matches,
      hasMore: result.hasMore,
    };
  } finally {
    release();
  }
}
