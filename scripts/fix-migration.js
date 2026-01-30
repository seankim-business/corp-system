#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");

// Essential tables that must exist for the app to function
const ESSENTIAL_TABLES = [
  "organizations",
  "users",
  "memberships",
  "sessions",
  "approvals",
];

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("=== Database Migration Fix ===");

    // Check if ALL essential tables exist
    console.log("1. Checking essential tables...");
    const missingTables = [];
    for (const table of ESSENTIAL_TABLES) {
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM ${table} LIMIT 1`);
        console.log(`   ✓ ${table} exists`);
      } catch (e) {
        missingTables.push(table);
        console.log(`   ✗ ${table} MISSING`);
      }
    }

    if (missingTables.length > 0) {
      console.log(`\n2. Found ${missingTables.length} missing tables - forcing schema sync...`);
      console.log("   Running: npx prisma db push --accept-data-loss");
      try {
        execSync("npx prisma db push --accept-data-loss", {
          stdio: "inherit",
          env: process.env
        });
        console.log("   ✅ Schema synchronized successfully!");
      } catch (e) {
        console.log("   ⚠ db push failed:", e.message);
      }
    } else {
      console.log("   ✅ All essential tables exist!");

      // Create RLS helper function
      console.log("\n2. Creating RLS helper function...");
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION set_current_organization(org_id TEXT)
        RETURNS VOID AS $$
        BEGIN
          PERFORM set_config('app.current_organization_id', org_id, false);
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log("   ✓ set_current_organization function created");
    }

    console.log("\n=== Done ===");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
