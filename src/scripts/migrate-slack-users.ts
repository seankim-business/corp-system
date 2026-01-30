/**
 * Migration Script: SlackUser → ExternalIdentity
 *
 * Migrates existing SlackUser records to the new unified ExternalIdentity system.
 * Safe to run multiple times (idempotent).
 *
 * Usage: npx ts-node src/scripts/migrate-slack-users.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

async function migrateSlackUsers(dryRun: boolean = false): Promise<MigrationStats> {
  console.log("🚀 Starting SlackUser → ExternalIdentity migration...");
  console.log(`   Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log("");

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  // Fetch all SlackUser records
  const slackUsers = await prisma.slackUser.findMany({
    include: {
      user: true,
    },
  });

  stats.total = slackUsers.length;
  console.log(`📊 Found ${stats.total} SlackUser records to process`);
  console.log("");

  for (const slackUser of slackUsers) {
    try {
      // Check if already migrated
      const existing = await prisma.externalIdentity.findUnique({
        where: {
          organizationId_provider_providerUserId: {
            organizationId: slackUser.organizationId,
            provider: "slack",
            providerUserId: slackUser.slackUserId,
          },
        },
      });

      if (existing) {
        console.log(`⏭️  Skipped: ${slackUser.slackUserId} (already exists)`);
        stats.skipped++;
        continue;
      }

      // Prepare data for ExternalIdentity
      const identityData = {
        organizationId: slackUser.organizationId,
        userId: slackUser.userId,
        provider: "slack" as const,
        providerUserId: slackUser.slackUserId,
        providerTeamId: slackUser.slackTeamId,
        email: slackUser.email,
        displayName: slackUser.displayName,
        realName: slackUser.realName,
        avatarUrl: slackUser.avatarUrl,
        metadata: {
          isBot: slackUser.isBot,
          isAdmin: slackUser.isAdmin,
          migratedFrom: "SlackUser",
          migratedAt: new Date().toISOString(),
        },
        linkStatus: "linked" as const,
        linkMethod: "migration" as const,
        linkConfidence: 0.95,
        linkedAt: slackUser.createdAt,
        linkedBy: null, // System migration
        lastSyncedAt: slackUser.lastSyncedAt,
      };

      if (dryRun) {
        console.log(`✅ Would migrate: ${slackUser.slackUserId} → User ${slackUser.userId}`);
        stats.migrated++;
      } else {
        // Create ExternalIdentity
        await prisma.externalIdentity.create({
          data: identityData,
        });
        console.log(`✅ Migrated: ${slackUser.slackUserId} → User ${slackUser.userId}`);
        stats.migrated++;
      }
    } catch (error) {
      console.error(`❌ Error migrating ${slackUser.slackUserId}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  try {
    const stats = await migrateSlackUsers(dryRun);

    console.log("");
    console.log("═══════════════════════════════════════════");
    console.log("📈 Migration Summary");
    console.log("═══════════════════════════════════════════");
    console.log(`   Total SlackUsers:  ${stats.total}`);
    console.log(`   Migrated:          ${stats.migrated}`);
    console.log(`   Skipped (exists):  ${stats.skipped}`);
    console.log(`   Errors:            ${stats.errors}`);
    console.log("═══════════════════════════════════════════");

    if (dryRun) {
      console.log("");
      console.log("💡 This was a dry run. Run without --dry-run to apply changes.");
    }

    if (stats.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
