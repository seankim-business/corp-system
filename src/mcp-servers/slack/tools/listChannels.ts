/**
 * List Channels Tool
 *
 * 기획:
 * - Slack 워크스페이스의 채널 목록 조회
 * - 아카이브된 채널 제외 옵션, 페이지네이션 지원
 *
 * 구조:
 * - Input: excludeArchived?, limit?, types?, cursor?
 * - Output: channels[], nextCursor?
 */

import { getSlackClient } from "../client";
import { ListChannelsInput, ListChannelsOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function listChannelsTool(
  token: string,
  input: ListChannelsInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<ListChannelsOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { excludeArchived = true, limit = 100, types, cursor } = input;

  try {
    const result = await client.listChannels({
      excludeArchived,
      limit,
      types,
      cursor,
    });

    return {
      channels: result.channels,
      nextCursor: result.nextCursor,
    };
  } finally {
    release();
  }
}
