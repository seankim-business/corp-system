/**
 * Get User Tool
 *
 * 기획:
 * - Slack 사용자 정보 조회
 *
 * 구조:
 * - Input: userId
 * - Output: user
 */

import { getSlackClient } from "../client";
import { GetUserInput, GetUserOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getUserTool(
  token: string,
  input: GetUserInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetUserOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { userId: targetUserId } = input;

  if (!targetUserId) {
    throw new Error("userId is required");
  }

  try {
    const user = await client.getUser(targetUserId);
    return { user };
  } finally {
    release();
  }
}
