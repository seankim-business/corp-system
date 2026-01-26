-- Feature flags: safe release / rollout

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

CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

CREATE TABLE "feature_flag_rules" (
  "id" UUID NOT NULL,
  "feature_flag_id" UUID NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "organization_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "percentage" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "feature_flag_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_rules_feature_flag_id_priority_idx"
  ON "feature_flag_rules"("feature_flag_id", "priority");
CREATE INDEX "feature_flag_rules_type_idx" ON "feature_flag_rules"("type");

ALTER TABLE "feature_flag_rules"
  ADD CONSTRAINT "feature_flag_rules_feature_flag_id_fkey"
  FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

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

CREATE UNIQUE INDEX "feature_flag_overrides_feature_flag_id_organization_id_key"
  ON "feature_flag_overrides"("feature_flag_id", "organization_id");
CREATE INDEX "feature_flag_overrides_organization_id_idx" ON "feature_flag_overrides"("organization_id");
CREATE INDEX "feature_flag_overrides_expires_at_idx" ON "feature_flag_overrides"("expires_at");

ALTER TABLE "feature_flag_overrides"
  ADD CONSTRAINT "feature_flag_overrides_feature_flag_id_fkey"
  FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feature_flag_overrides"
  ADD CONSTRAINT "feature_flag_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

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

CREATE INDEX "feature_flag_audit_logs_feature_flag_id_created_at_idx"
  ON "feature_flag_audit_logs"("feature_flag_id", "created_at" DESC);
CREATE INDEX "feature_flag_audit_logs_organization_id_created_at_idx"
  ON "feature_flag_audit_logs"("organization_id", "created_at" DESC);
CREATE INDEX "feature_flag_audit_logs_action_created_at_idx"
  ON "feature_flag_audit_logs"("action", "created_at" DESC);

ALTER TABLE "feature_flag_audit_logs"
  ADD CONSTRAINT "feature_flag_audit_logs_feature_flag_id_fkey"
  FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feature_flag_audit_logs"
  ADD CONSTRAINT "feature_flag_audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feature_flag_audit_logs"
  ADD CONSTRAINT "feature_flag_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
