import { db } from "../../db/client";
import { logger } from "../../utils/logger";

export type N8nPermission = "view" | "execute" | "edit";

export interface PermissionCheck {
  userId: string;
  workflowId: string;
  permission: N8nPermission;
}

export interface PermissionGrant {
  workflowId: string;
  agentId?: string;
  roleId?: string;
  canView?: boolean;
  canExecute?: boolean;
  canEdit?: boolean;
}

export class N8nPermissionService {
  async checkPermission(check: PermissionCheck): Promise<boolean> {
    const { userId, workflowId, permission } = check;

    try {
      const workflow = await db.n8nWorkflow.findUnique({
        where: { id: workflowId },
        include: {
          organization: {
            include: {
              memberships: {
                where: { userId },
              },
            },
          },
        },
      });

      if (!workflow) {
        return false;
      }

      const membership = workflow.organization.memberships[0];
      if (!membership) {
        return false;
      }

      if (membership.role === "owner" || membership.role === "admin") {
        return true;
      }

      const rolePermission = await db.n8nWorkflowPermission.findFirst({
        where: {
          workflowId,
          roleId: membership.role,
        },
      });

      if (rolePermission) {
        return this.hasPermission(rolePermission, permission);
      }

      if (permission === "view") {
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Permission check failed", { check, error });
      return false;
    }
  }

  private hasPermission(
    perm: { canView: boolean; canExecute: boolean; canEdit: boolean },
    permission: N8nPermission,
  ): boolean {
    switch (permission) {
      case "view":
        return perm.canView;
      case "execute":
        return perm.canExecute;
      case "edit":
        return perm.canEdit;
      default:
        return false;
    }
  }

  async grantPermission(grant: PermissionGrant): Promise<void> {
    const { workflowId, agentId, roleId, canView, canExecute, canEdit } = grant;

    if (!agentId && !roleId) {
      throw new Error("Either agentId or roleId must be provided");
    }

    const data = {
      workflowId,
      agentId: agentId || null,
      roleId: roleId || null,
      canView: canView ?? true,
      canExecute: canExecute ?? false,
      canEdit: canEdit ?? false,
    };

    if (agentId) {
      await db.n8nWorkflowPermission.upsert({
        where: {
          workflowId_agentId: { workflowId, agentId },
        },
        create: data,
        update: {
          canView: canView ?? undefined,
          canExecute: canExecute ?? undefined,
          canEdit: canEdit ?? undefined,
        },
      });
    } else if (roleId) {
      await db.n8nWorkflowPermission.upsert({
        where: {
          workflowId_roleId: { workflowId, roleId },
        },
        create: data,
        update: {
          canView: canView ?? undefined,
          canExecute: canExecute ?? undefined,
          canEdit: canEdit ?? undefined,
        },
      });
    }

    logger.info("Permission granted", { grant });
  }

  async revokePermission(
    workflowId: string,
    opts: { agentId?: string; roleId?: string },
  ): Promise<void> {
    const { agentId, roleId } = opts;

    if (agentId) {
      await db.n8nWorkflowPermission
        .delete({
          where: {
            workflowId_agentId: { workflowId, agentId },
          },
        })
        .catch(() => {});
    }

    if (roleId) {
      await db.n8nWorkflowPermission
        .delete({
          where: {
            workflowId_roleId: { workflowId, roleId },
          },
        })
        .catch(() => {});
    }

    logger.info("Permission revoked", { workflowId, agentId, roleId });
  }

  async getWorkflowPermissions(workflowId: string) {
    return db.n8nWorkflowPermission.findMany({
      where: { workflowId },
      include: {
        workflow: { select: { name: true } },
      },
    });
  }

  async getAccessibleWorkflows(
    userId: string,
    organizationId: string,
    permission: N8nPermission = "view",
  ) {
    const membership = await db.membership.findFirst({
      where: { userId, organizationId },
    });

    if (!membership) {
      return [];
    }

    if (membership.role === "owner" || membership.role === "admin") {
      return db.n8nWorkflow.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
      });
    }

    const permissionField =
      permission === "view" ? "canView" : permission === "execute" ? "canExecute" : "canEdit";

    const permittedWorkflows = await db.n8nWorkflow.findMany({
      where: {
        organizationId,
        permissions: {
          some: {
            roleId: membership.role,
            [permissionField]: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (permission === "view") {
      const explicitIds = permittedWorkflows.map((w) => w.id);
      const defaultViewable = await db.n8nWorkflow.findMany({
        where: {
          organizationId,
          id: { notIn: explicitIds },
          permissions: { none: {} },
        },
      });
      return [...permittedWorkflows, ...defaultViewable];
    }

    return permittedWorkflows;
  }

  async setupDefaultPermissions(workflowId: string): Promise<void> {
    await Promise.all([
      this.grantPermission({
        workflowId,
        roleId: "admin",
        canView: true,
        canExecute: true,
        canEdit: true,
      }),
      this.grantPermission({
        workflowId,
        roleId: "member",
        canView: true,
        canExecute: true,
        canEdit: false,
      }),
    ]);
  }
}

export const n8nPermissionService = new N8nPermissionService();
