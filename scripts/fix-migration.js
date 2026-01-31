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
  "external_identities",
  "slack_users",
];

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("=== Database Migration Fix ===");

    // Pre-fix: Add missing columns that block db push
    console.log("0. Pre-fixing schema blockers...");
    const columnFixes = [
      {
        table: "marketplace_categories",
        column: "updated_at",
        sql: `ALTER TABLE marketplace_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP`
      },
      {
        table: "marketplace_categories",
        column: "created_at",
        sql: `ALTER TABLE marketplace_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP`
      },
    ];

    for (const fix of columnFixes) {
      try {
        await prisma.$executeRawUnsafe(fix.sql);
        console.log(`   ✓ ${fix.table}.${fix.column} ensured`);
      } catch (e) {
        // Ignore errors - table might not exist or column already has different type
      }
    }

    // Check if ALL essential tables exist
    console.log("\n1. Checking essential tables...");
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
      console.log(`\n2. Found ${missingTables.length} missing tables - creating directly...`);

      // Create missing tables directly with SQL
      for (const table of missingTables) {
        try {
          if (table === "memberships") {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "memberships" (
                "id" UUID NOT NULL,
                "organization_id" UUID NOT NULL,
                "user_id" UUID NOT NULL,
                "role" VARCHAR(50) NOT NULL,
                "permissions" JSONB NOT NULL DEFAULT '{}',
                "invited_by" UUID,
                "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "joined_at" TIMESTAMPTZ(6),
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "daily_briefing_enabled" BOOLEAN NOT NULL DEFAULT false,
                "daily_briefing_time" VARCHAR(5) NOT NULL DEFAULT '09:00',
                "daily_briefing_timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
                "mega_app_role_id" UUID,
                CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
              )
            `);
            // Add indexes and foreign keys
            await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "memberships_organization_id_idx" ON "memberships"("organization_id")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships"("user_id")`);
            console.log(`   ✓ ${table} created`);
          } else if (table === "approvals") {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "approvals" (
                "id" UUID NOT NULL,
                "organization_id" UUID NOT NULL,
                "requester_id" UUID NOT NULL,
                "approver_id" UUID NOT NULL,
                "fallback_approver_id" UUID,
                "type" VARCHAR(50) NOT NULL,
                "title" VARCHAR(500) NOT NULL,
                "description" TEXT NOT NULL,
                "context" JSONB,
                "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
                "response_note" TEXT,
                "slack_message_ts" VARCHAR(50),
                "slack_channel_id" VARCHAR(50),
                "expires_at" TIMESTAMPTZ(6) NOT NULL,
                "responded_at" TIMESTAMPTZ(6),
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMPTZ(6) NOT NULL,
                CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
              )
            `);
            // Add indexes
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "approvals_organization_id_status_idx" ON "approvals"("organization_id", "status")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "approvals_approver_id_status_idx" ON "approvals"("approver_id", "status")`);
            console.log(`   ✓ ${table} created`);
          } else if (table === "external_identities") {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "external_identities" (
                "id" UUID NOT NULL DEFAULT gen_random_uuid(),
                "organization_id" UUID NOT NULL,
                "user_id" UUID,
                "provider" VARCHAR(50) NOT NULL,
                "provider_user_id" VARCHAR(255) NOT NULL,
                "provider_team_id" VARCHAR(255),
                "email" VARCHAR(255),
                "display_name" VARCHAR(255),
                "real_name" VARCHAR(255),
                "avatar_url" TEXT,
                "metadata" JSONB NOT NULL DEFAULT '{}',
                "link_status" VARCHAR(20) NOT NULL DEFAULT 'unlinked',
                "link_method" VARCHAR(50),
                "link_confidence" REAL,
                "linked_at" TIMESTAMPTZ(6),
                "linked_by" UUID,
                "last_synced_at" TIMESTAMPTZ(6),
                "sync_error" TEXT,
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "external_identities_org_provider_user_unique" UNIQUE ("organization_id", "provider", "provider_user_id")
              )
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_external_identities_org" ON "external_identities"("organization_id")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_external_identities_org_user" ON "external_identities"("organization_id", "user_id")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_external_identities_provider_user" ON "external_identities"("provider_user_id")`);
            console.log(`   ✓ ${table} created`);
          } else if (table === "slack_users") {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "slack_users" (
                "id" UUID NOT NULL DEFAULT gen_random_uuid(),
                "slack_user_id" VARCHAR(50) NOT NULL,
                "slack_team_id" VARCHAR(50) NOT NULL,
                "user_id" UUID NOT NULL,
                "organization_id" UUID NOT NULL,
                "display_name" VARCHAR(255),
                "real_name" VARCHAR(255),
                "email" VARCHAR(255),
                "avatar_url" TEXT,
                "is_bot" BOOLEAN NOT NULL DEFAULT false,
                "is_admin" BOOLEAN NOT NULL DEFAULT false,
                "last_synced_at" TIMESTAMPTZ(6),
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "slack_users_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "slack_users_slack_user_id_key" UNIQUE ("slack_user_id")
              )
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "slack_users_organization_id_idx" ON "slack_users"("organization_id")`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "slack_users_user_id_idx" ON "slack_users"("user_id")`);
            console.log(`   ✓ ${table} created`);
          } else {
            console.log(`   ⚠ No SQL template for ${table}, trying db push...`);
            execSync("npx prisma db push --accept-data-loss", {
              stdio: "inherit",
              env: process.env
            });
          }
        } catch (e) {
          console.log(`   ⚠ Failed to create ${table}:`, e.message);
        }
      }
      console.log("   ✅ Missing tables created!");
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
