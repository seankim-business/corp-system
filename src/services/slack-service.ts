import { db as prisma } from "../db/client";
import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";
import { runWithoutRLS } from "../utils/async-context";

/**
 * Get Nubabel user by Slack ID using multiple lookup methods:
 * 1. First try SlackUser table (created by provisioner)
 * 2. Then try ExternalIdentity (linked identity) if organizationId is provided
 * 3. Fall back to email lookup from Slack profile
 *
 * Note: This function runs with RLS bypassed since it's always called during
 * auth bootstrap (before organization context can be established).
 */
export async function getUserBySlackId(
  slackUserId: string,
  client: WebClient,
  organizationId?: string,
) {
  // Run with RLS bypass since this is auth bootstrap - we need to identify
  // the user before we can establish organization context
  return runWithoutRLS(async () => {
    try {
      // Using WARN level to ensure these diagnostic logs appear in production
      logger.warn("getUserBySlackId called (RLS bypassed for auth bootstrap)", {
        slackUserId,
        organizationId,
        hasOrganizationId: !!organizationId,
      });

      // Method 1: Try SlackUser table lookup (created by provisionSlackUser)
      const slackUserRecord = await prisma.slackUser.findUnique({
        where: { slackUserId },
        include: { user: true },
      });

    logger.warn("Method 1 - SlackUser lookup result", {
      slackUserId,
      found: !!slackUserRecord,
      hasUser: !!slackUserRecord?.user,
      userId: slackUserRecord?.user?.id,
      // Also log the raw userId field from SlackUser to detect broken FK
      slackUserRecordUserId: slackUserRecord?.userId,
      slackUserRecordEmail: slackUserRecord?.email,
    });

    if (slackUserRecord?.user) {
      logger.warn("User found via SlackUser table", {
        slackUserId,
        userId: slackUserRecord.user.id,
      });
      return slackUserRecord.user;
    }

    // Method 2: Try ExternalIdentity lookup
    if (organizationId) {
      logger.warn("Method 2 - ExternalIdentity lookup starting", {
        slackUserId,
        organizationId,
      });

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

      logger.warn("Method 2 - ExternalIdentity lookup result", {
        slackUserId,
        organizationId,
        found: !!externalIdentity,
        linkStatus: externalIdentity?.linkStatus,
        userId: externalIdentity?.userId,
        hasUser: !!externalIdentity?.user,
        userEmail: externalIdentity?.user?.email,
      });

      if (externalIdentity?.user) {
        logger.warn("User found via ExternalIdentity", {
          slackUserId,
          userId: externalIdentity.user.id,
        });
        return externalIdentity.user;
      }
    } else {
      logger.warn("Method 2 skipped - no organizationId provided", { slackUserId });
    }

    // Method 3: Fall back to email lookup from Slack API
    const slackUser = await client.users.info({ user: slackUserId });
    const email = slackUser.user?.profile?.email;

    if (!email) {
      logger.warn("Slack user email not found - user may have email hidden", {
        slackUserId,
        hasProfile: !!slackUser.user?.profile,
      });
      return null;
    }

    // Log the email lookup attempt
    logger.warn("Method 3 - Looking up Nubabel user by Slack email", {
      slackUserId,
      email: email.toLowerCase(),
      organizationId,
    });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      logger.warn("User found via email lookup", { slackUserId, email: email.toLowerCase(), userId: user.id });

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
        logger.warn("Auto-linked Slack identity via email", {
          slackUserId,
          userId: user.id,
          organizationId,
        });
      }
    } else {
      logger.warn("No Nubabel user found with Slack email", {
        slackUserId,
        email: email.toLowerCase(),
        organizationId,
      });
    }

    return user;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("getUserBySlackId error", { slackUserId, error: errorMessage });
      return null; // Return null instead of throwing to allow graceful handling
    }
  }); // End of runWithoutRLS
}

export async function getOrganizationBySlackWorkspace(workspaceId: string) {
  // Run with RLS bypass since this is called during auth bootstrap
  return runWithoutRLS(async () => {
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
  });
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
