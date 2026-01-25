# MCP 리소스 설계

## 개요

MCP Resources는 에이전트가 접근할 수 있는 데이터를 정의합니다. 각 리소스는 고유한 URI로 식별됩니다.

---

## 리소스 URI 체계

### URI 형식

```
{namespace}://{path}[?{query}]

예시:
sop://brand/campaign-brief
doc://policies/expense?version=1.2.0
skill://finance/budget-check
notion://database/campaigns?filter=status:active
drive://finance/2025-budget
```

---

## 네임스페이스별 리소스

### 1. sop:// - SOP 문서

```yaml
namespace: "sop"

uri_pattern: "sop://{function}/{name}"

examples:
  - uri: "sop://brand/campaign-brief"
    path: "/sops/brand/campaign-brief.md"

  - uri: "sop://hr/onboarding"
    path: "/sops/hr/onboarding.md"

  - uri: "sop://ops/incident-response"
    path: "/sops/ops/incident-response.md"

metadata:
  id: string
  title: string
  version: string
  status: "draft" | "active" | "deprecated"
  function: string
  agent: string
  tags: string[]

operations:
  list:
    description: "SOP 목록 조회"
    params:
      function: "선택적 필터"
      status: "선택적 필터"
      tags: "선택적 필터"

  get:
    description: "특정 SOP 조회"
    returns:
      content: "Markdown 본문"
      metadata: "frontmatter 데이터"

  search:
    description: "SOP 내용 검색"
    params:
      query: "검색어"
      function: "선택적 필터"
```

### 2. doc:// - 일반 문서

```yaml
namespace: "doc"

uri_pattern: "doc://{category}/{name}"

categories:
  - policies    # 정책 문서
  - brand       # 브랜드 가이드
  - product     # 제품 문서
  - onboarding  # 온보딩 가이드

examples:
  - uri: "doc://policies/expense"
    path: "/docs/policies/expense.md"

  - uri: "doc://brand/guidelines"
    path: "/docs/brand/guidelines.md"

metadata:
  id: string
  title: string
  category: string
  last_updated: datetime
  owner: string

operations:
  list:
    description: "문서 목록 조회"
    params:
      category: "선택적 필터"

  get:
    description: "특정 문서 조회"
    returns:
      content: "Markdown 본문"
      metadata: "메타데이터"
```

### 3. skill:// - 스킬 정의

```yaml
namespace: "skill"

uri_pattern: "skill://{function}/{name}"

examples:
  - uri: "skill://brand/brief-writing"
    path: "/skills/brand/brief-writing.yml"

  - uri: "skill://finance/budget-check"
    path: "/skills/finance/budget-check.yml"

metadata:
  id: string
  name: string
  function: string
  agents: string[]
  triggers: object
  required_tools: string[]

operations:
  list:
    description: "스킬 목록 조회"
    params:
      function: "선택적 필터"
      agent: "선택적 필터"

  get:
    description: "특정 스킬 조회"
    returns:
      definition: "YAML 전체 내용"
      parsed: "파싱된 객체"

  match:
    description: "쿼리에 맞는 스킬 찾기"
    params:
      query: "사용자 질문/요청"
    returns:
      matches: "매칭된 스킬 목록 (점수순)"
```

### 4. agent:// - 에이전트 정의

```yaml
namespace: "agent"

uri_pattern: "agent://{name}"

examples:
  - uri: "agent://brand"
    path: "/agents/brand.yml"

  - uri: "agent://orchestrator"
    path: "/agents/orchestrator.yml"

metadata:
  id: string
  name: string
  function: string
  capabilities: string[]
  skills: string[]
  permissions: object

operations:
  list:
    description: "에이전트 목록 조회"

  get:
    description: "특정 에이전트 조회"
    returns:
      definition: "YAML 전체 내용"
      parsed: "파싱된 객체"

  capabilities:
    description: "에이전트 능력 조회"
    params:
      agent_id: "에이전트 ID"
    returns:
      skills: "보유 스킬"
      tools: "사용 가능 도구"
      permissions: "권한 정보"
```

### 5. org:// - 조직 구조

```yaml
namespace: "org"

uri_patterns:
  function: "org://function/{name}"
  value_stream: "org://value-stream/{name}"
  role: "org://role/{name}"

examples:
  - uri: "org://function/brand"
    path: "/org/functions/brand.yml"

  - uri: "org://value-stream/collection-launch"
    path: "/org/value-streams/collection-launch.yml"

operations:
  list:
    description: "조직 구조 목록 조회"
    params:
      type: "function | value_stream | role"

  get:
    description: "특정 조직 요소 조회"
```

### 6. notion:// - Notion 데이터

```yaml
namespace: "notion"

uri_patterns:
  database: "notion://database/{alias}"
  page: "notion://page/{id}"

examples:
  - uri: "notion://database/campaigns"
    notion_id: "abc123..."

  - uri: "notion://database/projects?filter=status:active"
    notion_id: "def456..."

operations:
  list_databases:
    description: "연결된 데이터베이스 목록"

  query_database:
    description: "데이터베이스 쿼리"
    params:
      filter: "Notion 필터 조건"
      sort: "정렬 조건"
      page_size: "페이지 크기"

  get_page:
    description: "페이지 조회"
    params:
      page_id: "페이지 ID"
    returns:
      properties: "페이지 속성"
      content: "페이지 내용 (블록)"
```

### 7. drive:// - Google Drive 데이터

```yaml
namespace: "drive"

uri_pattern: "drive://{folder}/{file}"

examples:
  - uri: "drive://finance/2025-budget"
    drive_id: "1abc..."

  - uri: "drive://brand/assets"
    drive_id: "2def..."

operations:
  list_folders:
    description: "폴더 목록"

  list_files:
    description: "파일 목록"
    params:
      folder: "폴더 경로"
      type: "sheet | doc | all"

  get_file:
    description: "파일 조회"
    params:
      file_id: "파일 ID"
    returns:
      metadata: "파일 메타데이터"
      content: "파일 내용 (형식에 따라)"

  get_sheet:
    description: "스프레드시트 조회"
    params:
      file_id: "파일 ID"
      sheet_name: "시트 이름"
      range: "셀 범위 (선택)"
    returns:
      data: "셀 데이터 배열"
```

---

## 리소스 응답 형식

### 표준 응답 구조

```typescript
interface ResourceResponse {
  uri: string;
  name: string;
  mimeType: string;
  metadata: Record<string, any>;
  contents: ResourceContents[];
}

interface ResourceContents {
  uri: string;
  mimeType: string;
  text?: string;       // 텍스트 콘텐츠
  blob?: string;       // Base64 인코딩된 바이너리
}
```

### 예시 응답

```json
{
  "uri": "sop://brand/campaign-brief",
  "name": "캠페인 브리프 작성",
  "mimeType": "text/markdown",
  "metadata": {
    "id": "sop-brand-campaign-brief",
    "version": "1.2.0",
    "status": "active",
    "function": "func-brand",
    "agent": "agent-brand",
    "tags": ["brand", "campaign", "creative"]
  },
  "contents": [
    {
      "uri": "sop://brand/campaign-brief",
      "mimeType": "text/markdown",
      "text": "---\nschema_version: \"1.0\"\n..."
    }
  ]
}
```

---

## 리소스 구독 (Subscriptions)

### 변경 알림

```yaml
subscriptions:
  supported: true

  events:
    - "resource/created"
    - "resource/updated"
    - "resource/deleted"

  granularity:
    - "namespace"  # sop://* 전체 구독
    - "path"       # sop://brand/* 구독
    - "resource"   # sop://brand/campaign-brief 구독

  notification:
    format:
      type: "resource/updated"
      uri: "sop://brand/campaign-brief"
      timestamp: "2025-01-25T10:30:00Z"
      changes:
        version: ["1.1.0", "1.2.0"]
```

### 구독 설정 예시

```typescript
// 에이전트가 관심 있는 리소스 구독
await client.subscribeResource({
  uri: "sop://brand/*"
});

// 변경 알림 수신
client.onResourceUpdated((notification) => {
  console.log(`Resource updated: ${notification.uri}`);
});
```

---

## 캐싱 전략

### 캐시 레이어

```yaml
caching:
  enabled: true
  backend: "redis"

  policies:
    github_resources:
      ttl: 300  # 5분
      invalidation: "webhook"  # GitHub webhook으로 무효화

    notion_resources:
      ttl: 60   # 1분
      invalidation: "webhook"

    drive_resources:
      ttl: 300  # 5분
      invalidation: "polling"  # 5분마다 확인

  cache_key_pattern: "mcp:resource:{namespace}:{path}"
```

### 캐시 무효화

```yaml
invalidation:
  github_webhook:
    events:
      - "push"
      - "pull_request.merged"
    action: "invalidate matching resources"

  notion_webhook:
    events:
      - "page.updated"
    action: "invalidate specific page"

  manual:
    endpoint: "POST /cache/invalidate"
    params:
      pattern: "resource URI 패턴"
```

---

## 에러 처리

### 에러 코드

```yaml
error_codes:
  resource_not_found:
    code: -32002
    message: "Resource not found: {uri}"

  access_denied:
    code: -32003
    message: "Access denied to resource: {uri}"

  rate_limited:
    code: -32004
    message: "Rate limit exceeded"

  source_unavailable:
    code: -32005
    message: "Source unavailable: {source}"
```

### 에러 응답 예시

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32003,
    "message": "Access denied to resource: sop://hr/salary-policy",
    "data": {
      "agent": "agent-brand",
      "required_permission": "read",
      "resource": "sop://hr/*"
    }
  }
}
```
