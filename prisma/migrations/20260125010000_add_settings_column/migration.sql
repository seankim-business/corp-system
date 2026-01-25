-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
