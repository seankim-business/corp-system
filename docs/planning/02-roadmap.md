# Nubabel 로드맵

**전략**: 보이는 것 우선 → 점진적 고도화

---

## 🎯 전체 타임라인

```
Jan 2026  Phase 1: Foundation ✅
  ↓
Q1 2026   Phase 2: Visible Features (지금!)
  ↓
Q2 2026   Phase 3: Intelligence
  ↓
Q3-Q4     Phase 4: Framework
  ↓
2027+     Phase 5: Learning
```

---

## Phase 1: Foundation ✅ (완료)

**기간**: 2026년 1월  
**목표**: 멀티테넌트 인프라 구축

### 완성된 것

- ✅ Multi-tenant 인증 (Google Workspace OAuth)
- ✅ Database schema with RLS
- ✅ Docker deployment configuration
- ✅ Railway 배포 준비 완료

### 성과

- 완성도: **100%**
- 배포만 하면 바로 사용 가능

**다음**: Railway 수동 배포 (진행 중)

---

## Phase 2: Visible Features ✅ (완료 - 2026-01-30)

**기간**: 3개월 (2-4월)
**목표**: 사용자가 볼 수 있는 UI/UX 완성
**상태**: **100% 완료** ✅

### Week 1-2: Web Dashboard ✅ (완료)

```
목표: 로그인 + 기본 대시보드
├── 로그인 페이지 (Google OAuth UI) ✅
├── 대시보드 레이아웃 (Header + Sidebar) ✅
├── 조직 전환기 (OrganizationSwitcher) ✅
└── 설정 페이지 (Profile, Organization, Security) ✅
```

**결과물**:

- ✅ 사용자가 로그인해서 대시보드 볼 수 있음
- ✅ 조직 전환 가능
- ✅ 프로필 설정 가능

### Week 3-4: 첫 번째 워크플로우 (수동) ✅ (완료)

```
목표: 워크플로우 수동 실행
├── 워크플로우 목록 보기 ✅
├── 워크플로우 상세 보기 ✅
├── 수동 실행 버튼 (ExecuteWorkflowModal) ✅
└── 실행 로그 보기 (ExecutionsPage) ✅
```

**결과물**:

- ✅ 사용자가 버튼 클릭으로 워크플로우 실행
- ✅ 실행 결과 확인 가능 (pending → running → success/failed)

### Week 5-8: Notion 연동 ✅ (완료 - 2026-01-25)

```
목표: Notion MCP로 데이터 읽기/쓰기
├── Notion MCP 서버 구현 ✅
├── Task 목록 가져오기 (getTasks) ✅
├── Task 생성/수정 (createTask, updateTask) ✅
├── Task 삭제 (deleteTask) ✅
├── Notion API 연결 관리 ✅
└── NotionSettingsPage UI ✅
```

**결과물**:

- ✅ Nubabel에서 Notion task 관리 가능
- ✅ 워크플로우에서 Notion MCP 도구 사용
- ✅ Template variable interpolation (`{{input.field}}`)

### Week 9-12: Slack Bot + Orchestrator ✅ (완료 - 2026-01-30)

```
목표: Slack 자연어 → Agent 라우팅 → 워크플로우 실행
├── Slack Bot 설정 (App 등록, 토큰) ✅
├── 메시지 수신/응답 (Slack Bolt SDK) ✅
├── Orchestrator 전체 구현 (OhMyOpenCode delegate_task) ✅
│   ├── AI 기반 요청 분석 (Claude Haiku LLM fallback) ✅
│   ├── 동적 라우팅 로직 (의도 감지 + MCP 선택) ✅
│   └── 8가지 특화 에이전트 실행 ✅
├── 자연어 명령 파싱 ✅
├── 결과 메시지 전송 (다국어 지원) ✅
└── Slack thread 진행상황 추적 ✅
```

**기술 스택**:

- **Agent Orchestration**: OhMyOpenCode `delegate_task` (8 specialized agents)
  - Categories: visual-engineering, ultrabrain, quick, artistry, writing, etc.
  - Skills: mcp-integration, git-master, frontend-ui-ux, etc.
  - Session management: Redis hot + PostgreSQL cold
- **MCP Tools**: Notion, Slack, Linear, GitHub (tool_use 지원)
- **Slack SDK**: @slack/bolt (Socket Mode)
- **LLM Fallback**: Claude Haiku for intent parsing
- **i18n**: 영어/한국어 에러 메시지

**완성된 결과물**:

- ✅ Slack에서 "@company-os 태스크 생성" 가능
- ✅ Orchestrator가 자동으로 의도 분석 후 적절한 에이전트로 라우팅
- ✅ 8개 특화 에이전트 (Brand, Marketing, Ops, Product, Engineering, Support, Growth, Finance)
- ✅ 멀티 에이전트 협업 기초 (순차 + 병렬 실행)
- ✅ MCP tool_use로 Notion, Slack, Linear, GitHub와 통합
- ✅ Budget enforcement (API 비용 추적)
- ✅ 429 retry logic + account pool (API rate limit 대응)
- ✅ SSE real-time progress (Slack thread에 실시간 업데이트)
- ✅ Weighted result aggregation (멀티 에이전트 결과 합산)
- ✅ E2E test suite (18 tests, 모두 PASS)

**Phase 2 성공 기준**:

- [x] 로그인 → 대시보드 → 워크플로우 실행 → 결과 확인 ✅
- [x] Notion에서 task 보임 ✅
- [x] Slack에서 "@company-os" 멘션으로 명령 가능 ✅
- [x] Orchestrator가 요청을 분석해 적절한 에이전트로 라우팅 ✅
- [x] MCP tool_use로 여러 시스템 통합 ✅
- [x] E2E 자동화 테스트 통과 (18/18) ✅

상세: [PHASE2_TECHNICAL_SPEC.md](../PHASE2_TECHNICAL_SPEC.md)

---

## Phase 3: Intelligence (Q2 2026) ✅ (완료 - 2026-01-30)

**기간**: 3개월 (5-7월)
**목표**: 간단한 AI Agent 추가
**상태**: **100% 완료** ✅

### Month 1: Agent MVP ✅ (완료)

```
단일 Function Agent
├── Task 정의 (JSON) ✅ (OrchestrationRequest, DelegateTaskParams)
├── Agent 실행 ✅ (orchestrate() → delegate-task → AI execution)
├── 결과 반환 ✅ (OrchestrationResult with status, output, metadata)
└── 로그 저장 ✅ (orchestratorExecution table + OpenTelemetry)
```

**구현 완료**:
- `src/orchestrator/index.ts` - Main orchestration entry point
- `src/orchestrator/delegate-task.ts` - Task delegation to AI agents
- `src/orchestrator/types.ts` - Type definitions for tasks and agents
- Slack slash commands: `/nubabel`, `/schedule`, `/task`

### Month 2: Background Execution ✅ (완료)

```
Background Job Queue
├── Task 큐에 추가 ✅ (OrchestrationQueue with BullMQ)
├── Worker로 비동기 실행 ✅ (OrchestrationWorker, concurrency=3)
├── 진행 상황 추적 ✅ (6-stage progress: 0% → 20% → 50% → 80% → 100%)
└── 완료/실패 알림 ✅ (Slack blocks + SSE events)
```

**구현 완료**:
- `src/queue/orchestration.queue.ts` - BullMQ queue (20 req/min rate limit)
- `src/workers/orchestration.worker.ts` - Async worker with 5-min lock
- `src/events/job-progress.ts` - Redis pub/sub real-time progress
- `src/services/slack-progress.service.ts` - Slack visual progress bars

### Month 3: Error Handling ✅ (완료)

```
Retry & Recovery
├── 실패 시 재시도 ✅ (3 retry policies: DEFAULT, AGGRESSIVE, CONSERVATIVE)
├── 에러 로깅 ✅ (Winston + Prometheus + OpenTelemetry)
├── 사용자 알림 ✅ (Slack error messages + admin alerts)
└── 수동 개입 옵션 ✅ (Admin API: /admin/error-management)
```

**구현 완료**:
- `src/orchestrator/error-handler.ts` - 7 error types classification
- `src/orchestrator/retry-policy.ts` - Exponential backoff (2s → 4s → 8s)
- `src/queue/dead-letter.queue.ts` - DLQ with 7-day retention
- `src/workers/dead-letter-recovery.worker.ts` - Auto-recovery batches
- `src/api/error-management.ts` - Admin retry/view/delete endpoints

**Phase 3 성공 기준**:

- [x] Agent가 자동으로 Notion task 생성 ✅ (MCP tool_use via Slack)
- [x] 실패 시 재시도 ✅ (3 retry policies + DLQ recovery)
- [x] 로그에서 전체 과정 추적 가능 ✅ (DB + OpenTelemetry + Prometheus)

상세: [phase-3-spec.md](phase-3-spec.md)

---

## Phase 4: Framework (Q3-Q4 2026)

**기간**: 6개월 (8월-12월)
**목표**: Extension 시스템 완성 + 첫 외부 고객

### Q3: Extension System ✅ (완료 - 2026-01-30)

```
Plugin Architecture
├── Hook 시스템 구현 ✅ (HookManager - 15+ event types)
├── Extension 로더 ✅ (Dynamic loading, hot reload, YAML manifests)
├── Route Registrar ✅ (Express route registration per extension)
├── Kyndof Extension 분리 ✅ (CLO3D MCP, lifecycle hooks)
└── Extension Marketplace UI ✅ (Browse, Install, Details pages)
```

**구현 완료 (2026-01-30)**:

- **HookManager**: Event-driven hook system with priority ordering, async execution, timeout enforcement, Zod validation
- **Extension Loader**: Dynamic YAML manifest parsing, hot reload support, dependency resolution
- **Route Registrar**: Dynamic Express route registration with auth middleware and rate limiting
- **Kyndof Fashion Extension**: CLO3D MCP integration (getDesigns, exportPattern, render3D), lifecycle hooks (onInstall, onUninstall, onUpdate)
- **Marketplace UI**: MarketplacePage, MarketplaceHubPage, ExtensionDetailPage with external sources (Smithery, Glama, ComfyUI, CivitAI, LangChain Hub)

### Q4: External Customer (다음)

```
첫 외부 고객 준비
├── 일반화된 기능만 Core에
├── 커스터마이징 가이드
├── Self-service onboarding
└── 첫 고객 3개 확보
```

**Phase 4 성공 기준**:

- [x] Kyndof 특수 기능이 Extension으로 분리됨 ✅
- [x] 다른 회사가 자기 Extension 만들 수 있음 ✅
- [ ] 첫 외부 고객 3개 사용 시작 (Q4)

상세: [phase-4-spec.md](phase-4-spec.md)

---

## Phase 5: Learning (2027+)

**기간**: 장기 (1년 이상)  
**목표**: "Human as Training Data" 실현

### Step 1: Activity Tracking

```
사용자 행동 기록
├── Screen recording (옵션)
├── Click/Keyboard 이벤트
├── Navigation 패턴
└── Context 저장
```

### Step 2: Pattern Detection

```
패턴 감지
├── 반복 작업 발견
├── 워크플로우 추천
├── 자동화 제안
└── 사용자 승인
```

### Step 3: Learning Loop

```
지속적 학습
├── 사람 피드백 수집
├── 모델 재훈련
├── 정확도 향상
└── 자동화율 증가
```

**Phase 5 성공 기준**:

- [ ] 사용자 작업 패턴 자동 감지
- [ ] 자동화 제안 정확도 80%+
- [ ] 사람 개입 < 20%

상세: [phase-5-spec.md](phase-5-spec.md)

---

## 🎯 현재 위치

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░ 87.5%

Phase 1: ████████████████████ 100% ✅
Phase 2: ████████████████████ 100% ✅ (완료)
Phase 3: ████████████████████ 100% ✅ (완료)
Phase 4: ██████████░░░░░░░░░░  50% ✅ (Q3 완료, Q4 대기)
Phase 5: ░░░░░░░░░░░░░░░░░░░░   0%
```

**완료**:

- ✅ Phase 1: 멀티테넌트 인프라 (100%)
- ✅ Phase 2 Week 1-2: Web Dashboard (100%)
- ✅ Phase 2 Week 3-4: Workflow 시스템 (100%)
- ✅ Phase 2 Week 5-8: Notion MCP 통합 (100%)
- ✅ Phase 2 Week 9-12: Slack Bot + Orchestrator (100%) - 2026-01-30
- ✅ Phase 3: Intelligence (100%) - 2026-01-30
  - Agent MVP: Task definition, execution, result return, logging
  - Background Execution: BullMQ queues, workers, progress tracking
  - Error Handling: Retry policies, DLQ, admin API
- ✅ Phase 4 Q3: Extension System (100%) - 2026-01-30
  - HookManager, Extension Loader, Route Registrar
  - Kyndof Fashion Extension (CLO3D MCP)
  - Marketplace UI (Browse, Hub, Details pages)

**지금**: Phase 3 + Phase 4 Q3 완료 - Phase 4 Q4 (첫 외부 고객) 또는 Phase 5 선택

---

## 📊 마일스톤

| 시기 | 마일스톤         | 설명             |
| ---- | ---------------- | ---------------- |
| 1월  | MVP 완성         | 인증 + DB        |
| 3월  | Dashboard 완성   | UI/UX 사용 가능  |
| 4월  | Notion 연동      | 첫 실제 자동화   |
| 7월  | AI Agent         | 간단한 지능 추가 |
| 12월 | Extension System | 외부 판매 준비   |
| 2027 | Learning         | 장기 비전 시작   |

---

## 🚀 다음 단계: Phase 3 (Q2 2026)

**Phase 2 완료 후 Phase 3 계획**:

### Phase 3 준비 단계 (즉시):

1. **현재 상태 문서화** ✅
   - Phase 2 완료 상태 기록
   - E2E 테스트 18/18 PASS
   - 구현 이슈 정리

2. **Phase 3 팀 동의** (예정):
   - Agent MVP 스펙 검토
   - Background 작업 큐 설계
   - 에러 처리 전략 확인

3. **Phase 3 스프린트 계획** (예정):
   - Month 1: Agent MVP (자동화 작업)
   - Month 2: Background Execution (비동기 작업 큐)
   - Month 3: Error Handling (재시도 + 복구)

### Phase 3 성공 기준:

- [ ] Agent가 자동으로 Notion task 생성 (수동 클릭 없음)
- [ ] 실패 시 자동 재시도 (최대 3회)
- [ ] 로그에서 전체 과정 추적 가능
- [ ] Slack을 통한 자동 작업 실행

### 현재 상태 요약:

**Phase 2 완성 내용**:

1. **Slack Bot ↔ Orchestrator E2E 플로우** ✅
   - Slack 메시지 수신 → 의도 분석 → Agent 라우팅 → 결과 반환

2. **MCP tool_use 통합** ✅
   - Notion, Slack, Linear, GitHub API 연동
   - 8개 에이전트로 분산 실행
   - Weighted merge 전략으로 결과 합산

3. **프로덕션 준비** ✅
   - Budget enforcement (API 비용 제어)
   - 429 retry logic + 계정 풀
   - SSE real-time 업데이트
   - 다국어 지원 (영어/한국어)

4. **E2E 테스트** ✅
   - 18개 테스트 케이스 모두 통과
   - 완전 자동화된 워크플로우 검증

**참조**:

- **[Phase 2 기술 명세](../PHASE2_TECHNICAL_SPEC.md)** - 전체 구현 상세
- **[OhMyOpenCode 통합 설계](../core/06-ohmyopencode-integration.md)** - delegate_task API, Category/Skill 시스템
- **[Slack + Orchestrator 구현](../core/07-slack-orchestrator-implementation.md)** - 상세 구현 명세
- [Phase 3 계획](../planning/03-roadmap.md) (예정)
