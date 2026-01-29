/**
 * Admin Organization Management Service
 *
 * Provides organization management capabilities for platform admins.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { logAdminAction } from "../middleware/admin-auth";

export interface OrganizationListItem {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  memberCount: number;
  plan: string;
  status: "active" | "suspended" | "pending";
  monthlySpend: number;
  lastActivity?: Date;
}

export interface OrganizationFilters {
  search?: string;
  plan?: string;
  status?: string;
  sortBy?: "name" | "createdAt" | "memberCount" | "monthlySpend";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export class AdminOrganizationsService {
  /**
   * List all organizations with filters
   */
  async listOrganizations(filters: OrganizationFilters = {}): Promise<{
    organizations: OrganizationListItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      search,
      plan,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get organizations with member count
    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          memberships: true,
          orchestratorExecutions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.organization.count({ where }),
    ]);

    const items: OrganizationListItem[] = organizations.map((org) => {
      const settings = org.settings as Record<string, unknown>;
      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        createdAt: org.createdAt,
        memberCount: org.memberships.length,
        plan: (settings.plan as string) || "free",
        status: (settings.status as "active" | "suspended" | "pending") || "active",
        monthlySpend: org.currentMonthSpendCents / 100,
        lastActivity: org.orchestratorExecutions[0]?.createdAt,
      };
    });

    // Filter by plan/status in memory (settings is JSON)
    let filtered = items;
    if (plan) {
      filtered = filtered.filter((o) => o.plan === plan);
    }
    if (status) {
      filtered = filtered.filter((o) => o.status === status);
    }

    return {
      organizations: filtered,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Suspend an organization
   */
  async suspendOrganization(
    orgId: string,
    adminId: string,
    reason: string,
  ): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const settings = org.settings as Record<string, unknown>;
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...settings,
          status: "suspended",
          suspendedAt: new Date().toISOString(),
          suspendedBy: adminId,
          suspensionReason: reason,
        },
      },
    });

    await logAdminAction(adminId, "suspend_organization", {
      organizationId: orgId,
      organizationName: org.name,
      reason,
    });

    logger.info("Organization suspended", {
      orgId,
      adminId,
      reason,
    });
  }

  /**
   * Reactivate a suspended organization
   */
  async reactivateOrganization(orgId: string, adminId: string): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const settings = org.settings as Record<string, unknown>;
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...settings,
          status: "active",
          reactivatedAt: new Date().toISOString(),
          reactivatedBy: adminId,
        },
      },
    });

    await logAdminAction(adminId, "reactivate_organization", {
      organizationId: orgId,
      organizationName: org.name,
    });

    logger.info("Organization reactivated", {
      orgId,
      adminId,
    });
  }

  /**
   * Update organization plan
   */
  async updatePlan(
    orgId: string,
    adminId: string,
    newPlan: string,
  ): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const settings = org.settings as Record<string, unknown>;
    const oldPlan = settings.plan || "free";

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...settings,
          plan: newPlan,
          planChangedAt: new Date().toISOString(),
          planChangedBy: adminId,
        },
      },
    });

    await logAdminAction(adminId, "update_plan", {
      organizationId: orgId,
      organizationName: org.name,
      oldPlan,
      newPlan,
    });

    logger.info("Organization plan updated", {
      orgId,
      oldPlan,
      newPlan,
      adminId,
    });
  }

  /**
   * Get organization activity log
   */
  async getActivityLog(
    orgId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      userId?: string;
    }>;
    total: number;
  }> {
    const { limit = 50, offset = 0 } = options;

    const [executions, total] = await Promise.all([
      prisma.orchestratorExecution.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          userId: true,
          category: true,
        },
      }),
      prisma.orchestratorExecution.count({
        where: { organizationId: orgId },
      }),
    ]);

    return {
      activities: executions.map((e) => ({
        id: e.id,
        type: "execution",
        description: e.category?.slice(0, 100) || "Execution",
        createdAt: e.createdAt,
        userId: e.userId,
      })),
      total,
    };
  }
}

export const adminOrganizationsService = new AdminOrganizationsService();
