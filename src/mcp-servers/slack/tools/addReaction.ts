/**
 * Add Reaction Tool
 *
 * Add an emoji reaction to a Slack message.
 * Useful for providing feedback or acknowledgment.
 */

import { getSlackClient } from "../client";
import { MCPConnection } from "../../../orchestrator/types";

export interface AddReactionInput {
  channel: string;
  timestamp: string;
  emoji: string;
}

export interface AddReactionOutput {
  ok: boolean;
  error?: string;
}

export async function addReactionTool(
  token: string,
  input: AddReactionInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<AddReactionOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { channel, timestamp, emoji } = input;

  if (!channel) {
    throw new Error("channel is required");
  }

  if (!timestamp) {
    throw new Error("timestamp is required");
  }

  if (!emoji) {
    throw new Error("emoji is required");
  }

  try {
    // Remove colons if present (e.g., ":thumbsup:" -> "thumbsup")
    const cleanEmoji = emoji.replace(/:/g, "");

    await (client as any).client.reactions.add({
      channel,
      timestamp,
      name: cleanEmoji,
    });

    return { ok: true };
  } catch (error: any) {
    if (error.data?.error === "already_reacted") {
      return { ok: true }; // Already reacted is considered success
    }
    return { ok: false, error: error.message || String(error) };
  } finally {
    release();
  }
}
