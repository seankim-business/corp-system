/**
 * Slack Chat Streaming Utilities
 *
 * Uses Slack's streaming APIs for real-time message updates:
 * - chat.startStream - Start a new stream
 * - chat.appendStream - Append text to stream
 * - chat.stopStream - Complete the stream
 *
 * Docs: https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/
 */

import { WebClient } from "@slack/web-api";
import { logger } from "./logger";

export interface StreamHandle {
  streamId: string;
  channelId: string;
  threadTs?: string;
  messageTs?: string;
}

/**
 * Start a new chat stream.
 *
 * This creates a placeholder message that can be updated in real-time
 * as the AI generates its response.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - Optional thread timestamp
 * @returns Stream handle for subsequent operations, or null if not supported
 */
export async function startChatStream(
  client: WebClient,
  channelId: string,
  threadTs?: string,
): Promise<StreamHandle | null> {
  try {
    const result = await (client as any).apiCall("chat.startStream", {
      channel: channelId,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });

    if (result.ok && result.stream_id) {
      logger.debug("Chat stream started", {
        channelId,
        streamId: result.stream_id,
      });

      return {
        streamId: result.stream_id,
        channelId,
        threadTs,
        messageTs: result.ts,
      };
    }

    return null;
  } catch (error: any) {
    // Streaming may not be available for all apps
    if (
      error.data?.error === "not_allowed" ||
      error.data?.error === "missing_scope" ||
      error.data?.error === "method_not_supported_for_channel_type"
    ) {
      logger.debug("Chat streaming not available", {
        channelId,
        error: error.data?.error,
      });
      return null;
    }

    logger.warn("Failed to start chat stream", {
      channelId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Append text to an active chat stream.
 *
 * @param client - Slack WebClient
 * @param streamHandle - The stream handle from startChatStream
 * @param text - Text to append
 * @returns true if successful
 */
export async function appendChatStream(
  client: WebClient,
  streamHandle: StreamHandle,
  text: string,
): Promise<boolean> {
  try {
    await (client as any).apiCall("chat.appendStream", {
      stream_id: streamHandle.streamId,
      channel: streamHandle.channelId,
      text,
    });

    return true;
  } catch (error: any) {
    logger.warn("Failed to append to chat stream", {
      streamId: streamHandle.streamId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Stop/complete a chat stream.
 *
 * @param client - Slack WebClient
 * @param streamHandle - The stream handle from startChatStream
 * @returns true if successful
 */
export async function stopChatStream(
  client: WebClient,
  streamHandle: StreamHandle,
): Promise<boolean> {
  try {
    await (client as any).apiCall("chat.stopStream", {
      stream_id: streamHandle.streamId,
      channel: streamHandle.channelId,
    });

    logger.debug("Chat stream stopped", {
      streamId: streamHandle.streamId,
    });

    return true;
  } catch (error: any) {
    logger.warn("Failed to stop chat stream", {
      streamId: streamHandle.streamId,
      error: error.message,
    });
    return false;
  }
}

/**
 * High-level streaming helper that handles the full lifecycle.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - Optional thread timestamp
 * @param textGenerator - Async generator that yields text chunks
 * @returns The final message timestamp, or null if streaming not available
 */
export async function streamResponse(
  client: WebClient,
  channelId: string,
  threadTs: string | undefined,
  textGenerator: AsyncGenerator<string, void, unknown>,
): Promise<string | null> {
  const stream = await startChatStream(client, channelId, threadTs);

  if (!stream) {
    // Streaming not available, caller should use regular message
    return null;
  }

  try {
    for await (const chunk of textGenerator) {
      const success = await appendChatStream(client, stream, chunk);
      if (!success) {
        break;
      }
    }

    await stopChatStream(client, stream);
    return stream.messageTs || null;
  } catch (error) {
    // Try to stop the stream on error
    await stopChatStream(client, stream).catch(() => {});
    throw error;
  }
}

/**
 * Check if chat streaming is available for the given context.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @returns true if streaming is available
 */
export async function isStreamingAvailable(
  client: WebClient,
  channelId: string,
): Promise<boolean> {
  // Try to start a stream and immediately cancel it
  const stream = await startChatStream(client, channelId);
  if (stream) {
    await stopChatStream(client, stream).catch(() => {});
    return true;
  }
  return false;
}
