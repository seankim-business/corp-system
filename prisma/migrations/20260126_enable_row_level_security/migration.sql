-- Enable RLS on existing multi-tenant tables

-- Helper function to set current organization
CREATE OR REPLACE FUNCTION set_current_organization(org_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', org_id, false);
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on existing tables
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orchestrator_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notion_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_audit_logs" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies for organization_members
CREATE POLICY tenant_isolation ON "organization_members"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for sessions
CREATE POLICY tenant_isolation ON "sessions"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for workflows
CREATE POLICY tenant_isolation ON "workflows"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for orchestrator_executions
CREATE POLICY tenant_isolation ON "orchestrator_executions"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for mcp_connections
CREATE POLICY tenant_isolation ON "mcp_connections"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for notion_connections
CREATE POLICY tenant_isolation ON "notion_connections"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for feature_flag_overrides
CREATE POLICY tenant_isolation ON "feature_flag_overrides"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

-- Tenant isolation policies for feature_flag_audit_logs
CREATE POLICY tenant_isolation ON "feature_flag_audit_logs"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);
