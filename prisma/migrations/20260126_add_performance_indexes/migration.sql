-- Performance Indexes for High-Throughput Multi-Tenant SaaS
-- Created: 2026-01-26
-- Purpose: Optimize common query patterns

-- Sessions: organizationId + status queries
CREATE INDEX IF NOT EXISTS idx_sessions_organization_status 
ON sessions(organization_id, last_used_at DESC) 
WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_slack_thread 
ON sessions((metadata->>'slackThreadTs')) 
WHERE metadata->>'slackThreadTs' IS NOT NULL;

-- WorkflowExecutions: organizationId + status + timestamp
CREATE INDEX IF NOT EXISTS idx_workflow_executions_org_status 
ON workflow_executions(organization_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow 
ON workflow_executions(workflow_id, status, started_at DESC);

-- MCPConnections: organizationId + enabled
CREATE INDEX IF NOT EXISTS idx_mcp_connections_org_enabled 
ON mcp_connections(organization_id, enabled) 
WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_mcp_connections_provider 
ON mcp_connections(organization_id, provider, enabled);

-- Memberships: userId lookups
CREATE INDEX IF NOT EXISTS idx_memberships_user_role 
ON memberships(user_id, role);

-- Users: email lookups (already exists, adding googleId composite)
CREATE INDEX IF NOT EXISTS idx_users_google_email 
ON users(google_id, email) 
WHERE google_id IS NOT NULL;

-- Workflows: organizationId + enabled
CREATE INDEX IF NOT EXISTS idx_workflows_org_enabled 
ON workflows(organization_id, enabled, updated_at DESC);

-- NotionConnections: organizationId
CREATE INDEX IF NOT EXISTS idx_notion_connections_org 
ON notion_connections(organization_id, enabled);

-- Composite index for multi-tenant isolation + filtering
CREATE INDEX IF NOT EXISTS idx_workflows_org_enabled_type 
ON workflows(organization_id, enabled, (config->>'type')) 
WHERE enabled = true;
