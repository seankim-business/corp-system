ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drive_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slack_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "key_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_hijacking_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "value_streams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kpis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_domains" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "audit_logs"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "drive_connections"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "slack_integrations"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "approvals"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "organization_changes"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "objectives"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "key_results"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "objectives" o
      WHERE o.id = "key_results"."objective_id"
        AND o."organization_id" = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation ON "session_hijacking_attempts"
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

CREATE POLICY tenant_isolation ON "memberships"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY tenant_isolation ON "workspace_domains"
  FOR ALL
  USING ("organization_id" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY global_access ON "feature_flags"
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY tenant_isolation ON "workflow_executions"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "workflows" w
      WHERE w.id = "workflow_executions"."workflow_id"
        AND w."organization_id" = current_setting('app.current_organization_id', true)::uuid
    )
  );
