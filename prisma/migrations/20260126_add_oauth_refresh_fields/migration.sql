-- Add OAuth refresh token support to MCPConnection
-- Enables automatic token refresh for OAuth 2.0 providers (Notion, Linear, GitHub, etc.)

ALTER TABLE "mcp_connections"
ADD COLUMN "refresh_token" TEXT,
ADD COLUMN "expires_at" TIMESTAMPTZ(6);

-- Index for efficient token expiration queries
CREATE INDEX "mcp_connections_expires_at_idx" ON "mcp_connections"("expires_at");
