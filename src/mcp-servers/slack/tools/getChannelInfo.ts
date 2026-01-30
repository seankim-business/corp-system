/**
 * Get Channel Info Tool
 *
 * Retrieve information about a Slack channel.
 */

import { getSlackClient } from "../client";
import { MCPConnection } from "../../../orchestrator/types";

export interface GetChannelInfoInput {
  channel: string;
}

export interface GetChannelInfoOutput {
  ok: boolean;
  channel?: {
    id: string;
    name: string;
    is_channel: boolean;
    is_private: boolean;
    is_archived: boolean;
    is_im: boolean;
    is_mpim: boolean;
    topic?: string;
    purpose?: string;
    num_members?: number;
    created: number;
  };
  error?: string;
}

export async function getChannelInfoTool(
  token: string,
  input: GetChannelInfoInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetChannelInfoOutput> {
  const { client, release } = await getSlackClient({
    token,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { channel } = input;

  if (!channel) {
    throw new Error("channel is required");
  }

  try {
    const response = await (client as any).client.conversations.info({
      channel,
    });

    if (!response.ok || !response.channel) {
      return {
        ok: false,
        error: response.error || "Failed to fetch channel info",
      };
    }

    const ch = response.channel;

    return {
      ok: true,
      channel: {
        id: ch.id,
        name: ch.name || ch.id, // DMs don't have names
        is_channel: ch.is_channel || false,
        is_private: ch.is_private || false,
        is_archived: ch.is_archived || false,
        is_im: ch.is_im || false,
        is_mpim: ch.is_mpim || false,
        topic: ch.topic?.value,
        purpose: ch.purpose?.value,
        num_members: ch.num_members,
        created: ch.created,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || String(error),
    };
  } finally {
    release();
  }
}
