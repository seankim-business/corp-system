import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

export type AccountType = "anthropic-api" | "claude-max";

export interface ClaudeAccount {
  id: string;
  name: string;
  provider: string;
  tier: "free" | "pro" | "team" | "enterprise";
  status: "active" | "rate_limited" | "disabled" | "exhausted";
  metadata: Record<string, unknown>;
  rateLimits?: {
    remainingRpm?: number;
    remainingItpm?: number;
    remainingOtpm?: number;
    resetAt?: string;
  };
  dailyUsage?: {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
  /** Account type: claude-max (session-based) or anthropic-api (API key) */
  accountType?: AccountType;
}

export interface AccountSelectionCriteria {
  organizationId: string;
  estimatedTokens?: number;
  category?: string;
  preferredAccountId?: string;
  allowedAccountIds?: string[];
}

const RATE_LIMIT_COOLDOWN_KEY = "account:cooldown:";
const COOLDOWN_SECONDS = 60; // 1 minute cooldown for rate-limited accounts

export class AccountPoolService {
  /**
   * Select the best available account for a request.
   * Strategy: round-robin with rate limit awareness.
   */
  async selectAccount(criteria: AccountSelectionCriteria): Promise<ClaudeAccount | null> {
    try {
      // Check if there's a preferred account
      if (criteria.preferredAccountId) {
        const preferred = await this.getAccount(criteria.preferredAccountId);
        if (preferred && preferred.status === "active") {
          const isCoolingDown = await this.isAccountCoolingDown(preferred.id);
          if (!isCoolingDown) {
            return preferred;
          }
        }
      }

      // Get all active accounts
      const accounts = await this.getActiveAccounts();

      if (accounts.length === 0) {
        logger.warn("No active accounts available in pool");
        return null;
      }

      // Filter out cooling-down accounts and apply allowedAccountIds restriction
      const available: ClaudeAccount[] = [];
      for (const account of accounts) {
        // Skip if not in allowed list (when provided)
        if (criteria.allowedAccountIds && !criteria.allowedAccountIds.includes(account.id)) {
          continue;
        }

        const isCoolingDown = await this.isAccountCoolingDown(account.id);
        if (!isCoolingDown) {
          available.push(account);
        }
      }

      if (available.length === 0) {
        logger.warn("All accounts are rate-limited, using first account as fallback");
        return accounts[0];
      }

      // Round-robin selection using Redis counter
      let selectedIndex = 0;
      try {
        const counterKey = `account:round_robin:${criteria.organizationId}`;
        const counter = await redis.incr(counterKey);
        await redis.expire(counterKey, 3600);
        selectedIndex = (counter - 1) % available.length;
      } catch (redisError) {
        // If Redis fails, fall back to random selection
        logger.warn("Redis counter failed, using random selection", {
          error: redisError instanceof Error ? redisError.message : String(redisError),
        });
        selectedIndex = Math.floor(Math.random() * available.length);
      }

      const selected = available[selectedIndex];

      logger.debug("Account selected", {
        accountId: selected.id,
        accountName: selected.name,
        tier: selected.tier,
        index: selectedIndex,
        totalAvailable: available.length,
      });

      return selected;
    } catch (error) {
      logger.error("Failed to select account", {
        error: error instanceof Error ? error.message : String(error),
        organizationId: criteria.organizationId,
      });

      // Last resort: try to return fallback accounts
      try {
        const fallbackAccounts = this.getFallbackAccounts();
        if (fallbackAccounts.length > 0) {
          logger.info("Using fallback environment account after selection failure");
          return fallbackAccounts[0];
        }
      } catch (fallbackError) {
        logger.error("Failed to get fallback accounts", {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }

      return null;
    }
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(accountId: string): Promise<ClaudeAccount | null> {
    try {
      const account = await (prisma as any).claudeAccount?.findUnique({
        where: { id: accountId },
      });

      if (!account) return null;

      return this.mapToClaudeAccount(account);
    } catch {
      // Table may not exist yet
      return null;
    }
  }

  /**
   * Get all active accounts
   */
  async getActiveAccounts(): Promise<ClaudeAccount[]> {
    try {
      const accounts = await (prisma as any).claudeAccount?.findMany({
        where: { status: "active" },
        orderBy: { priority: "asc" },
      });

      if (!accounts) return [];

      return accounts.map((a: any) => this.mapToClaudeAccount(a));
    } catch {
      // Table may not exist yet - fall back to env-based account
      return this.getFallbackAccounts();
    }
  }

  /**
   * Mark an account as rate-limited
   */
  async markRateLimited(accountId: string, retryAfterSeconds?: number): Promise<void> {
    const cooldownSeconds = retryAfterSeconds || COOLDOWN_SECONDS;
    const key = `${RATE_LIMIT_COOLDOWN_KEY}${accountId}`;

    await (redis as any).set(key, "1", "EX", cooldownSeconds);

    logger.info("Account marked as rate-limited", {
      accountId,
      cooldownSeconds,
    });
  }

  /**
   * Check if an account is cooling down from rate limiting
   */
  async isAccountCoolingDown(accountId: string): Promise<boolean> {
    const key = `${RATE_LIMIT_COOLDOWN_KEY}${accountId}`;
    const exists = await redis.exists(key);
    return Number(exists) === 1;
  }

  /**
   * Update account usage metrics after a request
   */
  async recordUsage(
    accountId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const key = `account:usage:${accountId}:${today}`;

    await Promise.all([
      redis.hincrby(key, "inputTokens", inputTokens),
      redis.hincrby(key, "outputTokens", outputTokens),
      redis.hincrby(key, "requestCount", 1),
      redis.expire(key, 86400 * 2),
    ]);
  }

  /**
   * Record a request against an account for tracking
   */
  async recordRequest(
    accountId: string,
    result: {
      success: boolean;
      tokens: number;
      isCacheRead?: boolean;
      error?: string;
    },
  ): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const key = `account:requests:${accountId}:${today}`;

      await Promise.all([
        redis.hincrby(key, "total", 1),
        redis.hincrby(key, result.success ? "success" : "failed", 1),
        redis.hincrby(key, "tokens", result.tokens),
        redis.expire(key, 86400 * 2),
      ]);

      if (result.isCacheRead) {
        await redis.hincrby(key, "cacheHits", 1);
      }
    } catch (error) {
      logger.warn("Failed to record account request", {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get fallback accounts from environment variables
   */
  private getFallbackAccounts(): ClaudeAccount[] {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    return [
      {
        id: "env-default",
        name: "Default (Environment)",
        provider: "anthropic",
        tier: "pro",
        status: "active",
        metadata: {
          source: "environment",
        },
      },
    ];
  }

  /**
   * Map database record to ClaudeAccount
   */
  private mapToClaudeAccount(dbRecord: any): ClaudeAccount {
    const metadata = typeof dbRecord.metadata === "object" ? dbRecord.metadata : {};

    // Detect account type based on metadata
    const accountType = this.detectAccountType(metadata);

    return {
      id: dbRecord.id,
      name: dbRecord.name || "Unnamed Account",
      provider: dbRecord.provider || "anthropic",
      tier: dbRecord.tier || "pro",
      status: dbRecord.status || "active",
      metadata,
      rateLimits: dbRecord.rateLimits,
      accountType,
    };
  }

  /**
   * Detect account type from metadata
   * - If has encryptedSessionKey or sessionKey -> claude-max
   * - Otherwise -> anthropic-api
   */
  private detectAccountType(metadata: Record<string, unknown>): AccountType {
    if (metadata?.encryptedSessionKey || metadata?.sessionKey) {
      return "claude-max";
    }
    return "anthropic-api";
  }

  /**
   * Check if an account is a Claude Max account (uses session key)
   */
  isClaudeMaxAccount(account: ClaudeAccount): boolean {
    return account.accountType === "claude-max" || this.detectAccountType(account.metadata) === "claude-max";
  }

  /**
   * Get the account type for an account
   */
  getAccountType(account: ClaudeAccount): AccountType {
    return account.accountType || this.detectAccountType(account.metadata);
  }

  /**
   * Get health status for an account
   */
  async getAccountHealth(accountId: string): Promise<{
    status: string;
    rateLimited: boolean;
    lastUsed?: string;
    requestsToday?: number;
  } | null> {
    const account = await this.getAccount(accountId);
    if (!account) return null;

    const isCoolingDown = await this.isAccountCoolingDown(accountId);

    return {
      status: account.status,
      rateLimited: isCoolingDown || account.status === "rate_limited",
      lastUsed: undefined, // Could be enhanced with usage tracking
      requestsToday: account.dailyUsage?.requestCount,
    };
  }

  /**
   * Register a new account in the pool
   */
  async registerAccount(input: {
    name: string;
    organizationId: string;
    apiKey?: string;
    tier?: "free" | "pro" | "team" | "enterprise";
    accountType?: AccountType;
    metadata?: Record<string, unknown>;
  }): Promise<ClaudeAccount> {
    // Merge apiKey into metadata if provided
    const metadata = {
      ...(input.metadata || {}),
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    };

    const account = await prisma.claudeAccount.create({
      data: {
        name: input.name,
        organizationId: input.organizationId,
        status: "active",
        metadata: metadata as any, // Cast to avoid Prisma JsonValue issues
      },
    });

    return {
      id: account.id,
      name: account.name,
      provider: "anthropic",
      tier: input.tier || "pro",
      status: account.status as ClaudeAccount["status"],
      metadata: account.metadata as Record<string, unknown>,
      accountType: input.accountType,
    };
  }
}
