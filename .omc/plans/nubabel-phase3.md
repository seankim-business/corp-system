# Nubabel Phase 3: Intelligence Layer

> **Status:** READY FOR IMPLEMENTATION
> **Created:** 2026-01-30
> **Context:** Building on Phase 2's multi-agent orchestration foundation

---

## Executive Summary

Phase 2 delivered a robust foundation with 8 specialized agents, multi-agent orchestration, MCP tool integration, BullMQ job queues, retry logic, and comprehensive logging. Analysis reveals that **most original Phase 3 goals are already complete**. This plan pivots Phase 3 toward the **Intelligence Layer** - making agents smarter, more autonomous, and self-improving.

---

## Phase 3 Original Goals vs. Current State

### Already Complete (from Phase 2)

| Original Goal | Status | Evidence |
|---------------|--------|----------|
| Single function agent | DONE | 8 agents in `agent-registry.ts` (orchestrator, data, report, comms, search, task, approval, analytics) |
| Task definition | DONE | `task-decomposer.ts`, `DecompositionResult` type |
| Execution | DONE | `multi-agent-orchestrator.ts`, `workflow-executor.ts` |
| Logging | DONE | `OrchestratorExecution` model, full execution persistence |
| Job queue | DONE | BullMQ with 10+ queues (orchestration, notification, webhook, scheduled-task, etc.) |
| Async workers | DONE | 9 workers in `src/workers/` |
| Progress tracking | DONE | Slack thread updates, `AgentActivity` model |
| Notifications | DONE | `notification.queue.ts`, Slack integration |
| Retry logic | DONE | `retry-policy.ts` with exponential backoff, 3 policy tiers |
| Error logging | DONE | `error-handler.ts`, classified error types |
| User notifications | DONE | Slack message builder with i18n |
| Manual intervention | DONE | Approval agent, human-in-the-loop workflows |

### Success Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Agent가 자동으로 Notion task 생성 | PARTIAL | MCP Notion provider exists, needs end-to-end flow |
| 실패 시 재시도 | DONE | `retry-policy.ts`, configurable policies |
| 로그에서 전체 과정 추적 가능 | DONE | `OrchestratorExecution`, `AgentActivity`, OpenTelemetry |

---

## Phase 3 New Focus: Intelligence Layer

Given the strong foundation, Phase 3 pivots to making agents **intelligent**:

### Theme 1: Agent Autonomy
Agents that can spawn sub-agents and orchestrate their own workflows.

### Theme 2: Learning from Feedback
Continuous improvement through observation and adaptation.

### Theme 3: Scheduled & Triggered Execution
Agents that act proactively, not just reactively.

### Theme 4: Human-in-the-Loop Optimization
Smart approval workflows that learn when human oversight is needed.

### Theme 5: Pattern Detection & Automation Suggestions
Detecting repetitive tasks and suggesting automations.

---

## Detailed Task Breakdown

### EPIC 1: Complete Notion Task Creation E2E Flow

**Goal:** Fulfill the success criterion "Agent가 자동으로 Notion task 생성"

**Current State:**
- MCP Notion provider exists (`src/mcp/providers/notion.ts`)
- Task agent defined with `create_task` tool
- Registry links task agent to Notion provider

**Missing:**
- End-to-end flow from Slack command to Notion task
- User-facing confirmation of task creation
- Error handling with user-friendly messages

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E1-T1 | Implement `/task create` Slack command handler | Slash command creates Notion task, posts confirmation to Slack thread | 4h |
| E1-T2 | Add task creation intent detection | Natural language "create a task for X" routes to task agent | 2h |
| E1-T3 | Notion task creation integration test | E2E test: Slack message -> Notion API call -> Slack confirmation | 3h |
| E1-T4 | Korean/English i18n for task creation messages | Both languages supported for success/error messages | 2h |

**Definition of Done:**
- [ ] User says "create task: fix the login bug" in Slack
- [ ] Notion task created with correct title, linked to appropriate project
- [ ] Confirmation posted back to Slack in user's language
- [ ] Error cases handled gracefully (no Notion connection, permission denied)

---

### EPIC 2: Agent Sub-Agent Spawning (Autonomy)

**Goal:** Enable agents to spawn specialized sub-agents for complex subtasks.

**Current State:**
- Orchestrator can delegate to other agents (`canDelegateTo` in registry)
- Sequential and parallel execution supported
- No recursive spawning or dynamic agent creation

**Architecture:**
```
User Request
    |
    v
Orchestrator Agent (depth=0)
    |
    +---> Data Agent (depth=1)
    |         |
    |         +---> Search Agent (depth=2) [spawned dynamically]
    |
    +---> Report Agent (depth=1)
```

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E2-T1 | Add `spawnSubAgent()` method to agent context | Agent can request another agent within its execution context | 6h |
| E2-T2 | Implement depth limiting and budget tracking | Prevent infinite recursion, track token budget across spawn tree | 4h |
| E2-T3 | Add spawn tree visualization to logs | Trace shows full agent hierarchy for debugging | 3h |
| E2-T4 | Implement agent context inheritance | Sub-agents receive relevant context from parent | 4h |
| E2-T5 | Add rate limiting per user/org for sub-agent spawning | Prevent runaway agent spawning | 2h |

**Definition of Done:**
- [ ] Orchestrator can spawn Data agent, which can spawn Search agent
- [ ] Maximum depth (3) enforced
- [ ] Token budget shared across spawn tree
- [ ] Full execution tree visible in logs

---

### EPIC 3: Learning from Feedback (Self-Improvement)

**Goal:** Agents learn from user corrections and implicit signals.

**Current State:**
- Comprehensive learning system exists (`src/services/learning-system.ts`)
- Feedback collection infrastructure (`src/services/feedback/`)
- Experience tracker (`src/services/skill-learning/experience-tracker.ts`)
- Pattern detection with SOP generation (`src/services/pattern-detector.ts`)

**Missing:**
- Active application of learned patterns to agent behavior
- Feedback loop from corrections to prompt improvement
- A/B testing of prompt variations

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E3-T1 | Implement correction feedback capture from Slack reactions | :-1: reaction captures original response + user's correction | 4h |
| E3-T2 | Build feedback-to-prompt improvement pipeline | Weekly job analyzes corrections, suggests prompt modifications | 8h |
| E3-T3 | Add pattern-based response optimization | When pattern detected (>80% confidence), pre-apply relevant context | 6h |
| E3-T4 | Implement A/B testing for prompt variations | Compare response quality across prompt versions | 6h |
| E3-T5 | Create feedback dashboard API | Admin can view patterns, corrections, improvement suggestions | 4h |

**Definition of Done:**
- [ ] User thumbs-down a response -> system captures correction
- [ ] Weekly analysis identifies improvement opportunities
- [ ] Prompts updated based on feedback (with approval)
- [ ] Metrics show improvement over time

---

### EPIC 4: Scheduled & Triggered Execution

**Goal:** Agents act proactively based on schedules and triggers.

**Current State:**
- Scheduled task queue exists (`src/queue/scheduled-task.queue.ts`)
- Scheduled task worker (`src/workers/scheduled-task.worker.ts`)
- Daily briefing job (`src/jobs/daily-briefing.job.ts`)
- Pattern detection job (`src/jobs/pattern-detection.job.ts`)

**Missing:**
- User-configurable scheduled agent tasks
- Event-triggered agent execution (webhook-based)
- Conditional triggers (if X happens, run Y)

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E4-T1 | Add `/schedule` Slack command | User can schedule agent to run at specific times | 4h |
| E4-T2 | Implement schedule management UI data API | List, pause, resume, delete schedules | 4h |
| E4-T3 | Add webhook-triggered agent execution | Incoming webhook can trigger specific agent workflow | 6h |
| E4-T4 | Implement conditional trigger system | "When new Notion page is created, summarize and post to Slack" | 8h |
| E4-T5 | Add trigger templates | Pre-built triggers for common patterns | 4h |

**Definition of Done:**
- [ ] User schedules "daily standup summary at 9am"
- [ ] Agent runs automatically, posts to Slack
- [ ] User can view and manage schedules
- [ ] Webhook triggers work for supported providers

---

### EPIC 5: Smart Approval Optimization

**Goal:** Learn when human approval is truly needed vs. auto-approve.

**Current State:**
- Approval agent exists with human-in-the-loop
- Approval patterns tracked in learning system
- `detectApprovalSequences()` in learning-system.ts

**Missing:**
- Confidence-based auto-approval
- Risk scoring for approval decisions
- Learning from approval history to adjust thresholds

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E5-T1 | Implement risk scoring for approval requests | Each request gets risk score based on type, amount, history | 4h |
| E5-T2 | Add auto-approval for low-risk, high-confidence patterns | Patterns with >95% approval rate auto-approve if risk < threshold | 6h |
| E5-T3 | Build approval analytics dashboard API | Show approval patterns, auto-approval candidates | 4h |
| E5-T4 | Add user-configurable auto-approval rules | Admin can enable/disable auto-approval per type | 3h |
| E5-T5 | Implement escalation for anomalous requests | Unusual requests escalate to additional approver | 4h |

**Definition of Done:**
- [ ] Routine low-risk approvals auto-approve (with notification)
- [ ] Unusual requests escalate
- [ ] Admin can configure thresholds
- [ ] Approval rate visible in dashboard

---

### EPIC 6: Pattern Detection & Automation Suggestions

**Goal:** Proactively suggest automations based on detected patterns.

**Current State:**
- Pattern detector with SOP generation exists
- Weekly pattern detection job running
- Patterns stored with confidence scores

**Missing:**
- Proactive suggestions to users
- One-click automation creation from patterns
- Pattern impact estimation

#### Tasks

| ID | Task | Acceptance Criteria | Effort |
|----|------|---------------------|--------|
| E6-T1 | Implement weekly pattern digest to Slack | Users receive suggestions for detected patterns | 4h |
| E6-T2 | Add "Create Automation" button to pattern suggestions | One-click creates scheduled workflow from pattern | 6h |
| E6-T3 | Build pattern impact estimator | "This automation could save 2 hours/week" | 4h |
| E6-T4 | Add pattern dismissal and feedback | User can dismiss irrelevant patterns (trains system) | 3h |
| E6-T5 | Create pattern leaderboard | Show most impactful automations across org | 3h |

**Definition of Done:**
- [ ] Weekly digest shows top 3 automation opportunities
- [ ] User can create automation with one click
- [ ] Time savings estimated for each suggestion
- [ ] Dismissed patterns don't reappear

---

## Implementation Order

### Sprint 1 (Week 1-2): Foundation
1. **E1: Complete Notion Task Creation E2E** - Fulfills core success criterion
2. **E4-T1, E4-T2: Schedule Command** - Quick win for proactive execution

### Sprint 2 (Week 3-4): Learning
3. **E3-T1, E3-T2: Feedback Capture & Pipeline** - Start learning from corrections
4. **E5-T1, E5-T2: Smart Approvals** - Reduce approval fatigue

### Sprint 3 (Week 5-6): Autonomy
5. **E2: Agent Sub-Agent Spawning** - Enable complex workflows
6. **E3-T3, E3-T4: Pattern Optimization & A/B Testing**

### Sprint 4 (Week 7-8): Suggestions
7. **E6: Pattern Detection & Automation Suggestions** - Proactive value
8. **E4-T3, E4-T4: Webhook Triggers & Conditional Execution**

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Notion task creation success rate | >95% | `OrchestratorExecution` with task agent |
| Average agent response time | <3s | Metrics histogram |
| User correction rate | <5% | Thumbs-down reactions / total responses |
| Auto-approval rate | >70% for eligible | Approval agent logs |
| Pattern-suggested automations created | >3/org/month | Pattern acceptance rate |

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Agent spawning creates cost explosion | HIGH | MEDIUM | Strict depth/budget limits, rate limiting |
| Learning from bad feedback | MEDIUM | LOW | Human review before prompt changes |
| Auto-approval approves wrong things | HIGH | LOW | Conservative thresholds, easy override |
| Pattern suggestions annoying | LOW | MEDIUM | Dismissal feedback, frequency limits |

---

## Dependencies

- **MCP Notion Provider:** Must be functional for E1
- **Slack Integration:** Required for all user-facing features
- **Redis:** Required for pattern storage, caching
- **PostgreSQL:** Required for persistence

---

## Commit Strategy

| Phase | Commit Message Pattern |
|-------|------------------------|
| E1 tasks | `feat(task-agent): implement Notion task creation E2E` |
| E2 tasks | `feat(orchestrator): add agent sub-agent spawning` |
| E3 tasks | `feat(learning): implement feedback-to-improvement pipeline` |
| E4 tasks | `feat(scheduler): add user-configurable scheduled execution` |
| E5 tasks | `feat(approval): implement smart auto-approval` |
| E6 tasks | `feat(patterns): add automation suggestion system` |

---

## Definition of Done (Phase 3 Complete)

- [ ] All original success criteria met:
  - [ ] Agent가 자동으로 Notion task 생성 (E1)
  - [ ] 실패 시 재시도 (already complete)
  - [ ] 로그에서 전체 과정 추적 가능 (already complete)
- [ ] Agent autonomy working (E2)
- [ ] Feedback loop functional (E3)
- [ ] Scheduled execution available (E4)
- [ ] Smart approvals live (E5)
- [ ] Pattern suggestions shipping (E6)
- [ ] All E2E tests passing
- [ ] Documentation updated

---

## Appendix: Current Implementation Files Reference

### Agent System
- `src/orchestrator/agent-registry.ts` - 8 agent definitions
- `src/orchestrator/agent-coordinator.ts` - Multi-agent coordination
- `src/orchestrator/multi-agent-orchestrator.ts` - Main orchestration logic
- `src/orchestrator/task-decomposer.ts` - Task breakdown

### Queue System
- `src/queue/base.queue.ts` - BullMQ base class
- `src/queue/orchestration.queue.ts` - Main execution queue
- `src/queue/scheduled-task.queue.ts` - Scheduled execution

### Learning System
- `src/services/learning-system.ts` - Observation tracking, pattern detection
- `src/services/feedback/` - Feedback collection and processing
- `src/services/skill-learning/` - Experience tracking
- `src/services/pattern-detector.ts` - SOP generation

### Error Handling
- `src/orchestrator/error-handler.ts` - Error classification
- `src/orchestrator/retry-policy.ts` - Retry policies

### MCP Integration
- `src/mcp/providers/notion.ts` - Notion provider
- `src/mcp/providers/slack.ts` - Slack provider
- `src/mcp/registry.ts` - Provider registry
