# 동적 에이전트 시스템

## 핵심 개념

```
에이전트 = 스킬 + MCP + 권한 + 연결
         ↓
    동적으로 변화하는 조직/프로세스에 적응
         ↓
    파편화된 지식을 구조화하고 액션 수행
```

---

## 에이전트 구성 요소

### 에이전트 = 스킬 + MCP + 권한 + 연결

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Agent                                        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                         Skills                                   │  │
│   │  "무엇을 할 수 있는가"                                            │  │
│   │                                                                  │  │
│   │  • skill-brand-brief-writing (브리프 작성)                       │  │
│   │  • skill-brand-content-planning (콘텐츠 기획)                    │  │
│   │  • skill-brand-guideline-check (가이드라인 검토)                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                          MCP                                     │  │
│   │  "어떤 도구와 데이터에 접근하는가"                                 │  │
│   │                                                                  │  │
│   │  Resources:                    Tools:                            │  │
│   │  • sop://brand/*              • search                          │  │
│   │  • doc://brand/*              • notion_read/write               │  │
│   │  • notion://campaigns         • drive_read                      │  │
│   │  • drive://brand-assets       • github_create_pr                │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                        Permissions                               │  │
│   │  "어디까지 접근/수행 가능한가"                                     │  │
│   │                                                                  │  │
│   │  Read:  /sops/brand/*, /docs/brand/*, /docs/product/*           │  │
│   │  Write: /sops/brand/* (PR only)                                 │  │
│   │  Deny:  /org/hr/*, /docs/finance/confidential/*                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                       Connections                                │  │
│   │  "어떤 조직/프로세스와 연결되는가"                                  │  │
│   │                                                                  │  │
│   │  Function:     func-brand                                        │  │
│   │  Value Chain:  vc-product-to-customer                           │  │
│   │  Processes:    collection-launch, campaign-execution            │  │
│   │  Delegates:    → finance (예산), → ops (물류)                   │  │
│   │  Receives:     ← product, ← orchestrator                        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 연결 구조

### 계층적 연결

```
                         ┌────────────────┐
                         │   Objectives   │
                         │   (분기 목표)   │
                         └───────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       ┌────────────┐     ┌────────────┐     ┌────────────┐
       │Value Chain │     │Value Chain │     │Value Chain │
       │(가치 흐름)  │     │(가치 흐름)  │     │(가치 흐름)  │
       └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
             │                  │                  │
    ┌────────┼────────┐         │         ┌────────┼────────┐
    ▼        ▼        ▼         ▼         ▼        ▼        ▼
┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐
│Process││Process││Process││Process││Process││Process││Process│
└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘
    │        │        │        │        │        │        │
    ▼        ▼        ▼        ▼        ▼        ▼        ▼
┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐
│  SOP  ││  SOP  ││  SOP  ││  SOP  ││  SOP  ││  SOP  ││  SOP  │
└───────┘└───────┘└───────┘└───────┘└───────┘└───────┘└───────┘
    ▲        ▲        ▲        ▲        ▲        ▲        ▲
    │        │        │        │        │        │        │
    └────────┴────────┴────────┼────────┴────────┴────────┘
                               │
                         ┌─────┴─────┐
                         │  Agents   │
                         │ (실행자)   │
                         └───────────┘
```

### 에이전트 ↔ 조직 구조

```yaml
connections:
  agent-brand:
    # 소속
    function: "func-brand"

    # 참여하는 Value Chain
    value_chains:
      - id: "vc-product-to-customer"
        role: "콘텐츠 제작"
        stages: ["design", "content-creation"]

      - id: "vc-campaign-execution"
        role: "캠페인 기획/실행"
        stages: ["planning", "creation", "launch"]

    # 담당 Process
    processes:
      owner:
        - "process-campaign-brief"
        - "process-content-production"
      participant:
        - "process-collection-launch"

    # 실행하는 SOP
    sops:
      - "sop-brand-campaign-brief"
      - "sop-brand-content-production"
      - "sop-brand-asset-request"

    # 협업 관계
    collaborates_with:
      - agent: "agent-product"
        on: ["기획 조율", "론칭 일정"]
      - agent: "agent-finance"
        on: ["예산 확인", "비용 승인"]
      - agent: "agent-ops"
        on: ["물류 일정", "재고 확인"]
```

---

## 지식 위치 매핑

### 파편화된 지식 → 구조화

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Knowledge Location Map                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   GitHub    │  공식/버전관리 필요                                     │
│  │   (SSOT)    │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ├── /sops/*           SOP 문서                                  │
│         ├── /skills/*         스킬 정의                                 │
│         ├── /agents/*         에이전트 설정                              │
│         ├── /org/*            조직 구조                                  │
│         ├── /docs/policies/*  정책 문서                                 │
│         └── /docs/brand/*     브랜드 가이드                              │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Notion    │  실행/협업                                             │
│  │  (Working)  │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ├── Campaigns DB      캠페인 관리                                │
│         ├── Projects DB       프로젝트 관리                              │
│         ├── Tasks DB          태스크 관리                                │
│         ├── Meeting Notes     회의록                                    │
│         └── Wiki              팀별 위키                                  │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Drive     │  데이터/외부공유                                        │
│  │  (Storage)  │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ├── Finance/          재무 데이터, 예산                          │
│         ├── Legal/            계약서, 법무 문서                          │
│         ├── Brand Assets/     브랜드 에셋                                │
│         └── Reports/          분석 리포트                                │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Figma     │  디자인                                                │
│  │  (Design)   │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ├── Brand Guidelines  브랜드 가이드                              │
│         ├── UI Components     UI 컴포넌트                                │
│         └── Campaigns/        캠페인 디자인                              │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Slack     │  커뮤니케이션/이력                                      │
│  │  (Comms)    │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ├── #func-* 채널      팀별 논의                                  │
│         ├── #obj-* 채널       프로젝트별 논의                            │
│         └── Canvas/Files      공유된 문서                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 에이전트의 지식 구조화 책임

```yaml
knowledge_structuring:
  # Meta Agent (또는 Orchestrator의 역할)
  responsibilities:
    # 1. 지식 위치 인덱싱
    indexing:
      - "어떤 정보가 어디에 있는지 파악"
      - "중복/충돌 감지"
      - "접근 경로 최적화"

    # 2. 구조화 제안
    structuring:
      - "파편화된 정보 통합 제안"
      - "새 카테고리/태그 제안"
      - "문서 이동/정리 제안"

    # 3. 연결 관리
    linking:
      - "관련 문서 간 링크"
      - "SOP ↔ 리소스 연결"
      - "Value Chain ↔ Process 연결"

    # 4. 갭 발견
    gap_detection:
      - "SOP가 없는 반복 업무"
      - "문서화되지 않은 프로세스"
      - "연결이 끊긴 정보"
```

---

## 액션 수행 능력

### 에이전트가 할 수 있는 액션

```yaml
action_capabilities:
  # 1. 정보 조회
  read_actions:
    - "SOP 검색 및 조회"
    - "정책 문서 조회"
    - "Notion DB 쿼리"
    - "Drive 파일 읽기"
    - "과거 사례 검색"

  # 2. 생성/수정
  write_actions:
    - "Notion 페이지 생성"
    - "태스크 생성/업데이트"
    - "GitHub PR 생성"
    - "브리프/문서 초안 작성"

  # 3. 단계별 프로세스 실행
  process_actions:
    - "SOP 단계별 실행"
    - "체크리스트 처리"
    - "승인 요청 발송"
    - "다음 단계 트리거"

  # 4. 협업/위임
  collaboration_actions:
    - "다른 에이전트에게 위임"
    - "정보 요청 및 수집"
    - "결과 취합"
    - "보고/공유"

  # 5. 알림/커뮤니케이션
  notification_actions:
    - "Slack 메시지 발송"
    - "승인 요청"
    - "진행 상황 공유"
    - "완료 알림"
```

### 단계별 액션 예시

```
사용자: "캠페인 브리프 작성해줘"

Agent Actions:
─────────────────────────────────────────────────────────

Step 1: 정보 수집 [READ]
├── search("과거 유사 캠페인")
├── notion_query("Campaign Requests", filter=pending)
└── drive_read("Brand Guidelines")

Step 2: 예산 확인 [DELEGATE]
└── delegate_to(agent-finance, "예산 확인", {
      department: "brand",
      expected_amount: 10000000
    })

Step 3: 브리프 작성 [CREATE]
├── generate_brief(collected_info)
└── notion_create_page("Campaign Briefs", brief_content)

Step 4: 승인 요청 [APPROVE]
└── request_approval({
      approver: "creative-director@company.com",
      document: brief_url,
      timeout: "24h"
    })

Step 5: 완료 처리 [NOTIFY]
├── notion_update_page(brief_id, status="Active")
└── notify_slack("#func-brand", "브리프 승인 완료")
```

### 협업 액션 예시

```
Objective: "S/S 컬렉션 론칭"

Orchestrator: "론칭 플랜 수립 시작"
    │
    ├─→ Product Agent [Owner]
    │       │
    │       ├─ request_info(Brand Agent, "콘텐츠 일정")
    │       ├─ request_info(Ops Agent, "물류 현황")
    │       └─ request_info(Finance Agent, "예산 현황")
    │
    │   ┌────────────────────────────────────────────┐
    │   │           Parallel Execution               │
    │   ├────────────────────────────────────────────┤
    │   │                                            │
    │   │  Brand Agent:                              │
    │   │  └─ return { 촬영: "2/1-7", 편집: "2/8-14" }│
    │   │                                            │
    │   │  Ops Agent:                                │
    │   │  └─ return { 재고: "80%", 입고: "2/15" }   │
    │   │                                            │
    │   │  Finance Agent:                            │
    │   │  └─ return { 예산: 5000만, 잔여: 3500만 }  │
    │   │                                            │
    │   └────────────────────────────────────────────┘
    │
    └─→ Product Agent [Aggregate]
            │
            ├─ compile_plan(all_responses)
            ├─ create_timeline()
            └─ notify_stakeholders()
```

---

## 접근 권한 체계

### 권한 레이어

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Permission Layers                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 1: Resource Access (MCP)                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  "어떤 데이터에 접근 가능한가"                                            │
│                                                                         │
│  agent-brand:                                                           │
│    read:  [sop://brand/*, doc://brand/*, notion://campaigns]           │
│    write: [sop://brand/*, notion://campaign-briefs]                    │
│    deny:  [sop://hr/*, doc://finance/confidential/*]                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 2: Tool Access (MCP Tools)                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  "어떤 도구를 사용 가능한가"                                              │
│                                                                         │
│  agent-brand:                                                           │
│    allowed:  [search, notion_read, notion_write, github_create_pr]     │
│    denied:   [drive_write, send_email]                                 │
│    requires_approval: [notion_write when status="Official"]            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 3: Action Scope                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  "어떤 범위까지 행동 가능한가"                                            │
│                                                                         │
│  agent-brand:                                                           │
│    can_create:   [campaign-brief, content-plan]                        │
│    can_approve:  [] (승인 권한 없음)                                    │
│    can_delete:   [] (삭제 권한 없음)                                    │
│    budget_limit: 100000 (10만원 이하 자동 처리)                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 4: Delegation Rights                                             │
│  ─────────────────────────────────────────────────────────────────────  │
│  "누구에게 위임 가능한가"                                                 │
│                                                                         │
│  agent-brand:                                                           │
│    can_delegate_to:                                                     │
│      - agent-finance: [예산 확인, 비용 검토]                            │
│      - agent-ops: [물류 확인, 재고 조회]                                │
│    cannot_delegate_to:                                                  │
│      - agent-hr (인사 정보 접근 불가)                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 승인 체계

```yaml
approval_matrix:
  # 금액 기반
  by_amount:
    - range: "< 10만원"
      approval: "자동"
    - range: "10만원 ~ 100만원"
      approval: "팀장"
    - range: "100만원 ~ 1000만원"
      approval: "디렉터"
    - range: "> 1000만원"
      approval: "C-level"

  # 작업 유형 기반
  by_action:
    - action: "SOP 변경"
      approval: "Function Owner"
    - action: "외부 커뮤니케이션"
      approval: "담당 Manager"
    - action: "인사 정보 접근"
      approval: "HR Lead"
    - action: "계약 체결"
      approval: "CEO"
```

---

## 동적 변화 관리

### 변화 유형

```yaml
dynamic_changes:
  # 1. 새로운 에이전트 추가
  new_agent:
    trigger: "새 Function/역할 생성"
    process:
      - "agents/{name}.yml 생성"
      - "skills/{function}/*.yml 생성"
      - "권한 설정"
      - "기존 에이전트와 연결 정의"
      - "Orchestrator 라우팅 규칙 업데이트"

  # 2. 조직 구조 변경
  org_change:
    trigger: "Function 신설/통합/분리"
    process:
      - "org/functions/*.yml 수정"
      - "영향받는 에이전트 설정 수정"
      - "Value Chain 참여 업데이트"
      - "채널 구조 조정"

  # 3. 새로운 프로세스/SOP
  new_process:
    trigger: "반복 업무 발견 / 비즈니스 변화"
    process:
      - "SOP 초안 생성 (자동 또는 수동)"
      - "리뷰 및 승인"
      - "에이전트 스킬 연결"
      - "트리거 설정"

  # 4. 새로운 프로젝트/Objective
  new_objective:
    trigger: "분기 계획 / 신규 이니셔티브"
    process:
      - "Objective 정의"
      - "Owner Agent 지정"
      - "참여 에이전트 정의"
      - "Slack 채널 생성"
      - "진행 상황 추적 시작"

  # 5. Value Chain 변경
  value_chain_change:
    trigger: "비즈니스 모델 변화"
    process:
      - "Value Chain 정의 수정"
      - "단계별 담당 에이전트 재지정"
      - "관련 SOP 업데이트"
```

### 적응 메커니즘

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Adaptation Mechanism                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 감지 (Detection)                                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  • GitHub 변경 감지                                                     │
│    └─ /agents/*.yml, /org/*.yml, /sops/*.yml 변경 시 자동 감지         │
│                                                                         │
│  • 업무 패턴 분석                                                       │
│    └─ SOP 없는 반복 업무 발견                                           │
│    └─ 새로운 협업 패턴 발견                                             │
│                                                                         │
│  • 명시적 요청                                                          │
│    └─ "새 에이전트 추가해줘"                                            │
│    └─ "이 프로세스 SOP로 만들어줘"                                      │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  2. 분석 (Analysis)                                                     │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  • 영향 범위 파악                                                       │
│    └─ 어떤 에이전트가 영향받는가?                                       │
│    └─ 어떤 프로세스가 변경되는가?                                       │
│    └─ 권한 조정이 필요한가?                                             │
│                                                                         │
│  • 의존성 확인                                                          │
│    └─ 연결된 SOP, Skill, Value Chain                                   │
│    └─ 협업 관계                                                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  3. 적용 (Application)                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  • 자동 적용 (설정 변경)                                                │
│    └─ 에이전트 재로딩                                                   │
│    └─ 라우팅 규칙 업데이트                                              │
│    └─ 권한 캐시 갱신                                                    │
│                                                                         │
│  • 수동 확인 필요 (큰 변경)                                             │
│    └─ 새 에이전트 추가 → Human 승인                                    │
│    └─ 권한 확대 → Security 승인                                        │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  4. 알림 (Notification)                                                 │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  • 이해관계자 알림                                                       │
│    └─ "새 에이전트 agent-cs가 추가되었습니다"                           │
│    └─ "캠페인 브리프 SOP가 업데이트되었습니다"                          │
│                                                                         │
│  • 변경 로그 기록                                                       │
│    └─ Git history                                                       │
│    └─ Audit log                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Meta Agent (시스템 관리자)

```yaml
meta_agent:
  id: "agent-meta"
  name: "Meta Agent"
  description: "시스템 자체를 관리하고 진화시키는 에이전트"

  responsibilities:
    # 지식 구조화
    knowledge_management:
      - "파편화된 정보 위치 파악"
      - "정보 분류/태깅 제안"
      - "문서 간 연결 관리"
      - "중복/충돌 감지"

    # 에이전트 관리
    agent_management:
      - "에이전트 추가/수정 지원"
      - "에이전트 간 관계 관리"
      - "권한 일관성 검증"

    # 프로세스 최적화
    process_optimization:
      - "SOP 커버리지 분석"
      - "병목/비효율 감지"
      - "개선 제안"

    # 시스템 건강성
    health_monitoring:
      - "에이전트 사용 현황"
      - "오류/실패 분석"
      - "성능 모니터링"

  triggers:
    - "주간 시스템 리포트"
    - "새 패턴 감지 시"
    - "설정 변경 시"
    - "명시적 요청 시"
```

---

## 요약: 동적 시스템의 특성

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. 에이전트는 독립적이면서 연결됨                                        │
│     └─ 각자 스킬/권한을 가지면서 협업 가능                               │
│                                                                         │
│  2. 지식은 분산되어 있지만 구조화됨                                       │
│     └─ 여러 도구에 있지만 에이전트가 위치를 알고 접근                    │
│                                                                         │
│  3. 프로세스는 정의되어 있지만 유연함                                     │
│     └─ SOP로 표준화하되, 예외 처리와 적응 가능                          │
│                                                                         │
│  4. 조직은 변화하고 시스템도 따라 변화                                    │
│     └─ 새 에이전트, 새 프로세스, 새 연결이 계속 추가                     │
│                                                                         │
│  5. 모든 것은 추적되고 개선됨                                            │
│     └─ 히스토리, 분석, 제안을 통한 지속적 진화                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```
