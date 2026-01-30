/*
  Warnings:

  - You are about to drop the column `rate_limit_tier` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `requests_per_day` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `requests_per_minute` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `total_requests` on the `api_keys` table. All the data in the column will be lost.
  - You are about to alter the column `key_prefix` on the `api_keys` table. The data in that column could be lost. The data in that column will be cast from `VarChar(12)` to `VarChar(10)`.
  - You are about to drop the column `attributes` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `entity_name` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `last_mentioned` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `mention_count` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `relationships` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `entity_memories` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `hosted_invoice_url` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `invoice_pdf_url` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `line_items` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `number` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `organization_id` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_payment_intent_id` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `key` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `scope` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `scope_id` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `source_id` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `source_type` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `memories` table. All the data in the column will be lost.
  - The `importance` column on the `memories` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `api_key` on the `notion_connections` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `default_database_id` on the `notion_connections` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the column `failure_count` on the `public_webhooks` table. All the data in the column will be lost.
  - You are about to drop the column `last_failure` on the `public_webhooks` table. All the data in the column will be lost.
  - You are about to drop the column `last_success` on the `public_webhooks` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `public_webhooks` table. All the data in the column will be lost.
  - You are about to drop the column `action` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `actual_ip` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `actual_user_agent` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `expected_ip` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `expected_user_agent` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `request_method` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `request_path` on the `session_hijacking_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `billing_interval` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `canceled_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `custom_limits` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_price_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `trial_end` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `trial_start` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `metric` on the `usage_records` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `usage_records` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `usage_records` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `usage_records` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `webhook_deliveries` table. All the data in the column will be lost.
  - You are about to drop the column `event` on the `webhook_deliveries` table. All the data in the column will be lost.
  - You are about to drop the column `response_status` on the `webhook_deliveries` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to drop the column `input` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to drop the column `output` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `workflow_executions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to drop the column `created_by` on the `workflows` table. All the data in the column will be lost.
  - You are about to drop the column `trigger` on the `workflows` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `workflows` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the `organization_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions_partitioned` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `content` to the `entity_memories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entity_id` to the `entity_memories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `memory_type` to the `entity_memories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amount_due` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Made the column `subscription_id` on table `invoices` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `namespace` to the `mcp_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `memories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by` to the `public_webhooks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `public_webhooks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `session_hijacking_attempts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cost_cents` to the `usage_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `input_tokens` to the `usage_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `usage_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `output_tokens` to the `usage_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `event_type` to the `webhook_deliveries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `webhook_deliveries` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "agent_activities" DROP CONSTRAINT "agent_activities_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_activities" DROP CONSTRAINT "agent_activities_parent_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT "organization_members_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT "organization_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions_partitioned" DROP CONSTRAINT "sessions_partitioned_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_created_by_fkey";

-- DropIndex
DROP INDEX "agent_activities_organization_id_created_at_idx";

-- DropIndex
DROP INDEX "api_keys_created_at_idx";

-- DropIndex
DROP INDEX "api_keys_status_idx";

-- DropIndex
DROP INDEX "entity_memories_organization_id_entity_type_entity_name_key";

-- DropIndex
DROP INDEX "entity_memories_organization_id_entity_type_idx";

-- DropIndex
DROP INDEX "entity_memories_organization_id_last_mentioned_idx";

-- DropIndex
DROP INDEX "invoices_created_at_idx";

-- DropIndex
DROP INDEX "invoices_organization_id_idx";

-- DropIndex
DROP INDEX "invoices_stripe_invoice_id_idx";

-- DropIndex
DROP INDEX "idx_mcp_connections_provider";

-- DropIndex
DROP INDEX "mcp_connections_expires_at_idx";

-- DropIndex
DROP INDEX "mcp_connections_org_provider_name_unique";

-- DropIndex
DROP INDEX "memories_expires_at_idx";

-- DropIndex
DROP INDEX "memories_organization_id_scope_scope_id_idx";

-- DropIndex
DROP INDEX "memories_organization_id_scope_scope_id_key_key";

-- DropIndex
DROP INDEX "public_webhooks_organization_id_status_idx";

-- DropIndex
DROP INDEX "public_webhooks_status_idx";

-- DropIndex
DROP INDEX "session_hijacking_attempts_blocked_idx";

-- DropIndex
DROP INDEX "session_hijacking_attempts_mismatch_type_idx";

-- DropIndex
DROP INDEX "session_hijacking_attempts_organization_id_created_at_idx";

-- DropIndex
DROP INDEX "session_hijacking_attempts_user_id_created_at_idx";

-- DropIndex
DROP INDEX "subscriptions_organization_id_idx";

-- DropIndex
DROP INDEX "subscriptions_plan_id_idx";

-- DropIndex
DROP INDEX "subscriptions_status_idx";

-- DropIndex
DROP INDEX "subscriptions_stripe_customer_id_key";

-- DropIndex
DROP INDEX "subscriptions_stripe_subscription_id_key";

-- DropIndex
DROP INDEX "usage_records_metric_idx";

-- DropIndex
DROP INDEX "usage_records_organization_id_idx";

-- DropIndex
DROP INDEX "usage_records_organization_id_metric_period_key";

-- DropIndex
DROP INDEX "usage_records_period_idx";

-- DropIndex
DROP INDEX "webhook_deliveries_created_at_idx";

-- DropIndex
DROP INDEX "idx_workflow_executions_workflow";

-- DropIndex
DROP INDEX "idx_workflows_org_enabled";

-- AlterTable
ALTER TABLE "agent_activities" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "skills" SET DEFAULT ARRAY[]::VARCHAR(100)[],
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "agent_skill_assignments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "rate_limit_tier",
DROP COLUMN "requests_per_day",
DROP COLUMN "requests_per_minute",
DROP COLUMN "status",
DROP COLUMN "total_requests",
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rate_limit" INTEGER NOT NULL DEFAULT 1000,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "key_prefix" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "scopes" SET DATA TYPE VARCHAR(100)[];

-- AlterTable
ALTER TABLE "entity_memories" DROP COLUMN "attributes",
DROP COLUMN "entity_name",
DROP COLUMN "last_mentioned",
DROP COLUMN "mention_count",
DROP COLUMN "notes",
DROP COLUMN "relationships",
DROP COLUMN "updated_at",
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "entity_id" UUID NOT NULL,
ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "memory_type" VARCHAR(100) NOT NULL,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "entity_type" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "extension_installations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "extension_permissions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "extension_publishers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "extension_usage_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "extension_versions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "amount",
DROP COLUMN "hosted_invoice_url",
DROP COLUMN "invoice_pdf_url",
DROP COLUMN "line_items",
DROP COLUMN "metadata",
DROP COLUMN "number",
DROP COLUMN "organization_id",
DROP COLUMN "stripe_payment_intent_id",
ADD COLUMN     "amount_due" INTEGER NOT NULL,
ADD COLUMN     "amount_paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoice_url" TEXT,
ADD COLUMN     "pdf_url" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "subscription_id" SET NOT NULL,
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "period_start" DROP NOT NULL,
ALTER COLUMN "period_end" DROP NOT NULL;

-- AlterTable
ALTER TABLE "marketplace_extensions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mcp_connections" ADD COLUMN     "namespace" VARCHAR(100) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "memories" DROP COLUMN "expires_at",
DROP COLUMN "key",
DROP COLUMN "scope",
DROP COLUMN "scope_id",
DROP COLUMN "source_id",
DROP COLUMN "source_type",
DROP COLUMN "updated_at",
DROP COLUMN "value",
ADD COLUMN     "access_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "embedding" JSONB,
ADD COLUMN     "user_id" UUID,
ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "importance",
ADD COLUMN     "importance" REAL NOT NULL DEFAULT 0.5;

-- AlterTable
ALTER TABLE "notion_connections" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "api_key" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "default_database_id" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orchestrator_executions" ADD COLUMN     "current_step" INTEGER,
ADD COLUMN     "step_results" JSONB;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "installation_mode" VARCHAR(20) NOT NULL DEFAULT 'recommend',
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public_webhooks" DROP COLUMN "failure_count",
DROP COLUMN "last_failure",
DROP COLUMN "last_success",
DROP COLUMN "status",
ADD COLUMN     "created_by" UUID NOT NULL,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "name" VARCHAR(255) NOT NULL,
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "secret" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "session_hijacking_attempts" DROP COLUMN "action",
DROP COLUMN "actual_ip",
DROP COLUMN "actual_user_agent",
DROP COLUMN "expected_ip",
DROP COLUMN "expected_user_agent",
DROP COLUMN "request_method",
DROP COLUMN "request_path",
ADD COLUMN     "attempted_agent" TEXT,
ADD COLUMN     "attempted_ip" VARCHAR(45),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "original_agent" TEXT,
ADD COLUMN     "original_ip" VARCHAR(45),
ADD COLUMN     "type" VARCHAR(50) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "mismatch_type" DROP NOT NULL,
ALTER COLUMN "blocked" SET DEFAULT true;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "skill_learning_patterns" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "billing_interval",
DROP COLUMN "canceled_at",
DROP COLUMN "custom_limits",
DROP COLUMN "metadata",
DROP COLUMN "plan_id",
DROP COLUMN "stripe_price_id",
DROP COLUMN "trial_end",
DROP COLUMN "trial_start",
ADD COLUMN     "plan" VARCHAR(50) NOT NULL DEFAULT 'free',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "usage_records" DROP COLUMN "metric",
DROP COLUMN "period",
DROP COLUMN "updated_at",
DROP COLUMN "value",
ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "category" VARCHAR(50),
ADD COLUMN     "cost_cents" INTEGER NOT NULL,
ADD COLUMN     "input_tokens" INTEGER NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "model" VARCHAR(100) NOT NULL,
ADD COLUMN     "output_tokens" INTEGER NOT NULL,
ADD COLUMN     "session_id" VARCHAR(255),
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webhook_deliveries" DROP COLUMN "error",
DROP COLUMN "event",
DROP COLUMN "response_status",
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "event_type" VARCHAR(100) NOT NULL,
ADD COLUMN     "next_retry_at" TIMESTAMPTZ(6),
ADD COLUMN     "status_code" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "status" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "workflow_executions" DROP COLUMN "error",
DROP COLUMN "input",
DROP COLUMN "output",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "input_data" JSONB,
ADD COLUMN     "output_data" JSONB,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "started_at" DROP NOT NULL,
ALTER COLUMN "started_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workflows" DROP COLUMN "created_by",
DROP COLUMN "trigger",
ADD COLUMN     "sop_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sop_steps" JSONB,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "config" SET DEFAULT '{}',
ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "organization_members";

-- DropTable
DROP TABLE "sessions_partitioned";

-- CreateTable
CREATE TABLE "memberships" (
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

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_domains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" VARCHAR(255),
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "role" TEXT NOT NULL,
    "manager_id" UUID,
    "team_id" UUID,
    "skills" VARCHAR(100)[],
    "session_id" VARCHAR(255),
    "hired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_end" TIMESTAMPTZ(6),
    "project_id" UUID,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "leader_id" UUID,
    "type" VARCHAR(50) NOT NULL,
    "max_members" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "owner_id" UUID,
    "start_date" DATE,
    "due_date" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL(15,2),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "name" VARCHAR(500) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "due_date" DATE,
    "urgency_score" INTEGER DEFAULT 0,
    "importance_score" INTEGER DEFAULT 0,
    "eisenhower_quadrant" VARCHAR(50),
    "responsible" UUID[],
    "accountable" UUID[],
    "backup" UUID[],
    "support" UUID[],
    "informed" UUID[],
    "consulted" UUID[],
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "owner_position_id" UUID,
    "due_date" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "parent_goal_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_streams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "functions" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "input" TEXT,
    "output" TEXT,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "value_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpis" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "owner_role_id" UUID,
    "target" VARCHAR(255),
    "current_value" DECIMAL(15,2),
    "unit" VARCHAR(50),
    "update_frequency" VARCHAR(50),
    "data_source" TEXT,
    "up_to_date" BOOLEAN NOT NULL DEFAULT true,
    "last_updated" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claude_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "half_open_successes" INTEGER NOT NULL DEFAULT 0,
    "circuit_opens_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "last_failure_reason" TEXT,
    "last_success_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "claude_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_alerts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "quota_type" VARCHAR(50) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claude_max_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "nickname" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "estimated_usage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_usage_update_at" TIMESTAMPTZ(6),
    "estimated_reset_at" TIMESTAMPTZ(6),
    "current_session_id" VARCHAR(255),
    "last_active_at" TIMESTAMPTZ(6),
    "consecutive_rate_limits" INTEGER NOT NULL DEFAULT 0,
    "last_rate_limit_at" TIMESTAMPTZ(6),
    "cooldown_until" TIMESTAMPTZ(6),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "credential_ref" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "claude_max_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_integrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" VARCHAR(50),
    "workspace_name" VARCHAR(255),
    "client_id" TEXT,
    "client_secret" TEXT,
    "bot_token" TEXT,
    "app_token" TEXT,
    "signing_secret" TEXT,
    "bot_user_id" VARCHAR(50),
    "scopes" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "installed_by" UUID,
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_health_check" TIMESTAMPTZ(6),
    "health_status" VARCHAR(50) NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "resource_type" VARCHAR(100),
    "resource_id" VARCHAR(255),
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
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
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "quarter" VARCHAR(10) NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'on_track',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_results" (
    "id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" VARCHAR(50) NOT NULL,
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "impact_level" VARCHAR(20) NOT NULL DEFAULT 'low',
    "requested_by" UUID NOT NULL,
    "impact_analysis" TEXT,
    "pr_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "default_folder_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "drive_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "calendar_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_states" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "current_step" VARCHAR(50) NOT NULL DEFAULT 'welcome',
    "completed_steps" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "skipped_steps" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "metadata" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_items" (
    "id" UUID NOT NULL,
    "onboarding_state_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_ai_providers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "default_provider" VARCHAR(50) NOT NULL DEFAULT 'anthropic',
    "providers" JSONB NOT NULL DEFAULT '{}',
    "model_preferences" JSONB NOT NULL DEFAULT '{}',
    "rate_limits" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_queue" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "queue_name" VARCHAR(100) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_by" VARCHAR(255),
    "locked_at" TIMESTAMPTZ(6),
    "scheduled_for" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_executions" (
    "id" UUID NOT NULL,
    "work_queue_id" UUID NOT NULL,
    "worker_id" VARCHAR(255) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "result" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,

    CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_users" (
    "id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "slack_team_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_workspaces" (
    "id" TEXT NOT NULL,
    "slack_team_id" TEXT NOT NULL,
    "slack_team_name" VARCHAR(255) NOT NULL,
    "organization_id" UUID NOT NULL,
    "access_token" TEXT,
    "bot_user_id" VARCHAR(100),
    "bot_access_token" TEXT,
    "installer_user_id" VARCHAR(100),
    "app_id" VARCHAR(100),
    "enterprise_id" VARCHAR(100),
    "enterprise_name" VARCHAR(255),
    "is_enterprise_install" BOOLEAN NOT NULL DEFAULT false,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMPTZ(6),
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_marketplace_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "api_key" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_marketplace_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_queue" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "item_id" VARCHAR(255) NOT NULL,
    "item_name" VARCHAR(255) NOT NULL,
    "item_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "config" JSONB,
    "error" TEXT,
    "result" JSONB,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "extension_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "installation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_instances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "container_url" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "encryption_key" TEXT NOT NULL,
    "webhook_base_url" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'provisioning',
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_health_check" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "n8n_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_workflows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "n8n_workflow_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL DEFAULT 'uncategorized',
    "tags" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "workflow_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_skill" BOOLEAN NOT NULL DEFAULT false,
    "sop_id" UUID,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "n8n_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_executions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "n8n_execution_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "mode" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "retry_of" UUID,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "triggered_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "n8n_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "n8n_credential_id" VARCHAR(255) NOT NULL,
    "mcp_connection_id" UUID,
    "credential_type" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "n8n_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_workflow_permissions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "agent_id" UUID,
    "role_id" VARCHAR(50),
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_execute" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "n8n_workflow_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_nodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_edges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "target_node_id" UUID NOT NULL,
    "relationship_type" VARCHAR(100) NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_clusters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "node_ids" UUID[],
    "centroid" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_domains_domain_key" ON "workspace_domains"("domain");

-- CreateIndex
CREATE INDEX "workspace_domains_organization_id_idx" ON "workspace_domains"("organization_id");

-- CreateIndex
CREATE INDEX "workspace_domains_domain_idx" ON "workspace_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_domains_organization_id_domain_key" ON "workspace_domains"("organization_id", "domain");

-- CreateIndex
CREATE INDEX "agents_organization_id_idx" ON "agents"("organization_id");

-- CreateIndex
CREATE INDEX "agents_manager_id_idx" ON "agents"("manager_id");

-- CreateIndex
CREATE INDEX "agents_team_id_idx" ON "agents"("team_id");

-- CreateIndex
CREATE INDEX "agents_type_idx" ON "agents"("type");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "teams_organization_id_idx" ON "teams"("organization_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_id_idx" ON "projects"("organization_id", "id");

-- CreateIndex
CREATE INDEX "projects_organization_id_created_at_idx" ON "projects"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_organization_id_id_idx" ON "tasks"("organization_id", "id");

-- CreateIndex
CREATE INDEX "tasks_organization_id_status_idx" ON "tasks"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tasks_organization_id_due_date_idx" ON "tasks"("organization_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_organization_id_project_id_idx" ON "tasks"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "goals_organization_id_id_idx" ON "goals"("organization_id", "id");

-- CreateIndex
CREATE INDEX "goals_parent_goal_id_idx" ON "goals"("parent_goal_id");

-- CreateIndex
CREATE INDEX "value_streams_organization_id_id_idx" ON "value_streams"("organization_id", "id");

-- CreateIndex
CREATE INDEX "value_streams_parent_id_idx" ON "value_streams"("parent_id");

-- CreateIndex
CREATE INDEX "kpis_organization_id_id_idx" ON "kpis"("organization_id", "id");

-- CreateIndex
CREATE INDEX "claude_accounts_organization_id_idx" ON "claude_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "claude_accounts_status_idx" ON "claude_accounts"("status");

-- CreateIndex
CREATE INDEX "claude_accounts_circuit_opens_at_idx" ON "claude_accounts"("circuit_opens_at");

-- CreateIndex
CREATE UNIQUE INDEX "claude_accounts_organization_id_name_key" ON "claude_accounts"("organization_id", "name");

-- CreateIndex
CREATE INDEX "quota_alerts_account_id_idx" ON "quota_alerts"("account_id");

-- CreateIndex
CREATE INDEX "quota_alerts_type_idx" ON "quota_alerts"("type");

-- CreateIndex
CREATE INDEX "quota_alerts_severity_idx" ON "quota_alerts"("severity");

-- CreateIndex
CREATE INDEX "quota_alerts_resolved_at_idx" ON "quota_alerts"("resolved_at");

-- CreateIndex
CREATE INDEX "quota_alerts_created_at_idx" ON "quota_alerts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "claude_max_accounts_organization_id_idx" ON "claude_max_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "claude_max_accounts_status_idx" ON "claude_max_accounts"("status");

-- CreateIndex
CREATE INDEX "claude_max_accounts_priority_idx" ON "claude_max_accounts"("priority");

-- CreateIndex
CREATE INDEX "claude_max_accounts_cooldown_until_idx" ON "claude_max_accounts"("cooldown_until");

-- CreateIndex
CREATE UNIQUE INDEX "claude_max_accounts_organization_id_nickname_key" ON "claude_max_accounts"("organization_id", "nickname");

-- CreateIndex
CREATE UNIQUE INDEX "claude_max_accounts_organization_id_email_key" ON "claude_max_accounts"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "slack_integrations_organization_id_key" ON "slack_integrations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_integrations_workspace_id_key" ON "slack_integrations"("workspace_id");

-- CreateIndex
CREATE INDEX "slack_integrations_organization_id_idx" ON "slack_integrations"("organization_id");

-- CreateIndex
CREATE INDEX "slack_integrations_workspace_id_idx" ON "slack_integrations"("workspace_id");

-- CreateIndex
CREATE INDEX "slack_integrations_enabled_idx" ON "slack_integrations"("enabled");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "approvals_organization_id_status_idx" ON "approvals"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approvals_approver_id_status_idx" ON "approvals"("approver_id", "status");

-- CreateIndex
CREATE INDEX "approvals_fallback_approver_id_idx" ON "approvals"("fallback_approver_id");

-- CreateIndex
CREATE INDEX "approvals_requester_id_idx" ON "approvals"("requester_id");

-- CreateIndex
CREATE INDEX "approvals_expires_at_idx" ON "approvals"("expires_at");

-- CreateIndex
CREATE INDEX "objectives_organization_id_quarter_idx" ON "objectives"("organization_id", "quarter");

-- CreateIndex
CREATE INDEX "objectives_owner_id_idx" ON "objectives"("owner_id");

-- CreateIndex
CREATE INDEX "key_results_objective_id_idx" ON "key_results"("objective_id");

-- CreateIndex
CREATE INDEX "key_results_owner_id_idx" ON "key_results"("owner_id");

-- CreateIndex
CREATE INDEX "organization_changes_organization_id_status_idx" ON "organization_changes"("organization_id", "status");

-- CreateIndex
CREATE INDEX "organization_changes_requested_by_idx" ON "organization_changes"("requested_by");

-- CreateIndex
CREATE INDEX "organization_changes_type_idx" ON "organization_changes"("type");

-- CreateIndex
CREATE INDEX "organization_changes_impact_level_idx" ON "organization_changes"("impact_level");

-- CreateIndex
CREATE UNIQUE INDEX "drive_connections_organization_id_key" ON "drive_connections"("organization_id");

-- CreateIndex
CREATE INDEX "drive_connections_organization_id_idx" ON "drive_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_connections_organization_id_key" ON "google_calendar_connections"("organization_id");

-- CreateIndex
CREATE INDEX "google_calendar_connections_organization_id_idx" ON "google_calendar_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_states_organization_id_key" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_user_id_idx" ON "onboarding_states"("user_id");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_onboarding_state_id_idx" ON "onboarding_checklist_items"("onboarding_state_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_items_onboarding_state_id_key_key" ON "onboarding_checklist_items"("onboarding_state_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "organization_ai_providers_organization_id_key" ON "organization_ai_providers"("organization_id");

-- CreateIndex
CREATE INDEX "work_queue_queue_name_status_priority_created_at_idx" ON "work_queue"("queue_name", "status", "priority" DESC, "created_at");

-- CreateIndex
CREATE INDEX "work_queue_organization_id_queue_name_idx" ON "work_queue"("organization_id", "queue_name");

-- CreateIndex
CREATE INDEX "work_queue_status_scheduled_for_idx" ON "work_queue"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "work_queue_locked_by_locked_at_idx" ON "work_queue"("locked_by", "locked_at");

-- CreateIndex
CREATE INDEX "work_queue_status_attempts_idx" ON "work_queue"("status", "attempts");

-- CreateIndex
CREATE INDEX "job_executions_work_queue_id_attempt_idx" ON "job_executions"("work_queue_id", "attempt");

-- CreateIndex
CREATE INDEX "job_executions_worker_id_started_at_idx" ON "job_executions"("worker_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "job_executions_status_idx" ON "job_executions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "slack_users_slack_user_id_key" ON "slack_users"("slack_user_id");

-- CreateIndex
CREATE INDEX "slack_users_slack_team_id_idx" ON "slack_users"("slack_team_id");

-- CreateIndex
CREATE INDEX "slack_users_user_id_idx" ON "slack_users"("user_id");

-- CreateIndex
CREATE INDEX "slack_users_organization_id_idx" ON "slack_users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_workspaces_slack_team_id_key" ON "slack_workspaces"("slack_team_id");

-- CreateIndex
CREATE INDEX "slack_workspaces_organization_id_idx" ON "slack_workspaces"("organization_id");

-- CreateIndex
CREATE INDEX "slack_workspaces_status_idx" ON "slack_workspaces"("status");

-- CreateIndex
CREATE INDEX "external_marketplace_credentials_organization_id_idx" ON "external_marketplace_credentials"("organization_id");

-- CreateIndex
CREATE INDEX "external_marketplace_credentials_source_idx" ON "external_marketplace_credentials"("source");

-- CreateIndex
CREATE UNIQUE INDEX "external_marketplace_credentials_organization_id_source_key" ON "external_marketplace_credentials"("organization_id", "source");

-- CreateIndex
CREATE INDEX "installation_queue_organization_id_status_idx" ON "installation_queue"("organization_id", "status");

-- CreateIndex
CREATE INDEX "installation_queue_organization_id_created_at_idx" ON "installation_queue"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "installation_queue_status_idx" ON "installation_queue"("status");

-- CreateIndex
CREATE INDEX "installation_queue_requested_by_idx" ON "installation_queue"("requested_by");

-- CreateIndex
CREATE INDEX "n8n_instances_status_idx" ON "n8n_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_instances_organization_id_key" ON "n8n_instances"("organization_id");

-- CreateIndex
CREATE INDEX "n8n_workflows_organization_id_category_idx" ON "n8n_workflows"("organization_id", "category");

-- CreateIndex
CREATE INDEX "n8n_workflows_is_skill_idx" ON "n8n_workflows"("is_skill");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_workflows_instance_id_n8n_workflow_id_key" ON "n8n_workflows"("instance_id", "n8n_workflow_id");

-- CreateIndex
CREATE INDEX "n8n_executions_workflow_id_status_idx" ON "n8n_executions"("workflow_id", "status");

-- CreateIndex
CREATE INDEX "n8n_executions_started_at_idx" ON "n8n_executions"("started_at");

-- CreateIndex
CREATE INDEX "n8n_credentials_organization_id_idx" ON "n8n_credentials"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_credentials_instance_id_n8n_credential_id_key" ON "n8n_credentials"("instance_id", "n8n_credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_workflow_permissions_workflow_id_agent_id_key" ON "n8n_workflow_permissions"("workflow_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_workflow_permissions_workflow_id_role_id_key" ON "n8n_workflow_permissions"("workflow_id", "role_id");

-- CreateIndex
CREATE INDEX "knowledge_nodes_organization_id_type_idx" ON "knowledge_nodes"("organization_id", "type");

-- CreateIndex
CREATE INDEX "knowledge_nodes_organization_id_name_idx" ON "knowledge_nodes"("organization_id", "name");

-- CreateIndex
CREATE INDEX "knowledge_edges_organization_id_idx" ON "knowledge_edges"("organization_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_source_node_id_idx" ON "knowledge_edges"("source_node_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_target_node_id_idx" ON "knowledge_edges"("target_node_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_relationship_type_idx" ON "knowledge_edges"("relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_edges_source_node_id_target_node_id_relationship__key" ON "knowledge_edges"("source_node_id", "target_node_id", "relationship_type");

-- CreateIndex
CREATE INDEX "knowledge_clusters_organization_id_idx" ON "knowledge_clusters"("organization_id");

-- CreateIndex
CREATE INDEX "agent_activities_organization_id_created_at_idx" ON "agent_activities"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_entity_type_entity_id_idx" ON "entity_memories"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "entity_memories_expires_at_idx" ON "entity_memories"("expires_at");

-- CreateIndex
CREATE INDEX "feature_flag_rules_enabled_priority_idx" ON "feature_flag_rules"("enabled", "priority");

-- CreateIndex
CREATE INDEX "feature_flags_key_idx" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "mcp_connections_organization_id_enabled_idx" ON "mcp_connections"("organization_id", "enabled");

-- CreateIndex
CREATE INDEX "mcp_connections_namespace_idx" ON "mcp_connections"("namespace");

-- CreateIndex
CREATE INDEX "memories_organization_id_user_id_idx" ON "memories"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "memories_importance_idx" ON "memories"("importance");

-- CreateIndex
CREATE INDEX "orchestrator_executions_organization_id_status_idx" ON "orchestrator_executions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "public_webhooks_enabled_idx" ON "public_webhooks"("enabled");

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_user_id_created_at_idx" ON "session_hijacking_attempts"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_organization_id_created_at_idx" ON "session_hijacking_attempts"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sessions_organization_id_expires_at_idx" ON "sessions"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "usage_records_organization_id_created_at_idx" ON "usage_records"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_records_organization_id_model_idx" ON "usage_records"("organization_id", "model");

-- CreateIndex
CREATE INDEX "usage_records_agent_id_idx" ON "usage_records"("agent_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_google_id_idx" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries"("next_retry_at");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_idx" ON "workflow_executions"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_executions_created_at_idx" ON "workflow_executions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "workflows_organization_id_idx" ON "workflows"("organization_id");

-- CreateIndex
CREATE INDEX "workflows_organization_id_enabled_idx" ON "workflows"("organization_id", "enabled");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_fkey" FOREIGN KEY ("parent_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_streams" ADD CONSTRAINT "value_streams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_streams" ADD CONSTRAINT "value_streams_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "value_streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_parent_activity_id_fkey" FOREIGN KEY ("parent_activity_id") REFERENCES "agent_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_accounts" ADD CONSTRAINT "claude_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_alerts" ADD CONSTRAINT "quota_alerts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "claude_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_max_accounts" ADD CONSTRAINT "claude_max_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_onboarding_state_id_fkey" FOREIGN KEY ("onboarding_state_id") REFERENCES "onboarding_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_work_queue_id_fkey" FOREIGN KEY ("work_queue_id") REFERENCES "work_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_marketplace_credentials" ADD CONSTRAINT "external_marketplace_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_queue" ADD CONSTRAINT "installation_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_instances" ADD CONSTRAINT "n8n_instances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "n8n_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_executions" ADD CONSTRAINT "n8n_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "n8n_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_credentials" ADD CONSTRAINT "n8n_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_credentials" ADD CONSTRAINT "n8n_credentials_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "n8n_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_workflow_permissions" ADD CONSTRAINT "n8n_workflow_permissions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "n8n_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_clusters" ADD CONSTRAINT "knowledge_clusters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_memories" ADD CONSTRAINT "entity_memories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_notion_connections_org" RENAME TO "notion_connections_organization_id_idx";
