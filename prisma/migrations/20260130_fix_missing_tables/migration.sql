-- Fix migration: Create missing tables that were not created due to migration issues

-- CreateTable memberships (if not exists)
CREATE TABLE IF NOT EXISTS "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "invited_by" UUID,
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_briefing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_briefing_time" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "daily_briefing_timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "mega_app_role_id" UUID,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable approvals (if not exists)
CREATE TABLE IF NOT EXISTS "approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "fallback_approver_id" UUID,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "context" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "response_note" TEXT,
    "slack_message_ts" VARCHAR(50),
    "slack_channel_id" VARCHAR(50),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- Add indexes for memberships
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "memberships_organization_id_idx" ON "memberships"("organization_id");
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships"("user_id");

-- Add indexes for approvals
CREATE INDEX IF NOT EXISTS "approvals_organization_id_status_idx" ON "approvals"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "approvals_approver_id_status_idx" ON "approvals"("approver_id", "status");

-- AddForeignKey memberships -> organizations (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_organization_id_fkey') THEN
        ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey memberships -> users (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_user_id_fkey') THEN
        ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
