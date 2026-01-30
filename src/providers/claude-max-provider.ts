/**
 * Claude Max Provider
 *
 * AI Provider implementation that uses Claude Max subscription (claude.ai)
 * instead of the paid Anthropic API. Implements the same interface as AnthropicProvider.
 */

import {
  AIProvider,
  AIProviderError,
  AIProviderErrorCode,
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  ModelTier,
  categoryToModelTier,
} from "./ai-provider";
import { Category } from "../orchestrator/types";
import { ClaudeAccount } from "../services/account-pool/account-pool.service";
import { EncryptionService } from "../services/account-pool/encryption.service";
import { ClaudeMaxClient, ClaudeMaxError } from "./claude-max-client";
import { logger } from "../utils/logger";

// ============================================================================
// Constants
// ============================================================================

// Available models on Claude Max (note: these map to claude.ai's model selection)
const CLAUDE_MAX_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    contextWindow: 200000,
    inputCostPer1k: 0, // Free with Claude Max subscription
    outputCostPer1k: 0,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
  },
];

// Map model tiers to Claude Max model IDs
const TIER_TO_MODEL: Record<ModelTier, string> = {
  fast: "claude-sonnet-4-20250514",
  standard: "claude-sonnet-4-20250514",
  advanced: "claude-sonnet-4-20250514", // Opus not always available on claude.ai
};

// Conversation cache key by org+session
interface ConversationCacheEntry {
  conversationId: string;
  createdAt: Date;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class ClaudeMaxProvider implements AIProvider {
  readonly name = "claude-max";
  readonly displayName = "Claude Max (claude.ai)";

  private client: ClaudeMaxClient;
  private account?: ClaudeAccount;

  // Cache conversations by a composite key to reuse them
  private static conversationCache: Map<string, ConversationCacheEntry> = new Map();
  private static readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(credentialsOrAccount: { sessionKey: string } | { account: ClaudeAccount }) {
    if ("account" in credentialsOrAccount) {
      // Account-based initialization
      this.account = credentialsOrAccount.account;
      const sessionKey = this.getDecryptedSessionKey();
      const organizationId = this.getOrganizationIdFromAccount();

      this.client = new ClaudeMaxClient({ sessionKey, organizationId });

      logger.info("ClaudeMaxProvider initialized with account", {
        accountId: this.account.id,
        accountName: this.account.name,
        hasOrgId: !!organizationId,
      });
    } else {
      // Direct session key initialization
      this.client = new ClaudeMaxClient({ sessionKey: credentialsOrAccount.sessionKey });
      logger.info("ClaudeMaxProvider initialized with direct session key");
    }
  }

  /**
   * Get account ID if using account mode
   */
  getAccountId(): string | undefined {
    return this.account?.id;
  }

  /**
   * Decrypt session key from account metadata
   */
  private getDecryptedSessionKey(): string {
    if (!this.account) {
      throw new AIProviderError(
        "No account configured",
        "claude-max",
        AIProviderErrorCode.INVALID_CREDENTIALS,
      );
    }

    const metadata = this.account.metadata as Record<string, unknown>;

    // Check for session token (encrypted)
    const encryptedSessionKey = metadata?.encryptedSessionKey as string | undefined;
    if (encryptedSessionKey) {
      try {
        return EncryptionService.decrypt(encryptedSessionKey);
      } catch (error) {
        throw new AIProviderError(
          `Failed to decrypt session key for account ${this.account.name}: ${error instanceof Error ? error.message : String(error)}`,
          "claude-max",
          AIProviderErrorCode.INVALID_CREDENTIALS,
        );
      }
    }

    // Check for plain session key (for testing/dev)
    const plainSessionKey = metadata?.sessionKey as string | undefined;
    if (plainSessionKey) {
      logger.warn("Using plain session key - should be encrypted in production", {
        accountId: this.account.id,
      });
      return plainSessionKey;
    }

    throw new AIProviderError(
      `Account ${this.account.name} (${this.account.id}) has no session key configured`,
      "claude-max",
      AIProviderErrorCode.INVALID_CREDENTIALS,
    );
  }

  /**
   * Get organization ID from account metadata if available
   */
  private getOrganizationIdFromAccount(): string | undefined {
    if (!this.account) return undefined;
    const metadata = this.account.metadata as Record<string, unknown>;
    return metadata?.organizationId as string | undefined;
  }

  /**
   * Get or create a conversation for the given cache key
   */
  private async getOrCreateConversation(cacheKey: string, model?: string): Promise<string> {
    // Check cache
    const cached = ClaudeMaxProvider.conversationCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.createdAt.getTime();
      if (age < ClaudeMaxProvider.CACHE_TTL_MS) {
        logger.debug("Using cached conversation", {
          conversationId: cached.conversationId,
          ageMs: age,
        });
        return cached.conversationId;
      }
      // Cache expired, remove it
      ClaudeMaxProvider.conversationCache.delete(cacheKey);
    }

    // Create new conversation
    const conversation = await this.client.createConversation(undefined, model);

    // Cache it
    ClaudeMaxProvider.conversationCache.set(cacheKey, {
      conversationId: conversation.uuid,
      createdAt: new Date(),
    });

    logger.debug("Created new conversation", {
      conversationId: conversation.uuid,
      cacheKey,
    });

    return conversation.uuid;
  }

  /**
   * Main chat method - implements AIProvider interface
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || TIER_TO_MODEL.standard;
    const systemPrompt = options?.systemPrompt || "You are a helpful AI assistant.";

    // Build conversation cache key using account ID (or "default") and model
    const cacheKey = `${this.account?.id || "default"}:${model}`;

    try {
      // Get or create conversation
      const conversationId = await this.getOrCreateConversation(cacheKey, model);

      // Build the prompt from messages
      const prompt = this.buildPromptFromMessages(messages, systemPrompt);

      // Send message and get response
      const result = await this.client.sendMessage(conversationId, prompt, { model });

      return {
        content: result.content,
        model,
        usage: {
          inputTokens: result.usage?.inputTokens || 0,
          outputTokens: result.usage?.outputTokens || 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        metadata: {
          accountId: this.account?.id,
          accountName: this.account?.name,
        },
        finishReason: "end_turn",
      };
    } catch (error) {
      // Invalidate conversation cache on error
      ClaudeMaxProvider.conversationCache.delete(cacheKey);

      throw this.handleError(error);
    }
  }

  /**
   * Build a single prompt string from messages array
   */
  private buildPromptFromMessages(messages: Message[], systemPrompt: string): string {
    const parts: string[] = [];

    // Add system prompt
    if (systemPrompt) {
      parts.push(`<system>${systemPrompt}</system>`);
    }

    // Add conversation messages
    for (const msg of messages) {
      if (msg.role === "system") {
        // System messages are handled separately
        continue;
      }

      const roleTag = msg.role === "user" ? "human" : "assistant";
      parts.push(`<${roleTag}>${msg.content}</${roleTag}>`);
    }

    return parts.join("\n\n");
  }

  /**
   * Get available models
   */
  getAvailableModels(): ModelInfo[] {
    return CLAUDE_MAX_MODELS;
  }

  /**
   * Get default model for a category
   */
  getDefaultModel(category: Category): string {
    const tier = categoryToModelTier(category);
    return TIER_TO_MODEL[tier];
  }

  /**
   * Validate credentials by making a test request
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Try to fetch organizations as a lightweight validation
      const orgs = await this.client.getOrganizations();
      return orgs.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Calculate cost - always returns 0 for Claude Max (subscription-based)
   */
  calculateCost(_model: string, _inputTokens: number, _outputTokens: number): number {
    // Claude Max is a subscription service, no per-token cost
    return 0;
  }

  /**
   * Check if OAuth is supported
   */
  supportsOAuth(): boolean {
    return false; // Uses session cookie authentication
  }

  /**
   * Handle errors and convert to AIProviderError
   */
  private handleError(error: unknown): AIProviderError {
    const accountContext = this.account
      ? ` (Account: ${this.account.name} [${this.account.id}])`
      : "";

    if (error instanceof ClaudeMaxError) {
      switch (error.code) {
        case "INVALID_SESSION":
          return new AIProviderError(
            `Invalid Claude Max session${accountContext}`,
            "claude-max",
            AIProviderErrorCode.INVALID_CREDENTIALS,
            error.statusCode,
          );

        case "RATE_LIMITED":
          return new AIProviderError(
            `Claude Max rate limit exceeded${accountContext}`,
            "claude-max",
            AIProviderErrorCode.RATE_LIMITED,
            error.statusCode,
          );

        case "FORBIDDEN":
          return new AIProviderError(
            `Access denied to Claude Max${accountContext}`,
            "claude-max",
            AIProviderErrorCode.INVALID_CREDENTIALS,
            error.statusCode,
          );

        case "NETWORK_ERROR":
        case "TIMEOUT":
          return new AIProviderError(
            `Network error with Claude Max: ${error.message}${accountContext}`,
            "claude-max",
            AIProviderErrorCode.NETWORK_ERROR,
            undefined,
          );

        default:
          return new AIProviderError(
            `${error.message}${accountContext}`,
            "claude-max",
            AIProviderErrorCode.PROVIDER_ERROR,
            error.statusCode,
          );
      }
    }

    if (error instanceof Error) {
      return new AIProviderError(
        `${error.message}${accountContext}`,
        "claude-max",
        AIProviderErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    return new AIProviderError(
      `Unknown error${accountContext}`,
      "claude-max",
      AIProviderErrorCode.PROVIDER_ERROR,
    );
  }

  /**
   * Clear all cached conversations (useful for testing or session refresh)
   */
  static clearConversationCache(): void {
    ClaudeMaxProvider.conversationCache.clear();
  }

  /**
   * Clear expired conversations from cache
   */
  static cleanupExpiredConversations(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of ClaudeMaxProvider.conversationCache) {
      const age = now - entry.createdAt.getTime();
      if (age >= ClaudeMaxProvider.CACHE_TTL_MS) {
        ClaudeMaxProvider.conversationCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an account is a Claude Max account (has session key)
 */
export function isClaudeMaxAccount(account: ClaudeAccount): boolean {
  const metadata = account.metadata as Record<string, unknown>;
  return !!(metadata?.encryptedSessionKey || metadata?.sessionKey);
}

/**
 * Get the provider type for an account
 */
export function getAccountProviderType(account: ClaudeAccount): "claude-max" | "anthropic" {
  return isClaudeMaxAccount(account) ? "claude-max" : "anthropic";
}
