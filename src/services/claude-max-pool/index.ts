/**
 * Claude Max Account Pool Manager
 * Manages N Claude Max subscription accounts for quota distribution
 * Uses c2switcher-style drain rate algorithm for optimal account selection
 */
//
import { db } from "../../db/client";
import { logger } from "../../utils/logger";

export type ClaudeMaxAccountStatus = "active" | "rate_limited" | "exhausted" | "cooldown";

export interface ClaudeMaxAccountRecord {
  id: string;
  organizationId: string;
  nickname: string;
  email: string;
  status: ClaudeMaxAccountStatus;
  estimatedUsagePercent: number;
  estimatedResetAt: Date | null;
  priority: number;
  cooldownUntil: Date | null;
  consecutiveRateLimits: number;
  lastActiveAt: Date | null;
}

export interface AccountSelectionResult {
  account: ClaudeMaxAccountRecord | null;
  reason: string;
}

type ClaudeMaxAccountDb = ClaudeMaxAccountRecord;

export class ClaudeMaxPoolService {
  /**
   * Select optimal account using drain rate algorithm
   * Higher drain rate = prefer this account (more capacity to use)
   */
  async selectAccount(organizationId: string): Promise<AccountSelectionResult> {
    const now = new Date();
    const accounts = (await this.claudeMaxAccount.findMany({
      where: {
        organizationId,
        status: { in: ["active", "rate_limited"] },
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: now } }],
      },
      orderBy: { priority: "desc" },
    })) as ClaudeMaxAccountDb[];

    if (accounts.length === 0) {
      return { account: null, reason: "No available accounts" };
    }

    // Calculate drain rate score for each account
    const scored = accounts.map((account) => {
      let drainRate = this.calculateDrainRate(account);

      // Apply bonuses/penalties
      if (account.estimatedUsagePercent < 25) {
        drainRate += 3.0; // Fresh account bonus
      }
      if (account.estimatedUsagePercent > 90) {
        drainRate *= 0.5; // Near-limit penalty
      }
      if (account.estimatedUsagePercent > 85) {
        drainRate *= 0.7;
      }
      if (account.consecutiveRateLimits > 0) {
        drainRate *= Math.pow(0.8, account.consecutiveRateLimits);
      }

      return { account, drainRate };
    });

    // Sort by drain rate descending
    scored.sort((a, b) => b.drainRate - a.drainRate);

    const selected = scored[0];

    // Mark as active
    await this.claudeMaxAccount.update({
      where: { id: selected.account.id },
      data: { lastActiveAt: new Date() },
    });

    logger.info("Selected Claude Max account", {
      accountId: selected.account.id,
      nickname: selected.account.nickname,
      drainRate: selected.drainRate,
      usage: selected.account.estimatedUsagePercent,
    });

    return {
      account: this.mapToRecord(selected.account),
      reason: `Selected with drain rate ${selected.drainRate.toFixed(2)}`,
    };
  }

  /**
   * Calculate drain rate: (99% - current_usage) / hours_until_reset
   */
  private calculateDrainRate(account: ClaudeMaxAccountDb): number {
    const usage = account.estimatedUsagePercent ?? 0;
    const resetAt = account.estimatedResetAt;

    if (!resetAt) {
      // No reset time known, use default 24 hours
      return (99 - usage) / 24;
    }

    const hoursUntilReset = Math.max(
      (new Date(resetAt).getTime() - Date.now()) / (1000 * 60 * 60),
      0.5, // Minimum 30 minutes
    );

    return (99 - usage) / hoursUntilReset;
  }

  /**
   * Record rate limit hit - update account status
   */
  async recordRateLimit(accountId: string): Promise<void> {
    const account = (await this.claudeMaxAccount.findUnique({
      where: { id: accountId },
    })) as ClaudeMaxAccountDb | null;
    if (!account) return;

    const consecutiveRateLimits = account.consecutiveRateLimits + 1;
    const cooldownMinutes = Math.min(15 * Math.pow(2, consecutiveRateLimits - 1), 240); // Max 4 hours

    await this.claudeMaxAccount.update({
      where: { id: accountId },
      data: {
        status: consecutiveRateLimits >= 3 ? "exhausted" : "rate_limited",
        consecutiveRateLimits,
        lastRateLimitAt: new Date(),
        cooldownUntil: new Date(Date.now() + cooldownMinutes * 60 * 1000),
        estimatedUsagePercent: Math.min(account.estimatedUsagePercent + 10, 100),
      },
    });

    logger.warn("Claude Max account rate limited", {
      accountId,
      nickname: account.nickname,
      consecutiveRateLimits,
      cooldownMinutes,
    });
  }

  /**
   * Record successful execution - reset consecutive failures
   */
  async recordSuccess(accountId: string, estimatedTokensUsed?: number): Promise<void> {
    const account = (await this.claudeMaxAccount.findUnique({
      where: { id: accountId },
    })) as ClaudeMaxAccountDb | null;
    if (!account) return;

    // Estimate usage increase (rough: 1000 tokens ≈ 0.1% daily quota)
    const usageIncrease = estimatedTokensUsed ? estimatedTokensUsed / 10000 : 0.5;

    await this.claudeMaxAccount.update({
      where: { id: accountId },
      data: {
        status: "active",
        consecutiveRateLimits: 0,
        lastActiveAt: new Date(),
        estimatedUsagePercent: Math.min(account.estimatedUsagePercent + usageIncrease, 100),
        lastUsageUpdateAt: new Date(),
      },
    });
  }

  /**
   * Add new Claude Max account
   */
  async addAccount(data: {
    organizationId: string;
    nickname: string;
    email: string;
    priority?: number;
  }): Promise<ClaudeMaxAccountRecord> {
    const account = (await this.claudeMaxAccount.create({
      data: {
        organizationId: data.organizationId,
        nickname: data.nickname,
        email: data.email,
        priority: data.priority ?? 100,
        status: "active",
        estimatedUsagePercent: 0,
      },
    })) as ClaudeMaxAccountDb;

    logger.info("Added Claude Max account", {
      accountId: account.id,
      nickname: account.nickname,
      organizationId: data.organizationId,
    });

    return this.mapToRecord(account);
  }

  /**
   * Get all accounts for organization
   */
  async getAccounts(organizationId: string): Promise<ClaudeMaxAccountRecord[]> {
    const accounts = (await this.claudeMaxAccount.findMany({
      where: { organizationId },
      orderBy: { priority: "desc" },
    })) as ClaudeMaxAccountDb[];

    return accounts.map((account) => this.mapToRecord(account));
  }

  /**
   * Reset daily usage estimates (call via cron)
   */
  async resetDailyUsage(organizationId?: string): Promise<number> {
    const where = organizationId ? { organizationId } : {};

    const result = await this.claudeMaxAccount.updateMany({
      where,
      data: {
        estimatedUsagePercent: 0,
        consecutiveRateLimits: 0,
        status: "active",
        cooldownUntil: null,
        estimatedResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    logger.info("Reset Claude Max account daily usage", {
      count: result.count,
      organizationId: organizationId || "all",
    });

    return result.count;
  }

  private mapToRecord(account: ClaudeMaxAccountDb): ClaudeMaxAccountRecord {
    return {
      id: account.id,
      organizationId: account.organizationId,
      nickname: account.nickname,
      email: account.email,
      status: account.status as ClaudeMaxAccountStatus,
      estimatedUsagePercent: account.estimatedUsagePercent,
      estimatedResetAt: account.estimatedResetAt,
      priority: account.priority,
      cooldownUntil: account.cooldownUntil,
      consecutiveRateLimits: account.consecutiveRateLimits,
      lastActiveAt: account.lastActiveAt,
    };
  }

  private get claudeMaxAccount() {
    return (db as any).claudeMaxAccount;
  }
}

// Singleton instance
let _instance: ClaudeMaxPoolService | null = null;

export function getClaudeMaxPoolService(): ClaudeMaxPoolService {
  if (!_instance) {
    _instance = new ClaudeMaxPoolService();
  }
  return _instance;
}

export default ClaudeMaxPoolService;
