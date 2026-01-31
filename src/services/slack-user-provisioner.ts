import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { identityResolver } from "./identity";
import type { ExternalIdentityProfile } from "./identity/types";
import { runWithoutRLS } from "../utils/async-context";

interface SlackUserProfile {
  email?: string;
  displayName?: string;
  realName?: string;
  avatarUrl?: string;
  isBot?: boolean;
  isAdmin?: boolean;
}

/**
 * Provision a Slack user by linking to an existing or new internal User.
 * If the SlackUser already exists, updates lastSyncedAt and any changed profile fields.
 * If not, creates a new SlackUser (and User if needed).
 *
 * Note: This function runs with RLS bypassed since it's part of auth bootstrap.
 */
export async function provisionSlackUser(
  slackUserId: string,
  slackTeamId: string,
  organizationId: string,
  profile: SlackUserProfile
) {
  // Run with RLS bypass since this is auth bootstrap
  return runWithoutRLS(async () => {
    // Check if SlackUser already exists
    const existing = await prisma.slackUser.findUnique({
    where: { slackUserId },
    include: { user: true },
  });

  if (existing) {
    logger.info("Updating existing SlackUser", {
      slackUserId,
      slackTeamId,
      userId: existing.userId,
    });

    const updated = await prisma.slackUser.update({
      where: { slackUserId },
      data: {
        lastSyncedAt: new Date(),
        displayName: profile.displayName ?? existing.displayName,
        realName: profile.realName ?? existing.realName,
        email: profile.email ?? existing.email,
        avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
        isBot: profile.isBot ?? existing.isBot,
        isAdmin: profile.isAdmin ?? existing.isAdmin,
      },
      include: { user: true },
    });

    // Ensure user has membership in the organization (in case it was missing)
    if (!updated.isBot) {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: existing.userId,
          },
        },
      });

      if (!existingMembership) {
        logger.info("Creating missing membership for existing SlackUser", {
          slackUserId,
          userId: existing.userId,
          organizationId,
        });

        await prisma.membership.create({
          data: {
            organizationId,
            userId: existing.userId,
            role: "member",
          },
        });
      }
    }

    // Sync to ExternalIdentity for the unified identity system
    // This ensures ExternalIdentity records exist and enables auto-linking
    await syncToExternalIdentity(slackUserId, slackTeamId, organizationId, {
      email: updated.email ?? undefined,
      displayName: updated.displayName ?? undefined,
      realName: updated.realName ?? undefined,
      avatarUrl: updated.avatarUrl ?? undefined,
      isBot: updated.isBot,
      isAdmin: updated.isAdmin,
    });

    return updated;
  }

  // SlackUser does not exist - find or create a User
  let userId: string;

  if (profile.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingUser) {
      logger.info("Linking SlackUser to existing User by email", {
        slackUserId,
        email: profile.email,
        userId: existingUser.id,
      });
      userId = existingUser.id;
    } else {
      logger.info("Creating new User for SlackUser", {
        slackUserId,
        email: profile.email,
      });
      const newUser = await prisma.user.create({
        data: {
          email: profile.email,
          displayName: profile.displayName ?? profile.realName ?? null,
          avatarUrl: profile.avatarUrl ?? null,
        },
      });
      userId = newUser.id;
    }
  } else {
    // No email provided - create User with a placeholder email
    const placeholderEmail = `slack+${slackUserId}@placeholder.nubabel.com`;
    logger.info("Creating new User with placeholder email for SlackUser", {
      slackUserId,
      placeholderEmail,
    });
    const newUser = await prisma.user.create({
      data: {
        email: placeholderEmail,
        displayName: profile.displayName ?? profile.realName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      },
    });
    userId = newUser.id;
  }

  // Create the SlackUser record
  logger.info("Creating SlackUser record", {
    slackUserId,
    slackTeamId,
    organizationId,
    userId,
  });

  const slackUser = await prisma.slackUser.create({
    data: {
      slackUserId,
      slackTeamId,
      userId,
      organizationId,
      displayName: profile.displayName ?? null,
      realName: profile.realName ?? null,
      email: profile.email ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      isBot: profile.isBot ?? false,
      isAdmin: profile.isAdmin ?? false,
      lastSyncedAt: new Date(),
    },
    include: { user: true },
  });

  // Ensure user has membership in the organization (required for RLS and authorization)
  if (!profile.isBot) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (!existingMembership) {
      logger.info("Creating membership for Slack-provisioned user", {
        slackUserId,
        userId,
        organizationId,
      });

      await prisma.membership.create({
        data: {
          organizationId,
          userId,
          role: "member", // Default role for Slack-provisioned users
        },
      });
    }
  }

    // Also create/update ExternalIdentity for the unified identity system
    // This enables auto-linking and the admin dashboard
    await syncToExternalIdentity(slackUserId, slackTeamId, organizationId, profile);

    return slackUser;
  }); // End of runWithoutRLS
}

/**
 * Sync Slack user to ExternalIdentity system.
 * This creates the ExternalIdentity record and attempts auto-linking.
 * Uses retry logic for transient failures (e.g., circuit breaker).
 */
async function syncToExternalIdentity(
  slackUserId: string,
  slackTeamId: string,
  organizationId: string,
  profile: SlackUserProfile
): Promise<void> {
  // Skip bots for identity linking
  if (profile.isBot) {
    logger.debug("Skipping ExternalIdentity sync for bot user", { slackUserId });
    return;
  }

  const identityProfile: ExternalIdentityProfile = {
    provider: "slack",
    providerUserId: slackUserId,
    providerTeamId: slackTeamId,
    email: profile.email,
    displayName: profile.displayName,
    realName: profile.realName,
    avatarUrl: profile.avatarUrl,
    metadata: {
      isBot: profile.isBot ?? false,
      isAdmin: profile.isAdmin ?? false,
    },
  };

  // Retry configuration for transient failures
  const maxRetries = 3;
  const baseDelayMs = 500;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await identityResolver.resolveIdentity(identityProfile, {
        organizationId,
        performedBy: undefined, // System action
      });

      logger.info("ExternalIdentity sync completed", {
        slackUserId,
        action: result.action,
        linkedUserId: result.linkedUserId,
        externalIdentityId: result.externalIdentityId,
        attempt,
      });
      return; // Success - exit function
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();

      // Check if this is a transient error worth retrying
      const isTransientError =
        errorMessage.includes("circuit breaker") ||
        errorMessage.includes("connection") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("econnrefused") ||
        errorMessage.includes("temporarily unavailable");

      if (isTransientError && attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn("ExternalIdentity sync failed (transient), retrying...", {
          slackUserId,
          attempt,
          maxRetries,
          delayMs,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (!isTransientError) {
        // Non-transient error - log and exit without retrying
        logger.error("Failed to sync to ExternalIdentity (non-transient)", {
          slackUserId,
          error: lastError.message,
        });
        return;
      }
    }
  }

  // All retries exhausted - log at error level for visibility
  logger.error("Failed to sync to ExternalIdentity after all retries", {
    slackUserId,
    maxRetries,
    error: lastError?.message,
    hint: "Run 'SYNC SLACK USERS' from Admin > Identities to manually sync",
  });
}

/**
 * Sync a Slack user's profile fields on the SlackUser and linked User records.
 */
export async function syncSlackUserProfile(
  slackUserId: string,
  profile: {
    displayName?: string;
    realName?: string;
    email?: string;
    avatarUrl?: string;
    isAdmin?: boolean;
  }
) {
  logger.info("Syncing SlackUser profile", { slackUserId });

  const slackUser = await prisma.slackUser.update({
    where: { slackUserId },
    data: {
      displayName: profile.displayName,
      realName: profile.realName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      isAdmin: profile.isAdmin,
      lastSyncedAt: new Date(),
    },
  });

  // Also update the linked User record with relevant fields
  await prisma.user.update({
    where: { id: slackUser.userId },
    data: {
      ...(profile.displayName !== undefined && { displayName: profile.displayName }),
      ...(profile.avatarUrl !== undefined && { avatarUrl: profile.avatarUrl }),
    },
  });

  logger.info("SlackUser profile synced", {
    slackUserId,
    userId: slackUser.userId,
  });

  return slackUser;
}

/**
 * Get a SlackUser by Slack user ID, including the linked User relation.
 */
export async function getSlackUser(slackUserId: string) {
  logger.debug("Fetching SlackUser", { slackUserId });

  return prisma.slackUser.findUnique({
    where: { slackUserId },
    include: { user: true },
  });
}

/**
 * Get all SlackUsers for an organization.
 */
export async function getSlackUsersForOrg(organizationId: string) {
  logger.debug("Fetching SlackUsers for organization", { organizationId });

  return prisma.slackUser.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Soft-deactivate a SlackUser by clearing the lastSyncedAt timestamp.
 * The record is preserved for audit purposes but marked as inactive.
 */
export async function deactivateSlackUser(slackUserId: string) {
  logger.info("Deactivating SlackUser", { slackUserId });

  const slackUser = await prisma.slackUser.update({
    where: { slackUserId },
    data: {
      lastSyncedAt: null,
    },
  });

  logger.info("SlackUser deactivated", {
    slackUserId,
    userId: slackUser.userId,
  });

  return slackUser;
}
