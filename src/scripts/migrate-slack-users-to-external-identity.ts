#!/usr/bin/env npx ts-node
/**
 * Migration Script: SlackUser -> ExternalIdentity
 *
 * Migrates existing SlackUser records to the new ExternalIdentity model.
 * This script is idempotent and can be run multiple times safely.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts [options]
 *
 * Options:
 *   --dry-run              Preview migration without making changes
 *   --batch-size=N         Process N records at a time (default: 100)
 *   --org-id=UUID          Migrate only records for specific organization
 *
 * Examples:
 *   npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts --dry-run
 *   npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts --batch-size=50
 *   npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts --org-id=123e4567-e89b-12d3-a456-426614174000
 */

import { db } from "../db/client";
import { auditLogger } from "../services/audit-logger";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  linkedUsers: number;
  unlinkedUsers: number;
}

interface SlackUserRecord {
  id: string;
  slackUserId: string;
  slackTeamId: string;
  userId: string;
  organizationId: string;
  displayName: string | null;
  realName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  isAdmin: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
  orgId?: string;
}

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: false,
    batchSize: 100,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--batch-size=")) {
      const size = parseInt(arg.split("=")[1], 10);
      if (isNaN(size) || size <= 0) {
        console.error(`Invalid batch size: ${arg}`);
        process.exit(1);
      }
      options.batchSize = size;
    } else if (arg.startsWith("--org-id=")) {
      options.orgId = arg.split("=")[1];
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error("\nUsage: npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts [options]");
      console.error("Options:");
      console.error("  --dry-run              Preview migration without making changes");
      console.error("  --batch-size=N         Process N records at a time (default: 100)");
      console.error("  --org-id=UUID          Migrate only records for specific organization");
      process.exit(1);
    }
  }

  return options;
}

// =============================================================================
// MIGRATION LOGIC
// =============================================================================

async function checkExistingIdentity(
  slackUserId: string,
  slackTeamId: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await db.externalIdentity.findFirst({
    where: {
      provider: "slack",
      providerUserId: slackUserId,
      providerTeamId: slackTeamId,
      organizationId,
    },
  });

  return !!existing;
}

async function migrateSlackUser(
  slackUser: SlackUserRecord,
  dryRun: boolean,
  stats: MigrationStats,
): Promise<void> {
  const { slackUserId, slackTeamId, organizationId, userId } = slackUser;

  // Check if ExternalIdentity already exists (idempotency)
  const exists = await checkExistingIdentity(slackUserId, slackTeamId, organizationId);

  if (exists) {
    logger.debug("ExternalIdentity already exists, skipping", {
      slackUserId,
      slackTeamId,
      organizationId,
    });
    stats.skipped++;
    return;
  }

  // Determine link status and method
  const hasUserId = !!userId;
  const linkStatus = hasUserId ? "linked" : "unlinked";
  const linkMethod = hasUserId ? "migration" : undefined;
  const linkedAt = hasUserId ? slackUser.createdAt : undefined;

  if (hasUserId) {
    stats.linkedUsers++;
  } else {
    stats.unlinkedUsers++;
  }

  // Build metadata
  const metadata = {
    isBot: slackUser.isBot,
    isAdmin: slackUser.isAdmin,
    migratedFrom: "SlackUser",
    migratedAt: new Date().toISOString(),
    originalId: slackUser.id,
  };

  if (dryRun) {
    logger.info("[DRY RUN] Would create ExternalIdentity", {
      provider: "slack",
      providerUserId: slackUserId,
      providerTeamId: slackTeamId,
      organizationId,
      userId: userId || null,
      linkStatus,
      linkMethod,
      email: slackUser.email,
      displayName: slackUser.displayName,
      realName: slackUser.realName,
      avatarUrl: slackUser.avatarUrl,
      metadata,
    });
    stats.migrated++;
    return;
  }

  try {
    // Create ExternalIdentity record
    await db.externalIdentity.create({
      data: {
        provider: "slack",
        providerUserId: slackUserId,
        providerTeamId: slackTeamId,
        organizationId,
        userId: userId || null,
        email: slackUser.email,
        displayName: slackUser.displayName,
        realName: slackUser.realName,
        avatarUrl: slackUser.avatarUrl,
        metadata,
        linkStatus,
        linkMethod,
        linkConfidence: hasUserId ? 1.0 : null,
        linkedAt,
        linkedBy: null, // Migration has no specific user
        lastSyncedAt: slackUser.lastSyncedAt,
        syncError: null,
      },
    });

    // Create audit log
    await auditLogger.log({
      action: "data.import" as any,
      organizationId,
      userId: userId || undefined,
      resourceType: "external_identity",
      resourceId: slackUserId,
      details: {
        migration: "slack_user_to_external_identity",
        provider: "slack",
        providerUserId: slackUserId,
        linkStatus,
        linkMethod,
        originalSlackUserId: slackUser.id,
      },
      success: true,
    });

    logger.info("Migrated SlackUser to ExternalIdentity", {
      slackUserId,
      linkStatus,
      organizationId,
    });

    stats.migrated++;
  } catch (error) {
    logger.error("Failed to migrate SlackUser", {
      slackUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    stats.errors++;
    throw error; // Re-throw to trigger transaction rollback
  }
}

async function processBatch(
  slackUsers: SlackUserRecord[],
  options: MigrationOptions,
  stats: MigrationStats,
): Promise<void> {
  if (options.dryRun) {
    // Dry run: process without transaction
    for (const slackUser of slackUsers) {
      await migrateSlackUser(slackUser, true, stats);
    }
  } else {
    // Real run: use transaction for atomicity
    await db.$transaction(async (_tx) => {
      for (const slackUser of slackUsers) {
        await migrateSlackUser(slackUser, false, stats);
      }
    });
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const options = parseArgs();

  console.log("========================================");
  console.log("  SlackUser -> ExternalIdentity Migration");
  console.log("========================================");
  console.log(`Mode:       ${options.dryRun ? "DRY RUN (no changes)" : "LIVE MIGRATION"}`);
  console.log(`Batch Size: ${options.batchSize}`);
  if (options.orgId) {
    console.log(`Org Filter: ${options.orgId}`);
  }
  console.log("========================================\n");

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    linkedUsers: 0,
    unlinkedUsers: 0,
  };

  try {
    // Count total records to migrate
    const where = options.orgId ? { organizationId: options.orgId } : {};
    const totalCount = await db.slackUser.count({ where });

    if (totalCount === 0) {
      console.log("No SlackUser records found to migrate.");
      return;
    }

    stats.total = totalCount;
    console.log(`Found ${totalCount} SlackUser records to process.\n`);

    // Process in batches
    let offset = 0;
    let batchNumber = 1;

    while (offset < totalCount) {
      console.log(`Processing batch ${batchNumber} (records ${offset + 1}-${Math.min(offset + options.batchSize, totalCount)})...`);

      // Fetch batch
      const slackUsers = await db.slackUser.findMany({
        where,
        take: options.batchSize,
        skip: offset,
        orderBy: { createdAt: "asc" },
      }) as SlackUserRecord[];

      // Process batch
      try {
        await processBatch(slackUsers, options, stats);
      } catch (error) {
        logger.error("Batch processing failed, rolling back", {
          batchNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next batch (errors are already counted in stats)
      }

      offset += options.batchSize;
      batchNumber++;

      // Progress update
      const progress = Math.min((offset / totalCount) * 100, 100);
      console.log(`Progress: ${progress.toFixed(1)}%\n`);
    }

    // Flush audit logs
    await auditLogger.flush();

    // Summary
    console.log("\n========================================");
    console.log("  MIGRATION SUMMARY");
    console.log("========================================");
    console.log(`Total Records:      ${stats.total}`);
    console.log(`Migrated:           ${stats.migrated}`);
    console.log(`Skipped (existing): ${stats.skipped}`);
    console.log(`Errors:             ${stats.errors}`);
    console.log(`  - Linked Users:   ${stats.linkedUsers}`);
    console.log(`  - Unlinked Users: ${stats.unlinkedUsers}`);
    console.log("========================================\n");

    if (options.dryRun) {
      console.log("This was a DRY RUN. No changes were made.");
      console.log("Run without --dry-run to perform actual migration.\n");
    } else {
      console.log("Migration completed successfully!");
      if (stats.errors > 0) {
        console.log(`⚠️  ${stats.errors} records failed to migrate. Check logs for details.\n`);
        process.exit(1);
      }
    }
  } catch (error) {
    logger.error("Migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("\n❌ Migration failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main, parseArgs, migrateSlackUser };
