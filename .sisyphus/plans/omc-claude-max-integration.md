# OMC + Claude Max Integration Plan

## TL;DR

> **Quick Summary**: Integrate Oh My Claude Code agents with Nubabel platform using Claude Max subscription accounts (NOT API), with real-time visibility in Slack and Web UI.
>
> **Deliverables**:
>
> - Claude Max Account Pool Manager (CLI-based, not API)
> - Claude Code CLI Bridge for task execution
> - Agent activity broadcasting to Slack (Block Kit) and Web UI (SSE)
> - Railway CLI integration for build monitoring
> - Slack #it-test channel QA/QC integration
>
> **Estimated Effort**: Large (2-3 weeks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (Account Pool) -> Task 4 (CLI Bridge) -> Task 7 (Slack Visibility)

---

## Context

### Original Request

User wants to:

1. Integrate OMC agents (Sisyphus, explore, librarian, oracle) into Nubabel
2. Use Claude Max subscription accounts (NOT API keys) for execution
3. Real-time agent visibility in Slack and Web UI
4. QA/QC via Playwright browser, Slack #it-test channel, Railway CLI

### Interview Summary

**Key Discussions**:

- **Claude Max vs API**: User explicitly wants Claude Max subscription accounts (consumer accounts with daily/weekly limits), NOT API accounts
- **Account rotation**: Automatically switch accounts when one hits quota
- **Visibility**: Agent activity must be visible in both Slack (threading, Block Kit) and Web UI (enhanced SSE)

**Research Findings**:

- `AgentActivityService` already has `setSlackService()` placeholder - designed for this integration
- `ClaudeAccount` model exists in Prisma but assumes API keys - needs adaptation for CLI
- `delegate-task.ts` references `createAccountPoolService` that doesn't exist yet
- SSE infrastructure is production-ready with Redis pub/sub for multi-instance
- OhMyOpenCode agents use `delegate_task` which flows through Nubabel's orchestrator

### Metis Review

**Identified Gaps** (addressed):

- Account pool service doesn't exist yet (referenced but not implemented)
- CLI bridge for Claude Code doesn't exist
- Slack integration has placeholder but no implementation
- Railway CLI integration not present
- AgentActivity model exists in code but not in Prisma schema

---

## Work Objectives

### Core Objective

Enable Nubabel to orchestrate OMC agents using Claude Max subscription accounts with full visibility in Slack and Web UI.

### Concrete Deliverables

- `src/services/account-pool/` - Complete account pool service
- `src/services/claude-cli-bridge/` - Claude Code CLI wrapper
- `src/services/slack-agent-notifications/` - Slack Block Kit notifications
- `frontend/src/pages/AgentActivityPage.tsx` - Enhanced with OMC agent visibility
- `src/services/railway-monitor/` - Railway CLI integration

### Definition of Done

- [ ] Run `bun test` - all tests pass
- [ ] Run `bun run typecheck` - no TypeScript errors
- [ ] Manually verify: Slack #it-test receives agent activity messages
- [ ] Manually verify: Web UI shows real-time OMC agent activity
- [ ] Manually verify: Account rotation works when quota exhausted

### Must Have

- Claude Max account pool with CLI-based execution
- Automatic account rotation on quota exhaustion
- Real-time agent activity in Slack (Block Kit format)
- Real-time agent activity in Web UI (SSE)
- Session continuity across account switches

### Must NOT Have (Guardrails)

- DO NOT use Anthropic API keys - this is about Claude Max subscription accounts
- DO NOT modify existing workflow engine
- DO NOT break existing Slack bot functionality
- DO NOT add new dashboard pages - enhance existing AgentActivityPage
- DO NOT add billing/payment features

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **User wants tests**: TDD for services, manual for integrations
- **Framework**: bun test

### Automated Verification

**For Backend Services** (using Bash bun/curl):

```bash
# Unit tests for account pool
bun test src/services/account-pool/*.test.ts

# Integration tests
bun test src/__tests__/integration/claude-cli-bridge.test.ts

# Type check
bun run typecheck
```

**For Frontend Changes** (using playwright skill):

```
1. Navigate to: http://localhost:5173/agent-activity
2. Wait for: SSE connection indicator shows "Connected"
3. Trigger test event via API
4. Assert: Event appears in activity feed within 3 seconds
5. Screenshot: .sisyphus/evidence/agent-activity-ui.png
```

**For Slack Integration** (manual with evidence):

```
1. Post @Nubabel test command in #it-test
2. Wait for agent activity message
3. Verify Block Kit formatting
4. Screenshot: .sisyphus/evidence/slack-agent-activity.png
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Foundation):
├── Task 1: Account Pool Service (no dependencies)
├── Task 2: AgentActivity Prisma Model (no dependencies)
└── Task 3: Encryption Service (no dependencies)

Wave 2 (After Wave 1 - Core Services):
├── Task 4: Claude CLI Bridge (depends: 1, 3)
├── Task 5: Slack Agent Notification Service (depends: 2)
└── Task 6: Enhanced SSE Agent Broadcasting (depends: 2)

Wave 3 (After Wave 2 - Integration & UI):
├── Task 7: Slack Visibility Integration (depends: 4, 5)
├── Task 8: Frontend AgentActivityPage Enhancement (depends: 6)
├── Task 9: Railway CLI Monitor (depends: 5)
└── Task 10: E2E Integration Testing (depends: 7, 8)

Critical Path: Task 1 → Task 4 → Task 7 → Task 10
Parallel Speedup: ~45% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 4      | 2, 3                 |
| 2    | None       | 5, 6   | 1, 3                 |
| 3    | None       | 4      | 1, 2                 |
| 4    | 1, 3       | 7      | 5, 6                 |
| 5    | 2          | 7, 9   | 4, 6                 |
| 6    | 2          | 8      | 4, 5                 |
| 7    | 4, 5       | 10     | 8, 9                 |
| 8    | 6          | 10     | 7, 9                 |
| 9    | 5          | 10     | 7, 8                 |
| 10   | 7, 8       | None   | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks       | Recommended Dispatch                             |
| ---- | ----------- | ------------------------------------------------ |
| 1    | 1, 2, 3     | 3 parallel agents: `category="quick"` for each   |
| 2    | 4, 5, 6     | 3 parallel agents after Wave 1 completes         |
| 3    | 7, 8, 9, 10 | Sequential within wave due to integration nature |

---

## TODOs

### Task 1: Claude Max Account Pool Service

**What to do**:

- Create `src/services/account-pool/account-pool.service.ts`
- Create `src/services/account-pool/types.ts`
- Create `src/services/account-pool/index.ts`
- Implement account selection algorithm (round-robin with health check)
- Implement circuit breaker pattern for unhealthy accounts
- Track usage estimates (infer from CLI output patterns)

**Must NOT do**:

- Do NOT use API rate limit headers - Claude Max has no API
- Do NOT store API keys - store CLI profile identifiers
- Do NOT implement billing integration

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
  - Reason: Complex service with circuit breaker pattern, requires careful design
- **Skills**: [`git-master`]
  - `git-master`: Atomic commits for each logical change

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work in this task
- `playwright`: No browser testing needed

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 3)
- **Blocks**: Task 4
- **Blocked By**: None (can start immediately)

**References**:

**Pattern References**:

- `src/orchestrator/delegate-task.ts:76-91` - Shows how account selection should integrate
- `src/utils/circuit-breaker.ts` - Existing circuit breaker pattern to follow

**Type References**:

- `prisma/schema.prisma:475-500` - ClaudeAccount model definition
- `src/providers/anthropic-provider.ts:54-80` - Account-based provider pattern

**Test References**:

- `src/__tests__/services/anthropic-metrics.test.ts` - Similar service test patterns

**WHY Each Reference Matters**:

- `delegate-task.ts` shows the exact integration point - the executor calls `createAccountPoolService()`
- `circuit-breaker.ts` provides the resilience pattern we need for account health
- `ClaudeAccount` model has the right fields but needs CLI-specific adaptation

**Acceptance Criteria**:

**TDD:**

- [ ] Test file created: `src/services/account-pool/account-pool.service.test.ts`
- [ ] Test covers: account selection, circuit breaker, health tracking
- [ ] `bun test src/services/account-pool/*.test.ts` -> PASS

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/account-pool/*.test.ts
# Assert: All tests pass

bun run typecheck
# Assert: No errors in account-pool files
```

**Commit**: YES

- Message: `feat(account-pool): implement Claude Max account pool service`
- Files: `src/services/account-pool/*`
- Pre-commit: `bun test src/services/account-pool/*.test.ts`

---

### Task 2: AgentActivity Prisma Model Migration

**What to do**:

- Create migration for `AgentActivity` model
- Add fields: `id`, `organizationId`, `sessionId`, `agentType`, `agentName`, `category`, `status`, `startedAt`, `completedAt`, `durationMs`, `inputData`, `outputData`, `errorMessage`, `metadata`
- Run `bunx prisma migrate dev`
- Generate Prisma client

**Must NOT do**:

- Do NOT modify existing models
- Do NOT add foreign key to ClaudeAccount (keep them decoupled)

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Simple schema addition, straightforward migration
- **Skills**: [`git-master`]
  - `git-master`: Clean migration commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: No browser testing

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 3)
- **Blocks**: Tasks 5, 6
- **Blocked By**: None

**References**:

**Pattern References**:

- `prisma/schema.prisma:412-445` - OrchestratorExecution model (similar pattern)
- `prisma/migrations/20260126_add_orchestrator_executions/` - Migration example

**WHY Each Reference Matters**:

- `OrchestratorExecution` has similar structure - follow that pattern
- Existing migrations show the naming convention and SQL patterns

**Acceptance Criteria**:

**Automated Verification:**

```bash
# Agent runs:
bunx prisma migrate dev --name add_agent_activity
# Assert: Exit code 0, migration created

bunx prisma generate
# Assert: Exit code 0, client updated

bun run typecheck
# Assert: No Prisma type errors
```

**Commit**: YES

- Message: `feat(db): add AgentActivity model for agent tracking`
- Files: `prisma/schema.prisma`, `prisma/migrations/*/`
- Pre-commit: `bunx prisma validate`

---

### Task 3: Encryption Service for Account Credentials

**What to do**:

- Create `src/services/account-pool/encryption.service.ts`
- Implement AES-256-GCM encryption for CLI credentials
- Use `ENCRYPTION_KEY` env variable
- Handle key rotation support

**Must NOT do**:

- Do NOT store unencrypted credentials
- Do NOT log decrypted values

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
  - Reason: Standard crypto implementation, well-documented patterns
- **Skills**: [`git-master`]
  - `git-master`: Security-sensitive code needs clean commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: No browser testing

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2)
- **Blocks**: Task 4
- **Blocked By**: None

**References**:

**Pattern References**:

- `src/auth/auth.service.ts:45-60` - Existing crypto patterns in auth
- `src/services/api-keys.ts` - Key handling patterns

**External References**:

- Node.js crypto documentation for AES-256-GCM

**WHY Each Reference Matters**:

- `auth.service.ts` shows how we handle sensitive data encryption
- Consistent with existing security patterns in codebase

**Acceptance Criteria**:

**TDD:**

- [ ] Test file created: `src/services/account-pool/encryption.service.test.ts`
- [ ] Test covers: encrypt, decrypt, key rotation
- [ ] `bun test src/services/account-pool/encryption.service.test.ts` -> PASS

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/account-pool/encryption.service.test.ts
# Assert: All tests pass
```

**Commit**: YES

- Message: `feat(account-pool): add encryption service for credentials`
- Files: `src/services/account-pool/encryption.service.ts`, `*.test.ts`
- Pre-commit: `bun test src/services/account-pool/encryption.service.test.ts`

---

### Task 4: Claude Code CLI Bridge

**What to do**:

- Create `src/services/claude-cli-bridge/cli-bridge.service.ts`
- Implement process spawning for `claude` CLI
- Parse stdout/stderr for:
  - Progress indicators
  - Completion signals
  - Quota warnings (rate limit detection)
  - Error messages
- Implement session management (map Nubabel sessions to CLI sessions)
- Handle account switching when quota detected

**Must NOT do**:

- Do NOT use Anthropic API SDK
- Do NOT block main thread on CLI execution
- Do NOT hardcode account credentials

**Recommended Agent Profile**:

- **Category**: `ultrabrain`
  - Reason: Complex process management, output parsing, error handling
- **Skills**: [`git-master`]
  - `git-master`: Complex service needs atomic commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: No browser testing

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 5, 6)
- **Blocks**: Task 7
- **Blocked By**: Tasks 1, 3

**References**:

**Pattern References**:

- `src/orchestrator/delegate-task.ts:65-275` - Main integration point for CLI bridge
- `src/orchestrator/ai-executor.ts` - Current execution flow to replace/augment

**API/Type References**:

- `vendor/ohmyopencode/src/agents/sisyphus.ts` - OMC agent structure
- `src/orchestrator/types.ts` - DelegateTaskParams, DelegateTaskResult

**External References**:

- Claude Code CLI documentation
- Node.js child_process spawn patterns

**WHY Each Reference Matters**:

- `delegate-task.ts` is WHERE this bridge integrates - must match interfaces
- `ai-executor.ts` shows current flow that CLI bridge must replace when sidecar unavailable
- OMC agent structure shows what prompts/responses look like

**Acceptance Criteria**:

**TDD:**

- [ ] Test file created: `src/services/claude-cli-bridge/cli-bridge.service.test.ts`
- [ ] Test covers: process spawn, output parsing, quota detection, account switch
- [ ] `bun test src/services/claude-cli-bridge/*.test.ts` -> PASS

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/claude-cli-bridge/*.test.ts
# Assert: All tests pass

# Mock CLI test
bun -e "
import { ClaudeCLIBridge } from './src/services/claude-cli-bridge';
const bridge = new ClaudeCLIBridge();
console.log(bridge.parseQuotaWarning('Rate limit reached'));
"
# Assert: Returns quota warning object
```

**Commit**: YES

- Message: `feat(claude-cli): implement Claude Code CLI bridge service`
- Files: `src/services/claude-cli-bridge/*`
- Pre-commit: `bun test src/services/claude-cli-bridge/*.test.ts`

---

### Task 5: Slack Agent Notification Service

**What to do**:

- Create `src/services/slack-agent-notifications/notification.service.ts`
- Implement Block Kit message builders for:
  - Agent started (with agent name, category, session)
  - Agent progress (update existing message)
  - Agent completed (success with output summary)
  - Agent failed (error with details)
- Integrate with `AgentActivityService.setSlackService()`
- Use threading for session-based grouping

**Must NOT do**:

- Do NOT break existing Slack bot functionality
- Do NOT spam channels - use threading
- Do NOT expose sensitive data in Slack messages

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
  - Reason: Standard Slack API integration, Block Kit is well-documented
- **Skills**: [`git-master`]
  - `git-master`: Clean integration commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: No browser testing

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 4, 6)
- **Blocks**: Tasks 7, 9
- **Blocked By**: Task 2

**References**:

**Pattern References**:

- `src/services/slack-block-kit.ts` - Existing Block Kit builders
- `src/services/approval-slack.ts` - Slack message update patterns
- `src/services/monitoring/agent-activity.service.ts:48-52` - Slack service interface

**API/Type References**:

- `src/api/slack.ts` - Slack client access patterns

**WHY Each Reference Matters**:

- `slack-block-kit.ts` has reusable Block Kit patterns
- `approval-slack.ts` shows message threading and updates
- `agent-activity.service.ts` defines the EXACT interface to implement

**Acceptance Criteria**:

**TDD:**

- [ ] Test file created: `src/services/slack-agent-notifications/notification.service.test.ts`
- [ ] Test covers: Block Kit generation, message updates, threading
- [ ] `bun test src/services/slack-agent-notifications/*.test.ts` -> PASS

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/slack-agent-notifications/*.test.ts
# Assert: All tests pass
```

**Evidence to Capture:**

- [ ] Screenshot of Slack Block Kit message in #it-test

**Commit**: YES

- Message: `feat(slack): add agent activity notification service`
- Files: `src/services/slack-agent-notifications/*`
- Pre-commit: `bun test src/services/slack-agent-notifications/*.test.ts`

---

### Task 6: Enhanced SSE Agent Broadcasting

**What to do**:

- Enhance `src/api/sse.ts` with OMC-specific event types
- Add event types: `omc:agent_started`, `omc:agent_progress`, `omc:agent_completed`, `omc:delegation_chain`
- Add session_id tracking for delegation chains
- Enhance `AgentActivityService` to emit OMC-specific events

**Must NOT do**:

- Do NOT break existing SSE functionality
- Do NOT remove existing event types
- Do NOT change authentication

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Enhancement to existing service, well-defined scope
- **Skills**: [`git-master`]
  - `git-master`: Incremental enhancements need clean commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: UI changes in separate task
- `playwright`: Integration testing in later task

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 4, 5)
- **Blocks**: Task 8
- **Blocked By**: Task 2

**References**:

**Pattern References**:

- `src/api/sse.ts:220-254` - Activity stream endpoint pattern
- `src/services/monitoring/agent-activity.service.ts:221-243` - Broadcast implementation

**Type References**:

- `src/services/monitoring/agent-activity.service.ts:34-44` - ActivityEvent type

**WHY Each Reference Matters**:

- `sse.ts` is WHERE we add OMC events - must follow existing patterns
- `agent-activity.service.ts` is WHAT emits events - extend it

**Acceptance Criteria**:

**TDD:**

- [ ] Test file created: `src/services/monitoring/agent-activity.service.test.ts`
- [ ] Test covers: OMC event emission, delegation chain tracking
- [ ] `bun test src/services/monitoring/*.test.ts` -> PASS

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/monitoring/*.test.ts
# Assert: All tests pass
```

**Commit**: YES

- Message: `feat(sse): add OMC agent event types and delegation tracking`
- Files: `src/api/sse.ts`, `src/services/monitoring/*`
- Pre-commit: `bun test src/services/monitoring/*.test.ts`

---

### Task 7: Slack Visibility Integration

**What to do**:

- Wire `SlackAgentNotificationService` into `AgentActivityService`
- Configure #it-test channel for QA/QC notifications
- Add `/nubabel status` command for agent activity summary
- Test end-to-end flow: Agent execution -> Slack message

**Must NOT do**:

- Do NOT hardcode channel IDs
- Do NOT send to production channels during testing
- Do NOT break existing /nubabel command

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
  - Reason: Integration work, connecting existing pieces
- **Skills**: [`git-master`]
  - `git-master`: Integration commits need clear boundaries

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: Slack testing is manual

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Tasks 8, 9)
- **Blocks**: Task 10
- **Blocked By**: Tasks 4, 5

**References**:

**Pattern References**:

- `src/api/slack.ts:289-353` - Slash command pattern
- `src/services/monitoring/agent-activity.service.ts:58-59` - setSlackService() call point

**WHY Each Reference Matters**:

- Slash command pattern shows how to add /nubabel status
- setSlackService() is WHERE to inject our notification service

**Acceptance Criteria**:

**Manual Verification:**

```
1. Post @Nubabel test agent in #it-test
2. Verify Block Kit message appears with agent info
3. Verify progress updates appear as thread replies
4. Verify completion message with status
```

**Evidence to Capture:**

- [ ] Screenshot: Agent start message in #it-test
- [ ] Screenshot: Progress thread
- [ ] Screenshot: Completion message

**Commit**: YES

- Message: `feat(slack): integrate agent notifications with activity service`
- Files: `src/api/slack.ts`, `src/index.ts`
- Pre-commit: `bun run typecheck`

---

### Task 8: Frontend AgentActivityPage Enhancement

**What to do**:

- Enhance `frontend/src/pages/AgentActivityPage.tsx` with OMC-specific displays
- Add: Agent type icons (Sisyphus, explore, librarian, oracle)
- Add: Delegation chain visualization
- Add: Account indicator (which Claude Max account)
- Add: Session continuity indicator
- Connect to `/api/sse/activity/stream` for OMC events

**Must NOT do**:

- Do NOT create new pages - enhance existing
- Do NOT change routing
- Do NOT add external dependencies

**Recommended Agent Profile**:

- **Category**: `visual-engineering`
  - Reason: Frontend UI enhancement, visual design important
- **Skills**: [`frontend-ui-ux`, `git-master`]
  - `frontend-ui-ux`: UI/UX design sensibility
  - `git-master`: Atomic commits for UI changes

**Skills Evaluated but Omitted**:

- `playwright`: Testing in separate task

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Tasks 7, 9)
- **Blocks**: Task 10
- **Blocked By**: Task 6

**References**:

**Pattern References**:

- `frontend/src/pages/AgentActivityPage.tsx` - Existing component to enhance
- `frontend/src/hooks/useSSE.ts` - SSE hook pattern

**Type References**:

- `src/services/monitoring/agent-activity.service.ts:34-44` - ActivityEvent type (mirror in frontend)

**WHY Each Reference Matters**:

- `AgentActivityPage.tsx` is WHAT we enhance - understand current structure
- `useSSE.ts` is HOW we connect - follow existing patterns

**Acceptance Criteria**:

**Playwright Verification:**

```
1. Navigate to: http://localhost:5173/agent-activity
2. Wait for: SSE connection shows "Connected"
3. Trigger: Mock OMC agent event via API
4. Assert: Agent card shows with correct icon
5. Assert: Delegation chain visualization present
6. Screenshot: .sisyphus/evidence/agent-activity-enhanced.png
```

**Commit**: YES

- Message: `feat(frontend): enhance AgentActivityPage with OMC agent displays`
- Files: `frontend/src/pages/AgentActivityPage.tsx`
- Pre-commit: `cd frontend && bun run typecheck`

---

### Task 9: Railway CLI Monitor Service

**What to do**:

- Create `src/services/railway-monitor/monitor.service.ts`
- Implement `railway logs`, `railway status` command execution
- Parse build status (pending, building, success, failed)
- Emit events to Slack #it-test on build completion
- Add `/nubabel deploy` status command

**Must NOT do**:

- Do NOT trigger deployments automatically
- Do NOT expose Railway tokens
- Do NOT poll more than once per minute

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Simple CLI integration, straightforward parsing
- **Skills**: [`git-master`]
  - `git-master`: Clean service commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: No frontend work
- `playwright`: CLI testing, not browser

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Tasks 7, 8)
- **Blocks**: Task 10
- **Blocked By**: Task 5

**References**:

**Pattern References**:

- `src/services/claude-cli-bridge/` - CLI execution patterns (from Task 4)

**External References**:

- Railway CLI documentation: `railway logs`, `railway status`

**WHY Each Reference Matters**:

- CLI bridge patterns show how to spawn and parse CLI output
- Railway CLI docs define expected output formats

**Acceptance Criteria**:

**Automated Verification:**

```bash
# Agent runs:
bun test src/services/railway-monitor/*.test.ts
# Assert: All tests pass

# Manual verification
railway status
# Assert: Returns current deployment status
```

**Evidence to Capture:**

- [ ] Screenshot: /nubabel deploy status command output
- [ ] Screenshot: Build notification in #it-test

**Commit**: YES

- Message: `feat(railway): add Railway CLI monitor service`
- Files: `src/services/railway-monitor/*`
- Pre-commit: `bun test src/services/railway-monitor/*.test.ts`

---

### Task 10: E2E Integration Testing

**What to do**:

- Create integration test: Full agent execution flow
- Test: Slack mention -> Agent dispatch -> CLI execution -> Slack notification -> Web UI update
- Test: Account rotation when quota exceeded
- Test: Session continuity across agent delegations
- Document manual QA checklist

**Must NOT do**:

- Do NOT skip Slack verification
- Do NOT use mocks for E2E tests
- Do NOT leave test artifacts in production

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
  - Reason: Complex E2E testing, multiple system interactions
- **Skills**: [`playwright`, `git-master`]
  - `playwright`: Browser automation for Web UI verification
  - `git-master`: Test commits

**Skills Evaluated but Omitted**:

- `frontend-ui-ux`: Testing, not building

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (final task)
- **Blocks**: None (final)
- **Blocked By**: Tasks 7, 8, 9

**References**:

**Pattern References**:

- `src/__tests__/e2e/agent-routing.test.ts` - Existing E2E test patterns

**WHY Each Reference Matters**:

- Existing E2E tests show test setup and teardown patterns

**Acceptance Criteria**:

**Automated Verification:**

```bash
# Agent runs:
bun test src/__tests__/e2e/omc-integration.test.ts
# Assert: All tests pass
```

**Playwright Verification:**

```
1. Navigate to: http://localhost:5173/agent-activity
2. POST: /api/test/trigger-omc-agent
3. Wait: 30 seconds for full flow
4. Assert: Agent events appear in feed
5. Assert: Delegation chain visible
6. Screenshot: .sisyphus/evidence/e2e-complete-flow.png
```

**Slack Verification:**

```
1. Post: @Nubabel run test agent
2. Wait: Agent notification in #it-test
3. Screenshot: .sisyphus/evidence/slack-e2e.png
```

**Commit**: YES

- Message: `test(e2e): add OMC integration tests`
- Files: `src/__tests__/e2e/omc-integration.test.ts`
- Pre-commit: `bun test src/__tests__/e2e/omc-integration.test.ts`

---

## Commit Strategy

| After Task | Message                                                             | Files                                         | Verification           |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------- | ---------------------- |
| 1          | `feat(account-pool): implement Claude Max account pool service`     | `src/services/account-pool/*`                 | `bun test`             |
| 2          | `feat(db): add AgentActivity model for agent tracking`              | `prisma/*`                                    | `bunx prisma validate` |
| 3          | `feat(account-pool): add encryption service for credentials`        | `src/services/account-pool/encryption.*`      | `bun test`             |
| 4          | `feat(claude-cli): implement Claude Code CLI bridge service`        | `src/services/claude-cli-bridge/*`            | `bun test`             |
| 5          | `feat(slack): add agent activity notification service`              | `src/services/slack-agent-notifications/*`    | `bun test`             |
| 6          | `feat(sse): add OMC agent event types and delegation tracking`      | `src/api/sse.ts`, `src/services/monitoring/*` | `bun test`             |
| 7          | `feat(slack): integrate agent notifications with activity service`  | `src/api/slack.ts`, `src/index.ts`            | typecheck              |
| 8          | `feat(frontend): enhance AgentActivityPage with OMC agent displays` | `frontend/src/pages/AgentActivityPage.tsx`    | frontend typecheck     |
| 9          | `feat(railway): add Railway CLI monitor service`                    | `src/services/railway-monitor/*`              | `bun test`             |
| 10         | `test(e2e): add OMC integration tests`                              | `src/__tests__/e2e/omc-integration.test.ts`   | `bun test`             |

---

## Success Criteria

### Verification Commands

```bash
# All tests pass
bun test

# TypeScript compiles
bun run typecheck

# Frontend compiles
cd frontend && bun run typecheck

# Prisma valid
bunx prisma validate
```

### Final Checklist

- [ ] All "Must Have" features present and working
- [ ] All "Must NOT Have" guardrails respected
- [ ] All 10 tasks completed with commits
- [ ] Slack #it-test receives agent notifications
- [ ] Web UI shows real-time OMC agent activity
- [ ] Account rotation tested and working
- [ ] E2E integration test passes
