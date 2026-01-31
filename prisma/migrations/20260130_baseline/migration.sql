-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExtensionType" AS ENUM ('extension', 'skill', 'mcp_server');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logo_url" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "monthly_budget_cents" INTEGER,
    "current_month_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "budget_reset_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "google_id" VARCHAR(255),
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "sessions" (
    "id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" VARCHAR(255),
    "source" VARCHAR(50),
    "state" JSONB NOT NULL DEFAULT '{}',
    "history" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "sop_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sop_steps" JSONB,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orchestrator_executions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "skills" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "status" VARCHAR(50) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "current_step" INTEGER,
    "step_results" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orchestrator_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "namespace" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "notion_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "api_key" VARCHAR(255) NOT NULL,
    "default_database_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notion_connections_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_rules" (
    "id" UUID NOT NULL,
    "feature_flag_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "organization_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" UUID NOT NULL,
    "feature_flag_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_audit_logs" (
    "id" UUID NOT NULL,
    "feature_flag_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_audit_logs_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "marketplace_extensions" (
    "id" UUID NOT NULL,
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "marketplace_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_versions" (
    "id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "manifest" JSONB NOT NULL,
    "definition" JSONB,
    "changelog" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "extension_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_installations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "config_overrides" JSONB,
    "credentials" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "auto_update" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extension_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_publishers" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extension_publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_permissions" (
    "id" UUID NOT NULL,
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extension_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_usage_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "agent_id" UUID,
    "session_id" VARCHAR(255),
    "execution_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_learning_patterns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pattern_hash" VARCHAR(64) NOT NULL,
    "pattern_type" VARCHAR(30) NOT NULL,
    "steps" JSONB NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "trigger_phrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context_tags" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'detected',
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_learning_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skill_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "assignment_type" VARCHAR(20) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "config_overrides" JSONB,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_skill_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "plan" VARCHAR(50) NOT NULL DEFAULT 'free',
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "stripe_invoice_id" VARCHAR(255),
    "amount_due" INTEGER NOT NULL,
    "amount_paid" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'usd',
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "invoice_url" TEXT,
    "pdf_url" TEXT,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "due_date" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" VARCHAR(255),
    "model" VARCHAR(100) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "category" VARCHAR(50),
    "agent_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(10) NOT NULL,
    "scopes" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "rate_limit" INTEGER NOT NULL DEFAULT 1000,
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_webhooks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "secret" VARCHAR(255) NOT NULL,
    "events" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retry_count" INTEGER NOT NULL DEFAULT 3,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "metadata" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "status_code" INTEGER,
    "response_body" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "next_retry_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "agent_type" VARCHAR(100) NOT NULL,
    "agent_name" VARCHAR(255),
    "category" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "input_data" JSONB,
    "output_data" JSONB,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_google_id_idx" ON "users"("google_id");

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
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_organization_id_idx" ON "sessions"("organization_id");

-- CreateIndex
CREATE INDEX "sessions_organization_id_expires_at_idx" ON "sessions"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_source_idx" ON "sessions"("source");

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
CREATE INDEX "workflows_organization_id_idx" ON "workflows"("organization_id");

-- CreateIndex
CREATE INDEX "workflows_organization_id_enabled_idx" ON "workflows"("organization_id", "enabled");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_idx" ON "workflow_executions"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_executions_created_at_idx" ON "workflow_executions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "orchestrator_executions_organization_id_created_at_idx" ON "orchestrator_executions"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orchestrator_executions_organization_id_status_idx" ON "orchestrator_executions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "orchestrator_executions_user_id_created_at_idx" ON "orchestrator_executions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orchestrator_executions_session_id_idx" ON "orchestrator_executions"("session_id");

-- CreateIndex
CREATE INDEX "orchestrator_executions_status_idx" ON "orchestrator_executions"("status");

-- CreateIndex
CREATE INDEX "mcp_connections_organization_id_idx" ON "mcp_connections"("organization_id");

-- CreateIndex
CREATE INDEX "mcp_connections_organization_id_enabled_idx" ON "mcp_connections"("organization_id", "enabled");

-- CreateIndex
CREATE INDEX "mcp_connections_provider_idx" ON "mcp_connections"("provider");

-- CreateIndex
CREATE INDEX "mcp_connections_namespace_idx" ON "mcp_connections"("namespace");

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
CREATE INDEX "notion_connections_organization_id_idx" ON "notion_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notion_connections_organization_id_key" ON "notion_connections"("organization_id");

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
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flags_key_idx" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flag_rules_feature_flag_id_priority_idx" ON "feature_flag_rules"("feature_flag_id", "priority");

-- CreateIndex
CREATE INDEX "feature_flag_rules_enabled_priority_idx" ON "feature_flag_rules"("enabled", "priority");

-- CreateIndex
CREATE INDEX "feature_flag_rules_type_idx" ON "feature_flag_rules"("type");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_organization_id_idx" ON "feature_flag_overrides"("organization_id");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_expires_at_idx" ON "feature_flag_overrides"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_feature_flag_id_organization_id_key" ON "feature_flag_overrides"("feature_flag_id", "organization_id");

-- CreateIndex
CREATE INDEX "feature_flag_audit_logs_feature_flag_id_created_at_idx" ON "feature_flag_audit_logs"("feature_flag_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feature_flag_audit_logs_organization_id_created_at_idx" ON "feature_flag_audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feature_flag_audit_logs_action_created_at_idx" ON "feature_flag_audit_logs"("action", "created_at" DESC);

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
CREATE INDEX "session_hijacking_attempts_session_id_idx" ON "session_hijacking_attempts"("session_id");

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_user_id_created_at_idx" ON "session_hijacking_attempts"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "session_hijacking_attempts_organization_id_created_at_idx" ON "session_hijacking_attempts"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "marketplace_extensions_organization_id_idx" ON "marketplace_extensions"("organization_id");

-- CreateIndex
CREATE INDEX "marketplace_extensions_extension_type_idx" ON "marketplace_extensions"("extension_type");

-- CreateIndex
CREATE INDEX "marketplace_extensions_category_idx" ON "marketplace_extensions"("category");

-- CreateIndex
CREATE INDEX "marketplace_extensions_is_public_status_idx" ON "marketplace_extensions"("is_public", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_extensions_organization_id_slug_key" ON "marketplace_extensions"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "extension_versions_extension_id_idx" ON "extension_versions"("extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "extension_versions_extension_id_version_key" ON "extension_versions"("extension_id", "version");

-- CreateIndex
CREATE INDEX "extension_installations_organization_id_idx" ON "extension_installations"("organization_id");

-- CreateIndex
CREATE INDEX "extension_installations_extension_id_idx" ON "extension_installations"("extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "extension_installations_organization_id_extension_id_key" ON "extension_installations"("organization_id", "extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "extension_publishers_slug_key" ON "extension_publishers"("slug");

-- CreateIndex
CREATE INDEX "extension_publishers_organization_id_idx" ON "extension_publishers"("organization_id");

-- CreateIndex
CREATE INDEX "extension_permissions_organization_id_idx" ON "extension_permissions"("organization_id");

-- CreateIndex
CREATE INDEX "extension_permissions_extension_id_idx" ON "extension_permissions"("extension_id");

-- CreateIndex
CREATE INDEX "extension_permissions_agent_id_idx" ON "extension_permissions"("agent_id");

-- CreateIndex
CREATE INDEX "extension_usage_logs_organization_id_created_at_idx" ON "extension_usage_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "extension_usage_logs_extension_id_idx" ON "extension_usage_logs"("extension_id");

-- CreateIndex
CREATE INDEX "skill_learning_patterns_organization_id_idx" ON "skill_learning_patterns"("organization_id");

-- CreateIndex
CREATE INDEX "skill_learning_patterns_status_idx" ON "skill_learning_patterns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "skill_learning_patterns_organization_id_pattern_hash_key" ON "skill_learning_patterns"("organization_id", "pattern_hash");

-- CreateIndex
CREATE INDEX "agent_skill_assignments_organization_id_idx" ON "agent_skill_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "agent_skill_assignments_agent_id_idx" ON "agent_skill_assignments"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_skill_assignments_agent_id_extension_id_key" ON "agent_skill_assignments"("agent_id", "extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "usage_records_organization_id_created_at_idx" ON "usage_records"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_records_organization_id_model_idx" ON "usage_records"("organization_id", "model");

-- CreateIndex
CREATE INDEX "usage_records_agent_id_idx" ON "usage_records"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_states_organization_id_key" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_user_id_idx" ON "onboarding_states"("user_id");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_onboarding_state_id_idx" ON "onboarding_checklist_items"("onboarding_state_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_items_onboarding_state_id_key_key" ON "onboarding_checklist_items"("onboarding_state_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "public_webhooks_organization_id_idx" ON "public_webhooks"("organization_id");

-- CreateIndex
CREATE INDEX "public_webhooks_enabled_idx" ON "public_webhooks"("enabled");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries"("next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_ai_providers_organization_id_key" ON "organization_ai_providers"("organization_id");

-- CreateIndex
CREATE INDEX "agent_activities_organization_id_idx" ON "agent_activities"("organization_id");

-- CreateIndex
CREATE INDEX "agent_activities_session_id_idx" ON "agent_activities"("session_id");

-- CreateIndex
CREATE INDEX "agent_activities_status_idx" ON "agent_activities"("status");

-- CreateIndex
CREATE INDEX "agent_activities_created_at_idx" ON "agent_activities"("created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_activities_organization_id_created_at_idx" ON "agent_activities"("organization_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orchestrator_executions" ADD CONSTRAINT "orchestrator_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orchestrator_executions" ADD CONSTRAINT "orchestrator_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_accounts" ADD CONSTRAINT "claude_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_alerts" ADD CONSTRAINT "quota_alerts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "claude_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_rules" ADD CONSTRAINT "feature_flag_rules_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_audit_logs" ADD CONSTRAINT "feature_flag_audit_logs_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_audit_logs" ADD CONSTRAINT "feature_flag_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_audit_logs" ADD CONSTRAINT "feature_flag_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_extensions" ADD CONSTRAINT "marketplace_extensions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_extensions" ADD CONSTRAINT "marketplace_extensions_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "extension_publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_versions" ADD CONSTRAINT "extension_versions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installations" ADD CONSTRAINT "extension_installations_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_permissions" ADD CONSTRAINT "extension_permissions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_permissions" ADD CONSTRAINT "extension_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_usage_logs" ADD CONSTRAINT "extension_usage_logs_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_usage_logs" ADD CONSTRAINT "extension_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_learning_patterns" ADD CONSTRAINT "skill_learning_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_assignments" ADD CONSTRAINT "agent_skill_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_onboarding_state_id_fkey" FOREIGN KEY ("onboarding_state_id") REFERENCES "onboarding_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

