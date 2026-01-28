import { Category } from "../orchestrator/types";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: string;
}

export interface ProviderCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: AIProviderErrorCode,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export enum AIProviderErrorCode {
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  RATE_LIMITED = "RATE_LIMITED",
  CONTEXT_LENGTH_EXCEEDED = "CONTEXT_LENGTH_EXCEEDED",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  NETWORK_ERROR = "NETWORK_ERROR",
  PROVIDER_ERROR = "PROVIDER_ERROR",
  INVALID_RESPONSE = "INVALID_RESPONSE",
}

export interface AIProvider {
  readonly name: string;
  readonly displayName: string;

  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  getAvailableModels(): ModelInfo[];
  getDefaultModel(category: Category): string;
  validateCredentials(): Promise<boolean>;
  calculateCost(model: string, inputTokens: number, outputTokens: number): number;
  supportsOAuth(): boolean;
  refreshAccessToken?(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
}

export type ProviderName = "anthropic" | "openai" | "google-ai" | "openrouter";

const providerRegistry = new Map<
  ProviderName,
  new (credentials: ProviderCredentials) => AIProvider
>();

export function registerProvider(
  name: ProviderName,
  providerClass: new (credentials: ProviderCredentials) => AIProvider,
): void {
  providerRegistry.set(name, providerClass);
}

export function createProvider(name: ProviderName, credentials: ProviderCredentials): AIProvider {
  const ProviderClass = providerRegistry.get(name);
  if (!ProviderClass) {
    throw new Error(
      `Unknown provider: ${name}. Available providers: ${Array.from(providerRegistry.keys()).join(", ")}`,
    );
  }
  return new ProviderClass(credentials);
}

export function getRegisteredProviders(): ProviderName[] {
  return Array.from(providerRegistry.keys());
}

export type ModelTier = "fast" | "standard" | "advanced";

export function categoryToModelTier(category: Category): ModelTier {
  switch (category) {
    case "quick":
    case "writing":
    case "unspecified-low":
      return "fast";
    case "artistry":
    case "visual-engineering":
    case "unspecified-high":
      return "standard";
    case "ultrabrain":
      return "advanced";
    default:
      return "standard";
  }
}
