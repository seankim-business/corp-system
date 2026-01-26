import { Prisma } from "@prisma/client";
import { db as prisma } from "../db/client";

export class AccountDeletionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type AuditLogRow = {
  action: string;
  resourceType: string | null;
  resourceId: string | null;
};

function extractWorkflowIds(logs: AuditLogRow[]): string[] {
  const workflowActions = new Set(["workflow.create", "workflow.update", "workflow.delete"]);
  const ids = new Set<string>();

  logs.forEach((log) => {
    if (!log.resourceId) return;
    if (workflowActions.has(log.action) || log.resourceType === "workflow") {
      ids.add(log.resourceId);
    }
  });

  return Array.from(ids);
}

function extractMcpConnectionIds(logs: AuditLogRow[]): string[] {
  const ids = new Set<string>();

  logs.forEach((log) => {
    if (!log.resourceId) return;
    if (log.action.startsWith("mcp.") || log.resourceType === "mcp_connection") {
      ids.add(log.resourceId);
    }
  });

  return Array.from(ids);
}

export async function deleteUserAccount(userId: string, organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [user, organization, membership] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.organization.findUnique({ where: { id: organizationId } }),
      tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      }),
    ]);

    if (!user) {
      throw new AccountDeletionError("User not found", 404);
    }

    if (!organization) {
      throw new AccountDeletionError("Organization not found", 404);
    }

    if (!membership) {
      throw new AccountDeletionError("Membership not found", 404);
    }

    const auditLogs = await tx.$queryRaw<AuditLogRow[]>(Prisma.sql`
      SELECT action, resource_type AS "resourceType", resource_id AS "resourceId"
      FROM audit_logs
      WHERE organization_id = ${organizationId}
        AND user_id = ${userId}
    `);

    const workflowIds = extractWorkflowIds(auditLogs);
    if (workflowIds.length > 0) {
      await tx.workflowExecution.deleteMany({
        where: { workflowId: { in: workflowIds } },
      });
      await tx.workflow.deleteMany({
        where: { id: { in: workflowIds }, organizationId },
      });
    }

    await tx.session.deleteMany({ where: { userId, organizationId } });

    const mcpConnectionIds = extractMcpConnectionIds(auditLogs);
    if (mcpConnectionIds.length > 0) {
      await tx.mCPConnection.deleteMany({
        where: { id: { in: mcpConnectionIds }, organizationId },
      });
    }

    const reasonPatterns = [userId, user.email].filter(
      (pattern): pattern is string => typeof pattern === "string" && pattern.length > 0,
    );

    if (reasonPatterns.length > 0) {
      const reasonConditions = reasonPatterns.map(
        (pattern) => Prisma.sql`reason ILIKE ${`%${pattern}%`}`,
      );

      const combinedCondition = reasonConditions.reduce<Prisma.Sql>(
        (acc, condition, index) => {
          if (index === 0) return condition;
          return Prisma.sql`${acc} OR ${condition}`;
        },
        Prisma.sql``,
      );

      await tx.$executeRaw(Prisma.sql`
        DELETE FROM feature_flag_overrides
        WHERE organization_id = ${organizationId}
          AND (${combinedCondition})
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE audit_logs
      SET user_id = NULL
      WHERE organization_id = ${organizationId}
        AND user_id = ${userId}
    `);

    await tx.membership.deleteMany({ where: { organizationId, userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
