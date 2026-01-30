import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';
import { ResolvedPermission, PermissionCheckRequest } from './types';

export class PermissionResolver {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = 'ext:perm:';
  private cacheTTL = 600; // 10 minutes

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  /**
   * Resolve permissions with 5-level hierarchy:
   * 1. Agent-specific (highest priority)
   * 2. Role-based
   * 3. Team-based
   * 4. Organization-wide
   * 5. Global defaults (lowest priority)
   */
  async resolvePermission(request: PermissionCheckRequest): Promise<ResolvedPermission> {
    const cacheKey = this.getCacheKey(request);

    // Check cache first
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    }

    // Resolve from database with hierarchy
    const permission = await this.resolveFromDatabase(request);

    // Cache the result
    if (this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(permission));
    }

    return { ...permission, cached: false };
  }

  private async resolveFromDatabase(request: PermissionCheckRequest): Promise<ResolvedPermission> {
    const { organizationId, extensionId, agentId, roleId } = request;

    // Build OR conditions based on what's provided
    const orConditions: Array<Record<string, string | null>> = [];

    // Agent + extension specific (highest priority)
    if (agentId) {
      orConditions.push({ extensionId, agentId });
    }

    // Role + extension specific
    if (roleId) {
      orConditions.push({ extensionId, roleId, agentId: null });
    }

    // Org-wide for this extension
    orConditions.push({ extensionId, agentId: null, roleId: null });

    // Agent-wide (all extensions for this agent)
    if (agentId) {
      orConditions.push({ extensionId: null, agentId });
    }

    // Role-wide (all extensions for this role)
    if (roleId) {
      orConditions.push({ extensionId: null, roleId, agentId: null });
    }

    // Org defaults (all extensions, all agents)
    orConditions.push({ extensionId: null, agentId: null, roleId: null });

    // Query all applicable permissions in one query
    const permissions = await this.prisma.extensionPermission.findMany({
      where: {
        organizationId,
        OR: orConditions,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply hierarchy: agent > role > team > org > default
    let resolved: ResolvedPermission = this.getDefaultPermission();

    // Check agent + extension specific first
    for (const perm of permissions) {
      if (perm.agentId && perm.agentId === agentId && perm.extensionId === extensionId) {
        resolved = this.mergePermission(perm, 'agent');
        return resolved;
      }
    }

    // Check role + extension specific
    for (const perm of permissions) {
      if (perm.roleId && perm.roleId === roleId && perm.extensionId === extensionId && !perm.agentId) {
        resolved = this.mergePermission(perm, 'role');
        return resolved;
      }
    }

    // Check org-wide for extension
    for (const perm of permissions) {
      if (!perm.agentId && !perm.roleId && perm.extensionId === extensionId) {
        resolved = this.mergePermission(perm, 'org');
        return resolved;
      }
    }

    return resolved;
  }

  private getDefaultPermission(): ResolvedPermission {
    return {
      canExecute: true,
      canConfigure: false,
      canInstall: false,
      allowedTools: [],
      deniedTools: [],
      source: 'default',
      cached: false,
    };
  }

  private mergePermission(
    perm: {
      canExecute: boolean;
      canConfigure: boolean;
      canInstall: boolean;
      allowedTools: string[];
      deniedTools: string[];
    },
    source: ResolvedPermission['source']
  ): ResolvedPermission {
    return {
      canExecute: perm.canExecute,
      canConfigure: perm.canConfigure,
      canInstall: perm.canInstall,
      allowedTools: perm.allowedTools || [],
      deniedTools: perm.deniedTools || [],
      source,
      cached: false,
    };
  }

  /**
   * Check if a specific tool is allowed
   */
  async canUseTool(request: PermissionCheckRequest): Promise<boolean> {
    const permission = await this.resolvePermission(request);

    if (!permission.canExecute) return false;
    if (!request.tool) return true;

    // Check denied list first (explicit deny wins)
    if (permission.deniedTools.includes(request.tool)) return false;
    if (permission.deniedTools.includes('*')) return false;

    // Check allowed list
    if (permission.allowedTools.length === 0) return true; // No restrictions
    if (permission.allowedTools.includes('*')) return true;

    return permission.allowedTools.includes(request.tool);
  }

  /**
   * Invalidate cache for an organization/extension
   */
  async invalidateCache(organizationId: string, extensionId?: string): Promise<void> {
    if (!this.redis) return;

    const pattern = extensionId
      ? `${this.cachePrefix}${organizationId}:${extensionId}:*`
      : `${this.cachePrefix}${organizationId}:*`;

    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info('Permission cache invalidated', { organizationId, extensionId, keysCleared: keys.length });
    }
  }

  private getCacheKey(request: PermissionCheckRequest): string {
    const parts = [
      this.cachePrefix,
      request.organizationId,
      request.extensionId || 'all',
      request.agentId || 'none',
      request.roleId || 'none',
    ];
    return parts.join(':');
  }
}
