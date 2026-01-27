-- AddMCPConnections migration
-- Created: 2026-01-25 23:26:53
-- Sessions table is now created in init migration with all orchestrator fields

-- Create MCP connections table (generic, not Notion-specific)
CREATE TABLE IF NOT EXISTS "mcp_connections" (
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
CREATE INDEX IF NOT EXISTS "mcp_connections_organization_id_idx" ON "mcp_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "mcp_connections_provider_idx" ON "mcp_connections"("provider");

-- Add unique constraint to prevent duplicate connections
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_connections_org_provider_name_unique" 
  ON "mcp_connections"("organization_id", "provider", "name");

COMMENT ON TABLE "mcp_connections" IS 'Generic MCP (Model Context Protocol) connections for any productivity tool (Linear, Notion, Jira, Asana, etc.)';
COMMENT ON COLUMN "mcp_connections"."provider" IS 'MCP provider name: notion, linear, jira, asana, airtable, monday, etc.';
COMMENT ON COLUMN "mcp_connections"."config" IS 'Provider-specific configuration (API keys, tokens, database IDs, etc.)';
