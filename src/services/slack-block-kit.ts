// =============================================================================
// Types
// =============================================================================

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: string | { type: string; text: string }; action_id?: string; value?: string; style?: string; url?: string }>;
  block_id?: string;
  accessory?: Record<string, unknown>;
  fields?: Array<{ type: string; text: string }>;
}

export interface SlackMessage {
  text: string;
  blocks: SlackBlock[];
}

// =============================================================================
// Persona-Based Emoji System
// =============================================================================

const CATEGORY_EMOJIS: Record<string, string> = {
  quick: "⚡",
  writing: "📝",
  artistry: "🎨",
  "visual-engineering": "🖥️",
  ultrabrain: "🧠",
  "unspecified-low": "📋",
  "unspecified-high": "🔬",
};

const SKILL_EMOJIS: Record<string, string> = {
  "mcp-integration": "🔌",
  playwright: "🎭",
  "git-master": "🌿",
  "frontend-ui-ux": "💅",
};

const STATUS_EMOJIS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  processing: "⏳",
  approval: "🔐",
  budget: "💰",
};

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJIS[category] || "🤖";
}

export function getSkillEmoji(skill: string): string {
  return SKILL_EMOJIS[skill] || "🔧";
}

// =============================================================================
// Message Builders
// =============================================================================

export function buildSuccessMessage(data: {
  output: string;
  category: string;
  skills: string[];
  duration: number;
  model: string;
}): { text: string; blocks: any[] } {
  const { output, category, skills, duration, model } = data;

  return {
    text: output,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Task Completed*\n\n${output}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📊 *Category:* \`${category}\` | *Skills:* \`${skills.join(", ")}\` | *Model:* \`${model}\` | *Duration:* ${(duration / 1000).toFixed(2)}s`,
          },
        ],
      },
    ],
  };
}

export function buildErrorMessage(data: { error: string; eventId: string }): {
  text: string;
  blocks: any[];
} {
  const { error, eventId } = data;

  return {
    text: `Error: ${error}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error*\n\n${error}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🔍 *Event ID:* \`${eventId}\``,
          },
        ],
      },
    ],
  };
}

export function buildProgressMessage(data: { status: string; progress: number }): {
  text: string;
  blocks: any[];
} {
  const { status, progress } = data;
  const progressBar =
    "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));

  return {
    text: status,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${STATUS_EMOJIS.processing} *Processing...*\n\n${status}\n\n${progressBar} ${progress}%`,
        },
      },
    ],
  };
}

// =============================================================================
// Rich Result Messages
// =============================================================================

export function buildRichSuccessMessage(data: {
  output: string;
  category: string;
  skills: string[];
  duration: number;
  model: string;
  sessionId: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}): SlackMessage {
  const { output, category, skills, duration, model, inputTokens, outputTokens, cost } = data;
  const emoji = getCategoryEmoji(category);
  const skillEmojis = skills.map((s) => `${getSkillEmoji(s)} ${s}`).join(", ");

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Task Completed*\n\n${truncateOutput(output, 2800)}`,
      },
    },
    { type: "divider" as any },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Category:*\n\`${category}\`` },
        { type: "mrkdwn", text: `*Model:*\n\`${model}\`` },
        { type: "mrkdwn", text: `*Skills:*\n${skillEmojis || "None"}` },
        { type: "mrkdwn", text: `*Duration:*\n${formatDuration(duration)}` },
      ],
    },
  ];

  if (inputTokens || outputTokens || cost) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            inputTokens ? `📥 ${inputTokens.toLocaleString()} input` : "",
            outputTokens ? `📤 ${outputTokens.toLocaleString()} output` : "",
            cost ? `💵 $${cost.toFixed(4)}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        },
      ],
    });
  }

  // Feedback buttons
  blocks.push({
    type: "actions" as any,
    block_id: `feedback_${data.sessionId}`,
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "👍 Helpful" },
        action_id: "feedback_positive",
        value: data.sessionId,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "👎 Not helpful" },
        action_id: "feedback_negative",
        value: data.sessionId,
      },
    ],
  });

  return { text: output, blocks };
}

// =============================================================================
// Approval Request Message
// =============================================================================

export function buildApprovalMessage(data: {
  action: string;
  description: string;
  requestedBy: string;
  approvalId: string;
  estimatedCost?: number;
}): SlackMessage {
  const { action, description, requestedBy, approvalId, estimatedCost } = data;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${STATUS_EMOJIS.approval} *Approval Required*\n\n*Action:* ${action}\n*Description:* ${description}\n*Requested by:* <@${requestedBy}>`,
      },
    },
  ];

  if (estimatedCost) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${STATUS_EMOJIS.budget} Estimated cost: $${estimatedCost.toFixed(2)}`,
        },
      ],
    });
  }

  blocks.push({
    type: "actions" as any,
    block_id: `approval_${approvalId}`,
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Approve" },
        action_id: "approve_action",
        value: approvalId,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Reject" },
        action_id: "reject_action",
        value: approvalId,
        style: "danger",
      },
    ],
  });

  return { text: `Approval Required: ${action}`, blocks };
}

// =============================================================================
// Budget Warning Message
// =============================================================================

export function buildBudgetWarningMessage(data: {
  organizationName: string;
  usedPercent: number;
  usedAmount: number;
  budgetAmount: number;
  currency?: string;
}): SlackMessage {
  const { organizationName, usedPercent, usedAmount, budgetAmount, currency = "USD" } = data;

  let statusEmoji = "💚";
  let statusText = "Within budget";
  if (usedPercent >= 100) {
    statusEmoji = "🔴";
    statusText = "Budget exceeded";
  } else if (usedPercent >= 90) {
    statusEmoji = "🟡";
    statusText = "Approaching limit";
  } else if (usedPercent >= 75) {
    statusEmoji = "🟠";
    statusText = "Budget warning";
  }

  const progressBar =
    "▓".repeat(Math.min(10, Math.floor(usedPercent / 10))) +
    "░".repeat(Math.max(0, 10 - Math.floor(usedPercent / 10)));

  return {
    text: `Budget ${statusText}: ${usedPercent.toFixed(1)}% used`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} *Budget Alert: ${organizationName}*\n\n${progressBar} *${usedPercent.toFixed(1)}%* used\n\n*Spent:* $${(usedAmount / 100).toFixed(2)} ${currency} / $${(budgetAmount / 100).toFixed(2)} ${currency}\n*Status:* ${statusText}`,
        },
      },
    ],
  };
}

// =============================================================================
// Clarification Message
// =============================================================================

export function buildClarificationMessage(data: {
  originalRequest: string;
  questions: string[];
}): SlackMessage {
  const { originalRequest, questions } = data;

  const questionsList = questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  return {
    text: "Clarification needed",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${STATUS_EMOJIS.info} *Clarification Needed*\n\nI understood your request:\n> ${truncateOutput(originalRequest, 200)}\n\nCould you clarify the following?\n${questionsList}`,
        },
      },
    ],
  };
}

// =============================================================================
// Error Templates
// =============================================================================

export function buildDetailedErrorMessage(data: {
  error: string;
  errorCode?: string;
  eventId: string;
  suggestion?: string;
  retryable?: boolean;
}): SlackMessage {
  const { error, errorCode, eventId, suggestion, retryable } = data;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${STATUS_EMOJIS.error} *Error Occurred*\n\n${error}`,
      },
    },
  ];

  if (errorCode) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Error Code:* \`${errorCode}\` | *Event ID:* \`${eventId}\`` },
      ],
    });
  }

  if (suggestion) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💡 *Suggestion:* ${suggestion}`,
      },
    });
  }

  if (retryable) {
    blocks.push({
      type: "actions" as any,
      block_id: `error_${eventId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔄 Retry" },
          action_id: "retry_action",
          value: eventId,
        },
      ],
    });
  }

  return { text: `Error: ${error}`, blocks };
}

// =============================================================================
// Helpers
// =============================================================================

function truncateOutput(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
