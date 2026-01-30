/**
 * Slack Thinking Message Service
 *
 * Displays Claude's real-time thinking process as a message in the thread.
 * The message updates as the AI processes and is deleted when done.
 */

import { WebClient } from "@slack/web-api";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";

const REDIS_KEYS = {
  thinkingTs: (eventId: string) => `slack:thinking:ts:${eventId}`,
  context: (eventId: string) => `slack:status:context:${eventId}`,
};

const TTL = 600; // 10 minutes

interface ThinkingContext {
  channelId: string;
  threadTs: string;
  organizationId: string;
}

class SlackThinkingMessageService {
  private clientCache: Map<string, { client: WebClient; expiresAt: number }> =
    new Map();
  private readonly CLIENT_CACHE_TTL = 60000; // 1 minute

  /**
   * Get or create a Slack WebClient for an organization.
   */
  private async getClient(organizationId: string): Promise<WebClient | null> {
    const now = Date.now();
    const cached = this.clientCache.get(organizationId);

    if (cached && cached.expiresAt > now) {
      return cached.client;
    }

    try {
      const integration = await getSlackIntegrationByOrg(organizationId);
      if (!integration || !integration.enabled) {
        return null;
      }

      const client = new WebClient(integration.botToken);
      this.clientCache.set(organizationId, {
        client,
        expiresAt: now + this.CLIENT_CACHE_TTL,
      });

      return client;
    } catch (error) {
      logger.debug("Could not get Slack client for thinking message", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get context from Redis (reuses the status context)
   */
  private async getContext(
    eventId: string,
  ): Promise<ThinkingContext | null> {
    const data = await redis.get(REDIS_KEYS.context(eventId));
    if (!data) return null;

    try {
      return JSON.parse(data) as ThinkingContext;
    } catch {
      return null;
    }
  }

  /**
   * Post or update a thinking message in the thread.
   *
   * @param eventId - Event ID
   * @param thinking - The thinking text to display (Claude's reasoning)
   * @param stage - Optional stage label (e.g., "Analyzing", "Querying Notion")
   */
  async updateThinking(
    eventId: string,
    thinking: string,
    stage?: string,
  ): Promise<void> {
    const context = await this.getContext(eventId);
    if (!context) return;

    const client = await this.getClient(context.organizationId);
    if (!client) return;

    // Format the thinking message with stage if provided
    const stagePrefix = stage ? `*${stage}*\n` : "";
    const formattedText = `💭 ${stagePrefix}_${thinking}_`;

    // Check if we already have a thinking message
    const existingTs = await redis.get(REDIS_KEYS.thinkingTs(eventId));

    try {
      if (existingTs) {
        // Update existing message
        await client.chat.update({
          channel: context.channelId,
          ts: existingTs,
          text: formattedText,
        });
      } else {
        // Post new message
        const result = await client.chat.postMessage({
          channel: context.channelId,
          thread_ts: context.threadTs,
          text: formattedText,
        });

        if (result.ts) {
          await redis.set(REDIS_KEYS.thinkingTs(eventId), result.ts, TTL);
        }
      }
    } catch (error) {
      logger.debug("Could not update thinking message", {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete the thinking message when processing is complete.
   */
  async clearThinking(eventId: string): Promise<void> {
    const context = await this.getContext(eventId);
    if (!context) return;

    const client = await this.getClient(context.organizationId);
    if (!client) return;

    const thinkingTs = await redis.get(REDIS_KEYS.thinkingTs(eventId));
    if (!thinkingTs) return;

    try {
      await client.chat.delete({
        channel: context.channelId,
        ts: thinkingTs,
      });
    } catch (error) {
      logger.debug("Could not delete thinking message", {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await redis.del(REDIS_KEYS.thinkingTs(eventId));
    }
  }
}

export const slackThinkingService = new SlackThinkingMessageService();
