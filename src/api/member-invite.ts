/**
 * Member Invite API Routes
 *
 * Endpoints for inviting members from connected services (Slack, Google, Notion).
 *
 * Endpoints:
 * - GET    /api/members/invite/sources - List connected services for org
 * - GET    /api/members/invite/users   - List users from a provider not already members
 * - POST   /api/members/invite         - Bulk invite from connected service
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import { identityLinker } from "../services/identity";

const router = Router();

// =============================================================================
// TYPES
// =============================================================================

interface ConnectedService {
  provider: "slack" | "google" | "notion";
  workspaceName: string | null;
  workspaceId: string | null;
  connected: boolean;
  userCount: number;
}

interface ProviderUser {
  providerUserId: string;
  provider: "slack" | "google" | "notion";
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isBot?: boolean;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const getUsersQuerySchema = z.object({
  provider: z.enum(["slack", "google", "notion"]),
  search: z.string().optional(),
});

const inviteFromServiceSchema = z.object({
  provider: z.enum(["slack", "google", "notion"]),
  providerUserIds: z.array(z.string()).min(1).max(100),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

// =============================================================================
// HELPER: Send invite notification
// =============================================================================

async function sendInviteNotification(params: {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  organizationId: string;
  provider: string;
}): Promise<void> {
  const { email, organizationName, inviterName, role, organizationId, provider } = params;
  const inviteUrl = `${process.env.BASE_URL}/accept-invite?org=${organizationId}`;

  logger.info("Member invite notification (from connected service)", {
    email,
    organizationId,
    organizationName,
    inviterName,
    role,
    provider,
    inviteUrl,
    emailStatus: "pending_email_service_integration",
  });
}

// =============================================================================
// GET /api/members/invite/sources
// =============================================================================

router.get(
  "/members/invite/sources",
  requireAuth,
  requirePermission(Permission.MEMBER_INVITE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      // Check Slack integration
      const slackIntegration = await prisma.slackIntegration.findUnique({
        where: { organizationId },
      });

      // Check Notion connection
      const notionConnection = await prisma.notionConnection.findUnique({
        where: { organizationId },
      });

      // Check Google Calendar connection (as proxy for Google Workspace)
      const googleConnection = await prisma.googleCalendarConnection.findUnique({
        where: { organizationId },
      });

      // Count external identities per provider
      const identityCounts = await prisma.externalIdentity.groupBy({
        by: ["provider"],
        where: { organizationId },
        _count: { id: true },
      });

      const countByProvider: Record<string, number> = {};
      for (const item of identityCounts) {
        countByProvider[item.provider] = item._count.id;
      }

      const sources: ConnectedService[] = [];

      // Slack
      if (slackIntegration?.botToken) {
        sources.push({
          provider: "slack",
          workspaceName: slackIntegration.workspaceName,
          workspaceId: slackIntegration.workspaceId,
          connected: true,
          userCount: countByProvider["slack"] ?? 0,
        });
      }

      // Google
      if (googleConnection?.accessToken) {
        sources.push({
          provider: "google",
          workspaceName: googleConnection.calendarId ?? "Google Workspace",
          workspaceId: null,
          connected: true,
          userCount: countByProvider["google"] ?? 0,
        });
      }

      // Notion
      if (notionConnection?.accessToken) {
        sources.push({
          provider: "notion",
          workspaceName: notionConnection.workspaceName,
          workspaceId: notionConnection.workspaceId,
          connected: true,
          userCount: countByProvider["notion"] ?? 0,
        });
      }

      return res.json({ sources });
    } catch (error) {
      logger.error(
        "Failed to fetch invite sources",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch connected services" });
    }
  },
);

// =============================================================================
// GET /api/members/invite/users
// =============================================================================

router.get(
  "/members/invite/users",
  requireAuth,
  requirePermission(Permission.MEMBER_INVITE),
  validate({ query: getUsersQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { provider, search } = req.query as z.infer<typeof getUsersQuerySchema>;

      // Get existing member user IDs
      const existingMemberships = await prisma.membership.findMany({
        where: { organizationId },
        select: { userId: true },
      });
      const existingMemberUserIds = new Set(existingMemberships.map((m) => m.userId));

      // Get existing user emails (to match against external identities)
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: [...existingMemberUserIds] } },
        select: { email: true },
      });
      const existingMemberEmails = new Set(
        existingUsers.map((u) => u.email.toLowerCase()),
      );

      // Get external identities that are NOT already linked to members
      const whereClause: any = {
        organizationId,
        provider,
        // Exclude bots
        NOT: {
          metadata: {
            path: ["isBot"],
            equals: true,
          },
        },
      };

      // Add search filter if provided
      if (search) {
        whereClause.OR = [
          { displayName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { realName: { contains: search, mode: "insensitive" } },
        ];
      }

      const externalIdentities = await prisma.externalIdentity.findMany({
        where: whereClause,
        orderBy: [{ displayName: "asc" }, { email: "asc" }],
        take: 200,
      });

      // Filter out identities already linked to existing members
      const users: ProviderUser[] = [];

      for (const identity of externalIdentities) {
        // Skip if linked to an existing member
        if (identity.userId && existingMemberUserIds.has(identity.userId)) {
          continue;
        }

        // Skip if email matches an existing member
        if (identity.email && existingMemberEmails.has(identity.email.toLowerCase())) {
          continue;
        }

        const metadata = identity.metadata as Record<string, unknown> | null;
        const isBot = metadata?.isBot === true;

        // Skip bots (extra check)
        if (isBot) continue;

        users.push({
          providerUserId: identity.providerUserId,
          provider: identity.provider as "slack" | "google" | "notion",
          email: identity.email,
          displayName: identity.displayName || identity.realName,
          avatarUrl: identity.avatarUrl,
          isBot,
        });
      }

      return res.json({ users });
    } catch (error) {
      logger.error(
        "Failed to fetch users from provider",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  },
);

// =============================================================================
// POST /api/members/invite
// =============================================================================

router.post(
  "/members/invite",
  requireAuth,
  requirePermission(Permission.MEMBER_INVITE),
  validate({ body: inviteFromServiceSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: inviterId } = req.user!;
      const { provider, providerUserIds, role } = req.body as z.infer<
        typeof inviteFromServiceSchema
      >;

      // Fetch organization and inviter info
      const [organization, inviter] = await Promise.all([
        prisma.organization.findUnique({ where: { id: organizationId } }),
        prisma.user.findUnique({ where: { id: inviterId } }),
      ]);

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Get external identities for the selected provider user IDs
      const externalIdentities = await prisma.externalIdentity.findMany({
        where: {
          organizationId,
          provider,
          providerUserId: { in: providerUserIds },
        },
      });

      if (externalIdentities.length === 0) {
        return res.status(400).json({ error: "No valid users found to invite" });
      }

      const results: Array<{
        providerUserId: string;
        email: string | null;
        status: "invited" | "already_member" | "error";
        membershipId?: string;
        error?: string;
      }> = [];

      for (const identity of externalIdentities) {
        try {
          // Find or create user by email
          let user = identity.email
            ? await prisma.user.findUnique({ where: { email: identity.email } })
            : null;

          // Check if user is already a member
          if (user) {
            const existingMembership = await prisma.membership.findUnique({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: user.id,
                },
              },
            });

            if (existingMembership) {
              results.push({
                providerUserId: identity.providerUserId,
                email: identity.email,
                status: "already_member",
              });
              continue;
            }
          }

          // Create user if not exists
          if (!user) {
            const email =
              identity.email ||
              `${provider}+${identity.providerUserId}@placeholder.nubabel.com`;

            user = await prisma.user.create({
              data: {
                email,
                displayName: identity.displayName || identity.realName,
                avatarUrl: identity.avatarUrl,
                emailVerified: false,
              },
            });
          }

          // Create membership
          const membership = await prisma.membership.create({
            data: {
              organizationId,
              userId: user.id,
              role,
              invitedBy: inviterId,
              invitedAt: new Date(),
              joinedAt: null,
            },
          });

          // Link the external identity to the user
          if (!identity.userId) {
            await identityLinker.linkIdentity({
              externalIdentityId: identity.id,
              userId: user.id,
              method: "admin",
              performedBy: inviterId,
              reason: `Invited from ${provider} by admin`,
            });
          }

          // Send invitation notification
          if (identity.email) {
            await sendInviteNotification({
              email: identity.email,
              organizationName: organization.name,
              inviterName: inviter?.displayName || inviter?.email || "A team member",
              role,
              organizationId,
              provider,
            });
          }

          results.push({
            providerUserId: identity.providerUserId,
            email: identity.email,
            status: "invited",
            membershipId: membership.id,
          });

          logger.info("Member invited from connected service", {
            organizationId,
            provider,
            providerUserId: identity.providerUserId,
            userId: user.id,
            role,
            invitedBy: inviterId,
          });
        } catch (err) {
          logger.error(
            "Failed to invite user from service",
            {
              organizationId,
              provider,
              providerUserId: identity.providerUserId,
            },
            err instanceof Error ? err : new Error(String(err)),
          );

          results.push({
            providerUserId: identity.providerUserId,
            email: identity.email,
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      const invited = results.filter((r) => r.status === "invited").length;
      const alreadyMembers = results.filter((r) => r.status === "already_member").length;
      const errors = results.filter((r) => r.status === "error").length;

      return res.status(201).json({
        success: true,
        summary: {
          total: results.length,
          invited,
          alreadyMembers,
          errors,
        },
        results,
      });
    } catch (error) {
      logger.error(
        "Failed to invite members from service",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to invite members" });
    }
  },
);

export default router;
