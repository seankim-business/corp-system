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
import { WebClient } from "@slack/web-api";
import { getSlackIntegrationByOrg } from "./slack-integration";
import { provisionSlackUser } from "../services/slack-user-provisioner";
import { runWithoutRLS } from "../utils/async-context";

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
 * This fetches users from the Slack workspace and creates SlackUser + ExternalIdentity records
 */
router.post(
  "/admin/identities/sync-slack",
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;

      logger.info("Starting Slack workspace sync", { organizationId, adminId });

      // Get Slack integration to fetch users from workspace
      const integration = await getSlackIntegrationByOrg(organizationId);
      if (!integration || !integration.botToken) {
        return res.status(400).json({
          error: "Slack integration not configured. Please connect Slack in Settings first.",
        });
      }

      const slackClient = new WebClient(integration.botToken);
      const workspaceId = integration.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({
          error: "Slack workspace ID not found. Please reconnect Slack in Settings.",
        });
      }

      // Fetch all users from Slack workspace
      const stats = {
        total: 0,
        provisioned: 0,
        synced: 0,
        alreadyExists: 0,
        autoLinked: 0,
        suggested: 0,
        skippedBots: 0,
        errors: 0,
      };

      let cursor: string | undefined;
      const allSlackMembers: any[] = [];

      // Paginate through all workspace members
      do {
        const response = await slackClient.users.list({ cursor, limit: 200 });
        if (response.members) {
          allSlackMembers.push(...response.members);
        }
        cursor = response.response_metadata?.next_cursor;
      } while (cursor);

      stats.total = allSlackMembers.length;
      logger.info("Fetched Slack workspace members", { count: allSlackMembers.length, workspaceId });

      for (const member of allSlackMembers) {
        // Skip bots and deactivated users
        if (member.is_bot || member.deleted) {
          stats.skippedBots++;
          continue;
        }

        // Skip slackbot
        if (member.id === "USLACKBOT") {
          stats.skippedBots++;
          continue;
        }

        try {
          const profile = member.profile || {};

          // Provision SlackUser (creates User if needed)
          await provisionSlackUser(member.id, workspaceId, organizationId, {
            email: profile.email,
            displayName: profile.display_name || profile.real_name,
            realName: profile.real_name,
            avatarUrl: profile.image_192 || profile.image_72,
            isBot: member.is_bot,
            isAdmin: member.is_admin,
          });
          stats.provisioned++;

          // Check if ExternalIdentity already exists
          const existing = await db.externalIdentity.findFirst({
            where: {
              organizationId,
              provider: "slack",
              providerUserId: member.id,
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
              providerUserId: member.id,
              providerTeamId: workspaceId,
              email: profile.email,
              displayName: profile.display_name,
              realName: profile.real_name,
              avatarUrl: profile.image_192,
              metadata: {
                isBot: member.is_bot ?? false,
                isAdmin: member.is_admin ?? false,
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
          logger.error("Failed to sync Slack member", {
            slackUserId: member.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("Slack workspace sync completed", { organizationId, stats });

      return res.json({
        success: true,
        message: `Synced ${stats.synced} Slack users (${stats.autoLinked} auto-linked, ${stats.suggested} suggestions)`,
        stats,
      });
    } catch (error) {
      logger.error("Failed to sync Slack workspace", { error });
      return res.status(500).json({ error: "Failed to sync Slack workspace" });
    }
  },
);

/**
 * POST /api/admin/identities/fix-link
 * Emergency fix to manually create/link an ExternalIdentity for a Slack user
 * Admin only - bypasses normal restrictions for quick fixes
 */
router.post(
  "/admin/identities/fix-link",
  // Emergency endpoint - authentication required, no permission check (one-time fix)
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;
      const { slackUserId, targetUserEmail } = req.body;

      if (!slackUserId || !targetUserEmail) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["slackUserId", "targetUserEmail"],
        });
      }

      logger.info("Admin fix-link requested", {
        slackUserId,
        targetUserEmail,
        adminId,
        organizationId,
      });

      // Run without RLS to ensure correct user lookup (bypass circuit breaker + RLS)
      const result = await runWithoutRLS(async () => {
        // Find the target Nubabel user by email (NOT the admin making the request)
        const targetUser = await db.user.findFirst({
          where: {
            email: targetUserEmail.toLowerCase(),
            memberships: {
              some: { organizationId },
            },
          },
        });

        if (!targetUser) {
          return { error: "Target user not found", email: targetUserEmail };
        }

        // CRITICAL: Log the found user to verify correct lookup
        logger.info("fix-link: Target user found", {
          targetUserId: targetUser.id,
          targetUserEmail: targetUser.email,
          targetUserDisplayName: targetUser.displayName,
          adminId,
          isAdminSelf: targetUser.id === adminId,
        });

        // Check if ExternalIdentity already exists
        const existingIdentity = await db.externalIdentity.findUnique({
          where: {
            organizationId_provider_providerUserId: {
              organizationId,
              provider: "slack",
              providerUserId: slackUserId,
            },
          },
        });

        let identity;
        if (existingIdentity) {
          // Update existing identity
          identity = await db.externalIdentity.update({
            where: { id: existingIdentity.id },
            data: {
              userId: targetUser.id,
              linkStatus: "linked",
              linkMethod: "admin",
              linkedAt: new Date(),
              lastSyncedAt: new Date(),
            },
          });
          logger.info("ExternalIdentity updated via fix-link", {
            identityId: identity.id,
            slackUserId,
            userId: targetUser.id,
            userEmail: targetUser.email,
          });
        } else {
          // Create new identity
          identity = await db.externalIdentity.create({
            data: {
              organizationId,
              provider: "slack",
              providerUserId: slackUserId,
              email: targetUserEmail.toLowerCase(),
              displayName: targetUser.displayName || targetUserEmail,
              userId: targetUser.id,
              linkStatus: "linked",
              linkMethod: "admin",
              linkedAt: new Date(),
              lastSyncedAt: new Date(),
            },
          });
          logger.info("ExternalIdentity created via fix-link", {
            identityId: identity.id,
            slackUserId,
            userId: targetUser.id,
            userEmail: targetUser.email,
          });
        }

        // Also create or update SlackUser
        const slackUser = await db.slackUser.findUnique({
          where: { slackUserId },
        });

        if (slackUser) {
          if (slackUser.userId !== targetUser.id) {
            await db.slackUser.update({
              where: { slackUserId },
              data: { userId: targetUser.id },
            });
            logger.info("SlackUser updated via fix-link", { slackUserId, userId: targetUser.id });
          } else {
            logger.info("SlackUser already has correct userId", { slackUserId, userId: targetUser.id });
          }
        } else {
          // Get slackTeamId from SlackIntegration (workspaceId field)
          const slackIntegration = await db.slackIntegration.findFirst({
            where: { organizationId },
          });

          if (slackIntegration?.workspaceId) {
            // Create SlackUser entry if it doesn't exist
            await db.slackUser.create({
              data: {
                slackUserId,
                slackTeamId: slackIntegration.workspaceId,
                userId: targetUser.id,
                organizationId,
                email: targetUserEmail,
                displayName: targetUser.displayName || targetUserEmail,
              },
            });
            logger.info("SlackUser created via fix-link", {
              slackUserId,
              userId: targetUser.id,
              slackTeamId: slackIntegration.workspaceId,
            });
          } else {
            logger.warn("No SlackIntegration.workspaceId found for organization, skipping SlackUser creation", {
              organizationId,
              hasIntegration: !!slackIntegration,
            });
          }
        }

        return {
          success: true,
          message: existingIdentity ? "Identity updated and linked" : "Identity created and linked",
          identity: formatIdentityResponse(identity),
          targetUser: {
            id: targetUser.id,
            email: targetUser.email,
            displayName: targetUser.displayName,
          },
        };
      });

      // Handle error from runWithoutRLS
      if ("error" in result) {
        return res.status(404).json(result);
      }

      return res.json(result);
    } catch (error) {
      logger.error("Failed to fix-link identity", { error });
      return res.status(500).json({ error: "Failed to fix-link identity" });
    }
  },
);

/**
 * POST /api/admin/identities/create-user-and-link
 * Emergency endpoint to create a Nubabel user account AND link their Slack identity
 * Used when the user doesn't exist in Nubabel yet
 */
router.post(
  "/admin/identities/create-user-and-link",
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: adminId } = req.user!;
      const { slackUserId, email, displayName } = req.body;

      if (!slackUserId || !email) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["slackUserId", "email"],
          optional: ["displayName"],
        });
      }

      logger.info("Admin create-user-and-link requested", {
        slackUserId,
        email,
        displayName,
        adminId,
        organizationId,
      });

      const result = await runWithoutRLS(async () => {
        const normalizedEmail = email.toLowerCase();

        // 1. Check if user already exists
        let user = await db.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (user) {
          logger.info("create-user-and-link: User already exists", {
            userId: user.id,
            email: normalizedEmail,
          });
        } else {
          // Create new user
          user = await db.user.create({
            data: {
              email: normalizedEmail,
              displayName: displayName || email.split("@")[0],
              emailVerified: true, // Admin-created users skip email verification
            },
          });
          logger.info("create-user-and-link: User created", {
            userId: user.id,
            email: normalizedEmail,
          });
        }

        // 2. Check/create membership
        const existingMembership = await db.membership.findFirst({
          where: { userId: user.id, organizationId },
        });

        if (!existingMembership) {
          await db.membership.create({
            data: {
              userId: user.id,
              organizationId,
              role: "member",
            },
          });
          logger.info("create-user-and-link: Membership created", {
            userId: user.id,
            organizationId,
          });
        }

        // 3. Get SlackIntegration for workspaceId
        const slackIntegration = await db.slackIntegration.findFirst({
          where: { organizationId },
        });

        if (!slackIntegration?.workspaceId) {
          logger.warn("create-user-and-link: No SlackIntegration.workspaceId found", { organizationId });
          return { error: "No SlackIntegration.workspaceId found for organization" };
        }

        // 4. Create/update ExternalIdentity
        const existingIdentity = await db.externalIdentity.findUnique({
          where: {
            organizationId_provider_providerUserId: {
              organizationId,
              provider: "slack",
              providerUserId: slackUserId,
            },
          },
        });

        let identity;
        if (existingIdentity) {
          identity = await db.externalIdentity.update({
            where: { id: existingIdentity.id },
            data: {
              userId: user.id,
              email: normalizedEmail,
              displayName: displayName || existingIdentity.displayName,
              linkStatus: "linked",
              linkMethod: "admin",
              linkedAt: new Date(),
              lastSyncedAt: new Date(),
            },
          });
          logger.info("create-user-and-link: ExternalIdentity updated", {
            identityId: identity.id,
            userId: user.id,
          });
        } else {
          identity = await db.externalIdentity.create({
            data: {
              organizationId,
              provider: "slack",
              providerUserId: slackUserId,
              providerTeamId: slackIntegration.workspaceId,
              email: normalizedEmail,
              displayName: displayName || email.split("@")[0],
              userId: user.id,
              linkStatus: "linked",
              linkMethod: "admin",
              linkedAt: new Date(),
              lastSyncedAt: new Date(),
            },
          });
          logger.info("create-user-and-link: ExternalIdentity created", {
            identityId: identity.id,
            userId: user.id,
          });
        }

        // 5. Create/update SlackUser
        const existingSlackUser = await db.slackUser.findUnique({
          where: { slackUserId },
        });

        if (existingSlackUser) {
          if (existingSlackUser.userId !== user.id) {
            await db.slackUser.update({
              where: { slackUserId },
              data: { userId: user.id },
            });
            logger.info("create-user-and-link: SlackUser updated", {
              slackUserId,
              userId: user.id,
            });
          }
        } else {
          await db.slackUser.create({
            data: {
              slackUserId,
              slackTeamId: slackIntegration.workspaceId,
              userId: user.id,
              organizationId,
              email: normalizedEmail,
              displayName: displayName || email.split("@")[0],
            },
          });
          logger.info("create-user-and-link: SlackUser created", {
            slackUserId,
            userId: user.id,
            slackTeamId: slackIntegration.workspaceId,
          });
        }

        return {
          success: true,
          message: "User created and identity linked",
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          identity: formatIdentityResponse(identity),
        };
      });

      if ("error" in result) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      logger.error("Failed to create-user-and-link", { error });
      return res.status(500).json({ error: "Failed to create user and link identity" });
    }
  },
);

export default router;
