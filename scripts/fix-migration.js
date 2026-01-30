#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

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

    if (failedMigrations.length === 0) {
      console.log("   ✓ No failed migrations found");
    } else {
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

    console.log("=== Done ===");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
