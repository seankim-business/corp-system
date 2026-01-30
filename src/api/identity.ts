/**
 * Identity API Routes
 *
 * User and Admin endpoints for identity management.
 * CRITICAL FIX: Authorization check prevents linking arbitrary identities.
 */

import { Router, Request, Response } from "express";
import { identityResolver, identityLinker, suggestionEngine } from "../services/identity";
import { db } from "../db/client";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { logger } from "../utils/logger";

const router = Router();

// =============================================================================
// HELPER: Format identity for API response
// =============================================================================

function formatIdentityResponse(identity: any) {
  return {
    id: identity.id,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    linkStatus: identity.linkStatus,
    linkMethod: identity.linkMethod,
    linkedAt: identity.linkedAt?.toISOString(),
    lastSyncedAt: identity.lastSyncedAt?.toISOString(),
  };
}

// =============================================================================
// USER ENDPOINTS
// =============================================================================

/**
 * GET /api/identities
 * List all external identities linked to current user
 */
router.get("/identities", async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;

    const identities = await identityResolver.getIdentitiesForUser(organizationId, userId);

    return res.json({
      identities: identities.map(formatIdentityResponse),
    });
  } catch (error) {
    logger.error("Failed to fetch user identities", { error });
    return res.status(500).json({ error: "Failed to fetch identities" });
  }
});

/**
 * GET /api/identities/suggestions
 * Get pending suggestions for current user
 */
router.get("/identities/suggestions", async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;

    const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);

    return res.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        externalIdentity: formatIdentityResponse(s.externalIdentity),
        confidenceScore: s.confidenceScore,
        matchMethod: s.matchMethod,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch suggestions", { error });
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * POST /api/identities/:id/link
 * Link an external identity to current user (self-service)
 *
 * CRITICAL FIX: Authorization check - identity email must match user email
 */
router.post("/identities/:id/link", async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { id } = req.params as { id: string };
    const { reason } = req.body;

    // Check org settings
    const settings = await db.identitySettings.findUnique({
      where: { organizationId },
    });

    if (settings && !settings.allowUserSelfLink) {
      return res.status(403).json({
        error: "Self-linking is disabled for this organization",
      });
    }

    // Verify identity belongs to this org and is unlinked
    const identity = await db.externalIdentity.findFirst({
      where: { id, organizationId, linkStatus: { not: "linked" } },
    });

    if (!identity) {
      return res.status(404).json({
        error: "Identity not found or already linked",
      });
    }

    // CRITICAL FIX: Authorization check
    // User can only link identities that match their email
    const user = await db.user.findUnique({ where: { id: userId } });

    if (identity.email && user?.email) {
      const identityEmail = identity.email.toLowerCase();
      const userEmail = user.email.toLowerCase();

      if (identityEmail !== userEmail) {
        logger.warn("Self-link authorization denied - email mismatch", {
          identityEmail,
          userEmail,
          userId,
          identityId: id,
        });
        return res.status(403).json({
          error:
            "Cannot link identity - email does not match your account. Contact admin for assistance.",
        });
      }
    }

    // Also check if user was a suggested target
    const wasSuggested = await db.identityLinkSuggestion.findFirst({
      where: {
        externalIdentityId: id,
        suggestedUserId: userId,
        status: "pending",
      },
    });

    // If no email match and not suggested, require admin
    if (!identity.email && !wasSuggested) {
      return res.status(403).json({
        error: "Cannot link identity without email match. Contact admin for assistance.",
      });
    }

    await identityLinker.linkIdentity({
      externalIdentityId: id,
      userId,
      method: "manual",
      performedBy: userId,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Identity linked successfully",
    });
  } catch (error) {
    logger.error("Failed to link identity", { error });
    return res.status(500).json({ error: "Failed to link identity" });
  }
});

/**
 * POST /api/identities/:id/unlink
 * Unlink an external identity from current user
 */
router.post("/identities/:id/unlink", async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { id } = req.params as { id: string };
    const { reason } = req.body;

    // Check org settings
    const settings = await db.identitySettings.findUnique({
      where: { organizationId },
    });

    if (settings && !settings.allowUserSelfUnlink) {
      return res.status(403).json({
        error: "Self-unlinking is disabled for this organization",
      });
    }

    // Verify identity belongs to current user
    const identity = await db.externalIdentity.findFirst({
      where: { id, organizationId, userId },
    });

    if (!identity) {
      return res.status(404).json({
        error: "Identity not found or not owned by you",
      });
    }

    await identityLinker.unlinkIdentity({
      externalIdentityId: id,
      performedBy: userId,
      reason,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Identity unlinked successfully",
    });
  } catch (error) {
    logger.error("Failed to unlink identity", { error });
    return res.status(500).json({ error: "Failed to unlink identity" });
  }
});

/**
 * POST /api/identities/suggestions/:id/accept
 * Accept a suggestion
 */
router.post("/identities/suggestions/:id/accept", async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user!;
    const { id } = req.params as { id: string };
    const { reason } = req.body;

    // Verify suggestion belongs to current user
    const suggestion = await suggestionEngine.getSuggestionById(id);

    if (!suggestion || suggestion.suggestedUserId !== userId) {
      return res.status(404).json({
        error: "Suggestion not found",
      });
    }

    if (suggestion.status !== "pending") {
      return res.status(400).json({
        error: `Suggestion already processed: ${suggestion.status}`,
      });
    }

    await identityLinker.processSuggestionDecision({
      suggestionId: id,
      accepted: true,
      reviewedBy: userId,
      reason,
    });

    return res.json({
      success: true,
      message: "Suggestion accepted and identity linked",
    });
  } catch (error) {
    logger.error("Failed to accept suggestion", { error });
    return res.status(500).json({ error: "Failed to accept suggestion" });
  }
});

/**
 * POST /api/identities/suggestions/:id/reject
 * Reject a suggestion
 */
router.post("/identities/suggestions/:id/reject", async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user!;
    const { id } = req.params as { id: string };
    const { reason } = req.body;

    // Verify suggestion belongs to current user
    const suggestion = await suggestionEngine.getSuggestionById(id);

    if (!suggestion || suggestion.suggestedUserId !== userId) {
      return res.status(404).json({
        error: "Suggestion not found",
      });
    }

    if (suggestion.status !== "pending") {
      return res.status(400).json({
        error: `Suggestion already processed: ${suggestion.status}`,
      });
    }

    await identityLinker.processSuggestionDecision({
      suggestionId: id,
      accepted: false,
      reviewedBy: userId,
      reason,
    });

    return res.json({
      success: true,
      message: "Suggestion rejected",
    });
  } catch (error) {
    logger.error("Failed to reject suggestion", { error });
    return res.status(500).json({ error: "Failed to reject suggestion" });
  }
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/identities
 * List all identities in organization (admin only)
 */
router.get(
  "/admin/identities",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { status, provider, page = "1", limit = "50" } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { organizationId };
      if (status) where.linkStatus = status;
      if (provider) where.provider = provider;

      const [identities, total] = await Promise.all([
        db.externalIdentity.findMany({
          where,
          include: {
            user: {
              select: { id: true, email: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        db.externalIdentity.count({ where }),
      ]);

      return res.json({
        identities: identities.map((i) => ({
          ...formatIdentityResponse(i),
          linkedUser: i.user,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch admin identities", { error });
      return res.status(500).json({ error: "Failed to fetch identities" });
    }
  },
);

/**
 * GET /api/admin/identities/stats
 * Get identity statistics (admin only)
 */
router.get(
  "/admin/identities/stats",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const stats = await identityResolver.getStats(organizationId);

      return res.json(stats);
    } catch (error) {
      logger.error("Failed to fetch identity stats", { error });
      return res.status(500).json({ error: "Failed to fetch stats" });
    }
  },
);

/**
 * GET /api/admin/identities/suggestions
 * Get all pending suggestions (admin only)
 */
router.get(
  "/admin/identities/suggestions",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const suggestions = await suggestionEngine.getPendingSuggestions(organizationId);

      return res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          externalIdentity: formatIdentityResponse(s.externalIdentity),
          suggestedUser: s.suggestedUser,
          confidenceScore: s.confidenceScore,
          matchMethod: s.matchMethod,
          expiresAt: s.expiresAt.toISOString(),
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      logger.error("Failed to fetch admin suggestions", { error });
      return res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  },
);

/**
 * PUT /api/admin/identities/settings
 * Update organization identity settings (admin only)
 */
router.put(
  "/admin/identities/settings",
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const {
        autoLinkOnEmail,
        autoLinkThreshold,
        suggestionThreshold,
        providerPriority,
        allowUserSelfLink,
        allowUserSelfUnlink,
        requireAdminApproval,
        suggestionExpiryDays,
      } = req.body;

      const settings = await db.identitySettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          autoLinkOnEmail: autoLinkOnEmail ?? true,
          autoLinkThreshold: autoLinkThreshold ?? 0.95,
          suggestionThreshold: suggestionThreshold ?? 0.85,
          providerPriority: providerPriority ?? ["google", "slack", "notion"],
          allowUserSelfLink: allowUserSelfLink ?? true,
          allowUserSelfUnlink: allowUserSelfUnlink ?? true,
          requireAdminApproval: requireAdminApproval ?? false,
          suggestionExpiryDays: suggestionExpiryDays ?? 30,
        },
        update: {
          ...(autoLinkOnEmail !== undefined && { autoLinkOnEmail }),
          ...(autoLinkThreshold !== undefined && { autoLinkThreshold }),
          ...(suggestionThreshold !== undefined && { suggestionThreshold }),
          ...(providerPriority !== undefined && { providerPriority }),
          ...(allowUserSelfLink !== undefined && { allowUserSelfLink }),
          ...(allowUserSelfUnlink !== undefined && { allowUserSelfUnlink }),
          ...(requireAdminApproval !== undefined && { requireAdminApproval }),
          ...(suggestionExpiryDays !== undefined && { suggestionExpiryDays }),
        },
      });

      logger.info("Identity settings updated", { organizationId, userId });

      return res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logger.error("Failed to update identity settings", { error });
      return res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

/**
 * POST /api/admin/identities/:id/link
 * Admin link identity to any user (override)
 */
router.post(
  "/admin/identities/:id/link",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;
      const { id } = req.params as { id: string };
      const { userId, reason } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Verify identity belongs to this org
      const identity = await db.externalIdentity.findFirst({
        where: { id, organizationId },
      });

      if (!identity) {
        return res.status(404).json({ error: "Identity not found" });
      }

      // Verify target user belongs to this org
      const membership = await db.membership.findFirst({
        where: { organizationId, userId },
      });

      if (!membership) {
        return res.status(404).json({ error: "User not found in organization" });
      }

      if (identity.userId) {
        // Re-link to different user
        await identityLinker.relinkIdentity(id, userId, adminId, reason ?? "Admin override");
      } else {
        // Fresh link
        await identityLinker.linkIdentity({
          externalIdentityId: id,
          userId,
          method: "admin",
          performedBy: adminId,
          reason: reason ?? "Admin link",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }

      return res.json({
        success: true,
        message: "Identity linked by admin",
      });
    } catch (error) {
      logger.error("Failed to admin link identity", { error });
      return res.status(500).json({ error: "Failed to link identity" });
    }
  },
);

/**
 * POST /api/admin/identities/:id/unlink
 * Admin unlink identity (override)
 */
router.post(
  "/admin/identities/:id/unlink",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;
      const { id } = req.params as { id: string };
      const { reason } = req.body;

      // Verify identity belongs to this org and is linked
      const identity = await db.externalIdentity.findFirst({
        where: { id, organizationId, linkStatus: "linked" },
      });

      if (!identity) {
        return res.status(404).json({ error: "Linked identity not found" });
      }

      await identityLinker.unlinkIdentity({
        externalIdentityId: id,
        performedBy: adminId,
        reason: reason ?? "Admin unlink",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.json({
        success: true,
        message: "Identity unlinked by admin",
      });
    } catch (error) {
      logger.error("Failed to admin unlink identity", { error });
      return res.status(500).json({ error: "Failed to unlink identity" });
    }
  },
);

/**
 * POST /api/admin/identities/sync-slack
 * Sync all Slack users to ExternalIdentity system with auto-linking
 * This is useful for migrating existing Slack users
 */
router.post(
  "/admin/identities/sync-slack",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;

      logger.info("Starting Slack to ExternalIdentity sync", { organizationId, adminId });

      // Get all Slack users for this organization
      const slackUsers = await db.slackUser.findMany({
        where: { organizationId },
        include: { user: true },
      });

      if (slackUsers.length === 0) {
        return res.json({
          success: true,
          message: "No Slack users found to sync",
          stats: { total: 0, synced: 0, alreadyExists: 0, autoLinked: 0, suggested: 0, errors: 0 },
        });
      }

      const stats = {
        total: slackUsers.length,
        synced: 0,
        alreadyExists: 0,
        autoLinked: 0,
        suggested: 0,
        errors: 0,
      };

      for (const slackUser of slackUsers) {
        // Skip bots
        if (slackUser.isBot) {
          continue;
        }

        try {
          // Check if ExternalIdentity already exists
          const existing = await db.externalIdentity.findFirst({
            where: {
              organizationId,
              provider: "slack",
              providerUserId: slackUser.slackUserId,
            },
          });

          if (existing) {
            stats.alreadyExists++;
            continue;
          }

          // Create ExternalIdentity and attempt auto-linking
          const result = await identityResolver.resolveIdentity(
            {
              provider: "slack",
              providerUserId: slackUser.slackUserId,
              providerTeamId: slackUser.slackTeamId,
              email: slackUser.email ?? undefined,
              displayName: slackUser.displayName ?? undefined,
              realName: slackUser.realName ?? undefined,
              avatarUrl: slackUser.avatarUrl ?? undefined,
              metadata: {
                isBot: slackUser.isBot,
                isAdmin: slackUser.isAdmin,
              },
            },
            {
              organizationId,
              performedBy: adminId,
            },
          );

          stats.synced++;

          if (result.action === "auto_linked") {
            stats.autoLinked++;
          } else if (result.action === "suggested") {
            stats.suggested++;
          }
        } catch (error) {
          stats.errors++;
          logger.error("Failed to sync Slack user to ExternalIdentity", {
            slackUserId: slackUser.slackUserId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("Slack to ExternalIdentity sync completed", { organizationId, stats });

      return res.json({
        success: true,
        message: `Synced ${stats.synced} Slack users (${stats.autoLinked} auto-linked, ${stats.suggested} suggested)`,
        stats,
      });
    } catch (error) {
      logger.error("Failed to sync Slack users to ExternalIdentity", { error });
      return res.status(500).json({ error: "Failed to sync Slack users" });
    }
  },
);

export default router;
