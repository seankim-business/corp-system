/**
 * Slack Status Updater Service
 *
 * Centralized service for updating Slack agent status during processing.
 * Uses Redis to store Slack context and can be called from anywhere.
 */

import { WebClient } from "@slack/web-api";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";
import {
  setDynamicStatus,
  clearAgentStatus,
  formatMcpToolStatus,
  getStageStatus,
  getStageThinkingMessages,
  getMcpThinkingMessages,
  setAgentStatusWithLoadingMessages,
} from "../utils/slack-agent-status";

export type ProcessingStage =
  | "analyzing"
  | "selectingApproach"
  | "processing"
  | "generating"
  | "executing";

export interface SlackContext {
  channelId: string;
  threadTs: string;
  organizationId: string;
  locale?: "en" | "ko";
}

/**
 * Redis key patterns for Slack context
 */
const REDIS_KEYS = {
  context: (eventId: string) => `slack:status:context:${eventId}`,
  statusSupported: (eventId: string) => `slack:status:supported:${eventId}`,
};

const CONTEXT_TTL = 600; // 10 minutes

/**
 * Slack Status Updater - Singleton service
 */
class SlackStatusUpdater {
  private clientCache: Map<string, { client: WebClient; expiresAt: number }> = new Map();
  private readonly CLIENT_CACHE_TTL = 60000; // 1 minute

  /**
   * Store Slack context for an event for later status updates.
   */
  async storeContext(eventId: string, context: SlackContext): Promise<void> {
    await redis.set(
      REDIS_KEYS.context(eventId),
      JSON.stringify(context),
      CONTEXT_TTL,
    );
    logger.debug("Stored Slack context for status updates", { eventId });
  }

  /**
   * Get stored Slack context for an event.
   */
  async getContext(eventId: string): Promise<SlackContext | null> {
    const data = await redis.get(REDIS_KEYS.context(eventId));
    if (!data) return null;

    try {
      return JSON.parse(data) as SlackContext;
    } catch {
      return null;
    }
  }

  /**
   * Clear stored context for an event.
   */
  async clearContext(eventId: string): Promise<void> {
    await redis.del(REDIS_KEYS.context(eventId));
    await redis.del(REDIS_KEYS.statusSupported(eventId));
  }

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
      logger.debug("Could not get Slack client for status update", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if status updates are supported for this event.
   */
  private async isStatusSupported(eventId: string): Promise<boolean | null> {
    const cached = await redis.get(REDIS_KEYS.statusSupported(eventId));
    if (cached === "true") return true;
    if (cached === "false") return false;
    return null; // Unknown
  }

  /**
   * Update the agent status for an event.
   *
   * @param eventId - The event ID
   * @param status - Status message to display
   * @returns true if status was updated
   */
  async updateStatus(eventId: string, status: string): Promise<boolean> {
    // Check if we already know status is not supported
    const supported = await this.isStatusSupported(eventId);
    if (supported === false) {
      return false;
    }

    const context = await this.getContext(eventId);
    if (!context) {
      logger.debug("No Slack context found for status update", { eventId });
      return false;
    }

    const client = await this.getClient(context.organizationId);
    if (!client) {
      return false;
    }

    const success = await setDynamicStatus(
      client,
      context.channelId,
      context.threadTs,
      status,
    );

    // Cache whether status updates are supported
    if (supported === null) {
      await redis.set(
        REDIS_KEYS.statusSupported(eventId),
        success ? "true" : "false",
        CONTEXT_TTL,
      );
    }

    return success;
  }

  /**
   * Update status for a processing stage.
   */
  async updateStageStatus(
    eventId: string,
    stage: ProcessingStage,
    context?: { service?: string; tool?: string },
  ): Promise<boolean> {
    const slackContext = await this.getContext(eventId);
    const locale = slackContext?.locale || "en";
    const status = getStageStatus(stage, locale, context);
    return this.updateStatus(eventId, status);
  }

  /**
   * Update status with rotating thinking messages for a processing stage.
   * This shows the main status plus rotating "thinking" messages below.
   */
  async updateStageStatusWithThinking(
    eventId: string,
    stage: ProcessingStage,
  ): Promise<boolean> {
    const supported = await this.isStatusSupported(eventId);
    if (supported === false) {
      return false;
    }

    const slackContext = await this.getContext(eventId);
    if (!slackContext) {
      return false;
    }

    const client = await this.getClient(slackContext.organizationId);
    if (!client) {
      return false;
    }

    const locale = slackContext.locale || "en";
    const thinkingMessages = getStageThinkingMessages(stage, locale);

    const success = await setAgentStatusWithLoadingMessages(
      client,
      slackContext.channelId,
      slackContext.threadTs,
      thinkingMessages,
    );

    if (supported === null) {
      await redis.set(
        REDIS_KEYS.statusSupported(eventId),
        success ? "true" : "false",
        CONTEXT_TTL,
      );
    }

    return success;
  }

  /**
   * Update status for MCP tool execution.
   */
  async updateMcpToolStatus(
    eventId: string,
    provider: string,
    toolName: string,
  ): Promise<boolean> {
    const slackContext = await this.getContext(eventId);
    const locale = slackContext?.locale || "en";
    const status = formatMcpToolStatus(provider, toolName, locale);
    return this.updateStatus(eventId, status);
  }

  /**
   * Update status with rotating thinking messages for MCP provider.
   * Shows provider-specific "thinking" messages that rotate automatically.
   */
  async updateMcpStatusWithThinking(
    eventId: string,
    provider: string,
  ): Promise<boolean> {
    const supported = await this.isStatusSupported(eventId);
    if (supported === false) {
      return false;
    }

    const slackContext = await this.getContext(eventId);
    if (!slackContext) {
      return false;
    }

    const client = await this.getClient(slackContext.organizationId);
    if (!client) {
      return false;
    }

    const locale = slackContext.locale || "en";
    const thinkingMessages = getMcpThinkingMessages(provider, locale);

    const success = await setAgentStatusWithLoadingMessages(
      client,
      slackContext.channelId,
      slackContext.threadTs,
      thinkingMessages,
    );

    if (supported === null) {
      await redis.set(
        REDIS_KEYS.statusSupported(eventId),
        success ? "true" : "false",
        CONTEXT_TTL,
      );
    }

    return success;
  }

  /**
   * Clear the agent status for an event.
   */
  async clearStatus(eventId: string): Promise<void> {
    const context = await this.getContext(eventId);
    if (!context) return;

    const client = await this.getClient(context.organizationId);
    if (!client) return;

    await clearAgentStatus(client, context.channelId, context.threadTs);
  }
}

// Export singleton instance
export const slackStatusUpdater = new SlackStatusUpdater();

// Export class for testing
export { SlackStatusUpdater };
