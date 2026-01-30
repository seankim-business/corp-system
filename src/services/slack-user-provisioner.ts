import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";

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
 */
export async function provisionSlackUser(
  slackUserId: string,
  slackTeamId: string,
  organizationId: string,
  profile: SlackUserProfile
) {
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

  return slackUser;
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
