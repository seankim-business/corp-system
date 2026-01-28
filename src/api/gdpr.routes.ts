import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { auditLogger, AuditAction } from "../services/audit-logger";
import { exportUserData, DataExportError } from "../services/data-exporter";
import { deleteUserAccount, AccountDeletionError } from "../services/account-deletion";
import {
  gdprExportRateLimiter,
  gdprDeleteRateLimiter,
} from "../middleware/rate-limiter.middleware";

const router = Router();

const AUDIT_ACTIONS: AuditAction[] = [
  "user.login",
  "user.logout",
  "user.create",
  "user.update",
  "user.delete",
  "workflow.create",
  "workflow.update",
  "workflow.delete",
  "workflow.execute",
  "mcp.connect",
  "mcp.disconnect",
  "mcp.tool_call",
  "ai.request",
  "ai.response",
  "admin.access",
  "admin.action",
  "api.rate_limited",
  "security.suspicious",
  "data.export",
  "data.import",
];

function isAuditAction(value: string): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

function parseLimit(value: string | undefined, defaultValue: number, max: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, max);
}

function parseOffset(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

router.use(requireAuth);

router.get("/user/data-export", gdprExportRateLimiter, async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  try {
    const organization = await db.organization.findUnique({ where: { id: user.organizationId } });
    if (!organization) return res.status(404).json({ error: "Organization not found" });

    const exportData = await exportUserData(user.id, user.organizationId);

    await auditLogger.log({
      action: "data.export",
      organizationId: user.organizationId,
      userId: user.id,
      resourceType: "user",
      resourceId: user.id,
      details: { reason: "gdpr_data_export" },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
      success: true,
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="user-data-${user.id}-${new Date().toISOString()}.json"`,
    );

    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    if (error instanceof DataExportError) {
      return res.status(error.status).json({ error: error.message });
    }

    await auditLogger.log({
      action: "data.export",
      organizationId: user.organizationId,
      userId: user.id,
      resourceType: "user",
      resourceId: user.id,
      details: { reason: "gdpr_data_export" },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return res.status(500).json({ error: "Failed to export user data" });
  }
});

router.delete("/user/account", gdprDeleteRateLimiter, async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const { confirm, reason } = req.body as { confirm?: boolean; reason?: string };
  if (confirm !== true || !reason) {
    return res
      .status(400)
      .json({ error: "Confirmation required", message: "confirm=true and reason required" });
  }

  try {
    const [organization, membership, adminCount, ownerCount] = await Promise.all([
      db.organization.findUnique({ where: { id: user.organizationId } }),
      db.membership.findUnique({
        where: { organizationId_userId: { organizationId: user.organizationId, userId: user.id } },
      }),
      db.membership.count({
        where: {
          organizationId: user.organizationId,
          role: { in: ["owner", "admin"] },
        },
      }),
      db.membership.count({
        where: {
          organizationId: user.organizationId,
          role: "owner",
        },
      }),
    ]);

    if (!organization) return res.status(404).json({ error: "Organization not found" });
    if (!membership) return res.status(404).json({ error: "Membership not found" });

    if (membership.role === "owner" && ownerCount <= 1) {
      return res.status(403).json({ error: "Owner account cannot be deleted" });
    }

    if ((membership.role === "owner" || membership.role === "admin") && adminCount <= 1) {
      return res.status(403).json({ error: "Last admin cannot delete account" });
    }

    await auditLogger.log({
      action: "user.delete",
      organizationId: user.organizationId,
      userId: user.id,
      resourceType: "user",
      resourceId: user.id,
      details: { reason },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
      success: true,
    });

    await deleteUserAccount(user.id, user.organizationId);

    return res.status(200).json({ success: true, message: "Account deleted" });
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return res.status(error.status).json({ error: error.message });
    }

    await auditLogger.log({
      action: "user.delete",
      organizationId: user.organizationId,
      userId: user.id,
      resourceType: "user",
      resourceId: user.id,
      details: { reason },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return res.status(500).json({ error: "Failed to delete account" });
  }
});

router.get(
  "/audit-logs",
  requirePermission(Permission.AUDIT_READ),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const limit = parseLimit(req.query.limit ? String(req.query.limit) : undefined, 50, 1000);
    const offset = parseOffset(req.query.offset ? String(req.query.offset) : undefined);
    const actionParam = req.query.action ? String(req.query.action) : undefined;
    const action = actionParam && isAuditAction(actionParam) ? actionParam : undefined;

    if (actionParam && !action) {
      return res.status(400).json({ error: "Invalid action filter" });
    }

    const startDate = parseDate(req.query.startDate ? String(req.query.startDate) : undefined);
    const endDate = parseDate(req.query.endDate ? String(req.query.endDate) : undefined);

    if (req.query.startDate && !startDate) {
      return res.status(400).json({ error: "Invalid startDate" });
    }

    if (req.query.endDate && !endDate) {
      return res.status(400).json({ error: "Invalid endDate" });
    }

    const { logs, total } = await auditLogger.query({
      organizationId: user.organizationId,
      userId: user.id,
      action,
      startDate,
      endDate,
      limit,
      offset,
    });

    return res.json({
      total,
      limit,
      offset,
      logs: logs.map((log) => ({
        action: log.action,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.details,
      })),
    });
  },
);

export default router;
