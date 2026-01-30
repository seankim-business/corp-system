/**
 * Slack Feedback Block Kit Elements
 *
 * Creates interactive feedback buttons for AI responses.
 * Integrates with the existing feedback capture system.
 */

import type { KnownBlock, Button, ActionsBlock, ContextBlock } from "@slack/types";

/**
 * Feedback action IDs
 */
export const FEEDBACK_ACTION_IDS = {
  THUMBS_UP: "feedback_thumbs_up",
  THUMBS_DOWN: "feedback_thumbs_down",
  HELPFUL: "feedback_helpful",
  NOT_HELPFUL: "feedback_not_helpful",
} as const;

/**
 * Create feedback buttons block for AI responses.
 *
 * @param messageId - Unique ID to track which message the feedback is for
 * @param style - 'minimal' for just thumbs, 'full' for more options
 * @returns Block Kit blocks to append to response
 */
export function createFeedbackBlocks(
  messageId: string,
  style: "minimal" | "full" = "minimal",
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Divider before feedback section
  blocks.push({ type: "divider" });

  if (style === "minimal") {
    // Simple thumbs up/down
    const actionsBlock: ActionsBlock = {
      type: "actions",
      block_id: `feedback_actions_${messageId}`,
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👍",
            emoji: true,
          },
          action_id: FEEDBACK_ACTION_IDS.THUMBS_UP,
          value: messageId,
        } as Button,
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👎",
            emoji: true,
          },
          action_id: FEEDBACK_ACTION_IDS.THUMBS_DOWN,
          value: messageId,
        } as Button,
      ],
    };
    blocks.push(actionsBlock);
  } else {
    // Full feedback with labels
    const actionsBlock: ActionsBlock = {
      type: "actions",
      block_id: `feedback_actions_${messageId}`,
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👍 Helpful",
            emoji: true,
          },
          style: "primary",
          action_id: FEEDBACK_ACTION_IDS.HELPFUL,
          value: messageId,
        } as Button,
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👎 Not helpful",
            emoji: true,
          },
          action_id: FEEDBACK_ACTION_IDS.NOT_HELPFUL,
          value: messageId,
        } as Button,
      ],
    };
    blocks.push(actionsBlock);
  }

  // Context text
  const contextBlock: ContextBlock = {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_Was this response helpful?_",
      },
    ],
  };
  blocks.push(contextBlock);

  return blocks;
}

/**
 * Create a "feedback received" replacement block.
 *
 * @param sentiment - 'positive' or 'negative'
 * @returns Block to replace the feedback buttons with
 */
export function createFeedbackReceivedBlock(
  sentiment: "positive" | "negative",
): KnownBlock[] {
  const emoji = sentiment === "positive" ? "🙏" : "📝";
  const message = sentiment === "positive"
    ? "Thanks for your feedback!"
    : "Thanks for your feedback. We'll use this to improve.";

  return [
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${emoji} ${message}`,
        },
      ],
    } as ContextBlock,
  ];
}

/**
 * Check if an action ID is a feedback action.
 *
 * @param actionId - The action ID from the interaction
 * @returns true if this is a feedback action
 */
export function isFeedbackAction(actionId: string): boolean {
  return Object.values(FEEDBACK_ACTION_IDS).includes(actionId as any);
}

/**
 * Get the sentiment from a feedback action ID.
 *
 * @param actionId - The action ID from the interaction
 * @returns 'positive', 'negative', or null
 */
export function getFeedbackSentiment(
  actionId: string,
): "positive" | "negative" | null {
  switch (actionId) {
    case FEEDBACK_ACTION_IDS.THUMBS_UP:
    case FEEDBACK_ACTION_IDS.HELPFUL:
      return "positive";
    case FEEDBACK_ACTION_IDS.THUMBS_DOWN:
    case FEEDBACK_ACTION_IDS.NOT_HELPFUL:
      return "negative";
    default:
      return null;
  }
}

/**
 * Append feedback blocks to existing blocks array.
 *
 * @param existingBlocks - Existing message blocks
 * @param messageId - Unique ID for feedback tracking
 * @param style - Feedback button style
 * @returns Combined blocks array
 */
export function appendFeedbackBlocks(
  existingBlocks: KnownBlock[] | undefined,
  messageId: string,
  style: "minimal" | "full" = "minimal",
): KnownBlock[] {
  const blocks = existingBlocks ? [...existingBlocks] : [];
  const feedbackBlocks = createFeedbackBlocks(messageId, style);
  return [...blocks, ...feedbackBlocks];
}
