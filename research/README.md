# Nubabel Research Documentation

> **목적**: Phase 2 Week 9-12 Slack Bot + Orchestrator 구현을 위한 심층 리서치

**생성일**: 2026-01-26  
**프로젝트**: Nubabel (AI Workflow Automation Platform)

---

## 📋 리서치 스코프

### 핵심 질문

1. **Slack Bot Architecture**: 어떻게 enterprise-grade Slack bot을 multi-agent 백엔드와 연결하는가?
2. **MCP Protocol**: Model Context Protocol을 어떻게 multi-tool 통합에 활용하는가?
3. **Agent Orchestration**: 어떻게 여러 AI agent를 조율하여 복잡한 workflow를 실행하는가?
4. **Event-Driven Architecture**: 어떻게 Slack 3초 timeout을 극복하고 long-running task를 처리하는가?
5. **Session Management**: 어떻게 cross-interface session continuity를 구현하는가?
6. **Commercial Patterns**: Zapier/n8n/Make.com은 어떻게 multi-tool orchestration을 구현했는가?

---

## 📂 리서치 구조

```
research/
├── README.md                           # 이 파일
├── architecture/                       # 아키텍처 패턴
│   ├── slack-bot-patterns.md           # Slack Bot 아키텍처 패턴
│   ├── mcp-protocol-deep-dive.md       # MCP 프로토콜 상세 분석
│   ├── agent-orchestration.md          # Agent 조율 패턴
│   └── event-driven-patterns.md        # Event-driven 아키텍처
│
├── integration-patterns/               # 통합 패턴
│   ├── session-management.md           # Session 관리 및 continuity
│   ├── multi-tenant-isolation.md       # Multi-tenant 격리 전략
│   ├── error-handling.md               # Error handling & retry
│   └── authentication-patterns.md      # 인증/인가 패턴
│
├── commercial-tools/                   # 상용 도구 분석
│   ├── zapier-analysis.md              # Zapier 아키텍처
│   ├── n8n-analysis.md                 # n8n 구조 분석
│   ├── make-integromat-analysis.md     # Make.com 패턴
│   └── temporal-workflow-engine.md     # Temporal.io 워크플로우 엔진
│
└── technical-deep-dive/                # 기술 심화
    ├── langchain-langgraph.md          # LangChain/LangGraph 패턴
    ├── bullmq-job-queues.md            # BullMQ 작업 큐
    ├── redis-session-patterns.md       # Redis 세션 패턴
    └── slack-api-best-practices.md     # Slack API 모범 사례
```

---

## 🎯 리서치 목표

### Phase 1: 패턴 수집 (현재)

- ✅ 백그라운드 에이전트 5개 실행
  - Slack Bot architecture patterns
  - MCP protocol implementations
  - AI agent orchestration frameworks
  - Event-driven architectures
  - Codebase structure analysis (explore agent)
- 🔄 추가 리서치 2개 실행
  - Commercial automation platforms (Zapier, n8n, Make.com)
  - Session continuity patterns

### Phase 2: 패턴 분석 및 통합

- 수집된 리서치 결과를 각 카테고리별로 정리
- 우리 프로젝트에 적용 가능한 패턴 추출
- Trade-off 분석 (복잡도 vs 기능성)

### Phase 3: 아키텍처 설계

- 최종 아키텍처 다이어그램 작성
- 기술 스택 결정 (BullMQ vs Temporal, LangGraph vs custom, etc.)
- Implementation roadmap 작성

### Phase 4: 문서 업데이트

- `docs/architecture.md` 업데이트
- `docs/plan.md` 업데이트
- Implementation spec 작성

---

## 🔍 현재 진행 상황

### 완료된 문서 읽기

- ✅ README.md (프로젝트 개요)
- ✅ docs/core/06-ohmyopencode-integration.md
- ✅ docs/core/07-slack-orchestrator-implementation.md
- ✅ PROJECT_IDENTITY.md
- ✅ ARCHITECTURE.md
- ✅ plan/00-overview.md
- ✅ plan/01-architecture/system-architecture.md
- ✅ package.json (dependencies 파악)
- ✅ prisma/schema.prisma (data model 파악)
- ✅ src/\*_/_.ts 파일 목록

### 실행 중인 백그라운드 에이전트

1. **bg_18d3049e** - Slack Bot architecture patterns (librarian) - **running**
2. **bg_954765ff** - MCP protocol implementations (librarian) - **running**
3. **bg_2f1218f8** - AI agent orchestration frameworks (librarian) - **running**
4. **bg_691574ae** - Explore existing codebase structure (explore) - **running**
5. **bg_8d3c9249** - Event-driven architectures (librarian) - **running**
6. **NEW** - Commercial automation platforms analysis (librarian)
7. **NEW** - Session continuity patterns (librarian)

---

## 📊 리서치 방법론

### 1. Librarian Agents (External Research)

- **목적**: 외부 레퍼런스, 오픈소스 코드, 공식 문서 조사
- **도구**: GitHub search, Context7 (official docs), Web search
- **결과물**: 실제 프로덕션 코드 예시, 아키텍처 패턴, 모범 사례

### 2. Explore Agents (Internal Research)

- **목적**: 기존 codebase 구조 파악, 패턴 식별
- **도구**: Glob, Read, AST-grep, LSP
- **결과물**: 현재 프로젝트 구조 맵, 기존 패턴 문서화

### 3. Oracle Consultation (Architecture Design)

- **시점**: 리서치 완료 후, 중요한 아키텍처 결정 전
- **목적**: 복잡한 trade-off 분석, 전략적 의사결정
- **활용**: 최종 아키텍처 설계 검증

---

## 🚀 다음 단계

### 즉시 (리서치 완료 대기 중)

- [ ] 7개 백그라운드 에이전트 완료 대기
- [ ] 각 에이전트 결과를 해당 카테고리 문서로 작성
- [ ] 추가 필요한 리서치 식별 및 실행

### 단기 (리서치 결과 통합)

- [ ] 패턴 비교 분석표 작성
- [ ] 기술 스택 선택 근거 문서화
- [ ] 아키텍처 다이어그램 작성 (Mermaid 또는 ASCII)

### 중기 (Implementation Spec)

- [ ] `docs/architecture.md` 업데이트 (리서치 기반)
- [ ] `docs/plan.md` 업데이트 (구체적인 implementation steps)
- [ ] `src/orchestrator/` implementation guide 작성
- [ ] `src/api/slack.ts` implementation guide 작성

---

## 📝 문서 작성 원칙

### 1. Evidence-Based

- 모든 주장은 실제 코드 예시 또는 공식 문서 인용으로 뒷받침
- "보통 이렇게 한다"보다 "X 프로젝트에서는 이렇게 구현했다" 선호

### 2. Actionable

- 이론적 설명보다 구체적인 구현 방법 중심
- "이게 좋다"보다 "이렇게 하면 된다" 형식

### 3. Trade-off Transparent

- 모든 선택지의 장단점 명시
- 우리 프로젝트에 적합한 이유 설명

### 4. Maintained

- 리서치 결과가 업데이트되면 문서도 업데이트
- 날짜 및 버전 명시

---

**이 리서치는 Nubabel Phase 2 Week 9-12 구현의 기초가 됩니다.**  
모든 architectural decision은 이 리서치를 기반으로 합니다.
