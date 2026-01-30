import { db } from "../../db/client";
import { logger } from "../../utils/logger";

export interface SearchMetrics {
  totalSearches: number;
  averageLatencyMs: number;
  latencyBySource: Record<string, number>;
  topQueries: { query: string; count: number }[];
}

export interface InstallationMetrics {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  byMode: {
    manual: number;
    recommend: number;
    yolo: number;
  };
  bySource: Record<string, number>;
  popularTools: { name: string; source: string; installs: number }[];
}

export interface AnalyticsOverview {
  period: { start: Date; end: Date };
  searches: SearchMetrics;
  installations: InstallationMetrics;
}

export class MarketplaceAnalytics {
  /**
   * Record a search event with latency
   */
  async recordSearch(params: {
    orgId: string;
    query: string;
    sources: string[];
    latencyMs: number;
    resultsCount: number;
  }): Promise<void> {
    try {
      // Store in a search_events table or use existing analytics pattern
      // Log for now if no dedicated table
      logger.info("Marketplace search recorded", params);
    } catch (err) {
      logger.warn("Failed to record search event", {
        orgId: params.orgId,
        error: String(err),
      });
    }
  }

  /**
   * Record an installation attempt
   */
  async recordInstallation(params: {
    orgId: string;
    source: string;
    itemId: string;
    itemName: string;
    mode: "manual" | "recommend" | "yolo";
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      logger.info("Marketplace installation recorded", params);
    } catch (err) {
      logger.warn("Failed to record installation event", {
        orgId: params.orgId,
        error: String(err),
      });
    }
  }

  /**
   * Get analytics overview for an organization
   */
  async getOverview(orgId: string, days: number = 30): Promise<AnalyticsOverview> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [installMetrics, searchMetrics] = await Promise.all([
      this.getInstallationMetrics(orgId, days),
      this.getSearchMetrics(orgId, days),
    ]);

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      searches: searchMetrics,
      installations: installMetrics,
    };
  }

  /**
   * Get search metrics for an organization
   */
  private async getSearchMetrics(_orgId: string, _days: number = 30): Promise<SearchMetrics> {
    // Placeholder: Until we have a search_events table, return empty metrics
    return {
      totalSearches: 0,
      averageLatencyMs: 0,
      latencyBySource: {},
      topQueries: [],
    };
  }

  /**
   * Get installation metrics for an organization
   */
  async getInstallationMetrics(orgId: string, days: number = 30): Promise<InstallationMetrics> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Query InstallationQueue for all installation attempts
      const queueItems = await db.installationQueue.findMany({
        where: {
          organizationId: orgId,
          requestedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          source: true,
          itemName: true,
          status: true,
          requiresApproval: true,
        },
      });

      // Query ExtensionInstallation for successful installs
      const successfulInstalls = await db.extensionInstallation.findMany({
        where: {
          organizationId: orgId,
          installedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          extension: {
            select: {
              name: true,
              source: true,
            },
          },
        },
      });

      // Calculate metrics
      const total = queueItems.length;
      const failed = queueItems.filter((item) => item.status === "failed").length;
      const successful = successfulInstalls.length;

      // Calculate installation mode breakdown (estimate from queue data)
      const requiresApprovalCount = queueItems.filter((item) => item.requiresApproval).length;
      const manualCount = total - requiresApprovalCount;
      const recommendCount = requiresApprovalCount;
      const yoloCount = 0; // Placeholder: Need to track this in queue data

      // Calculate source breakdown
      const bySource: Record<string, number> = {};
      for (const item of queueItems) {
        bySource[item.source] = (bySource[item.source] || 0) + 1;
      }

      // Get popular tools
      const popularTools = await this.getPopularTools(orgId, 10);

      return {
        total,
        successful,
        failed,
        successRate: total > 0 ? Math.round((successful / total) * 1000) / 1000 : 0,
        byMode: {
          manual: manualCount,
          recommend: recommendCount,
          yolo: yoloCount,
        },
        bySource,
        popularTools,
      };
    } catch (err) {
      logger.error("Failed to get installation metrics", {
        orgId,
        error: String(err),
      });

      // Return empty metrics on error
      return {
        total: 0,
        successful: 0,
        failed: 0,
        successRate: 0,
        byMode: {
          manual: 0,
          recommend: 0,
          yolo: 0,
        },
        bySource: {},
        popularTools: [],
      };
    }
  }

  /**
   * Get most popular tools across all orgs or for specific org
   */
  async getPopularTools(
    orgId?: string,
    limit: number = 10,
  ): Promise<{ name: string; source: string; installs: number }[]> {
    try {
      // Query ExtensionInstallation with aggregation
      const where = orgId ? { organizationId: orgId } : {};

      const installations = await db.extensionInstallation.findMany({
        where,
        select: {
          extensionId: true,
          extension: {
            select: {
              name: true,
              source: true,
            },
          },
        },
      });

      // Aggregate by extension
      const aggregated = new Map<
        string,
        { name: string; source: string | null; installs: number }
      >();

      for (const install of installations) {
        const key = install.extensionId;
        if (aggregated.has(key)) {
          aggregated.get(key)!.installs++;
        } else {
          aggregated.set(key, {
            name: install.extension.name,
            source: install.extension.source || "unknown",
            installs: 1,
          });
        }
      }

      // Sort by installs and take top N
      const sorted = Array.from(aggregated.values())
        .sort((a, b) => b.installs - a.installs)
        .slice(0, limit)
        .map((item) => ({
          name: item.name,
          source: item.source || "unknown",
          installs: item.installs,
        }));

      return sorted;
    } catch (err) {
      logger.error("Failed to get popular tools", {
        orgId,
        error: String(err),
      });
      return [];
    }
  }

  /**
   * Get installation trend data (installs per day)
   */
  async getInstallationTrend(
    orgId: string,
    days: number = 30,
  ): Promise<{ date: string; installs: number }[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const installations = await db.extensionInstallation.findMany({
        where: {
          organizationId: orgId,
          installedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          installedAt: true,
        },
      });

      // Aggregate by date
      const byDate = new Map<string, number>();

      // Initialize all dates with 0
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        byDate.set(dateStr, 0);
      }

      // Count installs per date
      for (const install of installations) {
        const dateStr = install.installedAt.toISOString().slice(0, 10);
        byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1);
      }

      // Convert to array
      return Array.from(byDate.entries())
        .map(([date, installs]) => ({ date, installs }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      logger.error("Failed to get installation trend", {
        orgId,
        error: String(err),
      });
      return [];
    }
  }

  /**
   * Get installation success/failure breakdown
   */
  async getInstallationOutcomes(
    orgId: string,
    days: number = 30,
  ): Promise<{
    completed: number;
    failed: number;
    pending: number;
    installing: number;
    cancelled: number;
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const queueItems = await db.installationQueue.findMany({
        where: {
          organizationId: orgId,
          requestedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          status: true,
        },
      });

      const outcomes = {
        completed: 0,
        failed: 0,
        pending: 0,
        installing: 0,
        cancelled: 0,
      };

      for (const item of queueItems) {
        const status = item.status as keyof typeof outcomes;
        if (status in outcomes) {
          outcomes[status]++;
        }
      }

      return outcomes;
    } catch (err) {
      logger.error("Failed to get installation outcomes", {
        orgId,
        error: String(err),
      });
      return {
        completed: 0,
        failed: 0,
        pending: 0,
        installing: 0,
        cancelled: 0,
      };
    }
  }
}

export const marketplaceAnalytics = new MarketplaceAnalytics();
