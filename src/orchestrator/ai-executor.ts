import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";
import { Category } from "./types";
import { trackUsage } from "../services/cost-tracker";
import { recordAiRequest } from "../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { getOrganizationApiKey } from "../api/organization-settings";
import { anthropicMetricsTracker } from "../services/anthropic-metrics";
import { getSlackAlerts } from "../services/slack-anthropic-alerts";

export interface AIExecutionParams {
  category: Category;
  skills: string[];
  prompt: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  context?: Record<string, unknown>;
}

export interface AIExecutionResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    duration: number;
    cost: number;
    error?: string;
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

function buildSystemPrompt(skills: string[]): string {
  const basePrompt = `You are a helpful AI assistant. Respond concisely and accurately.`;

  if (skills.length === 0) {
    return basePrompt;
  }

  const skillPrompts = skills
    .filter((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .map((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .join("\n\n---\n\n");

  if (!skillPrompts) {
    return basePrompt;
  }

  return `${skillPrompts}\n\n---\n\nRemember to be helpful, accurate, and concise.`;
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
      const systemPrompt = buildSystemPrompt(params.skills);
      const environment = process.env.NODE_ENV || "development";

      span.setAttribute("ai.model", model);
      span.setAttribute("ai.category", params.category);
      span.setAttribute("organization.id", params.organizationId);
      span.setAttribute("user.id", params.userId);
      span.setAttribute("environment", environment);

      try {
        const client = await getAnthropicClient(params.organizationId);

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

        const response = await tracer.startActiveSpan("ai_executor.api_call", async (apiSpan) => {
          const callStart = Date.now();
          try {
            apiSpan.setAttribute("ai.provider", "anthropic");
            apiSpan.setAttribute("ai.endpoint", "/v1/messages");
            apiSpan.setAttribute("ai.model", model);

            const result = await client.messages.create({
              model,
              max_tokens: 4096,
              system: systemPrompt,
              messages: [
                {
                  role: "user",
                  content: params.prompt,
                },
              ],
            });
            const durationMs = Date.now() - callStart;

            apiSpan.setAttribute("ai.tokens.input", result.usage.input_tokens);
            apiSpan.setAttribute("ai.tokens.output", result.usage.output_tokens);
            apiSpan.setAttribute("ai.duration_ms", durationMs);
            apiSpan.setAttribute("ai.finish_reason", result.stop_reason ?? "unknown");

            return result;
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

        logger.info("AI execution completed", {
          model,
          inputTokens,
          outputTokens,
          cost: cost.toFixed(6),
          duration,
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
          },
        };
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        recordAiRequest({
          model,
          category: params.category,
          success: false,
          duration,
          inputTokens: 0,
          outputTokens: 0,
        });

        // Track Anthropic-specific metrics for failures
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
        });

        return {
          output: `AI execution failed: ${errorMessage}`,
          status: "failed",
          metadata: {
            model,
            inputTokens: 0,
            outputTokens: 0,
            duration,
            cost: 0,
            error: errorMessage,
          },
        };
      } finally {
        span.end();
      }
    },
  );

  return result;
}
