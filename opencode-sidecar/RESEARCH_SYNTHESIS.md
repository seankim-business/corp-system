# OpenCode Sidecar Research Synthesis

**Date**: 2026-01-26  
**Research Duration**: 3 agents, ~3 minutes total  
**Status**: Ready for Implementation

---

## Executive Summary

After comprehensive research across 3 parallel agents analyzing:

1. Nubabel's orchestrator implementation (internal)
2. OpenCode SDK patterns (external)
3. HTTP bridge examples (external)

**Critical Finding**: We have TWO implementation paths:

### Path A: Simple HTTP Wrapper (RECOMMENDED for v1.0)

- Replicate `ai-executor.ts` behavior via HTTP
- Direct Anthropic SDK calls
- No OpenCode/oh-my-opencode dependency
- **Effort**: 2-3 hours
- **Complexity**: Low

### Path B: OpenCode SDK Integration (Future v2.0)

- Full oh-my-opencode agent orchestration
- Multi-agent delegation capabilities
- **Effort**: 1-2 weeks
- **Complexity**: High

---

## 1. Architecture Decision

### Current Nubabel Behavior

```typescript
// src/orchestrator/delegate-task.ts
if (OPENCODE_SIDECAR_URL) {
  // POST to sidecar
} else if (USE_BUILTIN_AI) {
  // Call ai-executor.ts → Anthropic SDK
}
```

**ai-executor.ts does**:

- Category → Model selection (7 categories → haiku/sonnet)
- Skill → System prompt injection (4 skills)
- Anthropic SDK call with streaming
- Token counting & cost tracking
- Error handling

### Recommendation: Start with Path A (Simple)

**Why:**

1. **Non-invasive**: Matches existing behavior exactly
2. **Fast deployment**: 2-3 hours vs 1-2 weeks
3. **Low risk**: No new dependencies (OpenCode runtime, plugins)
4. **Easy rollback**: Just unset OPENCODE_SIDECAR_URL
5. **Validates pattern**: Proves sidecar architecture before complex integration

**Migration to Path B later:**

- Replace Anthropic SDK calls with OpenCode SDK calls
- Add oh-my-opencode plugin loading
- Gain multi-agent orchestration
- Zero changes to Nubabel code

---

## 2. Key Findings from Research

### From Nubabel Orchestrator Analysis

#### Exact Interface Contract

```typescript
// Request
interface DelegateTaskParams {
  category:
    | "visual-engineering"
    | "ultrabrain"
    | "artistry"
    | "quick"
    | "writing"
    | "unspecified-low"
    | "unspecified-high";
  load_skills: ("playwright" | "git-master" | "frontend-ui-ux" | "mcp-integration")[];
  prompt: string;
  session_id: string;
  organizationId?: string;
  userId?: string;
  context?: {
    availableMCPs?: MCPConnection[];
    [key: string]: any;
  };
}

// Response
interface DelegateTaskResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    error?: string;
  };
}
```

#### Model Selection Logic

| Category           | Model                      | Token Cost (per 1K)    |
| ------------------ | -------------------------- | ---------------------- |
| quick              | claude-3-5-haiku-20241022  | $0.001 in / $0.005 out |
| writing            | claude-3-5-haiku-20241022  | $0.001 in / $0.005 out |
| unspecified-low    | claude-3-5-haiku-20241022  | $0.001 in / $0.005 out |
| artistry           | claude-3-5-sonnet-20241022 | $0.003 in / $0.015 out |
| visual-engineering | claude-3-5-sonnet-20241022 | $0.003 in / $0.015 out |
| unspecified-high   | claude-3-5-sonnet-20241022 | $0.003 in / $0.015 out |
| ultrabrain         | claude-3-5-sonnet-20241022 | $0.003 in / $0.015 out |

#### Skill System Prompts

Each skill adds specific instructions:

- **mcp-integration**: "You are an AI assistant specialized in integrating with external tools..."
- **playwright**: "You are an expert in browser automation using Playwright..."
- **git-master**: "You are a Git expert who helps with version control operations..."
- **frontend-ui-ux**: "You are a senior frontend developer with strong design sensibilities..."

Source: `src/orchestrator/ai-executor.ts` lines 45-84

#### Error Handling Requirements

**Circuit Breaker**:

- 5 failures → OPEN (503 responses)
- 2 successes in HALF_OPEN → CLOSED
- 60s reset timeout

**Retry Logic** (client-side, Nubabel handles):

- Retry on: 429, 502, 503, 504
- Max 3 attempts
- Exponential backoff: 1s, 2s, 4s (capped at 5s)

**Timeout**:

- Client sets: 120,000ms (120s)
- Circuit breaker enforces: 30,000ms (30s)
- **Effective timeout**: 30s

---

### From OpenCode SDK Research

#### Key Learnings

1. **Client-only mode exists**: `createOpencodeClient({ baseUrl: "..." })`
2. **No server spawning needed**: Connect to existing OpenCode instance
3. **Event streaming**: `client.event.subscribe()` for real-time updates
4. **Response styles**: `responseStyle: "data"` unwraps responses, `throwOnError: true` for cleaner error handling

#### Production Patterns

**Connection Pooling**:

```typescript
import { setGlobalDispatcher, Agent } from "undici";
setGlobalDispatcher(new Agent({ connections: 500 }));
```

**Retry Logic for Session Creation**:

```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  const sessionRes = await client.session.create({ body: { title: "Task" } });
  if (sessionRes.error) {
    await sleep(1000 * attempt);
    continue;
  }
  return sessionRes.data.id;
}
```

**Event Processing State Machine**:

```typescript
for await (const event of events.stream) {
  switch (event.type) {
    case "message.part.created": // New response part
    case "message.part.updated": // Streaming update
    case "message.completed": // Done
  }
}
```

---

### From HTTP Bridge Examples

#### Express Server Patterns

**Basic Structure**:

```typescript
import express from "express";
import { anthropic } from "@anthropic-ai/sdk";

const app = express();
app.use(express.json());

app.post("/delegate", async (req, res) => {
  // Validate request
  // Call Anthropic SDK
  // Return response
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});
```

**Security Middleware**:

```typescript
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
```

**Error Handling**:

```typescript
// Async wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
```

**Docker Multi-stage Build**:

```dockerfile
FROM node:20-alpine AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
USER nobody
CMD ["node", "dist/index.js"]
```

---

## 3. Implementation Plan: Path A (Simple)

### Phase 1: Core Functionality (1 hour)

**Files to create**:

```
opencode-sidecar/
├── src/
│   ├── index.ts           # Express server
│   ├── delegate.ts        # Main delegation logic
│   ├── validator.ts       # Request validation
│   └── constants.ts       # Category/skill mappings
├── package.json
├── tsconfig.json
└── .env.example
```

**Key functions**:

1. `validateRequest()` - Validate category, skills, prompt, session_id
2. `selectModel()` - Category → Model mapping (replicate CATEGORY_MODEL_MAP)
3. `buildSystemPrompt()` - Skill → System prompt (replicate SKILL_SYSTEM_PROMPTS)
4. `executeWithAnthropic()` - Call Anthropic SDK (replicate executeWithAI)
5. `calculateCost()` - Token counting (replicate calculateCost)

### Phase 2: Error Handling (30 minutes)

1. Input validation (400 errors)
2. Timeout handling (30s max)
3. Anthropic API errors (500 errors)
4. Graceful shutdown

### Phase 3: Health Check (15 minutes)

```typescript
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
    },
  });
});
```

### Phase 4: Docker & Documentation (30 minutes)

1. Dockerfile (multi-stage build)
2. docker-compose.yml
3. README.md with setup instructions
4. Update `.env.example` in Nubabel

**Total Effort**: ~2-3 hours

---

## 4. Future Path B: OpenCode SDK Integration

**When to migrate**:

- Need multi-agent orchestration (oh-my-opencode features)
- Want background task management
- Need advanced agent capabilities (memory, tool use, etc.)

**Migration path**:

1. Replace `executeWithAnthropic()` with `client.session.prompt()`
2. Add OpenCode server spawning/connection logic
3. Load oh-my-opencode plugin
4. Add event streaming for real-time updates
5. Zero changes to Nubabel API (same HTTP interface)

**Estimated effort**: 1-2 weeks

---

## 5. API Design Summary

### Endpoints

| Endpoint    | Method | Purpose                  |
| ----------- | ------ | ------------------------ |
| `/delegate` | POST   | Main delegation endpoint |
| `/health`   | GET    | Health check             |

### Request Format (POST /delegate)

```typescript
{
  "category": "ultrabrain",
  "load_skills": ["git-master"],
  "prompt": "Implement authentication",
  "session_id": "ses_1234567890_abc123",
  "context": {
    "organizationId": "org_123",
    "userId": "user_456"
  }
}
```

### Response Format

**Success (200)**:

```typescript
{
  "output": "Here's an authentication implementation...",
  "status": "success",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 3456,
    "inputTokens": 1234,
    "outputTokens": 567,
    "cost": 0.0089
  }
}
```

**Error (400/500)**:

```typescript
{
  "output": "Invalid category: must be one of ...",
  "status": "failed",
  "metadata": {
    "model": "unknown",
    "duration": 12,
    "error": "VALIDATION_ERROR"
  }
}
```

---

## 6. Decision Matrix

| Criteria                 | Path A (Simple)            | Path B (OpenCode SDK)       |
| ------------------------ | -------------------------- | --------------------------- |
| **Time to deploy**       | 2-3 hours ✅               | 1-2 weeks ❌                |
| **Code complexity**      | Low ✅                     | High ❌                     |
| **Dependencies**         | Minimal (Anthropic SDK) ✅ | Heavy (OpenCode runtime) ⚠️ |
| **Behavior match**       | Exact ✅                   | Superset ⚠️                 |
| **Risk**                 | Low ✅                     | Medium ⚠️                   |
| **Future extensibility** | Limited ⚠️                 | High ✅                     |
| **Multi-agent features** | No ❌                      | Yes ✅                      |

---

## 7. Recommendation

### ✅ Start with Path A (Simple HTTP Wrapper)

**Rationale**:

1. **Fast validation**: Prove sidecar pattern works in 2-3 hours
2. **Low risk**: Exact behavior match, easy rollback
3. **Meets requirements**: User wants to implement sidecar, not add new features
4. **Enables learning**: Validate deployment, monitoring, scaling before complex integration
5. **Easy upgrade path**: Can migrate to Path B later without changing Nubabel

### 📋 Plan for Path B (Future)

**Trigger conditions**:

- User explicitly requests oh-my-opencode features
- Need multi-agent orchestration
- Need advanced agent capabilities (memory, background tasks, etc.)

**Migration approach**:

- Keep HTTP interface identical
- Swap implementation (Anthropic SDK → OpenCode SDK)
- Add event streaming for real-time updates
- Zero breaking changes to Nubabel

---

## 8. Next Steps

1. ✅ Create `opencode-sidecar/` directory structure
2. ✅ Implement core functionality (delegate.ts, validator.ts)
3. ✅ Add Express server (index.ts)
4. ✅ Write tests (validate behavior matches ai-executor.ts)
5. ✅ Create Dockerfile & docker-compose.yml
6. ✅ Test locally (verify integration with Nubabel)
7. ✅ Document deployment (README.md)
8. ✅ Deploy to Railway (separate service)
9. ✅ Monitor metrics (latency, error rate, cost)
10. 📋 Plan Path B migration (when needed)

---

**Status**: Research Complete ✅  
**Decision**: Path A (Simple HTTP Wrapper)  
**Ready to implement**: YES  
**Estimated time**: 2-3 hours
