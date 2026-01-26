-- Enable RLS on all multi-tenant tables

-- Helper function to set current organization
CREATE OR REPLACE FUNCTION set_current_organization(org_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', org_id, false);
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "value_streams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kpis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orchestrator_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notion_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slack_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON "memberships"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "workspace_domains"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "sessions"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "agents"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "teams"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "projects"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "tasks"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "goals"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "value_streams"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "kpis"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "workflows"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "orchestrator_executions"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "mcp_connections"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "notion_connections"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "slack_integrations"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "feature_flag_overrides"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "feature_flag_audit_logs"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "audit_logs"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);
