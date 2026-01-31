/**
 * Quota Monitor Service
 * Syncs usage data from Claude Admin API and creates alerts when thresholds are exceeded
 */

import { PrismaClient } from "@prisma/client";
import { AdminAPIClient } from "./admin-api.client";
import { UsageGranularity } from "./admin-api.types";

const prisma = new PrismaClient();

interface QuotaAlert {
  id: string;
  accountId: string;
  type: "approaching_limit" | "quota_exceeded";
  severity: "warning" | "critical";
  message: string;
  currentValue: number;
  limit: number;
  percentage: number;
  resolvedAt: Date | null;
  createdAt: Date;
}

export class QuotaMonitorService {
  private adminClient: AdminAPIClient;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 60000; // 60 seconds

  constructor(adminApiKey: string) {
    this.adminClient = new AdminAPIClient(adminApiKey);
  }

  /**
   * Sync usage data from Admin API for one or all accounts
   * @param accountId Optional account ID to sync. If not provided, syncs all accounts.
   */
  async syncUsageFromAdminAPI(accountId?: string): Promise<void> {
    try {
      console.log(
        `[QuotaMonitorService] Starting usage sync${accountId ? ` for account ${accountId}` : " for all accounts"}`,
      );

      // Get accounts to sync
      const accounts = accountId
        ? await prisma.claudeAccount.findMany({
            where: { id: accountId },
          })
        : await prisma.claudeAccount.findMany({
            where: { status: "active" },
          });

      if (accounts.length === 0) {
        console.log("[QuotaMonitorService] No accounts found to sync");
        return;
      }

      console.log(`[QuotaMonitorService] Syncing ${accounts.length} account(s)`);

      // Sync each account
      for (const account of accounts) {
        try {
          await this.syncAccountUsage(account.id);
        } catch (error) {
          console.error(
            `[QuotaMonitorService] Failed to sync account ${account.id}:`,
            error instanceof Error ? error.message : String(error),
          );
          // Continue with next account - don't let one failure stop the whole sync
        }
      }

      console.log("[QuotaMonitorService] Usage sync completed");
    } catch (error) {
      console.error(
        "[QuotaMonitorService] Error in syncUsageFromAdminAPI:",
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - we want the service to be resilient
    }
  }

  /**
   * Sync usage for a single account
   */
  private async syncAccountUsage(accountId: string): Promise<void> {
    const account = await prisma.claudeAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Get API key ID from metadata
    const apiKeyId = (account.metadata as any)?.apiKeyId;
    if (!apiKeyId) {
      console.warn(`[QuotaMonitorService] Account ${accountId} has no apiKeyId in metadata`);
      return;
    }

    // Fetch usage data from Admin API (last 1 hour)
    const usageResponse = await this.adminClient.getUsage(apiKeyId, UsageGranularity.ONE_HOUR);

    // Calculate totals from data points
    let totalRequests = 0;
    let totalTokens = 0;

    for (const dataPoint of usageResponse.data) {
      totalRequests += dataPoint.requests;
      totalTokens += dataPoint.inputTokens + dataPoint.outputTokens;
    }

    console.log(
      `[QuotaMonitorService] Account ${accountId}: ${totalRequests} requests, ${totalTokens} tokens`,
    );

    // Update account with current month usage
    // Note: This is a simplified implementation. In production, you'd want to:
    // 1. Track the billing period properly
    // 2. Accumulate usage over time rather than replacing it
    // 3. Handle month rollovers
    await prisma.claudeAccount.update({
      where: { id: accountId },
      data: {
        metadata: {
          ...(account.metadata as object),
          currentMonthRequests: totalRequests,
          currentMonthTokens: totalTokens,
          lastSyncedAt: new Date().toISOString(),
        },
      },
    });

    // Check thresholds after updating usage
    await this.checkThresholds(accountId);
  }

  /**
   * Check if account has exceeded thresholds and create alerts
   * @param accountId Account ID to check
   */
  async checkThresholds(accountId: string): Promise<void> {
    const account = await prisma.claudeAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const metadata = account.metadata as any;
    const currentRequests = metadata?.currentMonthRequests || 0;
    const currentTokens = metadata?.currentMonthTokens || 0;
    const requestLimit = metadata?.requestLimit || 0;
    const tokenLimit = metadata?.tokenLimit || 0;

    // Check request quota
    if (requestLimit > 0) {
      const requestPercentage = (currentRequests / requestLimit) * 100;
      await this.handleThreshold(
        accountId,
        "requests",
        currentRequests,
        requestLimit,
        requestPercentage,
      );
    }

    // Check token quota
    if (tokenLimit > 0) {
      const tokenPercentage = (currentTokens / tokenLimit) * 100;
      await this.handleThreshold(accountId, "tokens", currentTokens, tokenLimit, tokenPercentage);
    }
  }

  /**
   * Handle threshold checking and alert creation
   */
  private async handleThreshold(
    accountId: string,
    quotaType: string,
    currentValue: number,
    limit: number,
    percentage: number,
  ): Promise<void> {
    let alertType: "approaching_limit" | "quota_exceeded" | null = null;
    let severity: "warning" | "critical" | null = null;

    // Determine alert type and severity based on percentage
    if (percentage >= 100) {
      alertType = "quota_exceeded";
      severity = "critical";

      // Set account status to exhausted
      await prisma.claudeAccount.update({
        where: { id: accountId },
        data: { status: "exhausted" },
      });
    } else if (percentage >= 95) {
      alertType = "approaching_limit";
      severity = "critical";
    } else if (percentage >= 80) {
      alertType = "approaching_limit";
      severity = "warning";
    }

    // Create alert if threshold exceeded
    if (alertType && severity) {
      await this.createAlert(
        accountId,
        alertType,
        severity,
        quotaType,
        currentValue,
        limit,
        percentage,
      );
    }
  }

  /**
   * Create a quota alert (with deduplication)
   */
  private async createAlert(
    accountId: string,
    type: "approaching_limit" | "quota_exceeded",
    severity: "warning" | "critical",
    quotaType: string,
    currentValue: number,
    limit: number,
    percentage: number,
  ): Promise<void> {
    // Check for existing unresolved alert of the same type
    const existingAlert = await prisma.$queryRaw<any[]>`
      SELECT id FROM quota_alerts
      WHERE account_id = ${accountId}
        AND type = ${type}
        AND quota_type = ${quotaType}
        AND resolved_at IS NULL
      LIMIT 1
    `;

    if (existingAlert && existingAlert.length > 0) {
      console.log(
        `[QuotaMonitorService] Alert already exists for account ${accountId}, type ${type}, quota ${quotaType}`,
      );
      return;
    }

    // Create new alert
    const message = `${quotaType} usage at ${percentage.toFixed(1)}% (${currentValue}/${limit})`;

    await prisma.$executeRaw`
      INSERT INTO quota_alerts (id, account_id, type, severity, message, current_value, "limit", percentage, resolved_at, created_at, quota_type)
      VALUES (
        gen_random_uuid(),
        ${accountId}::uuid,
        ${type},
        ${severity},
        ${message},
        ${currentValue},
        ${limit},
        ${percentage},
        NULL,
        NOW(),
        ${quotaType}
      )
    `;

    console.log(
      `[QuotaMonitorService] Created ${severity} alert for account ${accountId}: ${message}`,
    );
  }

  /**
   * Resolve an alert by ID
   * @param alertId Alert ID to resolve
   */
  async resolveAlert(alertId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE quota_alerts
      SET resolved_at = NOW()
      WHERE id = ${alertId}::uuid
    `;

    console.log(`[QuotaMonitorService] Resolved alert ${alertId}`);
  }

  /**
   * Start scheduled sync (runs every 60 seconds)
   */
  scheduledSync(): void {
    if (this.syncInterval) {
      console.warn("[QuotaMonitorService] Scheduled sync already running");
      return;
    }

    console.log(
      `[QuotaMonitorService] Starting scheduled sync (every ${this.SYNC_INTERVAL_MS / 1000}s)`,
    );

    // Run immediately on start
    this.syncUsageFromAdminAPI().catch((error) => {
      console.error(
        "[QuotaMonitorService] Error in initial sync:",
        error instanceof Error ? error.message : String(error),
      );
    });

    // Then run on interval
    this.syncInterval = setInterval(() => {
      this.syncUsageFromAdminAPI().catch((error) => {
        console.error(
          "[QuotaMonitorService] Error in scheduled sync:",
          error instanceof Error ? error.message : String(error),
        );
      });
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * Stop scheduled sync
   */
  stopScheduledSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("[QuotaMonitorService] Stopped scheduled sync");
    }
  }

  /**
   * Get all unresolved alerts for an account
   */
  async getUnresolvedAlerts(accountId: string): Promise<QuotaAlert[]> {
    const alerts = await prisma.$queryRaw<QuotaAlert[]>`
      SELECT * FROM quota_alerts
      WHERE account_id = ${accountId}::uuid
        AND resolved_at IS NULL
      ORDER BY created_at DESC
    `;

    return alerts;
  }

  /**
   * Get all alerts for an account (resolved and unresolved)
   */
  async getAllAlerts(accountId: string): Promise<QuotaAlert[]> {
    const alerts = await prisma.$queryRaw<QuotaAlert[]>`
      SELECT * FROM quota_alerts
      WHERE account_id = ${accountId}::uuid
      ORDER BY created_at DESC
    `;

    return alerts;
  }
}
