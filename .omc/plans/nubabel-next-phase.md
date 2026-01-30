# Nubabel Next Phase - Work Plan

**Generated**: 2026-01-30
**Plan ID**: nubabel-next-phase
**Analyst**: Prometheus (Planner Agent)
**Based On**: Roadmap docs, AUTONOMOUS_IMPROVEMENT_PLAN.md, IMPLEMENTATION_PLAN_DETAILED.md, codebase analysis
**Revision**: 2.0 (Post-Critic Review)

---

## Executive Summary

This plan addresses the "다음 플랜" (Next Phase) for Nubabel, resolving inconsistencies between planning documents and establishing a clear, prioritized implementation roadmap.

### Document Inconsistency Resolution

| Document | Claim | Reality | Resolution |
|----------|-------|---------|------------|
| IMPLEMENTATION_PLAN_DETAILED.md | Phase 2 100% complete | Slack Bot + Orchestrator integration incomplete | Use 02-roadmap.md as source of truth (70% complete) |
| AUTONOMOUS_IMPROVEMENT_PLAN.md | 33 critical gaps, P0 security fixes needed | Many security features now implemented (RBAC, PKCE, Session Hijacking Prevention) | Re-verify, update status |
| 02-roadmap.md | Week 9-12 (Slack + Orchestrator) in progress | Matches codebase reality | Primary reference |

### Verified Current State (2026-01-30)

**Completed (Verified in Codebase)**:
- RBAC system (`src/auth/rbac.ts`) - 5 roles, 35+ permissions
- PKCE implementation (`src/auth/pkce.ts`) - S256 code challenge
- Session hijacking prevention (`src/services/session-hijacking.ts`)
- Slack Bot basic implementation (`src/api/slack.ts`) - multi-tenant, events
- Orchestrator core (`src/orchestrator/index.ts`) - category selection, skill selection, budget enforcement
- Built-in AI executor with account pooling and retry logic
- Agent Activity monitoring
- Real-time SSE events
- Approval workflow
- **RLS middleware IS wired** (`src/db/client.ts` lines 36-57) - calls `set_current_organization()` in Prisma `$extends`
- **Metrics ARE being recorded** (`src/orchestrator/ai-executor.ts` lines 336-343) - `recordAiRequest()` called after execution
- **Progress tracking IS implemented** (`src/workers/orchestration.worker.ts` lines 47-138) - `PROGRESS_STAGES`, `job.updateProgress()`, `emitJobProgress()`
- **Multi-agent orchestrator EXISTS** (`src/orchestrator/multi-agent-orchestrator.ts`) - full implementation with parallel execution
- **RLS test suite EXISTS** (`src/__tests__/security/rls-enforcement.test.ts`) - 50+ test cases covering isolation, bypass, cross-org prevention

**In Progress / Incomplete**:
- Slack Bot <-> Orchestrator full E2E flow (worker connection needs verification)
- **AI Executor -> MCP Tool Invocation** (NO tool_use implementation - see TODO-5)
- **LLM-based intent parsing** (ONLY regex/pattern matching exists - see TODO-8)
- **English error messages** (current messages are Korean - see TODO-7)
- Optional integrations (Google Drive, GitHub, Linear, Calendar)

---

## Work Objectives

### Core Objective

Complete Phase 2 by implementing the remaining Slack Bot + Orchestrator integration (Week 9-12), enabling end-to-end natural language workflow automation via Slack.

### Deliverables

| # | Deliverable | Priority | Effort | Type |
|---|-------------|----------|--------|------|
| D1 | E2E Slack -> Orchestrator -> Notion flow working | P0 | 20h | NEW WORK |
| D2 | Real-time progress updates to Slack threads | P0 | 4h | INTEGRATION (exists, needs wiring) |
| D3 | LLM-based intent parsing with fallback | P1 | 12h | NEW WORK |
| D4 | RLS middleware verification | P1 | 1h | VERIFICATION ONLY |
| D5 | Metrics wiring verification | P1 | 1h | VERIFICATION ONLY |
| D6 | Multi-agent coordination (verify existing) | P2 | 2h | VERIFICATION ONLY |
| D7 | Error messages (English + Korean) | P1 | 4h | NEW WORK |
| D8 | Documentation update for Phase 2 completion | P2 | 4h | DOCUMENTATION |

### Definition of Done

- [ ] User can mention @company-os in Slack and receive intelligent responses
- [ ] Orchestrator correctly routes to categories based on request analysis
- [ ] Progress updates visible in Slack thread during execution
- [ ] Notion tasks can be created/updated via natural language (with MCP tool_use)
- [ ] All security middleware verified as active
- [ ] Prometheus metrics showing real data
- [ ] E2E tests passing
- [ ] Phase 2 marked 100% complete in roadmap

---

## Guardrails

### Must Have

- Slack Bot must handle multi-tenant workspaces correctly
- All orchestrator operations must respect budget limits
- Cross-tenant data isolation must be enforced
- Approval workflow must trigger for sensitive operations
- Error handling with user-friendly messages (Korean primary, English available)

### Must NOT Have

- No hardcoded API keys in code
- No synchronous long-running operations (use BullMQ)
- No breaking changes to existing API contracts
- No removal of existing security middleware

---

## Task Flow and Dependencies

```
Phase 1: Verification (Day 1, 2h total)
    |
    +-> [T1] VERIFY RLS middleware is active (1h)
    |
    +-> [T2] VERIFY metrics are being recorded (1h)
    |
    v
Phase 2: Core E2E Flow (Days 2-5, 24h total)
    |
    +-> [T3] Slack event worker -> Orchestrator connection (4h)
    |       |
    |       v
    +-> [T4] Orchestrator -> AI Executor flow (4h)
    |       |
    |       v
    +-> [T5] IMPLEMENT AI Executor -> MCP tool_use (12h) ** NEW WORK **
    |
    v
Phase 3: Progress & UX (Days 6-7, 8h total)
    |
    +-> [T6] Wire progress tracking to Slack (4h) - integration
    |
    +-> [T7] IMPLEMENT English error messages (4h) ** NEW WORK **
    |
    v
Phase 4: Intelligence (Days 8-10, 14h total)
    |
    +-> [T8] IMPLEMENT LLM intent parsing fallback (12h) ** NEW WORK **
    |
    +-> [T9] Verify multi-agent coordination (2h) - verification
    |
    v
Phase 5: Polish (Days 11-12, 8h total)
    |
    +-> [T10] E2E test suite (4h)
    |
    +-> [T11] Documentation update (2h)
    |
    +-> [T12] Phase 2 completion verification (2h)
```

---

## Detailed TODOs

### Phase 1: Verification (2h total)

#### TODO-1: VERIFY RLS Middleware Is Active
**Priority**: P1 - Security Critical
**Effort**: 1h
**Type**: VERIFICATION ONLY
**Files**: `src/db/client.ts`, `src/middleware/rls-enforcement.ts`, `src/__tests__/security/rls-enforcement.test.ts`

**What Already Exists**:
- RLS middleware IS wired in `src/db/client.ts` (lines 36-57)
- Uses Prisma `$extends` with `$allOperations` hook
- Calls `set_current_organization()` PostgreSQL function
- AsyncLocalStorage context via `getOrganizationContext()`
- Comprehensive test suite at `src/__tests__/security/rls-enforcement.test.ts` (50+ tests)

**Description**:
Verify the RLS middleware is functioning correctly in the runtime environment. The implementation exists; this task confirms it works end-to-end.

**Acceptance Criteria**:
- [ ] Run existing RLS test suite and confirm all tests pass
- [ ] Verify `set_current_organization()` function exists in database
- [ ] Confirm AsyncLocalStorage context is set during API requests
- [ ] Document any environment-specific setup requirements

**Verification**:
```bash
# Run the existing RLS test suite
npm run test -- src/__tests__/security/rls-enforcement.test.ts

# Verify PostgreSQL function exists
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'set_current_organization';"
```

---

#### TODO-2: VERIFY Metrics Are Being Recorded
**Priority**: P1 - Observability Critical
**Effort**: 1h
**Type**: VERIFICATION ONLY
**Files**: `src/orchestrator/ai-executor.ts`, `src/services/metrics.ts`

**What Already Exists**:
- `recordAiRequest()` IS called in `ai-executor.ts` (lines 336-343)
- Called after successful AI execution with model, category, duration, tokens
- Also tracks Anthropic-specific metrics via `anthropicMetricsTracker`

**Description**:
Verify metrics are being correctly recorded and exposed via the `/metrics` endpoint.

**Acceptance Criteria**:
- [ ] Confirm `recordAiRequest()` is called on every AI execution
- [ ] Verify `/metrics` endpoint returns Prometheus-format metrics
- [ ] Check for `ai_requests_total`, `ai_request_duration_seconds` metrics
- [ ] Generate test traffic and confirm counters increment

**Verification**:
```bash
# Start the server and generate test traffic
curl http://localhost:3000/api/health

# Check metrics endpoint
curl http://localhost:3000/metrics | grep -E "ai_requests|http_requests"
```

---

### Phase 2: Core E2E Flow (24h total)

#### TODO-3: Slack Event Worker -> Orchestrator Connection
**Priority**: P0 - Core Flow
**Effort**: 4h
**Files**: `src/workers/slack-event.worker.ts`, `src/orchestrator/index.ts`, `src/workers/orchestration.worker.ts`

**Description**:
Verify and complete the Slack event worker correctly calls the orchestrator and handles the response.

**Acceptance Criteria**:
- [ ] `slack-event.worker.ts` enqueues to orchestration queue with correct parameters
- [ ] organizationId, userId, sessionId correctly passed through
- [ ] Error handling captures and formats errors for Slack
- [ ] Worker updates Slack thread with result via notification queue
- [ ] Dedupe logic prevents duplicate processing of same Slack event

**Verification**:
```bash
# Run integration tests
npm run test -- src/__tests__/workers/orchestration.worker.test.ts

# Check E2E test
npm run test -- src/__tests__/e2e/slack-integration.test.ts
```

---

#### TODO-4: Orchestrator -> AI Executor Flow
**Priority**: P0 - Core Flow
**Effort**: 4h
**Files**: `src/orchestrator/delegate-task.ts`, `src/orchestrator/ai-executor.ts`

**Description**:
Verify built-in AI executor works correctly with the account pool system when no sidecar is configured.

**Acceptance Criteria**:
- [ ] `USE_BUILTIN_AI=true` routes to `executeWithAI()`
- [ ] Account pool selects account based on organization
- [ ] Retry logic with different accounts on rate limit (429 handling exists)
- [ ] Token usage recorded correctly via `trackUsage()`
- [ ] Budget enforcement blocks when exhausted

**Verification**:
```bash
# Set up test environment
export USE_BUILTIN_AI=true
export ANTHROPIC_API_KEY=sk-ant-xxx

# Run AI executor tests
npm run test -- src/__tests__/orchestrator/ai-executor.metrics.test.ts
```

---

#### TODO-5: IMPLEMENT AI Executor -> MCP Tool Invocation
**Priority**: P0 - Core Flow
**Effort**: 12h
**Type**: NEW WORK (not enhancement)
**Files**: `src/orchestrator/ai-executor.ts`, `src/mcp-servers/notion/index.ts`, `src/services/mcp-registry.ts`

**What Currently Exists**:
- `executeWithAI()` creates basic Anthropic message with system prompt (lines 240-250)
- Uses `client.messages.create()` with simple user/assistant structure
- **NO tool_use/function_calling implementation**
- Notion MCP server exists at `src/mcp-servers/notion/`
- MCP registry exists at `src/services/mcp-registry.ts`

**What Needs to Be Implemented**:
1. **Tool Definition Loading**: Load MCP tool definitions from registry for the organization
2. **Tool Schema Formatting**: Convert MCP tool definitions to Anthropic tool format
3. **Tool Use Response Handling**: Parse `tool_use` blocks from AI response
4. **MCP Execution**: Execute parsed tool calls via MCP client
5. **Result Formatting**: Format tool results back to user-friendly response

**Acceptance Criteria**:
- [ ] MCP connections loaded for organization from `mcpRegistry`
- [ ] AI prompt includes available MCP tools in Anthropic `tools` format
- [ ] `tool_use` response blocks parsed and executed via MCP
- [ ] Tool results formatted and returned to user
- [ ] Error handling for MCP connection failures
- [ ] Budget tracking includes tool invocation costs

**Implementation Design Decision Required**:
- Option A: Use Anthropic `tool_use` with explicit tool definitions
- Option B: Use prompt-based commands (less reliable, no structured output)
- **Recommendation**: Option A (tool_use) for reliability and structured responses

**Verification**:
```bash
# Create new test file
npm run test -- src/__tests__/orchestrator/ai-executor-mcp.test.ts

# Manual integration test
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Create a task called Test in Notion"}'
```

---

### Phase 3: Progress & UX (8h total)

#### TODO-6: Wire Progress Tracking to Slack
**Priority**: P0 - UX Critical
**Effort**: 4h
**Type**: INTEGRATION (components exist, need wiring)
**Files**: `src/workers/orchestration.worker.ts`, `src/workers/slack-event.worker.ts`, `src/services/sse-service.ts`

**What Already Exists**:
- Progress tracking IS implemented in `orchestration.worker.ts` (lines 47-138)
- `PROGRESS_STAGES`: STARTED, VALIDATED, PROCESSING, FINALIZING, COMPLETED, FAILED
- `job.updateProgress()` called at each stage
- `emitJobProgress()` emits SSE events
- `emitOrgEvent()` for organization-scoped events

**What Needs to Be Done**:
Wire the existing progress events to update Slack thread messages.

**Acceptance Criteria**:
- [ ] Slack worker subscribes to progress events for its job
- [ ] Thread message updated with progress bar at each stage
- [ ] Progress stages: "분석 중..." (10%), "처리 중..." (50%), "완료!" (100%)
- [ ] User sees visual progress in Slack thread

**Verification**:
```bash
# Test progress events
npm run test -- src/__tests__/workers/orchestration.worker.test.ts

# Manual test: trigger Slack mention and observe thread updates
```

---

#### TODO-7: IMPLEMENT English Error Messages
**Priority**: P1 - UX
**Effort**: 4h
**Type**: NEW WORK
**Files**: `src/orchestrator/slack-response-formatter.ts`, `src/services/slack-block-kit.ts`

**What Currently Exists**:
- `formatErrorMessage()` in `slack-response-formatter.ts` outputs Korean: `"❌ 오류 발생"`
- `formatProcessingMessage()` outputs Korean: `"⏳ 요청을 처리하고 있습니다..."`
- No i18n/language selection mechanism

**What Needs to Be Implemented**:
1. Add English versions of all error/status messages
2. Implement language detection based on user/org preference
3. Support both Korean and English in error formatting

**New Messages to Implement**:
| Error Type | Korean (exists) | English (NEW) |
|------------|-----------------|---------------|
| Budget exhausted | (add) | "Budget limit reached. Contact admin." |
| Rate limited | (add) | "Please try again in a few minutes." |
| MCP error | (add) | "Failed to connect to [service]. Check integration settings." |
| Generic error | `"❌ 오류 발생"` | "Something went wrong. Error ID: <uuid>" |

**Acceptance Criteria**:
- [ ] `formatErrorMessage()` accepts language parameter
- [ ] English error messages added for all error types
- [ ] Error messages include correlation ID for debugging
- [ ] User preference respected (default to Korean)

---

### Phase 4: Intelligence (14h total)

#### TODO-8: IMPLEMENT LLM Intent Parsing Fallback
**Priority**: P1 - Feature
**Effort**: 12h
**Type**: NEW WORK (not enhancement)
**Files**: `src/orchestrator/request-analyzer.ts`, `src/orchestrator/intent-detector.ts` (new file)

**What Currently Exists**:
- `analyzeRequest()` and `analyzeRequestEnhanced()` in `request-analyzer.ts`
- Uses ONLY regex/pattern matching via `classifyIntent()` (lines 123-213)
- Returns confidence scores but **NO LLM call anywhere**
- Ambiguity detection exists but only triggers clarifying questions

**What Needs to Be Implemented**:
1. **LLM-based classifier**: New `classifyIntentWithLLM()` function
2. **Fallback logic**: Use regex first, LLM only when confidence < threshold
3. **Confidence calibration**: Combine regex and LLM confidence scores
4. **Structured output**: Use Claude with JSON output for intent/entities

**Implementation Design**:
```typescript
// Proposed flow:
async function analyzeRequestWithLLMFallback(request: string, context: any): Promise<EnhancedRequestAnalysis> {
  // Step 1: Try regex-based classification
  const regexResult = classifyIntent(request, context);

  // Step 2: If high confidence, return immediately
  if (regexResult.confidence >= 0.8) {
    return regexResult;
  }

  // Step 3: LLM fallback for ambiguous requests
  const llmResult = await classifyIntentWithLLM(request, context);

  // Step 4: Combine scores
  return combineClassifications(regexResult, llmResult);
}
```

**Acceptance Criteria**:
- [ ] Simple requests (high regex confidence) skip LLM (fast path)
- [ ] Ambiguous requests use LLM classification
- [ ] Multi-language support (Korean + English)
- [ ] Confidence scores returned
- [ ] Low confidence triggers clarification question
- [ ] Cost tracking for LLM classification calls

**Verification**:
```typescript
// Should detect Notion intent without LLM
analyzeRequest("노션에 새 태스크 만들어줘")
// Expected: { intent: "create_task", target: "notion", confidence: 0.95, llmUsed: false }

// Ambiguous should use LLM
analyzeRequest("그거 해줘")
// Expected: { intent: "unknown", needsClarification: true, llmUsed: true }
```

---

#### TODO-9: Verify Multi-Agent Coordination
**Priority**: P2 - Feature
**Effort**: 2h
**Type**: VERIFICATION ONLY
**Files**: `src/orchestrator/multi-agent-orchestrator.ts`

**What Already Exists**:
- Full multi-agent orchestrator at `src/orchestrator/multi-agent-orchestrator.ts`
- `orchestrateMultiAgent()` function with parallel execution support
- Task decomposition via `decomposeTask()`
- Agent coordination via `coordinateAgents()` and `coordinateParallel()`
- Saves execution results to `orchestratorExecution` table

**Description**:
Verify the existing multi-agent orchestrator works correctly with the current system.

**Acceptance Criteria**:
- [ ] Complex requests detected by `shouldUseMultiAgent()`
- [ ] Tasks decomposed into independent subtasks
- [ ] Subtasks executed in parallel where possible
- [ ] Results aggregated correctly
- [ ] Execution saved to database

---

### Phase 5: Polish (8h total)

#### TODO-10: E2E Test Suite
**Priority**: P1 - Quality
**Effort**: 4h
**Files**: `src/__tests__/e2e/slack-orchestrator.test.ts` (new)

**Existing E2E Tests** (at `src/__tests__/e2e/`, NOT `tests/e2e/`):
- `slack-integration.test.ts`
- `slack-bot-e2e.test.ts`
- `agent-routing.test.ts`
- `multi-agent-workflow.test.ts`

**Description**:
Create comprehensive E2E test suite for the complete Slack -> Orchestrator -> Notion flow.

**Acceptance Criteria**:
- [ ] Test: Mention -> Response in thread
- [ ] Test: Create Notion task via mention (with MCP tool_use)
- [ ] Test: Budget limit enforcement
- [ ] Test: Error handling and user-friendly messages
- [ ] Test: Multi-tenant isolation
- [ ] All tests passing in CI

---

#### TODO-11: Documentation Update
**Priority**: P2 - Documentation
**Effort**: 2h
**Files**: `docs/planning/02-roadmap.md`, `docs/IMPLEMENTATION_STATUS.md`

**Description**:
Update planning documents to reflect actual completion status.

**Acceptance Criteria**:
- [ ] 02-roadmap.md shows Phase 2 100% complete
- [ ] IMPLEMENTATION_STATUS.md updated with new completions
- [ ] Remove/archive AUTONOMOUS_IMPROVEMENT_PLAN.md conflicts
- [ ] Add Phase 3 timeline

---

#### TODO-12: Phase 2 Completion Verification
**Priority**: P1 - Milestone
**Effort**: 2h
**Files**: N/A (verification task)

**Description**:
Final verification that all Phase 2 success criteria are met.

**Acceptance Criteria**:
- [ ] Login -> Dashboard -> Workflow execution -> Results confirmed
- [ ] Notion tasks visible and manageable (via MCP tool_use)
- [ ] "@company-os" mention in Slack triggers response
- [ ] Orchestrator routes to correct agent/category
- [ ] Security audit passed (RLS, RBAC, PKCE verified)
- [ ] Metrics dashboard showing data

---

## Commit Strategy

| Commit # | Scope | Message Template |
|----------|-------|------------------|
| 1 | Verification | `verify(security): confirm RLS middleware active in production` |
| 2 | Verification | `verify(metrics): confirm Prometheus metrics recording` |
| 3 | Core | `feat(orchestrator): complete slack-event-worker -> orchestrator integration` |
| 4 | Core | `feat(orchestrator): verify AI executor with account pool system` |
| 5 | Core | `feat(mcp): implement tool_use in AI executor for MCP integration` |
| 6 | UX | `feat(slack): wire progress tracking to Slack thread updates` |
| 7 | UX | `feat(slack): add English error messages with i18n support` |
| 8 | Intelligence | `feat(orchestrator): implement LLM-based intent parsing fallback` |
| 9 | Verification | `verify(orchestrator): confirm multi-agent coordination working` |
| 10 | Quality | `test(e2e): add Slack -> Orchestrator -> Notion E2E tests` |
| 11 | Docs | `docs: update Phase 2 completion status in roadmap` |

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Slack mention -> Response latency | < 30s (p95) | Prometheus histogram |
| Orchestrator success rate | > 95% | Prometheus counter |
| E2E test pass rate | 100% | CI pipeline |
| Budget enforcement accuracy | 100% | Manual audit |

### Qualitative

| Criteria | Verification Method |
|----------|---------------------|
| User can accomplish task via Slack | Demo with real Slack workspace |
| Errors are clear and actionable | Error message review (both languages) |
| Progress is visible during execution | Observe Slack thread updates |
| Documentation matches reality | Code-doc cross-reference |

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| RLS function not exist in some envs | Medium | Critical | TODO-1 verifies function exists; add migration if missing |
| MCP tool_use complexity | Medium | High | Start with Notion only; expand after validation |
| LLM fallback adds latency | Medium | Medium | Cache intent classifications; use haiku for speed |
| Slack rate limits during progress updates | Low | Low | Batch updates, use edit instead of new messages |

---

## Revised Estimated Timeline

| Phase | Tasks | Effort | Days |
|-------|-------|--------|------|
| Phase 1: Verification | T1, T2 | 2h | 0.25 |
| Phase 2: Core E2E | T3, T4, T5 | 20h | 2.5 |
| Phase 3: UX | T6, T7 | 8h | 1 |
| Phase 4: Intelligence | T8, T9 | 14h | 1.75 |
| Phase 5: Polish | T10, T11, T12 | 8h | 1 |
| **Total** | 12 tasks | **52h** | **6.5 days** |

**Note**: Increased from 48h to 52h due to:
- TODO-5 upgraded from "integration" to "NEW WORK" (6h -> 12h)
- TODO-8 upgraded from "enhance" to "IMPLEMENT" (included in 12h)

---

## Key Changes from V1.0 (Critic Feedback Addressed)

| Issue # | Critic Finding | Resolution |
|---------|----------------|------------|
| 1 | RLS test patterns don't exist | Fixed: Test file IS at `src/__tests__/security/rls-enforcement.test.ts` with 50+ tests |
| 2 | TODO-5 MCP missing tool_use | Fixed: Now marked as "NEW WORK" (12h), not enhancement. Design decision documented. |
| 3 | TODO-7 error messages don't match | Fixed: Explicitly states current messages are Korean, English is NEW WORK |
| 4 | TODO-8 claims "enhance" but LLM doesn't exist | Fixed: Now "IMPLEMENT LLM fallback" with implementation design |
| 5 | Security tasks need less effort | Fixed: T1/T2 reduced from 2h each to 1h each (verification only) |
| Minor 1 | E2E test path wrong | Fixed: `tests/e2e/` -> `src/__tests__/e2e/` |
| Minor 2 | Multi-agent already exists | Fixed: TODO-9 now "verification only" at 2h |
| Minor 3 | Progress tracking already exists | Fixed: TODO-6 now "integration" not new work |

---

## Next Steps

After plan approval:

1. Run `/oh-my-claudecode:start-work nubabel-next-phase` to begin execution
2. Start with Phase 1 (Verification) - quick wins, confirms foundation
3. Progress through phases sequentially, marking TODOs complete
4. Final demo and Phase 2 celebration

---

**Plan Status**: PLAN_READY: .omc/plans/nubabel-next-phase.md
**Generated By**: Prometheus (Planner Agent)
**Revision**: 2.0 - All Critic issues addressed
