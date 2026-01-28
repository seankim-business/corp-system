import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { createAuditLog } from "./audit-logger";
import { Delegation, DelegationScope, checkDelegatedPermission } from "../auth/rbac";

const DELEGATION_CACHE_PREFIX = "delegation";
const DELEGATION_CACHE_TTL_SECONDS = 300;

export interface CreateDelegationInput {
  organizationId: string;
  delegatorId: string;
  delegateeId: string;
  permissions: string[];
  scope?: DelegationScope;
  validFrom: Date;
  validUntil: Date;
  reason: string;
}

export interface RevokeDelegationInput {
  delegationId: string;
  organizationId: string;
  revokedBy: string;
  reason?: string;
}

function mapPrismaDelegation(data: any): Delegation {
  return {
    id: data.id,
    organizationId: data.organizationId,
    delegatorId: data.delegatorId,
    delegateeId: data.delegateeId,
    permissions: data.permissions,
    scope: data.scope as DelegationScope | undefined,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    reason: data.reason,
    createdAt: data.createdAt,
    revokedAt: data.revokedAt || undefined,
    revokedBy: data.revokedBy || undefined,
    revokedReason: data.revokedReason || undefined,
  };
}

export class DelegationService {
  async createDelegation(input: CreateDelegationInput): Promise<Delegation> {
    if (input.delegatorId === input.delegateeId) {
      throw new Error("Cannot delegate permissions to yourself");
    }

    if (input.validFrom >= input.validUntil) {
      throw new Error("validFrom must be before validUntil");
    }

    if (input.validUntil <= new Date()) {
      throw new Error("validUntil must be in the future");
    }

    if (input.permissions.length === 0) {
      throw new Error("At least one permission must be specified");
    }

    const [delegator, delegatee] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.delegatorId,
          },
        },
      }),
      prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.delegateeId,
          },
        },
      }),
    ]);

    if (!delegator) {
      throw new Error("Delegator is not a member of this organization");
    }

    if (!delegatee) {
      throw new Error("Delegatee is not a member of this organization");
    }

    const delegation = await (prisma as any).delegation.create({
      data: {
        organizationId: input.organizationId,
        delegatorId: input.delegatorId,
        delegateeId: input.delegateeId,
        permissions: input.permissions,
        scope: input.scope ? (input.scope as object) : null,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        reason: input.reason,
      },
    });

    await this.invalidateCache(input.organizationId, input.delegateeId);

    await createAuditLog({
      organizationId: input.organizationId,
      action: "delegation.created",
      userId: input.delegatorId,
      resourceType: "Delegation",
      resourceId: delegation.id,
      details: {
        delegateeId: input.delegateeId,
        permissions: input.permissions,
        validFrom: input.validFrom.toISOString(),
        validUntil: input.validUntil.toISOString(),
        scope: input.scope,
        reason: input.reason,
      },
      success: true,
    });

    return mapPrismaDelegation(delegation);
  }

  async revokeDelegation(input: RevokeDelegationInput): Promise<Delegation> {
    const delegation = await (prisma as any).delegation.findFirst({
      where: {
        id: input.delegationId,
        organizationId: input.organizationId,
        revokedAt: null,
      },
    });

    if (!delegation) {
      throw new Error("Delegation not found or already revoked");
    }

    const updated = await (prisma as any).delegation.update({
      where: { id: input.delegationId },
      data: {
        revokedAt: new Date(),
        revokedBy: input.revokedBy,
        revokedReason: input.reason || null,
      },
    });

    await this.invalidateCache(input.organizationId, delegation.delegateeId);

    await createAuditLog({
      organizationId: input.organizationId,
      action: "delegation.revoked",
      userId: input.revokedBy,
      resourceType: "Delegation",
      resourceId: input.delegationId,
      details: {
        delegatorId: delegation.delegatorId,
        delegateeId: delegation.delegateeId,
        permissions: delegation.permissions,
        reason: input.reason,
      },
      success: true,
    });

    return mapPrismaDelegation(updated);
  }

  async getDelegation(organizationId: string, delegationId: string): Promise<Delegation | null> {
    const delegation = await (prisma as any).delegation.findFirst({
      where: {
        id: delegationId,
        organizationId,
      },
    });

    return delegation ? mapPrismaDelegation(delegation) : null;
  }

  async listDelegationsForUser(
    organizationId: string,
    userId: string,
    options?: {
      role?: "delegator" | "delegatee" | "both";
      includeExpired?: boolean;
      includeRevoked?: boolean;
    },
  ): Promise<Delegation[]> {
    const { role = "both", includeExpired = false, includeRevoked = false } = options || {};

    const where: any = {
      organizationId,
    };

    if (role === "delegator") {
      where.delegatorId = userId;
    } else if (role === "delegatee") {
      where.delegateeId = userId;
    } else {
      where.OR = [{ delegatorId: userId }, { delegateeId: userId }];
    }

    if (!includeRevoked) {
      where.revokedAt = null;
    }

    if (!includeExpired) {
      where.validUntil = { gt: new Date() };
    }

    const delegations = await (prisma as any).delegation.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return delegations.map(mapPrismaDelegation);
  }

  async getActiveDelegationsForUser(organizationId: string, userId: string): Promise<Delegation[]> {
    const cacheKey = `${DELEGATION_CACHE_PREFIX}:${organizationId}:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.map((d: any) => ({
          ...d,
          validFrom: new Date(d.validFrom),
          validUntil: new Date(d.validUntil),
          createdAt: new Date(d.createdAt),
          revokedAt: d.revokedAt ? new Date(d.revokedAt) : undefined,
        }));
      }
    } catch (error) {
      logger.warn("Failed to read delegation cache", { error, cacheKey });
    }

    const now = new Date();
    const delegations = await (prisma as any).delegation.findMany({
      where: {
        organizationId,
        delegateeId: userId,
        revokedAt: null,
        validFrom: { lte: now },
        validUntil: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = delegations.map(mapPrismaDelegation);

    try {
      await redis.set(cacheKey, JSON.stringify(result), DELEGATION_CACHE_TTL_SECONDS);
    } catch (error) {
      logger.warn("Failed to write delegation cache", { error, cacheKey });
    }

    return result;
  }

  async checkUserHasDelegatedPermission(
    organizationId: string,
    userId: string,
    permission: string,
    resource?: { type?: string; id?: string; amount?: number },
  ): Promise<{ allowed: boolean; delegation?: Delegation }> {
    const delegations = await this.getActiveDelegationsForUser(organizationId, userId);

    for (const delegation of delegations) {
      if (checkDelegatedPermission(delegation, permission, resource)) {
        return { allowed: true, delegation };
      }
    }

    return { allowed: false };
  }

  async expireStaleDelagations(): Promise<number> {
    const now = new Date();

    const expiredDelegations = await (prisma as any).delegation.findMany({
      where: {
        validUntil: { lte: now },
        revokedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        delegateeId: true,
        delegatorId: true,
        permissions: true,
      },
    });

    if (expiredDelegations.length === 0) {
      return 0;
    }

    for (const delegation of expiredDelegations) {
      await this.invalidateCache(delegation.organizationId, delegation.delegateeId);

      await createAuditLog({
        organizationId: delegation.organizationId,
        action: "delegation.expired",
        resourceType: "Delegation",
        resourceId: delegation.id,
        details: {
          delegatorId: delegation.delegatorId,
          delegateeId: delegation.delegateeId,
          permissions: delegation.permissions,
        },
        success: true,
      });
    }

    logger.info("Expired stale delegations", { count: expiredDelegations.length });

    return expiredDelegations.length;
  }

  private async invalidateCache(organizationId: string, userId: string): Promise<void> {
    const cacheKey = `${DELEGATION_CACHE_PREFIX}:${organizationId}:${userId}`;
    try {
      await redis.del(cacheKey);
    } catch (error) {
      logger.warn("Failed to invalidate delegation cache", { error, cacheKey });
    }
  }
}

export const delegationService = new DelegationService();
