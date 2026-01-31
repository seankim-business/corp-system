-- Add missing indexes on foreign key columns for query performance
-- These columns are used in JOINs and WHERE clauses but lack indexes

-- Tasks table: projectId FK
CREATE INDEX IF NOT EXISTS "tasks_project_id_idx" ON "tasks"("project_id");

-- Agents table: projectId FK (for project-based agents)
CREATE INDEX IF NOT EXISTS "agents_project_id_idx" ON "agents"("project_id");

-- Projects table: ownerId (frequently filtered by owner)
CREATE INDEX IF NOT EXISTS "projects_owner_id_idx" ON "projects"("owner_id");

-- Goals table: ownerPositionId (FK-like reference)
CREATE INDEX IF NOT EXISTS "goals_owner_position_id_idx" ON "goals"("owner_position_id");

-- KPIs table: ownerRoleId (FK-like reference)
CREATE INDEX IF NOT EXISTS "kpis_owner_role_id_idx" ON "kpis"("owner_role_id");

-- Approvals table: fallbackApproverId (used in escalation queries)
CREATE INDEX IF NOT EXISTS "approvals_fallback_approver_id_idx" ON "approvals"("fallback_approver_id");

-- Organization changes: createdBy (audit trail queries)
CREATE INDEX IF NOT EXISTS "organization_changes_created_by_idx" ON "organization_changes"("created_by");

-- Feature flag audit logs: userId (audit trail queries)
CREATE INDEX IF NOT EXISTS "feature_flag_audit_logs_user_id_idx" ON "feature_flag_audit_logs"("user_id");
