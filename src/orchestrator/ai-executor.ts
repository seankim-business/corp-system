import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";
import { Category, MCPConnection } from "./types";
import { trackUsage } from "../services/cost-tracker";
import { recordAiRequest } from "../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { getOrganizationApiKey } from "../api/organization-settings";
import { anthropicMetricsTracker } from "../services/anthropic-metrics";
import { getSlackAlerts } from "../services/slack-anthropic-alerts";
import { ClaudeAccount } from "../services/account-pool";
import { AnthropicProvider } from "../providers/anthropic-provider";
import { ClaudeMaxProvider, isClaudeMaxAccount } from "../providers/claude-max-provider";
import { mcpRegistry } from "../mcp/registry";
import { executeProviderTool, getAllProviderTools } from "../mcp/providers";
import { MCPTool } from "../mcp/types";
import {
  getActiveMCPConnections,
  getAccessTokenFromConfig,
} from "../services/mcp-registry";
import { applyPatternContext } from "../services/pattern-optimizer";
import { slackStatusUpdater } from "../services/slack-status-updater";
import { slackThinkingService } from "../services/slack-thinking-message";

export interface AIExecutionParams {
  category: Category;
  skills: string[];
  prompt: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  context?: Record<string, unknown>;
  selectedAccount?: ClaudeAccount;
  agentType?: string; // Agent type for pattern retrieval
  enablePatternOptimization?: boolean; // Enable/disable pattern application
  eventId?: string; // For Slack status updates
}

export interface AIExecutionResult {
  output: string;
  status: "success" | "failed" | "rate_limited";
  metadata: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    duration: number;
    cost: number;
    error?: string;
    accountId?: string;
    accountName?: string;
    cacheReadTokens?: number;
    retryable?: boolean;
    appliedPatterns?: Array<{
      id: string;
      type: string;
      confidence: number;
    }>;
    patternCount?: number;
  };
}

const CATEGORY_MODEL_MAP: Record<Category, string> = {
  quick: "claude-3-haiku-20240307",
  writing: "claude-3-haiku-20240307",
  "unspecified-low": "claude-3-haiku-20240307",
  artistry: "claude-sonnet-4-20250514",
  "visual-engineering": "claude-sonnet-4-20250514",
  "unspecified-high": "claude-sonnet-4-20250514",
  ultrabrain: "claude-sonnet-4-20250514",
};

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
};

const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  "mcp-integration": `You are an AI assistant specialized in integrating with external tools and services via MCP (Model Context Protocol).
You can help users interact with:
- Notion: Create, read, update, delete tasks and pages
- Linear: Manage issues and projects
- GitHub: Work with repositories, issues, and pull requests
- Other MCP-enabled services

When a user asks to interact with these tools, provide clear instructions and execute the requested operations.`,

  playwright: `You are an expert in browser automation using Playwright.
You can help users with:
- Writing Playwright test scripts
- Automating browser interactions
- Web scraping and data extraction
- Screenshot capture and visual testing
- Handling dynamic content and SPAs

Provide executable Playwright code when appropriate.`,

  "git-master": `You are a Git expert who helps with version control operations.
You can assist with:
- Commit strategies and atomic commits
- Branch management and merging
- Rebasing and history management
- Resolving merge conflicts
- Git workflow best practices

Provide clear git commands and explanations.`,

  "frontend-ui-ux": `You are a senior frontend developer with strong design sensibilities.
You specialize in:
- React, Vue, Angular component development
- CSS/Tailwind styling and responsive design
- Accessibility (a11y) best practices
- Animation and interaction design
- Component architecture and state management

Provide production-ready code with modern best practices.`,
};

const tracer = trace.getTracer("ai-executor");

interface CurrentUserContext {
  id: string;
  displayName?: string | null;
  email?: string | null;
}

function buildSystemPrompt(
  skills: string[],
  registrySkillPrompts?: string[],
  threadContext?: string,
  currentUser?: CurrentUserContext,
): string {
  // Base prompt - action-oriented, no unnecessary questions
  // IMPORTANT: Always introduce yourself as Nubabel, regardless of loaded skills
  let basePrompt = `You are Nubabel, a proactive AI assistant integrated with Slack.

IDENTITY (CRITICAL - NEVER OVERRIDE):
- Your name is NUBABEL - always introduce yourself as Nubabel
- You are a general-purpose AI assistant, NOT a specialist tool
- Skills loaded below enhance your capabilities but do NOT change your identity
- When greeting users, say "Hi, I'm Nubabel" - never identify as a skill or tool

CORE BEHAVIOR:
- ACT IMMEDIATELY using the tools available to you
- NEVER ask clarifying questions if you have enough context
- When context is provided (like Slack channel/thread info), USE IT directly
- Be concise - do the task, then briefly confirm what you did
- If a task seems incomplete, make reasonable assumptions and proceed`;

  // Add current user context for identity-related questions
  if (currentUser) {
    const userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
    basePrompt += `

CURRENT USER CONTEXT:
- The user talking to you is: ${userName}
- Email: ${currentUser.email || 'not available'}
- User ID: ${currentUser.id}
- When they ask "Who am I?" or similar identity questions, tell them their name and email`;
  }

  // Add Slack-specific behavior if thread context is present
  if (threadContext) {
    basePrompt += `

SLACK INTERACTION RULES:
- You have full context of the conversation - DO NOT ask for channel/message IDs
- "My message" or "this message" = the user's last message (timestamp provided in context)
- "Add reaction/emoji" = use slack__addReaction tool immediately
- Default emoji is "thumbsup" if not specified
- Use the Channel ID and Timestamps from the context below`;
  }

  // Legacy hardcoded skill prompts
  const legacyPrompts = skills
    .filter((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .map((skill) => SKILL_SYSTEM_PROMPTS[skill]);

  // Registry-based skill prompts
  const registryPrompts = registrySkillPrompts || [];

  const allPrompts = [...legacyPrompts, ...registryPrompts].filter(Boolean);

  let systemPrompt: string;
  if (allPrompts.length === 0) {
    systemPrompt = basePrompt;
  } else {
    systemPrompt = `${basePrompt}\n\n---\n\n${allPrompts.join("\n\n---\n\n")}`;
  }

  // Add Slack thread context for conversation awareness (OpenClaw-style)
  if (threadContext) {
    systemPrompt = `${systemPrompt}\n\n---\n\n${threadContext}`;
  }

  return systemPrompt;
}

// ============================================================================
// Tool Integration for AI Executor
// ============================================================================

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Built-in web search tool using Exa API
const WEB_SEARCH_TOOL: AnthropicTool = {
  name: "web_search",
  description: "Search the web for current information. Use this when you need to find up-to-date information, research topics, or answer questions about recent events.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up on the web",
      },
      num_results: {
        type: "number",
        description: "Number of results to return (default: 5, max: 10)",
      },
    },
    required: ["query"],
  },
};

/**
 * Convert MCP tools to Anthropic tool format
 */
function convertMCPToolsToAnthropic(mcpTools: MCPTool[]): AnthropicTool[] {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: tool.inputSchema.properties || {},
      required: tool.inputSchema.required,
    },
  }));
}

/**
 * Build tools from organization MCP connections
 */
function buildOrganizationConnectionTools(connections: MCPConnection[]): AnthropicTool[] {
  const tools: AnthropicTool[] = [];

  for (const conn of connections) {
    const provider = conn.provider.toLowerCase();

    // Generate standard tools based on provider type
    switch (provider) {
      case "notion":
        tools.push(
          {
            name: `${conn.namespace}__getTasks`,
            description: `Get tasks from Notion database via connection "${conn.name}". Returns paginated tasks with optional filtering.`,
            input_schema: {
              type: "object",
              properties: {
                databaseId: {
                  type: "string",
                  description: "ID of the Notion database to query",
                },
                filter: {
                  type: "object",
                  description: "Optional filter criteria (status, assignee)",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tasks to return (default: 50)",
                },
              },
              required: ["databaseId"],
            },
          },
          {
            name: `${conn.namespace}__createTask`,
            description: `Create a new task in Notion via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                databaseId: {
                  type: "string",
                  description: "ID of the Notion database to create task in",
                },
                title: {
                  type: "string",
                  description: "Task title",
                },
                status: {
                  type: "string",
                  description: "Task status (optional)",
                },
                assignee: {
                  type: "string",
                  description: "Assignee ID or name (optional)",
                },
                dueDate: {
                  type: "string",
                  description: "Due date in ISO 8601 format (optional)",
                },
              },
              required: ["databaseId", "title"],
            },
          },
          {
            name: `${conn.namespace}__updateTask`,
            description: `Update an existing task in Notion via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "ID of the task to update",
                },
                title: { type: "string", description: "New task title (optional)" },
                status: { type: "string", description: "New task status (optional)" },
                assignee: { type: "string", description: "New assignee (optional)" },
                dueDate: { type: "string", description: "New due date (optional)" },
              },
              required: ["taskId"],
            },
          },
          {
            name: `${conn.namespace}__deleteTask`,
            description: `Delete (archive) a task in Notion via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "ID of the task to delete",
                },
              },
              required: ["taskId"],
            },
          },
        );
        break;

      case "slack":
        tools.push(
          {
            name: `${conn.namespace}__sendMessage`,
            description: `Send a message to a Slack channel via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  description: "Channel ID to send the message to",
                },
                text: {
                  type: "string",
                  description: "Message text",
                },
                thread_ts: {
                  type: "string",
                  description: "Thread timestamp to reply in thread (optional)",
                },
              },
              required: ["channel", "text"],
            },
          },
          {
            name: `${conn.namespace}__listChannels`,
            description: `List Slack channels via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                types: {
                  type: "string",
                  description: "Channel types: public_channel, private_channel (default: public_channel)",
                },
                exclude_archived: {
                  type: "boolean",
                  description: "Exclude archived channels (default: true)",
                },
                limit: {
                  type: "number",
                  description: "Max channels to return (default: 100)",
                },
              },
            },
          },
          {
            name: `${conn.namespace}__getUser`,
            description: `Get user information from Slack via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                user: {
                  type: "string",
                  description: "User ID to look up",
                },
              },
              required: ["user"],
            },
          },
          {
            name: `${conn.namespace}__searchMessages`,
            description: `Search for messages in Slack via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query text",
                },
                sort: {
                  type: "string",
                  description: "Sort order: score or timestamp (default: score)",
                },
                count: {
                  type: "number",
                  description: "Number of results (default: 20, max: 100)",
                },
              },
              required: ["query"],
            },
          },
          {
            name: `${conn.namespace}__addReaction`,
            description: `Add an emoji reaction to a Slack message via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  description: "Channel ID where the message is",
                },
                timestamp: {
                  type: "string",
                  description: "Message timestamp to react to",
                },
                emoji: {
                  type: "string",
                  description: "Emoji name (e.g., 'thumbsup', 'heart', 'eyes')",
                },
              },
              required: ["channel", "timestamp", "emoji"],
            },
          },
          {
            name: `${conn.namespace}__removeReaction`,
            description: `Remove an emoji reaction from a Slack message via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  description: "Channel ID where the message is",
                },
                timestamp: {
                  type: "string",
                  description: "Message timestamp to remove reaction from",
                },
                emoji: {
                  type: "string",
                  description: "Emoji name to remove",
                },
              },
              required: ["channel", "timestamp", "emoji"],
            },
          },
          {
            name: `${conn.namespace}__getThreadMessages`,
            description: `Get all messages in a Slack thread via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  description: "Channel ID containing the thread",
                },
                thread_ts: {
                  type: "string",
                  description: "Thread timestamp (parent message ts)",
                },
                limit: {
                  type: "number",
                  description: "Max messages to return (default: 50)",
                },
                include_parent: {
                  type: "boolean",
                  description: "Include the parent message (default: true)",
                },
              },
              required: ["channel", "thread_ts"],
            },
          },
          {
            name: `${conn.namespace}__getChannelInfo`,
            description: `Get information about a Slack channel via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  description: "Channel ID to get info for",
                },
              },
              required: ["channel"],
            },
          },
        );
        break;

      case "linear":
        tools.push(
          {
            name: `${conn.namespace}__getIssues`,
            description: `Get issues from Linear via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                teamId: { type: "string", description: "Team ID to filter issues" },
                status: { type: "string", description: "Issue status filter" },
                limit: { type: "number", description: "Max issues to return" },
              },
            },
          },
          {
            name: `${conn.namespace}__createIssue`,
            description: `Create a new issue in Linear via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                teamId: { type: "string", description: "Team ID for the issue" },
                title: { type: "string", description: "Issue title" },
                description: { type: "string", description: "Issue description" },
                priority: { type: "number", description: "Priority (0-4)" },
                assigneeId: { type: "string", description: "Assignee user ID" },
              },
              required: ["teamId", "title"],
            },
          },
          {
            name: `${conn.namespace}__updateIssue`,
            description: `Update an issue in Linear via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                issueId: { type: "string", description: "Issue ID to update" },
                title: { type: "string", description: "New title" },
                description: { type: "string", description: "New description" },
                status: { type: "string", description: "New status" },
                priority: { type: "number", description: "New priority" },
              },
              required: ["issueId"],
            },
          },
        );
        break;

      case "github":
        tools.push(
          {
            name: `${conn.namespace}__getIssues`,
            description: `Get issues from GitHub repository via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                state: { type: "string", description: "Issue state: open, closed, all" },
                labels: { type: "string", description: "Comma-separated labels" },
              },
              required: ["owner", "repo"],
            },
          },
          {
            name: `${conn.namespace}__createIssue`,
            description: `Create a GitHub issue via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                title: { type: "string", description: "Issue title" },
                body: { type: "string", description: "Issue body" },
                labels: { type: "array", items: { type: "string" }, description: "Labels" },
              },
              required: ["owner", "repo", "title"],
            },
          },
          {
            name: `${conn.namespace}__getPullRequests`,
            description: `Get pull requests from GitHub via connection "${conn.name}".`,
            input_schema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                state: { type: "string", description: "PR state: open, closed, all" },
              },
              required: ["owner", "repo"],
            },
          },
        );
        break;

      default:
        logger.debug("No predefined tools for provider", {
          provider,
          connectionId: conn.id,
        });
    }
  }

  return tools;
}

/**
 * Get available tools for the AI executor
 * Loads tools from multiple sources:
 * 1. Built-in web search (if EXA_API_KEY available)
 * 2. MCP registry tools (statically registered)
 * 3. Provider tools (loaded from environment)
 * 4. Organization MCP connections (from database)
 */
async function getAvailableToolsAsync(
  organizationId: string,
  _skills: string[],
): Promise<{ tools: AnthropicTool[]; connections: MCPConnection[] }> {
  const tools: AnthropicTool[] = [];
  let orgConnections: MCPConnection[] = [];

  // Add web search if enabled (via EXA_API_KEY)
  if (process.env.EXA_API_KEY) {
    tools.push(WEB_SEARCH_TOOL);
  }

  // Add MCP registry tools for the agent
  const registryTools = mcpRegistry.getToolsForAgent("ai_executor");
  tools.push(...convertMCPToolsToAnthropic(registryTools));

  // Add provider tools (env-based providers like LINEAR_API_KEY)
  const providerTools = getAllProviderTools();
  tools.push(...convertMCPToolsToAnthropic(providerTools));

  // Load organization-specific MCP connections from database
  try {
    orgConnections = await getActiveMCPConnections(organizationId);

    if (orgConnections.length > 0) {
      const orgTools = buildOrganizationConnectionTools(orgConnections);
      tools.push(...orgTools);

      logger.info("Loaded organization MCP connections for AI executor", {
        organizationId,
        connectionCount: orgConnections.length,
        providers: orgConnections.map((c) => c.provider),
        toolCount: orgTools.length,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to load organization MCP connections", {
      organizationId,
      error: message,
    });
  }

  return { tools, connections: orgConnections };
}


/**
 * Parse a namespaced tool name (namespace__toolName format)
 */
function parseNamespacedToolName(toolName: string): {
  namespace: string | null;
  localName: string;
} {
  if (toolName.includes("__")) {
    const parts = toolName.split("__");
    return {
      namespace: parts[0] || null,
      localName: parts.slice(1).join("__"),
    };
  }
  return { namespace: null, localName: toolName };
}

/**
 * Execute a tool call from the AI response.
 * Supports multiple tool sources:
 * 1. Built-in web search
 * 2. Organization MCP connection tools (namespace__toolName format)
 * 3. MCP registry tools
 * 4. Provider tools (env-based)
 */
async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: {
    organizationId: string;
    userId: string;
    sessionId: string;
    connections?: MCPConnection[];
    eventId?: string;
  },
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const startTime = Date.now();

  try {
    // Handle built-in web search
    if (toolName === "web_search" && process.env.EXA_API_KEY) {
      const query = toolInput.query as string;
      const numResults = Math.min((toolInput.num_results as number) || 5, 10);

      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.EXA_API_KEY,
        },
        body: JSON.stringify({
          query,
          numResults,
          useAutoprompt: true,
          type: "neural",
          contents: {
            text: { maxCharacters: 1000 },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          title: string;
          url: string;
          text: string;
          publishedDate?: string;
        }>;
      };
      const results = (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        text: r.text,
        publishedDate: r.publishedDate,
      }));

      logger.info("Web search executed", {
        query,
        numResults: results.length,
        duration: Date.now() - startTime,
      });

      return { success: true, result: results };
    }

    // Check if this is an organization MCP connection tool (namespace__toolName format)
    const parsed = parseNamespacedToolName(toolName);
    if (parsed.namespace && context.connections) {
      const connection = context.connections.find(
        (c) => c.namespace === parsed.namespace,
      );

      if (connection) {
        const accessToken = getAccessTokenFromConfig(connection.config);
        if (!accessToken) {
          return {
            success: false,
            result: null,
            error: `No access token found for MCP connection: ${connection.name}`,
          };
        }

        // Execute via the appropriate MCP server
        const provider = connection.provider.toLowerCase();
        const localToolName = parsed.localName;

        logger.info("Executing organization MCP tool", {
          toolName,
          provider,
          localToolName,
          connectionId: connection.id,
          connectionName: connection.name,
        });

        try {
          let result: unknown;

          switch (provider) {
            case "notion": {
              const { executeNotionTool } = await import("../mcp-servers/notion");
              result = await executeNotionTool(
                accessToken,
                `${parsed.namespace}__${localToolName}`,
                toolInput,
                context.organizationId,
                connection,
                context.userId,
              );
              break;
            }

            case "slack": {
              const { executeSlackTool } = await import("../mcp-servers/slack");
              result = await executeSlackTool(
                accessToken,
                `${parsed.namespace}__${localToolName}`,
                toolInput,
                context.organizationId,
                connection,
                context.userId,
              );
              break;
            }

            case "linear": {
              const { executeLinearTool } = await import("../mcp-servers/linear");
              result = await executeLinearTool(
                accessToken,
                `${parsed.namespace}__${localToolName}`,
                toolInput,
                context.organizationId,
                connection,
                context.userId,
              );
              break;
            }

            case "github": {
              const { executeGitHubTool } = await import("../mcp-servers/github");
              result = await executeGitHubTool(
                accessToken,
                `${parsed.namespace}__${localToolName}`,
                toolInput,
                context.organizationId,
                connection,
                context.userId,
              );
              break;
            }

            default:
              return {
                success: false,
                result: null,
                error: `Unsupported MCP provider: ${provider}`,
              };
          }

          logger.info("Organization MCP tool executed", {
            toolName,
            provider,
            duration: Date.now() - startTime,
          });

          return { success: true, result };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error("Organization MCP tool execution failed", {
            toolName,
            provider,
            error: errorMessage,
          });
          return { success: false, result: null, error: errorMessage };
        }
      }
    }

    // Try MCP registry first
    const registryTool = mcpRegistry.getTool(toolName);
    if (registryTool) {
      const result = await mcpRegistry.callTool(toolName, toolInput, {
        agentId: "ai_executor",
        userId: context.userId,
        organizationId: context.organizationId,
        sessionId: context.sessionId,
      });
      return {
        success: result.success,
        result: result.data,
        error: result.error?.message,
      };
    }

    // Try provider tools
    const providerResult = await executeProviderTool(toolName, toolInput, {
      agentId: "ai_executor",
      userId: context.userId,
      organizationId: context.organizationId,
      sessionId: context.sessionId,
    });

    return {
      success: providerResult.success,
      result: providerResult.data,
      error: providerResult.error?.message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Tool execution failed", { toolName, error: errorMessage });
    return { success: false, result: null, error: errorMessage };
  }
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS_PER_1K[model] || { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

function estimateInputTokens(prompt: string, systemPrompt: string): number {
  const combined = `${systemPrompt} ${prompt}`.trim();
  if (!combined) return 0;
  return combined.split(/\s+/).filter(Boolean).length;
}

const anthropicClientCache = new Map<string, Anthropic>();

async function getAnthropicClient(organizationId?: string): Promise<Anthropic> {
  const cacheKey = organizationId || "default";

  if (anthropicClientCache.has(cacheKey)) {
    return anthropicClientCache.get(cacheKey)!;
  }

  let apiKey: string | null = null;

  if (organizationId) {
    apiKey = await getOrganizationApiKey(organizationId, "anthropicApiKey");
  }

  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY || null;
  }

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set it in organization settings or as an environment variable.",
    );
  }

  const client = new Anthropic({ apiKey });
  anthropicClientCache.set(cacheKey, client);
  return client;
}

export async function executeWithAI(params: AIExecutionParams): Promise<AIExecutionResult> {
  const result = await tracer.startActiveSpan(
    "ai_executor.execute",
    async (span: Span): Promise<AIExecutionResult> => {
      const startTime = Date.now();
      const model = CATEGORY_MODEL_MAP[params.category] || "claude-sonnet-4-20250514";
      const registrySkillPrompts = (params.context?.registrySkillPrompts as string[] | undefined);
      const threadContext = (params.context?.threadContext as string | undefined);
      const currentUser = (params.context?.currentUser as CurrentUserContext | undefined);
      let systemPrompt = buildSystemPrompt(params.skills, registrySkillPrompts, threadContext, currentUser);
      const environment = process.env.NODE_ENV || "development";

      span.setAttribute("ai.model", model);
      span.setAttribute("ai.category", params.category);
      span.setAttribute("organization.id", params.organizationId);
      span.setAttribute("user.id", params.userId);
      span.setAttribute("environment", environment);

      if (params.selectedAccount) {
        span.setAttribute("account.id", params.selectedAccount.id);
        span.setAttribute("account.name", params.selectedAccount.name);
      }

      // Apply learned patterns to improve response quality (E3-T3)
      const enablePatternOpt = params.enablePatternOptimization !== false; // Default to true
      const appliedPatternRecords: Array<{ id: string; type: string; confidence: number }> = [];

      if (enablePatternOpt && params.agentType) {
        try {
          const { getRelevantPatterns } = await import("../services/pattern-optimizer");
          const patterns = await getRelevantPatterns(
            params.organizationId,
            params.agentType,
            params.prompt,
          );

          if (patterns.length > 0) {
            const patternResult = applyPatternContext(systemPrompt, patterns);
            systemPrompt = patternResult.enhancedPrompt;
            appliedPatternRecords.push(...patternResult.appliedPatterns.map((p) => ({
              id: p.id,
              type: p.patternType,
              confidence: p.confidence,
            })));

            span.setAttribute("ai.patterns_applied", patternResult.patternCount);
            logger.info("Applied learned patterns to AI execution", {
              organizationId: params.organizationId,
              agentType: params.agentType,
              patternCount: patternResult.patternCount,
            });
          }
        } catch (error) {
          logger.warn("Failed to apply patterns, continuing without them", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      let accountId: string | undefined;
      let accountName: string | undefined;

      try {
        const isMultiAccountMode = !!params.selectedAccount;
        const isClaudeMax = isMultiAccountMode && isClaudeMaxAccount(params.selectedAccount!);
        let client: Anthropic | null = null;
        let claudeMaxProvider: ClaudeMaxProvider | null = null;

        if (isClaudeMax) {
          // Claude Max account (uses session key instead of API key)
          claudeMaxProvider = new ClaudeMaxProvider({ account: params.selectedAccount! });
          accountId = params.selectedAccount!.id;
          accountName = params.selectedAccount!.name;

          logger.info("AI execution with Claude Max account", {
            accountId,
            accountName,
            model,
            category: params.category,
          });
        } else if (isMultiAccountMode) {
          // Standard Anthropic API account
          const provider = new AnthropicProvider({ account: params.selectedAccount! });
          client = (provider as any).client;
          accountId = params.selectedAccount!.id;
          accountName = params.selectedAccount!.name;

          logger.info("AI execution with Anthropic API account", {
            accountId,
            accountName,
            model,
            category: params.category,
          });
        } else {
          client = await getAnthropicClient(params.organizationId);
          accountName = "default";

          logger.info("AI execution with environment key", {
            model,
            category: params.category,
          });
        }

        logger.info("Executing AI request", {
          model,
          category: params.category,
          skills: params.skills,
          sessionId: params.sessionId,
        });

        const inputTokenEstimate = await tracer.startActiveSpan(
          "ai_executor.count_tokens",
          async (tokenSpan) => {
            try {
              const count = estimateInputTokens(params.prompt, systemPrompt);
              tokenSpan.setAttribute("tokens.input_estimate", count);
              return count;
            } finally {
              tokenSpan.end();
            }
          },
        );

        span.setAttribute("ai.tokens.input_estimate", inputTokenEstimate);

        // Get available tools (async to load organization MCP connections)
        // Note: Tools are only supported with Anthropic API, not Claude Max
        const { tools: availableTools, connections: orgConnections } =
          await getAvailableToolsAsync(params.organizationId, params.skills);
        const hasTools = availableTools.length > 0 && !isClaudeMax;

        logger.info("AI execution with tools", {
          toolCount: hasTools ? availableTools.length : 0,
          tools: hasTools ? availableTools.map((t) => t.name) : [],
          orgConnectionCount: orgConnections.length,
          isClaudeMax,
        });

        // Response type that works for both Anthropic API and Claude Max
        interface UnifiedResponse {
          content: string;
          usage: {
            input_tokens: number;
            output_tokens: number;
          };
          stop_reason: string;
        }

        const response = await tracer.startActiveSpan("ai_executor.api_call", async (apiSpan) => {
          const callStart = Date.now();
          try {
            // =====================================================================
            // Claude Max execution path (no tools support, uses web API)
            // =====================================================================
            if (isClaudeMax && claudeMaxProvider) {
              apiSpan.setAttribute("ai.provider", "claude-max");
              apiSpan.setAttribute("ai.endpoint", "claude.ai/api");
              apiSpan.setAttribute("ai.model", model);
              apiSpan.setAttribute("ai.tools_count", 0);

              const chatResponse = await claudeMaxProvider.chat(
                [{ role: "user", content: params.prompt }],
                { model, systemPrompt },
              );

              const durationMs = Date.now() - callStart;

              apiSpan.setAttribute("ai.tokens.input", chatResponse.usage.inputTokens);
              apiSpan.setAttribute("ai.tokens.output", chatResponse.usage.outputTokens);
              apiSpan.setAttribute("ai.duration_ms", durationMs);
              apiSpan.setAttribute("ai.finish_reason", chatResponse.finishReason);

              return {
                content: chatResponse.content,
                usage: {
                  input_tokens: chatResponse.usage.inputTokens,
                  output_tokens: chatResponse.usage.outputTokens,
                },
                stop_reason: chatResponse.finishReason,
              } satisfies UnifiedResponse;
            }

            // =====================================================================
            // Anthropic API execution path (with tools support)
            // =====================================================================
            if (!client) {
              throw new Error("No Anthropic client available");
            }

            apiSpan.setAttribute("ai.provider", "anthropic");
            apiSpan.setAttribute("ai.endpoint", "/v1/messages");
            apiSpan.setAttribute("ai.model", model);
            apiSpan.setAttribute("ai.tools_count", availableTools.length);

            // Build messages array for tool loop
            const messages: Anthropic.Messages.MessageParam[] = [
              {
                role: "user",
                content: params.prompt,
              },
            ];

            // Tool execution loop (max 10 iterations to prevent infinite loops)
            const MAX_TOOL_ITERATIONS = 10;
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            let result: Anthropic.Messages.Message | undefined;

            for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
              const createParams: Anthropic.Messages.MessageCreateParams = {
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
              };

              // Only add tools if available
              if (hasTools) {
                createParams.tools = availableTools;
              }

              result = await client.messages.create(createParams);
              totalInputTokens += result.usage.input_tokens;
              totalOutputTokens += result.usage.output_tokens;

              // Check if we need to execute tools
              if (result.stop_reason !== "tool_use") {
                // No more tool calls, we're done
                // Clear thinking message if any
                if (params.eventId) {
                  await slackThinkingService.clearThinking(params.eventId);
                }
                break;
              }

              // Find tool_use blocks and execute them
              const toolUseBlocks = result.content.filter(
                (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
              );

              if (toolUseBlocks.length === 0) {
                break;
              }

              // Extract Claude's reasoning text (text blocks before tool_use)
              // This shows the AI's actual thinking process
              const textBlocks = result.content.filter(
                (block): block is Anthropic.Messages.TextBlock => block.type === "text"
              );
              const reasoningText = textBlocks.map(b => b.text).join(" ").trim();

              // Show Claude's reasoning as a thinking message
              if (params.eventId && reasoningText) {
                // Truncate if too long (max ~200 chars for readability)
                const truncatedReasoning = reasoningText.length > 200
                  ? reasoningText.substring(0, 197) + "..."
                  : reasoningText;

                // Determine stage from first tool being called
                const firstTool = toolUseBlocks[0];
                const parsed = parseNamespacedToolName(firstTool.name);
                const stage = parsed.namespace
                  ? `Working with ${parsed.namespace}`
                  : "Processing";

                await slackThinkingService.updateThinking(
                  params.eventId,
                  truncatedReasoning,
                  stage,
                );
              }

              // Add assistant's response to messages
              messages.push({
                role: "assistant",
                content: result.content,
              });

              // Execute each tool and collect results
              const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
              for (const toolUse of toolUseBlocks) {
                logger.info("Executing tool", {
                  tool: toolUse.name,
                  id: toolUse.id,
                  iteration,
                });

                // Update Slack status for MCP tool execution
                if (params.eventId) {
                  const parsed = parseNamespacedToolName(toolUse.name);
                  if (parsed.namespace) {
                    // Find provider from connection or infer from namespace
                    const conn = orgConnections.find(c => c.namespace === parsed.namespace);
                    const provider = conn?.provider || parsed.namespace;
                    // Use thinking messages for better UX - shows rotating context
                    await slackStatusUpdater.updateMcpStatusWithThinking(params.eventId, provider);
                  }
                }

                const execResult = await executeToolCall(
                  toolUse.name,
                  toolUse.input as Record<string, unknown>,
                  {
                    organizationId: params.organizationId,
                    userId: params.userId,
                    sessionId: params.sessionId,
                    connections: orgConnections,
                    eventId: params.eventId,
                  },
                );

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: execResult.success
                    ? JSON.stringify(execResult.result, null, 2)
                    : `Error: ${execResult.error}`,
                  is_error: !execResult.success,
                });

                logger.info("Tool executed", {
                  tool: toolUse.name,
                  success: execResult.success,
                  iteration,
                });
              }

              // Add tool results to messages for next iteration
              messages.push({
                role: "user",
                content: toolResults,
              });
            }

            if (!result) {
              throw new Error("No response from AI");
            }

            const durationMs = Date.now() - callStart;

            apiSpan.setAttribute("ai.tokens.input", totalInputTokens);
            apiSpan.setAttribute("ai.tokens.output", totalOutputTokens);
            apiSpan.setAttribute("ai.duration_ms", durationMs);
            apiSpan.setAttribute("ai.finish_reason", result.stop_reason ?? "unknown");

            // Extract text content from Anthropic response
            let textContent = "";
            for (const block of result.content) {
              if (block.type === "text") {
                textContent += block.text;
              }
            }

            // Return unified response format
            return {
              content: textContent,
              usage: {
                input_tokens: totalInputTokens,
                output_tokens: totalOutputTokens,
              },
              stop_reason: result.stop_reason ?? "unknown",
            } satisfies UnifiedResponse;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            apiSpan.recordException(error as Error);
            apiSpan.setStatus({ code: SpanStatusCode.ERROR, message });

            // Track rate limit errors (429)
            if (
              error instanceof Error &&
              (error.message.includes("429") || error.message.includes("rate limit"))
            ) {
              await anthropicMetricsTracker
                .recordRateLimit("default")
                .catch((err: Error) =>
                  logger.warn("Failed to track rate limit", { error: err.message }),
                );

              // Send Slack alert
              const slackAlerts = getSlackAlerts();
              if (slackAlerts) {
                slackAlerts
                  .sendRateLimitAlert({
                    accountName: "default",
                    error: error.message,
                    timestamp: new Date(),
                  })
                  .catch((err: Error) =>
                    logger.warn("Failed to send Slack alert", { error: err.message }),
                  );
              }
            }

            throw error;
          } finally {
            apiSpan.end();
          }
        });

        const duration = Date.now() - startTime;
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;

        // Calculate cost - Claude Max is free (subscription-based), Anthropic API has per-token cost
        const cost = await tracer.startActiveSpan(
          "ai_executor.calculate_cost",
          async (costSpan) => {
            try {
              // Claude Max has no per-token cost
              const computed = isClaudeMax ? 0 : calculateCost(model, inputTokens, outputTokens);
              costSpan.setAttribute("ai.cost_usd", computed);
              return computed;
            } finally {
              costSpan.end();
            }
          },
        );

        span.setAttribute("ai.tokens.input", inputTokens);
        span.setAttribute("ai.tokens.output", outputTokens);
        span.setAttribute("ai.cost_usd", cost);
        span.setAttribute("ai.duration_ms", duration);

        // Output is already extracted in the unified response format
        const output = response.content;

        await trackUsage({
          organizationId: params.organizationId,
          userId: params.userId,
          sessionId: params.sessionId,
          model,
          inputTokens,
          outputTokens,
          cost,
          category: params.category,
        }).catch((err: Error) => logger.warn("Failed to track usage", { error: err.message }));

        recordAiRequest({
          model,
          category: params.category,
          success: true,
          duration,
          inputTokens,
          outputTokens,
        });

        // Track Anthropic-specific metrics
        await anthropicMetricsTracker
          .recordRequest({
            model,
            category: params.category,
            inputTokens,
            outputTokens,
            cost,
            duration,
            success: true,
          })
          .catch((err: Error) =>
            logger.warn("Failed to track Anthropic metrics", { error: err.message }),
          );

        const cacheReadTokens = (response.usage as any).cache_read_input_tokens || 0;

        logger.info("AI execution completed", {
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cost: cost.toFixed(6),
          duration,
          accountId,
          accountName,
          isClaudeMax,
        });

        span.setStatus({ code: SpanStatusCode.OK });

        // Clear thinking message on successful completion
        if (params.eventId) {
          await slackThinkingService.clearThinking(params.eventId);
        }

        const executionResult: AIExecutionResult = {
          output,
          status: "success",
          metadata: {
            model,
            inputTokens,
            outputTokens,
            duration,
            cost,
            accountId,
            accountName,
            cacheReadTokens,
            appliedPatterns: appliedPatternRecords.length > 0 ? appliedPatternRecords : undefined,
            patternCount: appliedPatternRecords.length > 0 ? appliedPatternRecords.length : undefined,
          },
        };

        return executionResult;
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRateLimited = error instanceof APIError && error.status === 429;

        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        if (isRateLimited) {
          const trackingAccountName = accountName || "default";
          await anthropicMetricsTracker
            .recordRateLimit(trackingAccountName)
            .catch((err: Error) =>
              logger.warn("Failed to track rate limit", { error: err.message }),
            );

          const slackAlerts = getSlackAlerts();
          if (slackAlerts) {
            slackAlerts
              .sendRateLimitAlert({
                accountName: trackingAccountName,
                error: error.message,
                timestamp: new Date(),
              })
              .catch((err: Error) =>
                logger.warn("Failed to send Slack alert", { error: err.message }),
              );
          }
        }

        recordAiRequest({
          model,
          category: params.category,
          success: false,
          duration,
          inputTokens: 0,
          outputTokens: 0,
        });

        await anthropicMetricsTracker
          .recordRequest({
            model,
            category: params.category,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            duration,
            success: false,
            error: errorMessage,
          })
          .catch((err: Error) =>
            logger.warn("Failed to track Anthropic error metrics", { error: err.message }),
          );

        logger.error("AI execution failed", {
          model,
          error: errorMessage,
          duration,
          accountId,
          accountName,
          isRateLimited,
        });

        // Clear thinking message on error
        if (params.eventId) {
          await slackThinkingService.clearThinking(params.eventId);
        }

        return {
          output: `AI execution failed: ${errorMessage}`,
          status: isRateLimited ? "rate_limited" : "failed",
          metadata: {
            model,
            inputTokens: 0,
            outputTokens: 0,
            duration,
            cost: 0,
            error: errorMessage,
            accountId,
            accountName,
            retryable: isRateLimited,
          },
        };
      } finally {
        span.end();
      }
    },
  );

  return result;
}
