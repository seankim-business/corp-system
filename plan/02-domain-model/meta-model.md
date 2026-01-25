# 도메인 메타모델

## 개요

회사 구조를 그대로 멀티 에이전트 시스템의 도메인 모델로 옮긴다. 이 메타모델이 GitHub 모노레포, 에이전트 설정, Notion/Drive/Slack 메타데이터와 자연스럽게 매핑된다.

---

## 핵심 개념 다이어그램

```
                                    ┌─────────────┐
                                    │  Objective  │
                                    │   (OKR)     │
                                    └──────┬──────┘
                                           │ drives
                                           ▼
┌─────────────┐    contains    ┌─────────────────────┐    contains    ┌─────────────┐
│  Function   │───────────────▶│    Value Stream     │◀───────────────│  Function   │
│ (기능 조직)  │                │   (가치 흐름)        │                │ (기능 조직)  │
└──────┬──────┘                └──────────┬──────────┘                └──────┬──────┘
       │                                  │                                  │
       │ owns                             │ has_stages                       │ owns
       ▼                                  ▼                                  ▼
┌─────────────┐                ┌─────────────────────┐                ┌─────────────┐
│    Agent    │◀───executes────│ ValueStreamStage    │────executes───▶│    Agent    │
│  (에이전트)  │                │   (단계)             │                │  (에이전트)  │
└──────┬──────┘                └──────────┬──────────┘                └──────┬──────┘
       │                                  │                                  │
       │ follows                          │ governed_by                      │ uses
       ▼                                  ▼                                  ▼
┌─────────────┐                ┌─────────────────────┐                ┌─────────────┐
│     SOP     │◀───────────────│        SOP          │                │    Skill    │
│ (표준절차)   │                │    (표준절차)        │                │   (능력)    │
└──────┬──────┘                └──────────┬──────────┘                └──────┬──────┘
       │                                  │                                  │
       │ references                       │ uses                             │ accesses
       ▼                                  ▼                                  ▼
┌─────────────┐                ┌─────────────────────┐                ┌─────────────┐
│  Resource   │                │      Resource       │                │    Tool     │
│  (리소스)    │                │     (리소스)         │                │   (도구)    │
└─────────────┘                └─────────────────────┘                └─────────────┘
```

---

## 엔터티 정의

### 1. Function (기능 조직)

회사의 기능 조직 단위. 특정 전문 영역을 담당한다.

```yaml
Function:
  description: "회사의 기능 조직 단위"
  examples:
    - "브랜드/크리에이티브"
    - "제품기획"
    - "CS/운영"
    - "재무/회계"
    - "인사"
    - "엔지니어링"

  attributes:
    id:
      type: string
      pattern: "func-{name}"
      example: "func-brand"

    name:
      type: string
      example: "브랜드/크리에이티브"

    description:
      type: string

    owner:
      type: HumanOwner
      description: "이 Function의 책임자"

    slack_channel:
      type: string
      example: "#func-brand"

    agents:
      type: Agent[]
      description: "이 Function을 담당하는 에이전트들"

    sops:
      type: SOP[]
      description: "이 Function이 소유하는 SOP들"
```

### 2. Value Stream (가치 흐름)

고객에게 가치를 전달하는 end-to-end 흐름. 여러 Function이 협업한다.

```yaml
ValueStream:
  description: "고객에게 가치를 전달하는 end-to-end 흐름"
  examples:
    - "신규 컬렉션 기획 → 촬영 → 콘텐츠 제작 → 론칭"
    - "고객 문의 → 응답 → 이슈 해결"
    - "신규 입사자 → 온보딩 → 적응"

  attributes:
    id:
      type: string
      pattern: "vs-{name}"
      example: "vs-collection-launch"

    name:
      type: string
      example: "신규 컬렉션 론칭"

    description:
      type: string

    owner:
      type: Agent
      description: "이 Value Stream의 Owner 에이전트"

    human_owner:
      type: HumanOwner
      description: "최종 책임자"

    stages:
      type: ValueStreamStage[]
      description: "Value Stream의 단계들"

    participating_functions:
      type: Function[]
      description: "참여하는 Function들"

    trigger:
      type: Trigger
      description: "이 Value Stream이 시작되는 조건"

    kpis:
      type: KPI[]
      description: "성과 지표"
```

### 3. ValueStreamStage (가치 흐름 단계)

Value Stream의 개별 단계.

```yaml
ValueStreamStage:
  description: "Value Stream의 개별 단계"

  attributes:
    id:
      type: string
      pattern: "stage-{vs_id}-{order}"
      example: "stage-vs-collection-launch-01"

    name:
      type: string
      example: "기획 완료"

    order:
      type: integer
      description: "단계 순서"

    executor:
      type: Agent | HumanOwner
      description: "이 단계의 실행자"

    sop:
      type: SOP
      description: "이 단계에서 따르는 SOP"

    inputs:
      type: Resource[]
      description: "입력 리소스"

    outputs:
      type: Resource[]
      description: "출력 리소스"

    approval_required:
      type: boolean
      description: "승인 필요 여부"

    approvers:
      type: HumanOwner[]
      description: "승인자 목록"

    next_stages:
      type: ValueStreamStage[]
      description: "다음 가능한 단계들 (분기 가능)"
```

### 4. Agent (에이전트)

특정 Function 또는 Value Stream을 담당하는 AI 에이전트.

```yaml
Agent:
  description: "특정 Function/Value Stream을 담당하는 AI 에이전트"

  attributes:
    id:
      type: string
      pattern: "agent-{name}"
      example: "agent-brand"

    name:
      type: string
      example: "Brand Agent"

    description:
      type: string

    function:
      type: Function
      description: "담당 Function"

    value_streams:
      type: ValueStream[]
      description: "참여하는 Value Stream들"

    human_owner:
      type: HumanOwner
      description: "이 에이전트의 인간 소유자/관리자"

    skills:
      type: Skill[]
      description: "보유 능력"

    tools:
      type: Tool[]
      description: "사용 가능한 도구"

    permissions:
      type: Permission
      description: "접근 권한"

    sops:
      type: SOP[]
      description: "따르는 SOP들"

    can_delegate_to:
      type: Agent[]
      description: "위임 가능한 에이전트들"

    slack_persona:
      type: SlackPersona
      description: "Slack에서의 페르소나"
```

### 5. SOP (표준 운영 절차)

특정 업무/프로세스에 대한 절차서.

```yaml
SOP:
  description: "특정 업무/프로세스에 대한 표준 절차서"

  attributes:
    id:
      type: string
      pattern: "sop-{function}-{name}"
      example: "sop-brand-campaign-brief"

    title:
      type: string
      example: "캠페인 브리프 작성"

    version:
      type: string
      pattern: "semver"
      example: "1.2.0"

    status:
      type: enum
      values: [draft, active, deprecated]

    owner:
      type: Function
      description: "소유 Function"

    agent:
      type: Agent
      description: "실행 담당 에이전트"

    human_owner:
      type: HumanOwner
      description: "인간 책임자"

    objective:
      type: string
      description: "SOP의 목적"

    prerequisites:
      type: Prerequisite[]
      description: "전제 조건"

    steps:
      type: SOPStep[]
      description: "단계별 절차"

    exceptions:
      type: Exception[]
      description: "예외 처리 규칙"

    outputs:
      type: Output[]
      description: "산출물"

    related_resources:
      type: Resource[]
      description: "관련 리소스"

    triggers:
      type: Trigger[]
      description: "트리거 조건"

    tags:
      type: string[]
```

### 6. Skill (능력)

에이전트가 보유한 특정 능력 단위.

```yaml
Skill:
  description: "에이전트가 보유한 특정 능력"

  attributes:
    id:
      type: string
      pattern: "skill-{function}-{name}"
      example: "skill-brand-brief-writing"

    name:
      type: string
      example: "캠페인 브리프 작성"

    description:
      type: string

    function:
      type: Function

    required_resources:
      type: Resource[]
      description: "필요한 리소스들"

    required_tools:
      type: Tool[]
      description: "필요한 도구들"

    sops:
      type: SOP[]
      description: "관련 SOP들"

    examples:
      type: Example[]
      description: "사용 예시"

    input_schema:
      type: JSONSchema
      description: "입력 스키마"

    output_schema:
      type: JSONSchema
      description: "출력 스키마"
```

### 7. Resource (리소스)

에이전트가 접근하는 모든 데이터 소스.

```yaml
Resource:
  description: "에이전트가 접근하는 데이터 소스"

  types:
    github:
      uri_pattern: "github://{repo}/{path}"
      example: "github://company-os/sops/brand/campaign-brief.md"

    notion:
      uri_pattern: "notion://{database_or_page_id}"
      example: "notion://abc123def456"

    drive:
      uri_pattern: "drive://{folder}/{file}"
      example: "drive://finance/2025-budget.xlsx"

    figma:
      uri_pattern: "figma://{file_key}"
      example: "figma://abc123"

    sop:
      uri_pattern: "sop://{function}/{name}"
      example: "sop://brand/campaign-brief"

    doc:
      uri_pattern: "doc://{category}/{name}"
      example: "doc://policies/expense"

    skill:
      uri_pattern: "skill://{function}/{name}"
      example: "skill://hr/leave-policy"

  attributes:
    uri:
      type: string
      description: "리소스 URI"

    type:
      type: enum
      values: [github, notion, drive, figma, sop, doc, skill]

    access_level:
      type: enum
      values: [read, write, admin]

    sync_status:
      type: enum
      values: [synced, pending, conflict]
```

### 8. Tool (도구)

에이전트가 사용하는 외부 도구/API.

```yaml
Tool:
  description: "에이전트가 사용하는 외부 도구"

  attributes:
    id:
      type: string
      example: "tool-github-pr"

    name:
      type: string
      example: "GitHub PR 생성"

    mcp_server:
      type: string
      description: "제공하는 MCP 서버"

    operation:
      type: string
      example: "create_pr"

    input_schema:
      type: JSONSchema

    output_schema:
      type: JSONSchema

    requires_approval:
      type: boolean

    rate_limit:
      type: RateLimit
```

### 9. Objective (목표)

OKR 또는 프로젝트 인스턴스.

```yaml
Objective:
  description: "특정 목표 또는 프로젝트 인스턴스"

  attributes:
    id:
      type: string
      pattern: "obj-{year}-{quarter}-{number}"
      example: "obj-2025-Q1-001"

    title:
      type: string
      example: "신규 컬렉션 론칭"

    description:
      type: string

    period:
      type: Period
      values: [quarterly, annual, adhoc]

    owner_agent:
      type: Agent
      description: "Owner 에이전트"

    human_owner:
      type: HumanOwner
      description: "인간 책임자"

    participating_agents:
      type: Agent[]
      description: "참여 에이전트들"

    value_stream:
      type: ValueStream
      description: "관련 Value Stream"

    status:
      type: enum
      values: [planning, in_progress, completed, cancelled]

    key_results:
      type: KeyResult[]
      description: "핵심 결과"

    tasks:
      type: Task[]
      description: "관련 태스크들"

    history:
      type: HistoryEntry[]
      description: "실행 이력"

    related_resources:
      type: Resource[]
```

### 10. HumanOwner (인간 소유자)

시스템 내 인간 사용자.

```yaml
HumanOwner:
  description: "시스템 내 인간 사용자"

  attributes:
    id:
      type: string
      example: "user-jane-kim"

    email:
      type: string
      example: "jane@company.com"

    name:
      type: string
      example: "Jane Kim"

    slack_id:
      type: string
      example: "U12345678"

    roles:
      type: Role[]
      description: "보유 역할들"

    functions:
      type: Function[]
      description: "소속 Function들"

    permissions:
      type: Permission
```

---

## 관계 요약

| 관계 | From | To | 설명 |
|------|------|-----|------|
| owns | Function | Agent | Function은 여러 Agent를 소유 |
| owns | Function | SOP | Function은 SOP를 소유 |
| has_stages | ValueStream | ValueStreamStage | VS는 여러 단계로 구성 |
| participates_in | Function | ValueStream | 여러 Function이 VS에 참여 |
| owns | Agent | ValueStream | Agent가 VS의 Owner가 될 수 있음 |
| executes | Agent | ValueStreamStage | Agent가 단계를 실행 |
| follows | Agent | SOP | Agent는 SOP를 따름 |
| has | Agent | Skill | Agent는 여러 Skill 보유 |
| uses | Agent | Tool | Agent는 Tool을 사용 |
| uses | Skill | Tool | Skill은 Tool을 필요로 함 |
| references | SOP | Resource | SOP는 Resource를 참조 |
| drives | Objective | ValueStream | Objective가 VS를 구동 |
| delegates_to | Agent | Agent | Agent 간 위임 |
| approves | HumanOwner | SOPStep | 인간이 단계를 승인 |

---

## 매핑

### GitHub 디렉토리 매핑

```
/org
  /functions
    brand.yml        → Function 정의
    ops.yml          → Function 정의
  /value-streams
    collection-launch.yml  → ValueStream 정의
  /roles
    product-manager.yml    → Role 정의

/agents
  brand.yml          → Agent 정의
  ops.yml            → Agent 정의

/skills
  /brand
    brief-writing.yml     → Skill 정의

/sops
  /brand
    campaign-brief.md     → SOP 문서

/docs
  ...                → Resource (doc://)
```

### Notion 메타데이터 매핑

```yaml
notion_page:
  properties:
    function:
      type: select
      maps_to: Function.id

    value_stream:
      type: select
      maps_to: ValueStream.id

    status:
      type: select
      values: [Draft, Active, Stable, Official]
      maps_to: lifecycle_state

    owner:
      type: person
      maps_to: HumanOwner.email

    related_sop:
      type: url
      maps_to: SOP.github_url

    tags:
      type: multi_select
      maps_to: SOP.tags
```

### Slack 매핑

```yaml
slack:
  channels:
    "#func-{function_id}":
      maps_to: Function.slack_channel
      purpose: "Function 관련 대화"

    "#vs-{value_stream_id}":
      maps_to: ValueStream.slack_channel
      purpose: "Value Stream 관련 대화"

    "#obj-{objective_id}":
      maps_to: Objective.slack_channel
      purpose: "Objective/프로젝트 대화"

  mentions:
    "@{agent_id}":
      maps_to: Agent.slack_persona
      triggers: agent_invocation
```
