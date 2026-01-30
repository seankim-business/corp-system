-- ============================================================================
-- Identity Linking System Migration
-- Multi-ecosystem user identity linking for Slack, Google, and Notion
-- ============================================================================

-- ExternalIdentity table: Unified external identity storage
CREATE TABLE IF NOT EXISTS external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Provider identification
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_team_id VARCHAR(255),

  -- Profile data (synced from provider)
  email VARCHAR(255),
  display_name VARCHAR(255),
  real_name VARCHAR(255),
  avatar_url TEXT,

  -- Provider-specific metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Linking information
  link_status VARCHAR(20) NOT NULL DEFAULT 'unlinked',
  link_method VARCHAR(50),
  link_confidence REAL,
  linked_at TIMESTAMPTZ,
  linked_by UUID REFERENCES users(id),

  -- Sync tracking
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one identity per provider per org
  CONSTRAINT external_identities_org_provider_user_unique
    UNIQUE (organization_id, provider, provider_user_id)
);

-- IdentityLinkSuggestion table: Suggested identity links
CREATE TABLE IF NOT EXISTS identity_link_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Source external identity
  external_identity_id UUID NOT NULL REFERENCES external_identities(id) ON DELETE CASCADE,

  -- Suggested target user
  suggested_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Match details
  match_method VARCHAR(50) NOT NULL,
  confidence_score REAL NOT NULL,
  match_details JSONB NOT NULL DEFAULT '{}',

  -- Workflow state
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one suggestion per identity+user pair
  CONSTRAINT identity_link_suggestions_identity_user_unique
    UNIQUE (external_identity_id, suggested_user_id)
);

-- IdentityLinkAudit table: Audit trail for all identity linking decisions
CREATE TABLE IF NOT EXISTS identity_link_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_identity_id UUID NOT NULL REFERENCES external_identities(id) ON DELETE CASCADE,

  -- Action details
  action VARCHAR(30) NOT NULL,
  user_id UUID,
  previous_user_id UUID,

  -- Context
  link_method VARCHAR(50),
  confidence_score REAL,
  performed_by UUID REFERENCES users(id),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Audit info
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- IdentitySettings table: Organization-level identity settings
CREATE TABLE IF NOT EXISTS identity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Auto-linking configuration
  auto_link_on_email BOOLEAN NOT NULL DEFAULT true,
  auto_link_threshold REAL NOT NULL DEFAULT 0.95,
  suggestion_threshold REAL NOT NULL DEFAULT 0.85,

  -- Provider priorities
  provider_priority JSONB NOT NULL DEFAULT '["google", "slack", "notion"]',

  -- Self-service settings
  allow_user_self_link BOOLEAN NOT NULL DEFAULT true,
  allow_user_self_unlink BOOLEAN NOT NULL DEFAULT true,
  require_admin_approval BOOLEAN NOT NULL DEFAULT false,

  -- Retention
  suggestion_expiry_days INTEGER NOT NULL DEFAULT 30,
  audit_retention_days INTEGER NOT NULL DEFAULT 2555,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- External Identities indexes
CREATE INDEX IF NOT EXISTS idx_external_identities_org
  ON external_identities(organization_id);

CREATE INDEX IF NOT EXISTS idx_external_identities_org_user
  ON external_identities(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_external_identities_org_provider
  ON external_identities(organization_id, provider);

CREATE INDEX IF NOT EXISTS idx_external_identities_org_status
  ON external_identities(organization_id, link_status);

CREATE INDEX IF NOT EXISTS idx_external_identities_org_email
  ON external_identities(organization_id, email);

CREATE INDEX IF NOT EXISTS idx_external_identities_provider_user
  ON external_identities(provider_user_id);

-- Identity Link Suggestions indexes
CREATE INDEX IF NOT EXISTS idx_identity_suggestions_org_status
  ON identity_link_suggestions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_identity_suggestions_org_user
  ON identity_link_suggestions(organization_id, suggested_user_id);

CREATE INDEX IF NOT EXISTS idx_identity_suggestions_expires
  ON identity_link_suggestions(expires_at);

-- Identity Link Audit indexes
CREATE INDEX IF NOT EXISTS idx_identity_audit_org_created
  ON identity_link_audit(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_audit_external_id_created
  ON identity_link_audit(external_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_audit_user
  ON identity_link_audit(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all identity tables
ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_link_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_link_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_identities
CREATE POLICY external_identities_org_isolation ON external_identities
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- RLS Policies for identity_link_suggestions
CREATE POLICY identity_suggestions_org_isolation ON identity_link_suggestions
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- RLS Policies for identity_link_audit
CREATE POLICY identity_audit_org_isolation ON identity_link_audit
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- RLS Policies for identity_settings
CREATE POLICY identity_settings_org_isolation ON identity_settings
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

-- Function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_external_identities_updated_at
  BEFORE UPDATE ON external_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_identity_link_suggestions_updated_at
  BEFORE UPDATE ON identity_link_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_identity_settings_updated_at
  BEFORE UPDATE ON identity_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
