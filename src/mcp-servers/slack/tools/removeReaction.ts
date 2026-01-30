/**
 * Remove Reaction Tool
 *
 * Remove an emoji reaction from a Slack message.
 */

import { getSlackClient } from "../client";
import { MCPConnection } from "../../../orchestrator/types";

export interface RemoveReactionInput {
  channel: string;
  timestamp: string;
  emoji: string;
}

export interface RemoveReactionOutput {
  ok: boolean;
  error?: string;
}

export async function removeReactionTool(
  token: string,
  input: RemoveReactionInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<RemoveReactionOutput> {
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

    await (client as any).client.reactions.remove({
      channel,
      timestamp,
      name: cleanEmoji,
    });

    return { ok: true };
  } catch (error: any) {
    if (error.data?.error === "no_reaction") {
      return { ok: true }; // No reaction to remove is considered success
    }
    return { ok: false, error: error.message || String(error) };
  } finally {
    release();
  }
}
