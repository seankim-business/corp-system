import Anthropic from "@anthropic-ai/sdk";
import {
  AIProvider,
  AIProviderError,
  AIProviderErrorCode,
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  ModelTier,
  ProviderCredentials,
  categoryToModelTier,
  registerProvider,
} from "./ai-provider";
import { Category } from "../orchestrator/types";

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    contextWindow: 200000,
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.005,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    contextWindow: 200000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
  },
];

const TIER_TO_MODEL: Record<ModelTier, string> = {
  fast: "claude-3-5-haiku-20241022",
  standard: "claude-3-5-sonnet-20241022",
  advanced: "claude-3-opus-20240229",
};

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly displayName = "Anthropic (Claude)";
  private client: Anthropic;

  constructor(credentials: ProviderCredentials) {
    if (!credentials.apiKey) {
      throw new AIProviderError(
        "Anthropic API key is required",
        "anthropic",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }
    this.client = new Anthropic({ apiKey: credentials.apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || TIER_TO_MODEL.standard;
    const systemPrompt = options?.systemPrompt || "You are a helpful AI assistant.";

    const userMessages = messages.filter((m) => m.role !== "system");
    const anthropicMessages = userMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      let content = "";
      for (const block of response.content) {
        if (block.type === "text") {
          content += block.text;
        }
      }

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        finishReason: response.stop_reason || "unknown",
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  getAvailableModels(): ModelInfo[] {
    return ANTHROPIC_MODELS;
  }

  getDefaultModel(category: Category): string {
    const tier = categoryToModelTier(category);
    return TIER_TO_MODEL[tier];
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      return true;
    } catch {
      return false;
    }
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = ANTHROPIC_MODELS.find((m) => m.id === model);
    if (!modelInfo) {
      const defaultCosts = { inputCostPer1k: 0.003, outputCostPer1k: 0.015 };
      return (
        (inputTokens / 1000) * defaultCosts.inputCostPer1k +
        (outputTokens / 1000) * defaultCosts.outputCostPer1k
      );
    }
    return (
      (inputTokens / 1000) * modelInfo.inputCostPer1k +
      (outputTokens / 1000) * modelInfo.outputCostPer1k
    );
  }

  supportsOAuth(): boolean {
    return false;
  }

  private handleError(error: unknown): AIProviderError {
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        return new AIProviderError(
          "Invalid Anthropic API key",
          "anthropic",
          AIProviderErrorCode.INVALID_CREDENTIALS,
          401,
        );
      }
      if (error.status === 429) {
        return new AIProviderError(
          "Anthropic rate limit exceeded",
          "anthropic",
          AIProviderErrorCode.RATE_LIMITED,
          429,
        );
      }
      return new AIProviderError(
        error.message,
        "anthropic",
        AIProviderErrorCode.PROVIDER_ERROR,
        error.status,
      );
    }
    if (error instanceof Error) {
      return new AIProviderError(
        error.message,
        "anthropic",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }
    return new AIProviderError("Unknown error", "anthropic", AIProviderErrorCode.PROVIDER_ERROR);
  }
}

registerProvider("anthropic", AnthropicProvider);
