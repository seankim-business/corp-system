import { Request, Response, NextFunction } from "express";
import { Permission, Role, hasPermission, isRoleAtLeast, isValidRole } from "../auth/rbac";
import { logger } from "../utils/logger";

export function requirePermission(permission: Permission | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      logger.warn("Permission denied: No membership", {
        userId: req.user?.id,
        permission,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;

    if (!hasPermission(role, permission as Permission)) {
      logger.warn("Permission denied: Insufficient permissions", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermission: permission,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permission,
      });
    }

    return next();
  };
}

export function requireAnyPermission(permissions: (Permission | string)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      logger.warn("Permission denied: No membership", {
        userId: req.user?.id,
        permissions,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;
    const hasAny = permissions.some((p) => hasPermission(role, p as Permission));

    if (!hasAny) {
      logger.warn("Permission denied: Insufficient permissions (any)", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermissions: permissions,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permissions,
      });
    }

    return next();
  };
}

export function requireAllPermissions(permissions: (Permission | string)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      logger.warn("Permission denied: No membership", {
        userId: req.user?.id,
        permissions,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;
    const hasAll = permissions.every((p) => hasPermission(role, p as Permission));

    if (!hasAll) {
      logger.warn("Permission denied: Insufficient permissions (all)", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        role,
        requiredPermissions: permissions,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient permissions",
        required: permissions,
      });
    }

    return next();
  };
}

export function requireRole(minimumRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      logger.warn("Role check denied: No membership", {
        userId: req.user?.id,
        minimumRole,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;

    if (!isValidRole(role) || !isRoleAtLeast(role, minimumRole)) {
      logger.warn("Role check denied: Insufficient role", {
        userId: req.user?.id,
        organizationId: req.organization?.id,
        currentRole: role,
        minimumRole,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({
        error: "Forbidden: Insufficient role",
        required: minimumRole,
      });
    }

    return next();
  };
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.membership) {
    logger.warn("Owner check denied: No membership", {
      userId: req.user?.id,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ error: "Forbidden: No membership found" });
  }

  if (req.membership.role !== Role.OWNER) {
    logger.warn("Owner check denied: Not owner", {
      userId: req.user?.id,
      organizationId: req.organization?.id,
      role: req.membership.role,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ error: "Forbidden: Owner role required" });
  }

  return next();
}
