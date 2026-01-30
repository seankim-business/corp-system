#!/usr/bin/env node
/**
 * Resolve Failed Migration Script
 *
 * This script marks a failed migration as applied when the schema is already in place.
 * Use when a migration failed to apply but the database already has the correct schema.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/resolve-failed-migration.js <migration_name>
 */

const { PrismaClient } = require('@prisma/client');

async function resolveMigration(migrationName) {
  const prisma = new PrismaClient();

  try {
    console.log(`Checking migration: ${migrationName}`);

    // Check current state
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      WHERE migration_name = ${migrationName}
    `;

    if (migrations.length === 0) {
      console.log('Migration not found in _prisma_migrations table');
      return;
    }

    const migration = migrations[0];
    console.log('Current state:', JSON.stringify(migration, null, 2));

    if (migration.rolled_back_at) {
      console.log('Migration was rolled back. Marking as applied...');

      // Update the migration to be marked as applied
      await prisma.$executeRaw`
        UPDATE _prisma_migrations
        SET rolled_back_at = NULL,
            finished_at = NOW(),
            applied_steps_count = 1
        WHERE migration_name = ${migrationName}
      `;

      console.log('Migration marked as applied successfully');
    } else if (migration.finished_at) {
      console.log('Migration is already applied');
    } else {
      console.log('Migration is in an unknown state');
    }

    // Verify
    const updated = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name = ${migrationName}
    `;
    console.log('Updated state:', JSON.stringify(updated[0], null, 2));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const migrationName = process.argv[2] || '20260130075319_add_marketplace_hub';
resolveMigration(migrationName);
