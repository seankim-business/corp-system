-- CreateTable: Delegations (Permission transfers between users)
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegatee_id" UUID NOT NULL,
    "permissions" VARCHAR(100)[] NOT NULL,
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

-- CreateTable: Agent Permission Overrides (Custom permissions for specific agents)
CREATE TABLE "agent_permission_overrides" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "read_patterns" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[],
    "write_patterns" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[],
    "tools" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[],
    "restricted" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[],
    "approval_rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Delegations indexes
CREATE INDEX "delegations_organization_id_delegatee_id_idx" ON "delegations"("organization_id", "delegatee_id");
CREATE INDEX "delegations_organization_id_delegator_id_idx" ON "delegations"("organization_id", "delegator_id");
CREATE INDEX "delegations_delegatee_id_valid_until_idx" ON "delegations"("delegatee_id", "valid_until");
CREATE INDEX "delegations_valid_until_idx" ON "delegations"("valid_until");

-- CreateIndex: AgentPermissionOverride indexes
CREATE UNIQUE INDEX "agent_permission_overrides_organization_id_agent_id_key" ON "agent_permission_overrides"("organization_id", "agent_id");
CREATE INDEX "agent_permission_overrides_organization_id_idx" ON "agent_permission_overrides"("organization_id");
CREATE INDEX "agent_permission_overrides_agent_id_idx" ON "agent_permission_overrides"("agent_id");

-- Enable RLS on new tables
ALTER TABLE "delegations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_permission_overrides" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for delegations table
CREATE POLICY "delegations_select_policy" ON "delegations"
    FOR SELECT
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "delegations_insert_policy" ON "delegations"
    FOR INSERT
    WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "delegations_update_policy" ON "delegations"
    FOR UPDATE
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id))
    WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "delegations_delete_policy" ON "delegations"
    FOR DELETE
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

-- RLS Policies for agent_permission_overrides table
CREATE POLICY "agent_permission_overrides_select_policy" ON "agent_permission_overrides"
    FOR SELECT
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "agent_permission_overrides_insert_policy" ON "agent_permission_overrides"
    FOR INSERT
    WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "agent_permission_overrides_update_policy" ON "agent_permission_overrides"
    FOR UPDATE
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id))
    WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));

CREATE POLICY "agent_permission_overrides_delete_policy" ON "agent_permission_overrides"
    FOR DELETE
    USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID, organization_id));
