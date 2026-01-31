/**
 * Claude Account Management API Routes
 *
 * Admin-only endpoints for managing Claude API accounts.
 * Provides CRUD operations, health monitoring, quota alerts, and Admin API sync.
 *
 * Endpoints:
 * - GET    /api/admin/accounts - List all accounts with health status
 * - GET    /api/admin/accounts/:id - Get account details
 * - POST   /api/admin/accounts - Register new account
 * - PUT    /api/admin/accounts/:id - Update account
 * - DELETE /api/admin/accounts/:id - Disable account
 * - GET    /api/admin/accounts/:id/health - Get real-time health metrics
 * - GET    /api/admin/accounts/:id/usage - Get usage history
 * - GET    /api/admin/accounts/:id/alerts - Get quota alerts
 * - POST   /api/admin/accounts/:id/sync - Trigger Admin API sync
 * - POST   /api/admin/accounts/:id/reset-circuit - Manually reset circuit breaker
 */

import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../../db/client";
import { requireAuth, requireAdmin } from "../../middleware/auth.middleware";
import { logger } from "../../utils/logger";
import { AccountPoolService } from "../../services/account-pool/account-pool.service";
import { QuotaMonitorService } from "../../services/monitoring/quota-monitor.service";

const router = Router();

// Rate limiter: 100 requests per minute per user
const accountsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many account management requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    const orgId = (req as any).user?.organizationId;
    return userId ? `${orgId}:${userId}` : req.ip || "unknown";
  },
});

// Apply middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);
router.use(accountsRateLimiter);

// Initialize services
const accountPool = new AccountPoolService();
const quotaMonitor = new QuotaMonitorService(process.env.ANTHROPIC_ADMIN_API_KEY || "");

/**
 * Standardized response helpers
 */
function successResponse(data: any) {
  return { success: true, data };
}

function errorResponse(code: string, message: string, details?: any) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Sanitize account data (mask API keys)
 */
function sanitizeAccount(account: any) {
  const { metadata, ...rest } = account;
  return {
    ...rest,
    metadata: {
      ...metadata,
      // Never expose decrypted API keys
      apiKey: metadata?.apiKey ? "***ENCRYPTED***" : undefined,
      apiKeyId: metadata?.apiKeyId,
    },
  };
}

// ============================================================================
// ACCOUNT CRUD ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/accounts
 * List all accounts with health status
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const accounts = await db.claudeAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    const accountsWithHealth = await Promise.all(
      accounts.map(async (account: any) => {
        try {
          const health = await accountPool.getAccountHealth(account.id);
          return {
            ...sanitizeAccount(account),
            health,
          };
        } catch (error) {
          logger.error("Failed to get health for account", {
            accountId: account.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            ...sanitizeAccount(account),
            health: null,
          };
        }
      }),
    );

    return res.json(successResponse(accountsWithHealth));
  } catch (error) {
    logger.error(
      "List accounts error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("LIST_ACCOUNTS_ERROR", "Failed to fetch accounts"));
  }
});

/**
 * GET /api/admin/accounts/:id
 * Get account details
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);

    const account = await db.claudeAccount.findFirst({
      where: {
        id: accountId,
        organizationId,
      },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    const health = await accountPool.getAccountHealth(accountId);

    return res.json(
      successResponse({
        ...sanitizeAccount(account),
        health,
      }),
    );
  } catch (error) {
    logger.error(
      "Get account error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("GET_ACCOUNT_ERROR", "Failed to fetch account"));
  }
});

/**
 * POST /api/admin/accounts
 * Register new account
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { apiKey, name, tier, metadata } = req.body;

    // Validate required fields
    if (!apiKey || !name || !tier) {
      return res.status(400).json(
        errorResponse("VALIDATION_ERROR", "Missing required fields: apiKey, name, tier", {
          required: ["apiKey", "name", "tier"],
        }),
      );
    }

    // Validate tier
    const validTiers = ["tier1", "tier2", "tier3", "tier4"];
    if (!validTiers.includes(tier)) {
      return res.status(400).json(
        errorResponse("VALIDATION_ERROR", "Invalid tier", {
          validTiers,
          provided: tier,
        }),
      );
    }

    // Register account
    const account = await accountPool.registerAccount({
      organizationId,
      name,
      apiKey,
      tier,
      metadata: metadata || {},
    });

    logger.info("Account registered", {
      accountId: account.id,
      organizationId,
      name,
      tier,
    });

    return res.status(201).json(successResponse(sanitizeAccount(account)));
  } catch (error) {
    logger.error(
      "Register account error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    // Handle duplicate name error
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return res
        .status(409)
        .json(errorResponse("DUPLICATE_ACCOUNT", "Account with this name already exists"));
    }

    return res
      .status(500)
      .json(errorResponse("REGISTER_ACCOUNT_ERROR", "Failed to register account"));
  }
});

/**
 * PUT /api/admin/accounts/:id
 * Update account (priority, tags, limits)
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);
    const { name, status, metadata } = req.body;

    const existing = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!existing) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    // Validate status if provided
    if (status && !["active", "disabled", "exhausted"].includes(status)) {
      return res.status(400).json(
        errorResponse("VALIDATION_ERROR", "Invalid status", {
          validStatuses: ["active", "disabled", "exhausted"],
          provided: status,
        }),
      );
    }

    const updated = await db.claudeAccount.update({
      where: { id: accountId },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(metadata && {
          metadata: {
            ...(existing.metadata as object),
            ...metadata,
          },
        }),
      },
    });

    logger.info("Account updated", {
      accountId,
      organizationId,
      changes: { name, status, metadata },
    });

    return res.json(successResponse(sanitizeAccount(updated)));
  } catch (error) {
    logger.error(
      "Update account error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("UPDATE_ACCOUNT_ERROR", "Failed to update account"));
  }
});

/**
 * DELETE /api/admin/accounts/:id
 * Disable account (soft delete)
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);

    const existing = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!existing) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    await db.claudeAccount.update({
      where: { id: accountId },
      data: { status: "disabled" },
    });

    logger.info("Account disabled", {
      accountId,
      organizationId,
    });

    return res.json(successResponse({ id: accountId, status: "disabled" }));
  } catch (error) {
    logger.error(
      "Delete account error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("DELETE_ACCOUNT_ERROR", "Failed to disable account"));
  }
});

// ============================================================================
// HEALTH & MONITORING ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/accounts/:id/health
 * Get real-time health metrics
 */
router.get("/:id/health", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);

    const account = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    const health = await accountPool.getAccountHealth(accountId);

    return res.json(successResponse(health));
  } catch (error) {
    logger.error(
      "Get health error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res
      .status(500)
      .json(errorResponse("GET_HEALTH_ERROR", "Failed to fetch health metrics"));
  }
});

/**
 * GET /api/admin/accounts/:id/usage
 * Get usage history (last 24h/7d/30d)
 */
router.get("/:id/usage", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);
    const period = (req.query.period as string) || "24h";

    const account = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    // Calculate time range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return res.status(400).json(
          errorResponse("VALIDATION_ERROR", "Invalid period", {
            validPeriods: ["24h", "7d", "30d"],
            provided: period,
          }),
        );
    }

    // Get usage from metadata (simplified - in production, query time-series data)
    const metadata = account.metadata as any;
    const usage = {
      period,
      startDate,
      endDate: now,
      requests: metadata?.currentMonthRequests || 0,
      tokens: metadata?.currentMonthTokens || 0,
      estimatedCost: ((metadata?.currentMonthTokens || 0) / 1000000) * 3.0, // $3 per million tokens (example)
      lastSyncedAt: metadata?.lastSyncedAt || null,
    };

    return res.json(successResponse(usage));
  } catch (error) {
    logger.error(
      "Get usage error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("GET_USAGE_ERROR", "Failed to fetch usage history"));
  }
});

/**
 * GET /api/admin/accounts/:id/alerts
 * Get quota alerts
 */
router.get("/:id/alerts", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);
    const includeResolved = req.query.includeResolved === "true";

    const account = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    const alerts = includeResolved
      ? await quotaMonitor.getAllAlerts(accountId)
      : await quotaMonitor.getUnresolvedAlerts(accountId);

    return res.json(successResponse(alerts));
  } catch (error) {
    logger.error(
      "Get alerts error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("GET_ALERTS_ERROR", "Failed to fetch alerts"));
  }
});

/**
 * POST /api/admin/accounts/:id/sync
 * Trigger Admin API sync
 */
router.post("/:id/sync", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);

    const account = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    await quotaMonitor.syncUsageFromAdminAPI(accountId);
    await quotaMonitor.checkThresholds(accountId);

    const updated = await db.claudeAccount.findUnique({
      where: { id: accountId },
    });

    logger.info("Account synced", {
      accountId,
      organizationId,
    });

    return res.json(successResponse(sanitizeAccount(updated)));
  } catch (error) {
    logger.error(
      "Sync account error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json(errorResponse("SYNC_ERROR", "Failed to sync account"));
  }
});

/**
 * POST /api/admin/accounts/:id/reset-circuit
 * Manually reset circuit breaker
 */
router.post("/:id/reset-circuit", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const accountId = String(req.params.id);

    const account = await db.claudeAccount.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!account) {
      return res.status(404).json(errorResponse("ACCOUNT_NOT_FOUND", "Account not found"));
    }

    await db.claudeAccount.update({
      where: { id: accountId },
      data: {
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        status: "active",
      },
    });

    logger.info("Circuit breaker reset", {
      accountId,
      organizationId,
      adminUserId: req.user!.id,
    });

    return res.json(successResponse({ id: accountId, circuitState: "CLOSED" }));
  } catch (error) {
    logger.error(
      "Reset circuit error",
      { accountId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res
      .status(500)
      .json(errorResponse("RESET_CIRCUIT_ERROR", "Failed to reset circuit breaker"));
  }
});

export default router;
