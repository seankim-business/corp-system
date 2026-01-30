import { db as prisma } from "../db/client";
import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";

/**
 * Get Nubabel user by Slack ID using multiple lookup methods:
 * 1. First try ExternalIdentity (linked identity) if organizationId is provided
 * 2. Fall back to email lookup from Slack profile
 */
export async function getUserBySlackId(
  slackUserId: string,
  client: WebClient,
  organizationId?: string,
) {
  try {
    // Method 1: Try ExternalIdentity lookup (fastest, most reliable)
    if (organizationId) {
      const externalIdentity = await prisma.externalIdentity.findUnique({
        where: {
          organizationId_provider_providerUserId: {
            organizationId,
            provider: "slack",
            providerUserId: slackUserId,
          },
        },
        include: { user: true },
      });

      if (externalIdentity?.user) {
        logger.debug("User found via ExternalIdentity", {
          slackUserId,
          userId: externalIdentity.user.id,
        });
        return externalIdentity.user;
      }
    }

    // Method 2: Fall back to email lookup from Slack API
    const slackUser = await client.users.info({ user: slackUserId });
    const email = slackUser.user?.profile?.email;

    if (!email) {
      logger.warn("Slack user email not found - user may have email hidden", {
        slackUserId,
        hasProfile: !!slackUser.user?.profile,
      });
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      logger.debug("User found via email lookup", { slackUserId, email, userId: user.id });

      // Auto-create ExternalIdentity if org is known (for future fast lookup)
      if (organizationId) {
        await prisma.externalIdentity.upsert({
          where: {
            organizationId_provider_providerUserId: {
              organizationId,
              provider: "slack",
              providerUserId: slackUserId,
            },
          },
          create: {
            organizationId,
            provider: "slack",
            providerUserId: slackUserId,
            providerTeamId: slackUser.user?.team_id,
            email: email.toLowerCase(),
            displayName: slackUser.user?.profile?.display_name || slackUser.user?.name,
            realName: slackUser.user?.profile?.real_name,
            avatarUrl: slackUser.user?.profile?.image_192,
            userId: user.id,
            linkStatus: "linked",
            linkMethod: "auto_email",
            lastSyncedAt: new Date(),
          },
          update: {
            userId: user.id,
            linkStatus: "linked",
            linkMethod: "auto_email",
            lastSyncedAt: new Date(),
          },
        });
        logger.info("Auto-linked Slack identity via email", {
          slackUserId,
          userId: user.id,
          organizationId,
        });
      }
    }

    return user;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("getUserBySlackId error", { slackUserId, error: errorMessage });
    return null; // Return null instead of throwing to allow graceful handling
  }
}

export async function getOrganizationBySlackWorkspace(workspaceId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: { workspaceId },
    include: { organization: true },
  });

  if (integration) {
    return integration.organization;
  }

  const org = await prisma.organization.findFirst({
    where: {
      settings: {
        path: ["slackWorkspaceId"],
        equals: workspaceId,
      },
    },
  });

  return org;
}

export async function createOrUpdateSlackWorkspaceMapping(
  workspaceId: string,
  organizationId: string,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        slackWorkspaceId: workspaceId,
      },
    },
  });
}
