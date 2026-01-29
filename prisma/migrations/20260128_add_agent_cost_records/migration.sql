-- CreateTable
CREATE TABLE "agent_cost_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "category" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_cost_records_organization_id_agent_id_created_at_idx" ON "agent_cost_records"("organization_id", "agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_cost_records_organization_id_created_at_idx" ON "agent_cost_records"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_cost_records_session_id_idx" ON "agent_cost_records"("session_id");

-- CreateIndex
CREATE INDEX "agent_cost_records_agent_id_idx" ON "agent_cost_records"("agent_id");

-- AddForeignKey
ALTER TABLE "agent_cost_records" ADD CONSTRAINT "agent_cost_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "agent_cost_records" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "agent_cost_records_tenant_isolation" ON "agent_cost_records"
    USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY "agent_cost_records_insert_policy" ON "agent_cost_records"
    FOR INSERT
    WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
