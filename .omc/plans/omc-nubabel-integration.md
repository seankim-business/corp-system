# OMC-Nubabel 통합 전략 계획

## Context

### Original Request
oh-my-claudecode(OMC)와 Nubabel 간 연동 가능성 연구 및 통합 전략 기획

### Research Summary

**OMC (oh-my-claudecode)**
- 로컬 CLI 기반 멀티 에이전트 오케스트레이션 시스템
- 32개 에이전트 (11 도메인 x 3 티어: haiku/sonnet/opus)
- 38개 스킬 (SKILL.md 선언적 정의, 키워드 자동 감지)
- 파일 기반 상태 관리 (`.omc/state/*.json`)
- MCP 서버: omc-tools-server (15개 도구)

**Nubabel**
- 서버 SaaS 기반 AI 오케스트레이션 플랫폼
- 11개 YAML 정의 에이전트
- PostgreSQL + Prisma 상태 관리
- Slack 중심 사용자 인터페이스
- 비용 관리 및 승인 시스템 내장

### Technical Synergies
1. 동일한 키워드 기반 라우팅 패턴
2. 에이전트 티어링 개념 공유
3. 병렬 실행 아키텍처
4. MCP 프로토콜 호환성

---

## Work Objectives

### Core Objective
OMC의 강력한 코드 작업 에이전트와 Nubabel의 엔터프라이즈 기능(비용 관리, 승인 시스템, Slack 통합)을 결합하여 개발자 생산성과 조직 통제력을 모두 확보하는 통합 플랫폼 구축

### Deliverables
1. **통합 아키텍처 설계서**: 양 시스템 연동을 위한 기술 구조
2. **MCP 브릿지 명세**: OMC 도구를 Nubabel에서 호출하는 인터페이스
3. **에이전트 변환 매퍼**: YAML <-> Markdown 에이전트 정의 상호 변환
4. **통합 오케스트레이터 설계**: 두 시스템을 조율하는 메타 레이어
5. **단계별 구현 로드맵**: 우선순위화된 작업 계획

### Definition of Done
- [ ] 아키텍처 설계 문서 완성
- [ ] PoC 구현 범위 명확히 정의
- [ ] 리스크 평가 및 완화 전략 수립
- [ ] 각 단계별 예상 공수 산정

---

## Guardrails

### MUST Have
- 기존 Nubabel 기능 완전 보존 (breaking change 금지)
- 기존 OMC 독립 실행 가능성 유지
- 보안: 인증/인가 통합 (조직별 격리)
- 비용 추적 연속성 (OMC 호출도 Nubabel 비용에 포함)

### MUST NOT Have
- OMC를 Nubabel에 완전 내장 (의존성 과다)
- Nubabel 코드베이스 대규모 리팩토링 요구
- 외부 서비스 직접 노출 (MCP 서버 공개 등)

---

## Integration Scenarios

### Scenario A: OMC as Nubabel Backend (Primary)
```
User (Slack)
  -> Nubabel Orchestrator
    -> OMC Skill/Agent (via MCP Bridge)
      -> Execution Result
    -> Nubabel Response Formatter
  -> User
```

**Use Case**: "코드 리뷰해줘" -> Nubabel이 OMC의 code-reviewer 에이전트 호출

### Scenario B: Nubabel as OMC Extension
```
User (Claude Code)
  -> OMC Orchestrator
    -> Nubabel API (external tool)
      -> Notion/Slack/Calendar 작업
    -> OMC Result
  -> User
```

**Use Case**: "내일 일정 확인해줘" -> OMC가 Nubabel의 Google Calendar 에이전트 호출

### Scenario C: Unified Orchestration Layer
```
User (Any Interface)
  -> Meta Orchestrator
    -> Route to OMC (code tasks)
    -> Route to Nubabel (business tasks)
    -> Merge Results
  -> User
```

**Use Case**: "PR 만들고 팀에 알려줘" -> GitHub(OMC) + Slack(Nubabel) 병렬 실행

---

## Technical Architecture

### Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Unified     │  │ Skill       │  │ Cost                │ │
│  │ Auth        │  │ Registry    │  │ Aggregator          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ OMC Runtime     │  │ MCP Bridge      │  │ Nubabel Runtime │
│ (Local/Remote)  │  │                 │  │ (Server)        │
│                 │  │ - Tool Proxy    │  │                 │
│ - 32 Agents     │◄─┤ - Auth Inject   │─►│ - 11 Agents     │
│ - 38 Skills     │  │ - Cost Track    │  │ - OAuth Tokens  │
│ - omc-tools     │  │ - Rate Limit    │  │ - Budget System │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Flow

```
1. Request Entry
   Slack/CLI -> Nubabel API -> Unified Router

2. Skill Resolution
   Unified Router -> Skill Registry
   - Check OMC skills (code/dev domain)
   - Check Nubabel skills (business domain)
   - Return best match with metadata

3. Execution Routing
   If OMC skill:
     -> MCP Bridge -> OMC Runtime -> Result
   If Nubabel skill:
     -> Nubabel Executor -> Result
   If Hybrid:
     -> Parallel execution -> Merge results

4. Response & Tracking
   Result -> Cost Aggregator -> Response Formatter -> User
```

### Interface Definitions

#### MCP Bridge Server (New Component)
```typescript
// src/mcp-servers/omc-bridge/index.ts
interface OmcBridgeConfig {
  omcEndpoint: string;      // OMC runtime (local or remote)
  authStrategy: 'jwt' | 'api-key';
  costTrackingEnabled: boolean;
  allowedSkills: string[];  // Whitelist
  rateLimitPerMinute: number;
}

interface OmcToolCall {
  tool: string;             // e.g., "lsp_diagnostics"
  params: Record<string, unknown>;
  organizationId: string;
  userId: string;
  budgetContext: {
    remaining: number;
    warningThreshold: number;
  };
}
```

#### Skill Registry (Enhancement)
```typescript
// src/orchestrator/unified-skill-registry.ts
interface UnifiedSkill {
  name: string;
  source: 'omc' | 'nubabel' | 'hybrid';
  keywords: string[];
  priority: number;

  // OMC-specific
  omcSkillPath?: string;    // e.g., "autopilot", "ralph"
  omcAgents?: string[];     // Required agents

  // Nubabel-specific
  nubabelAgentId?: string;
  nubabelTools?: string[];

  // Routing metadata
  requiresAuth: boolean;
  estimatedCost: 'low' | 'medium' | 'high';
  maxDuration: number;
}
```

#### Agent Definition Converter
```typescript
// src/utils/agent-converter.ts

// OMC Markdown -> Nubabel YAML
function convertOmcToNubabel(markdownPath: string): NubabelAgentYaml;

// Nubabel YAML -> OMC Markdown
function convertNubabelToOmc(yamlConfig: NubabelAgentYaml): string;

// Mapping table
const AGENT_MAPPING = {
  'oh-my-claudecode:executor': 'task-executor',
  'oh-my-claudecode:architect': 'code-analyzer',
  'oh-my-claudecode:designer': 'ui-specialist',
  // ...
};
```

---

## Task Flow

### Phase 1: Foundation (Week 1-2)
```
[1.1] MCP Bridge 기본 구조
  └─[1.2] OMC 도구 프록시 구현
       └─[1.3] 인증 레이어 통합
            └─[1.4] 기본 비용 추적
```

### Phase 2: Skill Integration (Week 3-4)
```
[2.1] Unified Skill Registry 설계
  ├─[2.2] OMC 스킬 메타데이터 추출
  ├─[2.3] 키워드 라우팅 통합
  └─[2.4] 스킬 우선순위 로직
```

### Phase 3: Agent Interoperability (Week 5-6)
```
[3.1] Agent 정의 변환기
  ├─[3.2] OMC -> Nubabel 변환
  ├─[3.3] Nubabel -> OMC 변환
  └─[3.4] 양방향 호출 테스트
```

### Phase 4: Advanced Features (Week 7-8)
```
[4.1] 하이브리드 실행 오케스트레이터
  ├─[4.2] 병렬 실행 코디네이터
  ├─[4.3] 결과 병합 로직
  └─[4.4] 에러 핸들링 통합
```

---

## Detailed TODOs

### Phase 1: Foundation

#### TODO 1.1: MCP Bridge Server 기본 구조
**Priority**: P0 (Critical Path)
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] `src/mcp-servers/omc-bridge/` 디렉토리 생성
- [ ] MCP 서버 기본 프레임워크 (stdio/SSE)
- [ ] Health check 엔드포인트
- [ ] 설정 로더 (환경변수 기반)

**Files to Create/Modify**:
- `src/mcp-servers/omc-bridge/index.ts`
- `src/mcp-servers/omc-bridge/config.ts`
- `src/mcp-servers/omc-bridge/types.ts`

#### TODO 1.2: OMC 도구 프록시 구현
**Priority**: P0
**Estimated**: 3 days
**Acceptance Criteria**:
- [ ] omc-tools 15개 도구 목록 하드코딩
- [ ] Tool call -> OMC Runtime 포워딩
- [ ] Response normalization
- [ ] Timeout 처리 (30초 기본)

**Files to Create/Modify**:
- `src/mcp-servers/omc-bridge/tools/proxy.ts`
- `src/mcp-servers/omc-bridge/tools/registry.ts`

#### TODO 1.3: 인증 레이어 통합
**Priority**: P0
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] Nubabel JWT 토큰 검증
- [ ] organizationId/userId 추출
- [ ] OMC 호출에 컨텍스트 주입
- [ ] 인증 실패 시 적절한 에러 응답

**Files to Modify**:
- `src/mcp-servers/omc-bridge/middleware/auth.ts`
- `src/middleware/auth.middleware.ts` (공통 로직 추출)

#### TODO 1.4: 기본 비용 추적
**Priority**: P1
**Estimated**: 1 day
**Acceptance Criteria**:
- [ ] OMC 도구 호출 시 토큰 사용량 추정
- [ ] CostTracker 서비스에 기록
- [ ] 예산 초과 시 경고/차단 옵션

**Files to Modify**:
- `src/services/cost-tracker.ts` (확장)
- `src/mcp-servers/omc-bridge/middleware/cost.ts`

---

### Phase 2: Skill Integration

#### TODO 2.1: Unified Skill Registry 설계
**Priority**: P0
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] 통합 스킬 인터페이스 정의
- [ ] 스킬 소스(omc/nubabel/hybrid) 구분
- [ ] 스킬 로딩 시점 설계 (lazy vs eager)
- [ ] 캐싱 전략

**Files to Create**:
- `src/orchestrator/unified-skill-registry.ts`
- `src/orchestrator/types/unified-skill.ts`

#### TODO 2.2: OMC 스킬 메타데이터 추출
**Priority**: P1
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] SKILL.md 파일 파서
- [ ] 키워드, 트리거, 에이전트 추출
- [ ] Nubabel 스킬 포맷으로 변환
- [ ] 38개 OMC 스킬 메타데이터 JSON 생성

**Files to Create**:
- `src/utils/omc-skill-parser.ts`
- `config/skills/omc-skills.json` (generated)

#### TODO 2.3: 키워드 라우팅 통합
**Priority**: P0
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] 기존 skill-selector.ts 확장
- [ ] OMC 스킬 키워드 포함
- [ ] 충돌 해결 규칙 (동일 키워드 시)
- [ ] A/B 테스트 지원 (실험적 라우팅)

**Files to Modify**:
- `src/orchestrator/skill-selector.ts`
- `src/orchestrator/types.ts`

#### TODO 2.4: 스킬 우선순위 로직
**Priority**: P1
**Estimated**: 1 day
**Acceptance Criteria**:
- [ ] 도메인 기반 우선순위 (code tasks -> OMC)
- [ ] 사용자 선호도 반영
- [ ] 비용 효율성 고려 옵션
- [ ] 명시적 스킬 지정 우선

**Files to Modify**:
- `src/orchestrator/skill-selector.ts`

---

### Phase 3: Agent Interoperability

#### TODO 3.1: Agent 정의 변환기
**Priority**: P1
**Estimated**: 3 days
**Acceptance Criteria**:
- [ ] OMC Markdown 파서 (frontmatter + content)
- [ ] Nubabel YAML 파서 (기존 agent-loader 활용)
- [ ] 공통 중간 표현(IR) 정의
- [ ] 양방향 변환 함수

**Files to Create**:
- `src/utils/agent-converter.ts`
- `src/utils/agent-ir.ts`

#### TODO 3.2: OMC -> Nubabel 변환 구현
**Priority**: P1
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] 시스템 프롬프트 추출
- [ ] 도구 목록 매핑
- [ ] 모델 티어 변환 (haiku/sonnet/opus -> 설정)
- [ ] 변환 손실 리포트 생성

**Files to Modify**:
- `src/utils/agent-converter.ts`

#### TODO 3.3: Nubabel -> OMC 변환 구현
**Priority**: P2
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] YAML -> Markdown 템플릿
- [ ] 도구 -> MCP 도구명 매핑
- [ ] OMC 호환 프롬프트 포맷팅
- [ ] 변환 결과 검증

**Files to Modify**:
- `src/utils/agent-converter.ts`

#### TODO 3.4: 양방향 호출 테스트
**Priority**: P1
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] Nubabel -> OMC executor 호출 테스트
- [ ] OMC -> Nubabel Slack 에이전트 호출 테스트
- [ ] 왕복 변환 일관성 검증
- [ ] 성능 벤치마크

**Files to Create**:
- `src/__tests__/integration/omc-bridge.test.ts`

---

### Phase 4: Advanced Features

#### TODO 4.1: 하이브리드 실행 오케스트레이터
**Priority**: P1
**Estimated**: 3 days
**Acceptance Criteria**:
- [ ] 복합 태스크 분해 로직
- [ ] OMC/Nubabel 동시 실행 지원
- [ ] 실행 컨텍스트 공유 메커니즘
- [ ] 상태 동기화 프로토콜

**Files to Create**:
- `src/orchestrator/hybrid-executor.ts`

#### TODO 4.2: 병렬 실행 코디네이터
**Priority**: P1
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] Promise.allSettled 기반 병렬화
- [ ] 타임아웃 개별 관리
- [ ] 부분 실패 처리
- [ ] 진행 상황 스트리밍

**Files to Modify**:
- `src/orchestrator/hybrid-executor.ts`

#### TODO 4.3: 결과 병합 로직
**Priority**: P1
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] 이종 결과 타입 통합
- [ ] 충돌 해결 전략
- [ ] 사용자 친화적 응답 포맷
- [ ] Slack 포맷 호환성

**Files to Create**:
- `src/orchestrator/result-merger.ts`

#### TODO 4.4: 에러 핸들링 통합
**Priority**: P0
**Estimated**: 2 days
**Acceptance Criteria**:
- [ ] OMC 에러 -> Nubabel 에러 변환
- [ ] 재시도 정책 통합
- [ ] 폴백 전략 (OMC 실패 시 Nubabel 대체)
- [ ] 에러 로깅 및 알림

**Files to Modify**:
- `src/orchestrator/error-handler.ts`
- `src/mcp-servers/omc-bridge/error-handler.ts`

---

## Commit Strategy

### Phase 1 Commits
```
feat(mcp): add omc-bridge server skeleton
feat(mcp): implement omc tool proxy
feat(auth): integrate jwt validation for omc-bridge
feat(cost): add omc tool cost tracking
```

### Phase 2 Commits
```
feat(orchestrator): create unified skill registry
feat(skills): add omc skill metadata parser
feat(routing): integrate omc keywords into skill selector
feat(routing): add skill priority logic
```

### Phase 3 Commits
```
feat(utils): create agent definition converter
feat(converter): implement omc to nubabel conversion
feat(converter): implement nubabel to omc conversion
test(integration): add omc bridge tests
```

### Phase 4 Commits
```
feat(orchestrator): add hybrid executor
feat(orchestrator): implement parallel coordinator
feat(orchestrator): add result merger
feat(error): integrate error handling across systems
```

---

## Risk Assessment

### High Risk
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OMC Runtime 불안정 | 전체 서비스 장애 | Medium | Circuit breaker, 폴백 에이전트 |
| 비용 폭주 | 예산 초과 | Medium | 실시간 모니터링, 하드 리밋 |
| 보안 취약점 | 데이터 유출 | Low | 철저한 인증, 최소 권한 원칙 |

### Medium Risk
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| 스킬 충돌 | 잘못된 라우팅 | Medium | 명시적 네임스페이스, 우선순위 규칙 |
| 성능 저하 | 응답 지연 | Medium | 캐싱, 비동기 처리 |
| 변환 손실 | 기능 누락 | Low | 변환 검증, 수동 검토 |

### Low Risk
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API 호환성 | 업그레이드 실패 | Low | 버전 고정, 호환성 테스트 |
| 학습 곡선 | 도입 지연 | Low | 문서화, 점진적 롤아웃 |

---

## Success Criteria

### Functional
- [ ] Slack에서 "코드 분석해줘" -> OMC architect 호출 성공
- [ ] Claude Code에서 "팀 알림" -> Nubabel Slack 에이전트 호출 성공
- [ ] 하이브리드 태스크 "PR 만들고 알려줘" 병렬 실행 성공

### Performance
- [ ] MCP 브릿지 레이턴시 < 100ms (오버헤드)
- [ ] 병렬 실행 시 단일 실행 대비 40% 이상 시간 단축

### Reliability
- [ ] OMC 실패 시 Nubabel 폴백 정상 동작
- [ ] 비용 추적 100% 정확도

### Security
- [ ] 조직 간 데이터 격리 검증
- [ ] 인증 우회 시도 차단 확인

---

## Appendix

### A. OMC Reference

**Repository**: Local plugin installation at `~/.claude/plugins/cache/omc/oh-my-claudecode/`
**Version**: 3.7.15 (current)
**Documentation**: See `docs/ARCHITECTURE.md`, `docs/FEATURES.md` in plugin directory

#### OMC Runtime Communication Protocol

OMC는 **Claude Code CLI의 Task tool을 통한 in-process 실행**이 기본입니다:
- **직접 subprocess 호출 아님** - Claude Agent SDK의 `createSdkMcpServer`를 통해 MCP 서버로 노출
- **통신 방식**: Claude Code 내부 Task tool 호출 → OMC agent/skill 실행
- **외부 접근 시**: MCP 서버 standalone 모드 (`src/mcp/standalone-server.ts`) 지원 가능

```typescript
// OMC는 Claude Code Task tool을 통해 호출됨
Task(
  subagent_type="oh-my-claudecode:executor",
  model="sonnet",
  prompt="..."
)
```

**Nubabel 통합을 위한 접근 방식**:
1. **Option A (권장)**: OMC standalone MCP 서버를 별도 프로세스로 실행, HTTP/stdio로 통신
2. **Option B**: OMC 코드를 Nubabel에 직접 임포트 (의존성 증가)
3. **Option C**: OMC agent 정의만 추출하여 Nubabel 네이티브로 재구현

### B. OMC Tools Complete Specification (15개)

OMC omc-tools MCP 서버는 다음 15개 도구를 제공합니다:

#### LSP Tools (12개)
| Tool | Description | Input Schema |
|------|-------------|--------------|
| `lsp_hover` | Get type info and docs at position | `{ file: string, line: number, character: number }` |
| `lsp_goto_definition` | Find definition location | `{ file: string, line: number, character: number }` |
| `lsp_find_references` | Find all usages of symbol | `{ file: string, line: number, character: number, includeDeclaration?: boolean }` |
| `lsp_document_symbols` | List symbols in file | `{ file: string }` |
| `lsp_workspace_symbols` | Search symbols across workspace | `{ query: string }` |
| `lsp_diagnostics` | Get errors/warnings for file | `{ file: string }` |
| `lsp_diagnostics_directory` | Get diagnostics for directory | `{ directory: string, strategy?: 'auto'|'tsc'|'lsp' }` |
| `lsp_prepare_rename` | Check if rename is valid | `{ file: string, line: number, character: number }` |
| `lsp_rename` | Rename symbol across codebase | `{ file: string, line: number, character: number, newName: string }` |
| `lsp_code_actions` | Get available code actions | `{ file: string, startLine: number, endLine: number }` |
| `lsp_code_action_resolve` | Execute a code action | `{ file: string, action: CodeAction }` |
| `lsp_servers` | List available language servers | `{}` |

#### AST Tools (2개)
| Tool | Description | Input Schema |
|------|-------------|--------------|
| `ast_grep_search` | AST-aware code search | `{ pattern: string, language: string, path?: string }` |
| `ast_grep_replace` | AST-aware code replacement | `{ pattern: string, replacement: string, language: string, path?: string }` |

#### Python Tool (1개)
| Tool | Description | Input Schema |
|------|-------------|--------------|
| `python_repl` | Execute Python code in REPL | `{ code: string, sessionId?: string }` |

### C. SKILL.md File Format Specification

OMC 스킬은 `skills/{skill-name}/SKILL.md` 파일로 정의됩니다:

```markdown
---
name: autopilot
description: Full autonomous execution from idea to working code
---

# Autopilot Skill

Full autonomous execution from idea to working code.

## Overview
[스킬 개요]

## Usage
[사용법]

## Magic Keywords
[자동 트리거 키워드 목록]

## Phases
[실행 단계]

## Configuration
[설정 옵션]
```

**Frontmatter 필수 필드**:
- `name`: 스킬 식별자 (kebab-case)
- `description`: 한 줄 설명

**본문 구조**:
- `## Magic Keywords`: 자동 활성화 키워드 (선택)
- `## Phases` 또는 `## Implementation Steps`: 실행 로직 (필수)
- `## Configuration`: 설정 가능 옵션 (선택)

### D. Agent Intermediate Representation (IR) Schema

```typescript
// src/utils/agent-ir.ts

/**
 * 공통 중간 표현 - OMC와 Nubabel 에이전트 정의를 상호 변환하기 위한 표준 형식
 */
interface AgentIR {
  // 식별
  id: string;                          // 고유 ID
  name: string;                        // 표시 이름
  source: 'omc' | 'nubabel';          // 원본 시스템

  // 모델 설정
  model: {
    tier: 'low' | 'medium' | 'high';  // haiku/sonnet/opus 매핑
    temperature?: number;
    maxTokens?: number;
  };

  // 프롬프트
  systemPrompt: string;                // 시스템 프롬프트
  preamble?: string;                   // 추가 지시사항

  // 도구
  tools: {
    allowed: string[];                 // 허용된 도구 목록
    denied?: string[];                 // 거부된 도구 목록
  };

  // 메타데이터
  metadata: {
    category?: string;                 // 도메인 (code, business, etc.)
    keywords?: string[];               // 라우팅 키워드
    estimatedCost?: 'low' | 'medium' | 'high';
  };
}

/**
 * OMC Markdown에서 IR로 변환
 */
function omcToIR(markdownPath: string): AgentIR {
  // 1. Frontmatter 파싱 (gray-matter)
  // 2. 본문에서 시스템 프롬프트 추출
  // 3. 티어 매핑: -low -> low, -medium -> medium, 기본 -> high
  // 4. 도구 목록은 OMC 기본 허용 도구 사용
}

/**
 * Nubabel YAML에서 IR로 변환
 */
function nubabelToIR(yamlConfig: NubabelAgentYaml): AgentIR {
  // 1. YAML 파싱 (기존 agent-loader.ts 활용)
  // 2. model 필드에서 티어 추출
  // 3. tools 배열에서 도구 목록 추출
  // 4. prompt 필드에서 시스템 프롬프트 추출
}

/**
 * IR에서 OMC Markdown으로 변환
 */
function irToOmc(ir: AgentIR): string {
  // Markdown 템플릿 생성
}

/**
 * IR에서 Nubabel YAML로 변환
 */
function irToNubabel(ir: AgentIR): NubabelAgentYaml {
  // YAML 객체 생성
}
```

### E. OMC Agent Mapping Table (32개 전체)

| OMC Agent | Tier | Nubabel Equivalent | Action Required |
|-----------|------|-------------------|-----------------|
| `architect` | HIGH (Opus) | code-analyzer | 새 에이전트 정의 필요 |
| `architect-medium` | MEDIUM (Sonnet) | code-analyzer-medium | 새 에이전트 정의 필요 |
| `architect-low` | LOW (Haiku) | code-analyzer-low | 새 에이전트 정의 필요 |
| `executor` | MEDIUM (Sonnet) | task-executor | 기존 에이전트 활용 |
| `executor-high` | HIGH (Opus) | task-executor-high | 모델 티어 옵션 추가 |
| `executor-low` | LOW (Haiku) | task-executor-low | 모델 티어 옵션 추가 |
| `designer` | MEDIUM (Sonnet) | ui-specialist | 새 에이전트 정의 필요 |
| `designer-high` | HIGH (Opus) | ui-specialist-high | 새 에이전트 정의 필요 |
| `designer-low` | LOW (Haiku) | ui-specialist-low | 새 에이전트 정의 필요 |
| `explore` | LOW (Haiku) | code-explorer | 새 에이전트 정의 필요 |
| `explore-medium` | MEDIUM (Sonnet) | code-explorer-medium | 새 에이전트 정의 필요 |
| `explore-high` | HIGH (Opus) | code-explorer-high | 새 에이전트 정의 필요 |
| `researcher` | MEDIUM (Sonnet) | research-assistant | 기존 에이전트 확장 |
| `researcher-low` | LOW (Haiku) | research-assistant-low | 모델 티어 옵션 추가 |
| `scientist` | MEDIUM (Sonnet) | data-analyst | 새 에이전트 정의 필요 |
| `scientist-high` | HIGH (Opus) | data-analyst-high | 새 에이전트 정의 필요 |
| `scientist-low` | LOW (Haiku) | data-analyst-low | 새 에이전트 정의 필요 |
| `writer` | LOW (Haiku) | documentation-writer | 새 에이전트 정의 필요 |
| `vision` | MEDIUM (Sonnet) | image-analyzer | 새 에이전트 정의 필요 |
| `planner` | HIGH (Opus) | strategic-planner | OMC 전용 - 브릿지 통해 호출 |
| `critic` | HIGH (Opus) | plan-reviewer | OMC 전용 - 브릿지 통해 호출 |
| `analyst` | HIGH (Opus) | requirements-analyst | OMC 전용 - 브릿지 통해 호출 |
| `qa-tester` | MEDIUM (Sonnet) | test-runner | 새 에이전트 정의 필요 |
| `qa-tester-high` | HIGH (Opus) | test-runner-high | 새 에이전트 정의 필요 |
| `security-reviewer` | HIGH (Opus) | security-auditor | 새 에이전트 정의 필요 |
| `security-reviewer-low` | LOW (Haiku) | security-auditor-low | 새 에이전트 정의 필요 |
| `build-fixer` | MEDIUM (Sonnet) | build-doctor | 새 에이전트 정의 필요 |
| `build-fixer-low` | LOW (Haiku) | build-doctor-low | 새 에이전트 정의 필요 |
| `tdd-guide` | MEDIUM (Sonnet) | tdd-coach | 새 에이전트 정의 필요 |
| `tdd-guide-low` | LOW (Haiku) | tdd-coach-low | 새 에이전트 정의 필요 |
| `code-reviewer` | HIGH (Opus) | code-quality-reviewer | 새 에이전트 정의 필요 |
| `code-reviewer-low` | LOW (Haiku) | code-quality-reviewer-low | 새 에이전트 정의 필요 |

### F. MCP Tool Mapping (15개 전체)

| OMC Tool | Nubabel Action | Integration Strategy |
|----------|----------------|---------------------|
| `lsp_hover` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_goto_definition` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_find_references` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_document_symbols` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_workspace_symbols` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_diagnostics` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_diagnostics_directory` | MCP 브릿지로 프록시 | 직접 포워딩, 결과 캐싱 권장 |
| `lsp_prepare_rename` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_rename` | MCP 브릿지로 프록시 | 직접 포워딩, 사용자 확인 필요 |
| `lsp_code_actions` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `lsp_code_action_resolve` | MCP 브릿지로 프록시 | 직접 포워딩, 사용자 확인 필요 |
| `lsp_servers` | MCP 브릿지로 프록시 | 캐싱 가능 |
| `ast_grep_search` | MCP 브릿지로 프록시 | 직접 포워딩 |
| `ast_grep_replace` | MCP 브릿지로 프록시 | 승인 필요 (코드 수정) |
| `python_repl` | MCP 브릿지로 프록시 | 샌드박스 필요, 보안 검토 |

### G. Configuration Example

```yaml
# config/omc-integration.yaml
omc:
  enabled: true
  # OMC standalone MCP 서버 엔드포인트
  # 로컬 개발: localhost:3001 (stdio 또는 SSE)
  # 프로덕션: 별도 MCP 서버 호스팅 필요
  endpoint: "http://localhost:3001"

  # 통신 프로토콜
  protocol: "sse"  # "sse" | "stdio" | "websocket"

  auth:
    strategy: jwt
    issuer: "nubabel"
    # OMC 서버에 전달할 인증 헤더
    headerName: "X-Nubabel-Auth"

  skills:
    whitelist:
      - autopilot
      - ralph
      - ultrawork
      - analyze
      - deepsearch
      - code-review
    blacklist: []

  tools:
    # 15개 OMC 도구 중 허용할 도구
    whitelist:
      - lsp_diagnostics
      - lsp_hover
      - lsp_goto_definition
      - lsp_find_references
      - ast_grep_search
    # 승인 필요 도구 (코드 수정 가능)
    requireApproval:
      - lsp_rename
      - lsp_code_action_resolve
      - ast_grep_replace
    # 비활성화 도구 (보안 이유)
    blacklist:
      - python_repl  # 프로덕션에서 비활성화 권장

  cost:
    tracking: true
    budget_check: true
    # 토큰 추정 방식 (OMC 도구는 토큰 카운트 반환하지 않음)
    estimation:
      strategy: "response_length"  # "response_length" | "fixed" | "model_based"
      # 응답 길이 기반: 문자 1000자당 250 토큰으로 추정
      charsPerToken: 4
      # 고정 추정: 도구별 평균 토큰 사용량
      fixedEstimates:
        lsp_diagnostics: 500
        lsp_hover: 200
        ast_grep_search: 1000

  fallback:
    enabled: true
    agent: "task-executor"
    # 폴백 트리거 조건
    triggers:
      - timeout: 30000  # 30초
      - errorCodes: ["ECONNREFUSED", "ETIMEDOUT"]

  # 레이트 리밋
  rateLimit:
    perMinute: 60
    perHour: 500

  # 헬스 체크
  healthCheck:
    endpoint: "/health"
    intervalMs: 30000
    expectedResponse:
      status: "ok"
```

### H. Environment Variables

```bash
# .env
# OMC 브릿지 설정
OMC_BRIDGE_ENABLED=true
OMC_BRIDGE_ENDPOINT=http://localhost:3001
OMC_BRIDGE_PROTOCOL=sse
OMC_BRIDGE_TIMEOUT=30000

# 인증
OMC_BRIDGE_AUTH_STRATEGY=jwt
OMC_BRIDGE_AUTH_HEADER=X-Nubabel-Auth

# 비용 추적
OMC_COST_TRACKING=true
OMC_COST_ESTIMATION_STRATEGY=response_length

# 레이트 리밋
OMC_RATE_LIMIT_PER_MINUTE=60
```

---

*Plan generated by Prometheus (Planner Agent)*
*Version: 2.0 (Critic feedback incorporated)*
*Date: 2026-01-29*
*Critic Review: PENDING*
