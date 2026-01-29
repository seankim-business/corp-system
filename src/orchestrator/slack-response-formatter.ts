import { AgentConfig } from "../config/agent-loader";
import { SkillConfig } from "../config/skill-loader";

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
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const contextItems: string[] = [];

  if (sopPath) {
    contextItems.push(`📋 사용 SOP: \`${sopPath}\``);
  }

  if (skills.length > 0) {
    const skillNames = skills.map((s) => s.id).join(", ");
    contextItems.push(`🛠️ 활성 스킬: ${skillNames}`);
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
export function formatApprovalButtons(approvalId: string): SlackBlock {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "✅ 승인",
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
          text: "❌ 거절",
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

  // Agent header
  blocks.push(...formatAgentHeader(context.agent));

  // Context (SOP + skills)
  const contextBlocks = formatAgentContext(context.skills, context.sopPath);
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
    blocks.push(formatApprovalButtons(context.approvalId));
  }

  return blocks;
}

/**
 * Format initial processing message
 */
export function formatProcessingMessage(agent: AgentConfig): SlackBlock[] {
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
          text: "⏳ 요청을 처리하고 있습니다...",
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
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "🤔 요청을 더 잘 이해하기 위해 확인이 필요합니다. 어떤 작업을 원하시나요?",
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
          text: "에이전트 선택...",
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
 * Format error message
 */
export function formatErrorMessage(
  errorMessage: string,
  agentId?: string,
): SlackBlock[] {
  const header = agentId ? `❌ [${agentId}] 오류 발생` : "❌ 오류 발생";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${header}*\n\n${errorMessage}`,
      },
    },
  ];
}

/**
 * Format multi-agent workflow start message
 */
export function formatMultiAgentStart(
  agents: AgentConfig[],
): SlackBlock[] {
  const agentList = agents
    .map((a) => `• ${a.emoji} ${a.name}`)
    .join("\n");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔄 *멀티 에이전트 워크플로우 시작*\n\n다음 에이전트들이 협력하여 요청을 처리합니다:\n${agentList}`,
      },
    },
  ];
}
