# Skills 구조 설계

## 개요

`/skills` 디렉토리는 에이전트가 수행할 수 있는 능력(Skill)을 정의합니다. 각 Skill은 특정 유형의 질문에 답하거나 작업을 수행하는 방법을 명시합니다.

---

## 디렉토리 구조

```
/skills
├── _schema.yml                 # Skill 스키마 정의
├── brand/
│   ├── brief-writing.yml       # 브리프 작성
│   ├── content-planning.yml    # 콘텐츠 기획
│   └── guideline-check.yml     # 가이드라인 검토
├── product/
│   ├── collection-planning.yml # 컬렉션 기획
│   └── roadmap-management.yml  # 로드맵 관리
├── ops/
│   ├── incident-response.yml   # 인시던트 대응
│   └── customer-inquiry.yml    # 고객 문의 처리
├── finance/
│   ├── budget-check.yml        # 예산 확인
│   └── expense-approval.yml    # 비용 승인
├── hr/
│   ├── leave-policy.yml        # 휴가 정책
│   └── onboarding-guide.yml    # 온보딩 가이드
└── engineering/
    ├── code-review.yml         # 코드 리뷰
    └── incident-runbook.yml    # 인시던트 런북
```

---

## Skill 스키마

```yaml
# /skills/_schema.yml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://company-os/schemas/skill.json"

type: object

required:
  - schema_version
  - kind
  - metadata
  - ownership
  - triggers
  - required_resources
  - required_tools

properties:
  schema_version:
    type: string
    const: "1.0"

  kind:
    type: string
    const: "Skill"

  metadata:
    type: object
    required: [id, name, description, version]
    properties:
      id:
        type: string
        pattern: "^skill-[a-z]+-[a-z-]+$"
      name:
        type: string
      description:
        type: string
      version:
        type: string
        pattern: "^\\d+\\.\\d+\\.\\d+$"

  ownership:
    type: object
    required: [function]
    properties:
      function:
        type: string
      agents:
        type: array
        items:
          type: string

  triggers:
    type: object
    properties:
      questions:
        type: array
        items:
          type: string
      slack_patterns:
        type: array
        items:
          type: string
      conditions:
        type: array
        items:
          type: string

  required_resources:
    type: object
    properties:
      github:
        type: array
      notion:
        type: array
      drive:
        type: array

  required_tools:
    type: array
    items:
      type: object
      properties:
        tool:
          type: string
        purpose:
          type: string
        required:
          type: boolean

  related_sops:
    type: array
    items:
      type: string

  input_schema:
    type: object

  output_schema:
    type: object

  examples:
    type: array
```

---

## Skill 템플릿

```yaml
# /skills/{function}/{skill-name}.yml
schema_version: "1.0"
kind: "Skill"

metadata:
  id: "skill-{function}-{name}"
  name: "스킬 이름"
  description: "이 스킬이 무엇을 하는지 설명"
  version: "1.0.0"

ownership:
  function: "func-{function}"
  agents:
    - "agent-{function}"

# 이 스킬이 트리거되는 조건
triggers:
  # 자연어 질문 패턴
  questions:
    - "~해줘"
    - "~알려줘"

  # Slack 메시지 패턴
  slack_patterns:
    - "키워드1"
    - "키워드2"

  # 조건 기반 트리거
  conditions:
    - "특정 상태일 때"

# 필요한 리소스
required_resources:
  github:
    - path: "/sops/{function}/{sop}.md"
      purpose: "SOP 참조"

  notion:
    - database: "데이터베이스 이름"
      purpose: "데이터 조회"

  drive:
    - folder: "폴더 이름"
      purpose: "파일 참조"

# 필요한 도구
required_tools:
  - tool: "search"
    purpose: "문서 검색"
    required: true

  - tool: "notify"
    purpose: "결과 알림"
    required: false

# 관련 SOP
related_sops:
  - "sop://{function}/{sop-name}"

# 입력 스키마
input_schema:
  type: object
  properties:
    param1:
      type: string
      description: "파라미터 설명"
  required:
    - param1

# 출력 스키마
output_schema:
  type: object
  properties:
    result:
      type: string
    next_steps:
      type: array

# 사용 예시
examples:
  - name: "예시 1"
    input:
      param1: "값"
    expected_output:
      result: "결과"
      next_steps: ["다음 단계"]
```

---

## Skill 예시

### Brand - 캠페인 브리프 작성

```yaml
# /skills/brand/brief-writing.yml
schema_version: "1.0"
kind: "Skill"

metadata:
  id: "skill-brand-brief-writing"
  name: "캠페인 브리프 작성"
  description: "캠페인 요청을 받아 구조화된 브리프 문서를 작성하는 능력"
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
    - "브리프 초안 잡아줘"

  slack_patterns:
    - "브리프"
    - "brief"
    - "캠페인 기획"

  conditions:
    - "Notion Campaign Requests DB에 새 요청 생성"

required_resources:
  github:
    - path: "/sops/brand/campaign-brief.md"
      purpose: "SOP 절차 참조"
    - path: "/docs/brand/guidelines.md"
      purpose: "브랜드 가이드라인 확인"

  notion:
    - database: "Campaign Requests"
      purpose: "요청 정보 조회"
    - database: "Past Campaigns"
      purpose: "유사 캠페인 검색"
    - database: "Campaign Briefs"
      purpose: "브리프 저장"

  drive:
    - folder: "Campaign Archives"
      purpose: "과거 캠페인 자료 참조"

required_tools:
  - tool: "search"
    purpose: "관련 문서 검색"
    required: true

  - tool: "notion_read"
    purpose: "캠페인 요청 조회"
    required: true

  - tool: "notion_write"
    purpose: "브리프 초안 저장"
    required: true

  - tool: "notify"
    purpose: "승인 요청 알림"
    required: false

related_sops:
  - "sop://brand/campaign-brief"

input_schema:
  type: object
  properties:
    campaign_request:
      type: string
      description: "캠페인 요청 내용 또는 요청 ID"
    deadline:
      type: string
      format: date
      description: "캠페인 론칭 희망일"
    budget_range:
      type: object
      properties:
        min:
          type: number
        max:
          type: number
      description: "예상 예산 범위"
  required:
    - campaign_request

output_schema:
  type: object
  properties:
    brief_url:
      type: string
      format: uri
      description: "생성된 브리프 Notion URL"
    summary:
      type: string
      description: "브리프 요약"
    status:
      type: string
      enum: [draft, pending_approval, approved]
    next_steps:
      type: array
      items:
        type: string
      description: "다음 단계 안내"

examples:
  - name: "봄 시즌 캠페인"
    input:
      campaign_request: "봄 시즌 신상품 론칭 캠페인 기획해줘"
      deadline: "2025-03-01"
      budget_range:
        min: 5000000
        max: 10000000
    expected_output:
      brief_url: "https://notion.so/campaign-brief-xxx"
      summary: "2025 S/S 신상품 론칭 캠페인. 타겟: 2535 여성, 채널: 인스타그램/유튜브"
      status: "pending_approval"
      next_steps:
        - "Creative Director 승인 대기"
        - "승인 후 콘텐츠 제작 시작"

  - name: "긴급 프로모션"
    input:
      campaign_request: "이번 주말 긴급 프로모션 캠페인"
      deadline: "2025-02-01"
    expected_output:
      brief_url: "https://notion.so/campaign-brief-yyy"
      summary: "주말 긴급 프로모션 캠페인 (간소화 버전)"
      status: "draft"
      next_steps:
        - "예산 확인 필요"
        - "간소화 브리프로 진행"
```

### Finance - 예산 확인

```yaml
# /skills/finance/budget-check.yml
schema_version: "1.0"
kind: "Skill"

metadata:
  id: "skill-finance-budget-check"
  name: "예산 확인"
  description: "특정 부서/프로젝트의 예산 현황을 조회하고 보고"
  version: "1.0.0"

ownership:
  function: "func-finance"
  agents:
    - "agent-finance"

triggers:
  questions:
    - "예산 확인해줘"
    - "남은 예산이 얼마야"
    - "이번 달 예산 현황"
    - "프로젝트 예산 조회"

  slack_patterns:
    - "예산"
    - "budget"
    - "비용"

required_resources:
  github:
    - path: "/sops/finance/budget-check.md"
      purpose: "SOP 참조"
    - path: "/docs/finance/budget-policy.md"
      purpose: "예산 정책 참조"

  drive:
    - folder: "Finance/Budgets"
      purpose: "예산 시트 조회"

  notion:
    - database: "Projects"
      purpose: "프로젝트별 예산 연결"

required_tools:
  - tool: "drive_read"
    purpose: "예산 시트 조회"
    required: true

  - tool: "search"
    purpose: "관련 정책 검색"
    required: false

related_sops:
  - "sop://finance/budget-check"

input_schema:
  type: object
  properties:
    target:
      type: string
      description: "조회 대상 (부서명 또는 프로젝트명)"
    period:
      type: string
      description: "조회 기간 (예: 2025-Q1, 2025-01)"
  required:
    - target

output_schema:
  type: object
  properties:
    target:
      type: string
    period:
      type: string
    total_budget:
      type: number
    spent:
      type: number
    remaining:
      type: number
    utilization_rate:
      type: number
    status:
      type: string
      enum: [healthy, warning, over]
    breakdown:
      type: array
      items:
        type: object
        properties:
          category:
            type: string
          amount:
            type: number

examples:
  - name: "브랜드팀 예산"
    input:
      target: "브랜드팀"
      period: "2025-Q1"
    expected_output:
      target: "브랜드팀"
      period: "2025-Q1"
      total_budget: 50000000
      spent: 32000000
      remaining: 18000000
      utilization_rate: 64
      status: "healthy"
      breakdown:
        - category: "콘텐츠 제작"
          amount: 20000000
        - category: "광고비"
          amount: 12000000
```

### HR - 휴가 정책 안내

```yaml
# /skills/hr/leave-policy.yml
schema_version: "1.0"
kind: "Skill"

metadata:
  id: "skill-hr-leave-policy"
  name: "휴가 정책 안내"
  description: "휴가 관련 정책과 잔여 휴가 정보를 안내"
  version: "1.0.0"

ownership:
  function: "func-hr"
  agents:
    - "agent-hr"

triggers:
  questions:
    - "휴가 며칠 남았어"
    - "연차 사용하려면"
    - "휴가 정책이 뭐야"
    - "병가는 어떻게 써"

  slack_patterns:
    - "휴가"
    - "연차"
    - "병가"
    - "leave"

required_resources:
  github:
    - path: "/docs/policies/leave.md"
      purpose: "휴가 정책 참조"
    - path: "/sops/hr/leave-request.md"
      purpose: "휴가 신청 절차"

  notion:
    - database: "Employees"
      purpose: "직원 정보 조회"

required_tools:
  - tool: "search"
    purpose: "정책 검색"
    required: true

  - tool: "notion_read"
    purpose: "직원 정보 조회"
    required: false

related_sops:
  - "sop://hr/leave-request"

input_schema:
  type: object
  properties:
    question:
      type: string
      description: "휴가 관련 질문"
    employee_id:
      type: string
      description: "직원 ID (잔여 휴가 조회 시)"

output_schema:
  type: object
  properties:
    answer:
      type: string
      description: "질문에 대한 답변"
    policy_reference:
      type: string
      description: "참조한 정책 문서"
    remaining_leave:
      type: object
      properties:
        annual:
          type: number
        sick:
          type: number
    next_steps:
      type: array
      items:
        type: string

examples:
  - name: "연차 잔여일 조회"
    input:
      question: "연차 며칠 남았어?"
      employee_id: "emp-001"
    expected_output:
      answer: "현재 연차 잔여일은 12일입니다."
      policy_reference: "doc://policies/leave"
      remaining_leave:
        annual: 12
        sick: 3
      next_steps:
        - "휴가 신청은 Notion에서 진행"
        - "3일 이상 휴가는 2주 전 신청"
```

---

## Skill 활용 방식

### 1. 에이전트 라우팅

Orchestrator가 사용자 요청을 분석하여 적절한 Skill을 가진 Agent에게 라우팅:

```
User: "캠페인 브리프 작성해줘"
     ↓
Orchestrator:
  - triggers.questions 매칭: "캠페인 브리프 작성해줘"
  - skill-brand-brief-writing 선택
  - agent-brand에 위임
     ↓
Brand Agent: skill 실행
```

### 2. MCP 리소스로 노출

```yaml
# MCP 리소스 매핑
resources:
  - uri: "skill://brand/brief-writing"
    name: "캠페인 브리프 작성 스킬"
    mimeType: "application/yaml"
    path: "/skills/brand/brief-writing.yml"
```

### 3. Skill 조합

복잡한 작업은 여러 Skill을 조합:

```yaml
workflow:
  name: "컬렉션 론칭 플랜"
  skills:
    - skill: "skill-product-collection-planning"
      output_to: "planning_result"
    - skill: "skill-brand-brief-writing"
      input_from: "planning_result.concept"
    - skill: "skill-finance-budget-check"
      input:
        target: "from:planning_result.project_name"
```
