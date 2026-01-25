# MCP 도구 설계

## 개요

MCP Tools는 에이전트가 수행할 수 있는 작업을 정의합니다. 각 도구는 명확한 입력/출력 스키마를 가집니다.

---

## 도구 카테고리

```
Tools
├── Search & Query
│   ├── search
│   └── semantic_search
│
├── GitHub Operations
│   ├── github_create_pr
│   ├── github_get_file
│   └── github_list_prs
│
├── Notion Operations
│   ├── notion_query
│   ├── notion_create_page
│   ├── notion_update_page
│   └── notion_add_comment
│
├── Drive Operations
│   ├── drive_read_file
│   ├── drive_read_sheet
│   └── drive_list_files
│
├── Communication
│   ├── notify_slack
│   ├── request_approval
│   └── send_dm
│
└── Validation
    ├── validate_sop
    └── validate_schema
```

---

## 도구 정의

### 1. search - 지식베이스 검색

```yaml
name: "search"
description: "GitHub 모노레포 내 문서 검색"

inputSchema:
  type: object
  required:
    - query
  properties:
    query:
      type: string
      description: "검색 쿼리"
    namespace:
      type: string
      enum: ["sop", "doc", "skill", "all"]
      default: "all"
      description: "검색 대상 네임스페이스"
    function:
      type: string
      description: "Function 필터 (예: brand, hr)"
    limit:
      type: integer
      default: 10
      description: "최대 결과 수"

output:
  type: object
  properties:
    results:
      type: array
      items:
        type: object
        properties:
          uri:
            type: string
          title:
            type: string
          snippet:
            type: string
          score:
            type: number
    total_count:
      type: integer

example:
  input:
    query: "캠페인 브리프 작성 절차"
    namespace: "sop"
    function: "brand"
  output:
    results:
      - uri: "sop://brand/campaign-brief"
        title: "캠페인 브리프 작성"
        snippet: "...캠페인의 방향성, 목표, 요구사항을 정리..."
        score: 0.95
    total_count: 1
```

### 2. github_create_pr - PR 생성

```yaml
name: "github_create_pr"
description: "GitHub에 Pull Request 생성"

inputSchema:
  type: object
  required:
    - title
    - body
    - files
  properties:
    title:
      type: string
      description: "PR 제목"
    body:
      type: string
      description: "PR 본문 (Markdown)"
    branch:
      type: string
      description: "브랜치 이름 (자동 생성 가능)"
    files:
      type: array
      items:
        type: object
        properties:
          path:
            type: string
          content:
            type: string
          operation:
            type: string
            enum: ["create", "update", "delete"]
    labels:
      type: array
      items:
        type: string
    reviewers:
      type: array
      items:
        type: string

output:
  type: object
  properties:
    pr_number:
      type: integer
    pr_url:
      type: string
    branch:
      type: string
    status:
      type: string

approval_required: false  # PR 생성 자체는 승인 불필요

example:
  input:
    title: "feat(sop): Add campaign brief SOP"
    body: "## Summary\n- 캠페인 브리프 작성 SOP 추가"
    files:
      - path: "/sops/brand/campaign-brief.md"
        content: "---\nschema_version: \"1.0\"..."
        operation: "create"
    labels: ["sop", "brand"]
  output:
    pr_number: 42
    pr_url: "https://github.com/company-os/pull/42"
    branch: "feat/sop-campaign-brief"
    status: "open"
```

### 3. notion_query - Notion 데이터베이스 쿼리

```yaml
name: "notion_query"
description: "Notion 데이터베이스 쿼리"

inputSchema:
  type: object
  required:
    - database
  properties:
    database:
      type: string
      description: "데이터베이스 alias 또는 ID"
    filter:
      type: object
      description: "Notion 필터 객체"
    sorts:
      type: array
      description: "정렬 조건"
    page_size:
      type: integer
      default: 20

output:
  type: object
  properties:
    results:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
          properties:
            type: object
          url:
            type: string
    has_more:
      type: boolean
    next_cursor:
      type: string

example:
  input:
    database: "campaign-requests"
    filter:
      property: "Status"
      select:
        equals: "Requested"
    page_size: 10
  output:
    results:
      - id: "abc123"
        properties:
          Title: "봄 시즌 캠페인"
          Status: "Requested"
        url: "https://notion.so/abc123"
    has_more: false
```

### 4. notion_create_page - Notion 페이지 생성

```yaml
name: "notion_create_page"
description: "Notion에 새 페이지 생성"

inputSchema:
  type: object
  required:
    - database
    - properties
  properties:
    database:
      type: string
      description: "데이터베이스 alias 또는 ID"
    properties:
      type: object
      description: "페이지 속성"
    content:
      type: array
      description: "페이지 내용 블록"
    icon:
      type: string
      description: "아이콘 이모지"

output:
  type: object
  properties:
    id:
      type: string
    url:
      type: string

example:
  input:
    database: "campaign-briefs"
    properties:
      Title: "2025 S/S 컬렉션 캠페인 브리프"
      Status: "Draft"
      Owner: "jane@company.com"
    content:
      - type: "heading_2"
        text: "캠페인 개요"
      - type: "paragraph"
        text: "..."
    icon: "📋"
  output:
    id: "xyz789"
    url: "https://notion.so/xyz789"
```

### 5. notion_update_page - Notion 페이지 업데이트

```yaml
name: "notion_update_page"
description: "Notion 페이지 속성 업데이트"

inputSchema:
  type: object
  required:
    - page_id
    - properties
  properties:
    page_id:
      type: string
    properties:
      type: object
      description: "업데이트할 속성"

output:
  type: object
  properties:
    id:
      type: string
    updated:
      type: boolean

example:
  input:
    page_id: "abc123"
    properties:
      Status: "In Review"
      Reviewers:
        - "john@company.com"
  output:
    id: "abc123"
    updated: true
```

### 6. drive_read_sheet - 스프레드시트 읽기

```yaml
name: "drive_read_sheet"
description: "Google Sheets 데이터 읽기"

inputSchema:
  type: object
  required:
    - file_id
  properties:
    file_id:
      type: string
      description: "파일 ID 또는 alias"
    sheet_name:
      type: string
      description: "시트 이름 (기본: 첫 번째 시트)"
    range:
      type: string
      description: "셀 범위 (예: A1:D10)"

output:
  type: object
  properties:
    values:
      type: array
      items:
        type: array
    headers:
      type: array
    row_count:
      type: integer

example:
  input:
    file_id: "finance/2025-budget"
    sheet_name: "예산현황"
    range: "A1:E20"
  output:
    headers: ["부서", "예산", "집행", "잔액", "비율"]
    values:
      - ["브랜드", "50000000", "32000000", "18000000", "64%"]
      - ["제품", "30000000", "15000000", "15000000", "50%"]
    row_count: 2
```

### 7. notify_slack - Slack 알림

```yaml
name: "notify_slack"
description: "Slack 채널 또는 사용자에게 메시지 전송"

inputSchema:
  type: object
  required:
    - target
    - message
  properties:
    target:
      type: string
      description: "채널 (#channel) 또는 사용자 (@user)"
    message:
      type: string
      description: "메시지 내용"
    blocks:
      type: array
      description: "Slack Block Kit 블록"
    thread_ts:
      type: string
      description: "스레드 타임스탬프 (답글 시)"

output:
  type: object
  properties:
    ts:
      type: string
      description: "메시지 타임스탬프"
    channel:
      type: string
    success:
      type: boolean

example:
  input:
    target: "#func-brand-creative"
    message: "📋 새 캠페인 브리프가 작성되었습니다."
    blocks:
      - type: "section"
        text:
          type: "mrkdwn"
          text: "*2025 S/S 컬렉션 캠페인*\n작성자: Brand Agent"
      - type: "actions"
        elements:
          - type: "button"
            text: "브리프 보기"
            url: "https://notion.so/..."
  output:
    ts: "1704891234.123456"
    channel: "C1234567890"
    success: true
```

### 8. request_approval - 승인 요청

```yaml
name: "request_approval"
description: "사람에게 승인 요청"

inputSchema:
  type: object
  required:
    - approver
    - title
    - description
  properties:
    approver:
      type: string
      description: "승인자 (이메일 또는 Slack ID)"
    title:
      type: string
      description: "승인 요청 제목"
    description:
      type: string
      description: "승인 요청 내용"
    context:
      type: object
      description: "추가 컨텍스트 (링크, 데이터 등)"
    timeout:
      type: string
      default: "24h"
      description: "타임아웃"
    fallback_approver:
      type: string
      description: "타임아웃 시 대체 승인자"

output:
  type: object
  properties:
    request_id:
      type: string
    status:
      type: string
      enum: ["pending", "approved", "rejected", "timeout"]
    approved_by:
      type: string
    approved_at:
      type: string

blocking: true  # 승인 완료까지 대기

example:
  input:
    approver: "jane@company.com"
    title: "캠페인 브리프 승인 요청"
    description: "2025 S/S 컬렉션 캠페인 브리프를 검토해주세요."
    context:
      brief_url: "https://notion.so/..."
      budget: 10000000
    timeout: "24h"
    fallback_approver: "marketing-lead@company.com"
  output:
    request_id: "apr-001"
    status: "approved"
    approved_by: "jane@company.com"
    approved_at: "2025-01-25T11:00:00Z"
```

### 9. validate_sop - SOP 유효성 검증

```yaml
name: "validate_sop"
description: "SOP 문서의 스키마 및 내용 유효성 검증"

inputSchema:
  type: object
  required:
    - content
  properties:
    content:
      type: string
      description: "SOP Markdown 내용"
    strict:
      type: boolean
      default: false
      description: "엄격 모드 (경고도 에러로 처리)"

output:
  type: object
  properties:
    valid:
      type: boolean
    errors:
      type: array
      items:
        type: object
        properties:
          type:
            type: string
          message:
            type: string
          location:
            type: string
    warnings:
      type: array

example:
  input:
    content: "---\nschema_version: \"1.0\"\nkind: \"SOP\"..."
    strict: false
  output:
    valid: true
    errors: []
    warnings:
      - type: "best_practice"
        message: "예외 처리 섹션이 비어있습니다"
        location: "## 예외 처리"
```

---

## 도구 권한 매핑

```yaml
# /mcp/config/tool-permissions.yml
tool_permissions:
  agent-orchestrator:
    allowed:
      - search
      - semantic_search
    denied:
      - github_create_pr
      - notion_create_page

  agent-brand:
    allowed:
      - search
      - github_create_pr
      - notion_query
      - notion_create_page
      - notion_update_page
      - drive_read_sheet
      - notify_slack
      - request_approval
      - validate_sop
    restricted:
      - drive_read_sheet:
          folders: ["brand", "marketing"]  # 특정 폴더만

  agent-finance:
    allowed:
      - search
      - github_create_pr
      - notion_query
      - drive_read_sheet
      - drive_write_sheet  # Finance만 가능
      - notify_slack
      - request_approval
    approval_required:
      - drive_write_sheet:
          condition: "amount > 1000000"
```

---

## 도구 실행 플로우

```
1. 도구 호출 요청
   └─ agent_id, tool_name, arguments

2. 권한 검증
   ├─ 도구 사용 권한 확인
   ├─ 인자별 제한 확인
   └─ 승인 필요 여부 확인

3. 승인 필요 시
   ├─ request_approval 호출
   ├─ 승인 대기
   └─ 승인/거절에 따라 진행

4. 도구 실행
   ├─ 어댑터 호출
   └─ 결과 수집

5. 로깅
   ├─ 실행 기록
   ├─ 입력/출력 (민감정보 마스킹)
   └─ 소요 시간

6. 결과 반환
```

---

## 에러 처리

```yaml
error_codes:
  tool_not_found:
    code: -32601
    message: "Unknown tool: {tool_name}"

  invalid_params:
    code: -32602
    message: "Invalid parameters: {details}"

  tool_execution_error:
    code: -32603
    message: "Tool execution failed: {details}"

  permission_denied:
    code: -32604
    message: "Permission denied for tool: {tool_name}"

  approval_timeout:
    code: -32605
    message: "Approval request timed out"

  approval_rejected:
    code: -32606
    message: "Approval request rejected: {reason}"
```
