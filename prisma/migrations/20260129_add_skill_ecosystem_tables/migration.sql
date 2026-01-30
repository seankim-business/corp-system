-- Skill & MCP Ecosystem Migration
-- Drop old marketplace tables (schema evolved significantly)
DROP TABLE IF EXISTS "publisher_payouts" CASCADE;
DROP TABLE IF EXISTS "extension_purchases" CASCADE;
DROP TABLE IF EXISTS "extension_installs" CASCADE;
DROP TABLE IF EXISTS "review_helpful_votes" CASCADE;
DROP TABLE IF EXISTS "extension_reviews" CASCADE;
DROP TABLE IF EXISTS "extension_versions" CASCADE;
DROP TABLE IF EXISTS "marketplace_extensions" CASCADE;
DROP TABLE IF EXISTS "marketplace_categories" CASCADE;
DROP TABLE IF EXISTS "publishers" CASCADE;

-- Drop new tables if they exist (idempotent)
DROP TABLE IF EXISTS "agent_skill_assignments" CASCADE;
DROP TABLE IF EXISTS "skill_learning_patterns" CASCADE;
DROP TABLE IF EXISTS "extension_usage_logs" CASCADE;
DROP TABLE IF EXISTS "extension_permissions" CASCADE;
DROP TABLE IF EXISTS "extension_installations" CASCADE;
DROP TABLE IF EXISTS "extension_publishers" CASCADE;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExtensionType" AS ENUM ('extension', 'skill', 'mcp_server');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: marketplace_extensions
CREATE TABLE "marketplace_extensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "extension_type" "ExtensionType" NOT NULL DEFAULT 'extension',
    "category" VARCHAR(50) NOT NULL,
    "tags" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "source" VARCHAR(50),
    "format" VARCHAR(20),
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "definition" JSONB,
    "runtime_type" VARCHAR(30),
    "runtime_config" JSONB,
    "triggers" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "dependencies" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "tools_required" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "mcp_providers" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "publisher_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by" UUID,

    CONSTRAINT "marketplace_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: extension_versions
CREATE TABLE "extension_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extension_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "manifest" JSONB NOT NULL,
    "definition" JSONB,
    "changelog" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by" UUID,

    CONSTRAINT "extension_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: extension_installations
CREATE TABLE "extension_installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "config_overrides" JSONB,
    "credentials" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "auto_update" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "installed_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: extension_publishers
CREATE TABLE "extension_publishers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: extension_permissions
CREATE TABLE "extension_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "extension_id" UUID,
    "category" VARCHAR(50),
    "agent_id" UUID,
    "role_id" VARCHAR(50),
    "can_execute" BOOLEAN NOT NULL DEFAULT true,
    "can_configure" BOOLEAN NOT NULL DEFAULT false,
    "can_install" BOOLEAN NOT NULL DEFAULT false,
    "allowed_tools" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "denied_tools" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: extension_usage_logs
CREATE TABLE "extension_usage_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "agent_id" UUID,
    "session_id" VARCHAR(255),
    "execution_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: skill_learning_patterns
CREATE TABLE "skill_learning_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pattern_hash" VARCHAR(64) NOT NULL,
    "pattern_type" VARCHAR(30) NOT NULL,
    "steps" JSONB NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "trigger_phrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context_tags" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'detected',
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "skill_learning_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_skill_assignments
CREATE TABLE "agent_skill_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "assignment_type" VARCHAR(20) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "config_overrides" JSONB,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "agent_skill_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_extensions_organization_id_slug_key" ON "marketplace_extensions"("organization_id", "slug");
CREATE INDEX "marketplace_extensions_organization_id_idx" ON "marketplace_extensions"("organization_id");
CREATE INDEX "marketplace_extensions_extension_type_idx" ON "marketplace_extensions"("extension_type");
CREATE INDEX "marketplace_extensions_category_idx" ON "marketplace_extensions"("category");
CREATE INDEX "marketplace_extensions_is_public_status_idx" ON "marketplace_extensions"("is_public", "status");

CREATE UNIQUE INDEX "extension_versions_extension_id_version_key" ON "extension_versions"("extension_id", "version");
CREATE INDEX "extension_versions_extension_id_idx" ON "extension_versions"("extension_id");

CREATE UNIQUE INDEX "extension_installations_organization_id_extension_id_key" ON "extension_installations"("organization_id", "extension_id");
CREATE INDEX "extension_installations_organization_id_idx" ON "extension_installations"("organization_id");
CREATE INDEX "extension_installations_extension_id_idx" ON "extension_installations"("extension_id");

CREATE UNIQUE INDEX "extension_publishers_slug_key" ON "extension_publishers"("slug");
CREATE INDEX "extension_publishers_organization_id_idx" ON "extension_publishers"("organization_id");

CREATE INDEX "extension_permissions_organization_id_idx" ON "extension_permissions"("organization_id");
CREATE INDEX "extension_permissions_extension_id_idx" ON "extension_permissions"("extension_id");
CREATE INDEX "extension_permissions_agent_id_idx" ON "extension_permissions"("agent_id");

CREATE INDEX "extension_usage_logs_organization_id_created_at_idx" ON "extension_usage_logs"("organization_id", "created_at" DESC);
CREATE INDEX "extension_usage_logs_extension_id_idx" ON "extension_usage_logs"("extension_id");

CREATE UNIQUE INDEX "skill_learning_patterns_organization_id_pattern_hash_key" ON "skill_learning_patterns"("organization_id", "pattern_hash");
CREATE INDEX "skill_learning_patterns_organization_id_idx" ON "skill_learning_patterns"("organization_id");
CREATE INDEX "skill_learning_patterns_status_idx" ON "skill_learning_patterns"("status");

CREATE UNIQUE INDEX "agent_skill_assignments_agent_id_extension_id_key" ON "agent_skill_assignments"("agent_id", "extension_id");
CREATE INDEX "agent_skill_assignments_organization_id_idx" ON "agent_skill_assignments"("organization_id");
CREATE INDEX "agent_skill_assignments_agent_id_idx" ON "agent_skill_assignments"("agent_id");

-- AddForeignKey
ALTER TABLE "marketplace_extensions" ADD CONSTRAINT "marketplace_extensions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_extensions" ADD CONSTRAINT "marketplace_extensions_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "extension_publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extension_versions" ADD CONSTRAINT "extension_versions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extension_permissions" ADD CONSTRAINT "extension_permissions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extension_permissions" ADD CONSTRAINT "extension_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extension_usage_logs" ADD CONSTRAINT "extension_usage_logs_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extension_usage_logs" ADD CONSTRAINT "extension_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_learning_patterns" ADD CONSTRAINT "skill_learning_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
