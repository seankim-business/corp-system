-- CreateTable
CREATE TABLE "user_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "rating" INTEGER,
    "reaction" VARCHAR(20),
    "correction" JSONB,
    "comment" TEXT,
    "original_request" TEXT NOT NULL,
    "agent_response" TEXT NOT NULL,
    "implicit_signals" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50),
    "sentiment" VARCHAR(20),
    "severity" VARCHAR(20),
    "root_cause" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "feedback_ids" UUID[],
    "type" VARCHAR(50) NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "auto_applicable" BOOLEAN NOT NULL DEFAULT false,
    "requires_human_review" BOOLEAN NOT NULL DEFAULT true,
    "estimated_impact" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,
    "rollback_at" TIMESTAMPTZ(6),
    "rollback_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_feedback_organization_id_agent_id_created_at_idx" ON "user_feedback"("organization_id", "agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_feedback_organization_id_processed_idx" ON "user_feedback"("organization_id", "processed");

-- CreateIndex
CREATE INDEX "user_feedback_execution_id_idx" ON "user_feedback"("execution_id");

-- CreateIndex
CREATE INDEX "user_feedback_user_id_idx" ON "user_feedback"("user_id");

-- CreateIndex
CREATE INDEX "feedback_actions_organization_id_status_idx" ON "feedback_actions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "feedback_actions_organization_id_type_idx" ON "feedback_actions"("organization_id", "type");

-- CreateIndex
CREATE INDEX "feedback_actions_priority_status_idx" ON "feedback_actions"("priority", "status");
