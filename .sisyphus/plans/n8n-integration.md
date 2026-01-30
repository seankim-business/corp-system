# n8n Integration for Nubabel

## TL;DR

> **Quick Summary**: Implement comprehensive n8n workflow automation integration enabling organizations to self-host n8n instances, manage workflows through Nubabel dashboard, generate workflows via AI, and automatically convert detected patterns into automated workflows.
>
> **Deliverables**:
>
> - Per-tenant n8n Docker container provisioning on Railway
> - n8n REST API client with full workflow CRUD
> - Dashboard UI for workflow management with categorization
> - AI-powered workflow generation from natural language
> - n8n workflows as orchestrator skills
> - Bidirectional SOP ↔ n8n conversion
> - Agent-based workflow access control
>
> **Estimated Effort**: XL (4-6 weeks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Database Schema → API Client → Instance Provisioning → Workflow Management → AI Generation

---

## Context

### Original Request

Korean user requirements translated:

1. n8n 셀프호스팅 - Self-hosted n8n instance per organization
2. n8n 워크플로 모음 (체계적 분류) - Workflow collection with systematic categorization
3. n8n 마켓플레이스 연동 - n8n marketplace/community node integration
4. AI 기반 n8n 워크플로 자동 생성 - AI-powered automatic workflow creation
5. n8n의 스킬화 - n8n workflows as reusable skills in orchestrator
6. 조직도 + 에이전트별 n8n 워크플로 접근권한 - Org chart + agent-based workflow access control
7. SOP ↔ n8n 변환 - Bidirectional SOP to n8n workflow conversion
8. 자동 업무패턴 감지 → SOP화 → n8n화 - Automatic pattern detection → SOP → n8n pipeline

### Interview Summary

**Key Decisions**:

- Multi-tenant: Instance-per-tenant with Docker containers on Railway
- Storage: Full workflow JSON in Nubabel DB with periodic sync to n8n
- AI: Claude API for natural language → workflow JSON generation
- Test Strategy: TDD for critical services (n8n client, converters)

**Research Findings**:

- n8n REST API v1 supports full workflow CRUD, execution management
- Unique N8N_ENCRYPTION_KEY required per tenant (AES-256-CBC)
- No official marketplace API - npm-based community node discovery
- Webhook format: https://{tenant}.workflows.nubabel.com/webhook/{path}

### Self-Review Gap Analysis

**Gaps Identified and Resolved**:

1. **Container Health Monitoring**: Added health check endpoint monitoring
2. **Credential Synchronization**: Added credential mapping between Nubabel MCPConnection and n8n
3. **Rate Limiting**: Added API client rate limiting (20 req/min per tenant)
4. **Webhook Security**: Added HMAC signature verification for n8n webhooks
5. **Rollback Strategy**: Added container rollback on provisioning failure
6. **Cost Tracking**: Added n8n execution cost estimation per workflow

**Guardrails Applied**:

- No direct database access to n8n's PostgreSQL (API only)
- No modification of n8n source code (container-based only)
- Maximum 1 n8n instance per organization (can scale later)
- Workflow JSON validation before storage (schema enforcement)

---

## Work Objectives

### Core Objective

Enable Nubabel organizations to leverage n8n workflow automation through a fully integrated, AI-enhanced, multi-tenant architecture that converts business patterns into executable automations.

### Concrete Deliverables

- 5 new Prisma models (N8nInstance, N8nWorkflow, N8nExecution, N8nCredential, N8nWorkflowPermission)
- 2 new BullMQ queues (n8n-sync, n8n-generation)
- 1 new API route file (src/api/n8n.ts with 15+ endpoints)
- 1 new service (src/services/n8n/)
- 1 new frontend page (frontend/src/pages/N8nWorkflowsPage.tsx)
- Railway template for n8n container deployment
- AI workflow generator using Claude API
- SOP ↔ n8n bidirectional converter

### Definition of Done

- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run test` passes all new tests
- [ ] Railway deployment succeeds with n8n container provisioned
- [ ] Slack bot can trigger n8n workflows via @Nubabel
- [ ] Dashboard shows workflow management UI
- [ ] AI can generate valid n8n workflow from natural language

### Must Have

- Per-tenant n8n instance isolation (separate encryption keys)
- Workflow CRUD via REST API
- Basic AI workflow generation
- SOP → n8n conversion (at minimum)
- Integration with existing orchestrator

### Must NOT Have (Guardrails)

- Direct n8n database access (API only)
- Shared n8n instance across tenants (security risk)
- Real-time collaborative workflow editing (complexity)
- Custom n8n node development (out of scope)
- n8n Cloud integration (self-hosted only)
- Workflow git sync/version control (future phase)

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (npm test, typecheck configured)
- **User wants tests**: YES (TDD for critical paths)
- **Framework**: Existing setup (likely vitest or jest)

### TDD Workflow for Critical Services

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
   - Test file: `src/services/n8n/__tests__/{service}.test.ts`
   - Test command: `npm test src/services/n8n`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `npm test src/services/n8n`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `npm test && npm run typecheck`
   - Expected: PASS (both)

### Automated Verification

**For API Endpoints** (using Bash curl):

```bash
# Test n8n workflow creation
curl -s -X POST http://localhost:3000/api/n8n/workflows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Workflow","nodes":[]}' \
  | jq '.id'
# Assert: Returns non-empty UUID
```

**For Frontend UI** (using Playwright skill):

```
1. Navigate to: http://localhost:5173/n8n/workflows
2. Click: button[data-testid="create-workflow"]
3. Fill: input[name="name"] with "Test Workflow"
4. Click: button[type="submit"]
5. Wait for: selector ".workflow-card" to be visible
6. Screenshot: .sisyphus/evidence/workflow-created.png
```

**For n8n Container** (using Bash):

```bash
# Health check
curl -s https://{tenant}.workflows.nubabel.com/healthz
# Assert: Returns {"status":"ok"}
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately) - Foundation:
├── Task 1: Database Schema (Prisma models)
├── Task 2: n8n API Client (TypeScript service)
└── Task 3: Queue Infrastructure (n8n-sync, n8n-generation)

Wave 2 (After Wave 1) - Core Features:
├── Task 4: Instance Provisioning (Railway containers)
├── Task 5: Workflow Management API (CRUD endpoints)
├── Task 6: Credential Synchronization (MCPConnection mapping)
└── Task 7: Dashboard UI (Workflow list/create/edit)

Wave 3 (After Wave 2) - Advanced Features:
├── Task 8: AI Workflow Generator (Claude integration)
├── Task 9: n8n as Skill (Orchestrator integration)
├── Task 10: SOP ↔ n8n Converter
├── Task 11: Access Control (Agent permissions)
└── Task 12: Pattern Detection Pipeline

Wave 4 (After Wave 3) - Polish:
├── Task 13: Community Nodes Browser
├── Task 14: Execution History & Monitoring
└── Task 15: Documentation & QA

Critical Path: Task 1 → Task 2 → Task 4 → Task 5 → Task 8
Parallel Speedup: ~40% faster than sequential (4 waves vs 15 sequential)
```

### Dependency Matrix

| Task                   | Depends On | Blocks                          | Can Parallelize With |
| ---------------------- | ---------- | ------------------------------- | -------------------- |
| 1 (Schema)             | None       | 2, 4, 5, 6, 7, 8, 9, 10, 11, 14 | 2, 3                 |
| 2 (API Client)         | None       | 4, 5, 8, 14                     | 1, 3                 |
| 3 (Queues)             | None       | 4, 8, 12                        | 1, 2                 |
| 4 (Provisioning)       | 1, 2, 3    | 5, 6, 7, 8, 9                   | None                 |
| 5 (Workflow API)       | 1, 2, 4    | 7, 8, 9, 10                     | 6                    |
| 6 (Credentials)        | 1, 4       | 9                               | 5, 7                 |
| 7 (Dashboard UI)       | 1, 5       | 13, 14                          | 6                    |
| 8 (AI Generator)       | 2, 3, 5    | 12                              | 9, 10, 11            |
| 9 (Skill Adapter)      | 5, 6       | 12                              | 8, 10, 11            |
| 10 (SOP Converter)     | 5          | 12                              | 8, 9, 11             |
| 11 (Access Control)    | 1          | None                            | 8, 9, 10             |
| 12 (Pattern Pipeline)  | 8, 9, 10   | None                            | 13, 14               |
| 13 (Community Nodes)   | 7          | None                            | 12, 14, 15           |
| 14 (Execution History) | 1, 2, 7    | None                            | 12, 13, 15           |
| 15 (Docs & QA)         | 7          | None                            | 12, 13, 14           |

### Agent Dispatch Summary

| Wave | Tasks            | Recommended Agents                                   |
| ---- | ---------------- | ---------------------------------------------------- |
| 1    | 1, 2, 3          | 3x executor in parallel (schema, api-client, queues) |
| 2    | 4, 5, 6, 7       | 4x executor (provisioning needs infra skills)        |
| 3    | 8, 9, 10, 11, 12 | 5x executor (AI task needs ultrabrain)               |
| 4    | 13, 14, 15       | 3x executor + designer for UI polish                 |

---

## TODOs

### Phase 1: Infrastructure Foundation

- [ ] 1. Database Schema - Prisma Models for n8n Integration

  **What to do**:
  - Create 5 new Prisma models in `prisma/schema.prisma`
  - Add N8nInstance model (id, organizationId, containerUrl, encryptionKey, status, config)
  - Add N8nWorkflow model (id, organizationId, n8nWorkflowId, name, description, category, tags, workflowJson, enabled, syncedAt)
  - Add N8nExecution model (id, workflowId, n8nExecutionId, status, inputData, outputData, startedAt, completedAt, errorMessage)
  - Add N8nCredential model (id, organizationId, n8nCredentialId, mcpConnectionId, credentialType, name, syncedAt)
  - Add N8nWorkflowPermission model (id, workflowId, agentId, roleId, canView, canExecute, canEdit)
  - Run `npx prisma migrate dev --name add-n8n-models`
  - Generate Prisma client

  **Must NOT do**:
  - Do not modify existing models (only add new ones)
  - Do not add foreign keys to n8n's internal tables (API only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema changes are straightforward with clear patterns from existing models
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for migration files
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI work in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 4, 5, 6, 7, 8, 9, 10, 11, 14
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/schema.prisma:523-543` - MCPConnection model pattern for multi-tenant integrations
  - `prisma/schema.prisma:379-419` - Workflow and WorkflowExecution models for execution tracking pattern
  - `prisma/schema.prisma:1041-1097` - MarketplaceExtension model for complex JSON storage pattern

  **Type References**:
  - `src/orchestrator/types.ts:MCPConnection` - TypeScript interface for external connections

  **Documentation References**:
  - Research: n8n workflow JSON schema structure (see draft file)

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file created: `src/services/n8n/__tests__/models.test.ts`
  - [ ] Test covers: N8nInstance CRUD operations
  - [ ] Test covers: N8nWorkflow with JSON validation
  - [ ] `npm test src/services/n8n` → PASS

  **Automated Verification:**

  ```bash
  # Verify migration succeeded
  npx prisma migrate status
  # Assert: "Database schema is up to date"

  # Verify models generated
  npx prisma generate
  # Assert: Exit code 0

  # Type check
  npm run typecheck
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(db): add n8n integration models`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `npx prisma validate && npm run typecheck`

---

- [ ] 2. n8n REST API Client Service

  **What to do**:
  - Create `src/services/n8n/n8n-api-client.ts`
  - Implement N8nApiClient class with methods:
    - `constructor(instanceUrl: string, apiKey: string)`
    - `createWorkflow(workflow: N8nWorkflowInput): Promise<N8nWorkflow>`
    - `getWorkflow(id: string): Promise<N8nWorkflow>`
    - `updateWorkflow(id: string, workflow: Partial<N8nWorkflowInput>): Promise<N8nWorkflow>`
    - `deleteWorkflow(id: string): Promise<void>`
    - `activateWorkflow(id: string): Promise<void>`
    - `deactivateWorkflow(id: string): Promise<void>`
    - `listWorkflows(options?: ListOptions): Promise<N8nWorkflow[]>`
    - `getExecution(id: string): Promise<N8nExecution>`
    - `listExecutions(options?: ExecutionListOptions): Promise<N8nExecution[]>`
    - `retryExecution(id: string): Promise<N8nExecution>`
    - `triggerWebhook(path: string, data: any): Promise<any>`
  - Add rate limiting (20 req/min per instance)
  - Add retry logic with exponential backoff
  - Add request/response logging

  **Must NOT do**:
  - Do not hardcode API keys (use encrypted storage)
  - Do not bypass rate limits
  - Do not access n8n database directly

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard REST client implementation with clear patterns
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Similar pattern to MCP client implementations
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser automation needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 8, 14
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/services/mcp-transport.ts` - External API client pattern with error handling
  - `src/services/retry-strategy.ts` - Exponential backoff implementation
  - `src/services/webhook-delivery.ts:15-80` - HTTP client with retry and signing

  **API References**:
  - n8n REST API: `POST /api/v1/workflows`, `GET /api/v1/workflows/{id}`, etc.
  - Authentication: `X-N8N-API-KEY` header

  **Type References**:
  - Create `src/services/n8n/types.ts` with N8nWorkflowInput, N8nWorkflow, N8nExecution interfaces

  **External References**:
  - n8n API docs: https://docs.n8n.io/api/

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file created: `src/services/n8n/__tests__/n8n-api-client.test.ts`
  - [ ] Test covers: Workflow CRUD with mocked responses
  - [ ] Test covers: Rate limiting (429 response handling)
  - [ ] Test covers: Retry logic on 5xx errors
  - [ ] `npm test src/services/n8n` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  npm test src/services/n8n/__tests__/n8n-api-client.test.ts
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(n8n): add REST API client service`
  - Files: `src/services/n8n/n8n-api-client.ts`, `src/services/n8n/types.ts`, `src/services/n8n/__tests__/*`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 3. Queue Infrastructure for n8n Operations

  **What to do**:
  - Create `src/queue/n8n-sync.queue.ts` extending BaseQueue
  - Create `src/queue/n8n-generation.queue.ts` extending BaseQueue
  - Create `src/workers/n8n-sync.worker.ts` extending BaseWorker
  - Create `src/workers/n8n-generation.worker.ts` extending BaseWorker
  - n8n-sync queue handles:
    - Workflow sync (Nubabel ↔ n8n)
    - Execution history sync
    - Credential sync
  - n8n-generation queue handles:
    - AI workflow generation requests
    - SOP → n8n conversion requests
  - Add queues to `src/queue/index.ts` exports
  - Add workers to worker initialization in `src/index.ts`

  **Must NOT do**:
  - Do not create queues without rate limiting
  - Do not skip dead-letter queue integration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Following established BaseQueue/BaseWorker patterns
  - **Skills**: []
    - No special skills needed - clear patterns exist
  - **Skills Evaluated but Omitted**:
    - `mcp-integration`: Queue is internal, not external integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 8, 12
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/queue/base.queue.ts:39-123` - BaseQueue implementation (MUST follow exactly)
  - `src/queue/base.queue.ts:132-202` - BaseWorker implementation (MUST follow exactly)
  - `src/queue/slack-event.queue.ts` - Concrete queue example with rate limiting
  - `src/workers/orchestration.worker.ts` - Complex worker with multiple job handlers

  **Configuration References**:
  - `src/queue/index.ts` - Queue exports pattern
  - `src/index.ts` - Worker initialization pattern

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/queue/__tests__/n8n-sync.queue.test.ts`
  - [ ] Test covers: Job enqueue and rate limiting
  - [ ] `npm test src/queue/__tests__/n8n` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  # Verify queues are exported
  grep -q "n8n-sync" src/queue/index.ts
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(queue): add n8n sync and generation queues`
  - Files: `src/queue/n8n-*.ts`, `src/workers/n8n-*.ts`, `src/queue/index.ts`
  - Pre-commit: `npm run typecheck`

---

### Phase 2: Core n8n Features

- [ ] 4. n8n Instance Provisioning Service

  **What to do**:
  - Create `src/services/n8n/instance-provisioner.ts`
  - Implement provisioning workflow:
    1. Generate unique N8N_ENCRYPTION_KEY for tenant
    2. Create Railway service via Railway API
    3. Configure environment variables (DB schema, webhook URL, etc.)
    4. Wait for container health check
    5. Create N8nInstance record in database
    6. Generate and store API key
  - Implement deprovisioning workflow
  - Implement health check monitoring
  - Add rollback on provisioning failure

  **Must NOT do**:
  - Do not share encryption keys between tenants
  - Do not provision without health check verification
  - Do not skip database schema isolation

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex infrastructure orchestration with multiple failure modes
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Railway API integration similar to other MCP patterns
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 1)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/services/account-pool/account-pool.service.ts` - Resource pool management pattern
  - `src/services/encryption.service.ts` - Encryption key generation and storage

  **Infrastructure References**:
  - Railway API documentation for service provisioning
  - Existing Railway deployment config in project root

  **Environment Variables** (per tenant):

  ```bash
  N8N_ENCRYPTION_KEY={unique_32_char_key}
  DB_POSTGRESDB_SCHEMA=tenant_{org_id}
  WEBHOOK_URL=https://{org_slug}.workflows.nubabel.com
  EXECUTIONS_MODE=queue
  QUEUE_BULL_REDIS_DB={unique_db_number}
  ```

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/instance-provisioner.test.ts`
  - [ ] Test covers: Encryption key generation uniqueness
  - [ ] Test covers: Rollback on failure
  - [ ] Test covers: Health check polling
  - [ ] `npm test src/services/n8n/__tests__/instance-provisioner` → PASS

  **Automated Verification:**

  ```bash
  # After provisioning test instance
  curl -s https://test-org.workflows.nubabel.com/healthz
  # Assert: {"status":"ok"}

  # Verify database record
  npx prisma studio
  # Assert: N8nInstance record exists with status="active"
  ```

  **Commit**: YES
  - Message: `feat(n8n): add instance provisioning service`
  - Files: `src/services/n8n/instance-provisioner.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 5. Workflow Management REST API

  **What to do**:
  - Create `src/api/n8n.ts` with Express router
  - Implement endpoints:
    - `POST /api/n8n/workflows` - Create workflow
    - `GET /api/n8n/workflows` - List workflows (with filters)
    - `GET /api/n8n/workflows/:id` - Get workflow details
    - `PUT /api/n8n/workflows/:id` - Update workflow
    - `DELETE /api/n8n/workflows/:id` - Delete workflow
    - `POST /api/n8n/workflows/:id/activate` - Activate
    - `POST /api/n8n/workflows/:id/deactivate` - Deactivate
    - `POST /api/n8n/workflows/:id/execute` - Manual trigger
    - `GET /api/n8n/workflows/:id/executions` - Execution history
    - `GET /api/n8n/categories` - List categories
    - `POST /api/n8n/categories` - Create category
  - Add to router in `src/index.ts`
  - Ensure tenant isolation (organizationId from auth)
  - Add request validation with Zod schemas

  **Must NOT do**:
  - Do not expose internal n8n IDs to clients
  - Do not allow cross-tenant workflow access

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard REST API implementation
  - **Skills**: []
    - No special skills - clear patterns exist
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6)
  - **Blocks**: Tasks 7, 8, 9, 10
  - **Blocked By**: Tasks 1, 2, 4

  **References**:

  **Pattern References**:
  - `src/api/workflows.ts` - Existing workflow CRUD API pattern
  - `src/api/notion.ts` - External integration API pattern
  - `src/middleware/tenant-resolver.ts` - Tenant context extraction

  **Validation References**:
  - Zod schemas in existing API files

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/api/__tests__/n8n.test.ts`
  - [ ] Test covers: CRUD operations
  - [ ] Test covers: Tenant isolation
  - [ ] Test covers: Request validation
  - [ ] `npm test src/api/__tests__/n8n` → PASS

  **Automated Verification:**

  ```bash
  # Create workflow
  curl -s -X POST http://localhost:3000/api/n8n/workflows \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test","nodes":[],"connections":{}}' \
    | jq '.id'
  # Assert: Returns UUID

  # List workflows
  curl -s http://localhost:3000/api/n8n/workflows \
    -H "Authorization: Bearer $TOKEN" \
    | jq 'length'
  # Assert: Returns number >= 1
  ```

  **Commit**: YES
  - Message: `feat(api): add n8n workflow management endpoints`
  - Files: `src/api/n8n.ts`, `src/index.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 6. Credential Synchronization Service

  **What to do**:
  - Create `src/services/n8n/credential-sync.ts`
  - Map Nubabel MCPConnection credentials to n8n credentials
  - Implement sync workflow:
    1. Detect new/updated MCPConnections
    2. Create corresponding n8n credential via API
    3. Store mapping in N8nCredential table
  - Implement credential update propagation
  - Implement credential deletion cascade
  - Encrypt all credential data at rest

  **Must NOT do**:
  - Do not store plaintext credentials
  - Do not sync credentials across tenants

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Security-critical credential handling
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Working with MCP credential patterns
  - **Skills Evaluated but Omitted**:
    - `git-master`: Standard commit needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `src/services/mcp-registry.ts` - MCPConnection CRUD and OAuth refresh
  - `src/services/encryption.service.ts` - Encryption utilities

  **Security References**:
  - `research/technical-deep-dive/09-multi-tenant-security-checklist.md`

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/credential-sync.test.ts`
  - [ ] Test covers: MCPConnection → n8n credential mapping
  - [ ] Test covers: Update propagation
  - [ ] Test covers: Deletion cascade
  - [ ] `npm test src/services/n8n/__tests__/credential-sync` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  npm test src/services/n8n/__tests__/credential-sync
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(n8n): add credential synchronization service`
  - Files: `src/services/n8n/credential-sync.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 7. Dashboard UI - Workflow Management Page

  **What to do**:
  - Create `frontend/src/pages/N8nWorkflowsPage.tsx`
  - Implement workflow list view with:
    - Grid/list toggle
    - Category filter
    - Tag filter
    - Search
    - Status indicator (active/inactive)
  - Implement workflow create/edit modal:
    - Name, description, category, tags
    - JSON editor for advanced users
    - Visual preview (iframe to n8n editor)
  - Implement execution history panel
  - Add to router in `frontend/src/App.tsx`
  - Create Zustand store for n8n state

  **Must NOT do**:
  - Do not build custom visual workflow editor (use n8n's UI via iframe)
  - Do not store credentials in frontend state

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend UI with complex state management
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard UI patterns and Tailwind styling
  - **Skills Evaluated but Omitted**:
    - `playwright`: Testing is separate task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 1, 5

  **References**:

  **Pattern References**:
  - `frontend/src/pages/WorkflowsPage.tsx` - Existing workflow page pattern
  - `frontend/src/pages/ExecutionsPage.tsx` - Execution history pattern
  - `frontend/src/stores/workflowStore.ts` - Zustand store pattern

  **Component References**:
  - `frontend/src/components/` - Reusable components

  **Documentation References**:
  - `frontend/FRONTEND_README.md` - Frontend setup guide

  **Acceptance Criteria**:

  **Automated Verification (Playwright):**

  ```
  1. Navigate to: http://localhost:5173/n8n/workflows
  2. Assert: Page title contains "n8n Workflows"
  3. Click: button[data-testid="create-workflow"]
  4. Fill: input[name="name"] with "Test Workflow"
  5. Select: select[name="category"] with "Automation"
  6. Click: button[type="submit"]
  7. Wait for: toast "Workflow created"
  8. Assert: Workflow card with "Test Workflow" visible
  9. Screenshot: .sisyphus/evidence/n8n-dashboard.png
  ```

  **Commit**: YES
  - Message: `feat(frontend): add n8n workflow management page`
  - Files: `frontend/src/pages/N8nWorkflowsPage.tsx`, `frontend/src/stores/n8nStore.ts`, `frontend/src/App.tsx`
  - Pre-commit: `cd frontend && npm run typecheck`

---

### Phase 3: AI Integration

- [ ] 8. AI Workflow Generator Service

  **What to do**:
  - Create `src/services/n8n/workflow-generator.ts`
  - Implement natural language → n8n workflow JSON conversion using Claude API
  - Create prompt templates for common workflow patterns:
    - Data sync (A → B)
    - Notification workflows
    - Approval flows
    - Data transformation
  - Validate generated JSON against n8n schema
  - Handle generation failures gracefully
  - Track generation success rate for improvement

  **Must NOT do**:
  - Do not generate credentials in workflow JSON
  - Do not bypass JSON schema validation

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex AI integration with prompt engineering
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Claude API integration pattern
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend service only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 2, 3, 5

  **References**:

  **Pattern References**:
  - `src/orchestrator/request-analyzer.ts` - Claude API usage pattern
  - `src/services/skill-learning/skill-generator.ts` - AI generation pattern

  **Schema References**:
  - n8n workflow JSON schema (documented in draft file)
  - Validation using Zod or JSON Schema

  **Prompt Engineering**:
  - System prompt establishing n8n expertise
  - Few-shot examples of workflow patterns
  - Output format specification

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/workflow-generator.test.ts`
  - [ ] Test covers: Simple workflow generation
  - [ ] Test covers: JSON schema validation
  - [ ] Test covers: Error handling for invalid requests
  - [ ] `npm test src/services/n8n/__tests__/workflow-generator` → PASS

  **Automated Verification:**

  ```bash
  # Test generation endpoint
  curl -s -X POST http://localhost:3000/api/n8n/generate \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"prompt":"When a new row is added to Google Sheets, send a Slack notification"}' \
    | jq '.workflow.nodes | length'
  # Assert: Returns number >= 2 (trigger + action)
  ```

  **Commit**: YES
  - Message: `feat(n8n): add AI workflow generator service`
  - Files: `src/services/n8n/workflow-generator.ts`, `src/api/n8n.ts` (add endpoint)
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 9. n8n Workflow as Orchestrator Skill

  **What to do**:
  - Create `src/services/n8n/skill-adapter.ts`
  - Register n8n workflows as skills in MarketplaceExtension with:
    - `extensionType: 'skill'`
    - `runtimeType: 'n8n'`
    - `runtimeConfig: { workflowId, webhookPath, method }`
  - Implement skill execution via:
    - Webhook trigger (preferred)
    - API execution trigger (fallback)
  - Add n8n skill type to `src/orchestrator/skill-selector.ts`
  - Map workflow categories to orchestrator categories

  **Must NOT do**:
  - Do not expose internal n8n API keys to orchestrator
  - Do not register disabled workflows as skills

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Deep integration with orchestrator system
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Skill registration patterns
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `src/orchestrator/skill-selector.ts` - Skill selection logic
  - `src/services/skill-runtime/skill-executor.ts` - Skill execution pattern
  - `prisma/schema.prisma:1041-1097` - MarketplaceExtension model

  **Type References**:
  - `src/orchestrator/types.ts:Skill` - Skill type definitions

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/skill-adapter.test.ts`
  - [ ] Test covers: Workflow registration as skill
  - [ ] Test covers: Skill execution via webhook
  - [ ] Test covers: Skill selection in orchestrator
  - [ ] `npm test src/services/n8n/__tests__/skill-adapter` → PASS

  **Automated Verification:**

  ```bash
  # Test skill execution via Slack
  # In #it-test channel: @Nubabel run workflow "Customer Onboarding"
  # Assert: Bot responds with execution result
  ```

  **Commit**: YES
  - Message: `feat(n8n): integrate workflows as orchestrator skills`
  - Files: `src/services/n8n/skill-adapter.ts`, `src/orchestrator/skill-selector.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 10. SOP ↔ n8n Bidirectional Converter

  **What to do**:
  - Create `src/services/n8n/sop-converter.ts`
  - Implement SOP → n8n conversion:
    - Parse sopSteps from Workflow model
    - Generate n8n nodes for each step
    - Connect nodes in sequence
    - Add approval nodes where `approvalRequired: true`
    - Add notification nodes for alerts
  - Implement n8n → SOP conversion:
    - Parse n8n workflow JSON
    - Extract sequential steps
    - Identify approval gates
    - Generate sopSteps array
  - Integrate with existing `src/services/sop-generator.ts`

  **Must NOT do**:
  - Do not lose step metadata during conversion
  - Do not convert complex branching (only sequential flows)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex transformation logic with multiple edge cases
  - **Skills**: []
    - No special skills - transformation logic is self-contained
  - **Skills Evaluated but Omitted**:
    - `mcp-integration`: No external API calls

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `src/services/sop-generator.ts` - Existing SOP generation logic (MUST integrate)
  - `prisma/schema.prisma:389-391` - sopSteps JSON structure

  **Type References**:
  - `src/services/sop-generator.ts:SOPStep` - SOP step interface

  **Mapping Rules**:
  - SOP step → n8n Execute Workflow/HTTP Request node
  - SOP approval → n8n Wait for Webhook node + notification
  - SOP notification → n8n Slack/Email node

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/sop-converter.test.ts`
  - [ ] Test covers: SOP → n8n conversion
  - [ ] Test covers: n8n → SOP conversion (roundtrip)
  - [ ] Test covers: Approval node handling
  - [ ] `npm test src/services/n8n/__tests__/sop-converter` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  npm test src/services/n8n/__tests__/sop-converter
  # Assert: All tests pass including roundtrip test
  ```

  **Commit**: YES
  - Message: `feat(n8n): add SOP to n8n bidirectional converter`
  - Files: `src/services/n8n/sop-converter.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 11. Agent-Based Workflow Access Control

  **What to do**:
  - Create `src/services/n8n/permission-service.ts`
  - Implement permission checks:
    - `canViewWorkflow(agentId, workflowId): boolean`
    - `canExecuteWorkflow(agentId, workflowId): boolean`
    - `canEditWorkflow(agentId, workflowId): boolean`
  - Integrate with existing Agent model hierarchy
  - Support role-based defaults:
    - `owner` role: all permissions
    - `admin` role: view, execute
    - `member` role: execute only (assigned workflows)
  - Add permission middleware to API routes
  - Create permission management API endpoints

  **Must NOT do**:
  - Do not allow permission escalation
  - Do not bypass organization isolation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard permission pattern implementation
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `mcp-integration`: Internal service only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:186-219` - Agent model with hierarchy
  - `prisma/schema.prisma:889-906` - AgentPermissionOverride pattern
  - `src/middleware/` - Existing permission middleware

  **Type References**:
  - `prisma/schema.prisma:102-128` - Membership roles

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/permission-service.test.ts`
  - [ ] Test covers: Permission inheritance from roles
  - [ ] Test covers: Agent-specific overrides
  - [ ] Test covers: Organization isolation
  - [ ] `npm test src/services/n8n/__tests__/permission-service` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  # Test permission denied
  curl -s -X GET http://localhost:3000/api/n8n/workflows/other-org-workflow \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -w "%{http_code}"
  # Assert: Returns 403
  ```

  **Commit**: YES
  - Message: `feat(n8n): add agent-based workflow access control`
  - Files: `src/services/n8n/permission-service.ts`, `src/api/n8n.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

- [ ] 12. Pattern Detection → SOP → n8n Pipeline

  **What to do**:
  - Create `src/services/n8n/pattern-pipeline.ts`
  - Integrate with existing PatternDetector service:
    1. Subscribe to detected patterns
    2. Filter patterns suitable for automation
    3. Generate SOP draft via SOPDrafter
    4. Convert SOP to n8n workflow via SOP converter
    5. Save as draft workflow for review
  - Add pipeline trigger to n8n-generation queue
  - Create notification for new auto-generated workflows
  - Track pipeline success metrics

  **Must NOT do**:
  - Do not auto-activate generated workflows (require approval)
  - Do not bypass SOP review step

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex pipeline orchestration
  - **Skills**: [`mcp-integration`]
    - `mcp-integration`: Integration with multiple services
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend pipeline

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 3)
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 9, 10

  **References**:

  **Pattern References**:
  - `src/services/pattern-detector/index.ts` - PatternDetector service (MUST integrate)
  - `src/services/pattern-detector/sop-drafter.ts` - SOP generation from patterns

  **Integration Points**:
  - `PatternDetector.analyze()` output
  - `sopDrafter.draftFromPattern()`
  - `sopConverter.sopToN8n()`

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `src/services/n8n/__tests__/pattern-pipeline.test.ts`
  - [ ] Test covers: Pattern → SOP → n8n flow
  - [ ] Test covers: Draft workflow creation
  - [ ] Test covers: Notification trigger
  - [ ] `npm test src/services/n8n/__tests__/pattern-pipeline` → PASS

  **Automated Verification:**

  ```bash
  npm run typecheck
  # Assert: Exit code 0

  npm test src/services/n8n/__tests__/pattern-pipeline
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(n8n): add pattern detection to n8n pipeline`
  - Files: `src/services/n8n/pattern-pipeline.ts`
  - Pre-commit: `npm run typecheck && npm test`

---

### Phase 4: Polish and Extended Features

- [ ] 13. Community Nodes Browser

  **What to do**:
  - Create `frontend/src/pages/N8nMarketplacePage.tsx`
  - Implement node discovery:
    - Fetch from n8n.io/integrations or npm search
    - Display available community nodes
    - Show installation status
  - Implement installation flow:
    - API call to install node in tenant's n8n instance
    - Container restart handling
    - Success/failure notification
  - Add to navigation

  **Must NOT do**:
  - Do not install nodes without user confirmation
  - Do not allow arbitrary npm package installation (whitelist)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend UI with external data integration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard UI patterns
  - **Skills Evaluated but Omitted**:
    - `mcp-integration`: Frontend only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `frontend/src/pages/` - Existing page patterns
  - npm search API for package discovery

  **Data Sources**:
  - npm registry: `https://registry.npmjs.org/-/v1/search?text=n8n-nodes`
  - n8n integrations: `https://n8n.io/integrations/` (scrape or API if available)

  **Acceptance Criteria**:

  **Automated Verification (Playwright):**

  ```
  1. Navigate to: http://localhost:5173/n8n/marketplace
  2. Assert: Grid of available nodes visible
  3. Search: "supabase" in search box
  4. Assert: n8n-nodes-supabase appears in results
  5. Screenshot: .sisyphus/evidence/n8n-marketplace.png
  ```

  **Commit**: YES
  - Message: `feat(frontend): add n8n community nodes marketplace`
  - Files: `frontend/src/pages/N8nMarketplacePage.tsx`
  - Pre-commit: `cd frontend && npm run typecheck`

---

- [ ] 14. Execution History & Monitoring Dashboard

  **What to do**:
  - Extend `frontend/src/pages/N8nWorkflowsPage.tsx` with:
    - Execution history table (status, duration, timestamp)
    - Execution detail view (input/output data)
    - Error details with retry button
  - Create `src/services/n8n/execution-sync.ts`:
    - Sync executions from n8n API periodically
    - Calculate execution statistics
    - Detect failed executions for alerting
  - Add execution sync to n8n-sync queue
  - Create execution metrics dashboard

  **Must NOT do**:
  - Do not store full execution data locally (summary only)
  - Do not auto-retry without user confirmation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard with data visualization
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard visualization
  - **Skills Evaluated but Omitted**:
    - `mcp-integration`: Sync service is straightforward

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 15)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 7

  **References**:

  **Pattern References**:
  - `frontend/src/pages/ExecutionsPage.tsx` - Existing execution history pattern
  - `src/workers/` - Background sync patterns

  **Acceptance Criteria**:

  **Automated Verification (Playwright):**

  ```
  1. Navigate to: http://localhost:5173/n8n/workflows/test-id/executions
  2. Assert: Execution history table visible
  3. Click: First execution row
  4. Assert: Execution detail panel shows input/output
  5. Screenshot: .sisyphus/evidence/n8n-executions.png
  ```

  **Commit**: YES
  - Message: `feat(n8n): add execution history and monitoring`
  - Files: `frontend/src/pages/N8nWorkflowsPage.tsx`, `src/services/n8n/execution-sync.ts`
  - Pre-commit: `npm run typecheck`

---

- [ ] 15. Documentation & Final QA

  **What to do**:
  - Update `docs/planning/02-roadmap.md` with n8n integration status
  - Create `docs/n8n-integration.md`:
    - Architecture overview
    - API reference
    - User guide
    - Troubleshooting
  - Run comprehensive QA:
    - All API endpoints via curl
    - Dashboard UI via Playwright
    - Slack bot integration via @Nubabel
    - Railway deployment verification
  - Fix any discovered issues
  - Create demo workflow templates

  **Must NOT do**:
  - Do not skip QA channels
  - Do not commit with failing tests

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation focus
  - **Skills**: [`playwright`]
    - `playwright`: Comprehensive UI testing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `docs/` - Existing documentation structure
  - `docs/planning/` - Roadmap format

  **QA Channels**:
  - Browser: Playwright via playwright skill
  - Slack: #it-test @Nubabel
  - Railway: `railway status`, `railway logs`
  - Local: `npm run test`, `npm run typecheck`

  **Acceptance Criteria**:

  **Automated Verification:**

  ```bash
  # Full test suite
  npm run test
  # Assert: All tests pass

  npm run typecheck
  # Assert: Exit code 0

  # Railway deployment
  railway status
  # Assert: All services "Running"
  ```

  **Evidence to Capture:**
  - [ ] All QA screenshots in .sisyphus/evidence/
  - [ ] Test coverage report
  - [ ] Railway deployment logs

  **Commit**: YES
  - Message: `docs(n8n): add integration documentation and QA completion`
  - Files: `docs/n8n-integration.md`, `docs/planning/02-roadmap.md`
  - Pre-commit: `npm run test && npm run typecheck`

---

## Commit Strategy

| After Task | Message                                                      | Files                                                        | Verification                     |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| 1          | `feat(db): add n8n integration models`                       | prisma/\*                                                    | npx prisma validate              |
| 2          | `feat(n8n): add REST API client service`                     | src/services/n8n/\*                                          | npm test                         |
| 3          | `feat(queue): add n8n sync and generation queues`            | src/queue/n8n-_, src/workers/n8n-_                           | npm run typecheck                |
| 4          | `feat(n8n): add instance provisioning service`               | src/services/n8n/instance-provisioner.ts                     | npm test                         |
| 5          | `feat(api): add n8n workflow management endpoints`           | src/api/n8n.ts                                               | npm test                         |
| 6          | `feat(n8n): add credential synchronization service`          | src/services/n8n/credential-sync.ts                          | npm test                         |
| 7          | `feat(frontend): add n8n workflow management page`           | frontend/src/pages/N8n\*                                     | cd frontend && npm run typecheck |
| 8          | `feat(n8n): add AI workflow generator service`               | src/services/n8n/workflow-generator.ts                       | npm test                         |
| 9          | `feat(n8n): integrate workflows as orchestrator skills`      | src/services/n8n/skill-adapter.ts, src/orchestrator/\*       | npm test                         |
| 10         | `feat(n8n): add SOP to n8n bidirectional converter`          | src/services/n8n/sop-converter.ts                            | npm test                         |
| 11         | `feat(n8n): add agent-based workflow access control`         | src/services/n8n/permission-service.ts                       | npm test                         |
| 12         | `feat(n8n): add pattern detection to n8n pipeline`           | src/services/n8n/pattern-pipeline.ts                         | npm test                         |
| 13         | `feat(frontend): add n8n community nodes marketplace`        | frontend/src/pages/N8nMarketplacePage.tsx                    | cd frontend && npm run typecheck |
| 14         | `feat(n8n): add execution history and monitoring`            | frontend/src/pages/N8n\*, src/services/n8n/execution-sync.ts | npm test                         |
| 15         | `docs(n8n): add integration documentation and QA completion` | docs/\*                                                      | npm run test                     |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
npm run test
# Expected: All tests pass, 0 failures

# Type checking
npm run typecheck
# Expected: Exit code 0, no errors

# Railway deployment
railway status
# Expected: All services "Running"

# n8n health check (after provisioning test org)
curl https://test-org.workflows.nubabel.com/healthz
# Expected: {"status":"ok"}
```

### Final Checklist

- [ ] All 8 user requirements implemented
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Railway deployment successful
- [ ] Dashboard UI functional
- [ ] Slack bot can trigger workflows
- [ ] AI generation produces valid workflows
- [ ] SOP ↔ n8n conversion works both ways
