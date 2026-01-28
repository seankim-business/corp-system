import {
  AIProvider,
  AIProviderError,
  AIProviderErrorCode,
  ChatResponse,
  Message,
  ProviderCredentials,
  ProviderName,
  createProvider,
} from "../providers";
import { logger } from "../utils/logger";
import { Category } from "./types";
import { trackUsage } from "../services/cost-tracker";
import { recordAiRequest } from "../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { getOrganizationApiKey } from "../api/organization-settings";
import { getGoogleAiCredentials } from "../api/google-ai-oauth";

export interface MultiProviderExecutionParams {
  category: Category;
  skills: string[];
  prompt: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  context?: Record<string, unknown>;
  preferredProvider?: ProviderName;
}

export interface MultiProviderExecutionResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    provider: ProviderName;
    inputTokens: number;
    outputTokens: number;
    duration: number;
    cost: number;
    error?: string;
  };
}

const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  "mcp-integration": `You are an AI assistant specialized in integrating with external tools and services via MCP (Model Context Protocol).
You can help users interact with Notion, Linear, GitHub, and other MCP-enabled services.
When a user asks to interact with these tools, provide clear instructions and execute the requested operations.`,

  playwright: `You are an expert in browser automation using Playwright.
You can help users with writing Playwright test scripts, automating browser interactions, web scraping, screenshot capture, and handling dynamic content.
Provide executable Playwright code when appropriate.`,

  "git-master": `You are a Git expert who helps with version control operations.
You can assist with commit strategies, branch management, rebasing, resolving merge conflicts, and Git workflow best practices.
Provide clear git commands and explanations.`,

  "frontend-ui-ux": `You are a senior frontend developer with strong design sensibilities.
You specialize in React, Vue, Angular component development, CSS/Tailwind styling, accessibility best practices, and component architecture.
Provide production-ready code with modern best practices.`,
};

const tracer = trace.getTracer("multi-provider-executor");

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

const PROVIDER_PRIORITY: ProviderName[] = ["anthropic", "openai", "google-ai", "openrouter"];

async function getAvailableProviders(organizationId: string): Promise<
  Array<{
    name: ProviderName;
    credentials: ProviderCredentials;
  }>
> {
  const available: Array<{ name: ProviderName; credentials: ProviderCredentials }> = [];

  const anthropicKey = await getOrganizationApiKey(organizationId, "anthropicApiKey");
  if (anthropicKey) {
    available.push({ name: "anthropic", credentials: { apiKey: anthropicKey } });
  }

  const openaiKey = await getOrganizationApiKey(organizationId, "openaiApiKey");
  if (openaiKey) {
    available.push({ name: "openai", credentials: { apiKey: openaiKey } });
  }

  const googleCreds = await getGoogleAiCredentials(organizationId);
  if (googleCreds) {
    available.push({ name: "google-ai", credentials: googleCreds });
  }

  const openrouterKey = await getOrganizationApiKey(organizationId, "openrouterApiKey");
  if (openrouterKey) {
    available.push({ name: "openrouter", credentials: { apiKey: openrouterKey } });
  }

  return available;
}

function selectProvider(
  availableProviders: Array<{ name: ProviderName; credentials: ProviderCredentials }>,
  preferred?: ProviderName,
): { name: ProviderName; credentials: ProviderCredentials } | null {
  if (preferred) {
    const found = availableProviders.find((p) => p.name === preferred);
    if (found) return found;
  }

  for (const providerName of PROVIDER_PRIORITY) {
    const found = availableProviders.find((p) => p.name === providerName);
    if (found) return found;
  }

  return availableProviders[0] || null;
}

export async function executeWithMultiProvider(
  params: MultiProviderExecutionParams,
): Promise<MultiProviderExecutionResult> {
  return tracer.startActiveSpan(
    "multi_provider_executor.execute",
    async (span: Span): Promise<MultiProviderExecutionResult> => {
      const startTime = Date.now();
      const systemPrompt = buildSystemPrompt(params.skills);

      span.setAttribute("organization.id", params.organizationId);
      span.setAttribute("user.id", params.userId);
      span.setAttribute("ai.category", params.category);

      try {
        const availableProviders = await getAvailableProviders(params.organizationId);

        if (availableProviders.length === 0) {
          throw new AIProviderError(
            "No AI providers configured. Please add API keys in Settings.",
            "none",
            AIProviderErrorCode.INVALID_CREDENTIALS,
          );
        }

        const selected = selectProvider(availableProviders, params.preferredProvider);
        if (!selected) {
          throw new AIProviderError(
            "Could not select a provider",
            "none",
            AIProviderErrorCode.PROVIDER_ERROR,
          );
        }

        span.setAttribute("ai.provider", selected.name);
        logger.info("Selected AI provider", {
          provider: selected.name,
          category: params.category,
          sessionId: params.sessionId,
        });

        let provider: AIProvider;
        try {
          provider = createProvider(selected.name, selected.credentials);
        } catch (error) {
          throw new AIProviderError(
            `Failed to initialize ${selected.name} provider`,
            selected.name,
            AIProviderErrorCode.INVALID_CREDENTIALS,
            undefined,
            error instanceof Error ? error : undefined,
          );
        }

        const model = provider.getDefaultModel(params.category);
        span.setAttribute("ai.model", model);

        const messages: Message[] = [{ role: "user", content: params.prompt }];

        let response: ChatResponse;
        try {
          response = await provider.chat(messages, {
            model,
            maxTokens: 4096,
            systemPrompt,
          });
        } catch (error) {
          if (error instanceof AIProviderError) throw error;
          throw new AIProviderError(
            `Chat request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            selected.name,
            AIProviderErrorCode.PROVIDER_ERROR,
          );
        }

        const duration = Date.now() - startTime;
        const cost = provider.calculateCost(
          response.model,
          response.usage.inputTokens,
          response.usage.outputTokens,
        );

        span.setAttribute("ai.tokens.input", response.usage.inputTokens);
        span.setAttribute("ai.tokens.output", response.usage.outputTokens);
        span.setAttribute("ai.cost_usd", cost);
        span.setAttribute("ai.duration_ms", duration);

        await trackUsage({
          organizationId: params.organizationId,
          userId: params.userId,
          sessionId: params.sessionId,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost,
          category: params.category,
        }).catch((err: Error) => logger.warn("Failed to track usage", { error: err.message }));

        recordAiRequest({
          model: response.model,
          category: params.category,
          success: true,
          duration,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        });

        logger.info("Multi-provider AI execution completed", {
          provider: selected.name,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost: cost.toFixed(6),
          duration,
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          output: response.content,
          status: "success",
          metadata: {
            model: response.model,
            provider: selected.name,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            duration,
            cost,
          },
        };
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const providerName =
          error instanceof AIProviderError
            ? error.provider
            : (params.preferredProvider ?? "unknown");

        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        recordAiRequest({
          model: "unknown",
          category: params.category,
          success: false,
          duration,
          inputTokens: 0,
          outputTokens: 0,
        });

        logger.error("Multi-provider AI execution failed", {
          provider: providerName,
          error: errorMessage,
          duration,
        });

        return {
          output: `AI execution failed: ${errorMessage}`,
          status: "failed",
          metadata: {
            model: "unknown",
            provider: providerName as ProviderName,
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
}

export async function getConfiguredProviders(
  organizationId: string,
): Promise<Array<{ name: ProviderName; displayName: string }>> {
  const available = await getAvailableProviders(organizationId);
  return available.map((p) => {
    const displayNames: Record<ProviderName, string> = {
      anthropic: "Anthropic (Claude)",
      openai: "OpenAI (GPT)",
      "google-ai": "Google AI (Gemini)",
      openrouter: "OpenRouter",
    };
    return {
      name: p.name,
      displayName: displayNames[p.name],
    };
  });
}
