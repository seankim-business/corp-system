-- Agent Performance Optimization Engine
-- A/B Testing Framework, Prompt Variants, Routing Rules, Model Profiles

-- Experiments (A/B Testing)
CREATE TABLE "experiments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "agent_id" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
  "type" VARCHAR(50) NOT NULL DEFAULT 'prompt',

  -- Traffic allocation
  "traffic_split" DECIMAL(3,2) NOT NULL DEFAULT 0.50,

  -- Metrics
  "primary_metric" VARCHAR(50) NOT NULL DEFAULT 'success_rate',
  "secondary_metrics" TEXT[] DEFAULT '{}',

  -- Duration
  "min_sample_size" INTEGER NOT NULL DEFAULT 100,
  "started_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),

  -- Results
  "results" JSONB,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_experiments_org_id" ON "experiments"("organization_id");
CREATE INDEX "idx_experiments_agent_id" ON "experiments"("agent_id");
CREATE INDEX "idx_experiments_status" ON "experiments"("status");

-- Experiment Variants
CREATE TABLE "experiment_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "experiment_id" UUID NOT NULL REFERENCES "experiments"("id") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "is_control" BOOLEAN NOT NULL DEFAULT false,
  "type" VARCHAR(50) NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',

  -- Metrics collected
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "total_latency_ms" BIGINT NOT NULL DEFAULT 0,
  "total_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "total_rating" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "rating_count" INTEGER NOT NULL DEFAULT 0,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_experiment_variants_experiment_id" ON "experiment_variants"("experiment_id");

-- Experiment Metric Records (individual data points)
CREATE TABLE "experiment_metrics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "experiment_id" UUID NOT NULL REFERENCES "experiments"("id") ON DELETE CASCADE,
  "variant_id" UUID NOT NULL REFERENCES "experiment_variants"("id") ON DELETE CASCADE,
  "user_id" UUID,
  "session_id" VARCHAR(255),

  "success" BOOLEAN NOT NULL,
  "latency_ms" INTEGER,
  "cost_cents" INTEGER,
  "user_rating" DECIMAL(3,1),
  "metadata" JSONB,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_experiment_metrics_experiment_id" ON "experiment_metrics"("experiment_id");
CREATE INDEX "idx_experiment_metrics_variant_id" ON "experiment_metrics"("variant_id");
CREATE INDEX "idx_experiment_metrics_created_at" ON "experiment_metrics"("created_at" DESC);

-- User Variant Assignments (for consistent assignment)
CREATE TABLE "experiment_user_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "experiment_id" UUID NOT NULL REFERENCES "experiments"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL REFERENCES "experiment_variants"("id") ON DELETE CASCADE,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "unique_experiment_user" UNIQUE ("experiment_id", "user_id")
);

CREATE INDEX "idx_experiment_user_assignments_exp_user" ON "experiment_user_assignments"("experiment_id", "user_id");

-- Prompt Variants
CREATE TABLE "prompt_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" VARCHAR(255),
  "system_prompt" TEXT NOT NULL,
  "user_prompt_template" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,

  -- Performance metrics
  "success_rate" DECIMAL(5,4) DEFAULT 0,
  "avg_latency_ms" INTEGER DEFAULT 0,
  "avg_cost_cents" INTEGER DEFAULT 0,
  "sample_size" INTEGER DEFAULT 0,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_prompt_variants_org_agent" ON "prompt_variants"("organization_id", "agent_id");
CREATE INDEX "idx_prompt_variants_active" ON "prompt_variants"("organization_id", "agent_id", "is_active");

-- Routing Rules
CREATE TABLE "routing_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" VARCHAR(100) NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT '{}',
  "patterns" TEXT[] NOT NULL DEFAULT '{}',
  "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.8,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  -- Performance metrics
  "match_count" INTEGER NOT NULL DEFAULT 0,
  "correct_count" INTEGER NOT NULL DEFAULT 0,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_routing_rules_org_agent" ON "routing_rules"("organization_id", "agent_id");
CREATE INDEX "idx_routing_rules_enabled" ON "routing_rules"("organization_id", "enabled");

-- Routing Feedback (misroute tracking)
CREATE TABLE "routing_feedback" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rule_id" UUID REFERENCES "routing_rules"("id") ON DELETE SET NULL,
  "input_text" TEXT NOT NULL,
  "matched_agent_id" VARCHAR(100),
  "correct_agent_id" VARCHAR(100),
  "was_correct" BOOLEAN NOT NULL,
  "user_id" UUID,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_routing_feedback_org" ON "routing_feedback"("organization_id");
CREATE INDEX "idx_routing_feedback_rule" ON "routing_feedback"("rule_id");
CREATE INDEX "idx_routing_feedback_correct" ON "routing_feedback"("organization_id", "was_correct");

-- Model Profiles
CREATE TABLE "model_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL UNIQUE,
  "provider" VARCHAR(50) NOT NULL,
  "max_tokens" INTEGER NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT '{}',

  -- Cost per 1K tokens
  "input_cost_per_1k" DECIMAL(10,6) NOT NULL,
  "output_cost_per_1k" DECIMAL(10,6) NOT NULL,

  -- Performance benchmarks
  "benchmark_accuracy" DECIMAL(5,4),
  "benchmark_latency_ms" INTEGER,
  "benchmark_cost_efficiency" DECIMAL(5,4),

  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_model_profiles_provider" ON "model_profiles"("provider");
CREATE INDEX "idx_model_profiles_enabled" ON "model_profiles"("enabled");

-- Agent Model Preferences (per-agent model selection learning)
CREATE TABLE "agent_model_preferences" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" VARCHAR(100) NOT NULL,
  "task_type" VARCHAR(50) NOT NULL,
  "model_name" VARCHAR(100) NOT NULL,
  "score" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  "sample_size" INTEGER NOT NULL DEFAULT 0,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "unique_agent_task_model" UNIQUE ("organization_id", "agent_id", "task_type", "model_name")
);

CREATE INDEX "idx_agent_model_prefs_org_agent" ON "agent_model_preferences"("organization_id", "agent_id");
CREATE INDEX "idx_agent_model_prefs_task" ON "agent_model_preferences"("organization_id", "agent_id", "task_type");

-- Seed some default model profiles
INSERT INTO "model_profiles" ("name", "provider", "max_tokens", "capabilities", "input_cost_per_1k", "output_cost_per_1k", "benchmark_accuracy", "benchmark_latency_ms", "benchmark_cost_efficiency") VALUES
  ('gpt-4-turbo', 'openai', 128000, '{"reasoning","coding","creative","fast"}', 0.01, 0.03, 0.92, 1500, 0.85),
  ('gpt-4o', 'openai', 128000, '{"reasoning","coding","creative","fast"}', 0.005, 0.015, 0.90, 800, 0.90),
  ('gpt-4o-mini', 'openai', 128000, '{"fast","coding"}', 0.00015, 0.0006, 0.78, 400, 0.95),
  ('claude-3-5-sonnet-20241022', 'anthropic', 200000, '{"reasoning","coding","creative"}', 0.003, 0.015, 0.91, 1200, 0.88),
  ('claude-3-5-haiku-20241022', 'anthropic', 200000, '{"fast","coding"}', 0.001, 0.005, 0.80, 600, 0.93),
  ('claude-3-opus-20240229', 'anthropic', 200000, '{"reasoning","creative"}', 0.015, 0.075, 0.95, 2500, 0.70);
