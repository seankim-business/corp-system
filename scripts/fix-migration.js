#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("=== Database Migration Fix ===");

    // Check if core tables exist
    console.log("1. Checking if core tables exist...");
    let coreTablesExist = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM organizations LIMIT 1`;
      coreTablesExist = true;
      console.log("   ✓ Core tables exist - database is healthy");
    } catch (e) {
      console.log("   ⚠ Core tables missing - will reset migration history");
    }

    if (!coreTablesExist) {
      console.log("2. Clearing migration history for fresh start...");
      try {
        // Clear the _prisma_migrations table so migrate deploy runs everything fresh
        await prisma.$executeRawUnsafe(`DELETE FROM _prisma_migrations`);
        console.log("   ✓ Migration history cleared");
      } catch (e) {
        // Table might not exist yet, that's ok
        console.log("   ⚠ Migration table not found (first run)");
      }
      console.log("   → Prisma will now run all migrations from scratch");
    } else {
      // Tables exist, create helper function
      console.log("2. Creating RLS helper function...");
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION set_current_organization(org_id TEXT)
        RETURNS VOID AS $$
        BEGIN
          PERFORM set_config('app.current_organization_id', org_id, false);
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log("   ✓ set_current_organization function created");

      // Fix any failed migrations
      console.log("3. Fixing failed migrations...");
      const failedMigrations = await prisma.$queryRaw`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      `;

      if (failedMigrations.length > 0) {
        console.log(`   Found ${failedMigrations.length} failed migration(s)`);
        for (const { migration_name } of failedMigrations) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM _prisma_migrations WHERE migration_name = $1`,
            migration_name,
          );
          console.log(`   ✓ ${migration_name} removed (will be re-applied)`);
        }
      } else {
        console.log("   ✓ No failed migrations found");
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
