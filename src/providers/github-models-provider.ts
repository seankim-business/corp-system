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

const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com";

const GITHUB_MODELS: ModelInfo[] = [
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
    id: "o1-mini",
    name: "OpenAI o1-mini",
    contextWindow: 128000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
  },
  {
    id: "o1-preview",
    name: "OpenAI o1-preview",
    contextWindow: 128000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
  },
  {
    id: "Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B",
    contextWindow: 128000,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
  },
  {
    id: "Mistral-large-2411",
    name: "Mistral Large",
    contextWindow: 128000,
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
  },
];

const TIER_TO_MODEL: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  standard: "gpt-4o",
  advanced: "o1-preview",
};

export class GitHubModelsProvider implements AIProvider {
  readonly name = "github-models";
  readonly displayName = "GitHub Models";
  private client: OpenAI;

  constructor(credentials: ProviderCredentials) {
    const token = credentials.accessToken || credentials.apiKey;
    if (!token) {
      throw new AIProviderError(
        "GitHub access token is required",
        "github-models",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }
    this.client = new OpenAI({
      baseURL: GITHUB_MODELS_ENDPOINT,
      apiKey: token,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || TIER_TO_MODEL.standard;

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) {
      openaiMessages.push({ role: "system", content: options.systemPrompt });
    }
    for (const msg of messages) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    try {
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        messages: openaiMessages,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content || "",
        model: response.model,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        finishReason: choice?.finish_reason || "unknown",
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  getAvailableModels(): ModelInfo[] {
    return GITHUB_MODELS;
  }

  getDefaultModel(category: Category): string {
    const tier = categoryToModelTier(category);
    return TIER_TO_MODEL[tier];
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      return true;
    } catch {
      return false;
    }
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = GITHUB_MODELS.find((m) => m.id === model);
    if (!modelInfo) {
      return 0;
    }
    return (
      (inputTokens / 1000) * modelInfo.inputCostPer1k +
      (outputTokens / 1000) * modelInfo.outputCostPer1k
    );
  }

  supportsOAuth(): boolean {
    return true;
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AIProviderError(
        "GitHub OAuth not configured",
        "github-models",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new AIProviderError(
        "Failed to refresh GitHub token",
        "github-models",
        AIProviderErrorCode.INVALID_CREDENTIALS,
        response.status,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 28800,
    };
  }

  private handleError(error: unknown): AIProviderError {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return new AIProviderError(
          "Invalid GitHub access token",
          "github-models",
          AIProviderErrorCode.INVALID_CREDENTIALS,
          401,
        );
      }
      if (error.status === 429) {
        return new AIProviderError(
          "GitHub Models rate limit exceeded",
          "github-models",
          AIProviderErrorCode.RATE_LIMITED,
          429,
        );
      }
      return new AIProviderError(
        error.message,
        "github-models",
        AIProviderErrorCode.PROVIDER_ERROR,
        error.status,
      );
    }
    if (error instanceof Error) {
      return new AIProviderError(
        error.message,
        "github-models",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }
    return new AIProviderError(
      "Unknown error",
      "github-models",
      AIProviderErrorCode.PROVIDER_ERROR,
    );
  }
}

registerProvider("github-models", GitHubModelsProvider);
