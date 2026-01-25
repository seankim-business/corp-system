# 엔티티 관계

## 관계 다이어그램

### 전체 관계도

```
                                         ┌──────────────┐
                                         │   Objective  │
                                         │    (OKR)     │
                                         └──────┬───────┘
                                                │
                                    drives      │      achieves
                         ┌──────────────────────┼──────────────────────┐
                         │                      │                      │
                         ▼                      ▼                      ▼
                  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                  │  KeyResult  │       │ ValueStream │       │    Task     │
                  └─────────────┘       └──────┬──────┘       └─────────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                   has_stages │    participates│      owns      │
                              │                │                │
                              ▼                ▼                ▼
┌──────────────┐      ┌───────────────┐  ┌─────────────┐  ┌─────────────┐
│   Function   │◀─────│ VSStage       │  │   Agent     │──│ HumanOwner  │
└──────┬───────┘      └───────┬───────┘  └──────┬──────┘  └─────────────┘
       │                      │                 │
       │ owns                 │ governed_by     │ follows/has
       │                      │                 │
       ▼                      ▼                 ▼
┌─────────────┐        ┌─────────────┐   ┌─────────────┐
│     SOP     │◀───────│     SOP     │   │    Skill    │
└──────┬──────┘        └─────────────┘   └──────┬──────┘
       │                                        │
       │ references                             │ uses
       │                                        │
       ▼                                        ▼
┌─────────────┐                          ┌─────────────┐
│  Resource   │◀─────────────────────────│    Tool     │
└─────────────┘                          └─────────────┘
```

---

## 관계 정의

### 1. Function ↔ Agent

```yaml
relationship:
  name: "Function-Agent"
  type: "1:N"
  description: "하나의 Function이 여러 Agent를 소유할 수 있음"

  from:
    entity: "Function"
    cardinality: "1"

  to:
    entity: "Agent"
    cardinality: "N"

  attributes:
    role: "primary | secondary"

  example:
    function: "func-brand"
    agents:
      - agent: "agent-brand"
        role: "primary"
      - agent: "agent-content"
        role: "secondary"

  constraints:
    - "모든 Agent는 정확히 하나의 Function에 속해야 함"
    - "Function에는 최소 하나의 primary Agent가 있어야 함"
```

### 2. Function ↔ SOP

```yaml
relationship:
  name: "Function-SOP"
  type: "1:N"
  description: "Function이 SOP를 소유하고 관리함"

  from:
    entity: "Function"
    cardinality: "1"

  to:
    entity: "SOP"
    cardinality: "N"

  attributes:
    ownership_type: "owner | contributor"

  example:
    function: "func-brand"
    sops:
      - sop: "sop-brand-campaign-brief"
        ownership_type: "owner"
      - sop: "sop-marketing-review"
        ownership_type: "contributor"

  constraints:
    - "모든 SOP는 정확히 하나의 owner Function이 있어야 함"
    - "SOP 변경은 owner Function의 Agent만 PR 생성 가능"
```

### 3. ValueStream ↔ Function

```yaml
relationship:
  name: "ValueStream-Function"
  type: "N:M"
  description: "여러 Function이 하나의 Value Stream에 참여"

  from:
    entity: "ValueStream"

  to:
    entity: "Function"

  attributes:
    role: string  # 참여 역할
    stages: Stage[]  # 담당 단계들

  example:
    value_stream: "vs-collection-launch"
    functions:
      - function: "func-product"
        role: "기획 및 조율"
        stages: ["stage-01-planning", "stage-04-launch"]
      - function: "func-brand"
        role: "콘텐츠 제작"
        stages: ["stage-02-design"]
      - function: "func-ops"
        role: "물류 준비"
        stages: ["stage-03-preparation"]

  constraints:
    - "Value Stream에는 최소 2개 이상의 Function이 참여해야 함"
```

### 4. ValueStream ↔ ValueStreamStage

```yaml
relationship:
  name: "ValueStream-Stage"
  type: "1:N (ordered)"
  description: "Value Stream은 순서가 있는 Stage들로 구성됨"

  from:
    entity: "ValueStream"
    cardinality: "1"

  to:
    entity: "ValueStreamStage"
    cardinality: "N"

  attributes:
    order: integer
    is_parallel: boolean  # 병렬 실행 가능 여부

  example:
    value_stream: "vs-collection-launch"
    stages:
      - stage: "stage-01-planning"
        order: 1
      - stage: "stage-02-design"
        order: 2
      - stage: "stage-03-preparation"
        order: 3
      - stage: "stage-04-launch"
        order: 4

  transitions:
    # 단계 간 전이 규칙
    - from: "stage-01-planning"
      to: "stage-02-design"
      condition: "기획서 승인 완료"

    - from: "stage-02-design"
      to: "stage-03-preparation"
      condition: "콘텐츠 승인 완료"
```

### 5. Agent ↔ Skill

```yaml
relationship:
  name: "Agent-Skill"
  type: "1:N"
  description: "Agent가 보유한 능력들"

  from:
    entity: "Agent"
    cardinality: "1"

  to:
    entity: "Skill"
    cardinality: "N"

  attributes:
    proficiency: "primary | secondary"

  example:
    agent: "agent-brand"
    skills:
      - skill: "skill-brand-brief-writing"
        proficiency: "primary"
      - skill: "skill-brand-content-planning"
        proficiency: "primary"
      - skill: "skill-brand-guideline-check"
        proficiency: "secondary"

  constraints:
    - "Skill은 여러 Agent가 공유할 수 있음"
    - "Agent의 Skill 목록은 해당 Agent의 Function과 일치해야 함"
```

### 6. Agent ↔ SOP

```yaml
relationship:
  name: "Agent-SOP"
  type: "N:M"
  description: "Agent가 따르는 SOP들"

  from:
    entity: "Agent"

  to:
    entity: "SOP"

  attributes:
    execution_role: "executor | reviewer | approver"

  example:
    agent: "agent-brand"
    sops:
      - sop: "sop-brand-campaign-brief"
        execution_role: "executor"
      - sop: "sop-marketing-campaign"
        execution_role: "reviewer"

  constraints:
    - "Agent는 자신의 Function이 소유한 SOP만 executor가 될 수 있음"
    - "다른 Function의 SOP는 reviewer 또는 contributor로만 참여"
```

### 7. Agent ↔ Agent (Delegation)

```yaml
relationship:
  name: "Agent-Delegation"
  type: "N:M"
  description: "Agent 간 위임 관계"

  from:
    entity: "Agent"
    role: "delegator"

  to:
    entity: "Agent"
    role: "delegatee"

  attributes:
    allowed_tasks: string[]  # 위임 가능한 작업 유형
    requires_approval: boolean

  example:
    delegator: "agent-brand"
    delegations:
      - delegatee: "agent-finance"
        allowed_tasks:
          - "예산 확인"
          - "비용 검토"
        requires_approval: false

      - delegatee: "agent-ops"
        allowed_tasks:
          - "물류 확인"
          - "재고 조회"
        requires_approval: false

  constraints:
    - "순환 위임 금지 (A→B→A)"
    - "위임 깊이 제한: 최대 3단계"
```

### 8. SOP ↔ Resource

```yaml
relationship:
  name: "SOP-Resource"
  type: "1:N"
  description: "SOP가 참조하는 리소스들"

  from:
    entity: "SOP"
    cardinality: "1"

  to:
    entity: "Resource"
    cardinality: "N"

  attributes:
    reference_type: "input | output | reference"
    required: boolean

  example:
    sop: "sop-brand-campaign-brief"
    resources:
      - resource: "doc://brand/guidelines"
        reference_type: "reference"
        required: true

      - resource: "notion://campaign-template"
        reference_type: "input"
        required: true

      - resource: "notion://campaign-briefs"
        reference_type: "output"
        required: true

  constraints:
    - "required=true인 리소스가 없으면 SOP 실행 불가"
```

### 9. Skill ↔ Tool

```yaml
relationship:
  name: "Skill-Tool"
  type: "N:M"
  description: "Skill이 필요로 하는 Tool들"

  from:
    entity: "Skill"

  to:
    entity: "Tool"

  attributes:
    purpose: string
    required: boolean

  example:
    skill: "skill-brand-brief-writing"
    tools:
      - tool: "search"
        purpose: "관련 문서 검색"
        required: true

      - tool: "notion_write"
        purpose: "브리프 저장"
        required: true

      - tool: "notify"
        purpose: "승인 요청"
        required: false

  constraints:
    - "Agent가 Skill을 사용하려면 해당 Tool 권한이 있어야 함"
```

### 10. Objective ↔ ValueStream

```yaml
relationship:
  name: "Objective-ValueStream"
  type: "N:1"
  description: "Objective가 특정 Value Stream을 구동"

  from:
    entity: "Objective"
    cardinality: "N"

  to:
    entity: "ValueStream"
    cardinality: "1"

  attributes:
    instance_id: string
    current_stage: Stage

  example:
    objective: "obj-2025-Q1-001"
    value_stream: "vs-collection-launch"
    current_stage: "stage-02-design"

  constraints:
    - "하나의 Objective는 하나의 Value Stream과 연결"
    - "같은 Value Stream에 여러 Objective가 동시에 진행될 수 있음"
```

### 11. HumanOwner ↔ Agent

```yaml
relationship:
  name: "HumanOwner-Agent"
  type: "1:N"
  description: "인간 소유자가 Agent를 관리"

  from:
    entity: "HumanOwner"
    cardinality: "1"

  to:
    entity: "Agent"
    cardinality: "N"

  attributes:
    ownership_type: "owner | backup"

  example:
    human: "jane@company.com"
    agents:
      - agent: "agent-brand"
        ownership_type: "owner"
      - agent: "agent-content"
        ownership_type: "backup"

  constraints:
    - "모든 Agent는 최소 하나의 human owner가 있어야 함"
    - "Owner는 Agent의 설정 변경 권한을 가짐"
```

---

## 관계 매트릭스

|  | Function | ValueStream | Stage | Agent | SOP | Skill | Tool | Resource | Objective | Human |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Function** | - | N:M | - | 1:N | 1:N | - | - | - | - | 1:N |
| **ValueStream** | N:M | - | 1:N | N:1 | N:M | - | - | - | 1:N | N:1 |
| **Stage** | - | N:1 | - | N:1 | N:1 | - | - | - | - | N:M |
| **Agent** | N:1 | N:M | 1:N | N:M* | N:M | 1:N | 1:N | 1:N | N:M | N:1 |
| **SOP** | N:1 | N:M | 1:N | N:M | - | - | - | 1:N | - | N:1 |
| **Skill** | N:1 | - | - | N:1 | N:M | - | N:M | N:M | - | - |
| **Tool** | - | - | - | N:M | - | N:M | - | - | - | - |
| **Resource** | - | - | - | N:M | N:M | N:M | - | - | - | - |
| **Objective** | - | N:1 | - | N:M | - | - | - | N:M | - | N:1 |
| **Human** | N:M | N:M | N:M | 1:N | N:M | - | - | - | 1:N | - |

*Agent ↔ Agent: 위임 관계 (N:M)

---

## 참조 무결성 규칙

### 삭제 규칙

| 엔티티 삭제 시 | 동작 |
|--------------|------|
| Function | 소속 Agent, SOP를 고아 상태로 만들 수 없음 → 삭제 전 재할당 필요 |
| Agent | 관련 Skill은 유지, 진행 중 Objective는 다른 Agent로 이관 |
| SOP | deprecated 상태로 변경 (soft delete) |
| ValueStream | deprecated 상태로 변경 (soft delete) |
| Objective | 완료 또는 취소 상태로 변경 (soft delete) |

### 제약 조건

```yaml
constraints:
  agent:
    - "반드시 하나의 Function에 속해야 함"
    - "최소 하나의 HumanOwner가 있어야 함"

  sop:
    - "반드시 하나의 owner Function이 있어야 함"
    - "status가 active인 SOP만 Agent가 실행 가능"

  value_stream:
    - "최소 2개 이상의 Stage가 있어야 함"
    - "최소 2개 이상의 Function이 참여해야 함"

  objective:
    - "반드시 owner_agent가 지정되어야 함"
    - "human_owner는 owner_agent의 human_owner와 일치해야 함"

  delegation:
    - "자기 자신에게 위임 불가"
    - "순환 위임 불가"
    - "최대 위임 깊이: 3단계"
```

---

## 관계 시각화 예시

### 컬렉션 론칭 프로젝트

```
Objective: obj-2025-Q1-001 (2025 S/S 컬렉션 론칭)
│
├── ValueStream: vs-collection-launch
│   │
│   ├── Stage 1: planning
│   │   ├── Executor: agent-product
│   │   ├── SOP: sop-product-collection-planning
│   │   └── Approver: product-lead@company.com
│   │
│   ├── Stage 2: design
│   │   ├── Executor: agent-brand
│   │   ├── SOP: sop-brand-content-production
│   │   └── Approver: jane@company.com
│   │
│   ├── Stage 3: preparation
│   │   ├── Executor: agent-ops
│   │   └── SOP: sop-ops-launch-preparation
│   │
│   └── Stage 4: launch
│       ├── Executor: agent-product
│       ├── SOP: sop-product-collection-launch
│       └── Approver: ceo@company.com
│
├── Participating Agents:
│   ├── agent-product (Owner)
│   ├── agent-brand
│   ├── agent-ops
│   └── agent-finance (예산 확인 위임)
│
└── Resources:
    ├── notion://2025-ss-project
    ├── drive://brand-assets/2025-ss
    └── github://sops/product/collection-launch.md
```
