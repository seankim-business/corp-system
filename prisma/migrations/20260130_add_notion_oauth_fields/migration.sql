-- Add OAuth fields to notion_connections table
-- Supports OAuth flow alongside legacy API key authentication

ALTER TABLE "notion_connections"
  ALTER COLUMN "api_key" SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS "access_token" TEXT,
  ADD COLUMN IF NOT EXISTS "bot_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "workspace_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "workspace_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "workspace_icon" TEXT,
  ADD COLUMN IF NOT EXISTS "connected_at" TIMESTAMPTZ(6);
