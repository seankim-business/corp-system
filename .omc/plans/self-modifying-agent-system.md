# Self-Modifying Agent System - Complete Architecture Plan

## Executive Summary

Design a system where Nubabel agents can autonomously debug, fix, and implement features in the codebase through Slack commands or Web UI interactions, with proper safety mechanisms and approval workflows.

---

## Current State Analysis (75% Complete)

### What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Slack Bot with commands | Complete | `src/api/slack.ts` |
| AI Executor with tool loop | Complete | `src/orchestrator/ai-executor.ts` |
| Queue/Worker system | Complete | `src/queue/`, `src/workers/` |
| MCP Provider infrastructure | Complete | `src/mcp-servers/` |
| Approval system (basic) | Complete | `src/services/approval-slack.ts` |
| Feature Request Pipeline | Partial | `src/services/mega-app/feature-request-pipeline/` |
| Auto-Developer Service | Partial | `src/services/mega-app/development-pipeline/` |
| GitHub MCP (read-only) | Partial | `src/mcp-servers/github/` |

### Critical Missing Pieces (25%)

1. **Code Modification Tools** - Agent cannot read/write files
2. **Git Operations** - No commit, push, branch, PR creation
3. **Testing/Build Tools** - No npm test, npm run typecheck execution
4. **Deployment Control** - No Railway CLI integration
5. **Safety Layer** - No approval workflow for code changes
6. **Web UI for Monitoring** - No agent work visualization

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   USER INTERFACE                     │
                    │  ┌────────────────┐    ┌────────────────────────┐   │
                    │  │ Slack Commands │    │ Web Dashboard (React)  │   │
                    │  │ /debug, /impl  │    │ Agent Monitor + Approve│   │
                    │  └───────┬────────┘    └───────────┬────────────┘   │
                    └──────────┼─────────────────────────┼────────────────┘
                               │                         │
                               ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Express)                             │
│  ┌────────────────┐   ┌─────────────────┐   ┌────────────────────────┐   │
│  │ src/api/       │   │ src/api/        │   │ src/api/               │   │
│  │ slack.ts       │   │ code-ops.ts     │   │ agent-monitor.ts       │   │
│  │ (exists)       │   │ (NEW)           │   │ (NEW)                  │   │
│  └───────┬────────┘   └────────┬────────┘   └───────────┬────────────┘   │
└──────────┼─────────────────────┼────────────────────────┼────────────────┘
           │                     │                        │
           ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION LAYER                                │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  src/orchestrator/ai-executor.ts (exists - enhanced with new tools)│  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  src/orchestrator/code-agent.ts (NEW - specialized for code work)  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
           │                     │                        │
           ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          QUEUE LAYER (BullMQ)                             │
│  ┌────────────────┐   ┌─────────────────┐   ┌────────────────────────┐   │
│  │ orchestration  │   │ code-operation  │   │ deployment             │   │
│  │ (exists)       │   │ (NEW)           │   │ (NEW)                  │   │
│  └────────────────┘   └─────────────────┘   └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
           │                     │                        │
           ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        TOOL LAYER (MCP Pattern)                           │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌────────────┐   │
│  │ filesystem  │   │ git          │   │ test-runner │   │ deployment │   │
│  │ (NEW)       │   │ (NEW)        │   │ (NEW)       │   │ (NEW)      │   │
│  └─────────────┘   └──────────────┘   └─────────────┘   └────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
           │                     │                        │
           ▼                     ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        SAFETY LAYER                                       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  src/services/code-safety.ts (NEW) - Review, Approval, Rollback    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  src/services/change-reviewer.ts (NEW) - AI code review            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Code Modification Tools

**Duration:** 3-4 days
**Risk:** Medium
**Dependencies:** None

### 1.1 Filesystem MCP Server

**File:** `src/mcp-servers/filesystem/index.ts`

```typescript
// Tools to implement:
- filesystem__readFile(path, encoding?)
- filesystem__writeFile(path, content)
- filesystem__editFile(path, startLine, endLine, newContent)
- filesystem__listDirectory(path, recursive?)
- filesystem__searchFiles(pattern, directory)
- filesystem__deleteFile(path)
```

**Acceptance Criteria:**
- [ ] Can read any file in the repository
- [ ] Can write files with proper encoding
- [ ] Can perform line-based edits (like Claude Code's Edit tool)
- [ ] Has configurable path restrictions (no /etc, no ~/.ssh, etc.)
- [ ] Logs all file operations to audit trail
- [ ] Works within ai-executor.ts tool execution loop

**Security Controls:**
- Path whitelist: Only allow paths under repository root
- Path blacklist: Deny `.env`, `*.key`, `credentials.*`, etc.
- Size limits: Max 1MB read, 500KB write per operation
- Rate limit: Max 100 file operations per minute per session

### 1.2 Git Operations MCP Server

**File:** `src/mcp-servers/git/index.ts`

```typescript
// Tools to implement:
- git__status()
- git__diff(staged?: boolean)
- git__log(limit?: number)
- git__createBranch(name, base?)
- git__checkout(branch)
- git__add(files: string[])
- git__commit(message)
- git__push(branch?, force?: boolean)
- git__createPR(title, body, base, head)
- git__resetFile(path)
```

**Acceptance Criteria:**
- [ ] All git operations work from repository root
- [ ] Branch naming follows convention: `agent/{ticket-id}-{description}`
- [ ] Commits include agent metadata in trailer
- [ ] Force push is blocked unless explicitly approved
- [ ] PR creation uses GitHub MCP or gh CLI

### 1.3 Test Runner MCP Server

**File:** `src/mcp-servers/test-runner/index.ts`

```typescript
// Tools to implement:
- testRunner__typecheck()
- testRunner__lint(files?: string[])
- testRunner__test(pattern?, watch?: boolean)
- testRunner__build()
- testRunner__formatCheck(files?: string[])
```

**Acceptance Criteria:**
- [ ] Returns structured output (pass/fail, error locations)
- [ ] Timeout: Max 5 minutes per operation
- [ ] Can run subset of tests (--grep pattern)
- [ ] Parses and returns actionable error information

---

## Phase 2: Code Operation Queue & Worker

**Duration:** 2-3 days
**Risk:** Low
**Dependencies:** Phase 1

### 2.1 Code Operation Queue

**File:** `src/queue/code-operation.queue.ts`

```typescript
interface CodeOperationData {
  operationType: 'debug' | 'implement' | 'refactor' | 'fix';
  description: string;
  targetFiles?: string[];
  errorContext?: {
    errorMessage: string;
    stackTrace?: string;
    logs?: string;
  };
  featureContext?: {
    featureRequestId?: string;
    requirements: string;
    acceptanceCriteria: string[];
  };
  organizationId: string;
  userId: string;
  sessionId: string;
  eventId: string;
  slackChannel?: string;
  slackThreadTs?: string;
  approvalRequired: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}
```

### 2.2 Code Operation Worker

**File:** `src/workers/code-operation.worker.ts`

**Workflow:**
```
1. Receive job from queue
2. Create agent branch: git__createBranch
3. Analyze problem/requirement (AI analysis)
4. Plan changes (AI planning)
5. Execute changes:
   a. filesystem__readFile (understand current code)
   b. filesystem__editFile (make changes)
   c. testRunner__typecheck (verify types)
   d. testRunner__test (verify functionality)
6. If tests fail: Iterate (max 5 attempts)
7. If tests pass:
   a. git__add + git__commit
   b. git__push
   c. If approvalRequired: Create PR + Wait for approval
   d. If !approvalRequired: Direct merge (small fixes only)
8. Report results to Slack/Web UI
```

**Acceptance Criteria:**
- [ ] Creates isolated branches for each operation
- [ ] Commits have meaningful messages
- [ ] Failed operations don't pollute main branch
- [ ] Progress updates sent to Slack in real-time
- [ ] Configurable retry logic with exponential backoff

---

## Phase 3: Slack Command Integration

**Duration:** 2-3 days
**Risk:** Low
**Dependencies:** Phase 2

### 3.1 New Slack Commands

**File:** `src/api/slack.ts` (modify existing)

```typescript
// Add new commands:
app.command("/debug", handleDebugCommand);
app.command("/implement", handleImplementCommand);
app.command("/fix", handleFixCommand);
app.command("/deploy", handleDeployCommand);
```

### 3.2 Command: /debug

**Syntax:** `/debug [error description or paste error]`

**Flow:**
```
User: /debug TypeError: Cannot read property 'id' of undefined in auth.ts:45

Bot: 🔍 Analyzing error...
     - Error: TypeError in auth.ts:45
     - Likely cause: Missing null check

     📋 Proposed fix:
     ```typescript
     // Line 45: Add null check
     if (!user?.id) { return null; }
     ```

     [Approve Fix] [Request Changes] [Cancel]
```

**Acceptance Criteria:**
- [ ] Parses error messages and stack traces
- [ ] Identifies likely cause using AI
- [ ] Proposes specific fix with code preview
- [ ] Awaits user approval before applying
- [ ] Creates PR for review

### 3.3 Command: /implement

**Syntax:** `/implement [feature description]`

**Flow:**
```
User: /implement Add rate limiting to the API endpoints

Bot: 📝 Implementation Plan:

     1. Install express-rate-limit package
     2. Create src/middleware/rate-limit.ts
     3. Apply to all /api routes in src/index.ts
     4. Add config to .env.example
     5. Write tests for rate limiting

     Estimated: 15-20 minutes
     Files: 4 new, 2 modified

     [Start Implementation] [Modify Plan] [Cancel]
```

**Acceptance Criteria:**
- [ ] Generates implementation plan before starting
- [ ] Estimates time and scope
- [ ] Creates proper tests
- [ ] Always creates PR for review

### 3.4 Command: /fix

**Syntax:** `/fix [issue description]` or `/fix #123` (GitHub issue)

**Flow:**
```
User: /fix The login button doesn't work on mobile

Bot: 🔧 Investigating issue...

     Found: Click handler missing touch event support
     File: frontend/src/components/LoginButton.tsx

     Fix: Add onTouchStart handler

     [Apply Fix] [Show Diff] [Cancel]
```

### 3.5 Command: /deploy

**Syntax:** `/deploy [environment]`

**Flow:**
```
User: /deploy staging

Bot: 🚀 Deployment Check:

     ✅ All tests passing
     ✅ Type check clean
     ✅ No pending migrations
     ⚠️ 2 uncommitted changes (will be stashed)

     Branch: main → staging

     [Deploy Now] [Cancel]
```

---

## Phase 4: Safety & Approval System

**Duration:** 3-4 days
**Risk:** High (Critical for production safety)
**Dependencies:** Phase 2, Phase 3

### 4.1 Code Safety Service

**File:** `src/services/code-safety.ts`

```typescript
interface SafetyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalLevel: 'auto' | 'team-lead' | 'admin';
  risks: Risk[];
  blockers: Blocker[];
}

interface Risk {
  type: 'breaking-change' | 'security' | 'performance' | 'data-loss';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedFiles: string[];
}

// Functions:
- assessChangeRisk(diff: string): Promise<SafetyCheckResult>
- checkPathSafety(path: string): boolean
- validateCommit(message: string, diff: string): ValidationResult
- canAutoApprove(change: Change): boolean
```

### 4.2 Change Review Service

**File:** `src/services/change-reviewer.ts`

```typescript
// AI-powered code review
interface ReviewResult {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: Suggestion[];
  securityConcerns: SecurityConcern[];
  testCoverage: CoverageAssessment;
}

// Functions:
- reviewChange(diff: string, context: ChangeContext): Promise<ReviewResult>
- assessSecurityImpact(files: string[]): Promise<SecurityAssessment>
- suggestTests(changedFiles: string[]): Promise<TestSuggestion[]>
```

### 4.3 Approval Workflow

**File:** `src/services/code-approval.ts`

```typescript
// Approval levels:
enum ApprovalLevel {
  AUTO = 0,        // Small, low-risk fixes
  TEAM_LEAD = 1,   // Feature implementations
  ADMIN = 2,       // Breaking changes, security-sensitive
  MANUAL_ONLY = 3  // Production deployments
}

// Auto-approval criteria:
- Less than 20 lines changed
- Only test files modified
- Lint/format fixes only
- No new dependencies
- No schema changes
- No API changes
```

### 4.4 Rollback Mechanism

**File:** `src/services/rollback.ts`

```typescript
interface RollbackCapability {
  canRollback: boolean;
  rollbackPoint: string;  // Git commit SHA
  affectedServices: string[];
}

// Functions:
- createRollbackPoint(): Promise<string>
- rollback(point: string): Promise<void>
- getRecentRollbackPoints(limit: number): Promise<RollbackPoint[]>
```

**Acceptance Criteria:**
- [ ] All code changes go through safety assessment
- [ ] High-risk changes require human approval
- [ ] Slack notifications for approval requests
- [ ] One-click rollback from Slack or Web UI
- [ ] Audit log of all code operations

---

## Phase 5: Deployment Integration

**Duration:** 2-3 days
**Risk:** High
**Dependencies:** Phase 4

### 5.1 Deployment Queue

**File:** `src/queue/deployment.queue.ts`

```typescript
interface DeploymentData {
  environment: 'development' | 'staging' | 'production';
  commitSha: string;
  branch: string;
  triggeredBy: string;
  approvalId?: string;
  organizationId: string;
  slackChannel?: string;
  slackThreadTs?: string;
}
```

### 5.2 Railway Integration

**File:** `src/services/railway-deploy.ts`

```typescript
// Functions:
- getServiceStatus(): Promise<ServiceStatus>
- triggerDeploy(environment: string): Promise<DeploymentResult>
- getDeploymentLogs(deploymentId: string): Promise<string>
- cancelDeployment(deploymentId: string): Promise<void>
- rollbackDeployment(environment: string): Promise<void>
```

**Implementation Options:**
1. **Railway CLI** - Shell out to `railway` commands
2. **Railway API** - Use Railway's GraphQL API directly
3. **GitHub Actions** - Trigger deployment workflows

**Acceptance Criteria:**
- [ ] Can trigger deployments to all environments
- [ ] Real-time deployment logs streamed to Slack
- [ ] Automatic rollback on deployment failure
- [ ] Production deployments require manual approval

---

## Phase 6: Web UI for Monitoring

**Duration:** 4-5 days
**Risk:** Medium
**Dependencies:** Phase 2, Phase 4

### 6.1 Agent Monitor Page

**File:** `frontend/src/pages/AgentMonitorPage.tsx`

**Features:**
- Real-time view of active agent operations
- Operation history with details
- Diff viewer for code changes
- Approval queue management
- One-click rollback

**Components:**
```
AgentMonitorPage/
├── ActiveOperations/     # Currently running operations
├── OperationHistory/     # Past operations with status
├── DiffViewer/           # Side-by-side code diff
├── ApprovalQueue/        # Pending approvals
└── RollbackControls/     # Recent deployments with rollback
```

### 6.2 API Endpoints

**File:** `src/api/agent-monitor.ts`

```typescript
// Endpoints:
GET  /api/agent-monitor/operations        # List operations
GET  /api/agent-monitor/operations/:id    # Operation details
GET  /api/agent-monitor/operations/:id/diff  # Get diff
POST /api/agent-monitor/operations/:id/approve
POST /api/agent-monitor/operations/:id/reject
POST /api/agent-monitor/operations/:id/rollback
GET  /api/agent-monitor/deployments       # Deployment history
POST /api/agent-monitor/deployments/:id/rollback
```

### 6.3 Real-time Updates

**Implementation:** Server-Sent Events (SSE) via existing `src/services/sse-service.ts`

```typescript
// Events:
- operation.started
- operation.progress
- operation.completed
- operation.failed
- deployment.started
- deployment.completed
- approval.requested
```

---

## Database Schema Changes

### New Models (Add to `prisma/schema.prisma`)

```prisma
model CodeOperation {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  // Operation details
  operationType  String   @map("operation_type") @db.VarChar(50)
  description    String   @db.Text
  status         String   @default("pending") @db.VarChar(50)

  // Source context
  slackChannelId String?  @map("slack_channel_id") @db.VarChar(50)
  slackThreadTs  String?  @map("slack_thread_ts") @db.VarChar(50)
  slackMessageTs String?  @map("slack_message_ts") @db.VarChar(50)
  triggeredBy    String   @map("triggered_by") @db.Uuid

  // Git context
  branchName     String?  @map("branch_name") @db.VarChar(255)
  baseBranch     String?  @map("base_branch") @db.VarChar(255)
  commitSha      String?  @map("commit_sha") @db.VarChar(40)
  prNumber       Int?     @map("pr_number")
  prUrl          String?  @map("pr_url") @db.Text

  // Changes
  filesChanged   String[] @default([]) @map("files_changed")
  linesAdded     Int?     @map("lines_added")
  linesRemoved   Int?     @map("lines_removed")
  diffContent    String?  @map("diff_content") @db.Text

  // Safety & Approval
  riskLevel      String?  @map("risk_level") @db.VarChar(20)
  approvalStatus String?  @map("approval_status") @db.VarChar(50)
  approvedBy     String?  @map("approved_by") @db.Uuid
  approvedAt     DateTime? @map("approved_at") @db.Timestamptz(6)

  // Execution
  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(6)
  errorMessage   String?  @map("error_message") @db.Text
  logs           Json     @default("[]") @db.JsonB

  // Rollback
  canRollback    Boolean  @default(false) @map("can_rollback")
  rollbackSha    String?  @map("rollback_sha") @db.VarChar(40)
  rolledBackAt   DateTime? @map("rolled_back_at") @db.Timestamptz(6)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([status])
  @@index([operationType])
  @@index([slackChannelId, slackThreadTs])
  @@map("code_operations")
}

model Deployment {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  environment    String   @db.VarChar(50)
  commitSha      String   @map("commit_sha") @db.VarChar(40)
  branch         String   @db.VarChar(255)
  status         String   @default("pending") @db.VarChar(50)

  triggeredBy    String   @map("triggered_by") @db.Uuid
  codeOperationId String? @map("code_operation_id") @db.Uuid

  // Railway-specific
  railwayDeployId String? @map("railway_deploy_id") @db.VarChar(100)
  railwayServiceId String? @map("railway_service_id") @db.VarChar(100)

  // Slack notification
  slackChannelId String?  @map("slack_channel_id") @db.VarChar(50)
  slackThreadTs  String?  @map("slack_thread_ts") @db.VarChar(50)

  logs           String?  @db.Text
  errorMessage   String?  @map("error_message") @db.Text

  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(6)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([environment, status])
  @@map("deployments")
}
```

---

## Implementation Order & Timeline

| Phase | Duration | Priority | Dependencies |
|-------|----------|----------|--------------|
| **Phase 1:** Core Code Tools | 3-4 days | P0 | None |
| **Phase 2:** Queue & Worker | 2-3 days | P0 | Phase 1 |
| **Phase 3:** Slack Commands | 2-3 days | P1 | Phase 2 |
| **Phase 4:** Safety System | 3-4 days | P0 | Phase 2 |
| **Phase 5:** Deployment | 2-3 days | P1 | Phase 4 |
| **Phase 6:** Web UI | 4-5 days | P2 | Phase 2, 4 |

**Total Estimated Time:** 16-22 days

**Critical Path:** Phase 1 -> Phase 2 -> Phase 4 (Safety is blocking for production use)

---

## Detailed Task Breakdown

### Phase 1 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P1-T1 | Create filesystem MCP server structure | 2h | Server initializes, tools registered |
| P1-T2 | Implement `readFile` tool | 2h | Can read files with path validation |
| P1-T3 | Implement `writeFile` tool | 2h | Can write with safety checks |
| P1-T4 | Implement `editFile` tool | 4h | Line-based editing works |
| P1-T5 | Implement `listDirectory` tool | 2h | Recursive listing works |
| P1-T6 | Implement `searchFiles` tool | 3h | Glob patterns work |
| P1-T7 | Add path security layer | 3h | Blocked paths rejected |
| P1-T8 | Create git MCP server structure | 2h | Server initializes |
| P1-T9 | Implement git read operations | 4h | status, diff, log work |
| P1-T10 | Implement git write operations | 4h | branch, add, commit work |
| P1-T11 | Implement push and PR creation | 4h | Can push and create PRs |
| P1-T12 | Create test-runner MCP server | 2h | Server initializes |
| P1-T13 | Implement typecheck/lint tools | 3h | Returns structured results |
| P1-T14 | Implement test runner tool | 3h | Can run tests with patterns |
| P1-T15 | Integrate all tools into ai-executor | 4h | Tools available in tool loop |

### Phase 2 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P2-T1 | Create code-operation queue | 2h | Queue initialized |
| P2-T2 | Create CodeOperation DB model | 2h | Migration applied |
| P2-T3 | Implement code-operation worker | 8h | Full workflow works |
| P2-T4 | Add progress tracking | 3h | Real-time updates |
| P2-T5 | Add error handling and retries | 3h | Graceful failure handling |
| P2-T6 | Write integration tests | 4h | Test coverage > 80% |

### Phase 3 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P3-T1 | Implement `/debug` command | 4h | Error analysis works |
| P3-T2 | Implement `/implement` command | 4h | Plan generation works |
| P3-T3 | Implement `/fix` command | 3h | Issue parsing works |
| P3-T4 | Implement `/deploy` command | 3h | Pre-deploy checks work |
| P3-T5 | Add interactive Slack buttons | 4h | Approve/Reject flows work |
| P3-T6 | Add progress message updates | 3h | Real-time feedback |

### Phase 4 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P4-T1 | Create code-safety service | 4h | Risk assessment works |
| P4-T2 | Create change-reviewer service | 6h | AI review works |
| P4-T3 | Create code-approval service | 4h | Approval workflow works |
| P4-T4 | Integrate with existing Approval model | 3h | Reuses Slack approval UI |
| P4-T5 | Create rollback service | 4h | Can rollback changes |
| P4-T6 | Add audit logging | 3h | All operations logged |
| P4-T7 | Write security tests | 4h | Security controls verified |

### Phase 5 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P5-T1 | Create deployment queue | 2h | Queue initialized |
| P5-T2 | Create Deployment DB model | 2h | Migration applied |
| P5-T3 | Implement Railway integration | 6h | Can trigger deploys |
| P5-T4 | Add deployment monitoring | 3h | Status updates work |
| P5-T5 | Implement deployment rollback | 4h | Can rollback deployments |
| P5-T6 | Add Slack notifications | 3h | Deploy status in Slack |

### Phase 6 Tasks

| Task ID | Description | Est. Hours | Acceptance Criteria |
|---------|-------------|------------|---------------------|
| P6-T1 | Create AgentMonitorPage component | 6h | Page renders |
| P6-T2 | Build ActiveOperations component | 4h | Shows live operations |
| P6-T3 | Build OperationHistory component | 4h | Shows past operations |
| P6-T4 | Build DiffViewer component | 6h | Side-by-side diff works |
| P6-T5 | Build ApprovalQueue component | 4h | Can approve/reject |
| P6-T6 | Build RollbackControls component | 3h | One-click rollback works |
| P6-T7 | Create API endpoints | 4h | All endpoints working |
| P6-T8 | Add SSE real-time updates | 3h | Live updates work |
| P6-T9 | Add routing and navigation | 2h | Page accessible |

---

## Risk Mitigations

### Risk 1: Agent Makes Breaking Changes

**Mitigation:**
- Mandatory type checking before any commit
- AI-powered breaking change detection
- Automatic test runs before merge
- Human approval required for high-risk changes

### Risk 2: Security Vulnerabilities

**Mitigation:**
- Path whitelist/blacklist enforcement
- No access to secrets or credentials
- AI security review for all changes
- Audit log of all operations

### Risk 3: Deployment Failures

**Mitigation:**
- Pre-deployment health checks
- Automatic rollback on failure
- Manual approval for production
- Staged deployment (dev -> staging -> prod)

### Risk 4: Git History Pollution

**Mitigation:**
- All agent work on feature branches
- Squash merge strategy
- Meaningful commit messages
- Clean branch naming convention

### Risk 5: Rate Limiting / Cost

**Mitigation:**
- Operation queuing with priority
- Token budget per operation
- Hourly/daily operation limits
- Cost tracking and alerts

---

## Success Criteria

### Minimum Viable Product (MVP)

- [ ] Agent can read and write files safely
- [ ] Agent can create branches and commits
- [ ] `/debug` command works end-to-end
- [ ] Human approval required for all code changes
- [ ] Basic Slack progress updates

### Full Feature Set

- [ ] All Slack commands implemented
- [ ] Web UI for monitoring and approval
- [ ] Automated deployment with rollback
- [ ] AI code review integration
- [ ] Complete audit trail
- [ ] Feature request -> Implementation pipeline

---

## Commit Strategy

### Phase 1 Commits

```
feat(mcp): add filesystem MCP server with read/write tools
feat(mcp): add git MCP server with branch/commit operations
feat(mcp): add test-runner MCP server
feat(ai-executor): integrate new MCP tools into tool loop
```

### Phase 2 Commits

```
feat(queue): add code-operation queue and worker
feat(db): add CodeOperation model
test(code-operation): add integration tests
```

### Phase 3 Commits

```
feat(slack): add /debug command for error fixing
feat(slack): add /implement command for features
feat(slack): add /fix and /deploy commands
```

### Phase 4 Commits

```
feat(safety): add code-safety assessment service
feat(safety): add AI change reviewer
feat(safety): add approval workflow for code changes
feat(safety): add rollback mechanism
```

### Phase 5 Commits

```
feat(deploy): add deployment queue and worker
feat(deploy): add Railway integration
feat(deploy): add deployment rollback
```

### Phase 6 Commits

```
feat(ui): add AgentMonitorPage
feat(ui): add DiffViewer component
feat(api): add agent-monitor endpoints
feat(ui): add real-time updates via SSE
```

---

## File Structure Summary

```
src/
├── api/
│   ├── slack.ts                    # (modify) Add new commands
│   ├── code-ops.ts                 # (NEW) Code operation endpoints
│   └── agent-monitor.ts            # (NEW) Monitoring endpoints
├── mcp-servers/
│   ├── filesystem/                 # (NEW)
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── readFile.ts
│   │   │   ├── writeFile.ts
│   │   │   ├── editFile.ts
│   │   │   ├── listDirectory.ts
│   │   │   └── searchFiles.ts
│   │   └── security.ts
│   ├── git/                        # (NEW)
│   │   ├── index.ts
│   │   └── tools/
│   │       ├── status.ts
│   │       ├── diff.ts
│   │       ├── createBranch.ts
│   │       ├── commit.ts
│   │       ├── push.ts
│   │       └── createPR.ts
│   └── test-runner/                # (NEW)
│       ├── index.ts
│       └── tools/
│           ├── typecheck.ts
│           ├── lint.ts
│           ├── test.ts
│           └── build.ts
├── queue/
│   ├── code-operation.queue.ts     # (NEW)
│   └── deployment.queue.ts         # (NEW)
├── workers/
│   ├── code-operation.worker.ts    # (NEW)
│   └── deployment.worker.ts        # (NEW)
├── services/
│   ├── code-safety.ts              # (NEW)
│   ├── change-reviewer.ts          # (NEW)
│   ├── code-approval.ts            # (NEW)
│   ├── rollback.ts                 # (NEW)
│   └── railway-deploy.ts           # (NEW)
└── orchestrator/
    └── code-agent.ts               # (NEW) Specialized code agent

frontend/src/
└── pages/
    └── AgentMonitorPage.tsx        # (NEW)

prisma/
└── schema.prisma                   # (modify) Add new models
```

---

## Next Steps After Plan Approval

1. **Run:** `/oh-my-claudecode:start-work self-modifying-agent-system`
2. Begin with Phase 1 (Core Code Tools)
3. Implement safety layer (Phase 4) in parallel with Phase 2/3
4. Deploy incrementally with feature flags
5. Test extensively before enabling in production

---

PLAN_READY: .omc/plans/self-modifying-agent-system.md
