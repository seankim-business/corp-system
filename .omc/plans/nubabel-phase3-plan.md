# Nubabel Phase 3 Development Plan (Revised)

**Created**: 2026-01-30
**Revised**: 2026-01-30 (Iteration 2 - Critic Feedback Addressed)
**Author**: Prometheus (Strategic Planning Consultant)
**Target Duration**: 72 hours (3 working days)
**Methodology**: Ralplan (Iterative Planning with Metis Review)

---

## Revision Summary

This revision addresses ALL critical issues raised by the Critic:

| Issue | Status | Resolution |
|-------|--------|------------|
| File paths non-existent | FIXED | Verified all paths via Glob, marked [CREATE] vs [MODIFY] |
| RBAC status unclear | VERIFIED | 100+ routes have `requirePermission()` applied - COMPLETE |
| SSE/Job Progress already implemented | VERIFIED | REMOVED from P0 - already working |
| OKRPage exists | VERIFIED | REMOVED P1-1 - already 787 lines implemented |
| Missing security tasks | FIXED | Added verification tasks from AUTONOMOUS_IMPROVEMENT_PLAN.md |
| Timeline inconsistent | FIXED | 72 hours (3 days), not 2 weeks |

---

## Executive Summary

### What Has Been Verified as COMPLETE

Based on file-by-file verification:

**Security (COMPLETE)**
- RLS middleware wired in `src/db/client.ts` (lines 36-63) via Prisma extension
- RBAC `requirePermission()` applied to 100+ API routes across 25+ files
- BullMQ rate limiter properly configured in `src/queue/base.queue.ts` (lines 62-67)
- Metrics middleware wired in `src/index.ts` (line 235)

**SSE/Job Progress (COMPLETE)**
- `src/workers/orchestration.worker.ts` has full `emitJobProgress()` implementation (lines 47-152)
- `src/events/job-progress.ts` provides Redis pub/sub for progress events
- PROGRESS_STAGES and PROGRESS_PERCENTAGES constants defined

**OKR Frontend (COMPLETE)**
- `frontend/src/pages/OKRPage.tsx` is 787 lines with full CRUD
- ObjectiveModal, KeyResultModal, ProgressBar, StatusBadge components
- Quarter filtering, inline progress updates, delete confirmation

**Google Calendar (COMPLETE)**
- `src/api/google-calendar.ts` - Full REST API (287 lines)
- `src/mcp-servers/google-calendar/` - MCP tools (client.ts, index.ts, types.ts, tools/)

### What Actually Remains

**Critical Gaps (P0)**
1. **Slack MCP Server**: OAuth exists but no MCP server directory
2. **Result Aggregator Enhancement**: Confidence-based weighting missing
3. **Intent Detection LLM Fallback**: Pattern matching only, no LLM fallback

**High Priority (P1)**
1. GitHub PR tracking for Org Changes
2. Entity extraction for Linear/Jira/Asana

**Verification Tasks (P0-V)**
1. Verify RLS actually blocks cross-tenant queries
2. Verify metrics endpoint returns real data
3. Verify task complexity override works

---

## Verified File Structure

### MCP Servers (Actual Structure)

```
src/mcp-servers/
  base-mcp-server.ts              [EXISTS]
  provider-template.ts            [EXISTS]
  provider-error-handler.ts       [EXISTS]
  provider-rate-limiter.ts        [EXISTS]
  dynamic-loader.ts               [EXISTS]
  mcp-oauth.ts                    [EXISTS]
  notion/
    index.ts                      [EXISTS]
    client.ts                     [EXISTS]
    types.ts                      [EXISTS]
    tools/
      getTasks.ts                 [EXISTS]
      createTask.ts               [EXISTS]
      updateTask.ts               [EXISTS]
      deleteTask.ts               [EXISTS]
  github/
    index.ts                      [EXISTS]
    client.ts                     [EXISTS]
    types.ts                      [EXISTS]
    tools/                        [EXISTS - 6 tools]
  linear/
    index.ts                      [EXISTS]
    client.ts                     [EXISTS]
    types.ts                      [EXISTS]
    tools/                        [EXISTS - 4 tools]
  drive/
    index.ts                      [EXISTS]
    client.ts                     [EXISTS]
    types.ts                      [EXISTS]
    tools/                        [EXISTS - 3 tools]
  google-calendar/
    index.ts                      [EXISTS]
    client.ts                     [EXISTS]
    types.ts                      [EXISTS]
    tools/
      listEvents.ts               [EXISTS]
      createEvent.ts              [EXISTS]
  slack/                          [DOES NOT EXIST - needs CREATE]
```

### Test Structure (Actual)

```
src/__tests__/
  README.md                       [EXISTS]
  setup.ts                        [EXISTS]
  rls-testing.ts                  [EXISTS]
  auth/                           [EXISTS]
  middleware/                     [EXISTS - 4 test files]
  orchestrator/                   [EXISTS - 1 test file]
  queue/                          [EXISTS - 1 test file]
  utils/                          [EXISTS - 1 test file]
  workers/                        [EXISTS - 1 test file]
  api/                            [EXISTS - 6 test files]
  services/                       [EXISTS - 4 test files]
  security/                       [EXISTS - 2 test files]
  load/                           [EXISTS - 4 test files]
  e2e/                            [EXISTS - 7 test files]
  tracing/                        [EXISTS - 1 test file]
  db/                             [EXISTS - 1 test file]
```

---

## Task Breakdown

### P0-V - Verification Tasks (Must Verify First)

#### P0-V1: Verify RLS Cross-Tenant Blocking [VERIFY]
**Effort**: 1 hour | **Owner**: TBD

**Context**: RLS middleware is wired in `src/db/client.ts`, but no verification that cross-tenant queries are actually blocked.

**Verification Steps**:
```bash
# Run existing RLS tests
npm test -- --grep "rls"

# If no RLS tests exist, create verification test
```

**File to Check**: `src/__tests__/security/rls-enforcement.test.ts` [EXISTS]

**Acceptance Criteria**:
- [ ] Test suite confirms cross-tenant SELECT returns 0 rows
- [ ] Test suite confirms cross-tenant UPDATE fails
- [ ] `set_current_organization()` SQL function exists and works

---

#### P0-V2: Verify Metrics Endpoint Returns Data [VERIFY]
**Effort**: 30 minutes | **Owner**: TBD

**Context**: Metrics middleware is wired at `src/index.ts:235`, but we need to verify `/metrics` endpoint returns actual data.

**Verification Steps**:
```bash
# Start server and hit metrics endpoint
curl http://localhost:3000/metrics

# Expected: Prometheus-format metrics with:
# - http_requests_total
# - http_request_duration_seconds
# - ai_requests_total (if AI called)
```

**Acceptance Criteria**:
- [ ] `/metrics` endpoint responds with Prometheus format
- [ ] HTTP request metrics show real counts after API calls

---

#### P0-V3: Verify Task Complexity Override [VERIFY]
**Effort**: 30 minutes | **Owner**: TBD

**Context**: AUTONOMOUS_IMPROVEMENT_PLAN.md mentions task complexity override (Fix #4), need to verify it works.

**Files to Check**:
- `src/orchestrator/category-selector.ts` [MODIFY if needed]
- `src/orchestrator/request-analyzer.ts` [MODIFY if needed]

**Verification Steps**:
```bash
# Test simple request doesn't trigger expensive category
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"Create a task"}'

# Should return category="quick", NOT "ultrabrain"
```

**Acceptance Criteria**:
- [ ] Simple requests use cheap model categories
- [ ] Complex requests still use appropriate expensive categories

---

### P0 - Critical (Must Complete)

#### P0-1: Create Slack MCP Server [CREATE]
**Effort**: 8 hours | **Owner**: TBD

**Context**: OAuth flow exists (`src/api/slack-integration.ts`) but MCP server directory does not exist. Users can connect Slack but cannot execute tools.

**Files to CREATE**:
```
src/mcp-servers/slack/           [CREATE - entire directory]
  index.ts                       [CREATE]
  client.ts                      [CREATE]
  types.ts                       [CREATE]
  tools/
    sendMessage.ts               [CREATE]
    getUser.ts                   [CREATE]
    listChannels.ts              [CREATE]
    searchMessages.ts            [CREATE]
```

**Reference Pattern**: Copy structure from `src/mcp-servers/notion/`

**Acceptance Criteria**:
- [ ] `slack__sendMessage` posts to connected channels
- [ ] `slack__getUser` retrieves user info
- [ ] `slack__listChannels` returns connected workspace channels
- [ ] Integration test at `src/__tests__/services/slack-mcp.test.ts` [CREATE]

**Tasks**:
```
P0-1.1: Create Slack MCP directory structure following Notion pattern
        Files: src/mcp-servers/slack/index.ts, client.ts, types.ts

P0-1.2: Implement Slack MCP tools (sendMessage, getUser, listChannels, searchMessages)
        Files: src/mcp-servers/slack/tools/*.ts

P0-1.3: Wire Slack MCP to mcp-registry
        File: src/services/mcp-registry.ts [MODIFY]

P0-1.4: Add Slack MCP integration tests
        File: src/__tests__/services/slack-mcp.test.ts [CREATE]
```

---

#### P0-2: Enhance Result Aggregator with Confidence Weighting [MODIFY]
**Effort**: 4 hours | **Owner**: TBD

**Context**: `src/orchestrator/result-aggregator.ts` has merge, voting, priority, best_confidence strategies. Missing: weighted confidence merging, human-readable summary generation.

**File to MODIFY**: `src/orchestrator/result-aggregator.ts` [EXISTS - 346 lines]

**Current State** (verified):
- `aggregateResults()` with 4 strategies
- `detectConflicts()` working
- `resolveConflicts()` working

**What's Missing**:
- Weighted merge by confidence score (not just equal weights)
- Human-readable summary generation from multi-agent output
- Deep conflict resolution (currently top-level only)

**Acceptance Criteria**:
- [ ] `aggregateResults()` supports "weighted_merge" strategy
- [ ] Higher confidence results have more influence in merge
- [ ] `generateSummary()` function produces readable 2-3 sentence summary

**Tasks**:
```
P0-2.1: Add weighted_merge aggregation strategy
        File: src/orchestrator/result-aggregator.ts [MODIFY]
        Location: After line 103 (existing strategies)

P0-2.2: Add generateSummary() function for multi-agent output
        File: src/orchestrator/result-aggregator.ts [MODIFY]
        New function after resolveConflicts()

P0-2.3: Add unit tests for new aggregation features
        File: src/__tests__/orchestrator/result-aggregator.test.ts [CREATE]
```

---

#### P0-3: Add LLM Fallback to Intent Detection [MODIFY]
**Effort**: 6 hours | **Owner**: TBD

**Context**: `src/orchestrator/intent-detector.ts` has 700+ LOC of pattern matching but returns low confidence on ambiguous requests without LLM fallback.

**File to MODIFY**: `src/orchestrator/intent-detector.ts` [EXISTS]

**What's Missing**:
- LLM classification when pattern matching confidence < 0.7
- Korean language intent patterns
- Multi-intent detection

**Acceptance Criteria**:
- [ ] Ambiguous requests trigger LLM classification
- [ ] Korean requests handled equally well as English
- [ ] Intent detection accuracy > 95% on test set

**Tasks**:
```
P0-3.1: Add LLM fallback when pattern confidence < 0.7
        File: src/orchestrator/intent-detector.ts [MODIFY]

P0-3.2: Add Korean intent patterns
        File: src/orchestrator/intent-detector.ts [MODIFY]

P0-3.3: Add clarification question generation for ambiguous requests
        File: src/orchestrator/ambiguity-detector.ts [MODIFY if exists, CREATE if not]
```

---

### P1 - High Priority (Should Complete)

#### P1-1: GitHub PR Tracking for Org Changes [MODIFY]
**Effort**: 4 hours | **Owner**: TBD

**Context**: Org changes API exists (`src/api/org-changes.ts`) but PR tracking (`prUrl` field) is not implemented.

**Files to MODIFY**:
- `src/api/org-changes.ts` [EXISTS] - Add PR link endpoint
- `frontend/src/pages/OrgChangesPage.tsx` [EXISTS] - Display PR links

**File to CREATE**:
- `src/services/org-change-tracker.ts` [CREATE] - PR status sync service

**Acceptance Criteria**:
- [ ] Org changes can link to GitHub PRs
- [ ] PR status syncs automatically (open/merged/closed)
- [ ] Frontend shows PR status badge

---

#### P1-2: Entity Extraction Enhancement [MODIFY]
**Effort**: 4 hours | **Owner**: TBD

**Context**: `src/orchestrator/request-analyzer.ts` has basic entity extraction. Need specific extractors for Linear, Jira, Asana entities.

**File to MODIFY**: `src/orchestrator/request-analyzer.ts` [EXISTS]

**Acceptance Criteria**:
- [ ] "Create Linear issue for auth bug" extracts Linear + issue type
- [ ] "Check Jira sprint progress" extracts Jira + sprint context
- [ ] Entity extraction works for connected providers only

---

### P2 - Medium Priority (Nice to Have)

#### P2-1: Agent Intervention Controls
**Effort**: 4 hours

Add user intervention capability to AgentActivityPage:
- Pause running agent
- Cancel execution
- Inject guidance message

#### P2-2: OpenCode/Sidecar Integration (Future Phase)
**Status**: OUT OF SCOPE for Phase 3

Per BIDIRECTIONAL_INTEGRATION_PLAN.md, this is an 8-week project across 4 phases. Not part of this 72-hour sprint.

---

## Risk Analysis

### Blockers

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Slack API rate limits during MCP implementation | MEDIUM | MEDIUM | Use test workspace, implement caching |
| LLM costs for intent detection | MEDIUM | LOW | Use haiku for classification, cache results |
| Test failures from RLS changes | LOW | HIGH | Run full test suite before/after changes |

### Dependencies

| Task | Depends On | Status |
|------|------------|--------|
| P0-1 (Slack MCP) | Slack OAuth tokens stored | COMPLETE (verified in DB) |
| P0-3 (Intent LLM) | Anthropic API access | COMPLETE (already in use) |
| P1-1 (GitHub PR) | GitHub OAuth tokens | COMPLETE (verified) |

---

## Verification Steps

### Build Verification
```bash
npm run build
# Expected: 0 TypeScript errors
# Expected: dist/ folder updated
```

### Test Suite
```bash
npm test
# Expected: Current baseline + new tests passing
# New tests: P0-2.3, P0-1.4
```

### Manual QA Checklist
- [ ] Slack integration sends message via MCP
- [ ] Multi-agent results have readable summary
- [ ] Ambiguous Korean request gets LLM classification
- [ ] RLS blocks cross-tenant queries (verify via test)

---

## Commit Strategy

### Commit Conventions
```
feat(mcp): create Slack MCP server with sendMessage and listChannels
feat(orchestrator): add weighted confidence merging to result aggregator
feat(orchestrator): add LLM fallback for ambiguous intent detection
verify(security): confirm RLS cross-tenant blocking works
```

### Branch Strategy
- Main work on `feat/phase3-completion`
- Merge to `main` after QA verification
- Tag `v3.0.0-rc1` after P0 complete

---

## Success Criteria

### Quantitative
- Build: 0 TypeScript errors
- Tests: Baseline + 10 new tests passing
- Coverage: > 60% on new code
- Performance: Dashboard < 2s, API < 500ms

### Qualitative
- User can send Slack message via MCP tool
- Multi-agent results have human-readable summary
- Ambiguous requests get clarification or LLM classification

---

## Timeline (72 Hours)

| Day | Focus | Deliverables |
|-----|-------|--------------|
| Day 1 (0-24h) | Verification + Slack MCP | P0-V1, P0-V2, P0-V3, P0-1.1, P0-1.2 |
| Day 2 (24-48h) | Slack MCP + Aggregator | P0-1.3, P0-1.4, P0-2.1, P0-2.2, P0-2.3 |
| Day 3 (48-72h) | Intent Detection + P1 | P0-3.1, P0-3.2, P0-3.3, P1-1 (if time) |

---

## Appendix: File Reference

### Files to MODIFY (Verified Existing)

| Path | Lines | Purpose |
|------|-------|---------|
| `src/orchestrator/result-aggregator.ts` | 346 | Add weighted merge, summary |
| `src/orchestrator/intent-detector.ts` | 700+ | Add LLM fallback |
| `src/services/mcp-registry.ts` | - | Wire Slack MCP |
| `src/api/org-changes.ts` | - | Add PR linking |
| `frontend/src/pages/OrgChangesPage.tsx` | - | Display PR links |

### Files to CREATE

| Path | Purpose |
|------|---------|
| `src/mcp-servers/slack/index.ts` | Slack MCP server entry |
| `src/mcp-servers/slack/client.ts` | Slack API client |
| `src/mcp-servers/slack/types.ts` | Type definitions |
| `src/mcp-servers/slack/tools/*.ts` | MCP tool implementations |
| `src/__tests__/services/slack-mcp.test.ts` | Slack MCP tests |
| `src/__tests__/orchestrator/result-aggregator.test.ts` | Aggregator tests |
| `src/services/org-change-tracker.ts` | PR tracking service |

### Files NOT Needed (Already Complete)

| Path | Status | Verification |
|------|--------|--------------|
| `frontend/src/pages/OKRPage.tsx` | COMPLETE | 787 lines, full CRUD |
| `src/workers/orchestration.worker.ts` | COMPLETE | emitJobProgress() at 6 points |
| `src/db/client.ts` | COMPLETE | RLS via Prisma extension |
| `src/queue/base.queue.ts` | COMPLETE | Rate limiter at lines 62-67 |
| `src/mcp-servers/google-calendar/` | COMPLETE | Full MCP implementation |

---

## Architect Questions Answered

1. **MCP Architecture**: Use subdirectory pattern (like `notion/`, `github/`) not flat files. Copy structure from existing implementations.

2. **Test structure**: Add to existing `src/__tests__/services/` for MCP tests, `src/__tests__/orchestrator/` for aggregator tests.

3. **BIDIRECTIONAL_INTEGRATION_PLAN.md**: OpenCode/Sidecar is OUT OF SCOPE - that's an 8-week project, not part of this 72-hour sprint.

---

**PLAN_READY: .omc/plans/nubabel-phase3-plan.md**
