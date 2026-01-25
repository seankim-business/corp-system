-- Kyndof Corp System - Initial Schema Migration
-- Multi-tenant SaaS with Google Workspace integration
-- Created: 2026-01-25

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE MULTI-TENANT TABLES
-- ============================================================================

-- Organizations (Tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

COMMENT ON TABLE organizations IS 'Multi-tenant organizations/companies';
COMMENT ON COLUMN organizations.slug IS 'Subdomain identifier (e.g., kyndof, clientco)';

-- Users (Global identity)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

COMMENT ON TABLE users IS 'Global user accounts (can belong to multiple organizations)';
COMMENT ON COLUMN users.google_id IS 'Google OAuth subject (sub) identifier';

-- Memberships (User ↔ Organization)
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_memberships_org ON memberships(organization_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);

COMMENT ON TABLE memberships IS 'User-to-organization relationships with roles';

-- Workspace Domains (Google Workspace domains)
CREATE TABLE workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) UNIQUE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, domain)
);

CREATE INDEX idx_workspace_domains_org ON workspace_domains(organization_id);
CREATE INDEX idx_workspace_domains_domain ON workspace_domains(domain);

COMMENT ON TABLE workspace_domains IS 'Google Workspace domains linked to organizations';
COMMENT ON COLUMN workspace_domains.verified IS 'Domain ownership verified via DNS TXT record';

-- Sessions (Optional for JWT-based auth)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_org ON sessions(organization_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

COMMENT ON TABLE sessions IS 'Active user sessions (optional - can use stateless JWT)';

-- ============================================================================
-- AGENT HIERARCHY TABLES
-- ============================================================================

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  leader_id UUID,
  type VARCHAR(50) NOT NULL CHECK (type IN ('permanent', 'temporary', 'taskforce')),
  max_members INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teams_org ON teams(organization_id);

COMMENT ON TABLE teams IS 'Groups of agents (e.g., Brand Ops team, temporary TF)';

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('permanent', 'temporary', 'contractor')),
  role TEXT NOT NULL,
  manager_id UUID REFERENCES agents(id),
  team_id UUID REFERENCES teams(id),
  skills VARCHAR(100)[],
  session_id VARCHAR(255),
  hired_at TIMESTAMPTZ DEFAULT NOW(),
  contract_end TIMESTAMPTZ,
  project_id UUID,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_manager ON agents(manager_id);
CREATE INDEX idx_agents_team ON agents(team_id);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_status ON agents(status);

COMMENT ON TABLE agents IS 'AI agents (permanent employees, temporary contractors)';
COMMENT ON COLUMN agents.type IS 'permanent: regular team member, temporary: project-based, contractor: external';
COMMENT ON COLUMN agents.session_id IS 'Persistent session ID for context continuity';

-- ============================================================================
-- BUSINESS DATA TABLES (Tenant-scoped)
-- ============================================================================

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  owner_id UUID,
  start_date DATE,
  due_date DATE,
  progress INTEGER DEFAULT 0,
  budget DECIMAL(15, 2),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_org_id ON projects(organization_id, id);
CREATE INDEX idx_projects_org_created ON projects(organization_id, created_at DESC);

COMMENT ON TABLE projects IS 'Projects scoped to organizations';

-- Tasks (RABSIC-enabled)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  name VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL,
  due_date DATE,
  urgency_score INTEGER DEFAULT 0,
  importance_score INTEGER DEFAULT 0,
  eisenhower_quadrant VARCHAR(50),
  
  -- RABSIC fields (array of user UUIDs)
  responsible UUID[],
  accountable UUID[],
  backup UUID[],
  support UUID[],
  informed UUID[],
  consulted UUID[],
  
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_org_id ON tasks(organization_id, id);
CREATE INDEX idx_tasks_org_status ON tasks(organization_id, status);
CREATE INDEX idx_tasks_org_due ON tasks(organization_id, due_date);

COMMENT ON TABLE tasks IS 'Tasks with RABSIC (Responsible, Accountable, Backup, Support, Informed, Consulted)';

-- Goals (Hierarchical)
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL,
  owner_position_id UUID,
  due_date DATE,
  progress INTEGER DEFAULT 0,
  parent_goal_id UUID REFERENCES goals(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_org_id ON goals(organization_id, id);
CREATE INDEX idx_goals_parent ON goals(parent_goal_id);

COMMENT ON TABLE goals IS 'Hierarchical goals (Vision → Long-term → Strategic → Operational)';

-- Value Streams
CREATE TABLE value_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  functions VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  input TEXT,
  output TEXT,
  parent_id UUID REFERENCES value_streams(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_value_streams_org_id ON value_streams(organization_id, id);
CREATE INDEX idx_value_streams_parent ON value_streams(parent_id);

COMMENT ON TABLE value_streams IS 'Business processes and workflows';

-- KPIs
CREATE TABLE kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  owner_role_id UUID,
  target VARCHAR(255),
  current_value DECIMAL(15, 2),
  unit VARCHAR(50),
  update_frequency VARCHAR(50),
  data_source TEXT,
  up_to_date BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kpis_org_id ON kpis(organization_id, id);

COMMENT ON TABLE kpis IS 'Key Performance Indicators';

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) for Tenant Isolation
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE value_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access data from organizations they belong to
CREATE POLICY membership_isolation ON memberships
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY workspace_domain_isolation ON workspace_domains
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships 
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  );

-- Policy: Tenant isolation for all business data
CREATE POLICY tenant_isolation_teams ON teams
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_agents ON agents
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_projects ON projects
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_tasks ON tasks
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_goals ON goals
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_value_streams ON value_streams
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

CREATE POLICY tenant_isolation_kpis ON kpis
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

-- ============================================================================
-- TRIGGERS for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_value_streams_updated_at BEFORE UPDATE ON value_streams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpis_updated_at BEFORE UPDATE ON kpis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA (Initial Kyndof organization)
-- ============================================================================

INSERT INTO organizations (slug, name) VALUES ('kyndof', 'Kyndof Corporation');

INSERT INTO workspace_domains (organization_id, domain, verified) 
VALUES (
  (SELECT id FROM organizations WHERE slug = 'kyndof'),
  'kyndof.com',
  true
);

COMMENT ON DATABASE kyndof_corp IS 'Kyndof Corp System - Multi-tenant SaaS with Google Workspace integration';
