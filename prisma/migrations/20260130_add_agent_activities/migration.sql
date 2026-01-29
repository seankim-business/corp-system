-- CreateTable
CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

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
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
