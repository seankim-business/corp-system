# 에이전트 카탈로그 스키마

## 개요

에이전트를 코드가 아닌 YAML 설정 파일로 정의합니다. 이를 통해 기술 스택 변경 시에도 에이전트 정의를 그대로 유지할 수 있습니다.

---

## 스키마 정의

```yaml
# /agents/_schema.yml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://company-os/schemas/agent.json"

type: object

required:
  - schema_version
  - kind
  - metadata
  - ownership
  - capabilities
  - permissions

properties:
  schema_version:
    type: string
    const: "1.0"

  kind:
    type: string
    const: "Agent"

  metadata:
    $ref: "#/definitions/AgentMetadata"

  ownership:
    $ref: "#/definitions/AgentOwnership"

  capabilities:
    $ref: "#/definitions/AgentCapabilities"

  skills:
    type: array
    items:
      type: string

  sops:
    $ref: "#/definitions/AgentSOPs"

  value_streams:
    $ref: "#/definitions/AgentValueStreams"

  permissions:
    $ref: "#/definitions/AgentPermissions"

  tools:
    $ref: "#/definitions/AgentTools"

  delegation:
    $ref: "#/definitions/AgentDelegation"

  behavior:
    $ref: "#/definitions/AgentBehavior"

  slack_persona:
    $ref: "#/definitions/SlackPersona"

  restrictions:
    $ref: "#/definitions/AgentRestrictions"

definitions:
  AgentMetadata:
    type: object
    required: [id, name, description]
    properties:
      id:
        type: string
        pattern: "^agent-[a-z-]+$"
      name:
        type: string
      description:
        type: string
      version:
        type: string
        pattern: "^\\d+\\.\\d+\\.\\d+$"

  AgentOwnership:
    type: object
    required: [function, human_owner]
    properties:
      function:
        type: string
      human_owner:
        type: string
        format: email

  AgentCapabilities:
    type: object
    properties:
      primary:
        type: array
        items:
          type: string
      secondary:
        type: array
        items:
          type: string

  AgentPermissions:
    type: object
    properties:
      read:
        type: array
        items:
          type: string
      write:
        type: array
        items:
          type: string
      notion:
        type: array
      drive:
        type: array

  AgentTools:
    type: object
    properties:
      mcp:
        type: array
        items:
          type: string

  AgentDelegation:
    type: object
    properties:
      can_delegate_to:
        type: array
      can_receive_from:
        type: array

  SlackPersona:
    type: object
    properties:
      display_name:
        type: string
      emoji:
        type: string
      prefix:
        type: string

  AgentRestrictions:
    type: object
    properties:
      cannot_access:
        type: array
        items:
          type: string
      cannot_do:
        type: array
        items:
          type: string
```

---

## 에이전트 정의 템플릿

```yaml
# /agents/{name}.yml
schema_version: "1.0"
kind: "Agent"

# ============================================
# 기본 정보
# ============================================
metadata:
  id: "agent-{name}"
  name: "{Display Name}"
  description: "에이전트 역할 설명"
  version: "1.0.0"

# ============================================
# 소유권
# ============================================
ownership:
  function: "func-{name}"
  human_owner: "owner@company.com"

# ============================================
# 능력
# ============================================
capabilities:
  primary:
    - "주요 능력 1"
    - "주요 능력 2"
  secondary:
    - "보조 능력 1"

# ============================================
# 스킬 (참조)
# ============================================
skills:
  - "skill://{function}/skill-1"
  - "skill://{function}/skill-2"

# ============================================
# SOP (참조)
# ============================================
sops:
  follows:
    - "sop://{function}/sop-1"
    - "sop://{function}/sop-2"

# ============================================
# Value Stream 참여
# ============================================
value_streams:
  owner_of:
    - "vs-{name}-1"
  participates_in:
    - "vs-other-1"

# ============================================
# 권한
# ============================================
permissions:
  read:
    - "/sops/{function}/*"
    - "/docs/{function}/*"
    - "/skills/{function}/*"
  write:
    - "/sops/{function}/*"  # PR 통해서만
  notion:
    - database: "Database Name"
      access: "read_write"
  drive:
    - folder: "Folder Name"
      access: "read"

# ============================================
# 도구
# ============================================
tools:
  mcp:
    - "search"
    - "create_pr"
    - "notify_slack"
    - "notion_read"
    - "notion_write"

# ============================================
# 위임
# ============================================
delegation:
  can_delegate_to:
    - agent: "agent-other"
      for:
        - "위임 작업 1"
        - "위임 작업 2"
  can_receive_from:
    - "agent-orchestrator"

# ============================================
# 행동 설정
# ============================================
behavior:
  response_style: "professional"
  language: "ko"
  approval_escalation:
    default_approver: "owner@company.com"
    timeout: "24h"

# ============================================
# Slack 페르소나
# ============================================
slack_persona:
  display_name: "{Agent Name}"
  emoji: ":emoji:"
  prefix: "[{Prefix}]"

# ============================================
# 제한
# ============================================
restrictions:
  cannot_access:
    - "/org/hr/*"
    - "/docs/finance/confidential/*"
  cannot_do:
    - "제한 행동 1"
    - "제한 행동 2"
```

---

## 에이전트 정의 예시

### Orchestrator

```yaml
# /agents/orchestrator.yml
schema_version: "1.0"
kind: "Agent"

metadata:
  id: "agent-orchestrator"
  name: "Orchestrator"
  description: "사용자 요청을 분석하고 적절한 에이전트에게 라우팅"
  version: "1.0.0"

ownership:
  function: null  # 특정 Function에 속하지 않음
  human_owner: "engineering-lead@company.com"

capabilities:
  primary:
    - "요청 분석 및 의도 파악"
    - "적절한 에이전트 선택"
    - "멀티 에이전트 워크플로 조정"
    - "컨텍스트 관리"
  secondary:
    - "에스컬레이션 처리"
    - "승인 플로우 관리"

skills: []  # Orchestrator는 직접 스킬 실행 안 함

permissions:
  read:
    - "/agents/*"
    - "/skills/*"
    - "/sops/*"
    - "/org/*"
  write: []  # 쓰기 권한 없음

tools:
  mcp:
    - "search"
    - "semantic_search"

delegation:
  can_delegate_to:
    - agent: "agent-brand"
      for: ["브랜드/마케팅 관련 요청"]
    - agent: "agent-product"
      for: ["제품 기획 관련 요청"]
    - agent: "agent-ops"
      for: ["운영/CS 관련 요청"]
    - agent: "agent-finance"
      for: ["재무 관련 요청"]
    - agent: "agent-hr"
      for: ["인사 관련 요청"]
  can_receive_from: []

behavior:
  response_style: "helpful, routing-focused"
  language: "ko"

slack_persona:
  display_name: "Company OS"
  emoji: ":robot_face:"
  prefix: "[System]"

restrictions:
  cannot_do:
    - "직접 업무 수행 (라우팅만 가능)"
    - "데이터 수정"
    - "승인 결정"
```

### Brand Agent

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
    - "에셋 관리"
  secondary:
    - "크리에이티브 피드백"
    - "마케팅 리서치"

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
    - "/skills/brand/*"
    - "/docs/brand/*"
    - "/docs/product/*"
  write:
    - "/sops/brand/*"
  notion:
    - database: "Brand Projects"
      access: "read_write"
    - database: "Campaign Requests"
      access: "read"
    - database: "Campaign Briefs"
      access: "read_write"
  drive:
    - folder: "Brand Assets"
      access: "read"
    - folder: "Campaign Archives"
      access: "read"

tools:
  mcp:
    - "search"
    - "github_create_pr"
    - "notion_query"
    - "notion_create_page"
    - "notion_update_page"
    - "drive_read_file"
    - "notify_slack"
    - "request_approval"
    - "validate_sop"

delegation:
  can_delegate_to:
    - agent: "agent-finance"
      for:
        - "예산 확인"
        - "비용 검토"
    - agent: "agent-ops"
      for:
        - "물류 확인"
        - "재고 조회"
  can_receive_from:
    - "agent-orchestrator"
    - "agent-product"

behavior:
  response_style: "professional, creative"
  language: "ko"
  approval_escalation:
    default_approver: "jane@company.com"
    timeout: "24h"
    fallback: "marketing-lead@company.com"

slack_persona:
  display_name: "Brand Agent"
  emoji: ":art:"
  prefix: "[Brand]"

restrictions:
  cannot_access:
    - "/org/hr/*"
    - "/docs/finance/confidential/*"
    - "/sops/hr/*"
  cannot_do:
    - "인사 정보 조회"
    - "재무 데이터 직접 수정"
    - "외부 이메일 발송"
    - "10만원 이상 지출 승인"
```

### Finance Agent

```yaml
# /agents/finance.yml
schema_version: "1.0"
kind: "Agent"

metadata:
  id: "agent-finance"
  name: "Finance Agent"
  description: "예산 관리, 정산, 재무 리포팅 담당"
  version: "1.0.0"

ownership:
  function: "func-finance"
  human_owner: "cfo@company.com"

capabilities:
  primary:
    - "예산 조회 및 분석"
    - "비용 검토"
    - "정산 처리"
    - "재무 리포트 생성"
  secondary:
    - "예산 예측"
    - "비용 최적화 제안"

skills:
  - "skill://finance/budget-check"
  - "skill://finance/expense-approval"
  - "skill://finance/report-generation"

sops:
  follows:
    - "sop://finance/expense-reimbursement"
    - "sop://finance/invoice-approval"
    - "sop://finance/budget-request"

value_streams:
  owner_of:
    - "vs-financial-close"
  participates_in:
    - "vs-collection-launch"

permissions:
  read:
    - "/sops/finance/*"
    - "/docs/finance/*"
    - "/skills/finance/*"
  write:
    - "/sops/finance/*"
  drive:
    - folder: "Finance"
      access: "read_write"
    - folder: "Finance/Budgets"
      access: "read_write"

tools:
  mcp:
    - "search"
    - "github_create_pr"
    - "drive_read_sheet"
    - "drive_write_sheet"  # Finance만 가능
    - "notify_slack"
    - "request_approval"

delegation:
  can_delegate_to: []  # 재무는 다른 에이전트에 위임 안 함
  can_receive_from:
    - "agent-orchestrator"
    - "agent-brand"
    - "agent-product"
    - "agent-ops"

behavior:
  response_style: "precise, analytical"
  language: "ko"
  approval_escalation:
    default_approver: "cfo@company.com"
    timeout: "12h"
    thresholds:
      - condition: "amount > 1000000"
        approver: "ceo@company.com"

slack_persona:
  display_name: "Finance Agent"
  emoji: ":chart_with_upwards_trend:"
  prefix: "[Finance]"

restrictions:
  cannot_access:
    - "/org/hr/salaries/*"  # 급여 정보 제한
  cannot_do:
    - "급여 정보 직접 수정"
    - "외부 송금 (승인 없이)"
    - "100만원 이상 지출 (승인 없이)"
```

---

## 에이전트 로딩

### Loader 인터페이스

```typescript
interface AgentLoader {
  load(path: string): Promise<Agent>;
  loadAll(directory: string): Promise<Agent[]>;
  validate(definition: AgentDefinition): ValidationResult;
}

interface Agent {
  id: string;
  name: string;
  execute(task: Task): Promise<Result>;
  delegate(task: Task, targetAgent: Agent): Promise<Result>;
  getCapabilities(): string[];
  getPermissions(): Permissions;
}
```

### 런타임 생성

```yaml
# 에이전트 정의 → 런타임 객체
loading_process:
  1. YAML 파일 로드
  2. 스키마 검증
  3. 권한 매핑
  4. 도구 바인딩
  5. 런타임 객체 생성
```
