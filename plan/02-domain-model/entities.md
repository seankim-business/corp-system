# 엔티티 상세 정의

## Function (기능 조직)

### 정의 파일 형식

```yaml
# /org/functions/brand.yml
schema_version: "1.0"
kind: "Function"

metadata:
  id: "func-brand"
  name: "브랜드/크리에이티브"
  description: "브랜드 전략, 크리에이티브 디렉션, 콘텐츠 제작 담당"

owner:
  human: "jane@company.com"
  title: "Creative Director"

contact:
  slack_channel: "#func-brand-creative"
  email_alias: "brand@company.com"

agents:
  primary: "agent-brand"
  secondary:
    - "agent-content"

sops:
  owned:
    - "sop://brand/campaign-brief"
    - "sop://brand/content-production"
    - "sop://brand/asset-request"

value_streams:
  participates_in:
    - "vs-collection-launch"
    - "vs-campaign-execution"

resources:
  github:
    - "/sops/brand/*"
    - "/docs/brand/*"
  notion:
    - "Brand Wiki"
    - "Creative Projects"
  drive:
    - "Brand Assets"
    - "Campaign Archives"

metrics:
  - name: "콘텐츠 생산량"
    unit: "pieces/month"
  - name: "브랜드 일관성 점수"
    unit: "1-10"
```

### Kyndof Function 목록

| ID | 이름 | 설명 | 핵심 에이전트 |
|----|------|------|--------------|
| func-brand | 브랜드/크리에이티브 | 브랜드 전략, 콘텐츠 제작 | agent-brand |
| func-product | 제품기획 | 제품 전략, 로드맵 | agent-product |
| func-ops | CS/운영 | 고객지원, 운영 관리 | agent-ops |
| func-finance | 재무/회계 | 예산, 정산, 회계 | agent-finance |
| func-hr | 인사 | 채용, 온보딩, 인사관리 | agent-hr |
| func-engineering | 엔지니어링 | 개발, 인프라 | agent-engineering |

---

## Value Stream (가치 흐름)

### 정의 파일 형식

```yaml
# /org/value-streams/collection-launch.yml
schema_version: "1.0"
kind: "ValueStream"

metadata:
  id: "vs-collection-launch"
  name: "신규 컬렉션 론칭"
  description: "신규 컬렉션의 기획부터 론칭까지의 전체 프로세스"

ownership:
  owner_agent: "agent-product"
  human_owner: "product-lead@company.com"

participating_functions:
  - function: "func-product"
    role: "기획 및 조율"
  - function: "func-brand"
    role: "콘텐츠 제작"
  - function: "func-ops"
    role: "물류 및 재고"
  - function: "func-finance"
    role: "예산 관리"

trigger:
  type: "manual"
  conditions:
    - "분기별 컬렉션 기획 시작"
    - "신규 파트너십 체결"

stages:
  - id: "stage-01-planning"
    name: "기획"
    order: 1
    executor: "agent-product"
    sop: "sop://product/collection-planning"
    duration_estimate: "2 weeks"
    outputs:
      - "컬렉션 기획서"
      - "예산 초안"

  - id: "stage-02-design"
    name: "디자인/촬영"
    order: 2
    executor: "agent-brand"
    sop: "sop://brand/content-production"
    duration_estimate: "3 weeks"
    approval_required: true
    approvers:
      - "creative-director@company.com"
    outputs:
      - "제품 이미지"
      - "콘텐츠 에셋"

  - id: "stage-03-preparation"
    name: "론칭 준비"
    order: 3
    executor: "agent-ops"
    sop: "sop://ops/launch-preparation"
    duration_estimate: "1 week"
    outputs:
      - "재고 확보 완료"
      - "물류 세팅 완료"

  - id: "stage-04-launch"
    name: "론칭"
    order: 4
    executor: "agent-product"
    sop: "sop://product/collection-launch"
    approval_required: true
    approvers:
      - "ceo@company.com"
    outputs:
      - "론칭 완료"
      - "성과 리포트"

kpis:
  - name: "론칭 정시 달성률"
    target: "95%"
  - name: "초기 판매량"
    target: "목표 대비 100%"

related_sops:
  - "sop://product/collection-planning"
  - "sop://brand/content-production"
  - "sop://ops/launch-preparation"
  - "sop://product/collection-launch"

slack_channel: "#vs-collection-launch"
```

### Kyndof Value Stream 목록

| ID | 이름 | 참여 Function | Owner |
|----|------|--------------|-------|
| vs-collection-launch | 신규 컬렉션 론칭 | product, brand, ops, finance | agent-product |
| vs-customer-support | 고객 지원 | ops, product | agent-ops |
| vs-employee-lifecycle | 직원 생애주기 | hr, ops | agent-hr |
| vs-campaign-execution | 캠페인 실행 | brand, product, finance | agent-brand |
| vs-financial-close | 월/분기 마감 | finance, ops | agent-finance |

---

## Agent (에이전트)

### 정의 파일 형식

```yaml
# /agents/brand.yml
schema_version: "1.0"
kind: "Agent"

metadata:
  id: "agent-brand"
  name: "Brand Agent"
  description: "브랜드 전략, 크리에이티브 디렉션, 콘텐츠 관련 업무 담당"
  version: "1.0.0"

ownership:
  function: "func-brand"
  human_owner: "jane@company.com"

capabilities:
  primary:
    - "캠페인 브리프 작성"
    - "콘텐츠 기획"
    - "브랜드 가이드라인 검토"
  secondary:
    - "에셋 관리"
    - "크리에이티브 피드백"

skills:
  - "skill://brand/brief-writing"
  - "skill://brand/content-planning"
  - "skill://brand/guideline-check"

sops:
  follows:
    - "sop://brand/campaign-brief"
    - "sop://brand/content-production"
    - "sop://brand/asset-request"

value_streams:
  owner_of: []
  participates_in:
    - "vs-collection-launch"
    - "vs-campaign-execution"

permissions:
  read:
    - "/sops/brand/*"
    - "/sops/marketing/*"
    - "/docs/product/*"
    - "/docs/brand/*"
  write:
    - "/sops/brand/*"  # PR 통해서만
  notion:
    - database: "Brand Projects"
      access: "read_write"
    - database: "Campaign Tracker"
      access: "read"
  drive:
    - folder: "Brand Assets"
      access: "read"
    - folder: "Campaign Archives"
      access: "read"

tools:
  mcp:
    - "search"           # 지식 검색
    - "create_pr"        # PR 생성
    - "notify"           # Slack 알림
    - "notion_read"      # Notion 읽기
    - "notion_write"     # Notion 쓰기
    - "drive_read"       # Drive 읽기

delegation:
  can_delegate_to:
    - agent: "agent-finance"
      for: ["예산 확인", "비용 검토"]
    - agent: "agent-ops"
      for: ["물류 확인", "재고 상태"]
  can_receive_from:
    - "agent-product"
    - "agent-orchestrator"

behavior:
  response_style: "professional, creative"
  language: "ko"
  approval_escalation:
    default_approver: "jane@company.com"
    timeout: "24h"

slack_persona:
  display_name: "Brand Agent"
  emoji: ":art:"
  prefix: "[Brand]"

restrictions:
  cannot_access:
    - "/org/hr/*"
    - "/docs/finance/confidential/*"
  cannot_do:
    - "인사 정보 조회"
    - "재무 데이터 수정"
    - "외부 이메일 발송"
```

### Kyndof Agent 목록

| ID | 이름 | Function | 핵심 능력 |
|----|------|----------|----------|
| agent-orchestrator | Orchestrator | - | 라우팅, 조정, 승인 관리 |
| agent-brand | Brand Agent | func-brand | 브리프 작성, 콘텐츠 기획 |
| agent-product | Product Agent | func-product | 기획, 로드맵 관리 |
| agent-ops | Ops Agent | func-ops | 운영, 고객지원 |
| agent-finance | Finance Agent | func-finance | 예산, 정산, 리포팅 |
| agent-hr | HR Agent | func-hr | 채용, 온보딩, 인사 |
| agent-engineering | Engineering Agent | func-engineering | 기술 문서, ADR |

---

## SOP (표준 운영 절차)

### 정의 파일 형식

```markdown
---
schema_version: "1.0"
kind: "SOP"

metadata:
  id: "sop-brand-campaign-brief"
  title: "캠페인 브리프 작성"
  version: "1.2.0"
  status: "active"

ownership:
  function: "func-brand"
  agent: "agent-brand"
  human_owner: "jane@company.com"

triggers:
  - type: "slack_mention"
    pattern: "캠페인 브리프"
  - type: "notion_status"
    database: "Campaign Requests"
    status: "Requested"

tags:
  - "brand"
  - "campaign"
  - "creative"

approval_required: true
estimated_duration: "2시간"
---

# 캠페인 브리프 작성

## 목적

마케팅 캠페인의 방향성, 목표, 요구사항을 정리한 브리프 문서 작성

## 전제 조건 (Prerequisites)

- [ ] 캠페인 요청이 접수됨
- [ ] 대략적인 예산 범위가 파악됨
- [ ] 캠페인 일정 (론칭일)이 확정됨

## 단계별 절차

### Step 1: 정보 수집

**담당**: agent-brand

**입력**:
- 캠페인 요청서 (Notion 또는 Slack 메시지)

**수행 작업**:
1. 캠페인 목적 파악
2. 타겟 오디언스 정의
3. 기존 유사 캠페인 검색
4. 예산 정보 조회 (위임: agent-finance)

**출력**:
- 정보 수집 요약 문서

---

### Step 2: 브리프 초안 작성

**담당**: agent-brand

**수행 작업**:
1. 브리프 템플릿 로드
2. 수집된 정보로 각 섹션 작성
3. 브랜드 가이드라인 준수 여부 검토

**출력**:
- 브리프 초안 (Notion Draft)

---

### Step 3: 승인 요청

**담당**: human (Creative Director)

> **승인 포인트**: 사전 승인 필요
>
> 승인자: Creative Director
> 채널: Slack DM 또는 #func-brand-creative

**승인 기준**:
- 캠페인 목표가 명확한가?
- 예산이 적절한가?
- 브랜드 가이드라인 준수?

---

### Step 4: 최종 발행

**담당**: agent-brand

**수행 작업**:
1. 승인 상태 업데이트
2. Notion 페이지 상태 → "Active"
3. 관련 채널에 공유

## 예외 처리

| 상황 | 대응 |
|------|------|
| 예산 미확정 | Finance Agent에 확인 요청 후 대기 |
| 승인 거절 | 피드백 반영 후 Step 2부터 재시작 |
| 긴급 캠페인 | 간소화 템플릿 사용 |

## 관련 리소스

- [브랜드 가이드라인](doc://brand/guidelines)
- [캠페인 템플릿](notion://campaign-template)

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.2.0 | 2025-01-15 | 승인 프로세스 추가 | Jane Kim |
| 1.1.0 | 2025-01-01 | Finance 연동 추가 | Jane Kim |
| 1.0.0 | 2024-12-01 | 최초 작성 | Jane Kim |
```

---

## Skill (능력)

### 정의 파일 형식

```yaml
# /skills/brand/brief-writing.yml
schema_version: "1.0"
kind: "Skill"

metadata:
  id: "skill-brand-brief-writing"
  name: "캠페인 브리프 작성"
  description: "캠페인 요청을 받아 브리프 문서를 작성하는 능력"
  version: "1.0.0"

ownership:
  function: "func-brand"
  agents:
    - "agent-brand"

triggers:
  questions:
    - "캠페인 브리프 작성해줘"
    - "마케팅 브리프 만들어줘"
    - "캠페인 기획서 필요해"
  slack_patterns:
    - "브리프"
    - "campaign brief"

required_resources:
  github:
    - path: "/sops/brand/campaign-brief.md"
      purpose: "SOP 참조"
    - path: "/docs/brand/guidelines.md"
      purpose: "가이드라인 확인"
  notion:
    - database: "Campaign Requests"
      purpose: "요청 정보 조회"
    - database: "Past Campaigns"
      purpose: "유사 사례 검색"
  drive:
    - folder: "Campaign Archives"
      purpose: "과거 캠페인 참조"

required_tools:
  - tool: "search"
    purpose: "관련 문서 검색"
  - tool: "notion_read"
    purpose: "캠페인 요청 조회"
  - tool: "notion_write"
    purpose: "브리프 초안 저장"
  - tool: "notify"
    purpose: "승인 요청"

related_sops:
  - "sop://brand/campaign-brief"

input_schema:
  type: object
  properties:
    campaign_request:
      type: string
      description: "캠페인 요청 내용"
    deadline:
      type: string
      format: date
    budget_range:
      type: object
      properties:
        min: { type: number }
        max: { type: number }
  required:
    - campaign_request

output_schema:
  type: object
  properties:
    brief_url:
      type: string
      description: "생성된 브리프 Notion URL"
    summary:
      type: string
      description: "브리프 요약"
    next_steps:
      type: array
      items: { type: string }

examples:
  - input:
      campaign_request: "봄 시즌 신상품 론칭 캠페인 기획해줘"
      deadline: "2025-03-01"
    expected_output:
      brief_url: "https://notion.so/..."
      summary: "2025 S/S 신상품 론칭 캠페인 브리프 초안 완성"
```

---

## Objective (목표)

### 정의/인스턴스 형식

```yaml
# 활성 Objective 인스턴스 (Notion DB 또는 GitHub에 저장)
schema_version: "1.0"
kind: "Objective"

metadata:
  id: "obj-2025-Q1-001"
  title: "2025 S/S 컬렉션 론칭"
  description: "봄/여름 신규 컬렉션 성공적 론칭"
  created_at: "2025-01-10"

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
    current: "on-track"

  - id: "kr-002"
    description: "론칭 1주차 매출"
    target: 50000000
    current: null
    unit: "KRW"

tasks:
  notion_database: "2025 SS Collection Tasks"
  filter:
    objective_id: "obj-2025-Q1-001"

history:
  - timestamp: "2025-01-10T09:00:00Z"
    agent: "agent-product"
    action: "objective_created"
    details: "Objective 생성"

  - timestamp: "2025-01-15T14:30:00Z"
    agent: "agent-brand"
    action: "stage_started"
    details: "디자인/촬영 단계 시작"

slack:
  channel: "#obj-2025-ss-launch"
  thread_ts: "1704891234.123456"

related_resources:
  - type: "notion"
    url: "https://notion.so/..."
    label: "프로젝트 페이지"
  - type: "drive"
    url: "https://drive.google.com/..."
    label: "에셋 폴더"
```
