import { Router } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { encryptToString } from "../services/encryption.service";

const router = Router();

interface CreateAccountBody {
  nickname: string;
  email: string;
  priority?: number;
  credentials?: {
    sessionToken?: string;
    cookieData?: string;
  };
}

interface UpdateAccountBody {
  nickname?: string;
  email?: string;
  status?: string;
  priority?: number;
  credentials?: {
    sessionToken?: string;
    cookieData?: string;
  };
}

/**
 * GET /api/claude-max-accounts
 * List all Claude Max accounts for the organization
 */
router.get("/claude-max-accounts", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const accounts = await db.claudeMaxAccount.findMany({
      where: { organizationId: req.organization.id },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        nickname: true,
        email: true,
        status: true,
        estimatedUsagePercent: true,
        lastUsageUpdateAt: true,
        estimatedResetAt: true,
        currentSessionId: true,
        lastActiveAt: true,
        consecutiveRateLimits: true,
        lastRateLimitAt: true,
        cooldownUntil: true,
        priority: true,
        credentialRef: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Calculate pool summary
    const poolSummary = {
      total: accounts.length,
      active: accounts.filter((a) => a.status === "active").length,
      rateLimited: accounts.filter((a) => a.status === "rate_limited").length,
      exhausted: accounts.filter((a) => a.status === "exhausted").length,
      cooldown: accounts.filter((a) => a.status === "cooldown").length,
      averageUsage:
        accounts.length > 0
          ? accounts.reduce((sum, a) => sum + a.estimatedUsagePercent, 0) / accounts.length
          : 0,
    };

    return res.json({
      accounts: accounts.map((a) => ({
        ...a,
        hasCredentials: !!a.credentialRef,
        credentialRef: undefined, // Don't expose credential reference
      })),
      summary: poolSummary,
    });
  } catch (error) {
    logger.error("Failed to list Claude Max accounts", {}, error as Error);
    return res.status(500).json({ error: "Failed to list accounts" });
  }
});

/**
 * GET /api/claude-max-accounts/:id
 * Get a single Claude Max account
 */
router.get("/claude-max-accounts/:id", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const account = await db.claudeMaxAccount.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organization.id,
      },
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      ...account,
      hasCredentials: !!account.credentialRef,
      credentialRef: undefined,
    });
  } catch (error) {
    logger.error("Failed to get Claude Max account", { id: req.params.id }, error as Error);
    return res.status(500).json({ error: "Failed to get account" });
  }
});

/**
 * POST /api/claude-max-accounts
 * Create a new Claude Max account
 */
router.post("/claude-max-accounts", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const body = req.body as CreateAccountBody;

    // Validate required fields
    if (!body.nickname || !body.email) {
      return res.status(400).json({ error: "nickname and email are required" });
    }

    // Check for duplicates
    const existing = await db.claudeMaxAccount.findFirst({
      where: {
        organizationId: req.organization.id,
        OR: [{ nickname: body.nickname }, { email: body.email }],
      },
    });

    if (existing) {
      return res.status(409).json({
        error:
          existing.nickname === body.nickname
            ? "Nickname already exists"
            : "Email already registered",
      });
    }

    let credentialRef: string | null = null;
    if (body.credentials) {
      const encryptedData = encryptToString(JSON.stringify(body.credentials));
      credentialRef = `enc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await db.claudeMaxAccount.create({
        data: {
          organizationId: req.organization.id,
          nickname: body.nickname,
          email: body.email,
          priority: body.priority ?? 100,
          credentialRef,
          metadata: { encryptedCredentials: encryptedData } as Prisma.InputJsonValue,
        },
      });
    } else {
      await db.claudeMaxAccount.create({
        data: {
          organizationId: req.organization.id,
          nickname: body.nickname,
          email: body.email,
          priority: body.priority ?? 100,
        },
      });
    }

    const account = await db.claudeMaxAccount.findFirst({
      where: {
        organizationId: req.organization.id,
        nickname: body.nickname,
      },
    });

    logger.info("Created Claude Max account", {
      organizationId: req.organization.id,
      accountId: account?.id,
      nickname: body.nickname,
    });

    return res.status(201).json({
      ...account,
      hasCredentials: !!credentialRef,
      credentialRef: undefined,
      metadata: undefined,
    });
  } catch (error) {
    logger.error("Failed to create Claude Max account", {}, error as Error);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * PATCH /api/claude-max-accounts/:id
 * Update a Claude Max account
 */
router.patch("/claude-max-accounts/:id", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const body = req.body as UpdateAccountBody;

    // Check if account exists
    const existing = await db.claudeMaxAccount.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organization.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Check for nickname/email conflicts
    if (body.nickname || body.email) {
      const conflict = await db.claudeMaxAccount.findFirst({
        where: {
          organizationId: req.organization.id,
          id: { not: req.params.id },
          OR: [
            body.nickname ? { nickname: body.nickname } : {},
            body.email ? { email: body.email } : {},
          ].filter((o) => Object.keys(o).length > 0),
        },
      });

      if (conflict) {
        return res.status(409).json({
          error:
            conflict.nickname === body.nickname
              ? "Nickname already exists"
              : "Email already registered",
        });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (body.nickname) updateData.nickname = body.nickname;
    if (body.email) updateData.email = body.email;
    if (body.status) updateData.status = body.status;
    if (body.priority !== undefined) updateData.priority = body.priority;

    if (body.credentials) {
      const encryptedData = encryptToString(JSON.stringify(body.credentials));
      const credentialRef = `enc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      updateData.credentialRef = credentialRef;
      updateData.metadata = {
        ...((existing.metadata as any) || {}),
        encryptedCredentials: encryptedData,
      };
    }

    const account = await db.claudeMaxAccount.update({
      where: { id: req.params.id },
      data: updateData,
    });

    logger.info("Updated Claude Max account", {
      organizationId: req.organization.id,
      accountId: req.params.id,
    });

    return res.json({
      ...account,
      hasCredentials: !!account.credentialRef,
      credentialRef: undefined,
      metadata: undefined,
    });
  } catch (error) {
    logger.error("Failed to update Claude Max account", { id: req.params.id }, error as Error);
    return res.status(500).json({ error: "Failed to update account" });
  }
});

/**
 * DELETE /api/claude-max-accounts/:id
 * Delete a Claude Max account
 */
router.delete("/claude-max-accounts/:id", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    // Check if account exists
    const existing = await db.claudeMaxAccount.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organization.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    await db.claudeMaxAccount.delete({
      where: { id: req.params.id },
    });

    logger.info("Deleted Claude Max account", {
      organizationId: req.organization.id,
      accountId: req.params.id,
      nickname: existing.nickname,
    });

    return res.json({ success: true, deletedId: req.params.id });
  } catch (error) {
    logger.error("Failed to delete Claude Max account", { id: req.params.id }, error as Error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

/**
 * POST /api/claude-max-accounts/:id/reset-status
 * Reset account status (clear rate limits, cooldown)
 */
router.post("/claude-max-accounts/:id/reset-status", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const existing = await db.claudeMaxAccount.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organization.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    const account = await db.claudeMaxAccount.update({
      where: { id: req.params.id },
      data: {
        status: "active",
        consecutiveRateLimits: 0,
        cooldownUntil: null,
        estimatedUsagePercent: 0,
        lastUsageUpdateAt: new Date(),
      },
    });

    logger.info("Reset Claude Max account status", {
      organizationId: req.organization.id,
      accountId: req.params.id,
    });

    return res.json({
      ...account,
      hasCredentials: !!account.credentialRef,
      credentialRef: undefined,
      metadata: undefined,
    });
  } catch (error) {
    logger.error(
      "Failed to reset Claude Max account status",
      { id: req.params.id },
      error as Error,
    );
    return res.status(500).json({ error: "Failed to reset account status" });
  }
});

/**
 * GET /api/claude-max-accounts/pool/status
 * Get pool status with rotation recommendation
 */
router.get("/claude-max-accounts/pool/status", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const accounts = await db.claudeMaxAccount.findMany({
      where: { organizationId: req.organization.id },
      orderBy: [{ priority: "desc" }, { estimatedUsagePercent: "asc" }],
    });

    const now = new Date();
    const availableAccounts = accounts.filter((a) => {
      if (a.status !== "active") return false;
      if (a.cooldownUntil && a.cooldownUntil > now) return false;
      if (a.estimatedUsagePercent >= 95) return false;
      return true;
    });

    const nextAccount = availableAccounts[0] || null;

    return res.json({
      totalAccounts: accounts.length,
      availableAccounts: availableAccounts.length,
      nextRecommended: nextAccount
        ? {
            id: nextAccount.id,
            nickname: nextAccount.nickname,
            email: nextAccount.email,
            estimatedUsagePercent: nextAccount.estimatedUsagePercent,
            priority: nextAccount.priority,
          }
        : null,
      accountStatuses: accounts.map((a) => ({
        id: a.id,
        nickname: a.nickname,
        status: a.status,
        estimatedUsagePercent: a.estimatedUsagePercent,
        cooldownUntil: a.cooldownUntil,
        available:
          a.status === "active" &&
          (!a.cooldownUntil || a.cooldownUntil <= now) &&
          a.estimatedUsagePercent < 95,
      })),
    });
  } catch (error) {
    logger.error("Failed to get pool status", {}, error as Error);
    return res.status(500).json({ error: "Failed to get pool status" });
  }
});

export const claudeMaxAccountsRouter = router;
