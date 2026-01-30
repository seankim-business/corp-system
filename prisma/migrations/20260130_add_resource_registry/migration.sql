-- Enterprise Resource Registry (ERR) Migration
-- Creates tables for external resource mapping and synchronization

-- CreateEnum
CREATE TYPE "ResourceProviderType" AS ENUM ('notion_database', 'google_sheets', 'slack_canvas', 'jira_project', 'confluence_page', 'clickup_list', 'airtable_base', 'custom_api');

-- CreateEnum
CREATE TYPE "InternalResourceType" AS ENUM ('vision', 'mission', 'goal', 'objective', 'key_result', 'strategy', 'business_model', 'value_stream', 'project', 'task', 'department', 'position', 'kpi', 'custom');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('pull_only', 'push_only', 'bidirectional', 'manual');

-- CreateTable
CREATE TABLE "resource_provider_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "provider_type" "ResourceProviderType" NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "connection_url" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "last_validated_at" TIMESTAMPTZ(6),
    "validation_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_resource_id" VARCHAR(500) NOT NULL,
    "external_resource_name" VARCHAR(500) NOT NULL,
    "internal_type" "InternalResourceType" NOT NULL,
    "custom_type_name" VARCHAR(100),
    "type_schema_id" UUID,
    "field_mappings" JSONB NOT NULL DEFAULT '{}',
    "sync_direction" "SyncDirection" NOT NULL DEFAULT 'pull_only',
    "sync_schedule" VARCHAR(100),
    "last_sync_at" TIMESTAMPTZ(6),
    "sync_error" TEXT,
    "detection_confidence" REAL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_linked_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "mapping_id" UUID NOT NULL,
    "external_record_id" VARCHAR(500) NOT NULL,
    "cached_data" JSONB NOT NULL DEFAULT '{}',
    "last_fetched_at" TIMESTAMPTZ(6),
    "internal_record_id" UUID,
    "internal_record_type" VARCHAR(100),
    "sync_status" VARCHAR(50) NOT NULL DEFAULT 'synced',
    "last_sync_at" TIMESTAMPTZ(6),
    "sync_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_linked_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID,
    "mapping_id" UUID,
    "operation" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "triggered_by" VARCHAR(100) NOT NULL,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_deleted" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_type_schemas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "internal_type" "InternalResourceType" NOT NULL,
    "custom_type_name" VARCHAR(100),
    "display_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "ai_detection_keywords" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "ai_detection_patterns" JSONB NOT NULL DEFAULT '[]',
    "example_data" JSONB NOT NULL DEFAULT '[]',
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_type_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_provider_connections_organization_id_idx" ON "resource_provider_connections"("organization_id");
CREATE INDEX "resource_provider_connections_provider_type_idx" ON "resource_provider_connections"("provider_type");
CREATE INDEX "resource_provider_connections_status_idx" ON "resource_provider_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "resource_mappings_connection_id_external_resource_id_key" ON "resource_mappings"("connection_id", "external_resource_id");
CREATE INDEX "resource_mappings_organization_id_idx" ON "resource_mappings"("organization_id");
CREATE INDEX "resource_mappings_connection_id_idx" ON "resource_mappings"("connection_id");
CREATE INDEX "resource_mappings_internal_type_idx" ON "resource_mappings"("internal_type");
CREATE INDEX "resource_mappings_is_active_idx" ON "resource_mappings"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "resource_linked_records_mapping_id_external_record_id_key" ON "resource_linked_records"("mapping_id", "external_record_id");
CREATE INDEX "resource_linked_records_organization_id_idx" ON "resource_linked_records"("organization_id");
CREATE INDEX "resource_linked_records_mapping_id_idx" ON "resource_linked_records"("mapping_id");
CREATE INDEX "resource_linked_records_external_record_id_idx" ON "resource_linked_records"("external_record_id");
CREATE INDEX "resource_linked_records_internal_record_id_idx" ON "resource_linked_records"("internal_record_id");
CREATE INDEX "resource_linked_records_sync_status_idx" ON "resource_linked_records"("sync_status");

-- CreateIndex
CREATE INDEX "resource_sync_logs_organization_id_created_at_idx" ON "resource_sync_logs"("organization_id", "created_at" DESC);
CREATE INDEX "resource_sync_logs_connection_id_idx" ON "resource_sync_logs"("connection_id");
CREATE INDEX "resource_sync_logs_mapping_id_idx" ON "resource_sync_logs"("mapping_id");
CREATE INDEX "resource_sync_logs_operation_idx" ON "resource_sync_logs"("operation");
CREATE INDEX "resource_sync_logs_status_idx" ON "resource_sync_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "resource_type_schemas_organization_id_internal_type_custom_key" ON "resource_type_schemas"("organization_id", "internal_type", "custom_type_name");
CREATE INDEX "resource_type_schemas_organization_id_idx" ON "resource_type_schemas"("organization_id");
CREATE INDEX "resource_type_schemas_internal_type_idx" ON "resource_type_schemas"("internal_type");
CREATE INDEX "resource_type_schemas_is_built_in_idx" ON "resource_type_schemas"("is_built_in");

-- AddForeignKey
ALTER TABLE "resource_provider_connections" ADD CONSTRAINT "resource_provider_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_mappings" ADD CONSTRAINT "resource_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_mappings" ADD CONSTRAINT "resource_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "resource_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_mappings" ADD CONSTRAINT "resource_mappings_type_schema_id_fkey" FOREIGN KEY ("type_schema_id") REFERENCES "resource_type_schemas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_linked_records" ADD CONSTRAINT "resource_linked_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_linked_records" ADD CONSTRAINT "resource_linked_records_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "resource_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_sync_logs" ADD CONSTRAINT "resource_sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_sync_logs" ADD CONSTRAINT "resource_sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "resource_provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resource_sync_logs" ADD CONSTRAINT "resource_sync_logs_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "resource_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_type_schemas" ADD CONSTRAINT "resource_type_schemas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
