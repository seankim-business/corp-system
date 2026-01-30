/**
 * Slack Agent Status Utilities
 *
 * Uses Slack's AI Agent APIs to show status under the bot profile
 * instead of sending "Processing..." messages.
 *
 * Docs: https://docs.slack.dev/reference/methods/assistant.threads.setStatus
 */

import { WebClient } from "@slack/web-api";
import { logger } from "./logger";

/**
 * Status messages with i18n support
 */
export const AGENT_STATUS_MESSAGES = {
  thinking: {
    en: "is thinking...",
    ko: "생각하는 중...",
  },
  processing: {
    en: "is processing your request...",
    ko: "요청을 처리하는 중...",
  },
  searching: {
    en: "is searching...",
    ko: "검색하는 중...",
  },
  analyzing: {
    en: "is analyzing...",
    ko: "분석하는 중...",
  },
  generating: {
    en: "is generating a response...",
    ko: "응답을 생성하는 중...",
  },
  executing: {
    en: "is executing a task...",
    ko: "작업을 실행하는 중...",
  },
} as const;

export type AgentStatusType = keyof typeof AGENT_STATUS_MESSAGES;

/**
 * Dynamic status messages for specific operations
 */
export const DYNAMIC_STATUS_TEMPLATES = {
  analyzing: {
    en: "is analyzing your request...",
    ko: "요청을 분석하는 중...",
  },
  selectingApproach: {
    en: "is selecting the right approach...",
    ko: "적절한 방법을 선택하는 중...",
  },
  queryingService: {
    en: (service: string) => `is querying ${service}...`,
    ko: (service: string) => `${service}에 쿼리하는 중...`,
  },
  searchingService: {
    en: (service: string) => `is searching ${service}...`,
    ko: (service: string) => `${service}에서 검색하는 중...`,
  },
  executingTool: {
    en: (tool: string) => `is executing ${tool}...`,
    ko: (tool: string) => `${tool} 실행하는 중...`,
  },
  generatingResponse: {
    en: "is generating a response...",
    ko: "응답을 생성하는 중...",
  },
  processingData: {
    en: "is processing data...",
    ko: "데이터를 처리하는 중...",
  },
  connectingTo: {
    en: (service: string) => `is connecting to ${service}...`,
    ko: (service: string) => `${service}에 연결하는 중...`,
  },
} as const;

/**
 * MCP Provider display names for user-friendly status
 */
export const MCP_PROVIDER_DISPLAY_NAMES: Record<string, { en: string; ko: string }> = {
  notion: { en: "Notion", ko: "노션" },
  linear: { en: "Linear", ko: "리니어" },
  github: { en: "GitHub", ko: "깃허브" },
  slack: { en: "Slack", ko: "슬랙" },
  "google-calendar": { en: "Google Calendar", ko: "구글 캘린더" },
  drive: { en: "Google Drive", ko: "구글 드라이브" },
  jira: { en: "Jira", ko: "지라" },
  asana: { en: "Asana", ko: "아사나" },
  airtable: { en: "Airtable", ko: "에어테이블" },
};

/**
 * MCP Tool action verbs for status display
 */
/**
 * Thinking messages for each processing stage
 * These rotate automatically via Slack's loading_messages feature
 */
export const STAGE_THINKING_MESSAGES: Record<string, { en: string[]; ko: string[] }> = {
  analyzing: {
    en: [
      "Reading your message carefully...",
      "Understanding the context...",
      "Identifying key requirements...",
      "Analyzing intent and scope...",
    ],
    ko: [
      "메시지를 주의 깊게 읽는 중...",
      "맥락을 파악하는 중...",
      "핵심 요구사항을 확인하는 중...",
      "의도와 범위를 분석하는 중...",
    ],
  },
  selectingApproach: {
    en: [
      "Evaluating available tools...",
      "Selecting the best approach...",
      "Planning the execution strategy...",
      "Preparing resources...",
    ],
    ko: [
      "사용 가능한 도구를 평가하는 중...",
      "최적의 방법을 선택하는 중...",
      "실행 전략을 계획하는 중...",
      "리소스를 준비하는 중...",
    ],
  },
  processing: {
    en: [
      "Processing your request...",
      "Working on it...",
      "Making progress...",
      "Almost there...",
    ],
    ko: [
      "요청을 처리하는 중...",
      "작업 진행 중...",
      "진행 중...",
      "거의 완료...",
    ],
  },
  generating: {
    en: [
      "Synthesizing the response...",
      "Crafting a helpful answer...",
      "Finalizing the output...",
      "Polishing the response...",
    ],
    ko: [
      "응답을 종합하는 중...",
      "도움이 될 답변을 작성하는 중...",
      "결과물을 마무리하는 중...",
      "응답을 다듬는 중...",
    ],
  },
  executing: {
    en: [
      "Executing the task...",
      "Running operations...",
      "Processing actions...",
      "Completing the work...",
    ],
    ko: [
      "작업을 실행하는 중...",
      "작업을 수행하는 중...",
      "액션을 처리하는 중...",
      "작업을 완료하는 중...",
    ],
  },
};

/**
 * Thinking messages for MCP providers
 */
export const MCP_THINKING_MESSAGES: Record<string, { en: string[]; ko: string[] }> = {
  notion: {
    en: [
      "Connecting to Notion workspace...",
      "Searching Notion databases...",
      "Reading Notion pages...",
      "Processing Notion data...",
    ],
    ko: [
      "노션 워크스페이스에 연결하는 중...",
      "노션 데이터베이스를 검색하는 중...",
      "노션 페이지를 읽는 중...",
      "노션 데이터를 처리하는 중...",
    ],
  },
  linear: {
    en: [
      "Connecting to Linear...",
      "Fetching issues from Linear...",
      "Processing Linear data...",
      "Syncing with Linear...",
    ],
    ko: [
      "리니어에 연결하는 중...",
      "리니어에서 이슈를 가져오는 중...",
      "리니어 데이터를 처리하는 중...",
      "리니어와 동기화하는 중...",
    ],
  },
  github: {
    en: [
      "Connecting to GitHub...",
      "Fetching repository data...",
      "Processing GitHub information...",
      "Analyzing code changes...",
    ],
    ko: [
      "깃허브에 연결하는 중...",
      "저장소 데이터를 가져오는 중...",
      "깃허브 정보를 처리하는 중...",
      "코드 변경사항을 분석하는 중...",
    ],
  },
  slack: {
    en: [
      "Searching Slack messages...",
      "Fetching channel information...",
      "Processing Slack data...",
      "Analyzing conversations...",
    ],
    ko: [
      "슬랙 메시지를 검색하는 중...",
      "채널 정보를 가져오는 중...",
      "슬랙 데이터를 처리하는 중...",
      "대화를 분석하는 중...",
    ],
  },
};

export const MCP_TOOL_ACTIONS: Record<string, { en: string; ko: string }> = {
  getTasks: { en: "fetching tasks from", ko: "에서 작업을 가져오는 중" },
  createTask: { en: "creating task in", ko: "에 작업을 생성하는 중" },
  updateTask: { en: "updating task in", ko: "의 작업을 업데이트하는 중" },
  deleteTask: { en: "deleting task from", ko: "에서 작업을 삭제하는 중" },
  getIssues: { en: "fetching issues from", ko: "에서 이슈를 가져오는 중" },
  createIssue: { en: "creating issue in", ko: "에 이슈를 생성하는 중" },
  updateIssue: { en: "updating issue in", ko: "의 이슈를 업데이트하는 중" },
  searchMessages: { en: "searching messages in", ko: "에서 메시지를 검색하는 중" },
  sendMessage: { en: "sending message via", ko: "로 메시지를 보내는 중" },
  listEvents: { en: "fetching events from", ko: "에서 일정을 가져오는 중" },
  createEvent: { en: "creating event in", ko: "에 일정을 생성하는 중" },
  listFiles: { en: "listing files in", ko: "에서 파일을 조회하는 중" },
  readFile: { en: "reading file from", ko: "에서 파일을 읽는 중" },
  getPullRequests: { en: "fetching pull requests from", ko: "에서 PR을 가져오는 중" },
  getRepositories: { en: "fetching repositories from", ko: "에서 저장소를 가져오는 중" },
};

/**
 * Set the agent status indicator under the bot profile.
 *
 * This shows "<App Name> is thinking..." under the profile instead of
 * sending a message like "🤔 Processing...".
 *
 * The status is automatically cleared when the app sends a reply,
 * or can be manually cleared with clearAgentStatus().
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param statusType - Type of status to show
 * @param locale - User's locale for i18n (default: 'en')
 * @returns true if status was set, false if API not supported
 */
export async function setAgentStatus(
  client: WebClient,
  channelId: string,
  threadTs: string,
  statusType: AgentStatusType = "thinking",
  locale: "en" | "ko" = "en",
): Promise<boolean> {
  const statusMessage = AGENT_STATUS_MESSAGES[statusType][locale];

  try {
    // Call Slack's assistant.threads.setStatus API
    // This API may not be available for all apps (requires AI Apps feature)
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: statusMessage,
    });

    logger.debug("Agent status set", {
      channelId,
      threadTs,
      status: statusMessage,
    });

    return true;
  } catch (error: any) {
    // If the API is not available (feature not enabled), log and return false
    if (
      error.data?.error === "not_allowed" ||
      error.data?.error === "missing_scope" ||
      error.data?.error === "method_not_supported_for_channel_type" ||
      error.data?.error === "invalid_arguments"
    ) {
      logger.debug("Agent status API not available, using fallback", {
        channelId,
        error: error.data?.error,
      });
      return false;
    }

    // For other errors, log warning but don't throw
    logger.warn("Failed to set agent status", {
      channelId,
      threadTs,
      error: error.message,
    });
    return false;
  }
}

/**
 * Clear the agent status indicator.
 *
 * Note: Status is automatically cleared when sending a message,
 * but this can be used to clear it explicitly without sending.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 */
export async function clearAgentStatus(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<void> {
  try {
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "", // Empty string clears the status
    });

    logger.debug("Agent status cleared", { channelId, threadTs });
  } catch (error: any) {
    // Silently ignore errors when clearing status
    logger.debug("Could not clear agent status", {
      channelId,
      error: error.message,
    });
  }
}

/**
 * Set agent status with rotating loading messages.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param messages - Array of status messages to rotate through
 * @returns true if status was set, false if API not supported
 */
export async function setAgentStatusWithLoadingMessages(
  client: WebClient,
  channelId: string,
  threadTs: string,
  messages: string[],
): Promise<boolean> {
  try {
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: messages[0],
      loading_messages: messages,
    });

    logger.debug("Agent status with loading messages set", {
      channelId,
      threadTs,
      messageCount: messages.length,
    });

    return true;
  } catch (error: any) {
    logger.debug("Could not set agent status with loading messages", {
      channelId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Wrapper that tries Agent Status API first, falls back to reaction.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param messageTs - The original message timestamp (for reaction fallback)
 * @param statusType - Type of status to show
 * @param locale - User's locale
 * @returns 'agent-status' | 'reaction' | 'none' indicating what was used
 */
export async function setProcessingIndicator(
  client: WebClient,
  channelId: string,
  threadTs: string,
  messageTs: string,
  statusType: AgentStatusType = "thinking",
  locale: "en" | "ko" = "en",
): Promise<"agent-status" | "reaction" | "none"> {
  // Try Agent Status API first
  const agentStatusSet = await setAgentStatus(
    client,
    channelId,
    threadTs,
    statusType,
    locale,
  );

  if (agentStatusSet) {
    return "agent-status";
  }

  // Fall back to reaction
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: messageTs,
      name: "eyes", // 👀
    });
    return "reaction";
  } catch (error: any) {
    if (error.data?.error !== "already_reacted") {
      logger.warn("Failed to add processing reaction", {
        channelId,
        messageTs,
        error: error.message,
      });
    }
    return error.data?.error === "already_reacted" ? "reaction" : "none";
  }
}

/**
 * Set a custom dynamic status message.
 * Use this for real-time status updates during processing.
 *
 * @param client - Slack WebClient
 * @param channelId - The channel/DM ID
 * @param threadTs - The thread timestamp
 * @param status - Custom status message (will be shown as "<App Name> <status>")
 * @returns true if status was set
 */
export async function setDynamicStatus(
  client: WebClient,
  channelId: string,
  threadTs: string,
  status: string,
): Promise<boolean> {
  try {
    await (client as any).apiCall("assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status,
    });

    logger.debug("Dynamic agent status set", {
      channelId,
      threadTs,
      status,
    });

    return true;
  } catch (error: any) {
    if (
      error.data?.error === "not_allowed" ||
      error.data?.error === "missing_scope" ||
      error.data?.error === "method_not_supported_for_channel_type" ||
      error.data?.error === "invalid_arguments"
    ) {
      return false;
    }

    logger.debug("Failed to set dynamic agent status", {
      channelId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Format a status message for MCP tool execution.
 *
 * @param provider - MCP provider name (e.g., "notion", "linear")
 * @param toolName - Tool name (e.g., "getTasks", "createIssue")
 * @param locale - User's locale
 * @returns Formatted status message
 */
export function formatMcpToolStatus(
  provider: string,
  toolName: string,
  locale: "en" | "ko" = "en",
): string {
  const providerDisplay = MCP_PROVIDER_DISPLAY_NAMES[provider]?.[locale] || provider;
  const action = MCP_TOOL_ACTIONS[toolName];

  if (action) {
    if (locale === "ko") {
      return `${providerDisplay}${action.ko}...`;
    }
    return `is ${action.en} ${providerDisplay}...`;
  }

  // Fallback for unknown tools
  if (locale === "ko") {
    return `${providerDisplay}에서 작업하는 중...`;
  }
  return `is working with ${providerDisplay}...`;
}

/**
 * Get a stage-specific status message.
 *
 * @param stage - Processing stage
 * @param locale - User's locale
 * @param context - Optional context for dynamic messages
 * @returns Status message
 */
export function getStageStatus(
  stage: "analyzing" | "selectingApproach" | "processing" | "generating" | "executing",
  locale: "en" | "ko" = "en",
  context?: { service?: string; tool?: string },
): string {
  switch (stage) {
    case "analyzing":
      return DYNAMIC_STATUS_TEMPLATES.analyzing[locale];
    case "selectingApproach":
      return DYNAMIC_STATUS_TEMPLATES.selectingApproach[locale];
    case "processing":
      if (context?.service) {
        return DYNAMIC_STATUS_TEMPLATES.queryingService[locale](context.service);
      }
      return AGENT_STATUS_MESSAGES.processing[locale];
    case "generating":
      return DYNAMIC_STATUS_TEMPLATES.generatingResponse[locale];
    case "executing":
      if (context?.tool) {
        return DYNAMIC_STATUS_TEMPLATES.executingTool[locale](context.tool);
      }
      return AGENT_STATUS_MESSAGES.executing[locale];
    default:
      return AGENT_STATUS_MESSAGES.thinking[locale];
  }
}

/**
 * Get thinking messages for a processing stage.
 * These messages rotate automatically via Slack's loading_messages feature.
 *
 * @param stage - Processing stage
 * @param locale - User's locale
 * @returns Array of thinking messages
 */
export function getStageThinkingMessages(
  stage: "analyzing" | "selectingApproach" | "processing" | "generating" | "executing",
  locale: "en" | "ko" = "en",
): string[] {
  return STAGE_THINKING_MESSAGES[stage]?.[locale] || STAGE_THINKING_MESSAGES.processing[locale];
}

/**
 * Get thinking messages for an MCP provider.
 * These messages rotate automatically via Slack's loading_messages feature.
 *
 * @param provider - MCP provider name (e.g., "notion", "linear")
 * @param locale - User's locale
 * @returns Array of thinking messages
 */
export function getMcpThinkingMessages(
  provider: string,
  locale: "en" | "ko" = "en",
): string[] {
  const normalizedProvider = provider.toLowerCase();
  return MCP_THINKING_MESSAGES[normalizedProvider]?.[locale] || STAGE_THINKING_MESSAGES.processing[locale];
}
