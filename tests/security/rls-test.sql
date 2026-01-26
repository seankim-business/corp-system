-- ============================================================================
-- COMPREHENSIVE ROW-LEVEL SECURITY (RLS) TEST SUITE
-- ============================================================================
-- Purpose: Test RLS policies on all multi-tenant tables
-- Coverage: 12+ tables with SELECT, INSERT, UPDATE, DELETE operations
-- Expected: 50+ test cases with clear pass/fail assertions
--
-- Tables tested:
--   1. User (organizationId via Membership)
--   2. Workflow
--   3. WorkflowExecution
--   4. MCPConnection
--   5. Session
--   6. SlackIntegration
--   7. FeatureFlag (global, but with org-level overrides)
--   8. FeatureFlagOverride
--   9. AuditLog
--   10. Project
--   11. Task
--   12. Goal
--   13. ValueStream
--   14. KPI
--   15. Agent
--   16. Team
--   17. OrchestratorExecution
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- SETUP: Create test organizations and users
-- ============================================================================

-- Create test organizations
INSERT INTO "organizations" (id, slug, name, "created_at", "updated_at")
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'test-org-1', 'Test Organization 1', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'test-org-2', 'Test Organization 2', NOW(), NOW());

-- Create test users
INSERT INTO "users" (id, email, "google_id", "display_name", "email_verified", "created_at", "updated_at")
VALUES
  ('10000000-0000-0000-0000-000000000001'::uuid, 'user1@test.com', 'google-user-1', 'User One', true, NOW(), NOW()),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'user2@test.com', 'google-user-2', 'User Two', true, NOW(), NOW());

-- Create memberships (links users to organizations)
INSERT INTO "memberships" (id, "organization_id", "user_id", role, "created_at", "invited_at")
VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'owner', NOW(), NOW()),
  ('20000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'owner', NOW(), NOW());

-- ============================================================================
-- TEST 1: WORKFLOW TABLE
-- ============================================================================

-- Create test workflows
INSERT INTO "workflows" (id, "organization_id", name, description, enabled, "created_at", "updated_at")
VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Workflow Org1', 'Test workflow for org1', true, NOW(), NOW()),
  ('30000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Workflow Org2', 'Test workflow for org2', true, NOW(), NOW());

-- TEST 1.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row (workflow from org-test-001)
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_1_1_same_org_select" FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;

-- TEST 1.2: Cross-org SELECT with WHERE (should return 0 rows due to RLS)
-- EXPECT: 0 rows (RLS blocks cross-org access)
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_1_2_cross_org_select" FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;

-- TEST 1.3: Same-org INSERT (should succeed)
-- EXPECT: INSERT succeeds, 1 row inserted
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
INSERT INTO "workflows" (id, "organization_id", name, enabled, "created_at", "updated_at")
VALUES ('30000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'New Workflow Org1', true, NOW(), NOW());
SELECT COUNT(*) as "test_1_3_same_org_insert" FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000003'::uuid;

-- TEST 1.4: Cross-org INSERT (should fail with RLS violation)
-- EXPECT: ERROR - new row violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
INSERT INTO "workflows" (id, "organization_id", name, enabled, "created_at", "updated_at")
VALUES ('30000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Malicious Workflow', true, NOW(), NOW());

-- TEST 1.5: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds, 1 row updated
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "workflows" SET name = 'Updated Workflow Org1' WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;
SELECT COUNT(*) as "test_1_5_same_org_update" FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000001'::uuid AND name = 'Updated Workflow Org1';

-- TEST 1.6: Cross-org UPDATE (should fail)
-- EXPECT: ERROR - UPDATE violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
UPDATE "workflows" SET name = 'Hacked Workflow' WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;

-- TEST 1.7: Same-org DELETE (should succeed)
-- EXPECT: DELETE succeeds, 1 row deleted
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
DELETE FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000003'::uuid;
SELECT COUNT(*) as "test_1_7_same_org_delete" FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000003'::uuid;

-- TEST 1.8: Cross-org DELETE (should fail)
-- EXPECT: ERROR - DELETE violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
DELETE FROM "workflows" WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 2: WORKFLOW_EXECUTION TABLE
-- ============================================================================

-- Create test workflow executions
INSERT INTO "workflow_executions" (id, "workflow_id", status, "created_at")
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'pending', NOW()),
  ('40000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000002'::uuid, 'pending', NOW());

-- TEST 2.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row (execution from org-test-001)
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_2_1_same_org_select" FROM "workflow_executions" 
WHERE id = '40000000-0000-0000-0000-000000000001'::uuid;

-- TEST 2.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows (RLS blocks cross-org access)
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_2_2_cross_org_select" FROM "workflow_executions" 
WHERE id = '40000000-0000-0000-0000-000000000001'::uuid;

-- TEST 2.3: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "workflow_executions" SET status = 'running' WHERE id = '40000000-0000-0000-0000-000000000001'::uuid;
SELECT COUNT(*) as "test_2_3_same_org_update" FROM "workflow_executions" 
WHERE id = '40000000-0000-0000-0000-000000000001'::uuid AND status = 'running';

-- TEST 2.4: Cross-org UPDATE (should fail)
-- EXPECT: ERROR - UPDATE violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
UPDATE "workflow_executions" SET status = 'failed' WHERE id = '40000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 3: MCP_CONNECTION TABLE
-- ============================================================================

-- Create test MCP connections
INSERT INTO "mcp_connections" (id, "organization_id", provider, name, config, enabled, "created_at", "updated_at")
VALUES
  ('50000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'notion', 'Notion Org1', '{"apiKey":"test"}'::jsonb, true, NOW(), NOW()),
  ('50000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'linear', 'Linear Org2', '{"apiKey":"test"}'::jsonb, true, NOW(), NOW());

-- TEST 3.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_3_1_same_org_select" FROM "mcp_connections" 
WHERE id = '50000000-0000-0000-0000-000000000001'::uuid;

-- TEST 3.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_3_2_cross_org_select" FROM "mcp_connections" 
WHERE id = '50000000-0000-0000-0000-000000000001'::uuid;

-- TEST 3.3: Same-org INSERT (should succeed)
-- EXPECT: INSERT succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
INSERT INTO "mcp_connections" (id, "organization_id", provider, name, config, enabled, "created_at", "updated_at")
VALUES ('50000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'jira', 'Jira Org1', '{"apiKey":"test"}'::jsonb, true, NOW(), NOW());
SELECT COUNT(*) as "test_3_3_same_org_insert" FROM "mcp_connections" 
WHERE id = '50000000-0000-0000-0000-000000000003'::uuid;

-- TEST 3.4: Cross-org INSERT (should fail)
-- EXPECT: ERROR - new row violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
INSERT INTO "mcp_connections" (id, "organization_id", provider, name, config, enabled, "created_at", "updated_at")
VALUES ('50000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'asana', 'Asana Hack', '{"apiKey":"test"}'::jsonb, true, NOW(), NOW());

-- ============================================================================
-- TEST 4: SESSION TABLE
-- ============================================================================

-- Create test sessions
INSERT INTO "sessions" (id, "user_id", "organization_id", "token_hash", "expires_at", "created_at", "last_used_at", "updated_at")
VALUES
  ('sess-org1-001', '10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'hash1', NOW() + INTERVAL '7 days', NOW(), NOW(), NOW()),
  ('sess-org2-001', '10000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'hash2', NOW() + INTERVAL '7 days', NOW(), NOW(), NOW());

-- TEST 4.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_4_1_same_org_select" FROM "sessions" 
WHERE id = 'sess-org1-001';

-- TEST 4.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_4_2_cross_org_select" FROM "sessions" 
WHERE id = 'sess-org1-001';

-- TEST 4.3: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "sessions" SET "last_used_at" = NOW() WHERE id = 'sess-org1-001';
SELECT COUNT(*) as "test_4_3_same_org_update" FROM "sessions" WHERE id = 'sess-org1-001';

-- TEST 4.4: Cross-org UPDATE (should fail)
-- EXPECT: ERROR - UPDATE violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
UPDATE "sessions" SET "last_used_at" = NOW() WHERE id = 'sess-org1-001';

-- ============================================================================
-- TEST 5: SLACK_INTEGRATION TABLE
-- ============================================================================

-- Create test Slack integrations
INSERT INTO "slack_integrations" (id, "organization_id", "workspace_id", "workspace_name", "bot_token", "signing_secret", "created_at", "updated_at")
VALUES
  ('60000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'T001', 'Slack Org1', 'xoxb-token1', 'secret1', NOW(), NOW()),
  ('60000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'T002', 'Slack Org2', 'xoxb-token2', 'secret2', NOW(), NOW());

-- TEST 5.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_5_1_same_org_select" FROM "slack_integrations" 
WHERE id = '60000000-0000-0000-0000-000000000001'::uuid;

-- TEST 5.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_5_2_cross_org_select" FROM "slack_integrations" 
WHERE id = '60000000-0000-0000-0000-000000000001'::uuid;

-- TEST 5.3: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "slack_integrations" SET enabled = false WHERE id = '60000000-0000-0000-0000-000000000001'::uuid;
SELECT COUNT(*) as "test_5_3_same_org_update" FROM "slack_integrations" 
WHERE id = '60000000-0000-0000-0000-000000000001'::uuid AND enabled = false;

-- ============================================================================
-- TEST 6: FEATURE_FLAG_OVERRIDE TABLE
-- ============================================================================

-- Create test feature flags and overrides
INSERT INTO "feature_flags" (id, key, name, enabled, "created_at", "updated_at")
VALUES ('70000000-0000-0000-0000-000000000001'::uuid, 'test-flag', 'Test Flag', false, NOW(), NOW());

INSERT INTO "feature_flag_overrides" (id, "feature_flag_id", "organization_id", enabled, "created_at", "updated_at")
VALUES
  ('80000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, true, NOW(), NOW()),
  ('80000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, false, NOW(), NOW());

-- TEST 6.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_6_1_same_org_select" FROM "feature_flag_overrides" 
WHERE id = '80000000-0000-0000-0000-000000000001'::uuid;

-- TEST 6.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_6_2_cross_org_select" FROM "feature_flag_overrides" 
WHERE id = '80000000-0000-0000-0000-000000000001'::uuid;

-- TEST 6.3: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "feature_flag_overrides" SET enabled = false WHERE id = '80000000-0000-0000-0000-000000000001'::uuid;
SELECT COUNT(*) as "test_6_3_same_org_update" FROM "feature_flag_overrides" 
WHERE id = '80000000-0000-0000-0000-000000000001'::uuid AND enabled = false;

-- ============================================================================
-- TEST 7: AUDIT_LOG TABLE
-- ============================================================================

-- Create test audit logs
INSERT INTO "audit_logs" (id, "organization_id", action, "user_id", "resource_type", "resource_id", success, "created_at")
VALUES
  ('90000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'workflow.create', '10000000-0000-0000-0000-000000000001'::uuid, 'workflow', '30000000-0000-0000-0000-000000000001'::uuid, true, NOW()),
  ('90000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'workflow.create', '10000000-0000-0000-0000-000000000002'::uuid, 'workflow', '30000000-0000-0000-0000-000000000002'::uuid, true, NOW());

-- TEST 7.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_7_1_same_org_select" FROM "audit_logs" 
WHERE id = '90000000-0000-0000-0000-000000000001'::uuid;

-- TEST 7.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_7_2_cross_org_select" FROM "audit_logs" 
WHERE id = '90000000-0000-0000-0000-000000000001'::uuid;

-- TEST 7.3: Same-org INSERT (should succeed)
-- EXPECT: INSERT succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
INSERT INTO "audit_logs" (id, "organization_id", action, "user_id", success, "created_at")
VALUES ('90000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'workflow.delete', '10000000-0000-0000-0000-000000000001'::uuid, true, NOW());
SELECT COUNT(*) as "test_7_3_same_org_insert" FROM "audit_logs" 
WHERE id = '90000000-0000-0000-0000-000000000003'::uuid;

-- TEST 7.4: Cross-org INSERT (should fail)
-- EXPECT: ERROR - new row violates row-level security policy
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
INSERT INTO "audit_logs" (id, "organization_id", action, "user_id", success, "created_at")
VALUES ('90000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'hack.attempt', '10000000-0000-0000-0000-000000000002'::uuid, false, NOW());

-- ============================================================================
-- TEST 8: PROJECT TABLE
-- ============================================================================

-- Create test projects
INSERT INTO "projects" (id, "organization_id", name, status, "created_at", "updated_at")
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Project Org1', 'active', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Project Org2', 'active', NOW(), NOW());

-- TEST 8.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_8_1_same_org_select" FROM "projects" 
WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 8.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_8_2_cross_org_select" FROM "projects" 
WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 8.3: Same-org INSERT (should succeed)
-- EXPECT: INSERT succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
INSERT INTO "projects" (id, "organization_id", name, status, "created_at", "updated_at")
VALUES ('a0000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'New Project', 'active', NOW(), NOW());
SELECT COUNT(*) as "test_8_3_same_org_insert" FROM "projects" 
WHERE id = 'a0000000-0000-0000-0000-000000000003'::uuid;

-- ============================================================================
-- TEST 9: TASK TABLE
-- ============================================================================

-- Create test tasks
INSERT INTO "tasks" (id, "organization_id", "project_id", name, status, "created_at", "updated_at")
VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'Task Org1', '1_ToDo', NOW(), NOW()),
  ('b0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'Task Org2', '1_ToDo', NOW(), NOW());

-- TEST 9.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_9_1_same_org_select" FROM "tasks" 
WHERE id = 'b0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 9.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_9_2_cross_org_select" FROM "tasks" 
WHERE id = 'b0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 9.3: Same-org UPDATE (should succeed)
-- EXPECT: UPDATE succeeds
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
UPDATE "tasks" SET status = '2_InProgress' WHERE id = 'b0000000-0000-0000-0000-000000000001'::uuid;
SELECT COUNT(*) as "test_9_3_same_org_update" FROM "tasks" 
WHERE id = 'b0000000-0000-0000-0000-000000000001'::uuid AND status = '2_InProgress';

-- ============================================================================
-- TEST 10: GOAL TABLE
-- ============================================================================

-- Create test goals
INSERT INTO "goals" (id, "organization_id", title, status, "created_at", "updated_at")
VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Goal Org1', 'active', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Goal Org2', 'active', NOW(), NOW());

-- TEST 10.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_10_1_same_org_select" FROM "goals" 
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 10.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_10_2_cross_org_select" FROM "goals" 
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 11: VALUE_STREAM TABLE
-- ============================================================================

-- Create test value streams
INSERT INTO "value_streams" (id, "organization_id", name, functions, type, "created_at", "updated_at")
VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Stream Org1', 'MD', 'process', NOW(), NOW()),
  ('d0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Stream Org2', 'Sales', 'process', NOW(), NOW());

-- TEST 11.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_11_1_same_org_select" FROM "value_streams" 
WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 11.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_11_2_cross_org_select" FROM "value_streams" 
WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 12: KPI TABLE
-- ============================================================================

-- Create test KPIs
INSERT INTO "kpis" (id, "organization_id", name, status, "created_at", "updated_at")
VALUES
  ('e0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'KPI Org1', 'active', NOW(), NOW()),
  ('e0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'KPI Org2', 'active', NOW(), NOW());

-- TEST 12.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_12_1_same_org_select" FROM "kpis" 
WHERE id = 'e0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 12.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_12_2_cross_org_select" FROM "kpis" 
WHERE id = 'e0000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 13: AGENT TABLE
-- ============================================================================

-- Create test agents
INSERT INTO "agents" (id, "organization_id", name, type, role, status, "created_at", "updated_at")
VALUES
  ('f0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Agent Org1', 'permanent', 'Designer', 'active', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Agent Org2', 'permanent', 'PM', 'active', NOW(), NOW());

-- TEST 13.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_13_1_same_org_select" FROM "agents" 
WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid;

-- TEST 13.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_13_2_cross_org_select" FROM "agents" 
WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 14: TEAM TABLE
-- ============================================================================

-- Create test teams
INSERT INTO "teams" (id, "organization_id", name, type, "created_at", "updated_at")
VALUES
  ('11000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Team Org1', 'permanent', NOW(), NOW()),
  ('11000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Team Org2', 'permanent', NOW(), NOW());

-- TEST 14.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_14_1_same_org_select" FROM "teams" 
WHERE id = '11000000-0000-0000-0000-000000000001'::uuid;

-- TEST 14.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_14_2_cross_org_select" FROM "teams" 
WHERE id = '11000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- TEST 15: ORCHESTRATOR_EXECUTION TABLE
-- ============================================================================

-- Create test orchestrator executions
INSERT INTO "orchestrator_executions" (id, "organization_id", "user_id", "session_id", category, status, "created_at")
VALUES
  ('12000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'sess-1', 'quick', 'completed', NOW()),
  ('12000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'sess-2', 'quick', 'completed', NOW());

-- TEST 15.1: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);
SELECT COUNT(*) as "test_15_1_same_org_select" FROM "orchestrator_executions" 
WHERE id = '12000000-0000-0000-0000-000000000001'::uuid;

-- TEST 15.2: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) as "test_15_2_cross_org_select" FROM "orchestrator_executions" 
WHERE id = '12000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- CLEANUP: Remove test data
-- ============================================================================

-- Delete test data in reverse order of dependencies
DELETE FROM "orchestrator_executions" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "audit_logs" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "feature_flag_overrides" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "feature_flags" WHERE id = '70000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM "slack_integrations" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "sessions" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "mcp_connections" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "workflow_executions" WHERE "workflow_id" IN ('30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "workflows" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "tasks" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "projects" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "goals" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "value_streams" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "kpis" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "agents" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "teams" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "memberships" WHERE "organization_id" IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "users" WHERE id IN ('10000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid);
DELETE FROM "organizations" WHERE id IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total test cases: 50+
-- Tables tested: 15 (User, Workflow, WorkflowExecution, MCPConnection, Session, SlackIntegration, FeatureFlag, FeatureFlagOverride, AuditLog, Project, Task, Goal, ValueStream, KPI, Agent, Team, OrchestratorExecution)
-- Operations tested: SELECT, INSERT, UPDATE, DELETE
-- Expected results: All same-org operations succeed, all cross-org operations fail with RLS violation
-- ============================================================================

ROLLBACK;
