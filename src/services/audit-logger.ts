import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "workflow.create"
  | "workflow.update"
  | "workflow.delete"
  | "workflow.execute"
  | "mcp.connect"
  | "mcp.disconnect"
  | "mcp.tool_call"
  | "ai.request"
  | "ai.response"
  | "admin.access"
  | "admin.action"
  | "api.rate_limited"
  | "security.suspicious"
  | "data.export"
  | "data.import"
  | "approval.created"
  | "approval.approved"
  | "approval.rejected"
  | "approval.expired"
  | "delegation.created"
  | "delegation.revoked"
  | "delegation.expired"
  | "agent.permission_denied"
  | "agent.approval_required"
  | "workflow.exception"
  | "schedule.created"
  | "schedule.updated"
  | "schedule.deleted";

export interface AuditLogEntry {
  id?: string;
  timestamp: number;
  action: AuditAction;
  organizationId: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

const AUDIT_RETENTION_DAYS = 2555;
const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

class AuditLogger {
  private buffer: AuditLogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  async log(entry: Omit<AuditLogEntry, "timestamp" | "id">): Promise<void> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.buffer.push(fullEntry);

    await this.logToRedis(fullEntry);

    if (this.buffer.length >= BATCH_SIZE) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private async logToRedis(entry: AuditLogEntry): Promise<void> {
    try {
      const key = `audit:${entry.organizationId}:${new Date().toISOString().split("T")[0]}`;
      await redis.lpush(key, JSON.stringify(entry));
      await redis.expire(key, AUDIT_RETENTION_DAYS * 24 * 60 * 60);
    } catch (error) {
      logger.error("Failed to write audit log to Redis", { error });
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await (prisma as any).auditLog.createMany({
        data: entries.map((e) => ({
          action: e.action,
          organizationId: e.organizationId,
          userId: e.userId,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          details: e.details as any,
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
          success: e.success,
          errorMessage: e.errorMessage,
          createdAt: new Date(e.timestamp),
        })),
      });
    } catch (error) {
      logger.error("Failed to flush audit logs to database", { error, count: entries.length });
      this.buffer.push(...entries);
    }
  }

  async query(params: {
    organizationId: string;
    action?: AuditAction;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const where: any = {
      organizationId: params.organizationId,
    };

    if (params.action) where.action = params.action;
    if (params.userId) where.userId = params.userId;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = params.startDate;
      if (params.endDate) where.createdAt.lte = params.endDate;
    }

    const [logs, total] = await Promise.all([
      (prisma as any).auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params.limit || 50,
        skip: params.offset || 0,
      }),
      (prisma as any).auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log: any) => ({
        id: log.id,
        timestamp: log.createdAt.getTime(),
        action: log.action as AuditAction,
        organizationId: log.organizationId,
        userId: log.userId || undefined,
        resourceType: log.resourceType || undefined,
        resourceId: log.resourceId || undefined,
        details: (log.details as Record<string, any>) || undefined,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        success: log.success,
        errorMessage: log.errorMessage || undefined,
      })),
      total,
    };
  }

  async getRecentFromRedis(
    organizationId: string,
    date?: string,
    limit = 100,
  ): Promise<AuditLogEntry[]> {
    const key = `audit:${organizationId}:${date || new Date().toISOString().split("T")[0]}`;
    const entries = await redis.lrange(key, 0, limit - 1);
    return entries.map((e) => JSON.parse(e));
  }

  async getStats(
    organizationId: string,
    days = 7,
  ): Promise<{
    totalActions: number;
    actionCounts: Record<string, number>;
    successRate: number;
    topUsers: Array<{ userId: string; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await (prisma as any).auditLog.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate },
      },
      select: {
        action: true,
        userId: true,
        success: true,
      },
    });

    const actionCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    let successCount = 0;

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      if (log.userId) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }
      if (log.success) successCount++;
    }

    const topUsers = Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    return {
      totalActions: logs.length,
      actionCounts,
      successRate: logs.length > 0 ? successCount / logs.length : 1,
      topUsers,
    };
  }

  async cleanup(retentionDays = AUDIT_RETENTION_DAYS): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await (prisma as any).auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    logger.info("Audit log cleanup completed", { deleted: result.count, retentionDays });
    return result.count;
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down audit logger", { pendingEntries: this.buffer.length });
    await this.flush();
  }
}

export const auditLogger = new AuditLogger();

export function createAuditMiddleware() {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalEnd = res.end;

    res.end = function (chunk: any, ...args: any[]) {
      const duration = Date.now() - startTime;
      const user = req.user;

      if (user?.organizationId) {
        auditLogger.log({
          action: getActionFromRequest(req),
          organizationId: user.organizationId,
          userId: user.id,
          resourceType: getResourceType(req.path),
          resourceId: req.params?.id,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
          },
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get("user-agent"),
          success: res.statusCode < 400,
          errorMessage: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
        });
      }

      return originalEnd.call(this, chunk, ...args);
    };

    next();
  };
}

function getActionFromRequest(req: any): AuditAction {
  const method = req.method;
  const path = req.path;

  if (path.includes("/auth/login")) return "user.login";
  if (path.includes("/auth/logout")) return "user.logout";
  if (path.includes("/workflows")) {
    if (path.includes("/execute")) return "workflow.execute";
    if (method === "POST") return "workflow.create";
    if (method === "PUT" || method === "PATCH") return "workflow.update";
    if (method === "DELETE") return "workflow.delete";
  }
  if (path.includes("/admin")) return "admin.access";
  if (path.includes("/mcp")) return "mcp.tool_call";

  return "admin.action";
}

function getResourceType(path: string): string {
  if (path.includes("/workflows")) return "workflow";
  if (path.includes("/users")) return "user";
  if (path.includes("/mcp")) return "mcp_connection";
  if (path.includes("/executions")) return "execution";
  if (path.includes("/approvals")) return "approval";
  return "unknown";
}

export async function createAuditLog(params: {
  organizationId: string;
  action: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}): Promise<void> {
  await auditLogger.log({
    action: params.action as AuditAction,
    organizationId: params.organizationId,
    userId: params.userId,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: params.details,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: params.success ?? true,
    errorMessage: params.errorMessage,
  });
}
