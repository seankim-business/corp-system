/**
 * Slack Reaction Manager
 *
 * OpenClaw-style reaction management for visual feedback.
 * Provides instant visual acknowledgment of bot activity.
 */

import { WebClient } from "@slack/web-api";
import { logger } from "./logger";

// Standard reaction emojis
export const REACTIONS = {
  // Processing states
  ACK: "eyes",              // 👀 - Processing started
  THINKING: "thinking_face", // 🤔 - Deep thinking
  WORKING: "gear",          // ⚙️ - Working

  // Completion states
  DONE: "white_check_mark", // ✅ - Completed successfully
  SUCCESS: "sparkles",      // ✨ - Extra success

  // Error states
  ERROR: "x",               // ❌ - Error occurred
  WARNING: "warning",       // ⚠️ - Warning
  RETRY: "arrows_counterclockwise", // 🔄 - Retrying

  // User interaction
  THUMBS_UP: "+1",          // 👍 - Positive feedback
  THUMBS_DOWN: "-1",        // 👎 - Negative feedback

  // Special
  HOURGLASS: "hourglass_flowing_sand", // ⏳ - Long operation
  ROCKET: "rocket",         // 🚀 - Starting
} as const;

export type ReactionType = keyof typeof REACTIONS;

interface ReactionContext {
  client: WebClient;
  channel: string;
  timestamp: string;
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  ctx: ReactionContext,
  reaction: ReactionType | string,
): Promise<boolean> {
  const emoji = REACTIONS[reaction as ReactionType] || reaction;

  try {
    await ctx.client.reactions.add({
      channel: ctx.channel,
      timestamp: ctx.timestamp,
      name: emoji,
    });
    logger.debug("Reaction added", { channel: ctx.channel, ts: ctx.timestamp, emoji });
    return true;
  } catch (error: any) {
    // Ignore "already_reacted" error
    if (error.data?.error === "already_reacted") {
      return true;
    }
    logger.debug("Failed to add reaction", {
      channel: ctx.channel,
      ts: ctx.timestamp,
      emoji,
      error: error.message
    });
    return false;
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  ctx: ReactionContext,
  reaction: ReactionType | string,
): Promise<boolean> {
  const emoji = REACTIONS[reaction as ReactionType] || reaction;

  try {
    await ctx.client.reactions.remove({
      channel: ctx.channel,
      timestamp: ctx.timestamp,
      name: emoji,
    });
    logger.debug("Reaction removed", { channel: ctx.channel, ts: ctx.timestamp, emoji });
    return true;
  } catch (error: any) {
    // Ignore "no_reaction" error
    if (error.data?.error === "no_reaction") {
      return true;
    }
    logger.debug("Failed to remove reaction", {
      channel: ctx.channel,
      ts: ctx.timestamp,
      emoji,
      error: error.message
    });
    return false;
  }
}

/**
 * Replace one reaction with another (atomic swap)
 */
export async function replaceReaction(
  ctx: ReactionContext,
  fromReaction: ReactionType | string,
  toReaction: ReactionType | string,
): Promise<boolean> {
  // Add new reaction first, then remove old
  // This order ensures there's always visual feedback
  const added = await addReaction(ctx, toReaction);
  if (added) {
    await removeReaction(ctx, fromReaction);
  }
  return added;
}

/**
 * Remove all bot's own reactions from a message
 */
export async function removeOwnReactions(
  ctx: ReactionContext,
  botUserId: string,
): Promise<void> {
  try {
    const result = await ctx.client.reactions.get({
      channel: ctx.channel,
      timestamp: ctx.timestamp,
    });

    const message = result.message as any;
    if (!message?.reactions) return;

    for (const reaction of message.reactions) {
      // Check if bot reacted
      if (reaction.users?.includes(botUserId)) {
        await removeReaction(ctx, reaction.name);
      }
    }
  } catch (error) {
    logger.debug("Failed to remove own reactions", { error });
  }
}

/**
 * Reaction sequence manager for multi-step processes
 */
export class ReactionSequence {
  private ctx: ReactionContext;
  private currentReaction: string | null = null;

  constructor(ctx: ReactionContext) {
    this.ctx = ctx;
  }

  /**
   * Start processing - show ACK reaction
   */
  async start(): Promise<void> {
    await addReaction(this.ctx, "ACK");
    this.currentReaction = REACTIONS.ACK;
  }

  /**
   * Update to thinking state
   */
  async thinking(): Promise<void> {
    if (this.currentReaction) {
      await replaceReaction(this.ctx, this.currentReaction, "THINKING");
      this.currentReaction = REACTIONS.THINKING;
    }
  }

  /**
   * Update to working state
   */
  async working(): Promise<void> {
    if (this.currentReaction) {
      await replaceReaction(this.ctx, this.currentReaction, "WORKING");
      this.currentReaction = REACTIONS.WORKING;
    }
  }

  /**
   * Mark as complete - replace with checkmark
   */
  async complete(): Promise<void> {
    if (this.currentReaction) {
      await replaceReaction(this.ctx, this.currentReaction, "DONE");
      this.currentReaction = REACTIONS.DONE;
    } else {
      await addReaction(this.ctx, "DONE");
      this.currentReaction = REACTIONS.DONE;
    }
  }

  /**
   * Mark as error - replace with X
   */
  async error(): Promise<void> {
    if (this.currentReaction) {
      await replaceReaction(this.ctx, this.currentReaction, "ERROR");
      this.currentReaction = REACTIONS.ERROR;
    } else {
      await addReaction(this.ctx, "ERROR");
      this.currentReaction = REACTIONS.ERROR;
    }
  }

  /**
   * Clear all reactions (for retry scenarios)
   */
  async clear(botUserId: string): Promise<void> {
    await removeOwnReactions(this.ctx, botUserId);
    this.currentReaction = null;
  }
}

/**
 * Create a reaction sequence for a message
 */
export function createReactionSequence(
  client: WebClient,
  channel: string,
  timestamp: string,
): ReactionSequence {
  return new ReactionSequence({ client, channel, timestamp });
}

/**
 * Quick helper: Add ack reaction
 */
export async function ackMessage(
  client: WebClient,
  channel: string,
  timestamp: string,
): Promise<boolean> {
  return addReaction({ client, channel, timestamp }, "ACK");
}

/**
 * Quick helper: Mark message as done
 */
export async function doneMessage(
  client: WebClient,
  channel: string,
  timestamp: string,
): Promise<boolean> {
  return replaceReaction({ client, channel, timestamp }, "ACK", "DONE");
}

/**
 * Quick helper: Mark message as error
 */
export async function errorMessage(
  client: WebClient,
  channel: string,
  timestamp: string,
): Promise<boolean> {
  return replaceReaction({ client, channel, timestamp }, "ACK", "ERROR");
}
