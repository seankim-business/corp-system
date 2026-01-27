-- AddMCPConnectionsAndEnhancedSessions migration
-- Created: 2026-01-25 23:26:53

-- ============================================================================
-- PART 1: Enhance existing sessions table for orchestrator
-- ============================================================================

-- Add new fields to sessions table
ALTER TABLE "sessions" 
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "state" JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "history" JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

-- Make tokenHash nullable (orchestrator sessions don't need JWT)
ALTER TABLE "sessions" 
  ALTER COLUMN "token_hash" DROP NOT NULL;

-- Update existing sessions to have default values
UPDATE "sessions" 
SET 
  "state" = COALESCE("state", '{}'),
  "history" = COALESCE("history", '[]'),
  "metadata" = COALESCE("metadata", '{}')

-- Add index on source field for fast Slack session lookup
CREATE INDEX IF NOT EXISTS "sessions_source_idx" ON "sessions"("source");

-- ============================================================================
-- PART 2: Create MCP connections table (generic, not Notion-specific)
-- ============================================================================

CREATE TABLE "mcp_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "mcp_connections" 
  ADD CONSTRAINT "mcp_connections_organization_id_fkey" 
  FOREIGN KEY ("organization_id") 
  REFERENCES "organizations"("id") 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

-- Add indexes for performance
CREATE INDEX "mcp_connections_organization_id_idx" ON "mcp_connections"("organization_id");
CREATE INDEX "mcp_connections_provider_idx" ON "mcp_connections"("provider");

-- Add unique constraint to prevent duplicate connections
CREATE UNIQUE INDEX "mcp_connections_org_provider_name_unique" 
  ON "mcp_connections"("organization_id", "provider", "name");

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE "mcp_connections" IS 'Generic MCP (Model Context Protocol) connections for any productivity tool (Linear, Notion, Jira, Asana, etc.)';
COMMENT ON COLUMN "mcp_connections"."provider" IS 'MCP provider name: notion, linear, jira, asana, airtable, monday, etc.';
COMMENT ON COLUMN "mcp_connections"."config" IS 'Provider-specific configuration (API keys, tokens, database IDs, etc.)';
COMMENT ON COLUMN "sessions"."source" IS 'Session source: slack, web, terminal, api (for orchestrator tracking)';
COMMENT ON COLUMN "sessions"."state" IS 'Orchestrator state (current step, context, etc.)';
COMMENT ON COLUMN "sessions"."history" IS 'Conversation history for multi-turn interactions';
COMMENT ON COLUMN "sessions"."metadata" IS 'Additional metadata (slackThreadTs, workspace info, etc.)';
