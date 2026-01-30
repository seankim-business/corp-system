/**
 * Admin Revenue Analytics Service
 *
 * Provides revenue metrics and analytics for platform monitoring.
 */

import { db as prisma } from "../../db/client";

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  mrrGrowth: number;
  avgRevenuePerUser: number;
  avgRevenuePerOrg: number;
  churnRate: number;
  ltv: number;
}

export interface RevenueByPeriod {
  period: string;
  revenue: number;
  newMrr: number;
  churnedMrr: number;
  netMrr: number;
  customers: number;
}

export interface PlanDistribution {
  plan: string;
  count: number;
  revenue: number;
  percentage: number;
}

// Plan pricing configuration
const PLAN_PRICING: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 29, annual: 290 },
  professional: { monthly: 99, annual: 990 },
  enterprise: { monthly: 499, annual: 4990 },
};

export class AdminRevenueService {
  /**
   * Get current revenue metrics
   */
  async getRevenueMetrics(): Promise<RevenueMetrics> {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        settings: true,
        createdAt: true,
        memberships: true,
      },
    });

    let mrr = 0;
    let totalUsers = 0;

    for (const org of orgs) {
      const settings = org.settings as Record<string, unknown>;
      const plan = (settings.plan as string) || "free";
      const pricing = PLAN_PRICING[plan] || PLAN_PRICING.free;
      mrr += pricing.monthly;
      totalUsers += org.memberships.length;
    }

    const activeOrgs = orgs.filter((o) => {
      const settings = o.settings as Record<string, unknown>;
      return settings.status !== "suspended" && settings.status !== "churned";
    });

    return {
      mrr,
      arr: mrr * 12,
      mrrGrowth: 0, // Requires historical MRR snapshots table
      avgRevenuePerUser: totalUsers > 0 ? mrr / totalUsers : 0,
      avgRevenuePerOrg: activeOrgs.length > 0 ? mrr / activeOrgs.length : 0,
      churnRate: 0, // Requires organization status history tracking
      ltv: 0, // Requires customer lifetime and churn data
    };
  }

  /**
   * Get revenue by time period
   */
  async getRevenueByPeriod(
    startDate: Date,
    endDate: Date,
    granularity: "day" | "week" | "month" = "month",
  ): Promise<RevenueByPeriod[]> {
    // Get all organizations created within the period
    const orgs = await prisma.organization.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        settings: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by period
    const periods = new Map<string, RevenueByPeriod>();

    for (const org of orgs) {
      const periodKey = this.getPeriodKey(org.createdAt, granularity);
      const settings = org.settings as Record<string, unknown>;
      const plan = (settings.plan as string) || "free";
      const pricing = PLAN_PRICING[plan] || PLAN_PRICING.free;

      if (!periods.has(periodKey)) {
        periods.set(periodKey, {
          period: periodKey,
          revenue: 0,
          newMrr: 0,
          churnedMrr: 0,
          netMrr: 0,
          customers: 0,
        });
      }

      const period = periods.get(periodKey)!;
      period.revenue += pricing.monthly;
      period.newMrr += pricing.monthly;
      period.customers += 1;
      period.netMrr = period.newMrr - period.churnedMrr;
    }

    return Array.from(periods.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  }

  /**
   * Get plan distribution
   */
  async getPlanDistribution(): Promise<PlanDistribution[]> {
    const orgs = await prisma.organization.findMany({
      select: { settings: true },
    });

    const distribution = new Map<string, { count: number; revenue: number }>();
    let totalOrgs = 0;

    for (const org of orgs) {
      const settings = org.settings as Record<string, unknown>;
      const plan = (settings.plan as string) || "free";
      const pricing = PLAN_PRICING[plan] || PLAN_PRICING.free;

      if (!distribution.has(plan)) {
        distribution.set(plan, { count: 0, revenue: 0 });
      }

      const stats = distribution.get(plan)!;
      stats.count += 1;
      stats.revenue += pricing.monthly;
      totalOrgs += 1;
    }

    return Array.from(distribution.entries()).map(([plan, stats]) => ({
      plan,
      count: stats.count,
      revenue: stats.revenue,
      percentage: totalOrgs > 0 ? (stats.count / totalOrgs) * 100 : 0,
    }));
  }

  /**
   * Get top organizations by spend
   */
  async getTopOrganizationsBySpend(limit: number = 10): Promise<
    Array<{
      id: string;
      name: string;
      plan: string;
      monthlySpend: number;
      totalSpend: number;
    }>
  > {
    const orgs = await prisma.organization.findMany({
      orderBy: { currentMonthSpendCents: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        settings: true,
        currentMonthSpendCents: true,
      },
    });

    return orgs.map((org) => {
      const settings = org.settings as Record<string, unknown>;
      return {
        id: org.id,
        name: org.name,
        plan: (settings.plan as string) || "free",
        monthlySpend: org.currentMonthSpendCents / 100,
        totalSpend: org.currentMonthSpendCents / 100, // Using current month as proxy; requires historical spend table for accurate totals
      };
    });
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(months: number = 6): Promise<
    Array<{
      cohort: string;
      totalCustomers: number;
      retentionByMonth: number[];
    }>
  > {
    const now = new Date();
    const cohorts: Array<{
      cohort: string;
      totalCustomers: number;
      retentionByMonth: number[];
    }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const orgsInCohort = await prisma.organization.count({
        where: {
          createdAt: {
            gte: cohortStart,
            lte: cohortEnd,
          },
        },
      });

      cohorts.push({
        cohort: this.getPeriodKey(cohortStart, "month"),
        totalCustomers: orgsInCohort,
        retentionByMonth: [100], // Retention calculation requires organization status history tracking
      });
    }

    return cohorts;
  }

  /**
   * Helper to get period key
   */
  private getPeriodKey(date: Date, granularity: "day" | "week" | "month"): string {
    switch (granularity) {
      case "day":
        return date.toISOString().split("T")[0];
      case "week":
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split("T")[0];
      case "month":
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      default:
        return date.toISOString().split("T")[0];
    }
  }
}

export const adminRevenueService = new AdminRevenueService();
