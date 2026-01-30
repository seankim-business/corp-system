/**
 * Send Message Tool
 *
 * 기획:
 * - Slack 채널에 메시지 전송
 * - 스레드 응답 및 블록/첨부 파일 지원
 *
 * 구조:
 * - Input: channel, text, threadTs?, blocks?, attachments?
 * - Output: ok, channel, ts, message
 */

import { getSlackClient } from "../client";
import { SendMessageInput, SendMessageOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function sendMessageTool(
  token: string,
  input: SendMessageInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<SendMessageOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { channel, text, threadTs, blocks, attachments } = input;

  if (!channel) {
    throw new Error("channel is required");
  }

  if (!text && !blocks) {
    throw new Error("either text or blocks is required");
  }

  try {
    const result = await client.sendMessage(channel, text, {
      threadTs,
      blocks,
      attachments,
    });

    return {
      ok: result.ok,
      channel: result.channel,
      ts: result.ts,
      message: result.message,
    };
  } finally {
    release();
  }
}
