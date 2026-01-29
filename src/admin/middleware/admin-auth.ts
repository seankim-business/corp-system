/**
 * Admin Authentication Middleware
 *
 * Provides authentication and authorization for platform admin routes.
 * Supports both super-admin and org-impersonation modes.
 */

import { Request, Response, NextFunction } from "express";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: "super_admin" | "support" | "analyst";
  permissions: string[];
  impersonatingOrgId?: string;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean);
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "").split(",").filter(Boolean);

/**
 * Check if user is a platform admin
 */
export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email) || SUPER_ADMIN_EMAILS.includes(email);
}

/**
 * Check if user is a super admin
 */
export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email);
}

/**
 * Middleware to require admin authentication
 */
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(user.email)) {
      logger.warn("Non-admin user attempted admin access", {
        userId: user.id,
        email: user.email,
        path: req.path,
      });
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const role = isSuperAdmin(user.email) ? "super_admin" : "support";
    const permissions = getPermissionsForRole(role);

    req.adminUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email,
      role,
      permissions,
    };

    // Check for impersonation header
    const impersonateOrgId = req.headers["x-impersonate-org"] as string;
    if (impersonateOrgId) {
      if (role !== "super_admin") {
        res.status(403).json({ error: "Only super admins can impersonate" });
        return;
      }

      const org = await prisma.organization.findUnique({
        where: { id: impersonateOrgId },
      });

      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      req.adminUser.impersonatingOrgId = impersonateOrgId;
      logger.info("Admin impersonating organization", {
        adminId: user.id,
        orgId: impersonateOrgId,
        orgName: org.name,
      });
    }

    next();
  } catch (error) {
    logger.error("Admin auth error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Middleware to require specific admin permission
 */
export function requireAdminPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    if (!req.adminUser.permissions.includes(permission)) {
      logger.warn("Admin permission denied", {
        adminId: req.adminUser.id,
        permission,
        hasPermissions: req.adminUser.permissions,
      });
      res.status(403).json({ error: `Permission '${permission}' required` });
      return;
    }

    next();
  };
}

/**
 * Get permissions for admin role
 */
function getPermissionsForRole(role: AdminUser["role"]): string[] {
  const basePermissions = ["view:organizations", "view:users", "view:metrics"];

  switch (role) {
    case "super_admin":
      return [
        ...basePermissions,
        "manage:organizations",
        "manage:users",
        "impersonate",
        "suspend:organizations",
        "view:revenue",
        "view:system",
        "manage:system",
      ];
    case "support":
      return [...basePermissions, "view:support", "manage:support"];
    case "analyst":
      return [...basePermissions, "view:revenue"];
    default:
      return basePermissions;
  }
}

/**
 * Admin audit log
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  logger.info("Admin action", {
    adminId,
    action,
    ...details,
    timestamp: new Date().toISOString(),
  });

  // TODO: Store in database for audit trail
}
