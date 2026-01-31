-- Add BYOA (Bring Your Own App) support for Slack integrations
-- Organizations can now provide their own Slack App credentials

-- Add new columns for Slack App credentials
ALTER TABLE "slack_integrations" ADD COLUMN IF NOT EXISTS "client_id" TEXT;
ALTER TABLE "slack_integrations" ADD COLUMN IF NOT EXISTS "client_secret" TEXT;

-- Make fields nullable that are only filled after OAuth completion
ALTER TABLE "slack_integrations" ALTER COLUMN "workspace_id" DROP NOT NULL;
ALTER TABLE "slack_integrations" ALTER COLUMN "workspace_name" DROP NOT NULL;
ALTER TABLE "slack_integrations" ALTER COLUMN "bot_token" DROP NOT NULL;
ALTER TABLE "slack_integrations" ALTER COLUMN "signing_secret" DROP NOT NULL;

-- Drop the old composite unique constraint if it exists (workspace can be null now)
ALTER TABLE "slack_integrations" DROP CONSTRAINT IF EXISTS "slack_integrations_organization_id_workspace_id_key";

-- Add unique constraint on organization_id (one integration per org)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'slack_integrations_organization_id_key'
  ) THEN
    ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_organization_id_key" UNIQUE ("organization_id");
  END IF;
END $$;
