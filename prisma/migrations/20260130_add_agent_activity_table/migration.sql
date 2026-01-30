-- CreateTable "agent_activities"
CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agent_type" VARCHAR(100) NOT NULL,
    "agent_name" VARCHAR(255),
    "session_id" VARCHAR(255),
    "parent_activity_id" UUID,
    "task_description" TEXT,
    "category" VARCHAR(100),
    "skills" VARCHAR(100)[],
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "current_step" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "input_data" JSONB,
    "output_data" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "slack_channel_id" VARCHAR(50),
    "slack_thread_ts" VARCHAR(50),
    "slack_message_ts" VARCHAR(50),
    "claude_max_account_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_activities_organization_id_created_at_idx" ON "agent_activities"("organization_id" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_activities_organization_id_status_idx" ON "agent_activities"("organization_id", "status");

-- CreateIndex
CREATE INDEX "agent_activities_session_id_idx" ON "agent_activities"("session_id");

-- CreateIndex
CREATE INDEX "agent_activities_agent_type_idx" ON "agent_activities"("agent_type");

-- CreateIndex
CREATE INDEX "agent_activities_status_idx" ON "agent_activities"("status");

-- CreateIndex
CREATE INDEX "agent_activities_parent_activity_id_idx" ON "agent_activities"("parent_activity_id");

-- CreateIndex
CREATE INDEX "agent_activities_slack_channel_id_slack_thread_ts_idx" ON "agent_activities"("slack_channel_id", "slack_thread_ts");

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_parent_activity_id_fkey" FOREIGN KEY ("parent_activity_id") REFERENCES "agent_activities"("id") ON DELETE SET NULL;
