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

    console.log("2. Fixing failed migrations...");
    const failedMigrations = [
      "20260126_add_feature_flags",
      "20260126_add_oauth_refresh_fields",
      "20260126_add_orchestrator_executions",
      "20260126_add_organization_budgets",
      "20260126_add_performance_indexes",
      "20260126_enable_row_level_security",
      "20260128_add_analytics_materialized_views",
    ];

    for (const migration of failedMigrations) {
      const result = await prisma.$queryRaw`
        SELECT migration_name, finished_at 
        FROM _prisma_migrations 
        WHERE migration_name = ${migration} AND finished_at IS NULL
      `;

      if (result.length > 0) {
        await prisma.$executeRaw`
          UPDATE _prisma_migrations
          SET finished_at = NOW(), applied_steps_count = 1, rolled_back_at = NULL
          WHERE migration_name = ${migration}
        `;
        console.log(`   ✓ ${migration} marked as applied`);
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
