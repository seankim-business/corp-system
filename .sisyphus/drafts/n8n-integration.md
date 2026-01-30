# Draft: n8n Integration for Nubabel

## Requirements (confirmed from user)

1. **n8n Self-hosting** - Instance per organization (multi-tenant isolation)
2. **Workflow Collection** - Systematic categorization of n8n workflows
3. **Marketplace Integration** - Community node discovery and installation
4. **AI Workflow Generation** - Natural language → n8n workflow JSON
5. **n8n as Skills** - Use n8n workflows as orchestrator skills
6. **Access Control** - Org chart + agent-based workflow permissions
7. **SOP ↔ n8n Conversion** - Bidirectional conversion
8. **Pattern Detection Pipeline** - Automatic pattern → SOP → n8n

## Technical Decisions

### Multi-Tenant Architecture

- **Decision**: Instance-per-tenant pattern with Docker containers
- **Rationale**: Complete data isolation, independent scaling, no credential leakage risk
- **Each tenant gets**: Separate n8n container, unique encryption key, isolated PostgreSQL schema

### n8n API Integration

- **API Version**: REST API v1
- **Authentication**: X-N8N-API-KEY header (stored encrypted in MCPConnection)
- **Base URL**: https://{tenant}.workflows.nubabel.com/api/v1/

### Database Models (New)

- `N8nInstance` - Per-org n8n deployment metadata
- `N8nWorkflow` - Workflow references with categorization
- `N8nExecution` - Execution tracking and history
- `N8nCredential` - Credential mapping (n8n ↔ Nubabel)
- `N8nWorkflowPermission` - Agent/role-based access control

### Queue/Worker Pattern

- New queue: `n8n-sync.queue.ts` - For syncing workflows/executions
- New queue: `n8n-generation.queue.ts` - For AI workflow generation
- Follows existing BaseQueue/BaseWorker patterns

### Skill Integration

- n8n workflows registered as skills via `MarketplaceExtension` model
- Skill type: `mcp_server` with `runtimeType: 'n8n'`
- Execution via webhook trigger or API call

## Research Findings

### n8n REST API Capabilities

- Full workflow CRUD: POST/GET/PUT/DELETE /api/v1/workflows
- Execution management: GET /api/v1/executions, POST /api/v1/executions/{id}/retry
- Webhook management: Webhooks accessible via workflow nodes
- Rate limits: No hard limits documented, but should implement client-side throttling

### Multi-Tenant Best Practices

- Unique N8N_ENCRYPTION_KEY per tenant (CRITICAL)
- Database schema isolation via DB_POSTGRESDB_SCHEMA
- Queue isolation via QUEUE_BULL_REDIS_DB
- Webhook URL per tenant: https://{tenant-id}.workflows.nubabel.com

### Workflow JSON Schema

- Nodes array with type, parameters, position, credentials
- Connections object mapping node outputs to inputs
- Settings for execution order, data retention, error handling
- Supports pinned data for testing

### Community Nodes

- No official marketplace API - npm-based distribution
- Installation via `npm install n8n-nodes-{package}`
- Requires container restart after installation
- Discovery via n8n.io/integrations or GitHub

### Credential Security

- AES-256-CBC encryption with N8N_ENCRYPTION_KEY
- External secrets support: AWS Secrets Manager, Vault, etc.
- Credentials scoped to workflows/projects

## Scope Boundaries

### IN SCOPE (Phase 1-5)

- n8n Docker container provisioning per org
- n8n REST API client implementation
- Workflow CRUD via Nubabel dashboard
- Workflow categorization and tagging
- Basic AI workflow generation (natural language → JSON)
- n8n workflow as orchestrator skill
- SOP → n8n conversion
- Agent-based workflow permissions

### OUT OF SCOPE (Future)

- n8n Cloud integration (self-hosted only)
- Custom n8n node development
- Real-time collaborative editing
- Workflow version control/git sync
- Advanced ML-based pattern detection training

## Open Questions

1. **Container Orchestration**: Railway vs Kubernetes for n8n instances?
   - Railway is simpler, Kubernetes more scalable
   - Recommend: Start with Railway (current infrastructure), migrate to K8s later

2. **Workflow Storage**: Store full JSON in Nubabel DB or reference only?
   - Full JSON: Enables offline viewing, search, AI analysis
   - Reference only: Single source of truth in n8n
   - Recommend: Store full JSON with sync mechanism

3. **AI Generation Model**: Use Claude API or fine-tuned model?
   - Claude: Immediate availability, good JSON generation
   - Fine-tuned: Better accuracy for n8n-specific patterns
   - Recommend: Start with Claude, evaluate fine-tuning later

4. **Billing Model**: Include n8n in base tier or usage-based?
   - Affects provisioning strategy
   - Need user decision

## Test Strategy Decision

- **Infrastructure exists**: YES (existing npm test, typecheck)
- **User wants tests**: Pending confirmation
- **Recommended**: TDD for critical services (n8n client, converters)
- **QA approach**: Browser testing via Playwright for dashboard UI
