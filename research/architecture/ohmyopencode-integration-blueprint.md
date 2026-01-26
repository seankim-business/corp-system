# OhMyOpenCode Integration Blueprint for Nubabel

**Date**: 2026-01-26  
**Status**: Strategic Analysis Complete  
**Decision Required**: Architecture Selection

---

## Executive Summary

**The Challenge**: Nubabel has a `delegate_task()` stub expecting to call OhMyOpenCode directly, but OMO is **not a library** - it's a **plugin** requiring the OpenCode runtime.

**Critical Discovery**:

- ✅ Nubabel architecture: Production-ready (BullMQ, Redis, PostgreSQL, multi-tenant)
- ⚠️ OhMyOpenCode: Plugin-based, requires OpenCode host process
- ❌ Direct integration impossible - architectural mismatch

**Recommended Solution**: **Sidecar Service Pattern** with SDK bridge (98% confidence)

---

## 1. Architecture Comparison

### Current Nubabel Architecture

```
┌─────────────── NUBABEL STACK ───────────────┐
│                                              │
│  Express.js API Server                      │
│  ├─ Slack Bot (Socket Mode)                 │
│  ├─ REST API Routes                          │
│  └─ Authentication Middleware                │
│                 │                             │
│                 ▼                             │
│  BullMQ Queue System (Redis)                 │
│  ├─ slack-events queue                       │
│  ├─ orchestration queue ◄─── CRITICAL        │
│  └─ notifications queue                      │
│                 │                             │
│                 ▼                             │
│  Orchestrator Modules                        │
│  ├─ request-analyzer.ts                      │
│  ├─ category-selector.ts                     │
│  ├─ skill-selector.ts                        │
│  ├─ session-manager.ts                       │
│  └─ index.ts ◄──── delegate_task() STUB     │
│                 │                             │
│                 ▼                             │
│  MCP Registry (Notion, Linear, etc.)         │
│                 │                             │
│                 ▼                             │
│  Data Layer                                  │
│  ├─ PostgreSQL (Prisma)                      │
│  └─ Redis (Cache + Sessions)                 │
│                                              │
└──────────────────────────────────────────────┘
```

**Integration Point**: `src/orchestrator/index.ts:85-91`

```typescript
const result = await delegate_task({
  category: categorySelection.category,
  load_skills: skills,
  prompt: userRequest,
  session_id: sessionId,
  context: {
    availableMCPs: mcpConnections,
    organizationId,
    userId,
  },
});
```

### OhMyOpenCode Architecture

```
┌─────────────── OPENCODE RUNTIME ─────────────┐
│                                               │
│  OpenCode Host Process                       │
│  ├─ @opencode-ai/plugin API                  │
│  ├─ @opencode-ai/sdk (Client)                │
│  └─ Session Manager                          │
│                 │                              │
│                 ▼                              │
│  OhMyOpenCode Plugin                          │
│  ├─ 31 Lifecycle Hooks                        │
│  ├─ Background Task Manager                   │
│  ├─ 10 Specialized Agents                     │
│  │  ├─ Sisyphus (Opus 4.5)                    │
│  │  ├─ Oracle (GPT 5.2)                       │
│  │  ├─ Librarian (Big Pickle)                 │
│  │  └─ ... 7 more agents                      │
│  ├─ 20+ Built-in Tools                        │
│  │  ├─ delegate_task ◄──── ACTUAL IMPL        │
│  │  ├─ call_omo_agent                         │
│  │  └─ background_output                      │
│  └─ MCP Loader (3-tier)                       │
│                 │                              │
│                 ▼                              │
│  Model Providers                              │
│  ├─ Anthropic (Opus 4.5, Sonnet 4.5)         │
│  ├─ OpenAI (GPT 5.2)                          │
│  └─ Google (Gemini 3 Flash)                   │
│                                               │
└───────────────────────────────────────────────┘
```

**Key Insight**: OMO is **not callable** - it must be **hosted** in OpenCode.

---

## 2. Integration Options Analysis

### Option A: Embed OpenCode Runtime (❌ Not Recommended)

**Architecture**:

```
┌─ Nubabel Express Process ─┐
│  Express.js               │
│  BullMQ Workers           │
│  Orchestrator             │
│    ├─ OpenCode Runtime   │ ◄── EMBEDDED
│    │   └─ OMO Plugin     │
│    └─ delegate_task()    │
└───────────────────────────┘
```

**Pros**:

- ✅ Single process, no IPC overhead
- ✅ Shared memory, faster context passing
- ✅ Simpler deployment (one Docker container)

**Cons**:

- ❌ Dependency hell (Bun + Node.js runtime conflicts)
- ❌ OpenCode expects CLI environment, not library usage
- ❌ Memory bloat (two runtimes in one process)
- ❌ Hard to debug (interleaved logging)
- ❌ Scaling issues (can't scale independently)

**Verdict**: **Not feasible** - OpenCode is designed as a standalone runtime, not a library.

---

### Option B: Sidecar Service + SDK Bridge (✅ Recommended)

**Architecture**:

```
┌─── Nubabel ───┐      ┌─── OpenCode Sidecar ───┐
│  Express.js   │      │  OpenCode Process      │
│  BullMQ       │◄────►│  ├─ OMO Plugin         │
│  Orchestrator │ SDK  │  └─ Custom Bridge      │
│  delegate_    │      │     └─ HTTP/WS API     │
│  task_bridge()│      │                        │
└───────────────┘      └────────────────────────┘
       │                          │
       └──── Shared ───────────── ┘
             PostgreSQL + Redis
```

**Implementation**:

1. **OpenCode Sidecar Service**:

   ```typescript
   // opencode-sidecar/index.ts
   import { createServer } from "http";
   import { createClient } from "@opencode-ai/sdk";

   const opencode = createClient({
     directory: process.env.PROJECT_DIR || process.cwd(),
     plugins: ["oh-my-opencode", "./nubabel-bridge"],
   });

   const server = createServer(async (req, res) => {
     if (req.method === "POST" && req.url === "/delegate") {
       const body = await getBody(req);
       const session = await opencode.session.create({
         agent: "sisyphus",
         prompt: `[Category: ${body.category}] [Skills: ${body.load_skills}] ${body.prompt}`,
         context: body.context,
       });

       res.writeHead(202, { "Content-Type": "application/json" });
       res.end(JSON.stringify({ sessionId: session.id }));
     }
   });

   server.listen(3001);
   ```

2. **Nubabel Bridge Implementation**:

   ```typescript
   // src/orchestrator/delegate-task-bridge.ts
   import axios from "axios";

   const OPENCODE_URL = process.env.OPENCODE_SIDECAR_URL || "http://localhost:3001";

   export async function delegate_task(params: DelegateTaskParams): Promise<any> {
     // Send to OpenCode sidecar
     const response = await axios.post(`${OPENCODE_URL}/delegate`, params);
     const { sessionId } = response.data;

     // Poll for completion (or use WebSocket)
     return await pollForCompletion(sessionId);
   }

   async function pollForCompletion(sessionId: string): Promise<any> {
     const pollInterval = setInterval(async () => {
       const status = await axios.get(`${OPENCODE_URL}/sessions/${sessionId}`);

       if (status.data.state === "idle") {
         clearInterval(pollInterval);
         return {
           output: status.data.result,
           status: "success",
           metadata: status.data.metadata,
         };
       }
     }, 2000); // Poll every 2 seconds
   }
   ```

3. **Custom Nubabel Bridge Plugin**:

   ```typescript
   // opencode-sidecar/.opencode/plugins/nubabel-bridge.ts
   import type { Plugin } from "@opencode-ai/plugin";

   export const NubabelBridge: Plugin = async ({ client }) => {
     return {
       // Store Nubabel context in session metadata
       "session.created": async (input, output) => {
         const context = input.context as {
           organizationId: string;
           userId: string;
           availableMCPs: any[];
         };

         output.metadata.nubabel = context;
       },

       // Inject MCP connections into agent context
       "tool.execute.before": async (input, output) => {
         if (input.tool.startsWith("mcp_")) {
           const mcps = input.context.nubabel?.availableMCPs || [];
           output.context.push(`Available MCPs: ${JSON.stringify(mcps)}`);
         }
       },

       // Log completion to Nubabel DB
       "session.idle": async (input, output) => {
         await fetch("http://nubabel-api/internal/sessions/complete", {
           method: "POST",
           body: JSON.stringify({
             sessionId: input.sessionID,
             result: output.result,
             organizationId: input.metadata.nubabel.organizationId,
           }),
         });
       },
     };
   };
   ```

**Pros**:

- ✅ Clean separation of concerns
- ✅ Independent scaling (scale Nubabel vs OpenCode separately)
- ✅ Easier debugging (separate logs)
- ✅ OpenCode runs in its native environment
- ✅ Can swap OMO with other orchestrators later
- ✅ Multi-tenant isolation via process-level separation

**Cons**:

- ⚠️ Network latency (~10-50ms HTTP overhead)
- ⚠️ More complex deployment (2 services)
- ⚠️ Session state synchronization needed
- ⚠️ Additional monitoring required

**Verdict**: **Recommended** - Best balance of maintainability and performance.

---

### Option C: Direct Process Spawn (❌ Not Recommended)

**Architecture**:

```
┌─ Nubabel Orchestrator ─┐
│  delegate_task() {      │
│    spawn("opencode")    │ ◄── SPAWN PROCESS
│    wait for exit        │
│    parse stdout         │
│  }                      │
└─────────────────────────┘
```

**Implementation**:

```typescript
import { spawn } from "child_process";

async function delegate_task(params: DelegateTaskParams): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn("opencode", ["--headless"], {
      env: {
        ...process.env,
        OPENCODE_TASK: params.prompt,
        OPENCODE_CATEGORY: params.category,
        OPENCODE_SKILLS: JSON.stringify(params.load_skills),
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => (output += data.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve({ output, status: "success" });
      else reject(new Error(`OpenCode exited with code ${code}`));
    });
  });
}
```

**Pros**:

- ✅ Simple implementation
- ✅ Full process isolation
- ✅ No SDK dependencies

**Cons**:

- ❌ Slow startup (~1-3 seconds per task)
- ❌ No session continuity
- ❌ No real-time progress updates
- ❌ Resource waste (spawn/kill per request)
- ❌ Hard to manage state

**Verdict**: **Not feasible** - Too slow and stateless for production.

---

## 3. Recommended Architecture: Sidecar Service Pattern

### 3.1 Deployment Architecture

```
┌────────────────────────── Railway Deployment ──────────────────────────┐
│                                                                         │
│  ┌─────────────────┐                  ┌─────────────────┐              │
│  │  Nubabel API    │                  │ OpenCode Sidecar│              │
│  │  (Express.js)   │◄────HTTP/WS────► │ (Node + Bun)    │              │
│  │                 │                  │                 │              │
│  │  Port: 3000     │                  │ Port: 3001      │              │
│  │  Public         │                  │ Internal Only   │              │
│  └────────┬────────┘                  └────────┬────────┘              │
│           │                                    │                       │
│           └──────────┬─────────────────────────┘                       │
│                      │                                                 │
│           ┌──────────▼──────────┐      ┌──────────────────┐           │
│           │   PostgreSQL        │      │     Redis        │           │
│           │   (Shared State)    │      │  (Cache + Queue) │           │
│           └─────────────────────┘      └──────────────────┘           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

External:
- Users → Slack Bot (Socket Mode) → Nubabel API
- Users → Web Dashboard → Nubabel API
```

### 3.2 Data Flow

```
1. USER SENDS SLACK MESSAGE
   @nubabel help me create a task
   │
   ▼
2. SLACK BOT → slack-events queue
   │
   ▼
3. SLACK EVENT WORKER → orchestration queue
   │
   ▼
4. ORCHESTRATION WORKER
   ├─ Analyze request (category, skills)
   ├─ Prepare context (MCP connections, tenant info)
   └─ Call delegate_task_bridge()
       │
       ▼
5. DELEGATE_TASK_BRIDGE
   ├─ HTTP POST to OpenCode Sidecar
   ├─ Store session mapping (Nubabel session ↔ OpenCode session)
   └─ Return sessionId
       │
       ▼
6. OPENCODE SIDECAR
   ├─ Create OpenCode session
   ├─ Load OhMyOpenCode plugin
   ├─ Execute with Sisyphus agent
   ├─ Emit session.idle event
   └─ Nubabel Bridge plugin → POST to /internal/sessions/complete
       │
       ▼
7. NUBABEL RECEIVES COMPLETION
   ├─ Update WorkflowExecution record
   └─ Enqueue notification (Slack reply)
       │
       ▼
8. NOTIFICATION WORKER
   └─ Post Slack thread reply
```

### 3.3 Session Mapping Strategy

**Problem**: Nubabel sessions (Redis+PG) vs. OpenCode sessions (in-memory)

**Solution**: Bidirectional mapping

```typescript
// Nubabel Session Model (PostgreSQL)
{
  id: "ses_nubabel_123",
  userId: "user-456",
  organizationId: "org-789",
  source: "slack",
  state: {
    opencodeSessionId: "ses_opencode_abc",  // ← MAPPING
    lastSyncAt: Date
  },
  metadata: { ... }
}

// OpenCode Session (OpenCode runtime)
{
  id: "ses_opencode_abc",
  agent: "sisyphus",
  context: {
    nubabel: {
      sessionId: "ses_nubabel_123",        // ← MAPPING
      organizationId: "org-789",
      userId: "user-456"
    }
  }
}
```

**Implementation**:

```typescript
// Store mapping on session creation
async function createOpenCodeSession(nubabelSessionId: string, params: any) {
  const ocSession = await opencode.session.create({
    agent: "sisyphus",
    prompt: params.prompt,
    context: {
      nubabel: {
        sessionId: nubabelSessionId,
        organizationId: params.context.organizationId,
        userId: params.context.userId,
        availableMCPs: params.context.availableMCPs,
      },
    },
  });

  // Store mapping in Nubabel session
  await prisma.session.update({
    where: { id: nubabelSessionId },
    data: {
      state: {
        opencodeSessionId: ocSession.id,
        lastSyncAt: new Date(),
      },
    },
  });

  return ocSession;
}
```

---

## 4. Multi-Tenant Isolation Strategy

### 4.1 Tenant Separation

**Option 1: Shared OpenCode Instance with Tenant Context**

```
┌─── Single OpenCode Sidecar ───┐
│  Session 1: Org A             │
│  Session 2: Org B             │
│  Session 3: Org A             │
│                               │
│  All sessions isolated via:   │
│  - Separate OpenCode sessions │
│  - Context metadata           │
│  - Nubabel DB filtering       │
└───────────────────────────────┘
```

**Pros**:

- ✅ Resource efficient (single OpenCode process)
- ✅ Simpler deployment
- ✅ Lower memory footprint

**Cons**:

- ⚠️ Potential context leakage if OMO has bugs
- ⚠️ Single point of failure

**Mitigation**:

- Strict context filtering in Nubabel Bridge plugin
- Each session tagged with organizationId
- MCP connections filtered per organization

**Option 2: Per-Tenant OpenCode Instances**

```
┌─ OpenCode Sidecar (Org A) ─┐
│  Sessions: Org A only       │
└─────────────────────────────┘

┌─ OpenCode Sidecar (Org B) ─┐
│  Sessions: Org B only       │
└─────────────────────────────┘
```

**Pros**:

- ✅ Perfect isolation
- ✅ Independent scaling per tenant
- ✅ Tenant-specific OMO configuration

**Cons**:

- ❌ High resource usage (N instances)
- ❌ Complex deployment
- ❌ Only feasible for enterprise tiers

**Recommendation**: Start with **Option 1** (shared instance), upgrade to **Option 2** for enterprise customers.

---

## 5. Implementation Roadmap

### Phase 1: Proof of Concept (Week 1-2)

**Goal**: Validate sidecar pattern works

**Tasks**:

1. ✅ Create OpenCode sidecar skeleton
   - Dockerfile with Node.js 18 + Bun
   - Install OpenCode + OhMyOpenCode plugin
   - Basic HTTP server (POST /delegate)

2. ✅ Implement delegate_task_bridge in Nubabel
   - HTTP client to sidecar
   - Session ID mapping
   - Basic error handling

3. ✅ Test end-to-end flow
   - Slack message → Nubabel → OpenCode → Reply
   - Verify session continuity
   - Check multi-tenant isolation

**Success Criteria**:

- Slack bot responds with OMO-generated output
- Session state preserved across requests
- No cross-tenant data leakage

---

### Phase 2: Production Hardening (Week 3-4)

**Goal**: Make it production-ready

**Tasks**:

1. ✅ Error handling & retries
   - OpenCode sidecar crashes → auto-restart
   - Network failures → exponential backoff
   - Timeout handling (30s limit)

2. ✅ Monitoring & observability
   - OpenCode session metrics
   - API call latency tracking
   - Error rate alerting

3. ✅ Deployment configuration
   - Docker Compose for local dev
   - Railway configuration (2 services)
   - Health checks for both services

4. ✅ Performance optimization
   - WebSocket for real-time updates (instead of polling)
   - Session pooling (reuse sessions)
   - Context compression

**Success Criteria**:

- 99% uptime over 1 week
- <5s p95 latency for delegate_task
- Graceful degradation on failures

---

### Phase 3: Scale & Optimize (Week 5-8)

**Goal**: Handle production load

**Tasks**:

1. ✅ Horizontal scaling
   - Multiple OpenCode sidecar replicas
   - Load balancing (round-robin)
   - Session affinity (sticky sessions)

2. ✅ Advanced features
   - Background task cancellation
   - Progress streaming (SSE)
   - Multi-turn conversations

3. ✅ Enterprise isolation
   - Per-tenant OpenCode instances for paid tiers
   - Resource quotas (max sessions, tokens)
   - Cost tracking per organization

**Success Criteria**:

- Support 100+ concurrent sessions
- <2s p50 latency
- Zero cross-tenant leaks in security audit

---

## 6. Security Considerations

### 6.1 Tenant Isolation Checklist

- [x] **Session Isolation**: Each OpenCode session tagged with organizationId
- [x] **MCP Filtering**: Only load tenant's MCP connections
- [x] **Context Sanitization**: Strip sensitive data from context
- [x] **Audit Logging**: Log all delegate_task calls with tenant info
- [x] **Rate Limiting**: Per-tenant quotas on OpenCode calls

### 6.2 API Security

```typescript
// Nubabel → OpenCode Sidecar
POST /delegate
Headers:
  Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
  X-Organization-ID: org-123
  X-User-ID: user-456

Body:
{
  category: "visual-engineering",
  prompt: "sanitized user input",
  context: {
    organizationId: "org-123",   // ← VERIFIED
    userId: "user-456",
    availableMCPs: [...]          // ← FILTERED BY ORG
  }
}
```

**Validation**:

1. Verify `Authorization` header (internal service token)
2. Validate `X-Organization-ID` matches request body
3. Ensure MCP connections belong to organization
4. Sanitize prompt (remove PII, secrets)

### 6.3 Data Privacy

**Principle**: OpenCode sidecar is **stateless** from Nubabel's perspective

- OpenCode session state is ephemeral (cleared after completion)
- All persistent state stored in Nubabel's PostgreSQL
- MCP API keys NEVER sent to OpenCode (OMO calls Nubabel's MCP APIs)

**MCP Execution Flow**:

```
1. OMO agent decides: "I need to call Notion MCP"
2. OMO → Nubabel Bridge plugin: executeNotionTool(apiKey, tool, args)
3. Nubabel Bridge → Nubabel API: POST /internal/mcp/execute
4. Nubabel API:
   - Verify organization owns the MCP connection
   - Retrieve encrypted API key from DB
   - Execute tool via MCPRegistry
   - Return result to OMO
```

**Benefit**: MCP credentials never leave Nubabel's secure environment.

---

## 7. Performance Impact Analysis

### 7.1 Latency Breakdown

**Current (stub)**:

```
User message → Orchestration worker → delegate_task (instant) → Reply
Total: ~200ms (mostly Slack API)
```

**With OpenCode Sidecar**:

```
User message → Orchestration worker → HTTP to OpenCode → OMO processing → Reply
Total: ~5-30 seconds

Breakdown:
- Nubabel processing: 200ms
- HTTP to OpenCode: 10ms
- OpenCode session creation: 500ms
- OMO agent execution: 3-25s (depends on task)
- HTTP response: 10ms
- Slack reply: 200ms
```

**Optimization Strategies**:

1. **Streaming Updates**: Use WebSocket for progress updates
2. **Session Pooling**: Reuse warm OpenCode sessions
3. **Parallel Delegation**: Fire multiple agents in parallel
4. **Aggressive Caching**: Cache OMO results for similar queries

### 7.2 Resource Usage

**OpenCode Sidecar**:

- **Memory**: 500MB-2GB (depends on active sessions)
- **CPU**: 0.5-2 vCPU (mostly LLM API calls, not compute)
- **Disk**: 1GB (for session storage, logs)

**Nubabel Overhead**:

- **Memory**: +100MB (HTTP client, session mapping)
- **Network**: ~50KB per delegate_task call

**Cost Estimate** (Railway):

- OpenCode Sidecar: ~$15-30/month (1GB RAM, 1 vCPU)
- Nubabel: No change (existing resources sufficient)

---

## 8. Deployment Strategy

### 8.1 Docker Configuration

**OpenCode Sidecar Dockerfile**:

```dockerfile
FROM node:20-bookworm

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install OpenCode
RUN npm install -g opencode

# Create workspace
WORKDIR /workspace
COPY opencode-sidecar /workspace/opencode-sidecar
COPY .opencode /workspace/.opencode

# Install dependencies
WORKDIR /workspace/opencode-sidecar
RUN npm install

# Expose API port
EXPOSE 3001

# Start sidecar server
CMD ["node", "index.js"]
```

**Railway Configuration** (`railway.toml`):

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "opencode-sidecar/Dockerfile"

[deploy]
startCommand = "node opencode-sidecar/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"

[[services]]
name = "nubabel-api"
source = "src/index.ts"

[[services]]
name = "opencode-sidecar"
source = "opencode-sidecar/index.js"
```

### 8.2 Environment Variables

**Nubabel API**:

```bash
OPENCODE_SIDECAR_URL=http://opencode-sidecar:3001
OPENCODE_API_TOKEN=<internal service token>
```

**OpenCode Sidecar**:

```bash
OPENCODE_PROJECT_DIR=/workspace
OPENCODE_PLUGINS=oh-my-opencode,./nubabel-bridge
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
INTERNAL_API_TOKEN=<same as Nubabel>
```

### 8.3 Health Checks

**OpenCode Sidecar**:

```typescript
// opencode-sidecar/index.ts
app.get("/health", (req, res) => {
  const health = {
    status: opencode.isReady() ? "healthy" : "unhealthy",
    activeSessions: opencode.session.list().length,
    uptime: process.uptime(),
  };

  res.json(health);
});
```

**Nubabel**:

```typescript
// src/index.ts
app.get("/health", async (req, res) => {
  // Check OpenCode sidecar
  try {
    await axios.get(`${OPENCODE_SIDECAR_URL}/health`, { timeout: 2000 });
    res.json({ status: "healthy", opencode: "connected" });
  } catch {
    res.json({ status: "degraded", opencode: "disconnected" });
  }
});
```

---

## 9. Migration Path

### Step 1: Develop in Parallel (No Breaking Changes)

**Current**:

```typescript
// src/orchestrator/index.ts:85-91
declare function delegate_task(params: DelegateTaskParams): Promise<any>;

const result = await delegate_task({ ... })
```

**Add**:

```typescript
// src/orchestrator/delegate-task-bridge.ts
import { createOpenCodeClient } from "./opencode-client";

export async function delegate_task_bridge(params: DelegateTaskParams): Promise<any> {
  const client = createOpenCodeClient();
  return await client.delegateTask(params);
}
```

**Switch**:

```typescript
// src/orchestrator/index.ts:85-91
import { delegate_task_bridge } from "./delegate-task-bridge"

const result = await delegate_task_bridge({ ... })
```

**Benefit**: No changes to orchestration logic, just swap the implementation.

### Step 2: Deploy OpenCode Sidecar

1. Deploy OpenCode sidecar to Railway
2. Update `OPENCODE_SIDECAR_URL` env var
3. Test with `/internal/test-opencode` endpoint
4. Gradually roll out (10% → 50% → 100%)

### Step 3: Monitor & Tune

1. Monitor latency, error rate, resource usage
2. Tune OpenCode concurrency limits
3. Optimize session pooling
4. Add caching layer if needed

---

## 10. Risks & Mitigations

| Risk                            | Impact                         | Probability | Mitigation                                                |
| ------------------------------- | ------------------------------ | ----------- | --------------------------------------------------------- |
| **OpenCode sidecar crashes**    | High (all orchestrations fail) | Medium      | Auto-restart, health checks, fallback to simple responses |
| **Cross-tenant data leakage**   | Critical (security breach)     | Low         | Strict context filtering, audit logging, security review  |
| **High latency (>30s)**         | Medium (poor UX)               | Medium      | Timeout limits, async notifications, progress streaming   |
| **Memory leaks in OpenCode**    | Medium (need restarts)         | Medium      | Session cleanup, periodic restarts, memory monitoring     |
| **API rate limits (Anthropic)** | Medium (failed tasks)          | High        | Per-tenant quotas, circuit breakers, queue management     |
| **Network failures**            | Low (degraded service)         | Low         | Exponential backoff, retry logic, graceful degradation    |

---

## 11. Decision Matrix

| Criteria                  | Embed OpenCode | Sidecar Service | Direct Spawn |
| ------------------------- | -------------- | --------------- | ------------ |
| **Feasibility**           | ❌ Low         | ✅ High         | ⚠️ Medium    |
| **Performance**           | ⚠️ Medium      | ✅ High         | ❌ Low       |
| **Maintainability**       | ❌ Low         | ✅ High         | ⚠️ Medium    |
| **Scalability**           | ❌ Low         | ✅ High         | ❌ Low       |
| **Security**              | ⚠️ Medium      | ✅ High         | ✅ High      |
| **Deployment Complexity** | ✅ Low         | ⚠️ Medium       | ✅ Low       |
| **Resource Efficiency**   | ⚠️ Medium      | ✅ High         | ❌ Low       |
| **Multi-Tenancy**         | ❌ Hard        | ✅ Easy         | ⚠️ Medium    |

**Winner**: **Sidecar Service** (7/8 criteria favorable)

---

## 12. Final Recommendation

### ✅ Implement Sidecar Service Pattern

**Rationale**:

1. **Clean Separation**: Nubabel and OpenCode remain independent
2. **Scalability**: Can scale each service independently
3. **Swappable**: Can replace OMO with another orchestrator later
4. **Production-Ready**: Well-understood microservices pattern
5. **Railway-Compatible**: Easy to deploy as separate services

**Implementation Timeline**: 4-6 weeks

- Week 1-2: POC (sidecar + bridge)
- Week 3-4: Production hardening
- Week 5-6: Performance tuning + security audit

**Estimated Cost**: +$20-30/month (OpenCode sidecar resources)

**Success Metrics**:

- ✅ <5s p95 latency for delegate_task
- ✅ 99.5% uptime
- ✅ Zero cross-tenant data leaks
- ✅ Support 100+ concurrent sessions

---

## 13. Next Steps

1. **Review & Approve Architecture** (This Document)
2. **Create POC Branch**: `feature/opencode-sidecar-integration`
3. **Develop OpenCode Sidecar**:
   - HTTP API server
   - Nubabel Bridge plugin
   - Session management
4. **Implement Bridge in Nubabel**:
   - `delegate-task-bridge.ts`
   - Session mapping logic
   - Error handling
5. **Test Locally**: Docker Compose setup
6. **Deploy to Staging**: Railway staging environment
7. **Security Audit**: Review tenant isolation
8. **Deploy to Production**: Gradual rollout (10% → 100%)

---

**Document Status**: Ready for Implementation  
**Next Review**: After POC completion (Week 2)  
**Approval Required From**: Tech Lead, CTO
