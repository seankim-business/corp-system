import { Request, Response, NextFunction } from "express";
import { Permission, hasPermission } from "../auth/rbac";
import { logger } from "../utils/logger";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      logger.warn("Permission check failed: No membership", {
        userId: req.user?.id,
        permission,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;

    if (!hasPermission(role, permission)) {
      logger.warn("Permission check failed", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermission: permission,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permission,
      });
    }

    return next();
  };
}

export function requireAnyPermission(permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;
    const hasAny = permissions.some((p) => hasPermission(role, p));

    if (!hasAny) {
      logger.warn("Permission check failed (any)", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermissions: permissions,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permissions,
      });
    }

    return next();
  };
}

export function requireAllPermissions(permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;
    const hasAll = permissions.every((p) => hasPermission(role, p));

    if (!hasAll) {
      logger.warn("Permission check failed (all)", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermissions: permissions,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permissions,
      });
    }

    return next();
  };
}
