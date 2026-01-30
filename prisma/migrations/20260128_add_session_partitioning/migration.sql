-- ============================================================================
-- Session Table Partitioning Migration
-- ============================================================================
--
-- PARTITIONING STRATEGY:
--
-- This migration creates a partitioned version of the "sessions" table using
-- PostgreSQL declarative range partitioning on the "created_at" column.
--
-- WHY PARTITION SESSIONS?
-- 1. Sessions grow unboundedly as users authenticate and interact with the system.
-- 2. Most queries target recent sessions (current month), so older partitions
--    are rarely accessed and can be archived or dropped independently.
-- 3. Partition pruning dramatically speeds up queries that filter on created_at.
-- 4. VACUUM and index maintenance operate per-partition, reducing lock contention.
--
-- APPROACH:
-- - We create a NEW partitioned table "sessions_partitioned" with the same schema.
-- - The original "sessions" table is NOT modified or dropped.
-- - Once validated, a cutover can be performed by renaming tables in a single
--   transaction (sessions -> sessions_old, sessions_partitioned -> sessions).
-- - A helper function creates monthly partitions on demand.
-- - A maintenance function ensures partitions exist for the next 3 months.
--
-- PARTITION NAMING CONVENTION:
--   sessions_YYYY_MM  (e.g., sessions_2026_01, sessions_2026_02)
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create the partitioned table (mirrors existing "sessions" schema)
-- ----------------------------------------------------------------------------

-- CreatePartition: Parent partitioned table
CREATE TABLE IF NOT EXISTS "sessions_partitioned" (
    "id"              VARCHAR(255)   NOT NULL,
    "user_id"         UUID           NOT NULL,
    "organization_id" UUID           NOT NULL,
    "token_hash"      VARCHAR(255),
    "source"          VARCHAR(50),
    "state"           JSONB          NOT NULL DEFAULT '{}',
    "history"         JSONB          NOT NULL DEFAULT '[]',
    "metadata"        JSONB          NOT NULL DEFAULT '{}',
    "expires_at"      TIMESTAMPTZ(6) NOT NULL,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Session hijacking prevention columns (added in 20260128_add_session_hijacking_prevention)
    "ip_address"      VARCHAR(45),
    "user_agent"      TEXT,

    -- In partitioned tables, the partition key must be part of the primary key.
    -- We use a composite primary key of (id, created_at) to satisfy this constraint.
    CONSTRAINT "sessions_partitioned_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

-- Add a comment describing the partitioning strategy
COMMENT ON TABLE "sessions_partitioned" IS
    'Partitioned sessions table (range on created_at by month). '
    'Mirrors the "sessions" table schema. Swap in via rename after validation.';

-- ----------------------------------------------------------------------------
-- 2. Create indexes on the partitioned table
-- ----------------------------------------------------------------------------
-- Note: Indexes on partitioned tables are automatically propagated to all
-- existing and future partitions.

-- CreatePartition: Indexes
CREATE INDEX IF NOT EXISTS "sessions_part_user_id_idx"
    ON "sessions_partitioned" ("user_id");

CREATE INDEX IF NOT EXISTS "sessions_part_organization_id_idx"
    ON "sessions_partitioned" ("organization_id");

CREATE INDEX IF NOT EXISTS "sessions_part_org_expires_idx"
    ON "sessions_partitioned" ("organization_id", "expires_at");

CREATE INDEX IF NOT EXISTS "sessions_part_token_hash_idx"
    ON "sessions_partitioned" ("token_hash");

CREATE INDEX IF NOT EXISTS "sessions_part_expires_at_idx"
    ON "sessions_partitioned" ("expires_at");

CREATE INDEX IF NOT EXISTS "sessions_part_source_idx"
    ON "sessions_partitioned" ("source");

CREATE INDEX IF NOT EXISTS "sessions_part_last_used_at_idx"
    ON "sessions_partitioned" ("last_used_at");

-- Note: UNIQUE constraints on partitioned tables must include the partition key.
-- The original "sessions" table had a unique constraint on token_hash alone.
-- For the partitioned table, we create a unique index on (token_hash, created_at).
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_part_token_hash_unique"
    ON "sessions_partitioned" ("token_hash", "created_at")
    WHERE "token_hash" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Helper function: create_monthly_partition(table_name, start_date)
-- ----------------------------------------------------------------------------
-- Creates a single monthly partition for the given table and start date.
-- Idempotent: uses IF NOT EXISTS so it can be called repeatedly.
--
-- Parameters:
--   table_name  - The parent partitioned table name (e.g., 'sessions_partitioned')
--   start_date  - The first day of the month for this partition (e.g., '2026-01-01')
--
-- Example:
--   SELECT create_monthly_partition('sessions_partitioned', '2026-01-01'::DATE);
--   -- Creates partition "sessions_partitioned_2026_01"
--   -- Range: [2026-01-01, 2026-02-01)

-- CreatePartition: Helper function for creating monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition(
    p_table_name TEXT,
    p_start_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_partition_name TEXT;
    v_start_bound    TEXT;
    v_end_bound      TEXT;
    v_year           TEXT;
    v_month          TEXT;
BEGIN
    -- Normalize start_date to the first day of its month
    p_start_date := date_trunc('month', p_start_date)::DATE;

    -- Build partition name: e.g., sessions_partitioned_2026_01
    v_year  := to_char(p_start_date, 'YYYY');
    v_month := to_char(p_start_date, 'MM');
    v_partition_name := p_table_name || '_' || v_year || '_' || v_month;

    -- Build range bounds
    v_start_bound := to_char(p_start_date, 'YYYY-MM-DD');
    v_end_bound   := to_char((p_start_date + INTERVAL '1 month')::DATE, 'YYYY-MM-DD');

    -- Create the partition if it does not already exist.
    -- We check pg_class to avoid errors on re-runs.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_partition_name
          AND n.nspname = 'public'
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            v_partition_name,
            p_table_name,
            v_start_bound,
            v_end_bound
        );

        -- Add a comment to the partition for documentation
        EXECUTE format(
            'COMMENT ON TABLE %I IS %L',
            v_partition_name,
            format('Monthly partition for %s: %s to %s (exclusive)', p_table_name, v_start_bound, v_end_bound)
        );

        RAISE NOTICE 'Created partition: %', v_partition_name;
    ELSE
        RAISE NOTICE 'Partition already exists: %', v_partition_name;
    END IF;

    RETURN v_partition_name;
END;
$$;

COMMENT ON FUNCTION create_monthly_partition(TEXT, DATE) IS
    'Creates a monthly range partition for the given table. Idempotent via IF NOT EXISTS check.';

-- ----------------------------------------------------------------------------
-- 4. Maintenance function: maintain_partitions()
-- ----------------------------------------------------------------------------
-- Ensures that partitions exist for the current month and the next 3 months.
-- Designed to be called periodically by pg_cron, an application scheduler,
-- or a Kubernetes CronJob.
--
-- Usage:
--   SELECT maintain_partitions();
--
-- Recommended schedule: Run daily or weekly via pg_cron:
--   SELECT cron.schedule('maintain-session-partitions', '0 3 * * 0', 'SELECT maintain_partitions()');
--   (Runs every Sunday at 3:00 AM)

-- CreatePartition: Maintenance function for auto-creating future partitions
CREATE OR REPLACE FUNCTION maintain_partitions()
RETURNS TABLE (
    partition_name TEXT,
    month_start    DATE,
    action         TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_month DATE;
    v_target_month  DATE;
    v_partition_name TEXT;
    v_months_ahead  INT;
    v_exists        BOOLEAN;
BEGIN
    -- Start from the first day of the current month
    v_current_month := date_trunc('month', CURRENT_DATE)::DATE;

    -- Ensure partitions exist for current month + next 3 months (4 total)
    FOR v_months_ahead IN 0..3 LOOP
        v_target_month := (v_current_month + (v_months_ahead || ' months')::INTERVAL)::DATE;

        -- Build expected partition name
        v_partition_name := 'sessions_partitioned_' || to_char(v_target_month, 'YYYY_MM');

        -- Check if partition exists
        SELECT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = v_partition_name
              AND n.nspname = 'public'
        ) INTO v_exists;

        IF v_exists THEN
            -- Partition already exists, report it
            partition_name := v_partition_name;
            month_start    := v_target_month;
            action         := 'already_exists';
            RETURN NEXT;
        ELSE
            -- Create the missing partition
            PERFORM create_monthly_partition('sessions_partitioned', v_target_month);
            partition_name := v_partition_name;
            month_start    := v_target_month;
            action         := 'created';
            RETURN NEXT;
        END IF;
    END LOOP;

    RETURN;
END;
$$;

COMMENT ON FUNCTION maintain_partitions() IS
    'Ensures partitions exist for the current month and 3 months ahead. '
    'Call via pg_cron weekly or from application scheduler.';

-- ----------------------------------------------------------------------------
-- 5. Create initial partitions: current month + next 3 months
-- ----------------------------------------------------------------------------
-- These cover January 2026 through April 2026.
-- After this migration, maintain_partitions() keeps things rolling forward.

-- CreatePartition: January 2026 (current month)
SELECT create_monthly_partition('sessions_partitioned', '2026-01-01'::DATE);

-- CreatePartition: February 2026
SELECT create_monthly_partition('sessions_partitioned', '2026-02-01'::DATE);

-- CreatePartition: March 2026
SELECT create_monthly_partition('sessions_partitioned', '2026-03-01'::DATE);

-- CreatePartition: April 2026
SELECT create_monthly_partition('sessions_partitioned', '2026-04-01'::DATE);

-- ----------------------------------------------------------------------------
-- 6. Create a default partition for safety
-- ----------------------------------------------------------------------------
-- Catches any rows with created_at outside the defined partition ranges.
-- This prevents INSERT failures if a row arrives before the earliest partition
-- or after the latest one (e.g., if maintain_partitions() hasn't run yet).

-- CreatePartition: Default partition (catch-all safety net)
CREATE TABLE IF NOT EXISTS "sessions_partitioned_default"
    PARTITION OF "sessions_partitioned" DEFAULT;

COMMENT ON TABLE "sessions_partitioned_default" IS
    'Default (catch-all) partition for sessions_partitioned. '
    'Rows landing here indicate maintain_partitions() may need to run. '
    'Monitor this partition and move rows to proper partitions as needed.';

-- ----------------------------------------------------------------------------
-- 7. Foreign key on user_id (same as original sessions table)
-- ----------------------------------------------------------------------------
-- Note: Foreign keys on partitioned tables are supported in PostgreSQL 12+.

ALTER TABLE "sessions_partitioned"
    ADD CONSTRAINT "sessions_partitioned_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users" ("id")
    ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 8. Data migration helper (optional, run manually during cutover)
-- ----------------------------------------------------------------------------
-- This function copies data from the original "sessions" table into
-- "sessions_partitioned". It is NOT executed automatically by this migration.
-- Run it during a maintenance window when ready to cut over.
--
-- Usage:
--   SELECT migrate_sessions_to_partitioned(1000);
--   -- Migrates in batches of 1000 rows
--
-- After migration:
--   BEGIN;
--   ALTER TABLE sessions RENAME TO sessions_legacy;
--   ALTER TABLE sessions_partitioned RENAME TO sessions;
--   COMMIT;

-- CreatePartition: Data migration helper function
CREATE OR REPLACE FUNCTION migrate_sessions_to_partitioned(
    p_batch_size INT DEFAULT 1000
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_migrated BIGINT := 0;
    v_batch_count    INT;
BEGIN
    LOOP
        -- Insert a batch from the original table that doesn't exist in partitioned yet
        WITH batch AS (
            SELECT s.*
            FROM "sessions" s
            WHERE NOT EXISTS (
                SELECT 1
                FROM "sessions_partitioned" sp
                WHERE sp."id" = s."id"
                  AND sp."created_at" = s."created_at"
            )
            LIMIT p_batch_size
            FOR UPDATE OF s SKIP LOCKED
        )
        INSERT INTO "sessions_partitioned" (
            "id", "user_id", "organization_id", "token_hash", "source",
            "state", "history", "metadata", "expires_at", "created_at",
            "last_used_at", "updated_at", "ip_address", "user_agent"
        )
        SELECT
            "id", "user_id", "organization_id", "token_hash", "source",
            "state", "history", "metadata", "expires_at", "created_at",
            "last_used_at", "updated_at", "ip_address", "user_agent"
        FROM batch
        ON CONFLICT ("id", "created_at") DO NOTHING;

        GET DIAGNOSTICS v_batch_count = ROW_COUNT;

        IF v_batch_count = 0 THEN
            EXIT;  -- No more rows to migrate
        END IF;

        v_total_migrated := v_total_migrated + v_batch_count;

        -- Yield control between batches to reduce lock pressure
        PERFORM pg_sleep(0.1);

        RAISE NOTICE 'Migrated % rows so far (batch of %)', v_total_migrated, v_batch_count;
    END LOOP;

    RAISE NOTICE 'Migration complete. Total rows migrated: %', v_total_migrated;
    RETURN v_total_migrated;
END;
$$;

COMMENT ON FUNCTION migrate_sessions_to_partitioned(INT) IS
    'Batch-migrates data from "sessions" to "sessions_partitioned". '
    'Run manually during cutover. Does NOT drop the original table.';

-- ============================================================================
-- CUTOVER INSTRUCTIONS (Do NOT run automatically)
-- ============================================================================
--
-- When ready to swap the partitioned table in:
--
-- 1. Stop application writes (or use a brief maintenance window)
--
-- 2. Run final data migration:
--    SELECT migrate_sessions_to_partitioned(5000);
--
-- 3. Verify row counts match:
--    SELECT count(*) FROM sessions;
--    SELECT count(*) FROM sessions_partitioned;
--
-- 4. Swap tables atomically:
--    BEGIN;
--    ALTER TABLE sessions RENAME TO sessions_legacy;
--    ALTER TABLE sessions_partitioned RENAME TO sessions;
--    -- Update foreign key constraint names if needed
--    COMMIT;
--
-- 5. Update Prisma schema if needed (table name is the same after rename)
--
-- 6. Resume application writes
--
-- 7. After validation period, drop the legacy table:
--    DROP TABLE sessions_legacy;
--
-- ============================================================================
-- SCHEDULED MAINTENANCE
-- ============================================================================
--
-- Set up pg_cron (if available) to auto-create partitions:
--
--   SELECT cron.schedule(
--       'maintain-session-partitions',
--       '0 3 * * 0',  -- Every Sunday at 3:00 AM UTC
--       'SELECT maintain_partitions()'
--   );
--
-- Or call maintain_partitions() from your application's scheduled job system.
-- ============================================================================
