import { Request, Response, NextFunction } from "express";
import { Permission, Role, hasPermission, isRoleAtLeast, isValidRole } from "../auth/rbac";
import { logger } from "../utils/logger";
import { delegationService } from "../services/delegation-service";

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

export interface DelegationCheckOptions {
  resourceType?: string;
  resourceIdParam?: string;
  amountField?: string;
}

export function requirePermissionOrDelegation(
  permission: Permission | string,
  options?: DelegationCheckOptions,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership || !req.user || !req.organization) {
      logger.warn("Permission denied: No membership/user/org", {
        userId: req.user?.id,
        permission,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ error: "Forbidden: No membership found" });
    }

    const role = req.membership.role;

    if (hasPermission(role, permission as Permission)) {
      return next();
    }

    try {
      const resource: { type?: string; id?: string; amount?: number } = {};

      if (options?.resourceType) {
        resource.type = options.resourceType;
      }

      if (options?.resourceIdParam && req.params[options.resourceIdParam]) {
        const paramValue = req.params[options.resourceIdParam];
        resource.id = Array.isArray(paramValue) ? paramValue[0] : paramValue;
      }

      if (options?.amountField && req.body?.[options.amountField]) {
        resource.amount = Number(req.body[options.amountField]);
      }

      const delegationCheck = await delegationService.checkUserHasDelegatedPermission(
        req.organization.id,
        req.user.id,
        permission,
        Object.keys(resource).length > 0 ? resource : undefined,
      );

      if (delegationCheck.allowed) {
        (req as any).activeDelegation = delegationCheck.delegation;
        logger.info("Permission granted via delegation", {
          userId: req.user.id,
          organizationId: req.organization.id,
          permission,
          delegationId: delegationCheck.delegation?.id,
          delegatorId: delegationCheck.delegation?.delegatorId,
        });
        return next();
      }
    } catch (error) {
      logger.error("Error checking delegation", {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user.id,
        permission,
      });
    }

    logger.warn("Permission denied: No permission or valid delegation", {
      userId: req.user.id,
      organizationId: req.organization.id,
      role,
      requiredPermission: permission,
      path: req.path,
      method: req.method,
    });

    return res.status(403).json({
      error: "Forbidden: Insufficient permissions",
      required: permission,
      hint: "You may request a delegation from someone with this permission",
    });
  };
}
