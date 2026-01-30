import { PrismaClient, ExtensionPermission } from '@prisma/client';
import { Redis } from 'ioredis';
import { PermissionResolver } from './permission-resolver';
import { ResolvedPermission, PermissionCheckRequest } from './types';
import { logger } from '../../utils/logger';

export interface CreatePermissionInput {
  organizationId: string;
  extensionId?: string;
  agentId?: string;
  roleId?: string;
  canExecute?: boolean;
  canConfigure?: boolean;
  canInstall?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
}

export class PermissionManager {
  private prisma: PrismaClient;
  private resolver: PermissionResolver;

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.resolver = new PermissionResolver(prisma, redis);
  }

  async checkPermission(request: PermissionCheckRequest): Promise<ResolvedPermission> {
    return this.resolver.resolvePermission(request);
  }

  async canExecute(request: PermissionCheckRequest): Promise<boolean> {
    const perm = await this.resolver.resolvePermission(request);
    return perm.canExecute;
  }

  async canUseTool(request: PermissionCheckRequest): Promise<boolean> {
    return this.resolver.canUseTool(request);
  }

  async createPermission(input: CreatePermissionInput): Promise<ExtensionPermission> {
    const permission = await this.prisma.extensionPermission.create({
      data: {
        organizationId: input.organizationId,
        extensionId: input.extensionId,
        agentId: input.agentId,
        roleId: input.roleId,
        canExecute: input.canExecute ?? true,
        canConfigure: input.canConfigure ?? false,
        canInstall: input.canInstall ?? false,
        allowedTools: input.allowedTools ?? [],
        deniedTools: input.deniedTools ?? [],
      },
    });

    await this.resolver.invalidateCache(input.organizationId, input.extensionId);
    logger.info('Permission created', { permissionId: permission.id, organizationId: input.organizationId });

    return permission;
  }

  async updatePermission(
    id: string,
    updates: Partial<Omit<CreatePermissionInput, 'organizationId'>>
  ): Promise<ExtensionPermission> {
    const permission = await this.prisma.extensionPermission.update({
      where: { id },
      data: {
        extensionId: updates.extensionId,
        agentId: updates.agentId,
        roleId: updates.roleId,
        canExecute: updates.canExecute,
        canConfigure: updates.canConfigure,
        canInstall: updates.canInstall,
        allowedTools: updates.allowedTools,
        deniedTools: updates.deniedTools,
      },
    });

    await this.resolver.invalidateCache(permission.organizationId, permission.extensionId || undefined);

    return permission;
  }

  async deletePermission(id: string): Promise<void> {
    const permission = await this.prisma.extensionPermission.delete({
      where: { id },
    });

    await this.resolver.invalidateCache(permission.organizationId, permission.extensionId || undefined);
  }

  async listPermissions(organizationId: string, extensionId?: string): Promise<ExtensionPermission[]> {
    return this.prisma.extensionPermission.findMany({
      where: {
        organizationId,
        ...(extensionId && { extensionId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
