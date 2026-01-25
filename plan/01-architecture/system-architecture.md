# 시스템 아키텍처

## 전체 구조

```
                                    ┌─────────────────┐
                                    │     Users       │
                                    │  (Employees)    │
                                    └────────┬────────┘
                                             │
         ┌───────────────────────────────────┼───────────────────────────────────┐
         │                                   ▼                                   │
         │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
         │  │ Slack   │  │ Notion  │  │ Drive   │  │ Figma   │  │ GitHub  │     │
         │  │   UI    │  │   UI    │  │   UI    │  │   UI    │  │   UI    │     │
         │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
         │       │            │            │            │            │          │
         │       │      FRONTEND LAYER (User Interfaces)             │          │
         └───────┼────────────┼────────────┼────────────┼────────────┼──────────┘
                 │            │            │            │            │
                 ▼            ▼            ▼            ▼            ▼
         ┌──────────────────────────────────────────────────────────────────────┐
         │                        INTEGRATION LAYER                             │
         │  ┌────────────────────────────────────────────────────────────────┐ │
         │  │                      Slack Bot Gateway                         │ │
         │  │              (Single App / Multi-Persona)                      │ │
         │  └───────────────────────────┬────────────────────────────────────┘ │
         │                              │                                      │
         │  ┌────────────┐  ┌──────────┴──────────┐  ┌────────────┐           │
         │  │  Notion    │  │                     │  │   Drive    │           │
         │  │  Adapter   │  │                     │  │  Adapter   │           │
         │  └─────┬──────┘  │                     │  └─────┬──────┘           │
         │        │         │                     │        │                   │
         └────────┼─────────┼─────────────────────┼────────┼───────────────────┘
                  │         ▼                     │        │
                  │  ┌──────────────────────────────────────────────────────┐
                  │  │                  AGENT LAYER                         │
                  │  │  ┌────────────────────────────────────────────────┐ │
                  │  │  │              Orchestrator Agent                 │ │
                  │  │  │   • Request Routing                            │ │
                  │  │  │   • Context Management                         │ │
                  │  │  │   • Approval Flow Control                      │ │
                  │  │  └─────────────────────┬──────────────────────────┘ │
                  │  │                        │                            │
                  │  │    ┌───────────────────┼───────────────────┐       │
                  │  │    ▼                   ▼                   ▼       │
                  │  │ ┌──────────┐    ┌──────────┐    ┌──────────┐      │
                  │  │ │  Brand   │    │   Ops    │    │ Finance  │      │
                  │  │ │  Agent   │    │  Agent   │    │  Agent   │      │
                  │  │ └────┬─────┘    └────┬─────┘    └────┬─────┘      │
                  │  │      │               │               │             │
                  │  │      └───────────────┼───────────────┘             │
                  │  │                      │                             │
                  │  └──────────────────────┼─────────────────────────────┘
                  │                         ▼
                  │  ┌──────────────────────────────────────────────────────┐
                  │  │                    MCP LAYER                         │
                  │  │  ┌─────────────────────────────────────────────────┐│
                  │  │  │              MCP Server                         ││
                  │  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     ││
                  │  │  │  │ Resources │ │   Tools   │ │  Prompts  │     ││
                  │  │  │  │           │ │           │ │           │     ││
                  │  │  │  │ sop://    │ │ search    │ │ templates │     ││
                  │  │  │  │ doc://    │ │ create    │ │           │     ││
                  │  │  │  │ skill://  │ │ validate  │ │           │     ││
                  │  │  │  └───────────┘ └───────────┘ └───────────┘     ││
                  │  │  └─────────────────────────────────────────────────┘│
                  │  └──────────────────────────────────────────────────────┘
                  │                         │
                  ▼                         ▼
         ┌──────────────────────────────────────────────────────────────────────┐
         │                        DATA LAYER (SSOT)                             │
         │  ┌────────────────────────────────────────────────────────────────┐ │
         │  │                    GitHub Monorepo                             │ │
         │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │ │
         │  │  │  /org  │ │ /sops  │ │/skills │ │ /docs  │ │  /mcp  │       │ │
         │  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │ │
         │  └────────────────────────────────────────────────────────────────┘ │
         │                              ▲                                      │
         │              ┌───────────────┴───────────────┐                     │
         │              │          Sync Layer           │                     │
         │         ┌────┴────┐                    ┌────┴────┐                 │
         │         │ Notion  │                    │  Drive  │                 │
         │         │ (Cache) │                    │ (Cache) │                 │
         │         └─────────┘                    └─────────┘                 │
         └──────────────────────────────────────────────────────────────────────┘
```

---

## 레이어 상세

### 1. Frontend Layer (User Interfaces)

| 도구 | 주요 용도 | 에이전트 연동 |
|------|----------|--------------|
| **Slack** | 사내 커뮤니케이션, 에이전트 호출 | 직접 연동 (Primary) |
| **Notion** | 위키, 태스크, 프로젝트 관리 | MCP를 통한 읽기/쓰기 |
| **Drive** | 재무, 계약, 리포트 | MCP를 통한 읽기 |
| **Figma** | 디자인 프로토타입 | 링크 참조만 |
| **GitHub** | 코드, 문서 PR | 직접 연동 |

### 2. Integration Layer

```yaml
slack_gateway:
  type: "Slack App"
  responsibilities:
    - 사용자 메시지 수신
    - 에이전트 페르소나 관리 (Multi-Persona)
    - 메시지 포맷팅 및 전송
    - 승인 요청 UI (Buttons, Modals)

adapters:
  notion:
    - Read: 페이지, 데이터베이스 조회
    - Write: 태스크 생성/업데이트, 페이지 생성
    - Watch: 변경 감지 (Webhook)

  drive:
    - Read: 시트, 문서 조회
    - Watch: 변경 감지

  github:
    - Read: 파일, 디렉토리 조회
    - Write: PR 생성, 파일 커밋
    - Watch: Webhook (PR, Issue)
```

### 3. Agent Layer

```yaml
orchestrator:
  role: "중앙 라우터 및 조정자"
  responsibilities:
    - 사용자 요청 분석 및 적절한 에이전트 라우팅
    - 컨텍스트 관리 (대화 히스토리, 현재 상태)
    - 멀티 에이전트 워크플로 조정
    - 승인 포인트 관리

domain_agents:
  - name: "Brand Agent"
    function: "브랜드/크리에이티브"

  - name: "Ops Agent"
    function: "운영"

  - name: "Finance Agent"
    function: "재무/회계"

  - name: "HR Agent"
    function: "인사"

  - name: "Product Agent"
    function: "제품기획"

  - name: "CS Agent"
    function: "고객지원"
```

### 4. MCP Layer

```yaml
mcp_server:
  resources:
    - uri_scheme: "sop://"
      description: "SOP 문서 접근"
      examples:
        - "sop://hr/onboarding"
        - "sop://ops/incident-response"

    - uri_scheme: "doc://"
      description: "문서 접근"
      examples:
        - "doc://engineering/adr/001"
        - "doc://policies/expense"

    - uri_scheme: "skill://"
      description: "스킬 정의 접근"
      examples:
        - "skill://hr/leave-policy"
        - "skill://finance/budget-check"

  tools:
    - name: "search"
      description: "지식베이스 검색"

    - name: "validate"
      description: "데이터/문서 유효성 검증"

    - name: "create_pr"
      description: "GitHub PR 생성"

    - name: "notify"
      description: "Slack 알림 전송"
```

### 5. Data Layer (SSOT)

```
GitHub Monorepo (Primary Source)
         │
         ├── 직접 관리: SOP, 정책, 스킬, 에이전트 정의
         │
         ├── Sync ← Notion: 승격된 문서
         │
         └── Sync ← Drive: 승격된 시트/문서
```

---

## 데이터 흐름

### A. 사용자 → 에이전트 요청

```
1. User: Slack에서 "@brand-agent 캠페인 브리프 작성해줘"

2. Slack Gateway:
   - 메시지 수신
   - @멘션 파싱
   - Orchestrator로 전달

3. Orchestrator:
   - 요청 분석
   - Brand Agent 선택
   - 컨텍스트 구성

4. Brand Agent:
   - MCP 통해 관련 SOP 조회: sop://brand/campaign-brief
   - MCP 통해 관련 스킬 확인: skill://brand/brief-writing
   - 필요 시 다른 에이전트에 위임 (예: Finance Agent에 예산 확인)

5. Response:
   - 결과를 Slack으로 전송
   - 필요 시 승인 요청 버튼 포함
```

### B. 문서 승격 플로우

```
1. Notion에서 문서 작성/편집 (Draft)

2. 상태 변경: "Ready for Review"

3. Sync Agent 감지:
   - 태그/상태 확인
   - 승격 기준 충족 확인

4. GitHub PR 생성:
   - Markdown 변환
   - 적절한 디렉토리에 배치
   - 리뷰어 자동 지정

5. PR 승인 후 Merge:
   - Main 브랜치에 반영
   - Notion 문서에 "Official" 태그 추가
   - 양방향 링크 설정
```

### C. 멀티 에이전트 협업

```
User: "신제품 론칭 플랜 세워줘"

Orchestrator
    │
    ├─→ Product Agent (Owner)
    │       │
    │       ├─→ Brand Agent: 마케팅 플랜 초안
    │       │
    │       ├─→ Ops Agent: 물류/재고 확인
    │       │
    │       └─→ Finance Agent: 예산 검토
    │
    └─← 취합 및 최종 플랜 생성
            │
            └─→ User: 결과 보고 + 승인 요청
```

---

## 보안 및 권한

### 에이전트별 접근 권한

```yaml
agent_permissions:
  brand_agent:
    read:
      - "/sops/brand/*"
      - "/sops/marketing/*"
      - "/docs/product/*"
    write:
      - "/sops/brand/*"  # PR을 통해서만
    tools:
      - "search"
      - "create_pr"
      - "notify"
    restricted:
      - "/org/hr/*"
      - "/docs/finance/*"

  finance_agent:
    read:
      - "/sops/finance/*"
      - "/docs/finance/*"
    write:
      - "/sops/finance/*"
    approval_required:
      - 금액 > 1,000,000원
    tools:
      - "search"
      - "create_pr"
      - "notify"
      - "drive_read"
```

### 승인 포인트

| 작업 유형 | 승인 필요 여부 | 승인자 |
|----------|---------------|--------|
| 정보 조회 | 불필요 | - |
| 문서 초안 생성 | 불필요 | - |
| SOP 변경 PR | 필요 | Function Owner |
| 재무 관련 작업 | 필요 | Finance Lead |
| 외부 커뮤니케이션 | 필요 | 관련 Manager |
| 인사 정보 접근 | 필요 | HR Lead |

---

## 확장성 고려사항

### 새로운 에이전트 추가

```yaml
# /agents/new-agent.yml 생성만으로 추가 가능
agent:
  id: "new-agent"
  name: "New Agent"
  function: "new-function"
  # ... 설정
```

### 새로운 도구 스택 추가

```yaml
# Thin Adapter 패턴
adapters:
  new_tool:
    type: "NewToolAdapter"
    operations:
      - read
      - write
    sync_to_github: true
```

### 에이전트 엔진 교체

```
현재: LangGraph
미래: OpenAI Agents SDK 또는 다른 프레임워크

교체 시:
- /agents/*.yml 파일은 그대로 유지
- 새 엔진의 런타임이 YAML을 읽어 에이전트 생성
- 도메인 모델과 GitHub 구조는 변경 없음
```
