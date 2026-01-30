/**
 * Feedback Capture Service
 * Captures user feedback from Slack reactions for learning and improvement
 */

import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { WebClient } from "@slack/web-api";

export interface CaptureFeedbackParams {
  organizationId: string;
  userId: string;
  executionId?: string;
  slackWorkspaceId: string;
  slackChannelId: string;
  slackThreadTs?: string;
  slackMessageTs: string;
  feedbackType: "reaction" | "correction" | "rating";
  reaction?: string;
  originalMessage: string;
  correction?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Capture feedback from Slack reaction
 */
export async function captureFeedback(params: CaptureFeedbackParams): Promise<string> {
  try {
    const feedback = await prisma.feedbackCapture.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        executionId: params.executionId,
        slackWorkspaceId: params.slackWorkspaceId,
        slackChannelId: params.slackChannelId,
        slackThreadTs: params.slackThreadTs,
        slackMessageTs: params.slackMessageTs,
        feedbackType: params.feedbackType,
        reaction: params.reaction,
        originalMessage: params.originalMessage,
        correction: params.correction,
        metadata: (params.metadata || {}) as any,
      },
    });

    metrics.increment("slack.feedback.captured", {
      feedbackType: params.feedbackType,
      reaction: params.reaction || "none",
    });

    logger.info("Feedback captured", {
      feedbackId: feedback.id,
      feedbackType: params.feedbackType,
      reaction: params.reaction,
      hasCorrection: !!params.correction,
    });

    return feedback.id;
  } catch (error) {
    logger.error(
      "Failed to capture feedback",
      { params },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Find execution ID from eventId via Redis
 */
export async function findExecutionByEventId(eventId: string): Promise<string | null> {
  try {
    // Try to find the orchestrator execution by searching for the eventId
    // This assumes executions store eventId in metadata
    const execution = await prisma.orchestratorExecution.findFirst({
      where: {
        metadata: {
          path: ["eventId"],
          equals: eventId,
        },
      },
      select: { id: true },
    });

    return execution?.id || null;
  } catch (error) {
    logger.warn("Failed to find execution by eventId", { eventId, error });
    return null;
  }
}

/**
 * Retrieve original bot message content from Slack
 */
export async function getBotMessageContent(
  client: WebClient,
  channelId: string,
  messageTs: string,
): Promise<string> {
  try {
    const result = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      limit: 1,
      inclusive: true,
    });

    if (result.messages && result.messages.length > 0) {
      return result.messages[0].text || "";
    }

    return "";
  } catch (error) {
    logger.error(
      "Failed to retrieve bot message content",
      { channelId, messageTs },
      error instanceof Error ? error : new Error(String(error)),
    );
    return "";
  }
}

/**
 * Prompt user for correction text via Slack DM or thread reply
 */
export async function promptForCorrection(
  client: WebClient,
  userId: string,
  channelId: string,
  threadTs: string,
  messageTs: string,
): Promise<void> {
  try {
    // Send a DM to the user asking for correction
    await client.chat.postMessage({
      channel: userId, // DM to user
      text: "Thanks for the feedback! Would you like to provide a correction or suggestion for improvement?",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Thanks for the feedback! 👎\n\nWould you like to provide a correction or suggestion so I can learn and improve?",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Provide Correction",
                emoji: true,
              },
              action_id: `feedback_correction_${messageTs}`,
              value: JSON.stringify({ channelId, threadTs, messageTs }),
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Skip",
                emoji: true,
              },
              style: "danger",
              action_id: `feedback_skip_${messageTs}`,
              value: messageTs,
            },
          ],
        },
      ],
    });

    logger.info("Sent correction prompt to user", { userId, messageTs });
  } catch (error) {
    logger.error(
      "Failed to prompt for correction",
      { userId, channelId, threadTs, messageTs },
      error instanceof Error ? error : new Error(String(error)),
    );
    // Don't throw - correction prompting is optional
  }
}

/**
 * Map Slack reaction to feedback sentiment
 */
export function mapReactionToSentiment(reaction: string): "positive" | "negative" | null {
  const positiveReactions = ["thumbsup", "+1", "heart", "white_check_mark", "tada", "clap"];
  const negativeReactions = ["thumbsdown", "-1", "x", "negative_squared_cross_mark"];

  if (positiveReactions.includes(reaction)) {
    return "positive";
  }
  if (negativeReactions.includes(reaction)) {
    return "negative";
  }
  return null;
}

/**
 * Check if feedback already exists for this message
 */
export async function feedbackExists(
  slackWorkspaceId: string,
  slackMessageTs: string,
  userId: string,
): Promise<boolean> {
  const existing = await prisma.feedbackCapture.findFirst({
    where: {
      slackWorkspaceId,
      slackMessageTs,
      userId,
    },
  });

  return !!existing;
}
