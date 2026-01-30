// =============================================================================
// Types
// =============================================================================

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{
    type: string;
    text?: string | { type: string; text: string; emoji?: boolean };
    action_id?: string;
    value?: string;
    style?: string;
  }>;
  block_id?: string;
  accessory?: Record<string, unknown>;
  fields?: Array<{ type: string; text: string }>;
}

export interface SlackMessage {
  blocks: SlackBlock[];
  text: string;
  response_type?: "ephemeral" | "in_channel";
}

// =============================================================================
// Persona Emoji Helper
// =============================================================================

const PERSONA_EMOJI_MAP: Record<string, string> = {
  assistant: ":robot_face:",
  engineer: ":hammer_and_wrench:",
  analyst: ":mag:",
  writer: ":pencil2:",
  designer: ":art:",
  security: ":shield:",
  devops: ":gear:",
  qa: ":white_check_mark:",
  manager: ":briefcase:",
  researcher: ":microscope:",
  data: ":bar_chart:",
  support: ":raising_hand:",
};

export function personaEmoji(persona?: string): string {
  if (!persona) {
    return ":robot_face:";
  }
  const key = persona.toLowerCase().trim();
  return PERSONA_EMOJI_MAP[key] || ":robot_face:";
}

// =============================================================================
// Result Message
// =============================================================================

export function buildResultMessage(
  result: { output: string; status: string; skillId?: string },
  persona?: string,
): SlackMessage {
  const emoji = personaEmoji(persona);

  const statusBadge = result.status === "success"
    ? ":white_check_mark: Success"
    : result.status === "error"
      ? ":x: Error"
      : `:information_source: ${result.status}`;

  const contextParts = [statusBadge];
  if (result.skillId) {
    contextParts.push(`Skill: \`${result.skillId}\``);
  }

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Orchestration Result`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: result.output,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: contextParts.join(" | "),
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "actions",
      block_id: "result_feedback",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":thumbsup: Helpful", emoji: true },
          action_id: "feedback_positive",
          value: "positive",
        },
        {
          type: "button",
          text: { type: "plain_text", text: ":thumbsdown: Not Helpful", emoji: true },
          action_id: "feedback_negative",
          value: "negative",
        },
      ],
    },
  ];

  return {
    blocks,
    text: result.output,
  };
}

// =============================================================================
// Progress Message
// =============================================================================

interface ProgressStep {
  name: string;
  status: "pending" | "running" | "done" | "failed";
}

const STEP_STATUS_EMOJI: Record<ProgressStep["status"], string> = {
  done: ":white_check_mark:",
  running: ":hourglass_flowing_sand:",
  pending: ":black_square_button:",
  failed: ":x:",
};

export function buildProgressMessage(
  sessionId: string,
  steps: ProgressStep[],
  currentStep: number,
): SlackMessage {
  const stepLines = steps.map((step, index) => {
    const emoji = STEP_STATUS_EMOJI[step.status];
    const marker = index === currentStep ? " *<< current*" : "";
    return `${emoji} ${step.name}${marker}`;
  }).join("\n");

  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.status === "done").length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const filledCount = Math.round(progressPercent / 5);
  const emptyCount = 20 - filledCount;
  const progressBar = "\u2588".repeat(filledCount) + "\u2591".repeat(emptyCount);

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Progress*\n\n${stepLines}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`${progressBar}\` ${progressPercent}%`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Session: \`${sessionId}\` | ${completedSteps}/${totalSteps} steps complete`,
        },
      ],
    },
  ];

  return {
    blocks,
    text: `Progress: ${completedSteps}/${totalSteps} steps complete (${progressPercent}%)`,
  };
}

// =============================================================================
// Error Message
// =============================================================================

interface RetryData {
  userRequest: string;
  sessionId: string;
  userId: string;
}

export function buildErrorMessage(
  error: { message: string; code?: string },
  retryData?: RetryData,
): SlackMessage {
  const errorDetail = error.code
    ? `*Error Code:* \`${error.code}\`\n\`\`\`${error.message}\`\`\``
    : `\`\`\`${error.message}\`\`\``;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *An error occurred*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: errorDetail,
      },
    },
  ];

  if (retryData) {
    blocks.push({
      type: "actions",
      block_id: `error_retry_${retryData.sessionId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Retry", emoji: true },
          action_id: "retry_action",
          value: JSON.stringify({
            userRequest: retryData.userRequest,
            sessionId: retryData.sessionId,
            userId: retryData.userId,
          }),
          style: "primary",
        },
      ],
    });
  }

  return {
    blocks,
    text: `Error: ${error.message}`,
  };
}

// =============================================================================
// Approval Message
// =============================================================================

export function buildApprovalMessage(
  approvalId: string,
  description: string,
  expiresAt: Date,
): SlackMessage {
  const expiryTimestamp = Math.floor(expiresAt.getTime() / 1000);

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approval Required*\n\n${description}`,
      },
    },
    {
      type: "actions",
      block_id: `approval_${approvalId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          action_id: "approve_action",
          value: approvalId,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject", emoji: true },
          action_id: "reject_action",
          value: approvalId,
          style: "danger",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Expires: <!date^${expiryTimestamp}^{date_short_pretty} at {time}|${expiresAt.toISOString()}>`,
        },
      ],
    },
  ];

  return {
    blocks,
    text: `Approval Required: ${description}`,
  };
}

// =============================================================================
// Feedback Section
// =============================================================================

export function buildFeedbackSection(executionId: string): SlackBlock {
  return {
    type: "actions",
    block_id: `feedback_${executionId}`,
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: ":thumbsup: Helpful", emoji: true },
        action_id: "feedback_positive",
        value: executionId,
      },
      {
        type: "button",
        text: { type: "plain_text", text: ":thumbsdown: Not Helpful", emoji: true },
        action_id: "feedback_negative",
        value: executionId,
      },
    ],
  };
}
