/**
 * Mega App Permission Service
 *
 * Manages module-level permissions for users and roles.
 * Permission resolution order:
 * 1. Check ModulePermission for specific user (userId)
 * 2. Check ModulePermission for user's MegaAppRole (via Membership.megaAppRoleId)
 * 3. Fall back to MegaAppRole.defaultPermissions
 * 4. Deny if no permission found
 */
import { PrismaClient, Prisma, ModulePermission, MegaAppRole, Membership } from "@prisma/client";
import { Redis } from "ioredis";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";

export type PermissionAction =
  | "view"
  | "execute"
  | "create"
  | "approve"
  | "configure"
  | "delete";

export type DataScope = "own" | "team" | "all";

export interface ModulePermissions {
  canView: boolean;
  canExecute: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  canDelete: boolean;
  dataScope: DataScope;
}

export interface RoleDefinition {
  name: string;
  description?: string;
  defaultPermissions: Record<string, ModulePermissions>;
}

export interface PermissionOverride {
  moduleId: string;
  permissions: Partial<ModulePermissions>;
}

export class PermissionService {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = "mega:perm:";
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  private getCacheKey(orgId: string, suffix: string): string {
    return `${this.cachePrefix}${orgId}:${suffix}`;
  }

  private getDefaultPermissions(): ModulePermissions {
    return {
      canView: false,
      canExecute: false,
      canCreate: false,
      canApprove: false,
      canConfigure: false,
      canDelete: false,
      dataScope: "own" as DataScope,
    };
  }

  /**
   * Check if a user has a specific permission on a module
   */
  async checkPermission(
    orgId: string,
    userId: string,
    moduleId: string,
    action: PermissionAction
  ): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(orgId, userId, moduleId);

    switch (action) {
      case "view":
        return permissions.canView;
      case "execute":
        return permissions.canExecute;
      case "create":
        return permissions.canCreate;
      case "approve":
        return permissions.canApprove;
      case "configure":
        return permissions.canConfigure;
      case "delete":
        return permissions.canDelete;
      default:
        return false;
    }
  }

  /**
   * Get effective permissions for a user on a module
   * Resolves permission hierarchy: user override > role permission > role default
   */
  async getEffectivePermissions(
    orgId: string,
    userId: string,
    moduleId: string
  ): Promise<ModulePermissions> {
    const cacheKey = this.getCacheKey(orgId, `eff:${userId}:${moduleId}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // 1. Check for user-specific override
    const userOverride = await this.prisma.modulePermission.findFirst({
      where: {
        organizationId: orgId,
        moduleId,
        userId,
      },
    });

    if (userOverride) {
      const permissions = this.mapPermissionRecord(userOverride);
      if (this.redis) {
        await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(permissions));
      }
      return permissions;
    }

    // 2. Get user's membership to find their MegaAppRole
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId,
      },
      include: {
        megaAppRole: true,
      },
    });

    if (!membership) {
      // User is not a member of this org
      return this.getDefaultPermissions();
    }

    // Check if user is org owner/admin - they get all permissions
    if (membership.role === "owner" || membership.role === "admin") {
      const fullPermissions: ModulePermissions = {
        canView: true,
        canExecute: true,
        canCreate: true,
        canApprove: true,
        canConfigure: true,
        canDelete: true,
        dataScope: "all",
      };
      if (this.redis) {
        await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(fullPermissions));
      }
      return fullPermissions;
    }

    if (!membership.megaAppRole) {
      // User has no MegaAppRole assigned
      return this.getDefaultPermissions();
    }

    // 3. Check for role-specific permission on this module
    const rolePermission = await this.prisma.modulePermission.findFirst({
      where: {
        organizationId: orgId,
        moduleId,
        megaAppRoleId: membership.megaAppRole.id,
      },
    });

    if (rolePermission) {
      const permissions = this.mapPermissionRecord(rolePermission);
      if (this.redis) {
        await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(permissions));
      }
      return permissions;
    }

    // 4. Fall back to role's default permissions
    const defaultPerms = (membership.megaAppRole.defaultPermissions as unknown) as Record<
      string,
      ModulePermissions
    >;

    // Check for wildcard (*) or specific module in defaults
    const permissions = defaultPerms[moduleId] || defaultPerms["*"] || this.getDefaultPermissions();

    if (this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(permissions));
    }

    return permissions;
  }

  /**
   * Get data scope for a user on a module
   */
  async getDataScope(
    orgId: string,
    userId: string,
    moduleId: string
  ): Promise<DataScope> {
    const permissions = await this.getEffectivePermissions(orgId, userId, moduleId);
    return permissions.dataScope;
  }

  /**
   * Create a new role
   */
  async createRole(
    orgId: string,
    definition: RoleDefinition
  ): Promise<MegaAppRole> {
    const role = await this.prisma.megaAppRole.create({
      data: {
        organizationId: orgId,
        name: definition.name,
        description: definition.description,
        defaultPermissions: definition.defaultPermissions as unknown as Prisma.InputJsonValue,
      },
    });

    await this.invalidateCache(orgId);
    logger.info(`Created MegaApp role: ${definition.name}`, { orgId, roleId: role.id });

    return role;
  }

  /**
   * Update a role
   */
  async updateRole(
    roleId: string,
    updates: Partial<RoleDefinition>
  ): Promise<MegaAppRole> {
    const role = await this.prisma.megaAppRole.update({
      where: { id: roleId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.defaultPermissions && { defaultPermissions: updates.defaultPermissions as unknown as Prisma.InputJsonValue }),
      },
    });

    await this.invalidateCache(role.organizationId);
    return role;
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: string): Promise<void> {
    const role = await this.prisma.megaAppRole.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }

    // Check if any users are assigned to this role
    const usersWithRole = await this.prisma.membership.count({
      where: { megaAppRoleId: roleId },
    });

    if (usersWithRole > 0) {
      throw new Error(
        `Cannot delete role: ${usersWithRole} users are still assigned to it`
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete module permissions for this role
      await tx.modulePermission.deleteMany({
        where: { megaAppRoleId: roleId },
      });
      // Delete the role
      await tx.megaAppRole.delete({
        where: { id: roleId },
      });
    });

    await this.invalidateCache(role.organizationId);
    logger.info(`Deleted MegaApp role: ${role.name}`, { roleId });
  }

  /**
   * Assign a role to a user
   */
  async assignRole(
    orgId: string,
    userId: string,
    roleId: string
  ): Promise<Membership> {
    const membership = await this.prisma.membership.update({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
      data: {
        megaAppRoleId: roleId,
      },
    });

    await this.invalidateCache(orgId);
    logger.info(`Assigned role ${roleId} to user ${userId}`, { orgId });

    return membership;
  }

  /**
   * Remove role from a user
   */
  async removeRole(orgId: string, userId: string): Promise<Membership> {
    const membership = await this.prisma.membership.update({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
      data: {
        megaAppRoleId: null,
      },
    });

    await this.invalidateCache(orgId);
    return membership;
  }

  /**
   * Set user-specific permission override
   */
  async setUserPermission(
    orgId: string,
    userId: string,
    moduleId: string,
    permissions: Partial<ModulePermissions>
  ): Promise<ModulePermission> {
    const perm = await this.prisma.modulePermission.upsert({
      where: {
        organizationId_moduleId_userId: {
          organizationId: orgId,
          moduleId,
          userId,
        },
      },
      create: {
        organizationId: orgId,
        moduleId,
        userId,
        canView: permissions.canView ?? false,
        canExecute: permissions.canExecute ?? false,
        canCreate: permissions.canCreate ?? false,
        canApprove: permissions.canApprove ?? false,
        canConfigure: permissions.canConfigure ?? false,
        canDelete: permissions.canDelete ?? false,
        dataScope: permissions.dataScope ?? "own",
      },
      update: {
        ...(permissions.canView !== undefined && { canView: permissions.canView }),
        ...(permissions.canExecute !== undefined && { canExecute: permissions.canExecute }),
        ...(permissions.canCreate !== undefined && { canCreate: permissions.canCreate }),
        ...(permissions.canApprove !== undefined && { canApprove: permissions.canApprove }),
        ...(permissions.canConfigure !== undefined && { canConfigure: permissions.canConfigure }),
        ...(permissions.canDelete !== undefined && { canDelete: permissions.canDelete }),
        ...(permissions.dataScope !== undefined && { dataScope: permissions.dataScope }),
      },
    });

    await this.invalidateCache(orgId);
    return perm;
  }

  /**
   * Remove user-specific permission override
   */
  async removeUserPermission(
    orgId: string,
    userId: string,
    moduleId: string
  ): Promise<void> {
    await this.prisma.modulePermission.deleteMany({
      where: {
        organizationId: orgId,
        moduleId,
        userId,
      },
    });

    await this.invalidateCache(orgId);
  }

  /**
   * List all roles for an organization
   */
  async listRoles(orgId: string): Promise<MegaAppRole[]> {
    return this.prisma.megaAppRole.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Get a role by ID
   */
  async getRole(roleId: string): Promise<MegaAppRole | null> {
    return this.prisma.megaAppRole.findUnique({
      where: { id: roleId },
    });
  }

  /**
   * Get all permissions for a user across all modules
   */
  async getAllPermissionsForUser(
    orgId: string,
    userId: string
  ): Promise<Record<string, ModulePermissions>> {
    // Get all modules
    const modules = await this.prisma.megaAppModule.findMany({
      where: { organizationId: orgId, enabled: true },
      select: { id: true },
    });

    const permissions: Record<string, ModulePermissions> = {};

    for (const module of modules) {
      permissions[module.id] = await this.getEffectivePermissions(
        orgId,
        userId,
        module.id
      );
    }

    return permissions;
  }

  private mapPermissionRecord(record: ModulePermission): ModulePermissions {
    return {
      canView: record.canView,
      canExecute: record.canExecute,
      canCreate: record.canCreate,
      canApprove: record.canApprove,
      canConfigure: record.canConfigure,
      canDelete: record.canDelete,
      dataScope: record.dataScope as DataScope,
    };
  }

  /**
   * Invalidate cache for an organization
   */
  async invalidateCache(orgId: string): Promise<void> {
    if (!this.redis) return;

    const pattern = this.getCacheKey(orgId, "*");
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Singleton instance
let serviceInstance: PermissionService | null = null;

export function getPermissionService(
  prisma?: PrismaClient,
  redis?: Redis
): PermissionService {
  if (!serviceInstance) {
    serviceInstance = new PermissionService(prisma || db, redis);
  }
  return serviceInstance;
}
