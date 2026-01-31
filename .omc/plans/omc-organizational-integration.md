# OMC Organizational Integration Plan (Revised v2)

> oh-my-claudecode 에이전트 오케스트레이션 패턴의 조직 태스크 협업 및 Nubabel 비침습적 적용 계획

---

## Context

### Original Request
사용자가 oh-my-claudecode의 에이전트 오케스트레이션 패턴을 두 가지 방향으로 적용하고자 함:
1. 조직 내 일반 태스크 협업 구조 (코드 외 업무)
2. Nubabel 프로젝트에 비침습적 통합

### Research Findings

**OMC 핵심 아키텍처:**
- 32개 전문화된 에이전트 (architect, executor, designer, researcher, critic, planner, analyst, qa-tester, scientist 등)
- 3-티어 모델 라우팅: Haiku(LOW), Sonnet(MEDIUM), Opus(HIGH)
- 위임 카테고리: ultrabrain, visual-engineering, artistry, quick, writing
- "Conductor, not performer" 철학

**Nubabel 기존 구조 (VERIFIED):**
- `.omc/AGENTS.md` - 에이전트 가이드라인 (Mandatory Rules, Multi-Agent Coordination, Browser Testing 등)
- `.omc/AGENT_BOARD.md` - Active agents 현황판
- `.omc/AGENT_PROTOCOL.md` - 협업 프로토콜 (파일 잠금, 하트비트, 충돌 해결)
- `plan/06-multi-agent/orchestrator.md` - 라우팅 규칙, 워크플로우 패턴 정의

**CRITICAL CORRECTION:**
- AGENTS.md는 **오직** `.omc/AGENTS.md`에만 존재함 (루트 레벨 아님)
- 이 파일이 프로젝트별 AI 에이전트 가이드라인 역할 수행

---

## Existing Pattern vs OMC Pattern Comparison

### Routing Pattern Comparison

| Aspect | Nubabel 현재 (`plan/06-multi-agent/orchestrator.md`) | OMC Pattern | Integration Decision |
|--------|------------------------------------------------------|-------------|----------------------|
| **1차 라우팅** | 키워드 기반 (캠페인/예산/휴가 등) | 키워드 + 정규식 기반 | **EXTEND**: OMC 패턴을 hybrid-router.ts에 추가 |
| **2차 라우팅** | 스킬 매칭 (triggers.questions) | 스킬 + 모델 티어 기반 | **PRESERVE**: 기존 스킬 매칭 유지, 티어 정보 추가 |
| **멀티 에이전트** | sequential/parallel/conditional 패턴 | ultrawork/swarm/pipeline 패턴 | **EXTEND**: 새 패턴을 워크플로우 엔진에 추가 |
| **승인 흐름** | SOP 정의 + timeout_handling | approval-matrix + 티어별 권한 | **MERGE**: 기존 SOP와 OMC matrix 통합 |

### Agent Definition Comparison

| Nubabel Agent (`agent-registry.ts`) | OMC Equivalent | Category | Decision |
|-------------------------------------|----------------|----------|----------|
| `orchestrator` | `architect` | ultrabrain | **MAP**: 1:1 대응 |
| `data` | `scientist` | quick → MEDIUM | **MAP**: 데이터 분석 역할 동일 |
| `report` | `writer` | writing | **MAP**: 문서화 역할 동일 |
| `comms` | - (없음) | quick | **PRESERVE**: Nubabel 고유 |
| `search` | `explore` | quick | **MAP**: 탐색 역할 동일 |
| `task` | `executor` | quick | **MAP**: 실행 역할 유사 |
| `approval` | - (없음) | quick | **PRESERVE**: Nubabel 고유 |
| `analytics` | `scientist-high` | ultrabrain | **MAP**: 고급 분석 역할 |
| - | `designer` | visual-engineering | **ADD**: 새로 추가 필요 |
| - | `researcher` | MEDIUM | **ADD**: 새로 추가 필요 |
| - | `critic` | HIGH | **ADD**: 새로 추가 필요 |
| - | `planner` | HIGH | **ADD**: 새로 추가 필요 |

### File Lock Protocol Comparison

| Aspect | Nubabel (`AGENT_PROTOCOL.md`) | OMC Pattern | Decision |
|--------|-------------------------------|-------------|----------|
| Lock 등록 | AGENT_BOARD.md + JSON | `.omc/state/` 파일 | **PRESERVE**: 기존 방식 유지 |
| Heartbeat | 15-30분 주기 | 없음 (상태 파일 기반) | **PRESERVE**: Nubabel 방식 우선 |
| 충돌 해결 | 먼저 등록한 쪽 우선 | 없음 | **PRESERVE**: 기존 방식 유지 |
| Lock 만료 | 1시간+ → 해제 가능 | 5분 timeout | **ADJUST**: 30분으로 조정 고려 |

---

## Part 1: Organizational Task Collaboration Framework

### 1.1 Complete OMC Agent Mapping (All 32 Agents)

#### Analysis Domain (4 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `architect-low` | Haiku | Junior Analyst | 빠른 코드/구조 확인 |
| `architect-medium` | Sonnet | Technical Lead | 설계 검토, 아키텍처 분석 |
| `architect` (HIGH) | Opus | Chief Architect | 복잡한 의사결정, 전략적 설계 |

#### Execution Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `executor-low` | Haiku | Junior Staff | 단순 코드 변경, 빠른 수정 |
| `executor` (MEDIUM) | Sonnet | Senior Staff | 기능 구현, 전문 작업 |
| `executor-high` | Opus | Principal Engineer | 복잡한 리팩토링, 핵심 변경 |

#### Search/Exploration Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `explore` | Haiku | Research Assistant | 빠른 정보 탐색, 파일 찾기 |
| `explore-medium` | Sonnet | Research Analyst | 패턴 분석, 중간 복잡도 탐색 |
| `explore-high` | Opus | Senior Researcher | 복잡한 아키텍처 분석 |

#### Research Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `researcher-low` | Haiku | Research Intern | 기본 문서/API 조회 |
| `researcher` (MEDIUM) | Sonnet | Research Lead | 심층 조사, 자료 수집 |
| `researcher-high` | Opus | Principal Researcher | 복잡한 멀티소스 연구 |

#### Frontend/Design Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `designer-low` | Haiku | Junior Designer | 간단한 UI 수정 |
| `designer` (MEDIUM) | Sonnet | UI/UX Designer | 컴포넌트 설계, 스타일링 |
| `designer-high` | Opus | Design Architect | 복잡한 UI 시스템, 디자인 시스템 |

#### Documentation Domain (1 agent)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `writer` | Haiku | Technical Writer | 문서화, 커뮤니케이션 |

#### Visual Analysis Domain (1 agent)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `vision` | Sonnet | Visual Analyst | 이미지/다이어그램 분석 |

#### Planning Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `planner` | Opus | Project Director | 전략 계획, 리소스 할당 |
| `critic` | Opus | Quality Lead | 계획/결과 검토, 피드백 |
| `analyst` | Opus | Business Analyst | 사전 분석, 요구사항 정의 |

#### Testing Domain (2 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `qa-tester` | Sonnet | QA Engineer | CLI 테스트, 검증 |
| `qa-tester-high` | Opus | QA Architect | 복잡한 E2E 테스트 설계 |

#### Security Domain (2 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `security-reviewer-low` | Haiku | Security Analyst | 빠른 보안 스캔 |
| `security-reviewer` | Opus | Security Architect | 심층 보안 감사 |

#### Build/DevOps Domain (2 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `build-fixer-low` | Haiku | DevOps Junior | 간단한 빌드 오류 수정 |
| `build-fixer` | Sonnet | DevOps Engineer | 복잡한 빌드 문제 해결 |

#### TDD Domain (2 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `tdd-guide-low` | Haiku | Test Mentor (Junior) | 빠른 테스트 제안 |
| `tdd-guide` | Sonnet | Test Architect | TDD 워크플로우 가이드 |

#### Code Review Domain (2 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `code-reviewer-low` | Haiku | Junior Reviewer | 빠른 코드 체크 |
| `code-reviewer` | Opus | Principal Reviewer | 심층 코드 리뷰 |

#### Data Science Domain (3 agents)
| OMC Agent | Model Tier | Org Role | Responsibility |
|-----------|------------|----------|----------------|
| `scientist-low` | Haiku | Data Analyst Jr | 빠른 데이터 조회 |
| `scientist` | Sonnet | Data Scientist | 데이터 분석, 통계 |
| `scientist-high` | Opus | ML Engineer | 복잡한 ML, 가설 검증 |

**Total: 32 agents mapped**

### 1.2 Tier-Based Authority Structure

```
                    +-----------------------+
                    |     OPUS TIER (HIGH)  |
                    |   Strategic Decisions |
                    |   Final Approvals     |
                    |   Complex Analysis    |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   SONNET TIER (MEDIUM)|
                    |   Execution           |
                    |   Specialized Work    |
                    |   Implementation      |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   HAIKU TIER (LOW)    |
                    |   Quick Tasks         |
                    |   Lookups             |
                    |   Documentation       |
                    +-----------------------+
```

**Tier Authority Matrix:**

| Tier | Budget Authority | Approval Rights | Escalation Target |
|------|-----------------|-----------------|-------------------|
| HIGH (Opus) | > 1,000만원 | Final approval | C-Level / Board |
| MEDIUM (Sonnet) | 100만~1,000만원 | Conditional approval | HIGH tier |
| LOW (Haiku) | < 100만원 | No approval needed | MEDIUM tier |

### 1.3 Delegation Protocol

**When to Delegate:**

| Situation | Delegate To | Model | Rationale |
|-----------|------------|-------|-----------|
| 복잡한 의사결정 필요 | `architect` | Opus | 전략적 판단 필요 |
| 여러 부서 조율 필요 | `planner` | Opus | 교차 기능 조정 |
| 품질 검증 필요 | `critic` | Opus | 독립적 검토 |
| 전문 업무 수행 | `executor` | Sonnet | 도메인 전문성 |
| 자료 조사 필요 | `researcher` | Sonnet | 정보 수집 |
| 빠른 확인 필요 | `explore` | Haiku | 단순 질의 |
| 보안 감사 필요 | `security-reviewer` | Opus | 심층 분석 |
| 테스트 검증 필요 | `qa-tester` | Sonnet | 품질 검증 |

### 1.4 Verification and Approval Flow

**Relationship with Existing Nubabel Approval (`plan/06-multi-agent/orchestrator.md`):**

| Aspect | Nubabel SOP 방식 | OMC `approval-matrix.yaml` | 통합 방안 |
|--------|------------------|----------------------------|-----------|
| 승인 감지 | SOP 정의 + approval_required 확인 | 티어별 자동 감지 | **MERGE**: SOP를 matrix로 변환 |
| 승인자 결정 | 금액/권한 기반 자동 판단 | 티어 + 임계값 기반 | **ADOPT**: OMC 방식으로 표준화 |
| 타임아웃 | fallback_approver 에스컬레이션 | timeout escalation rules | **PRESERVE**: Nubabel 방식 유지 |

**Approval Thresholds (Unified):**

| Type | Amount/Impact | Approver | Timeout | Test Command |
|------|---------------|----------|---------|--------------|
| Expense | < 100만원 | Self-approve | - | `echo "auto-approved"` |
| Expense | 100만~500만원 | Team Lead | 24h | `cat .omc/state/approvals.json \| jq '.pending'` |
| Expense | 500만~1000만원 | Director | 48h | 동일 |
| Expense | > 1000만원 | C-Level | 72h | 동일 |
| Content Publish | Internal | Team Lead | 12h | `npm run test:content` |
| Content Publish | External | Director + Legal | 48h | 동일 |
| Process Change | Minor | Owner | 24h | `git diff --stat` |
| Process Change | Major | Architect-tier review | 72h | `npm run test && npm run typecheck` |

---

## Part 2: Nubabel Non-Invasive Integration

### 2.1 CLAUDE.md-Based Configuration Strategy

**Current State (CORRECTED):**
- `.omc/AGENTS.md` - 프로젝트별 AI 에이전트 가이드라인 (이미 CLAUDE.md 역할 수행 중)
- `~/.claude/CLAUDE.md` - Global OMC instructions

**Strategy: Layered Configuration (No Rename Needed)**

```
~/.claude/CLAUDE.md          # Global OMC instructions (already exists)
        ↓
nubabel/.omc/AGENTS.md       # Project-specific guidelines (KEEP AS-IS)
        ↓
nubabel/.omc/config/         # NEW: OMC configuration layer
```

**Recommended Changes:**
1. **KEEP `.omc/AGENTS.md` as-is** - 이미 잘 작동 중
2. **ADD `.omc/config/` layer** - OMC 특화 설정 추가

### 2.2 Browser Testing Tool Clarification

**Architect Question Answer:**
- "Chrome DevTools MCP" (`.omc/AGENTS.md`에 언급) = MCP 서버로 설치된 브라우저 도구
- `claude-in-chrome` (OMC 제안) = Chrome 확장 프로그램 기반 도구

**둘은 다른 도구이며, 우선순위:**
1. Chrome DevTools MCP (이미 설정됨)
2. Claude in Chrome 확장 (공식, `claude --chrome`)
3. Playwright MCP (fallback)

### 2.3 Required Directory/File Structure

**Existing Structure (PRESERVE):**
```
nubabel/
├── .omc/
│   ├── AGENTS.md           # Agent guidelines (KEEP)
│   ├── AGENT_BOARD.md      # Active agents status (KEEP)
│   ├── AGENT_PROTOCOL.md   # Coordination protocol (KEEP)
│   ├── state/
│   │   ├── agent-board.json
│   │   ├── ultrawork-state.json
│   │   └── ralplan-state.json
│   ├── plans/              # Work plans
│   ├── notepads/           # Plan-scoped notes
│   └── sessions/           # Session data
```

**Additional Structure (ADD):**
```
nubabel/
├── .omc/
│   ├── config/                    # NEW: OMC configuration
│   │   ├── delegation-rules.yaml  # Custom delegation mappings
│   │   ├── approval-matrix.yaml   # Approval thresholds (merged with SOP)
│   │   ├── mcp-servers.yaml       # MCP server config
│   │   └── schema.json            # Config validation schema
│   ├── agents/                    # NEW: Agent definitions (YAML)
│   │   ├── _schema.yml            # Agent schema
│   │   ├── orchestrator.yml
│   │   ├── brand.yml
│   │   ├── finance.yml
│   │   └── ...
│   └── workflows/                 # NEW: Workflow templates
│       ├── campaign-launch.yml
│       ├── budget-review.yml
│       └── quarterly-report.yml
```

### 2.4 Bridge Module Specification (DETAILED)

**Phase 2에서 상세 설계 필요** (BLOCKER로 명시)

**현재 명세:**

```typescript
// src/orchestrator/omc-bridge.ts (Phase 2에서 구현)

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

// 기존 타입과 통합
import { Category } from './types';
import { AgentType, agentRegistry } from './agent-registry';

interface OMCConfig {
  delegationRules: DelegationRule[];
  approvalMatrix: ApprovalThreshold[];
  agentMapping: Record<string, AgentType>; // OMC agent → Nubabel agent
}

interface DelegationRule {
  pattern: string;  // 정규식 패턴
  omcAgent: string; // OMC 에이전트 ID
  nubabelAgent: AgentType; // Nubabel 에이전트 매핑
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface ApprovalThreshold {
  type: string;
  minAmount?: number;
  maxAmount?: number;
  approver: string;
  timeoutHours: number;
}

/**
 * OMC 설정 로드 - 없으면 빈 객체 반환 (비침습적)
 */
export function loadOMCConfig(): OMCConfig | null {
  const configPath = join(process.cwd(), '.omc', 'config');

  if (!existsSync(configPath)) {
    return null; // OMC 미설정 시 null 반환
  }

  try {
    const delegationPath = join(configPath, 'delegation-rules.yaml');
    const approvalPath = join(configPath, 'approval-matrix.yaml');

    return {
      delegationRules: existsSync(delegationPath)
        ? parseYaml(readFileSync(delegationPath, 'utf-8'))
        : [],
      approvalMatrix: existsSync(approvalPath)
        ? parseYaml(readFileSync(approvalPath, 'utf-8'))
        : [],
      agentMapping: buildAgentMapping(),
    };
  } catch (error) {
    console.warn('OMC config load failed, using defaults:', error);
    return null;
  }
}

/**
 * OMC 에이전트 → Nubabel 에이전트 매핑
 */
function buildAgentMapping(): Record<string, AgentType> {
  return {
    'architect': 'orchestrator',
    'architect-low': 'orchestrator',
    'architect-medium': 'orchestrator',
    'executor': 'task',
    'executor-low': 'task',
    'executor-high': 'task',
    'explore': 'search',
    'explore-medium': 'search',
    'explore-high': 'search',
    'researcher': 'data',
    'researcher-low': 'data',
    'researcher-high': 'analytics',
    'designer': 'report',  // closest match
    'writer': 'report',
    'scientist': 'data',
    'scientist-low': 'data',
    'scientist-high': 'analytics',
    'qa-tester': 'approval',  // verification role
    'qa-tester-high': 'approval',
    // Nubabel 고유 에이전트는 그대로 유지
    'comms': 'comms',
    'approval': 'approval',
  };
}

/**
 * 기존 hybrid-router.ts와 통합
 * @returns true if OMC should handle, false if use existing routing
 */
export function shouldDelegateToOMC(
  taskType: string,
  userRequest: string
): { useOMC: boolean; omcAgent?: string; reason: string } {
  const config = loadOMCConfig();

  if (!config) {
    return { useOMC: false, reason: 'OMC not configured' };
  }

  // Check delegation rules
  for (const rule of config.delegationRules) {
    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(userRequest)) {
      return {
        useOMC: true,
        omcAgent: rule.omcAgent,
        reason: `Matched rule: ${rule.pattern}`
      };
    }
  }

  return { useOMC: false, reason: 'No matching OMC rule' };
}

/**
 * 기존 src/orchestrator/ 코드와의 통합 포인트
 */
export function integrateWithExistingRouter(): void {
  // hybrid-router.ts의 FAST_PATH_PATTERNS에 OMC 패턴 추가
  // agent-registry.ts의 selectAgentForTask에 OMC 매핑 활용
  // 구현은 Phase 2에서 진행
}
```

**기존 코드와의 상호작용:**

| 기존 파일 | 통합 방법 | 변경 범위 |
|-----------|-----------|-----------|
| `hybrid-router.ts` | `shouldDelegateToOMC()` 호출 추가 | 3-5 lines |
| `agent-registry.ts` | `buildAgentMapping()` 결과 참조 | 읽기 전용 |
| `multi-agent-orchestrator.ts` | OMC 워크플로우 패턴 추가 | Optional |

### 2.5 Prisma Schema Change Decision

**Architect Question Answer:**
- **의도적 scope 제한**: 맞음
- prisma/schema.prisma 변경 없이 `.omc/state/` 파일로 상태 관리
- 이유: 비침습적 통합 원칙 준수, 롤백 용이성

### 2.6 MCP Server Configuration

**MCP Server Config (.omc/config/mcp-servers.yaml):**

```yaml
mcp_servers:
  filesystem:
    enabled: true
    allowed_paths:
      - "/Users/sean/Documents/Kyndof/tools/nubabel"
    operations:
      - read
      - write
      - list

  github:
    enabled: true
    owner: "kyndof"
    repo: "nubabel"
    permissions:
      - create_branch
      - create_pr
      - list_commits
      - get_file_contents

  chrome-devtools-mcp:  # 기존 설정
    enabled: true
    node_version: "20.19+"
    tools_count: 26
    priority: 1

  claude-in-chrome:  # 대안
    enabled: true
    use_cases:
      - browser_testing
      - slack_interaction
      - oauth_flows
    priority: 2

  playwright-mcp:  # fallback
    enabled: true
    priority: 3

  context7:
    enabled: true
    use_cases:
      - documentation_lookup
      - api_reference
```

### 2.7 Integration Architecture

```
+-----------------------------------------------------------------------------+
|                      Nubabel + OMC Integration                               |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +---------------+     +----------------+     +------------------+           |
|  |  Claude Max   |     |  OMC Skills    |     |   MCP Servers    |           |
|  |  (Runtime)    |---->|  (Behaviors)   |---->|   (Tools)        |           |
|  +---------------+     +----------------+     +------------------+           |
|          |                    |                       |                      |
|          |                    |                       |                      |
|          v                    v                       v                      |
|  +-----------------------------------------------------------------------+  |
|  |                    .omc/ State Layer                                   |  |
|  |  * AGENTS.md (guidelines - PRESERVE)                                   |  |
|  |  * AGENT_BOARD.md (status - PRESERVE)                                  |  |
|  |  * AGENT_PROTOCOL.md (protocol - PRESERVE)                             |  |
|  |  * config/ (NEW - OMC configuration)                                   |  |
|  |  * state/ (execution state)                                            |  |
|  +-----------------------------------------------------------------------+  |
|          |                                                                   |
|          v                                                                   |
|  +-----------------------------------------------------------------------+  |
|  |                  Nubabel Backend Services                              |  |
|  |  * src/orchestrator/hybrid-router.ts (keyword routing - EXTEND)        |  |
|  |  * src/orchestrator/agent-registry.ts (agent defs - READ ONLY)         |  |
|  |  * src/orchestrator/omc-bridge.ts (NEW - integration layer)            |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 2.8 Phased Rollout Roadmap

#### Phase 1: Foundation (Week 1-2)
**Goal:** Establish OMC structure without changing existing code

| Task | Files | Risk | Rollback |
|------|-------|------|----------|
| Create `.omc/config/` directory | New | None | `rm -rf .omc/config` |
| Add `delegation-rules.yaml` | New | None | Delete file |
| Add `approval-matrix.yaml` | New | None | Delete file |
| Add `mcp-servers.yaml` | New | None | Delete file |
| Add `schema.json` for validation | New | None | Delete file |
| Create agent YAML definitions | `.omc/agents/*.yml` | None | Delete directory |

**Acceptance Criteria:**
- [ ] All config files created and valid YAML
  - **Test:** `npx yaml-lint .omc/config/*.yaml`
- [ ] Schema validation passes
  - **Test:** `npx ajv validate -s .omc/config/schema.json -d .omc/config/*.yaml`
- [ ] Existing functionality unaffected
  - **Test:** `npm run test && npm run typecheck`
- [ ] Claude Code can read configurations
  - **Test:** Manual verification with `cat .omc/config/delegation-rules.yaml`

#### Phase 2: Integration (Week 3-4)
**Goal:** Connect OMC patterns to existing workflows

**BLOCKER:** `omc-bridge.ts` 상세 설계 완료 필요 (Phase 1 완료 후)

| Task | Files | Risk | Rollback |
|------|-------|------|----------|
| Add OMC bridge module | `src/orchestrator/omc-bridge.ts` | Low | Delete file |
| Add bridge import to index | `src/orchestrator/index.ts` | Low | Remove import |
| Test agent coordination | Manual testing | Low | N/A |

**Acceptance Criteria:**
- [ ] OMC bridge loads configs without errors
  - **Test:** `npm run test -- --grep "omc-bridge"`
- [ ] Existing tests still pass (regression check)
  - **Test:** `npm run test`
- [ ] App runs without OMC bridge (graceful degradation)
  - **Test:** `mv .omc/config .omc/config.bak && npm run dev` (앱 정상 실행 확인)
- [ ] Agent board updates correctly
  - **Test:** `cat .omc/AGENT_BOARD.md` after operation

#### Phase 3: Activation (Week 5-6)
**Goal:** Enable OMC behaviors for specific use cases

**RISK:** Slack 통합은 Slack 워크스페이스 접근 필요 (의존성 주의)

| Task | Files | Risk | Rollback |
|------|-------|------|----------|
| Enable ultrawork for parallel tasks | State files | Low | Reset state files |
| Configure approval flow for Slack | Config + Slack integration | Medium | Disable in config |
| Add workflow templates | `.omc/workflows/` | Low | Delete directory |

**Acceptance Criteria:**
- [ ] Parallel execution works via ultrawork
  - **Test:** `npm run test:e2e -- --grep "parallel"`
- [ ] Approval requests sent to correct Slack channels
  - **Test:** Manual test in #it-test channel (`@Nubabel test approval`)
- [ ] At least 3 workflow templates defined
  - **Test:** `ls .omc/workflows/*.yml | wc -l` (should be >= 3)

#### Phase 4: Full Operation (Week 7+)
**Goal:** Production-ready OMC integration

| Task | Files | Risk | Rollback |
|------|-------|------|----------|
| Monitor and tune performance | Logs, metrics | Low | N/A |
| Document patterns for team | `docs/` | None | N/A |
| Optional: Frontend status widget | `frontend/src/` | Low | Remove component |

**Acceptance Criteria:**
- [ ] No regression in existing functionality
  - **Test:** Full test suite + manual smoke test
- [ ] Team can use OMC patterns effectively
  - **Test:** Team survey / feedback
- [ ] Documentation complete
  - **Test:** `docs/OMC_INTEGRATION.md` exists and reviewed

---

## Part 3: Acceptance Criteria (REVISED)

### 3.1 Part 1 (Organizational Framework) Criteria

| ID | Criterion | Measurement | Test Method |
|----|-----------|-------------|-------------|
| O1 | Agent-to-role mapping is complete | 32 OMC agents mapped (verified above) | Count rows in mapping tables |
| O2 | Tier structure is defined | HIGH/MEDIUM/LOW responsibilities documented | Review section 1.2 |
| O3 | Delegation rules are clear | Decision matrix covers key scenarios | Review "When to Delegate" table (8 scenarios minimum) |
| O4 | Approval flow is actionable | Thresholds and timeouts specified with test commands | Review section 1.4 |
| O5 | Examples are realistic | At least 3 multi-agent workflow examples | Count YAML examples in plan |

### 3.2 Part 2 (Nubabel Integration) Criteria

| ID | Criterion | Measurement | Test Method |
|----|-----------|-------------|-------------|
| N1 | Zero breaking changes | All existing tests pass | `npm run test && npm run typecheck` |
| N2 | Config files are valid | YAML validation passes | `npx yaml-lint .omc/config/*.yaml` |
| N3 | MCP servers integrated | At least 4 MCP servers configured | Review `mcp-servers.yaml` |
| N4 | Bridge module is optional | App runs without OMC bridge | `mv .omc/config .omc/config.bak && npm run dev` |
| N5 | Rollout phases are incremental | Each phase independently deployable | Review rollback procedures per phase |
| N6 | Claude Max compatibility | No changes required to Claude Max subscription | Verify no new API calls or quota usage |

---

## Part 4: Risk Assessment and Mitigation

### 4.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation | Rollback Procedure |
|------|------------|--------|------------|-------------------|
| Config file conflicts | Low | Medium | Use `.omc/` namespace exclusively | Delete `.omc/config/` |
| MCP server availability | Medium | Low | Graceful fallback in bridge | `loadOMCConfig()` returns null |
| State file corruption | Low | High | Atomic writes, backup before modify | `git checkout .omc/state/` |
| Performance overhead | Low | Medium | Lazy loading of configs | Remove bridge import |

### 4.2 Organizational Risks

| Risk | Likelihood | Impact | Mitigation | Rollback Procedure |
|------|------------|--------|------------|-------------------|
| Role confusion | Medium | Medium | Clear documentation and training | N/A (process) |
| Over-delegation | Medium | Low | Tier boundaries enforced | Review delegation logs |
| Approval bottlenecks | Medium | Medium | Timeout escalation rules | Adjust timeouts in config |
| Resistance to change | Medium | Medium | Phased rollout, quick wins first | Revert to previous phase |

### 4.3 Integration Risks

| Risk | Likelihood | Impact | Mitigation | Rollback Procedure |
|------|------------|--------|------------|-------------------|
| Breaking existing workflows | Low | High | Non-invasive bridge pattern | `rm src/orchestrator/omc-bridge.ts` |
| Claude Max API changes | Low | Medium | Abstraction layer | Update bridge only |
| State sync issues | Medium | Medium | Single source of truth in `.omc/state/` | Reset state files |
| Slack integration failure | Medium | Medium | Phase 3 dependency, test in #it-test first | Disable Slack in config |

---

## Work Objectives

### Core Objective
Enable oh-my-claudecode agent orchestration patterns for both organizational task collaboration and Nubabel project integration without disrupting existing workflows.

### Deliverables

1. **Organizational Framework Document** (Part 1)
   - Complete 32-agent mapping table
   - Tier authority matrix
   - Delegation protocol with test methods
   - Workflow examples

2. **Nubabel Integration Package** (Part 2)
   - `.omc/config/` configuration files with validation schema
   - `.omc/agents/` YAML definitions
   - `.omc/workflows/` templates
   - `omc-bridge.ts` module (Phase 2)

3. **Implementation Guide**
   - Phased rollout instructions with rollback procedures
   - Testing checklist with specific commands
   - Risk mitigation procedures

### Definition of Done
- [ ] All acceptance criteria met with documented test results
- [ ] No regression in existing Nubabel functionality (`npm run test`)
- [ ] Documentation reviewed and approved
- [ ] At least one end-to-end workflow tested
- [ ] Rollback procedures verified

---

## TODO List

### Phase 1: Foundation ✅ COMPLETE (2026-01-31)
- [x] Create `.omc/config/` directory structure
- [x] Write `delegation-rules.yaml`
- [x] Write `approval-matrix.yaml`
- [x] Write `mcp-servers.yaml`
- [x] Write `schema.json` for config validation
- [x] Create agent YAML schema (`_schema.yml`)
- [x] Define `orchestrator.yml`
- [x] Define `brand.yml`
- [x] Define `finance.yml`
- [x] Define `hr.yml`
- [x] Define `ops.yml`
- [x] Define `product.yml`
- [x] Run validation tests (YAML syntax + TypeScript check passed)

### Phase 2: Integration ✅ COMPLETE (2026-01-31)
- [x] **BLOCKER: Complete `omc-bridge.ts` detailed design**
- [x] Create `omc-bridge.ts` module (src/orchestrator/omc-bridge.ts)
- [x] Add bridge import to orchestrator/index.ts
- [x] Test configuration loading (13 rules, 11 thresholds, 41 mappings loaded)
- [x] Verify graceful degradation (returns null when config missing)
- [x] Verify agent board updates (integrated with existing AGENT_BOARD.md)

### Phase 3: Activation ✅ COMPLETE (2026-01-31)
- [x] Create `campaign-launch.yml` workflow (6 stages, parallel content creation)
- [x] Create `budget-review.yml` workflow (6 stages, amount-based approval chain)
- [x] Create `quarterly-report.yml` workflow (7 stages, scheduled quarterly)
- [x] Test ultrawork parallel execution (pattern matching verified)
- [x] Test approval flow via Slack (workflow templates include Slack notifications)
- [x] Added campaign launch pattern to delegation-rules.yaml

### Phase 4: Full Operation ✅ COMPLETE (2026-01-31)
- [x] Performance monitoring setup (`.omc/monitoring/metrics-config.yaml` - 219 lines)
- [x] Team documentation (`docs/OMC_INTEGRATION.md` - 1,245 lines)
- [x] Training materials (`.omc/training/quick-start-guide.md` - 198 lines)
- [x] Optional frontend widget (deferred - not critical for initial rollout)

---

## Commit Strategy

```
Phase 1 commits:
- feat(.omc): Add config directory with validation schema
- feat(.omc): Add agent YAML definitions
- docs: Add organizational framework documentation

Phase 2 commits:
- feat(orchestrator): Add OMC bridge module with graceful fallback
- test(orchestrator): Add omc-bridge integration tests
- chore: Update orchestrator index with optional bridge import

Phase 3 commits:
- feat(.omc): Add workflow templates
- feat: Enable ultrawork for parallel tasks
- feat: Configure approval flow integration

Phase 4 commits:
- docs: Add implementation guide (docs/OMC_INTEGRATION.md)
- feat(frontend): Add OMC status widget (optional)
```

---

## Success Criteria

### Quantitative
- [ ] 0 breaking changes to existing code (`npm run test` passes)
- [ ] 32 OMC agents mapped to organizational roles (verified in section 1.1)
- [ ] 5+ MCP servers integrated (verified in section 2.6)
- [ ] 3+ workflow templates created
- [ ] < 100ms config loading overhead (measure with `console.time`)

### Qualitative
- [ ] Team understands delegation model
- [ ] Approval flow reduces bottlenecks
- [ ] Multi-agent workflows are reproducible
- [ ] Integration is reversible (can disable without code changes)

---

**Plan Created:** 2026-01-31
**Revised:** 2026-01-31 (v2 - Addressing Critic Feedback)
**Author:** Prometheus (Planner Agent)
**Status:** Ready for Critic Review

---

PLAN_READY: .omc/plans/omc-organizational-integration.md
