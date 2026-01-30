import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";
import { Category } from "./types";
import { trackUsage } from "../services/cost-tracker";
import { recordAiRequest } from "../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { getOrganizationApiKey } from "../api/organization-settings";
import { anthropicMetricsTracker } from "../services/anthropic-metrics";
import { getSlackAlerts } from "../services/slack-anthropic-alerts";
import { ClaudeAccount } from "../services/account-pool";
import { AnthropicProvider } from "../providers/anthropic-provider";
import { mcpRegistry } from "../mcp/registry";
import { executeProviderTool, getAllProviderTools } from "../mcp/providers";
import { MCPTool } from "../mcp/types";

export interface AIExecutionParams {
  category: Category;
  skills: string[];
  prompt: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  context?: Record<string, unknown>;
  selectedAccount?: ClaudeAccount;
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
  };
}

const CATEGORY_MODEL_MAP: Record<Category, string> = {
  quick: "claude-3-5-haiku-20241022",
  writing: "claude-3-5-haiku-20241022",
  "unspecified-low": "claude-3-5-haiku-20241022",
  artistry: "claude-3-5-sonnet-20241022",
  "visual-engineering": "claude-3-5-sonnet-20241022",
  "unspecified-high": "claude-3-5-sonnet-20241022",
  ultrabrain: "claude-3-5-sonnet-20241022",
};

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
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

function buildSystemPrompt(skills: string[], registrySkillPrompts?: string[]): string {
  const basePrompt = `You are a helpful AI assistant. Respond concisely and accurately.`;

  // Legacy hardcoded skill prompts
  const legacyPrompts = skills
    .filter((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .map((skill) => SKILL_SYSTEM_PROMPTS[skill]);

  // Registry-based skill prompts
  const registryPrompts = registrySkillPrompts || [];

  const allPrompts = [...legacyPrompts, ...registryPrompts].filter(Boolean);

  if (allPrompts.length === 0) {
    return basePrompt;
  }

  return `${allPrompts.join("\n\n---\n\n")}\n\n---\n\nRemember to be helpful, accurate, and concise.`;
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
 * Get available tools for the AI executor
 */
function getAvailableTools(_organizationId: string, _skills: string[]): AnthropicTool[] {
  const tools: AnthropicTool[] = [];

  // Add web search if enabled (via EXA_API_KEY)
  if (process.env.EXA_API_KEY) {
    tools.push(WEB_SEARCH_TOOL);
  }

  // Add MCP registry tools for the agent
  const registryTools = mcpRegistry.getToolsForAgent("ai_executor");
  tools.push(...convertMCPToolsToAnthropic(registryTools));

  // Add provider tools
  const providerTools = getAllProviderTools();
  tools.push(...convertMCPToolsToAnthropic(providerTools));

  return tools;
}

/**
 * Execute a tool call from the AI response
 */
async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: { organizationId: string; userId: string; sessionId: string },
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

      const data = await response.json() as { results?: Array<{ title: string; url: string; text: string; publishedDate?: string }> };
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

    // Try MCP registry first
    const registryTool = mcpRegistry.getTool(toolName);
    if (registryTool) {
      const result = await mcpRegistry.callTool(toolName, toolInput, {
        agentId: "ai_executor",
        userId: context.userId,
        organizationId: context.organizationId,
        sessionId: context.sessionId,
      });
      return { success: result.success, result: result.data, error: result.error?.message };
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
      const model = CATEGORY_MODEL_MAP[params.category] || "claude-3-5-sonnet-20241022";
      const registrySkillPrompts = (params.context?.registrySkillPrompts as string[] | undefined);
      const systemPrompt = buildSystemPrompt(params.skills, registrySkillPrompts);
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

      let accountId: string | undefined;
      let accountName: string | undefined;

      try {
        const isMultiAccountMode = !!params.selectedAccount;
        let client: Anthropic;

        if (isMultiAccountMode) {
          const provider = new AnthropicProvider({ account: params.selectedAccount! });
          client = (provider as any).client;
          accountId = params.selectedAccount!.id;
          accountName = params.selectedAccount!.name;

          logger.info("AI execution with account", {
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

        // Get available tools
        const availableTools = getAvailableTools(params.organizationId, params.skills);
        const hasTools = availableTools.length > 0;

        logger.info("AI execution with tools", {
          toolCount: availableTools.length,
          tools: availableTools.map(t => t.name),
        });

        const response = await tracer.startActiveSpan("ai_executor.api_call", async (apiSpan) => {
          const callStart = Date.now();
          try {
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
                break;
              }

              // Find tool_use blocks and execute them
              const toolUseBlocks = result.content.filter(
                (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
              );

              if (toolUseBlocks.length === 0) {
                break;
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

                const execResult = await executeToolCall(
                  toolUse.name,
                  toolUse.input as Record<string, unknown>,
                  {
                    organizationId: params.organizationId,
                    userId: params.userId,
                    sessionId: params.sessionId,
                  }
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

            // Return result with accumulated token counts
            return {
              ...result,
              usage: {
                input_tokens: totalInputTokens,
                output_tokens: totalOutputTokens,
              },
            };
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

        const cost = await tracer.startActiveSpan(
          "ai_executor.calculate_cost",
          async (costSpan) => {
            try {
              const computed = calculateCost(model, inputTokens, outputTokens);
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

        let output = "";
        for (const block of response.content) {
          if (block.type === "text") {
            output += block.text;
          }
        }

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
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return {
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
          },
        };
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
