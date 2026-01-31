-- CreateTable "organization_changes"
CREATE TABLE "organization_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "impact_level" VARCHAR(20) NOT NULL DEFAULT 'low',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_changes_organization_id_idx" ON "organization_changes"("organization_id");

-- CreateIndex
CREATE INDEX "organization_changes_organization_id_created_at_idx" ON "organization_changes"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_changes_type_idx" ON "organization_changes"("type");

-- CreateIndex
CREATE INDEX "organization_changes_impact_level_idx" ON "organization_changes"("impact_level");

-- AddForeignKey
ALTER TABLE "organization_changes" ADD CONSTRAINT "organization_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
