# MCP 서버 아키텍처

## 개요

Model Context Protocol (MCP)를 사용하여 Claude 에이전트와 회사 지식/도구를 연결합니다.

---

## 아키텍처 결정

### 단일 서버 vs 다중 서버

**결정: 단일 서버 + 네임스페이스 방식**

| 옵션 | 장점 | 단점 |
|------|------|------|
| **단일 서버** | 운영 단순, 권한 관리 용이 | 장애 시 전체 영향 |
| 다중 서버 | 장애 격리, 독립 배포 | 운영 복잡, 인증 분산 |

**선택 이유:**
- 엔지니어 리소스가 적음
- 권한 관리를 한 곳에서
- 네임스페이스로 논리적 분리 가능
- 향후 분리 가능한 구조로 설계

---

## 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Clients                                   │
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│   │ Claude      │  │ Claude      │  │ Other MCP   │                    │
│   │ (Desktop)   │  │ (Slack Bot) │  │ Client      │                    │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                    │
│          │                │                │                            │
└──────────┼────────────────┼────────────────┼────────────────────────────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        MCP Server                                       │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      Authentication Layer                        │  │
│   │              (API Key / OAuth / Agent Identity)                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      Authorization Layer                         │  │
│   │              (Agent → Namespace/Resource 권한 매핑)               │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌───────────────────┬───────────────────┬───────────────────┐        │
│   │    Resources      │      Tools        │     Prompts       │        │
│   │                   │                   │                   │        │
│   │  ┌─────────────┐ │  ┌─────────────┐  │  ┌─────────────┐  │        │
│   │  │ sop://      │ │  │ search      │  │  │ summarize   │  │        │
│   │  │ doc://      │ │  │ create_pr   │  │  │ analyze     │  │        │
│   │  │ skill://    │ │  │ validate    │  │  │ compare     │  │        │
│   │  │ agent://    │ │  │ notify      │  │  │             │  │        │
│   │  │ org://      │ │  │ notion_*    │  │  │             │  │        │
│   │  └─────────────┘ │  │ drive_*     │  │  └─────────────┘  │        │
│   │                   │  │ github_*    │  │                   │        │
│   │                   │  └─────────────┘  │                   │        │
│   └───────────────────┴───────────────────┴───────────────────┘        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                        Data Layer                                │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │  │
│   │  │ GitHub   │  │ Notion   │  │ Drive    │  │ Cache    │        │  │
│   │  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ (Redis)  │        │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 네임스페이스 설계

### URI 스키마

```yaml
namespaces:
  sop:
    pattern: "sop://{function}/{name}"
    examples:
      - "sop://brand/campaign-brief"
      - "sop://hr/onboarding"
    source: "github:/sops/{function}/{name}.md"

  doc:
    pattern: "doc://{category}/{name}"
    examples:
      - "doc://policies/expense"
      - "doc://brand/guidelines"
    source: "github:/docs/{category}/{name}.md"

  skill:
    pattern: "skill://{function}/{name}"
    examples:
      - "skill://brand/brief-writing"
      - "skill://finance/budget-check"
    source: "github:/skills/{function}/{name}.yml"

  agent:
    pattern: "agent://{name}"
    examples:
      - "agent://brand"
      - "agent://orchestrator"
    source: "github:/agents/{name}.yml"

  org:
    pattern: "org://{type}/{name}"
    examples:
      - "org://function/brand"
      - "org://value-stream/collection-launch"
    source: "github:/org/{type}/{name}.yml"

  notion:
    pattern: "notion://{database_or_page}"
    examples:
      - "notion://campaign-requests"
      - "notion://page/abc123"
    source: "Notion API"

  drive:
    pattern: "drive://{folder}/{file}"
    examples:
      - "drive://finance/2025-budget"
    source: "Drive API"
```

---

## 접근 권한 모델

### 에이전트별 권한 매핑

```yaml
# /mcp/config/permissions.yml
agent_permissions:
  agent-orchestrator:
    read:
      - "sop://*"
      - "doc://*"
      - "skill://*"
      - "agent://*"
      - "org://*"
    write: []
    tools:
      - "search"
      - "route"

  agent-brand:
    read:
      - "sop://brand/*"
      - "sop://marketing/*"
      - "doc://brand/*"
      - "doc://product/*"
      - "skill://brand/*"
    write:
      - "sop://brand/*"  # PR 통해서만
    tools:
      - "search"
      - "create_pr"
      - "notify"
      - "notion_read"
      - "notion_write"
      - "drive_read"
    restricted:
      - "sop://hr/*"
      - "doc://finance/confidential/*"

  agent-finance:
    read:
      - "sop://finance/*"
      - "doc://finance/*"
      - "skill://finance/*"
      - "drive://finance/*"
    write:
      - "sop://finance/*"
    tools:
      - "search"
      - "create_pr"
      - "notify"
      - "drive_read"
      - "drive_write"  # 특정 폴더만
    approval_required:
      - tool: "drive_write"
        condition: "amount > 1000000"
```

### 권한 검증 플로우

```
1. 요청 수신
   └─ client_id, resource_uri, operation

2. 에이전트 식별
   └─ client_id → agent_id 매핑

3. 권한 확인
   ├─ agent_permissions[agent_id].read 확인
   ├─ agent_permissions[agent_id].write 확인
   └─ agent_permissions[agent_id].tools 확인

4. 제한 확인
   └─ restricted 목록과 비교

5. 승인 필요 여부
   └─ approval_required 조건 평가

6. 결과
   ├─ 허용 → 요청 처리
   ├─ 거부 → 403 반환
   └─ 승인 필요 → 승인 플로우 시작
```

---

## 서버 설정

### 메인 설정 파일

```yaml
# /mcp/config/server.yml
server:
  name: "kyndof-company-os"
  version: "1.0.0"

  transport:
    type: "stdio"  # 또는 "http"

  logging:
    level: "info"
    destination: "stdout"

  cache:
    enabled: true
    type: "redis"
    ttl: 300  # 5분

capabilities:
  resources:
    enabled: true
    subscribe: true
    list_changed: true

  tools:
    enabled: true

  prompts:
    enabled: true

  sampling:
    enabled: false

auth:
  type: "api_key"  # 또는 "oauth"
  header: "X-API-Key"

rate_limits:
  requests_per_minute: 60
  burst: 10
```

### 리소스 설정

```yaml
# /mcp/config/resources.yml
resources:
  # GitHub 기반 리소스
  - namespace: "sop"
    source: "github"
    config:
      repo: "company-os"
      path: "/sops"
      branch: "main"
    transform:
      - parse_frontmatter
      - extract_metadata

  - namespace: "doc"
    source: "github"
    config:
      repo: "company-os"
      path: "/docs"
      branch: "main"

  - namespace: "skill"
    source: "github"
    config:
      repo: "company-os"
      path: "/skills"
      branch: "main"
    transform:
      - parse_yaml

  # Notion 기반 리소스
  - namespace: "notion"
    source: "notion"
    config:
      databases:
        - id: "abc123"
          alias: "campaign-requests"
        - id: "def456"
          alias: "projects"

  # Drive 기반 리소스
  - namespace: "drive"
    source: "google_drive"
    config:
      folders:
        - id: "folder_id_1"
          alias: "finance"
        - id: "folder_id_2"
          alias: "brand"
```

---

## 기술 스택

### 언어/프레임워크 선택

**선택: TypeScript/Node.js**

| 옵션 | 장점 | 단점 |
|------|------|------|
| **TypeScript** | MCP SDK 공식 지원, 타입 안전 | Node.js 런타임 필요 |
| Python | MCP SDK 지원, 빠른 개발 | 타입 안전성 낮음 |

**선택 이유:**
- Anthropic MCP SDK 공식 지원
- 타입 안전성으로 런타임 오류 감소
- Slack Bot 등 다른 컴포넌트와 통일

### 의존성

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@octokit/rest": "^20.0.0",
    "@notionhq/client": "^2.0.0",
    "googleapis": "^130.0.0",
    "redis": "^4.0.0",
    "zod": "^3.0.0"
  }
}
```

---

## 배포 구조

### 컨테이너 구성

```yaml
# docker-compose.yml
services:
  mcp-server:
    build: ./mcp
    ports:
      - "3000:3000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - NOTION_TOKEN=${NOTION_TOKEN}
      - GOOGLE_SA_KEY=${GOOGLE_SA_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### 환경 변수

```yaml
# 필수 환경 변수
GITHUB_TOKEN: "GitHub Personal Access Token"
NOTION_TOKEN: "Notion Integration Token"
GOOGLE_SA_KEY: "Google Service Account JSON"

# 선택 환경 변수
REDIS_URL: "Redis 연결 URL"
LOG_LEVEL: "info"
PORT: "3000"
```

---

## 모니터링

### 메트릭

```yaml
metrics:
  - name: "mcp_requests_total"
    type: "counter"
    labels: ["method", "namespace", "status"]

  - name: "mcp_request_duration_seconds"
    type: "histogram"
    labels: ["method", "namespace"]

  - name: "mcp_cache_hits_total"
    type: "counter"

  - name: "mcp_auth_failures_total"
    type: "counter"
    labels: ["agent_id"]
```

### 헬스체크

```yaml
health_endpoints:
  liveness: "/health/live"
  readiness: "/health/ready"

checks:
  - name: "github"
    type: "http"
    endpoint: "https://api.github.com"

  - name: "notion"
    type: "http"
    endpoint: "https://api.notion.com"

  - name: "redis"
    type: "tcp"
    host: "redis"
    port: 6379
```

---

## 확장 전략

### 새로운 네임스페이스 추가

```yaml
# 새 네임스페이스 추가 절차
1. /mcp/config/resources.yml에 네임스페이스 정의 추가
2. /mcp/src/adapters/{namespace}.ts 어댑터 구현
3. /mcp/config/permissions.yml에 권한 설정
4. 테스트 및 배포
```

### 새로운 도구 추가

```yaml
# 새 도구 추가 절차
1. /mcp/config/tools.yml에 도구 정의 추가
2. /mcp/src/tools/{tool_name}.ts 핸들러 구현
3. /mcp/config/permissions.yml에 에이전트별 도구 권한 추가
4. 테스트 및 배포
```

### MCP 서버 분리

향후 필요 시 도메인별로 MCP 서버를 분리할 수 있습니다:

```
현재: 단일 MCP 서버
      company-os-mcp

향후: 도메인별 분리
      company-os-mcp-core (sop, doc, skill)
      company-os-mcp-notion (notion://)
      company-os-mcp-drive (drive://)
```
