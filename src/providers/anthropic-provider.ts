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
import { ClaudeAccount } from "../services/account-pool/account-pool.service";
import { EncryptionService } from "../services/account-pool/encryption.service";
import { logger } from "../utils/logger";

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
  private account?: ClaudeAccount;

  constructor(credentialsOrAccount: ProviderCredentials | { account: ClaudeAccount }) {
    // Support both legacy credentials and new account-based initialization
    if ("account" in credentialsOrAccount) {
      // New multi-account mode
      this.account = credentialsOrAccount.account;
      const apiKey = this.getDecryptedApiKey();
      this.client = new Anthropic({ apiKey });
      logger.info("AnthropicProvider initialized with account", {
        accountId: this.account.id,
        accountName: this.account.name,
      });
    } else {
      // Legacy single-account mode (backward compatibility)
      const credentials = credentialsOrAccount;
      if (!credentials.apiKey) {
        throw new AIProviderError(
          "Anthropic API key is required",
          "anthropic",
          AIProviderErrorCode.INVALID_CREDENTIALS,
        );
      }
      this.client = new Anthropic({ apiKey: credentials.apiKey });
      logger.info("AnthropicProvider initialized with legacy credentials");
    }
  }

  /**
   * Get account ID if using multi-account mode
   */
  getAccountId(): string | undefined {
    return this.account?.id;
  }

  /**
   * Decrypt API key from account metadata
   * @private
   */
  private getDecryptedApiKey(): string {
    if (!this.account) {
      throw new AIProviderError(
        "No account configured",
        "anthropic",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }

    const metadata = this.account.metadata as any;

    // For environment-sourced accounts, use the API key directly from env
    if (metadata?.source === "environment") {
      const envApiKey = process.env.ANTHROPIC_API_KEY;
      if (!envApiKey) {
        throw new AIProviderError(
          `Environment account ${this.account.name} requires ANTHROPIC_API_KEY env var`,
          "anthropic",
          AIProviderErrorCode.INVALID_CREDENTIALS,
        );
      }
      return envApiKey;
    }

    // For database-stored accounts, decrypt the encrypted API key
    const encryptedApiKey = metadata?.encryptedApiKey;
    if (!encryptedApiKey) {
      throw new AIProviderError(
        `Account ${this.account.name} (${this.account.id}) has no encrypted API key`,
        "anthropic",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }

    try {
      return EncryptionService.decrypt(encryptedApiKey);
    } catch (error) {
      throw new AIProviderError(
        `Failed to decrypt API key for account ${this.account.name}: ${error instanceof Error ? error.message : String(error)}`,
        "anthropic",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }
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

      const rateLimitHeaders = this.parseRateLimitHeaders(response);

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationTokens: (response.usage as any).cache_creation_input_tokens || 0,
          cacheReadTokens: (response.usage as any).cache_read_input_tokens || 0,
        },
        metadata: {
          accountId: this.account?.id,
          accountName: this.account?.name,
          rateLimits: rateLimitHeaders,
        },
        finishReason: response.stop_reason || "unknown",
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Parse rate limit headers from Anthropic API response
   */
  private parseRateLimitHeaders(response: any): {
    remainingRpm?: number;
    remainingItpm?: number;
    remainingOtpm?: number;
    retryAfter?: number;
  } {
    const headers = response.response?.headers || {};

    return {
      remainingRpm: this.parseHeaderInt(headers["anthropic-ratelimit-requests-remaining"]),
      remainingItpm: this.parseHeaderInt(headers["anthropic-ratelimit-input-tokens-remaining"]),
      remainingOtpm: this.parseHeaderInt(headers["anthropic-ratelimit-output-tokens-remaining"]),
      retryAfter: this.parseHeaderInt(headers["retry-after"]),
    };
  }

  /**
   * Parse header value to integer
   */
  private parseHeaderInt(value: string | string[] | undefined): number | undefined {
    if (!value) return undefined;
    const str = Array.isArray(value) ? value[0] : value;
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? undefined : parsed;
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
    const accountContext = this.account
      ? ` (Account: ${this.account.name} [${this.account.id}])`
      : "";

    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        return new AIProviderError(
          `Invalid Anthropic API key${accountContext}`,
          "anthropic",
          AIProviderErrorCode.INVALID_CREDENTIALS,
          401,
        );
      }
      if (error.status === 429) {
        return new AIProviderError(
          `Anthropic rate limit exceeded${accountContext}`,
          "anthropic",
          AIProviderErrorCode.RATE_LIMITED,
          429,
        );
      }
      return new AIProviderError(
        `${error.message}${accountContext}`,
        "anthropic",
        AIProviderErrorCode.PROVIDER_ERROR,
        error.status,
      );
    }
    if (error instanceof Error) {
      return new AIProviderError(
        `${error.message}${accountContext}`,
        "anthropic",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }
    return new AIProviderError(
      `Unknown error${accountContext}`,
      "anthropic",
      AIProviderErrorCode.PROVIDER_ERROR,
    );
  }
}

registerProvider("anthropic", AnthropicProvider);
