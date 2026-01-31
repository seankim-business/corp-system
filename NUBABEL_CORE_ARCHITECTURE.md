# Nubabel Core Platform - Architecture

> **멀티테넌트 B2B SaaS 프레임워크 설계**

**버전**: 1.0  
**작성일**: 2026-01-25  
**대상**: Core Platform만 (회사별 Extension 제외)

---

## 📌 아키텍처 원칙

### 1. **Framework-First Design**

Nubabel Core는 **프레임워크**입니다. 특정 회사의 니즈가 아닌, **모든 회사가 사용할 수 있는 공통 기능**만 포함합니다.

```
❌ 나쁜 예시: Core에 특수 로직 하드코딩
if (organizationId === 'kyndof') {
  await trackProductionOrder();
}

✅ 좋은 예시: Hook/Plugin 시스템으로 확장
// Core Platform
workflowEngine.on('workflow.completed', async (workflow) => {
  await pluginManager.emit('workflow.completed', workflow);
});

// Kyndof Extension (별도 패키지)
class KyndofPlugin {
  onWorkflowCompleted(workflow) {
    if (workflow.type === 'production') {
      await this.trackProductionOrder(workflow);
    }
  }
}
```

### 2. **Multi-Tenant by Default**

**모든 코드는 멀티테넌트를 가정**합니다.

```typescript
// ❌ 잘못된 쿼리
const users = await prisma.user.findMany();

// ✅ 올바른 쿼리 (항상 tenant 필터)
const users = await prisma.user.findMany({
  where: { organizationId: ctx.organizationId }
});

// 더 나은 방법: Middleware에서 자동 필터링
prisma.$use(async (params, next) => {
  if (params.model && tenantTables.includes(params.model)) {
    params.args.where = {
      ...params.args.where,
      organizationId: getCurrentTenantId()
    };
  }
  return next(params);
});
```

### 3. **Plugin Architecture**

회사별 특수 기능은 **Extension**으로 분리합니다.

```
nubabel/
├── core/                    # Core Platform (공통)
│   ├── auth/
│   ├── workflow/
│   └── api/
│
└── extensions/              # 회사별 Extension
    ├── kyndof/             # Kyndof 특수 기능
    │   ├── production/
    │   └── quality-ai/
    │
    └── template/           # 다른 회사용 템플릿
        └── README.md
```

### 4. **Progressive Enhancement**

**단순 → 복잡** 순서로 구현합니다.

```
Phase 1: Manual (사람이 버튼 클릭)
  ↓
Phase 2: Scheduled (Cron으로 자동 실행)
  ↓
Phase 3: Event-Driven (트리거로 실행)
  ↓
Phase 4: AI-Powered (Agent가 판단하여 실행)
  ↓
Phase 5: Learning (사람 행동 학습하여 자동화)
```

---

## 🏗️ System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Interface Layer                         │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │   Web    │  │  Slack   │  │   API    │               │
│  │Dashboard │  │   Bot    │  │ (REST)   │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
└───────┼─────────────┼─────────────┼────────────────────── ┘
        │             │             │
        └─────────────┴─────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│                 Application Layer                         │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Authentication & Authorization                     │  │
│  │ - Multi-tenant resolver (subdomain → org_id)      │  │
│  │ - Session management (JWT)                        │  │
│  │ - Permission engine (RBAC + RABSIC)               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Workflow Engine (Phase 2)                         │  │
│  │ - Task orchestration                              │  │
│  │ - Execution queue                                 │  │
│  │ - Retry & error handling                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Agent System (Phase 3)                            │  │
│  │ - Agent registry                                  │  │
│  │ - Task delegation                                 │  │
│  │ - Background execution                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Plugin Manager                                    │  │
│  │ - Extension loading                               │  │
│  │ - Hook system                                     │  │
│  │ - Event bus                                       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│                    Data Layer                             │
│                                                           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │
│  │  PostgreSQL    │  │     Redis      │  │  Vector DB │ │
│  │  (Main Data)   │  │   (Session)    │  │ (Semantic) │ │
│  └────────────────┘  └────────────────┘  └────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ MCP Integration Layer                             │  │
│  │ - Notion MCP    - Slack MCP    - Drive MCP       │  │
│  │ - GitHub MCP    - Email MCP    - Custom MCPs     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema (Core Platform만)

### Core Tables

```sql
-- ================================================
-- AUTHENTICATION & ORGANIZATION
-- ================================================

-- 조직 (테넌트)
organizations
├── id (uuid, pk)
├── name (varchar)
├── slug (varchar, unique)        -- URL-safe identifier
├── domain (varchar)               -- Primary domain
├── settings (jsonb)               -- Org-level configuration
├── created_at
└── updated_at

-- Google Workspace 도메인 (1:N with organizations)
workspace_domains
├── id (uuid, pk)
├── organization_id (fk → organizations)
├── domain (varchar, unique)       -- e.g., kyndof.com
├── verified (boolean)
├── verification_token (varchar)
├── verified_at
└── created_at

-- 사용자 (여러 조직에 소속 가능)
users
├── id (uuid, pk)
├── email (varchar, unique)
├── name (varchar)
├── avatar_url (varchar)
├── google_id (varchar, unique)    -- Google OAuth
├── password_hash (varchar)        -- Fallback auth
├── created_at
└── updated_at

-- 조직-사용자 연결 (N:M)
memberships
├── id (uuid, pk)
├── organization_id (fk → organizations)
├── user_id (fk → users)
├── role (enum: owner, admin, member)
├── permissions (jsonb)            -- Custom permissions
├── invited_by (fk → users)
├── joined_at
└── created_at

-- 세션
sessions
├── id (uuid, pk)
├── user_id (fk → users)
├── organization_id (fk → organizations)
├── token_hash (varchar)           -- JWT hash
├── expires_at
└── created_at

-- ================================================
-- WORKFLOW SYSTEM (Phase 2)
-- ================================================

-- 워크플로우 정의
workflows
├── id (uuid, pk)
├── organization_id (fk → organizations)  -- RLS
├── name (varchar)
├── description (text)
├── config (jsonb)                 -- Workflow DAG
├── enabled (boolean)
├── created_by (fk → users)
├── created_at
└── updated_at

-- 워크플로우 실행 이력
workflow_executions
├── id (uuid, pk)
├── workflow_id (fk → workflows)
├── organization_id (fk → organizations)  -- RLS
├── status (enum: pending, running, success, failed)
├── input_data (jsonb)
├── output_data (jsonb)
├── error_message (text)
├── started_at
├── completed_at
└── created_at

-- ================================================
-- AGENT SYSTEM (Phase 3)
-- ================================================

-- AI Agent 정의
agents
├── id (uuid, pk)
├── organization_id (fk → organizations)  -- RLS
├── name (varchar)
├── type (enum: function, specialist, learning)
├── config (jsonb)                 -- Model, prompts, skills
├── enabled (boolean)
├── created_by (fk → users)
├── created_at
└── updated_at

-- Agent 실행 이력
agent_executions
├── id (uuid, pk)
├── agent_id (fk → agents)
├── organization_id (fk → organizations)  -- RLS
├── task_description (text)
├── result (jsonb)
├── tokens_used (integer)
├── duration_ms (integer)
├── started_at
├── completed_at
└── created_at
```

### Row-Level Security (RLS)

**모든 테넌트 테이블에 자동 격리 정책 적용**:

```sql
-- Example: workflows 테이블
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflows
  FOR ALL
  USING (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

-- 세션 시작 시 tenant_id 설정
SET app.tenant_id = '<organization-uuid>';
```

---

## 🔐 Authentication Flow

### Google OAuth 2.0 + Multi-Tenant

```
1. User visits: https://auth.nubabel.com
   ↓
2. Click "Sign in with Google"
   ↓
3. Redirect to Google OAuth
   ↓
4. Google returns with code + hd (hosted domain)
   ↓
5. Backend processes:
   a. Exchange code for access token
   b. Get user profile (email, name, avatar)
   c. Extract domain from hd parameter
   ↓
6. Check workspace_domains table:
   - Domain exists? → Use existing organization
   - New domain? → Create new organization (first user = owner)
   ↓
7. Check memberships table:
   - User already member? → Use existing
   - New user? → Create membership (role: member, first user: owner)
   ↓
8. Create session + JWT token
   ↓
9. Set httpOnly cookie with JWT
   ↓
10. Redirect to: https://{org-slug}.nubabel.com/dashboard
```

### Session Management

```typescript
// JWT Payload
interface JWTPayload {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  iat: number;
  exp: number;
}

// Middleware: Tenant Resolver
app.use(async (req, res, next) => {
  const subdomain = extractSubdomain(req.hostname);
  const org = await getOrganizationBySlug(subdomain);
  
  req.ctx = {
    organizationId: org.id,
    organizationSlug: org.slug
  };
  
  // Set PostgreSQL session variable for RLS
  await prisma.$executeRaw`
    SET app.tenant_id = ${org.id};
  `;
  
  next();
});
```

---

## 🔌 Plugin System

### Hook Points

Core Platform은 여러 지점에서 **Hook**을 제공하여 Extension이 동작을 확장할 수 있습니다.

```typescript
// Core Platform
class WorkflowEngine {
  async execute(workflow: Workflow) {
    // Hook: Before execution
    await this.hooks.call('workflow.before_execute', workflow);
    
    // Core logic
    const result = await this.runWorkflow(workflow);
    
    // Hook: After execution
    await this.hooks.call('workflow.after_execute', workflow, result);
    
    return result;
  }
}

// Extension (Kyndof)
class KyndofExtension implements Extension {
  register(hooks: HookManager) {
    hooks.on('workflow.after_execute', async (workflow, result) => {
      if (workflow.type === 'production_order') {
        await this.notifyProductionTeam(result);
      }
    });
  }
}
```

### Available Hooks (Phase 2+)

| Hook | 시점 | 용도 |
|------|------|------|
| `workflow.before_execute` | 워크플로우 실행 전 | 유효성 검사, 로깅 |
| `workflow.after_execute` | 워크플로우 실행 후 | 알림, 후속 작업 |
| `workflow.on_error` | 에러 발생 시 | 에러 처리, 복구 |
| `agent.before_task` | Agent 작업 전 | 권한 확인, 컨텍스트 추가 |
| `agent.after_task` | Agent 작업 후 | 결과 로깅, 학습 데이터 저장 |
| `user.after_login` | 로그인 후 | Welcome 메시지, 온보딩 |
| `user.before_logout` | 로그아웃 전 | 상태 저장 |

---

## 📦 Extension Development

### Directory Structure

```
extensions/
├── kyndof/                    # Kyndof-specific
│   ├── package.json
│   ├── src/
│   │   ├── production/       # 생산 관리
│   │   ├── quality-ai/       # 품질 검사 AI
│   │   └── index.ts          # Extension entry
│   └── prisma/
│       └── schema.prisma     # Kyndof 전용 테이블
│
└── template/                  # 다른 회사용 템플릿
    ├── README.md
    └── src/
        └── index.ts
```

### Extension Interface

```typescript
// Core Platform
interface Extension {
  name: string;
  version: string;
  
  // Lifecycle
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;
  
  // Hook registration
  register(hooks: HookManager): void;
  
  // Database migrations (optional)
  getMigrations?(): Migration[];
  
  // UI routes (optional)
  getRoutes?(): Route[];
}

// Kyndof Extension Example
export class KyndofExtension implements Extension {
  name = 'kyndof';
  version = '1.0.0';
  
  async onLoad() {
    console.log('Kyndof extension loaded');
  }
  
  register(hooks: HookManager) {
    hooks.on('workflow.after_execute', this.handleWorkflowComplete);
  }
  
  private async handleWorkflowComplete(workflow, result) {
    // Kyndof-specific logic
  }
}
```

---

## 🚀 Deployment Architecture

### Multi-Tenant Subdomain Routing

```
                  Railway Load Balancer
                          │
                          ▼
                    Nginx Reverse Proxy
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  auth.nubabel.com  kyndof.nubabel.com  companyb.nubabel.com
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                          ▼
              Express App (Node.js)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  Tenant: auth      Tenant: kyndof   Tenant: companyb
  (No org context)  (org_id: xxx)    (org_id: yyy)
```

### Environment Configuration

```bash
# Core Platform
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
JWT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Application
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# Extensions (enabled per organization)
ENABLED_EXTENSIONS=kyndof,template
```

---

## 📊 Observability

### Logging

```typescript
// Structured logging
logger.info('Workflow executed', {
  organizationId: ctx.organizationId,
  workflowId: workflow.id,
  duration: executionTime,
  status: 'success'
});
```

### Metrics (Future)

- Workflow execution count per org
- Average execution time
- Error rate
- API request latency
- Database query performance

### Monitoring (Future)

- Sentry for error tracking
- DataDog for performance monitoring
- Custom dashboard for org-specific metrics

---

## 🔒 Security

### Tenant Isolation

1. **Database Level**: PostgreSQL RLS
2. **Application Level**: Middleware enforcement
3. **Session Level**: JWT includes `organizationId`
4. **File Storage**: Org-specific directories
5. **Cache Keys**: Include org prefix

### Data Encryption

- Passwords: bcrypt
- Secrets: Environment variables (never in code)
- Data at rest: PostgreSQL encryption (Railway)
- Data in transit: HTTPS only

---

## 📝 Development Guidelines

### 1. **새 기능 추가 시 자문**

```
Q1: 이 기능이 모든 회사에 필요한가?
  Yes → Core Platform에 추가
  No  → Extension으로 구현

Q2: 이 기능이 특정 회사만의 니즈인가?
  Yes → 해당 회사 Extension에 추가
  No  → Core Platform 후보

Q3: Extension으로 구현 가능한가?
  Yes → Extension으로 구현 (Core 수정 최소화)
  No  → Hook 추가 필요 (Core에 Hook만 추가)
```

### 2. **코딩 규칙**

```typescript
// ✅ 올바른 방법
const users = await prisma.user.findMany({
  where: { 
    organizationId: ctx.organizationId  // 항상 tenant 필터
  }
});

// ❌ 잘못된 방법
const users = await prisma.user.findMany();  // 모든 tenant 데이터 노출
```

### 3. **테스트**

```typescript
// Multi-tenant 테스트 필수
describe('Workflow API', () => {
  it('should isolate data between tenants', async () => {
    const org1 = await createOrganization('org1');
    const org2 = await createOrganization('org2');
    
    const workflow1 = await createWorkflow(org1.id);
    const workflow2 = await createWorkflow(org2.id);
    
    // Org1에서 Org2 데이터 접근 불가
    const result = await getWorkflows(org1.id);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(workflow1.id);
  });
});
```

---

## 🎯 Roadmap

### Phase 1: Foundation ✅
- [x] Multi-tenant authentication
- [x] Database schema with RLS
- [x] Deployment configuration

### Phase 2: Workflow Engine (Q1 2026)
- [ ] Simple workflow definition (JSON/YAML)
- [ ] Manual execution (button click)
- [ ] Execution history viewer
- [ ] Error handling & retry

### Phase 3: Agent System (Q2 2026)
- [ ] Agent registry
- [ ] Task delegation framework
- [ ] Background job queue
- [ ] Logging & monitoring

### Phase 4: Extension System (Q3 2026)
- [ ] Plugin manager
- [ ] Hook system implementation
- [ ] Extension marketplace (UI)
- [ ] Documentation for extension developers

### Phase 5: Learning (2027+)
- [ ] Activity tracking
- [ ] Pattern detection
- [ ] Predictive automation
- [ ] "Human as Training Data"

---

**이 문서는 Nubabel Core Platform의 기술 명세서입니다.**

회사별 특수 기능은 Extension으로 구현하세요.
