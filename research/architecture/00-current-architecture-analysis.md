# Current Architecture Analysis

> **분석일**: 2026-01-26  
> **대상**: Nubabel (kyndof-corp-system) - Phase 2 Week 8 완료 시점

---

## 📋 Executive Summary

**현재 상태**: Multi-tenant B2B SaaS 플랫폼의 기반 인프라 완성 (약 70% 완료)

**핵심 구현 완료**:

- ✅ Multi-tenant authentication (Google OAuth)
- ✅ Workflow CRUD + Execution engine
- ✅ Notion MCP integration (basic)
- ✅ Web Dashboard (React)
- ✅ Database schema with RLS (Row-Level Security)

**Phase 2 Week 9-12 목표**:

- 🎯 Slack Bot integration
- 🎯 Orchestrator layer (multi-agent coordination)
- 🎯 OhMyOpenCode `delegate_task` integration
- 🎯 범용 MCP integration system (Notion → Linear/Jira/Asana 등으로 확장)

---

## 🏗️ 기술 스택

### Backend

```json
{
  "runtime": "Node.js 20+",
  "framework": "Express.js 4.18",
  "language": "TypeScript 5.3",
  "orm": "Prisma 5.9",
  "database": "PostgreSQL 15+",
  "cache": "Redis 7+",
  "deployment": "Railway (Docker)"
}
```

### Frontend

```json
{
  "framework": "React 18",
  "language": "TypeScript",
  "styling": "Tailwind CSS",
  "state": "Zustand",
  "bundler": "Vite"
}
```

### Integrations (현재)

```json
{
  "slack": "@slack/bolt 4.6",
  "notion": "@notionhq/client 5.8",
  "auth": "google-auth-library 9.6"
}
```

### AI/Agent (계획)

```json
{
  "orchestration": "OhMyOpenCode delegate_task",
  "protocol": "MCP (Model Context Protocol)",
  "llm": "Claude 3.5 Sonnet (Anthropic API)",
  "frameworks": "TBD (LangGraph vs Custom)"
}
```

---

## 📂 현재 디렉토리 구조

```
kyndof-corp-system/
├── src/                          # Backend source
│   ├── api/                      # REST API routes
│   │   ├── workflows.ts          # ✅ Workflow CRUD + execution
│   │   ├── notion.ts             # ✅ Notion settings API
│   │   └── slack.ts              # 🚧 NEW (Phase 2 Week 9-12)
│   │
│   ├── auth/                     # ✅ Authentication
│   │   ├── auth.routes.ts        # OAuth endpoints
│   │   └── auth.service.ts       # Google OAuth logic
│   │
│   ├── middleware/               # ✅ Middleware
│   │   ├── auth.middleware.ts    # JWT verification
│   │   └── tenant.middleware.ts  # Multi-tenant isolation
│   │
│   ├── db/                       # ✅ Database
│   │   └── client.ts             # Prisma client
│   │
│   ├── mcp-servers/              # ✅ MCP integrations
│   │   └── notion/               # Notion MCP server
│   │       ├── index.ts          # MCP server entry
│   │       ├── client.ts         # Notion API client
│   │       ├── types.ts          # Type definitions
│   │       └── tools/            # MCP tools
│   │           ├── getTasks.ts   # ✅ Read tasks
│   │           ├── createTask.ts # ✅ Create task
│   │           ├── updateTask.ts # ✅ Update task
│   │           └── deleteTask.ts # ✅ Delete task
│   │
│   ├── orchestrator/             # 🚧 NEW (Phase 2 Week 9-12)
│   │   ├── index.ts              # Main orchestrate()
│   │   ├── request-analyzer.ts   # Intent analysis
│   │   ├── category-selector.ts  # OhMyOpenCode category selection
│   │   ├── skill-selector.ts     # Skill selection
│   │   └── session-manager.ts    # Session management
│   │
│   ├── services/                 # 🚧 Business logic
│   │   ├── slack-service.ts      # Slack API wrapper
│   │   └── mcp-registry.ts       # MCP connection registry
│   │
│   ├── types/                    # Type definitions
│   │   └── express.d.ts          # Express extensions
│   │
│   └── index.ts                  # ✅ Server entry point
│
├── prisma/                       # Database
│   ├── schema.prisma             # ✅ Data model (11 tables)
│   └── migrations/               # Migration history
│
├── frontend/                     # ✅ React Dashboard
│   ├── src/
│   │   ├── pages/                # Main pages
│   │   ├── components/           # Reusable components
│   │   └── stores/               # Zustand stores
│   └── package.json
│
├── docs/                         # Documentation
│   ├── core/
│   │   ├── 06-ohmyopencode-integration.md  # ✅ delegate_task spec
│   │   └── 07-slack-orchestrator-implementation.md  # ✅ Implementation spec
│   └── planning/
│
├── research/                     # 🆕 Research documentation
│   ├── README.md
│   └── architecture/
│       └── 00-current-architecture-analysis.md  # This file
│
└── .opencode/                    # 🚧 Skills (to be created)
    └── skills/
        └── mcp-integration/      # 범용 MCP integration skill
            └── SKILL.md
```

---

## 🗄️ Database Schema (Prisma)

### Multi-Tenant Core (완성)

```prisma
Organization          # Tenants (companies)
  ├─ workspaceDomains # Google Workspace domains
  ├─ memberships      # User ↔ Org relationship
  ├─ workflows        # Workflow definitions
  ├─ notionConnections # Legacy Notion config
  └─ mcpConnections   # 🆕 Generic MCP connections

User                  # Global identity
  ├─ memberships      # Multi-org support
  └─ sessions         # Auth + orchestrator sessions

Session               # 이중 목적!
  ├─ JWT auth sessions (tokenHash)
  └─ Orchestrator conversation sessions (source, state, history)
```

### Business Data (완성)

```prisma
Workflow              # Automation definitions
  └─ executions       # Execution history

Agent                 # AI agents (dynamic team)
  ├─ manager          # Hierarchical structure
  ├─ subordinates
  └─ team

Team                  # Agent groups
Project               # Projects
Task                  # RABSIC-enabled tasks
Goal                  # Hierarchical goals
ValueStream           # Business processes
KPI                   # Performance indicators
```

### MCP Integration (Phase 2 Week 9-12)

```prisma
MCPConnection         # 🆕 범용 MCP connections
  ├─ provider: String  # 'linear', 'notion', 'jira', 'asana'
  ├─ config: Json      # Provider-specific config
  └─ enabled: Boolean

NotionConnection      # 🔄 Legacy (backward compat)
```

---

## 🔄 현재 Data Flow

### 1. Web Dashboard → Workflow Execution

```
User (Browser)
  │
  ├─ POST /api/workflows/:id/execute
  │  └─ Auth middleware: JWT verification
  │     └─ Tenant middleware: organization_id resolution
  │
  ▼
src/api/workflows.ts: executeWorkflow()
  │
  ├─ Fetch workflow definition from DB
  ├─ Validate input
  ├─ Create WorkflowExecution record (status: pending)
  │
  ▼
Background execution (simple Promise)
  │
  ├─ Update status: running
  ├─ Execute workflow steps
  │  └─ 🔌 Notion MCP tools (if workflow uses Notion)
  │
  ├─ Update status: success/failed
  └─ Save output_data
```

**문제점**:

- ❌ 동기 실행 (long-running workflows block response)
- ❌ No retry mechanism
- ❌ No real-time status updates

**Phase 2 개선 필요**:

- ✅ Background job queue (BullMQ)
- ✅ Real-time status (WebSocket or polling)
- ✅ Retry logic

---

## 🤖 Notion MCP Integration (현재)

### MCP Server 구조

```typescript
// src/mcp-servers/notion/index.ts

class NotionMCPServer {
  private client: NotionClient;

  async getTasks(databaseId: string): Promise<Task[]> {
    // Notion API query
  }

  async createTask(data: CreateTaskInput): Promise<Task> {
    // Notion API create
  }

  async updateTask(taskId: string, data: UpdateTaskInput): Promise<Task> {
    // Notion API update
  }

  async deleteTask(taskId: string): Promise<void> {
    // Notion API delete
  }
}
```

### API Routes

```
GET  /api/notion/databases        # List databases
POST /api/notion/connection       # Save API key
GET  /api/notion/connection       # Get connection
POST /api/notion/test-connection  # Test connection
```

### 한계점

**현재**: Notion 전용 hard-coded

```typescript
// src/mcp-servers/notion/index.ts
import { Client } from "@notionhq/client";

// Notion-specific implementation
```

**Phase 2 목표**: 범용 MCP system

```typescript
// src/services/mcp-registry.ts
export async function getActiveMCPConnections(orgId: string) {
  return await prisma.mCPConnection.findMany({
    where: { organizationId: orgId, enabled: true },
  });
}

// Dynamic MCP server loading
const mcpServers = {
  notion: new NotionMCPServer(config),
  linear: new LinearMCPServer(config), // 🆕
  jira: new JiraMCPServer(config), // 🆕
  asana: new AsanaMCPServer(config), // 🆕
};
```

---

## 🎯 OhMyOpenCode Integration (계획)

### delegate_task API 구조

```typescript
import { delegate_task } from '@ohmyopencode/core';

const result = await delegate_task({
  category: 'quick',           // 7가지 category 중 선택
  load_skills: ['mcp-integration'],  // Skills 로드
  prompt: 'Create a task in Linear',
  session_id: sessionId,       // Session continuity
  context: {                   // Context 전달
    availableMCPs: [...],
  },
});
```

### Category System (7가지)

| Category             | 용도                          | Model                      |
| -------------------- | ----------------------------- | -------------------------- |
| `visual-engineering` | Frontend, UI/UX, design       | Optimized for visual tasks |
| `ultrabrain`         | Deep reasoning, architecture  | High-intelligence model    |
| `artistry`           | Creative, novel ideas         | Creative-focused model     |
| `quick`              | Trivial tasks, simple changes | Fast, efficient model      |
| `unspecified-low`    | Low-effort misc tasks         | General model              |
| `unspecified-high`   | High-effort misc tasks        | General model              |
| `writing`            | Documentation, prose          | Writing-optimized model    |

### Skill System (범용 MCP 통합)

**Skill 파일**: `.opencode/skills/mcp-integration/SKILL.md`

```markdown
---
name: mcp-integration
description: Generic MCP integration skill for ANY productivity tool
---

# MCP Integration Skill

You can work with ANY productivity tool that has an MCP server.

## How to Use

1. **Detect the tool** the user is asking about
2. **Check available MCP connections** (from context.availableMCPs)
3. **Use the appropriate MCP tools** to fulfill the request
4. **Handle errors gracefully** if the tool isn't connected
```

---

## 🚧 Phase 2 Week 9-12 구현 계획

### 1. Slack Bot (src/api/slack.ts)

```typescript
// @slack/bolt 사용
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true, // Railway WebSocket 지원
});

app.event("app_mention", async ({ event, say }) => {
  // 1. 사용자 인증 (Slack user → Nubabel user)
  // 2. 조직 식별 (Slack workspace → Organization)
  // 3. Session 생성/복원
  // 4. Orchestrator 호출
  // 5. 결과 전송
});
```

### 2. Orchestrator (src/orchestrator/index.ts)

```typescript
export async function orchestrate(request: OrchestrationRequest) {
  // 1. Request 분석 (intent, entities, complexity)
  const analysis = await analyzeRequest(request.userRequest);

  // 2. Category 선택 (keyword matching + complexity)
  const category = selectCategory(request.userRequest, analysis);

  // 3. Skill 선택 (Notion/Linear/Jira 감지)
  const skills = selectSkills(request.userRequest, analysis);

  // 4. MCP connections 조회
  const mcpConnections = await getActiveMCPConnections(request.organizationId);

  // 5. delegate_task 호출
  const result = await delegate_task({
    category,
    load_skills: skills,
    prompt: request.userRequest,
    session_id: request.sessionId,
    context: { availableMCPs: mcpConnections },
  });

  // 6. Execution 히스토리 저장
  await saveExecution(result);

  return result;
}
```

### 3. MCP Registry Service

```typescript
// src/services/mcp-registry.ts

export async function getActiveMCPConnections(orgId: string) {
  return await prisma.mCPConnection.findMany({
    where: { organizationId: orgId, enabled: true },
  });
}

export async function createMCPConnection(params: {
  organizationId: string;
  provider: string; // 'linear', 'jira', etc.
  name: string;
  config: Record<string, any>;
}) {
  return await prisma.mCPConnection.create({
    data: { ...params, enabled: true },
  });
}
```

### 4. Session Manager (Enhanced)

```typescript
// src/orchestrator/session-manager.ts

export async function createSession(context: SessionContext) {
  const session = {
    id: `ses_${Date.now()}_${randomString()}`,
    userId: context.userId,
    organizationId: context.organizationId,
    source: context.source, // 'slack' | 'web' | 'terminal' | 'api'
    state: {},
    history: [],
    metadata: context.metadata || {},
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1h
  };

  // Redis (hot) + PostgreSQL (cold)
  await redis.setex(`session:${session.id}`, 3600, JSON.stringify(session));
  await prisma.session.create({ data: session });

  return session;
}
```

---

## 🔍 핵심 리서치 질문

### 1. Slack 3초 Timeout 극복 방법?

**문제**: Slack은 3초 내 응답 필요, 하지만 AI agent 실행은 30초+ 소요

**후보 솔루션**:

- ✅ BullMQ job queue (Redis 기반)
- ✅ Temporal.io workflow engine
- ✅ Custom event-driven architecture

**리서치 필요**:

- Zapier/n8n은 어떻게 해결했는가?
- BullMQ vs Temporal trade-off?

### 2. Session Continuity 구현?

**문제**: Slack 대화 → Web 전환 시 context 유지 필요

**후보 솔루션**:

- ✅ Redis (hot) + PostgreSQL (cold) 2-tier storage
- ✅ LangChain/LangGraph memory management
- ✅ OhMyOpenCode session_id propagation

**리서치 필요**:

- Production-grade session management patterns?
- Session expiration & cleanup strategies?

### 3. Multi-Agent Orchestration?

**문제**: 복잡한 요청은 여러 agent 협업 필요

**후보 솔루션**:

- ✅ LangGraph (state graph 기반)
- ✅ Custom orchestrator (delegate_task 활용)
- ✅ CrewAI (role-based agents)

**리서치 필요**:

- LangGraph vs Custom trade-off?
- Error recovery patterns?

### 4. MCP Protocol 활용?

**문제**: 여러 도구 (Notion, Linear, Jira) 통합 필요

**후보 솔루션**:

- ✅ Anthropic MCP SDK (TypeScript)
- ✅ 도구별 thin adapter 패턴
- ✅ 범용 MCP server registry

**리서치 필요**:

- Production MCP server 구조?
- Authentication patterns (API keys, OAuth)?

---

## 📊 현재 Gap Analysis

### Infrastructure ✅

- [x] Multi-tenant database
- [x] Google OAuth
- [x] JWT sessions
- [x] Railway deployment

### Workflow Engine 🟡

- [x] Basic workflow execution
- [ ] Background job queue
- [ ] Retry logic
- [ ] Real-time status

### MCP Integration 🟡

- [x] Notion MCP (basic)
- [ ] Generic MCP registry
- [ ] Linear/Jira/Asana MCPs
- [ ] Authentication patterns

### Orchestrator ❌

- [ ] Request analyzer
- [ ] Category selector
- [ ] Skill selector
- [ ] Multi-agent coordination
- [ ] Session manager

### Slack Bot ❌

- [ ] Slack App setup
- [ ] Event handlers
- [ ] User mapping
- [ ] Organization mapping
- [ ] Response formatting

---

## 🚀 다음 단계

### 즉시 (리서치 완료 후)

1. 7개 백그라운드 에이전트 결과 통합
2. 아키텍처 패턴 비교표 작성
3. 기술 스택 최종 선택 (BullMQ vs Temporal, LangGraph vs Custom)

### 단기 (이번 주)

1. `docs/architecture.md` 업데이트 (리서치 기반)
2. Implementation spec 작성
3. Slack App 생성 (Slack Developer Portal)
4. `.opencode/skills/mcp-integration/SKILL.md` 작성

### 중기 (Phase 2 Week 9-12)

1. Slack Bot 구현
2. Orchestrator 구현
3. MCP Registry 구현
4. Session Manager 구현
5. End-to-end 테스트

---

**작성일**: 2026-01-26  
**작성자**: Sisyphus (via OhMyOpenCode)  
**버전**: 1.0.0
