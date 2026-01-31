-- Migration: Add Organization AI Provider Preferences
-- Date: 2026-01-28
-- Description: Adds tables for storing organization's AI provider preferences,
--              including preferred/fallback providers, encrypted credentials,
--              usage limits, and detailed usage tracking for billing.

-- ============================================================================
-- Organization AI Provider Preferences Table
-- ============================================================================
CREATE TABLE "organization_ai_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    
    -- Provider preferences
    "preferred_provider" VARCHAR(50) NOT NULL DEFAULT 'anthropic',
    "fallback_provider" VARCHAR(50),
    "auto_fallback" BOOLEAN NOT NULL DEFAULT true,
    
    -- Provider-specific settings (encrypted API keys, model preferences)
    "provider_settings" JSONB NOT NULL DEFAULT '{}',
    
    -- Usage limits & budgets
    "monthly_token_limit" INTEGER,
    "current_month_tokens" INTEGER NOT NULL DEFAULT 0,
    "monthly_spend_limit_cents" INTEGER,
    "current_month_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "budget_reset_at" TIMESTAMPTZ(6),
    
    -- Custom rate limiting overrides
    "custom_rate_limits" JSONB,
    
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_ai_providers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_ai_providers_organization_id_key" UNIQUE ("organization_id")
);

-- Indexes for organization_ai_providers
CREATE INDEX "organization_ai_providers_organization_id_idx" ON "organization_ai_providers"("organization_id");
CREATE INDEX "organization_ai_providers_preferred_provider_idx" ON "organization_ai_providers"("preferred_provider");

-- ============================================================================
-- AI Provider Usage Records Table (Cost Tracking)
-- ============================================================================
CREATE TABLE "ai_provider_usage_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" VARCHAR(255),
    
    -- Provider & model
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    
    -- Token usage
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    
    -- Context
    "category" VARCHAR(50),
    "execution_id" UUID,
    
    -- Metadata
    "latency_ms" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_usage_records_pkey" PRIMARY KEY ("id")
);

-- Indexes for ai_provider_usage_records
CREATE INDEX "ai_provider_usage_records_org_created_idx" ON "ai_provider_usage_records"("organization_id", "created_at" DESC);
CREATE INDEX "ai_provider_usage_records_org_provider_created_idx" ON "ai_provider_usage_records"("organization_id", "provider", "created_at" DESC);
CREATE INDEX "ai_provider_usage_records_user_created_idx" ON "ai_provider_usage_records"("user_id", "created_at" DESC);
CREATE INDEX "ai_provider_usage_records_session_idx" ON "ai_provider_usage_records"("session_id");
CREATE INDEX "ai_provider_usage_records_provider_model_idx" ON "ai_provider_usage_records"("provider", "model");

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE "organization_ai_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_provider_usage_records" ENABLE ROW LEVEL SECURITY;

-- RLS policy for organization_ai_providers
CREATE POLICY "organization_ai_providers_tenant_isolation" ON "organization_ai_providers"
    USING ("organization_id" = current_setting('app.tenant_id', true)::uuid);

-- RLS policy for ai_provider_usage_records
CREATE POLICY "ai_provider_usage_records_tenant_isolation" ON "ai_provider_usage_records"
    USING ("organization_id" = current_setting('app.tenant_id', true)::uuid);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE "organization_ai_providers" IS 'Stores AI provider preferences and credentials per organization';
COMMENT ON COLUMN "organization_ai_providers"."preferred_provider" IS 'Primary AI provider: anthropic, openai, google-ai, github-models, openrouter';
COMMENT ON COLUMN "organization_ai_providers"."fallback_provider" IS 'Fallback provider when primary fails or is rate-limited';
COMMENT ON COLUMN "organization_ai_providers"."auto_fallback" IS 'Automatically switch to fallback on errors';
COMMENT ON COLUMN "organization_ai_providers"."provider_settings" IS 'Encrypted API keys and model preferences per provider';
COMMENT ON COLUMN "organization_ai_providers"."custom_rate_limits" IS 'Organization-specific rate limit overrides';

COMMENT ON TABLE "ai_provider_usage_records" IS 'Tracks token usage and costs per AI request for billing';
COMMENT ON COLUMN "ai_provider_usage_records"."cost_cents" IS 'Cost of this request in cents (USD)';
COMMENT ON COLUMN "ai_provider_usage_records"."category" IS 'Orchestrator category: quick, visual-engineering, ultrabrain, etc.';
