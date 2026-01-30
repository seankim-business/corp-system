#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("=== Database Migration Fix ===");

    console.log("1. Creating RLS helper function...");
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION set_current_organization(org_id TEXT)
      RETURNS VOID AS $$
      BEGIN
        PERFORM set_config('app.current_organization_id', org_id, false);
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log("   ✓ set_current_organization function created");

    console.log("2. Finding all failed migrations...");
    const failedMigrations = await prisma.$queryRaw`
      SELECT migration_name 
      FROM _prisma_migrations 
      WHERE finished_at IS NULL
    `;

    if (failedMigrations.length > 0) {
      console.log(`   Found ${failedMigrations.length} failed migration(s)`);
      for (const { migration_name } of failedMigrations) {
        await prisma.$executeRawUnsafe(
          `
          UPDATE _prisma_migrations
          SET finished_at = NOW(), applied_steps_count = 1, rolled_back_at = NULL
          WHERE migration_name = $1
        `,
          migration_name,
        );
        console.log(`   ✓ ${migration_name} marked as applied`);
      }
    }

    console.log("3. Ensuring all migrations are registered...");
    const migrationsDir = path.join(__dirname, "../prisma/migrations");
    const migrationFolders = fs
      .readdirSync(migrationsDir)
      .filter(
        (f) =>
          f !== "migration_lock.toml" && fs.statSync(path.join(migrationsDir, f)).isDirectory(),
      )
      .sort();

    for (const migrationName of migrationFolders) {
      const exists = await prisma.$queryRaw`
        SELECT 1 FROM _prisma_migrations WHERE migration_name = ${migrationName}
      `;

      if (exists.length === 0) {
        const checksum = require("crypto").createHash("sha256").update(migrationName).digest("hex");

        await prisma.$executeRawUnsafe(
          `
          INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, started_at, applied_steps_count)
          VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), 1)
        `,
          checksum,
          migrationName,
        );
        console.log(`   ✓ ${migrationName} registered as applied`);
      }
    }

    console.log("=== Done ===");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
