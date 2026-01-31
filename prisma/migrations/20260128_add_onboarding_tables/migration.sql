-- CreateTable: OnboardingState
CREATE TABLE "onboarding_states" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
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

-- CreateTable: OnboardingChecklistItem
CREATE TABLE "onboarding_checklist_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "item_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_states_organization_id_key" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_organization_id_idx" ON "onboarding_states"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_states_current_step_idx" ON "onboarding_states"("current_step");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_items_organization_id_item_id_key" ON "onboarding_checklist_items"("organization_id", "item_id");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_organization_id_idx" ON "onboarding_checklist_items"("organization_id");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_status_idx" ON "onboarding_checklist_items"("status");
