import OpenAI from "openai";
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

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    contextWindow: 128000,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    contextWindow: 128000,
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.015,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    contextWindow: 128000,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    contextWindow: 128000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
  },
  {
    id: "o1",
    name: "o1",
    contextWindow: 200000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
  },
];

const TIER_TO_MODEL: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  standard: "gpt-4o",
  advanced: "o1",
};

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI (GPT)";
  private client: OpenAI;

  constructor(credentials: ProviderCredentials) {
    if (!credentials.apiKey) {
      throw new AIProviderError(
        "OpenAI API key is required",
        "openai",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }
    this.client = new OpenAI({ apiKey: credentials.apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || TIER_TO_MODEL.standard;

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      openaiMessages.push({ role: "system", content: options.systemPrompt });
    }

    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    try {
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        messages: openaiMessages,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message.content) {
        throw new AIProviderError(
          "No response content from OpenAI",
          "openai",
          AIProviderErrorCode.INVALID_RESPONSE,
        );
      }

      return {
        content: choice.message.content,
        model: response.model,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        finishReason: choice.finish_reason || "unknown",
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw this.handleError(error);
    }
  }

  getAvailableModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  getDefaultModel(category: Category): string {
    const tier = categoryToModelTier(category);
    return TIER_TO_MODEL[tier];
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = OPENAI_MODELS.find((m) => m.id === model);
    if (!modelInfo) {
      const defaultCosts = { inputCostPer1k: 0.005, outputCostPer1k: 0.015 };
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
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return new AIProviderError(
          "Invalid OpenAI API key",
          "openai",
          AIProviderErrorCode.INVALID_CREDENTIALS,
          401,
        );
      }
      if (error.status === 429) {
        return new AIProviderError(
          "OpenAI rate limit exceeded",
          "openai",
          AIProviderErrorCode.RATE_LIMITED,
          429,
        );
      }
      return new AIProviderError(
        error.message,
        "openai",
        AIProviderErrorCode.PROVIDER_ERROR,
        error.status,
      );
    }
    if (error instanceof Error) {
      return new AIProviderError(
        error.message,
        "openai",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }
    return new AIProviderError("Unknown error", "openai", AIProviderErrorCode.PROVIDER_ERROR);
  }
}

registerProvider("openai", OpenAIProvider);
