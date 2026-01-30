/**
 * Admin Platform Metrics Service
 *
 * Aggregates metrics across all organizations for platform monitoring.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface PlatformMetrics {
  organizations: {
    total: number;
    active: number;
    byPlan: Record<string, number>;
    newThisMonth: number;
    churnedThisMonth: number;
  };

  users: {
    total: number;
    activeThisMonth: number;
    avgPerOrg: number;
  };

  revenue: {
    mrr: number;
    arr: number;
    avgRevenuePerOrg: number;
    revenueByPlan: Record<string, number>;
  };

  usage: {
    totalExecutions: number;
    executionsByAgent: Record<string, number>;
    avgExecutionsPerOrg: number;
  };

  system: {
    uptime: number;
    avgLatency: number;
    errorRate: number;
    activeConnections: number;
  };

  timestamp: Date;
}

export interface OrganizationDetails {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  settings: Record<string, unknown>;
  memberCount: number;
  executionCount: number;
  monthlySpend: number;
  integrations: {
    notion: boolean;
    drive: boolean;
    github: boolean;
    slack: boolean;
    calendar: boolean;
  };
  lastActivity?: Date;
}

export class AdminMetricsService {
  /**
   * Get comprehensive platform metrics
   */
  async getMetrics(): Promise<PlatformMetrics> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    try {
      // Run all queries in parallel
      const [
        orgStats,
        userStats,
        usageStats,
        revenueStats,
      ] = await Promise.all([
        this.getOrganizationStats(monthStart, lastMonth),
        this.getUserStats(monthStart),
        this.getUsageStats(monthStart),
        this.getRevenueStats(),
      ]);

      return {
        organizations: orgStats,
        users: userStats,
        revenue: revenueStats,
        usage: usageStats,
        system: await this.getSystemStats(),
        timestamp: now,
      };
    } catch (error) {
      logger.error("Failed to get platform metrics", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get metrics history for trend analysis
   * Note: Requires time-series metrics table (e.g., PlatformMetricsSnapshot)
   */
  async getMetricsHistory(_days: number): Promise<PlatformMetrics[]> {
    // Historical metrics require daily/hourly snapshots stored in database
    // Consider creating PlatformMetricsSnapshot table for trend analysis
    const current = await this.getMetrics();
    return [current];
  }

  /**
   * Get detailed information about a specific organization
   */
  async getOrganizationDetails(orgId: string): Promise<OrganizationDetails> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        memberships: true,
        orchestratorExecutions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        notionConnections: true,
        mcpConnections: true,
        slackIntegrations: true,
      },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const [driveConnection, calendarConnection, executionCount] = await Promise.all([
      prisma.driveConnection.findUnique({ where: { organizationId: orgId } }),
      prisma.googleCalendarConnection.findUnique({ where: { organizationId: orgId } }),
      prisma.orchestratorExecution.count({ where: { organizationId: orgId } }),
    ]);

    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      createdAt: org.createdAt,
      settings: org.settings as Record<string, unknown>,
      memberCount: org.memberships.length,
      executionCount,
      monthlySpend: org.currentMonthSpendCents / 100,
      integrations: {
        notion: org.notionConnections.length > 0,
        drive: !!driveConnection,
        github: org.mcpConnections.some((c) => c.provider === "github"),
        slack: org.slackIntegrations.some((s) => s.enabled),
        calendar: !!calendarConnection,
      },
      lastActivity: org.orchestratorExecutions[0]?.createdAt,
    };
  }

  /**
   * Get organization statistics
   */
  private async getOrganizationStats(
    monthStart: Date,
    _lastMonth: Date,
  ): Promise<PlatformMetrics["organizations"]> {
    const [total, newThisMonth, activeOrgs] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.orchestratorExecution.groupBy({
        by: ["organizationId"],
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    // Get plan distribution from settings
    const orgs = await prisma.organization.findMany({
      select: { settings: true },
    });

    const byPlan: Record<string, number> = {};
    for (const org of orgs) {
      const settings = org.settings as Record<string, unknown>;
      const plan = (settings.plan as string) || "free";
      byPlan[plan] = (byPlan[plan] || 0) + 1;
    }

    return {
      total,
      active: activeOrgs.length,
      byPlan,
      newThisMonth,
      churnedThisMonth: 0, // Requires organization status/lifecycle tracking
    };
  }

  /**
   * Get user statistics
   */
  private async getUserStats(monthStart: Date): Promise<PlatformMetrics["users"]> {
    const [total, activeThisMonth, orgCount] = await Promise.all([
      prisma.user.count(),
      prisma.session.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.organization.count(),
    ]);

    return {
      total,
      activeThisMonth: activeThisMonth.length,
      avgPerOrg: orgCount > 0 ? Math.round((total / orgCount) * 10) / 10 : 0,
    };
  }

  /**
   * Get usage statistics
   */
  private async getUsageStats(monthStart: Date): Promise<PlatformMetrics["usage"]> {
    const [totalExecutions, orgCount] = await Promise.all([
      prisma.orchestratorExecution.count({
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.organization.count(),
    ]);

    // Note: OrchestratorExecution tracks orchestrator-level executions
    // Agent-level execution tracking would require AgentExecution table or agentId field
    const agentStats: Record<string, number> = {};

    return {
      totalExecutions,
      executionsByAgent: agentStats,
      avgExecutionsPerOrg:
        orgCount > 0 ? Math.round((totalExecutions / orgCount) * 10) / 10 : 0,
    };
  }

  /**
   * Get revenue statistics
   */
  private async getRevenueStats(): Promise<PlatformMetrics["revenue"]> {
    const orgs = await prisma.organization.findMany({
      select: {
        settings: true,
        currentMonthSpendCents: true,
      },
    });

    // Plan pricing (placeholder - would come from config)
    const planPricing: Record<string, number> = {
      free: 0,
      starter: 29,
      professional: 99,
      enterprise: 499,
    };

    let mrr = 0;
    const revenueByPlan: Record<string, number> = {};

    for (const org of orgs) {
      const settings = org.settings as Record<string, unknown>;
      const plan = (settings.plan as string) || "free";
      const planRevenue = planPricing[plan] || 0;

      mrr += planRevenue;
      revenueByPlan[plan] = (revenueByPlan[plan] || 0) + planRevenue;
    }

    return {
      mrr,
      arr: mrr * 12,
      avgRevenuePerOrg: orgs.length > 0 ? Math.round((mrr / orgs.length) * 100) / 100 : 0,
      revenueByPlan,
    };
  }

  /**
   * Get system health statistics
   * Note: Requires APM/monitoring integration (e.g., New Relic, DataDog)
   */
  private async getSystemStats(): Promise<PlatformMetrics["system"]> {
    // System statistics require integration with monitoring/APM service
    // Current implementation returns placeholder values
    return {
      uptime: 99.9, // Would come from uptime monitoring service
      avgLatency: 45, // Would come from request tracing/APM
      errorRate: 0.1, // Would come from error tracking service
      activeConnections: 0, // Would come from database connection pool stats
    };
  }
}

export const adminMetricsService = new AdminMetricsService();
