/*
  Warnings:

  - You are about to alter the column `api_key` on the `notion_connections` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `default_database_id` on the `notion_connections` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the column `error` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to drop the column `input` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to drop the column `output` on the `workflow_executions` table. All the data in the column will be lost.
  - You are about to alter the column `status` on the `workflow_executions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to drop the column `created_by` on the `workflows` table. All the data in the column will be lost.
  - You are about to drop the column `trigger` on the `workflows` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `workflows` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the `organization_members` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `namespace` to the `mcp_connections` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT "organization_members_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT "organization_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_created_by_fkey";

-- DropIndex
DROP INDEX "idx_mcp_connections_provider";

-- DropIndex
DROP INDEX "mcp_connections_expires_at_idx";

-- DropIndex
DROP INDEX "mcp_connections_org_provider_name_unique";

-- DropIndex
DROP INDEX "idx_workflow_executions_workflow";

-- DropIndex
DROP INDEX "idx_workflows_org_enabled";

-- AlterTable
ALTER TABLE "mcp_connections" ADD COLUMN     "namespace" VARCHAR(100) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notion_connections" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "api_key" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "default_database_id" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orchestrator_executions" ADD COLUMN     "current_step" INTEGER,
ADD COLUMN     "step_results" JSONB;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "ip_address" VARCHAR(45),
ADD COLUMN     "user_agent" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

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
    "function_id" UUID,
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
CREATE TABLE "functions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_ko" VARCHAR(255),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "skill_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "triggers" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "parameters" JSONB,
    "outputs" JSONB,
    "tools_required" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skills" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sops" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sop_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "function_id" UUID,
    "steps" JSONB NOT NULL,
    "triggers" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_executions" (
    "id" UUID NOT NULL,
    "sop_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "step_results" JSONB NOT NULL DEFAULT '[]',
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sop_executions_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "slack_integrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" VARCHAR(50) NOT NULL,
    "workspace_name" VARCHAR(255) NOT NULL,
    "bot_token" TEXT NOT NULL,
    "app_token" TEXT,
    "signing_secret" TEXT NOT NULL,
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
CREATE TABLE "slack_users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slack_user_id" VARCHAR(50) NOT NULL,
    "user_id" UUID,
    "slack_username" VARCHAR(255),
    "slack_email" VARCHAR(255),
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_workspaces" (
    "id" UUID NOT NULL,
    "slack_workspace_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "domain" VARCHAR(255),
    "icon_url" TEXT,
    "enterprise_id" VARCHAR(50),
    "enterprise_name" VARCHAR(255),
    "member_count" INTEGER,
    "last_sync_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_workspaces_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegatee_id" UUID NOT NULL,
    "permissions" VARCHAR(100)[],
    "scope" JSONB,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_permission_overrides" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "read_patterns" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "write_patterns" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "tools" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "restricted" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "approval_rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_permission_overrides_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "scopes" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "rate_limit_tier" VARCHAR(20) NOT NULL DEFAULT 'free',
    "requests_per_minute" INTEGER NOT NULL DEFAULT 60,
    "requests_per_day" INTEGER NOT NULL DEFAULT 1000,
    "last_used_at" TIMESTAMPTZ(6),
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_webhooks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "secret" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure" TIMESTAMPTZ(6),
    "last_success" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "response_status" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_hijacking_attempts" (
    "id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "mismatch_type" VARCHAR(50),
    "original_ip" VARCHAR(45),
    "attempted_ip" VARCHAR(45),
    "original_agent" TEXT,
    "attempted_agent" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_hijacking_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "stripe_price_id" VARCHAR(255),
    "plan_id" VARCHAR(50) NOT NULL DEFAULT 'free',
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "billing_interval" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(6),
    "trial_start" TIMESTAMPTZ(6),
    "trial_end" TIMESTAMPTZ(6),
    "custom_limits" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID,
    "organization_id" UUID NOT NULL,
    "stripe_invoice_id" VARCHAR(255),
    "stripe_payment_intent_id" VARCHAR(255),
    "number" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "due_date" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "hosted_invoice_url" TEXT,
    "invoice_pdf_url" TEXT,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "metric" VARCHAR(50) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "period" VARCHAR(7) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_ai_providers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "preferred_provider" VARCHAR(50) NOT NULL DEFAULT 'anthropic',
    "fallback_provider" VARCHAR(50),
    "auto_fallback" BOOLEAN NOT NULL DEFAULT true,
    "monthly_token_limit" BIGINT,
    "daily_token_limit" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ai_provider_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "request_type" VARCHAR(50),
    "session_id" UUID,
    "agent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_states" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "current_step" VARCHAR(50) NOT NULL DEFAULT 'company_info',
    "completed_steps" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "skipped_steps" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "template_id" VARCHAR(100),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_memories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_name" VARCHAR(255) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "last_mentioned" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entity_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "scope_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "importance" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "source_type" VARCHAR(50) NOT NULL DEFAULT 'explicit',
    "source_id" UUID,
    "last_accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "agents_function_id_idx" ON "agents"("function_id");

-- CreateIndex
CREATE INDEX "agents_type_idx" ON "agents"("type");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "teams_organization_id_idx" ON "teams"("organization_id");

-- CreateIndex
CREATE INDEX "functions_organization_id_idx" ON "functions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_skill_id_key" ON "skills"("skill_id");

-- CreateIndex
CREATE INDEX "skills_organization_id_idx" ON "skills"("organization_id");

-- CreateIndex
CREATE INDEX "skills_skill_id_idx" ON "skills"("skill_id");

-- CreateIndex
CREATE INDEX "skills_category_idx" ON "skills"("category");

-- CreateIndex
CREATE INDEX "agent_skills_agent_id_idx" ON "agent_skills"("agent_id");

-- CreateIndex
CREATE INDEX "agent_skills_skill_id_idx" ON "agent_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_skills_agent_id_skill_id_key" ON "agent_skills"("agent_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "sops_sop_id_key" ON "sops"("sop_id");

-- CreateIndex
CREATE INDEX "sops_organization_id_idx" ON "sops"("organization_id");

-- CreateIndex
CREATE INDEX "sops_sop_id_idx" ON "sops"("sop_id");

-- CreateIndex
CREATE INDEX "sops_function_id_idx" ON "sops"("function_id");

-- CreateIndex
CREATE INDEX "sop_executions_sop_id_idx" ON "sop_executions"("sop_id");

-- CreateIndex
CREATE INDEX "sop_executions_status_idx" ON "sop_executions"("status");

-- CreateIndex
CREATE INDEX "sop_executions_created_at_idx" ON "sop_executions"("created_at" DESC);

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
CREATE UNIQUE INDEX "slack_integrations_workspace_id_key" ON "slack_integrations"("workspace_id");

-- CreateIndex
CREATE INDEX "slack_integrations_organization_id_idx" ON "slack_integrations"("organization_id");

-- CreateIndex
CREATE INDEX "slack_integrations_workspace_id_idx" ON "slack_integrations"("workspace_id");

-- CreateIndex
CREATE INDEX "slack_integrations_enabled_idx" ON "slack_integrations"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "slack_integrations_organization_id_workspace_id_key" ON "slack_integrations"("organization_id", "workspace_id");

-- CreateIndex
CREATE INDEX "slack_users_organization_id_idx" ON "slack_users"("organization_id");

-- CreateIndex
CREATE INDEX "slack_users_slack_user_id_idx" ON "slack_users"("slack_user_id");

-- CreateIndex
CREATE INDEX "slack_users_user_id_idx" ON "slack_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_users_organization_id_slack_user_id_key" ON "slack_users"("organization_id", "slack_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_workspaces_slack_workspace_id_key" ON "slack_workspaces"("slack_workspace_id");

-- CreateIndex
CREATE INDEX "slack_workspaces_slack_workspace_id_idx" ON "slack_workspaces"("slack_workspace_id");

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
CREATE INDEX "delegations_organization_id_delegatee_id_idx" ON "delegations"("organization_id", "delegatee_id");

-- CreateIndex
CREATE INDEX "delegations_organization_id_delegator_id_idx" ON "delegations"("organization_id", "delegator_id");

-- CreateIndex
CREATE INDEX "delegations_delegatee_id_valid_until_idx" ON "delegations"("delegatee_id", "valid_until");

-- CreateIndex
CREATE INDEX "delegations_valid_until_idx" ON "delegations"("valid_until");

-- CreateIndex
CREATE INDEX "agent_permission_overrides_organization_id_idx" ON "agent_permission_overrides"("organization_id");

-- CreateIndex
CREATE INDEX "agent_permission_overrides_agent_id_idx" ON "agent_permission_overrides"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_permission_overrides_organization_id_agent_id_key" ON "agent_permission_overrides"("organization_id", "agent_id");

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
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "api_keys_status_idx" ON "api_keys"("status");

-- CreateIndex
CREATE INDEX "api_keys_created_at_idx" ON "api_keys"("created_at" DESC);

-- CreateIndex
CREATE INDEX "public_webhooks_organization_id_idx" ON "public_webhooks"("organization_id");

-- CreateIndex
CREATE INDEX "public_webhooks_status_idx" ON "public_webhooks"("status");

-- CreateIndex
CREATE INDEX "public_webhooks_organization_id_status_idx" ON "public_webhooks"("organization_id", "status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_created_at_idx" ON "webhook_deliveries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_session_id_idx" ON "session_hijacking_attempts"("session_id");

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_user_id_created_at_idx" ON "session_hijacking_attempts"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_organization_id_created_at_idx" ON "session_hijacking_attempts"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_idx" ON "invoices"("organization_id");

-- CreateIndex
CREATE INDEX "invoices_stripe_invoice_id_idx" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_records_organization_id_idx" ON "usage_records"("organization_id");

-- CreateIndex
CREATE INDEX "usage_records_metric_idx" ON "usage_records"("metric");

-- CreateIndex
CREATE INDEX "usage_records_period_idx" ON "usage_records"("period");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_organization_id_metric_period_key" ON "usage_records"("organization_id", "metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "organization_ai_providers_organization_id_key" ON "organization_ai_providers"("organization_id");

-- CreateIndex
CREATE INDEX "organization_ai_providers_organization_id_idx" ON "organization_ai_providers"("organization_id");

-- CreateIndex
CREATE INDEX "ai_provider_usage_records_organization_id_idx" ON "ai_provider_usage_records"("organization_id");

-- CreateIndex
CREATE INDEX "ai_provider_usage_records_ai_provider_id_idx" ON "ai_provider_usage_records"("ai_provider_id");

-- CreateIndex
CREATE INDEX "ai_provider_usage_records_provider_idx" ON "ai_provider_usage_records"("provider");

-- CreateIndex
CREATE INDEX "ai_provider_usage_records_created_at_idx" ON "ai_provider_usage_records"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_states_organization_id_key" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_organization_id_idx" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_current_step_idx" ON "onboarding_states"("current_step");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_organization_id_idx" ON "onboarding_checklist_items"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_status_idx" ON "onboarding_checklist_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_items_organization_id_item_id_key" ON "onboarding_checklist_items"("organization_id", "item_id");

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_idx" ON "entity_memories"("organization_id");

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_entity_type_idx" ON "entity_memories"("organization_id", "entity_type");

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_entity_name_idx" ON "entity_memories"("organization_id", "entity_name");

-- CreateIndex
CREATE INDEX "entity_memories_last_mentioned_idx" ON "entity_memories"("last_mentioned" DESC);

-- CreateIndex
CREATE INDEX "entity_memories_mention_count_idx" ON "entity_memories"("mention_count" DESC);

-- CreateIndex
CREATE INDEX "memories_organization_id_idx" ON "memories"("organization_id");

-- CreateIndex
CREATE INDEX "memories_organization_id_scope_scope_id_idx" ON "memories"("organization_id", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "memories_key_idx" ON "memories"("key");

-- CreateIndex
CREATE INDEX "memories_expires_at_idx" ON "memories"("expires_at");

-- CreateIndex
CREATE INDEX "memories_last_accessed_at_idx" ON "memories"("last_accessed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "memories_organization_id_scope_scope_id_key_key" ON "memories"("organization_id", "scope", "scope_id", "key");

-- CreateIndex
CREATE INDEX "feature_flag_rules_enabled_priority_idx" ON "feature_flag_rules"("enabled", "priority");

-- CreateIndex
CREATE INDEX "feature_flags_key_idx" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "mcp_connections_organization_id_enabled_idx" ON "mcp_connections"("organization_id", "enabled");

-- CreateIndex
CREATE INDEX "mcp_connections_namespace_idx" ON "mcp_connections"("namespace");

-- CreateIndex
CREATE INDEX "orchestrator_executions_organization_id_status_idx" ON "orchestrator_executions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "sessions_organization_id_expires_at_idx" ON "sessions"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_google_id_idx" ON "users"("google_id");

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
ALTER TABLE "agents" ADD CONSTRAINT "agents_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "functions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functions" ADD CONSTRAINT "functions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "functions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_executions" ADD CONSTRAINT "sop_executions_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ai_providers" ADD CONSTRAINT "organization_ai_providers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_usage_records" ADD CONSTRAINT "ai_provider_usage_records_ai_provider_id_fkey" FOREIGN KEY ("ai_provider_id") REFERENCES "organization_ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_notion_connections_org" RENAME TO "notion_connections_organization_id_idx";
