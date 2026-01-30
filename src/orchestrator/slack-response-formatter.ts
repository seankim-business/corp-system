import { AgentConfig } from "../config/agent-loader";
import { SkillConfig } from "../config/skill-loader";
import { randomUUID } from "crypto";

// Slack Block Kit types (simplified for compatibility)
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: Array<{
    type: string;
    text?: string | { type: string; text: string; emoji?: boolean };
    style?: string;
    action_id?: string;
    value?: string;
    placeholder?: { type: string; text: string; emoji?: boolean };
    options?: Array<{
      text: { type: string; text: string; emoji?: boolean };
      description?: { type: string; text: string; emoji?: boolean };
      value: string;
    }>;
  }>;
}

// Supported languages
export type Language = "ko" | "en";

// Message dictionaries
const MESSAGES = {
  ko: {
    // Context and status
    usingSOP: "📋 사용 SOP",
    activeSkills: "🛠️ 활성 스킬",
    processing: "⏳ 요청을 처리하고 있습니다...",

    // Clarification
    clarificationNeeded: "🤔 요청을 더 잘 이해하기 위해 확인이 필요합니다. 어떤 작업을 원하시나요?",
    selectAgent: "에이전트 선택...",

    // Errors
    errorOccurred: "오류 발생",
    budgetExhausted: "예산 한도에 도달했습니다. 관리자에게 문의하세요.",
    rateLimited: "잠시 후 다시 시도해주세요.",
    mcpError: "[{service}] 연결에 실패했습니다. 통합 설정을 확인하세요.",
    genericError: "문제가 발생했습니다. 오류 ID: {errorId}",

    // Multi-agent
    multiAgentStart: "🔄 *멀티 에이전트 워크플로우 시작*\n\n다음 에이전트들이 협력하여 요청을 처리합니다:",

    // Approval
    approve: "✅ 승인",
    reject: "❌ 거절",
  },
  en: {
    // Context and status
    usingSOP: "📋 Using SOP",
    activeSkills: "🛠️ Active Skills",
    processing: "⏳ Processing your request...",

    // Clarification
    clarificationNeeded: "🤔 I need clarification to better understand your request. What would you like to do?",
    selectAgent: "Select agent...",

    // Errors
    errorOccurred: "Error Occurred",
    budgetExhausted: "Budget limit reached. Contact admin.",
    rateLimited: "Please try again in a few minutes.",
    mcpError: "Failed to connect to [{service}]. Check integration settings.",
    genericError: "Something went wrong. Error ID: {errorId}",

    // Multi-agent
    multiAgentStart: "🔄 *Multi-Agent Workflow Started*\n\nThe following agents will collaborate to process your request:",

    // Approval
    approve: "✅ Approve",
    reject: "❌ Reject",
  },
} as const;

export interface AgentResponseContext {
  agent: AgentConfig;
  skills: SkillConfig[];
  sopPath?: string;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
  approvalId?: string;
  language?: Language;
}

/**
 * Get translated message
 */
function getMessage(key: keyof typeof MESSAGES.ko, language: Language = "ko"): string {
  return MESSAGES[language][key];
}

/**
 * Replace placeholders in message template
 */
function formatMessage(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );
}

/**
 * Format agent persona header for Slack
 */
export function formatAgentHeader(agent: AgentConfig): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${agent.emoji} *[${agent.id}]* ${agent.function}`,
      },
    },
  ];
}

/**
 * Format active skills and SOP for Slack
 */
export function formatAgentContext(
  skills: SkillConfig[],
  sopPath?: string,
  language: Language = "ko",
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const contextItems: string[] = [];

  if (sopPath) {
    contextItems.push(`${getMessage("usingSOP", language)}: \`${sopPath}\``);
  }

  if (skills.length > 0) {
    const skillNames = skills.map((s) => s.id).join(", ");
    contextItems.push(`${getMessage("activeSkills", language)}: ${skillNames}`);
  }

  if (contextItems.length > 0) {
    blocks.push({
      type: "context",
      elements: contextItems.map((item) => ({
        type: "mrkdwn",
        text: item,
      })),
    });
  }

  return blocks;
}

/**
 * Format progress indicator for Slack
 */
export function formatProgress(
  current: number,
  total: number,
  message: string,
): SlackBlock {
  const percentage = Math.round((current / total) * 100);
  const filledBlocks = Math.round((current / total) * 10);
  const emptyBlocks = 10 - filledBlocks;

  const progressBar = "■".repeat(filledBlocks) + "□".repeat(emptyBlocks);

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `[${progressBar}] ${percentage}% - ${message}`,
    },
  };
}

/**
 * Format approval buttons for Slack
 */
export function formatApprovalButtons(approvalId: string, language: Language = "ko"): SlackBlock {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: getMessage("approve", language),
          emoji: true,
        },
        style: "primary",
        action_id: `approve_${approvalId}`,
        value: approvalId,
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: getMessage("reject", language),
          emoji: true,
        },
        style: "danger",
        action_id: `reject_${approvalId}`,
        value: approvalId,
      },
    ],
  };
}

/**
 * Format complete agent response for Slack
 */
export function formatAgentResponse(
  context: AgentResponseContext,
  responseText: string,
): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const language = context.language || "ko";

  // Agent header
  blocks.push(...formatAgentHeader(context.agent));

  // Context (SOP + skills)
  const contextBlocks = formatAgentContext(context.skills, context.sopPath, language);
  if (contextBlocks.length > 0) {
    blocks.push(...contextBlocks);
    blocks.push({ type: "divider" });
  }

  // Progress if available
  if (context.progress) {
    blocks.push(
      formatProgress(
        context.progress.current,
        context.progress.total,
        context.progress.message,
      ),
    );
    blocks.push({ type: "divider" });
  }

  // Main response
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: responseText,
    },
  });

  // Approval buttons if needed
  if (context.approvalId) {
    blocks.push({ type: "divider" });
    blocks.push(formatApprovalButtons(context.approvalId, language));
  }

  return blocks;
}

/**
 * Format initial processing message
 */
export function formatProcessingMessage(agent: AgentConfig, language: Language = "ko"): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${agent.emoji} *[${agent.id}]* ${agent.function}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: getMessage("processing", language),
        },
      ],
    },
  ];
}

/**
 * Format clarification question for ambiguous requests
 */
export function formatClarificationQuestion(
  candidates: AgentConfig[],
  language: Language = "ko",
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: getMessage("clarificationNeeded", language),
    },
  });

  const options = candidates.map((c) => ({
    text: {
      type: "plain_text" as const,
      text: `${c.emoji} ${c.name}`,
      emoji: true,
    },
    description: {
      type: "plain_text" as const,
      text: c.function.substring(0, 75),
      emoji: true,
    },
    value: c.id,
  }));

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "static_select",
        placeholder: {
          type: "plain_text",
          text: getMessage("selectAgent", language),
          emoji: true,
        },
        options,
        action_id: "select_agent",
      },
    ],
  });

  return blocks;
}

/**
 * Error type for specialized error messages
 */
export type ErrorType = "budget" | "rate_limit" | "mcp" | "generic";

export interface ErrorMessageOptions {
  errorMessage?: string;
  agentId?: string;
  language?: Language;
  errorType?: ErrorType;
  errorId?: string;
  serviceName?: string;
}

/**
 * Format error message with language support and error type detection
 */
export function formatErrorMessage(
  options: ErrorMessageOptions | string,
  agentId?: string,
): SlackBlock[] {
  // Support legacy signature
  let opts: ErrorMessageOptions;
  if (typeof options === "string") {
    opts = {
      errorMessage: options,
      agentId,
      language: "ko",
      errorType: "generic",
    };
  } else {
    opts = options;
  }

  const {
    errorMessage = "",
    agentId: optAgentId,
    language = "ko",
    errorType = "generic",
    errorId = randomUUID(),
    serviceName,
  } = opts;

  const actualAgentId = optAgentId || agentId;

  // Generate appropriate error message based on type
  let displayMessage: string;
  switch (errorType) {
    case "budget":
      displayMessage = getMessage("budgetExhausted", language);
      break;
    case "rate_limit":
      displayMessage = getMessage("rateLimited", language);
      break;
    case "mcp":
      displayMessage = formatMessage(getMessage("mcpError", language), {
        service: serviceName || "Unknown",
      });
      break;
    case "generic":
    default:
      displayMessage = errorMessage || formatMessage(getMessage("genericError", language), {
        errorId,
      });
      break;
  }

  const headerText = getMessage("errorOccurred", language);
  const header = actualAgentId ? `❌ [${actualAgentId}] ${headerText}` : `❌ ${headerText}`;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${header}*\n\n${displayMessage}`,
      },
    },
  ];

  // Add correlation ID for debugging
  if (errorType === "generic" || errorId) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🔍 Error ID: \`${errorId}\``,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Format multi-agent workflow start message
 */
export function formatMultiAgentStart(
  agents: AgentConfig[],
  language: Language = "ko",
): SlackBlock[] {
  const agentList = agents
    .map((a) => `• ${a.emoji} ${a.name}`)
    .join("\n");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${getMessage("multiAgentStart", language)}\n${agentList}`,
      },
    },
  ];
}
