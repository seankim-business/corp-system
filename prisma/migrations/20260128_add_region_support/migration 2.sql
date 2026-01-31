-- Multi-region Support Migration
-- Adds region assignment and data residency tracking to organizations

-- Add regionId column to organizations table
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "region_id" VARCHAR(50) DEFAULT 'us-east';

-- Add data residency tracking (JSON for flexibility)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "data_residency" JSONB DEFAULT '{}';

-- Create index for region-based queries
CREATE INDEX IF NOT EXISTS "idx_organizations_region_id" ON "organizations" ("region_id");

-- Create region health tracking table
CREATE TABLE IF NOT EXISTS "region_health" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "region_id" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'healthy',
  "database_healthy" BOOLEAN DEFAULT true,
  "redis_healthy" BOOLEAN DEFAULT true,
  "storage_healthy" BOOLEAN DEFAULT true,
  "latency_ms" INTEGER,
  "error_count" INTEGER DEFAULT 0,
  "last_check_at" TIMESTAMPTZ DEFAULT NOW(),
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("region_id")
);

CREATE INDEX IF NOT EXISTS "idx_region_health_status" ON "region_health" ("status");
CREATE INDEX IF NOT EXISTS "idx_region_health_last_check" ON "region_health" ("last_check_at");

-- Create region failover events table for audit
CREATE TABLE IF NOT EXISTS "region_failover_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID REFERENCES "organizations"("id") ON DELETE CASCADE,
  "from_region" VARCHAR(50) NOT NULL,
  "to_region" VARCHAR(50) NOT NULL,
  "reason" TEXT,
  "automatic" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_region_failover_org" ON "region_failover_events" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_region_failover_created" ON "region_failover_events" ("created_at" DESC);

-- Add comment explaining the data_residency JSON structure
COMMENT ON COLUMN "organizations"."data_residency" IS 'JSON structure: { primary: string, backup?: string, compliance: string[], dataRetentionDays?: number }';

-- Insert default region health records
INSERT INTO "region_health" ("region_id", "status") VALUES
  ('us-east', 'healthy'),
  ('us-west', 'healthy'),
  ('eu-west', 'healthy'),
  ('eu-north', 'healthy'),
  ('ap-northeast', 'healthy'),
  ('ap-southeast', 'healthy')
ON CONFLICT ("region_id") DO NOTHING;
