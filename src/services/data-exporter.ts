import { Prisma } from "@prisma/client";
import { db as prisma } from "../db/client";

export class DataExportError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type RedactionRule = {
  pattern: RegExp;
};

const REDACTION_RULES: RedactionRule[] = [
  { pattern: /token/i },
  { pattern: /secret/i },
  { pattern: /password/i },
  { pattern: /apiKey/i },
  { pattern: /key/i },
];

function shouldRedactKey(key: string): boolean {
  return REDACTION_RULES.some((rule) => rule.pattern.test(key));
}

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObject(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    Object.entries(record).forEach(([key, entry]) => {
      if (shouldRedactKey(key)) {
        sanitized[key] = "[REDACTED]";
        return;
      }
      sanitized[key] = sanitizeObject(entry);
    });

    return sanitized;
  }

  return value;
}

function sanitizeUser(user: {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    googleId: user.googleId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function extractResourceIds(
  logs: Array<{ action: string; resourceType: string | null; resourceId: string | null }>,
  actionPrefixes: string[],
  resourceType: string,
): string[] {
  const ids = new Set<string>();

  logs.forEach((log) => {
    const matchesAction = actionPrefixes.some((prefix) => log.action.startsWith(prefix));
    if (!matchesAction) return;
    if (log.resourceType !== resourceType) return;
    if (!log.resourceId) return;
    ids.add(log.resourceId);
  });

  return Array.from(ids);
}

function extractWorkflowIds(
  logs: Array<{ action: string; resourceType: string | null; resourceId: string | null }>,
): string[] {
  const ids = new Set<string>();
  const workflowActions = ["workflow.create", "workflow.update", "workflow.delete"];

  logs.forEach((log) => {
    const matchesAction = workflowActions.includes(log.action);
    if (!matchesAction && log.resourceType !== "workflow") return;
    if (!log.resourceId) return;
    ids.add(log.resourceId);
  });

  return Array.from(ids);
}

export async function exportUserData(userId: string, organizationId: string): Promise<object> {
  return prisma.$transaction(async (tx) => {
    const [user, organization] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.organization.findUnique({ where: { id: organizationId } }),
    ]);

    if (!user) {
      throw new DataExportError("User not found", 404);
    }

    if (!organization) {
      throw new DataExportError("Organization not found", 404);
    }

    const [memberships, sessions, auditLogs] = await Promise.all([
      tx.membership.findMany({
        where: { userId, organizationId },
        orderBy: { createdAt: "desc" },
      }),
      tx.session.findMany({
        where: { userId, organizationId },
        orderBy: { createdAt: "desc" },
      }),
      tx.$queryRaw<
        Array<{
          id: string;
          action: string;
          organizationId: string;
          userId: string | null;
          resourceType: string | null;
          resourceId: string | null;
          details: unknown | null;
          ipAddress: string | null;
          userAgent: string | null;
          success: boolean;
          errorMessage: string | null;
          createdAt: Date;
        }>
      >(Prisma.sql`
        SELECT
          id,
          action,
          organization_id AS "organizationId",
          user_id AS "userId",
          resource_type AS "resourceType",
          resource_id AS "resourceId",
          details,
          ip_address AS "ipAddress",
          user_agent AS "userAgent",
          success,
          error_message AS "errorMessage",
          created_at AS "createdAt"
        FROM audit_logs
        WHERE organization_id = ${organizationId}
          AND user_id = ${userId}
        ORDER BY created_at DESC
      `),
    ]);

    const workflowIds = extractWorkflowIds(
      auditLogs.map((log) => ({
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
      })),
    );

    const workflows = workflowIds.length
      ? await tx.workflow.findMany({
          where: { id: { in: workflowIds }, organizationId },
          orderBy: { updatedAt: "desc" },
        })
      : [];

    const workflowExecutions = workflowIds.length
      ? await tx.workflowExecution.findMany({
          where: { workflowId: { in: workflowIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const mcpConnectionIds = extractResourceIds(
      auditLogs.map((log) => ({
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
      })),
      ["mcp."],
      "mcp_connection",
    );

    const mcpConnections = mcpConnectionIds.length
      ? await tx.mCPConnection.findMany({
          where: { id: { in: mcpConnectionIds }, organizationId },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const featureFlagOverrides = await tx.$queryRaw<
      Array<{
        id: string;
        featureFlagId: string;
        organizationId: string;
        enabled: boolean;
        reason: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        id,
        feature_flag_id AS "featureFlagId",
        organization_id AS "organizationId",
        enabled,
        reason,
        expires_at AS "expiresAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM feature_flag_overrides
      WHERE organization_id = ${organizationId}
      ORDER BY created_at DESC
    `);

    return {
      metadata: {
        exportDate: new Date().toISOString(),
        formatVersion: "1.0",
        userId,
        organizationId,
      },
      user: sanitizeUser(user),
      memberships,
      workflows,
      workflowExecutions,
      sessions: sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        organizationId: session.organizationId,
        source: session.source,
        state: session.state,
        history: session.history,
        metadata: session.metadata,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        updatedAt: session.updatedAt,
      })),
      mcpConnections: mcpConnections.map((connection) => ({
        id: connection.id,
        organizationId: connection.organizationId,
        provider: connection.provider,
        name: connection.name,
        config: sanitizeObject(connection.config),
        enabled: connection.enabled,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      })),
      webhookEndpoints: [],
      featureFlagOverrides,
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.details,
        success: log.success,
        errorMessage: log.errorMessage,
      })),
    };
  });
}
