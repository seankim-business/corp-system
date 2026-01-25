# Objective/프로젝트 구조

## 개요

Objective는 특정 목표 또는 프로젝트의 인스턴스입니다. 에이전트들이 협업하여 달성하는 구체적인 목표를 표현합니다.

---

## Objective 스키마

```yaml
# Objective 정의 스키마
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://company-os/schemas/objective.json"

type: object

required:
  - schema_version
  - kind
  - metadata
  - ownership
  - status

properties:
  schema_version:
    type: string
    const: "1.0"

  kind:
    type: string
    const: "Objective"

  metadata:
    type: object
    required: [id, title, description]
    properties:
      id:
        type: string
        pattern: "^obj-\\d{4}-Q[1-4]-\\d{3}$"
      title:
        type: string
      description:
        type: string
      created_at:
        type: string
        format: date-time
      due_date:
        type: string
        format: date

  period:
    type: object
    properties:
      type:
        type: string
        enum: [quarterly, annual, adhoc]
      start:
        type: string
        format: date
      end:
        type: string
        format: date

  ownership:
    type: object
    required: [owner_agent, human_owner]
    properties:
      owner_agent:
        type: string
      human_owner:
        type: string
      participating_agents:
        type: array
        items:
          type: object
          properties:
            agent:
              type: string
            role:
              type: string

  value_stream:
    type: string

  status:
    type: string
    enum: [planning, in_progress, blocked, completed, cancelled]

  current_stage:
    type: string

  key_results:
    type: array
    items:
      type: object
      properties:
        id:
          type: string
        description:
          type: string
        target:
          type: [string, number]
        current:
          type: [string, number, "null"]
        unit:
          type: string
        status:
          type: string
          enum: [on_track, at_risk, behind, achieved]

  history:
    type: array
    items:
      type: object
      properties:
        timestamp:
          type: string
          format: date-time
        agent:
          type: string
        action:
          type: string
        details:
          type: string

  slack:
    type: object
    properties:
      channel:
        type: string
      thread_ts:
        type: string

  related_resources:
    type: array
    items:
      type: object
      properties:
        type:
          type: string
        url:
          type: string
        label:
          type: string
```

---

## Objective 인스턴스 예시

```yaml
# Notion 또는 GitHub에 저장되는 Objective 인스턴스
schema_version: "1.0"
kind: "Objective"

metadata:
  id: "obj-2025-Q1-001"
  title: "2025 S/S 컬렉션 론칭"
  description: "봄/여름 신규 컬렉션의 성공적 론칭. 온라인 채널 우선, 오프라인 팝업 연계"
  created_at: "2025-01-10T09:00:00Z"
  due_date: "2025-03-01"

period:
  type: "quarterly"
  start: "2025-01-01"
  end: "2025-03-31"

ownership:
  owner_agent: "agent-product"
  human_owner: "product-lead@company.com"
  participating_agents:
    - agent: "agent-brand"
      role: "콘텐츠 제작"
    - agent: "agent-ops"
      role: "물류 준비"
    - agent: "agent-finance"
      role: "예산 관리"

value_stream: "vs-collection-launch"

status: "in_progress"
current_stage: "stage-02-design"

key_results:
  - id: "kr-001"
    description: "론칭 D-day 준수"
    target: "2025-03-01"
    current: "on_track"
    status: "on_track"

  - id: "kr-002"
    description: "론칭 1주차 매출"
    target: 50000000
    current: null
    unit: "KRW"
    status: "on_track"

  - id: "kr-003"
    description: "콘텐츠 에셋 제작 완료"
    target: "100%"
    current: "60%"
    status: "on_track"

history:
  - timestamp: "2025-01-10T09:00:00Z"
    agent: "agent-product"
    action: "objective_created"
    details: "Objective 생성"

  - timestamp: "2025-01-10T09:30:00Z"
    agent: "agent-product"
    action: "stage_started"
    details: "기획 단계 시작"

  - timestamp: "2025-01-15T14:00:00Z"
    agent: "agent-product"
    action: "stage_completed"
    details: "기획 단계 완료, 디자인 단계로 전환"

  - timestamp: "2025-01-15T14:30:00Z"
    agent: "agent-brand"
    action: "stage_started"
    details: "디자인/촬영 단계 시작"

  - timestamp: "2025-01-20T10:00:00Z"
    agent: "agent-brand"
    action: "task_completed"
    details: "촬영 완료, 편집 진행 중"

  - timestamp: "2025-01-22T16:00:00Z"
    agent: "agent-finance"
    action: "budget_check"
    details: "예산 사용률 64%, 정상 범위"

slack:
  channel: "#obj-2025-ss-launch"
  thread_ts: "1704891234.123456"

related_resources:
  - type: "notion"
    url: "https://notion.so/2025-ss-project"
    label: "프로젝트 페이지"

  - type: "drive"
    url: "https://drive.google.com/drive/folders/xxx"
    label: "에셋 폴더"

  - type: "github"
    url: "https://github.com/company-os/sops/product/collection-launch.md"
    label: "론칭 SOP"

  - type: "figma"
    url: "https://figma.com/file/xxx"
    label: "디자인 파일"
```

---

## 저장 위치

### 옵션 비교

| 위치 | 장점 | 단점 | 권장 용도 |
|------|------|------|----------|
| **Notion** | 실시간 업데이트, UI 편의 | 버전 관리 부족 | 활성 Objective |
| **GitHub** | 버전 관리, 이력 추적 | 실시간성 부족 | 완료된 Objective |

### 권장 방식

```yaml
storage_strategy:
  active_objectives:
    primary: "Notion (Objectives DB)"
    sync_to: "GitHub (archived/)"

  completed_objectives:
    primary: "GitHub (/objectives/archived/)"
    reference: "Notion (Read-only)"

notion_database:
  name: "Objectives"
  properties:
    - ID: formula
    - Title: title
    - Status: select
    - Owner Agent: select
    - Human Owner: person
    - Value Stream: relation
    - Due Date: date
    - Current Stage: select
    - Slack Channel: url
```

---

## Slack 통합

### Objective 전용 채널

```yaml
slack_integration:
  channel_naming: "#obj-{year}-{project-slug}"
  example: "#obj-2025-ss-launch"

  channel_purpose: |
    2025 S/S 컬렉션 론칭 프로젝트
    Owner: @product-lead
    Due: 2025-03-01
    Status: In Progress

  pinned_messages:
    - "📋 Objective 개요 및 KR"
    - "📊 진행 상황 대시보드 (자동 업데이트)"
    - "📎 관련 리소스 링크"
```

### 자동 업데이트

```yaml
auto_updates:
  triggers:
    - stage_change
    - kr_update
    - blocker_detected

  format:
    stage_change: |
      🔄 단계 전환
      {previous_stage} → {new_stage}
      담당: {responsible_agent}

    kr_update: |
      📊 KR 업데이트
      {kr_description}
      {previous_value} → {new_value} (목표: {target})

    blocker_detected: |
      ⚠️ 블로커 감지
      {blocker_description}
      담당: {responsible_agent}
      에스컬레이션 대상: {escalation_target}
```

---

## 워크플로 통합

### Value Stream → Objective

```yaml
relationship:
  value_stream:
    - 재사용 가능한 프로세스 템플릿
    - 단계(Stage)와 SOP 정의

  objective:
    - Value Stream의 구체적 인스턴스
    - 특정 기간, 특정 목표
    - 실제 실행 및 상태 추적

  mapping:
    value_stream: "vs-collection-launch"
    objective_instances:
      - "obj-2025-Q1-001"  # 2025 S/S
      - "obj-2025-Q3-001"  # 2025 F/W
      - "obj-2024-Q3-002"  # 2024 F/W (완료)
```

### 단계 전환 플로우

```
1. 현재 단계 완료 조건 확인
   └─ 체크리스트, 산출물, 승인

2. Owner Agent가 단계 완료 선언
   └─ Orchestrator에 알림

3. 다음 단계 시작
   └─ 담당 Agent 활성화
   └─ 컨텍스트 전달

4. 히스토리 기록
   └─ Objective.history에 추가

5. Slack 알림
   └─ 채널에 단계 전환 공지
```

---

## 대시보드

### Objective 상태 대시보드

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Objective Dashboard                                 │
│                     obj-2025-Q1-001                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  📋 2025 S/S 컬렉션 론칭                                                │
│  Status: 🟡 In Progress                                                 │
│  Due: 2025-03-01 (D-35)                                                │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  📊 Key Results                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ KR-001: 론칭 D-day 준수                           🟢 On Track │    │
│  │ KR-002: 론칭 1주차 매출 5천만원                   ⚪ Pending  │    │
│  │ KR-003: 콘텐츠 에셋 제작 ████████░░ 60%          🟢 On Track │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  🔄 Current Stage                                                       │
│  [✓] 기획 → [▶] 디자인/촬영 → [ ] 론칭 준비 → [ ] 론칭                 │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  👥 Participating Agents                                                │
│  • agent-product (Owner) - 기획 및 조율                                 │
│  • agent-brand - 콘텐츠 제작 (현재 활성)                                │
│  • agent-ops - 물류 준비                                                │
│  • agent-finance - 예산 관리                                            │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  📜 Recent Activity                                                     │
│  • 2025-01-22 16:00 - Finance: 예산 체크 완료                          │
│  • 2025-01-20 10:00 - Brand: 촬영 완료                                  │
│  • 2025-01-15 14:30 - Brand: 디자인 단계 시작                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 전체 Objective 현황

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Active Objectives                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🟡 In Progress (3)                                                     │
│  ├─ obj-2025-Q1-001: 2025 S/S 컬렉션 론칭 (D-35)                       │
│  ├─ obj-2025-Q1-002: Q1 마케팅 캠페인 (D-45)                           │
│  └─ obj-2025-Q1-003: 신규 CRM 시스템 도입 (D-60)                       │
│                                                                         │
│  🔴 Blocked (1)                                                         │
│  └─ obj-2025-Q1-004: 파트너십 계약 체결                                 │
│      └─ Blocker: 법무 검토 대기 중                                      │
│                                                                         │
│  🟢 Completed This Quarter (5)                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```
