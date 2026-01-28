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

const GOOGLE_AI_MODELS: ModelInfo[] = [
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    contextWindow: 1000000,
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
  },
  {
    id: "gemini-1.5-flash-8b",
    name: "Gemini 1.5 Flash 8B",
    contextWindow: 1000000,
    inputCostPer1k: 0.0000375,
    outputCostPer1k: 0.00015,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    contextWindow: 2000000,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.005,
  },
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash (Experimental)",
    contextWindow: 1000000,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
  },
];

const TIER_TO_MODEL: Record<ModelTier, string> = {
  fast: "gemini-1.5-flash",
  standard: "gemini-1.5-pro",
  advanced: "gemini-1.5-pro",
};

const GOOGLE_AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

export class GoogleAIProvider implements AIProvider {
  readonly name = "google-ai";
  readonly displayName = "Google AI (Gemini)";
  private apiKey?: string;
  private accessToken?: string;

  constructor(credentials: ProviderCredentials) {
    if (!credentials.apiKey && !credentials.accessToken) {
      throw new AIProviderError(
        "Google AI API key or access token is required",
        "google-ai",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }
    this.apiKey = credentials.apiKey;
    this.accessToken = credentials.accessToken;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || TIER_TO_MODEL.standard;

    const contents: GeminiContent[] = [];

    if (options?.systemPrompt) {
      contents.push({
        role: "user",
        parts: [{ text: `System instruction: ${options.systemPrompt}` }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I will follow these instructions." }],
      });
    }

    for (const msg of messages) {
      if (msg.role === "system") continue;
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    const url = this.buildUrl(model);
    const headers = this.buildHeaders();

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as GeminiResponse;

      if (data.error) {
        throw this.handleApiError(data.error, response.status);
      }

      if (!data.candidates || data.candidates.length === 0) {
        throw new AIProviderError(
          "No response candidates from Google AI",
          "google-ai",
          AIProviderErrorCode.INVALID_RESPONSE,
        );
      }

      const candidate = data.candidates[0];
      const content = candidate.content.parts.map((p) => p.text).join("");

      return {
        content,
        model,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount || 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        },
        finishReason: candidate.finishReason || "unknown",
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw this.handleError(error);
    }
  }

  getAvailableModels(): ModelInfo[] {
    return GOOGLE_AI_MODELS;
  }

  getDefaultModel(category: Category): string {
    const tier = categoryToModelTier(category);
    return TIER_TO_MODEL[tier];
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const url = this.apiKey
        ? `${GOOGLE_AI_BASE_URL}/models?key=${this.apiKey}`
        : `${GOOGLE_AI_BASE_URL}/models`;

      const headers = this.buildHeaders();
      const response = await fetch(url, { headers });
      return response.ok;
    } catch {
      return false;
    }
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = GOOGLE_AI_MODELS.find((m) => m.id === model);
    if (!modelInfo) {
      const defaultCosts = { inputCostPer1k: 0.00125, outputCostPer1k: 0.005 };
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
    return true;
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AIProviderError(
        "Google OAuth client credentials not configured",
        "google-ai",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new AIProviderError(
        "Failed to refresh Google access token",
        "google-ai",
        AIProviderErrorCode.INVALID_CREDENTIALS,
        response.status,
      );
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  private buildUrl(model: string): string {
    const endpoint = `${GOOGLE_AI_BASE_URL}/models/${model}:generateContent`;
    if (this.apiKey) {
      return `${endpoint}?key=${this.apiKey}`;
    }
    return endpoint;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private handleApiError(
    error: { code: number; message: string; status: string },
    httpStatus: number,
  ): AIProviderError {
    if (httpStatus === 401 || error.status === "UNAUTHENTICATED") {
      return new AIProviderError(
        "Invalid Google AI credentials",
        "google-ai",
        AIProviderErrorCode.INVALID_CREDENTIALS,
        httpStatus,
      );
    }
    if (httpStatus === 429 || error.status === "RESOURCE_EXHAUSTED") {
      return new AIProviderError(
        "Google AI rate limit exceeded",
        "google-ai",
        AIProviderErrorCode.RATE_LIMITED,
        httpStatus,
      );
    }
    return new AIProviderError(
      error.message,
      "google-ai",
      AIProviderErrorCode.PROVIDER_ERROR,
      httpStatus,
    );
  }

  private handleError(error: unknown): AIProviderError {
    if (error instanceof Error) {
      return new AIProviderError(
        error.message,
        "google-ai",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }
    return new AIProviderError("Unknown error", "google-ai", AIProviderErrorCode.PROVIDER_ERROR);
  }
}

registerProvider("google-ai", GoogleAIProvider);
