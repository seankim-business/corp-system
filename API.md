# API Specification

> **REST API + GraphQL Hybrid Architecture for Kyndof Corp System**

---

## 목차

- [개요](#개요)
- [인증 및 권한](#인증-및-권한)
- [REST API 엔드포인트](#rest-api-엔드포인트)
- [GraphQL API](#graphql-api)
- [MCP Server APIs](#mcp-server-apis)
- [Webhook Events](#webhook-events)

---

## 개요

### API 설계 원칙

1. **RESTful for CRUD**: 단순 CRUD → REST API
2. **GraphQL for Complex Queries**: 복잡한 관계 조회 → GraphQL
3. **Webhooks for Events**: 이벤트 기반 → Webhooks
4. **MCP for Agent Integration**: 에이전트 통합 → MCP Protocol

---

### Base URLs

```
Production:  https://api.kyndof.com/v1
Staging:     https://api-staging.kyndof.com/v1
Local:       http://localhost:3000/v1

GraphQL:     {BASE_URL}/graphql
Webhooks:    {BASE_URL}/webhooks
```

---

## 인증 및 권한

### Authentication

**API Key (Server-to-Server)**:
```http
GET /api/v1/goals
Authorization: Bearer {API_KEY}
```

**JWT (User Sessions)**:
```http
GET /api/v1/tasks
Authorization: Bearer {JWT_TOKEN}
```

**OAuth 2.0 (Third-party Apps)**:
```http
GET /api/v1/projects
Authorization: Bearer {OAUTH_TOKEN}
```

---

### RABSIC-based Authorization

모든 API 요청은 RABSIC 규칙에 따라 권한 검증:

```typescript
// Example: Task 생성 권한 확인
POST /api/v1/tasks
{
  "name": "New Task",
  "responsible": ["user123"],
  "accountable": ["user456"]  // 1명만 허용
}

// 시스템이 자동으로 RABSIC 검증:
// 1. 요청자가 A(Accountable) 역할인가?
// 2. 또는 R(Responsible) 역할인가?
// 3. 그것도 아니면 거부
```

---

## REST API 엔드포인트

### 1. Goals API

#### List Goals
```http
GET /api/v1/goals

Query Parameters:
- status: string (optional) - "Not Started" | "On Track" | "Off Track"
- business_model: string (optional) - "2000Archives" | "2000Atelier"
- parent_id: string (optional) - 상위 Goal ID
- limit: number (default: 50)
- offset: number (default: 0)

Response:
{
  "data": [
    {
      "id": "goal_123",
      "title": "엔터-패션 관련성을 가장 잘 활용하는...",
      "status": "On Track",
      "owner": {
        "id": "user_456",
        "name": "Sol",
        "position": "Brand Ops"
      },
      "due_date": "2027-12-31",
      "progress": 35,
      "parent_goal": {
        "id": "goal_789",
        "title": "국가 대표 브랜드"
      },
      "related_kpis": ["kpi_001", "kpi_002"],
      "related_strategies": ["strat_001"],
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-24T15:30:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

#### Create Goal
```http
POST /api/v1/goals

Request Body:
{
  "title": "신규 목표",
  "status": "Not Started",
  "owner_position": "pos_123",
  "due_date": "2026-12-31",
  "parent_goal_id": "goal_456",  // optional
  "related_strategies": ["strat_001"],
  "related_business_model": "2000Archives"
}

Response:
{
  "data": {
    "id": "goal_999",
    "title": "신규 목표",
    ...
  }
}
```

#### Update Goal
```http
PATCH /api/v1/goals/{goal_id}

Request Body:
{
  "status": "On Track",
  "progress": 45
}
```

---

### 2. Tasks API

#### List Tasks (with Filters)
```http
GET /api/v1/tasks

Query Parameters:
- status: string - "1_ToDo" | "2_InProgress" | "5_Done"
- responsible: string - User ID
- accountable: string - User ID
- due_date_start: date
- due_date_end: date
- eisenhower_quadrant: string - "Q1_UrgentImportant" | "Q2_NotUrgentImportant"
- project_id: string
- goal_id: string

Response:
{
  "data": [
    {
      "id": "task_123",
      "name": "디자인 컨셉 → 확정 디자인",
      "status": "2_InProgress",
      "rabsic": {
        "responsible": [
          { "id": "user_123", "name": "보경" }
        ],
        "accountable": [
          { "id": "user_456", "name": "Sol" }
        ],
        "backup": [],
        "support": [],
        "informed": [],
        "consulted": []
      },
      "due_date": "2026-02-15",
      "urgency_score": 4,
      "importance_score": 5,
      "eisenhower_quadrant": "Q1_UrgentImportant",
      "related_projects": ["proj_001"],
      "related_goals": ["goal_001"],
      "parent_task": null,
      "sub_tasks": ["task_124", "task_125"]
    }
  ]
}
```

#### Create Task (with RABSIC)
```http
POST /api/v1/tasks

Request Body:
{
  "name": "신규 태스크",
  "status": "1_ToDo",
  "due_date": "2026-02-28",
  "rabsic": {
    "responsible": ["user_123"],
    "accountable": ["user_456"],  // 반드시 1명
    "informed": ["user_789"]
  },
  "urgency_score": 3,
  "importance_score": 4,
  "related_projects": ["proj_001"]
}

Response:
{
  "data": {
    "id": "task_999",
    "eisenhower_quadrant": "Q2_NotUrgentImportant",  // 자동 계산
    ...
  }
}

Error (RABSIC 위반):
{
  "error": {
    "code": "RABSIC_VIOLATION",
    "message": "Accountable must have exactly 1 person, got 2",
    "details": {
      "field": "rabsic.accountable",
      "expected": 1,
      "actual": 2
    }
  }
}
```

---

### 3. Projects API

#### Get Project with Rollup Data
```http
GET /api/v1/projects/{project_id}

Response:
{
  "data": {
    "id": "proj_001",
    "name": "Killin' It Girl 의상 제작",
    "status": "Active",
    "owner": { "id": "user_123", "name": "승연" },
    "start_date": "2026-01-10",
    "due_date": "2026-03-15",
    "progress": 45,
    "budget": 5000000,
    "rollups": {
      "task_count": 15,
      "completed_task_count": 7,
      "task_completion_rate": 46.67
    },
    "related_strategies": ["strat_001"],
    "related_value_streams": ["vs_001"],
    "stakeholders": ["user_456", "user_789"]
  }
}
```

---

### 4. Value Streams API

#### List Value Streams
```http
GET /api/v1/value-streams

Query Parameters:
- functions: string - "MD" | "Fashion Design" | "Marketing" | "CS" | "Sales"
- business_model: string - "2000Archives" | "2000Atelier"

Response:
{
  "data": [
    {
      "id": "vs_001",
      "name": "시장 트렌드 → 상품 컨셉",
      "functions": "MD",
      "type": "Value Stream",
      "input": "시장 트렌드, 고객 피드백",
      "output": "상품 컨셉",
      "rabsic": {
        "responsible_position": {
          "id": "pos_001",
          "name": "MD-Sales"
        },
        "accountable_position": {
          "id": "pos_001",
          "name": "MD-Sales"
        }
      },
      "related_kpis": ["kpi_001"],
      "parent_stream": null,
      "sub_streams": ["vs_002", "vs_003"]
    }
  ]
}
```

---

### 5. KPIs API

#### Get KPI with Current Value
```http
GET /api/v1/kpis/{kpi_id}

Response:
{
  "data": {
    "id": "kpi_001",
    "name": "월 매출 (MRR)",
    "status": "On Track",
    "owner_role": {
      "id": "pos_001",
      "name": "MD-Sales"
    },
    "target": "50,000,000 KRW",
    "current_value": 42500000,
    "unit": "KRW",
    "update_frequency": "Daily",
    "data_source": "https://...",
    "up_to_date": true,
    "last_updated": "2026-01-24T10:00:00Z",
    "related_goals": ["goal_001"],
    "related_processes": ["proc_001"]
  }
}
```

#### Update KPI Value
```http
PATCH /api/v1/kpis/{kpi_id}

Request Body:
{
  "current_value": 43000000
}

// 시스템이 자동으로:
// 1. up_to_date = true 설정
// 2. last_updated = now() 설정
// 3. Related Goal의 progress 재계산
```

---

### 6. Hypothesis API

#### List Hypothesis with Strategy Links
```http
GET /api/v1/hypothesis

Response:
{
  "data": [
    {
      "id": "hyp_001",
      "name": "AI 디자인 워크플로우 도입으로...",
      "status": "On Track",
      "owner": { "id": "user_123", "name": "승연" },
      "related_strategies": [
        {
          "id": "strat_ai_001",
          "name": "AI 내재화"
        },
        {
          "id": "strat_ops_001",
          "name": "운영 프로세스 추적"
        }
      ],
      "related_goals": ["goal_001"],
      "target": "3명의 디자이너로 월 100개 디자인 생산",
      "current_value": "3명의 디자이너로 월 45개 디자인 생산"
    }
  ]
}
```

---

### 7. Strategies API

#### List Strategies by Category
```http
GET /api/v1/strategies

Query Parameters:
- category: string[] - "시장 진입 · 성장" | "경쟁 방어 · 지속성" | ...

Response:
{
  "data": [
    {
      "id": "strat_001",
      "name": "시장 선점 (First-Mover)",
      "english_name": "First-Mover",
      "category": ["시장 진입 · 성장"],
      "status": "On Track",
      "owner": { "id": "user_123", "name": "Sol" },
      "related_goals": ["goal_001"],
      "related_departments": ["dept_brand"]
    }
  ]
}
```

---

## GraphQL API

### Endpoint
```
POST /api/v1/graphql
```

### Schema Overview

```graphql
type Query {
  # Goals
  goal(id: ID!): Goal
  goals(filter: GoalFilter, limit: Int, offset: Int): GoalConnection
  
  # Tasks
  task(id: ID!): Task
  tasks(filter: TaskFilter, limit: Int, offset: Int): TaskConnection
  
  # Projects
  project(id: ID!): Project
  projects(filter: ProjectFilter): [Project!]!
  
  # Value Streams
  valueStream(id: ID!): ValueStream
  valueStreams(functions: [String!]): [ValueStream!]!
  
  # Complex Queries
  goalHierarchy(rootGoalId: ID!): GoalHierarchy
  tasksByEisenHower: EisenHowerMatrix
  userWorkload(userId: ID!): UserWorkload
}

type Mutation {
  # Goals
  createGoal(input: CreateGoalInput!): Goal!
  updateGoal(id: ID!, input: UpdateGoalInput!): Goal!
  
  # Tasks
  createTask(input: CreateTaskInput!): Task!
  updateTask(id: ID!, input: UpdateTaskInput!): Task!
  assignRABSIC(taskId: ID!, rabsic: RABSICInput!): Task!
  
  # Projects
  createProject(input: CreateProjectInput!): Project!
  updateProjectProgress(id: ID!, progress: Int!): Project!
}

type Subscription {
  # Real-time updates
  taskStatusChanged(projectId: ID): Task!
  kpiUpdated(kpiId: ID): KPI!
  goalProgressChanged: Goal!
}
```

---

### Example Queries

#### 1. Get Goal Hierarchy
```graphql
query GetGoalHierarchy {
  goalHierarchy(rootGoalId: "goal_vision") {
    goal {
      id
      title
      status
      progress
    }
    children {
      goal {
        id
        title
        status
      }
      children {
        goal {
          id
          title
        }
      }
    }
  }
}

# Response:
{
  "data": {
    "goalHierarchy": {
      "goal": {
        "id": "goal_vision",
        "title": "포스트 LVMH",
        "status": "Not Started",
        "progress": 0
      },
      "children": [
        {
          "goal": {
            "id": "goal_longterm",
            "title": "소비재판 HYBE",
            "status": "Not Started"
          },
          "children": [
            {
              "goal": {
                "id": "goal_midterm",
                "title": "국가 대표 브랜드"
              }
            }
          ]
        }
      ]
    }
  }
}
```

#### 2. Get Tasks by Eisenhower Matrix
```graphql
query GetEisenhowerMatrix {
  tasksByEisenHower {
    q1_urgentImportant {
      id
      name
      due_date
      responsible {
        id
        name
      }
    }
    q2_notUrgentImportant {
      id
      name
    }
    q3_urgentNotImportant {
      id
      name
    }
    q4_notUrgentNotImportant {
      id
      name
    }
  }
}
```

#### 3. Get User Workload (RABSIC-based)
```graphql
query GetUserWorkload($userId: ID!) {
  userWorkload(userId: $userId) {
    user {
      id
      name
    }
    responsible_tasks {
      id
      name
      status
    }
    accountable_tasks {
      id
      name
    }
    total_tasks: 15
    completion_rate: 0.67
  }
}
```

---

### Example Mutations

#### Create Task with RABSIC
```graphql
mutation CreateTask {
  createTask(input: {
    name: "디자인 검증"
    status: TODO
    due_date: "2026-02-28"
    urgency_score: 4
    importance_score: 5
    rabsic: {
      responsible: ["user_123"]
      accountable: ["user_456"]
      informed: ["user_789"]
    }
    related_projects: ["proj_001"]
  }) {
    id
    name
    eisenhower_quadrant  # Auto-calculated
    rabsic {
      responsible {
        id
        name
      }
      accountable {
        id
        name
      }
    }
  }
}
```

---

## MCP Server APIs

### Notion MCP

```typescript
// Tools exposed via MCP Protocol
{
  "name": "notion_create_page",
  "description": "Create a new Notion page",
  "inputSchema": {
    "type": "object",
    "properties": {
      "database_id": { "type": "string" },
      "properties": { "type": "object" }
    }
  }
}

// Example usage (from Agent):
await mcp.call_tool("notion_create_page", {
  database_id: env.NOTION_TASKS_DB_ID,
  properties: {
    "Name": { title: [{ text: { content: "New Task" } }] },
    "Status": { status: { name: "1_ToDo" } }
  }
});
```

---

### GitHub MCP

```typescript
{
  "name": "github_create_issue",
  "description": "Create a GitHub issue",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "body": { "type": "string" },
      "labels": { "type": "array" }
    }
  }
}
```

---

### Slack MCP

```typescript
{
  "name": "slack_send_message",
  "description": "Send a Slack message",
  "inputSchema": {
    "type": "object",
    "properties": {
      "channel": { "type": "string" },
      "text": { "type": "string" },
      "blocks": { "type": "array" }
    }
  }
}
```

---

## Webhook Events

### Event Subscriptions

```http
POST /api/v1/webhooks

Request Body:
{
  "url": "https://your-app.com/webhooks/kyndof",
  "events": [
    "task.created",
    "task.status_changed",
    "goal.progress_updated",
    "kpi.updated"
  ],
  "secret": "your_webhook_secret"
}

Response:
{
  "data": {
    "id": "webhook_123",
    "url": "https://your-app.com/webhooks/kyndof",
    "events": ["task.created", "task.status_changed"],
    "active": true
  }
}
```

---

### Event Payloads

#### task.created
```json
{
  "event": "task.created",
  "timestamp": "2026-01-24T15:30:00Z",
  "data": {
    "task": {
      "id": "task_999",
      "name": "New Task",
      "status": "1_ToDo",
      "created_by": "user_123"
    }
  }
}
```

#### goal.progress_updated
```json
{
  "event": "goal.progress_updated",
  "timestamp": "2026-01-24T15:35:00Z",
  "data": {
    "goal": {
      "id": "goal_001",
      "title": "엔터-패션...",
      "progress": {
        "old": 30,
        "new": 35
      }
    }
  }
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "rabsic.accountable",
      "reason": "Must have exactly 1 person"
    },
    "request_id": "req_123456"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Invalid or missing credentials |
| `FORBIDDEN` | 403 | RABSIC permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `RABSIC_VIOLATION` | 422 | RABSIC rules violated |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

```http
Rate-Limit-Limit: 1000
Rate-Limit-Remaining: 999
Rate-Limit-Reset: 1643040000

429 Too Many Requests:
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "retry_after": 60
  }
}
```

---

## Pagination

### Cursor-based (Recommended)

```http
GET /api/v1/tasks?limit=50&cursor=eyJpZCI6InRhc2tfMTIzIn0

Response:
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6InRhc2tfMTczIn0",
    "has_more": true
  }
}
```

### Offset-based (Simple queries)

```http
GET /api/v1/goals?limit=50&offset=100
```

---

## 핵심 설계 특징

### 1. RABSIC 자동 검증

모든 API에서 RABSIC 규칙 자동 적용:
- A(Accountable)는 항상 1명
- Task 생성/수정 시 자동 권한 확인
- 위반 시 `422 RABSIC_VIOLATION` 에러

### 2. 자동 계산 필드

- Eisenhower Quadrant (urgency + importance)
- Task Completion Rate (Rollup from related tasks)
- Progress (집계)

### 3. Real-time Updates

GraphQL Subscriptions로 실시간 업데이트:
- Task 상태 변경 알림
- KPI 업데이트 알림
- Goal 진행률 변경 알림

### 4. Semantic Field Mapping

내부적으로 Notion 필드명 변경에도 API는 일관성 유지:
- API: `task.name`
- Notion: "Name" 또는 "태스크명" (자동 매핑)

---

**Built with ❤️ by Kyndof Team**
