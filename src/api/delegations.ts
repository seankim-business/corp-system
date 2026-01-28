import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/require-permission";
import { Permission, Role, hasPermission } from "../auth/rbac";
import {
  validate,
  uuidParamSchema,
  createDelegationSchema,
  revokeDelegationSchema,
  listDelegationsQuerySchema,
  CreateDelegationInput,
  RevokeDelegationInput,
  ListDelegationsQuery,
} from "../middleware/validation.middleware";
import { delegationService } from "../services/delegation-service";
import { logger } from "../utils/logger";

const router = Router();

router.post(
  "/delegations",
  requireAuth,
  validate({ body: createDelegationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: delegatorId } = req.user!;
      const { delegateeId, permissions, scope, validFrom, validUntil, reason } =
        req.body as CreateDelegationInput;

      if (delegateeId === delegatorId) {
        return res.status(400).json({ error: "Cannot delegate permissions to yourself" });
      }

      const role = req.membership?.role;
      if (!role) {
        return res.status(403).json({ error: "No membership found" });
      }

      const unauthorizedPermissions = permissions.filter(
        (p) => !hasPermission(role, p as Permission),
      );

      if (unauthorizedPermissions.length > 0) {
        return res.status(403).json({
          error: "Cannot delegate permissions you do not have",
          unauthorizedPermissions,
        });
      }

      const validFromDate = validFrom ? new Date(validFrom) : new Date();
      const validUntilDate = new Date(validUntil);

      const delegation = await delegationService.createDelegation({
        organizationId,
        delegatorId,
        delegateeId,
        permissions,
        scope: scope || undefined,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        reason,
      });

      return res.status(201).json({ delegation });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Create delegation error", { error: message });

      if (
        message.includes("not a member") ||
        message.includes("Cannot delegate") ||
        message.includes("validFrom") ||
        message.includes("validUntil") ||
        message.includes("At least one")
      ) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({ error: "Failed to create delegation" });
    }
  },
);

router.get(
  "/delegations",
  requireAuth,
  validate({ query: listDelegationsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { role, includeExpired, includeRevoked, page, limit } =
        req.query as unknown as ListDelegationsQuery;

      const delegations = await delegationService.listDelegationsForUser(organizationId, userId, {
        role,
        includeExpired,
        includeRevoked,
      });

      const total = delegations.length;
      const startIndex = (page - 1) * limit;
      const paginatedDelegations = delegations.slice(startIndex, startIndex + limit);

      return res.json({
        delegations: paginatedDelegations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error("List delegations error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to fetch delegations" });
    }
  },
);

router.get("/delegations/active", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;

    const delegations = await delegationService.getActiveDelegationsForUser(organizationId, userId);

    return res.json({ delegations });
  } catch (error) {
    logger.error("Get active delegations error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to fetch active delegations" });
  }
});

router.get(
  "/delegations/:id",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const delegationId = String(req.params.id);

      const delegation = await delegationService.getDelegation(organizationId, delegationId);

      if (!delegation) {
        return res.status(404).json({ error: "Delegation not found" });
      }

      if (delegation.delegatorId !== userId && delegation.delegateeId !== userId) {
        const isAdmin = req.membership?.role === Role.ADMIN || req.membership?.role === Role.OWNER;
        if (!isAdmin) {
          return res.status(403).json({ error: "You are not authorized to view this delegation" });
        }
      }

      return res.json({ delegation });
    } catch (error) {
      logger.error("Get delegation error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to fetch delegation" });
    }
  },
);

router.delete(
  "/delegations/:id",
  requireAuth,
  validate({ params: uuidParamSchema, body: revokeDelegationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const delegationId = String(req.params.id);
      const { reason } = (req.body || {}) as RevokeDelegationInput;

      const existingDelegation = await delegationService.getDelegation(
        organizationId,
        delegationId,
      );

      if (!existingDelegation) {
        return res.status(404).json({ error: "Delegation not found" });
      }

      const canRevoke =
        existingDelegation.delegatorId === userId ||
        existingDelegation.delegateeId === userId ||
        req.membership?.role === Role.ADMIN ||
        req.membership?.role === Role.OWNER;

      if (!canRevoke) {
        return res.status(403).json({ error: "You are not authorized to revoke this delegation" });
      }

      const delegation = await delegationService.revokeDelegation({
        delegationId,
        organizationId,
        revokedBy: userId,
        reason: reason || undefined,
      });

      return res.json({ delegation, message: "Delegation revoked successfully" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Revoke delegation error", { error: message });

      if (message.includes("not found") || message.includes("already revoked")) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({ error: "Failed to revoke delegation" });
    }
  },
);

router.post(
  "/delegations/expire-stale",
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const count = await delegationService.expireStaleDelagations();
      return res.json({ message: `Expired ${count} stale delegations`, count });
    } catch (error) {
      logger.error("Expire stale delegations error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to expire stale delegations" });
    }
  },
);

export default router;
