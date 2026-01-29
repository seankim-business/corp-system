/**
 * Admin User Management Service
 *
 * Provides user management capabilities for platform admins.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { logAdminAction } from "../middleware/admin-auth";

export interface UserListItem {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  emailVerified: boolean;
  organizationCount: number;
  lastLoginAt?: Date;
}

export interface UserDetails extends UserListItem {
  avatarUrl: string | null;
  googleId: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    joinedAt: Date | null;
  }>;
  recentActivity: Array<{
    type: string;
    description: string;
    createdAt: Date;
    organizationName?: string;
  }>;
}

export interface UserFilters {
  search?: string;
  emailVerified?: boolean;
  hasGoogleAuth?: boolean;
  sortBy?: "email" | "createdAt" | "displayName";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export class AdminUsersService {
  /**
   * List all users with filters
   */
  async listUsers(filters: UserFilters = {}): Promise<{
    users: UserListItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      search,
      emailVerified,
      hasGoogleAuth,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (emailVerified !== undefined) {
      where.emailVerified = emailVerified;
    }

    if (hasGoogleAuth !== undefined) {
      where.googleId = hasGoogleAuth ? { not: null } : null;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          memberships: true,
          sessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        organizationCount: user.memberships.length,
        lastLoginAt: user.sessions[0]?.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(userId: string): Promise<UserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        orchestratorExecutions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      googleId: user.googleId,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      organizationCount: user.memberships.length,
      lastLoginAt: user.sessions[0]?.createdAt,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      recentActivity: user.orchestratorExecutions.map((e) => ({
        type: "execution",
        description: e.category?.slice(0, 100) || "Execution",
        createdAt: e.createdAt,
        organizationName: e.organization.name,
      })),
    };
  }

  /**
   * Disable a user account
   */
  async disableUser(userId: string, adminId: string, reason: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Delete all active sessions
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Mark user as disabled (using email prefix)
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `disabled_${Date.now()}_${user.email}`,
        emailVerified: false,
      },
    });

    await logAdminAction(adminId, "disable_user", {
      userId,
      userEmail: user.email,
      reason,
    });

    logger.info("User disabled", {
      userId,
      adminId,
      reason,
    });
  }

  /**
   * Reset user password (generates reset token)
   */
  async initiatePasswordReset(
    userId: string,
    adminId: string,
  ): Promise<{ resetToken: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Generate reset token (in production, would send email)
    const resetToken = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await logAdminAction(adminId, "initiate_password_reset", {
      userId,
      userEmail: user.email,
    });

    logger.info("Password reset initiated by admin", {
      userId,
      adminId,
    });

    return { resetToken };
  }

  /**
   * Get user session history
   */
  async getSessionHistory(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{
    sessions: Array<{
      id: string;
      createdAt: Date;
      expiresAt: Date;
      organizationId: string;
    }>;
    total: number;
  }> {
    const { limit = 20, offset = 0 } = options;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.session.count({ where: { userId } }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        organizationId: s.organizationId,
      })),
      total,
    };
  }
}

export const adminUsersService = new AdminUsersService();
