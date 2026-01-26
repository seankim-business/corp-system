# OpenCode Sidecar HTTP Bridge - API Specification

**Version**: 1.0.0  
**Date**: 2026-01-26  
**Status**: Design Complete

---

## Overview

The OpenCode Sidecar is an HTTP service that wraps OpenCode/OhMyOpenCode functionality and exposes it via a REST API. It replicates the behavior of Nubabel's built-in AI executor while delegating to OpenCode's agent system.

### Architecture

```
┌─────────────────┐         HTTP          ┌──────────────────────┐
│  Nubabel API    │◄─────────────────────►│  OpenCode Sidecar    │
│  (Express.js)   │   POST /delegate      │  (Express.js)        │
│                 │   GET  /health        │                      │
└─────────────────┘                       │  ┌────────────────┐  │
                                          │  │ OpenCode SDK   │  │
                                          │  │ + OhMyOpenCode │  │
                                          │  └────────────────┘  │
                                          └──────────────────────┘
```

---

## 1. Endpoints

### 1.1 POST /delegate

Delegate a task to the OpenCode orchestration system.

#### Request

**Headers**:

```
Content-Type: application/json
Authorization: Bearer <INTERNAL_SERVICE_TOKEN> (optional for v1.0)
X-Organization-ID: <organizationId> (optional)
X-User-ID: <userId> (optional)
```

**Body**:

```typescript
{
  // REQUIRED: Task category (determines model selection)
  "category": "ultrabrain" | "visual-engineering" | "artistry" | "quick" | "writing" | "unspecified-low" | "unspecified-high",

  // REQUIRED: Skills to load (can be empty array)
  "load_skills": ["playwright", "git-master", "frontend-ui-ux", "mcp-integration"],

  // REQUIRED: User's prompt/request
  "prompt": "Create a React component for user profile",

  // REQUIRED: Session ID for continuity
  "session_id": "ses_1234567890_abc123",

  // OPTIONAL: Additional context
  "context": {
    "organizationId": "org_123",
    "userId": "user_456",
    "availableMCPs": [
      {
        "provider": "notion",
        "name": "Notion",
        "enabled": true,
        "config": { /* ... */ }
      }
    ]
  }
}
```

**Validation Rules**:

| Field         | Type     | Required | Constraints                        |
| ------------- | -------- | -------- | ---------------------------------- |
| `category`    | string   | ✅ Yes   | Must be one of 7 valid categories  |
| `load_skills` | string[] | ✅ Yes   | Can be empty, max 4 skills         |
| `prompt`      | string   | ✅ Yes   | Non-empty, max 10,000 chars        |
| `session_id`  | string   | ✅ Yes   | Format: `ses_<timestamp>_<random>` |
| `context`     | object   | ❌ No    | Any valid JSON object              |

#### Response

**Success (200 OK)**:

````typescript
{
  "output": "Here's a React component for the user profile:\n\n```tsx\n...\n```",
  "status": "success",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 3456,              // milliseconds
    "inputTokens": 1234,
    "outputTokens": 567,
    "cost": 0.0089                 // USD
  }
}
````

**Error (400 Bad Request)**:

```typescript
{
  "output": "Invalid request: category must be one of ...",
  "status": "failed",
  "metadata": {
    "model": "unknown",
    "duration": 12,
    "error": "VALIDATION_ERROR"
  }
}
```

**Error (500 Internal Server Error)**:

```typescript
{
  "output": "OpenCode execution failed: Connection timeout",
  "status": "failed",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 30000,
    "error": "EXECUTION_ERROR"
  }
}
```

**Error (503 Service Unavailable)** - Circuit breaker open:

```typescript
{
  "output": "Service temporarily unavailable",
  "status": "failed",
  "metadata": {
    "model": "unknown",
    "duration": 0,
    "error": "SERVICE_UNAVAILABLE"
  }
}
```

---

### 1.2 GET /health

Health check endpoint for monitoring and orchestration.

#### Request

No body or parameters required.

#### Response

**Healthy (200 OK)**:

```typescript
{
  "status": "healthy",
  "opencode": {
    "ready": true,
    "version": "3.4.0"
  },
  "activeSessions": 3,
  "uptime": 3600,                  // seconds
  "timestamp": "2026-01-26T12:00:00Z"
}
```

**Degraded (200 OK)** - Partial functionality:

```typescript
{
  "status": "degraded",
  "opencode": {
    "ready": false,
    "error": "Plugin load failed"
  },
  "activeSessions": 0,
  "uptime": 120,
  "timestamp": "2026-01-26T12:00:00Z"
}
```

**Unhealthy (503 Service Unavailable)**:

```typescript
{
  "status": "unhealthy",
  "error": "OpenCode runtime not initialized"
}
```

---

## 2. Data Models

### 2.1 Category

Type: `string` (enum)

Valid values:

- `"visual-engineering"` - Frontend, UI/UX, design, styling
- `"ultrabrain"` - Complex architecture, deep analysis
- `"artistry"` - Creative content, branding
- `"quick"` - Simple tasks, typo fixes
- `"writing"` - Documentation, technical writing
- `"unspecified-low"` - Unclear tasks, low effort
- `"unspecified-high"` - Unclear tasks, high effort

**Model Mapping** (for replication of built-in AI behavior):

| Category             | Model                        |
| -------------------- | ---------------------------- |
| `quick`              | `claude-3-5-haiku-20241022`  |
| `writing`            | `claude-3-5-haiku-20241022`  |
| `unspecified-low`    | `claude-3-5-haiku-20241022`  |
| `artistry`           | `claude-3-5-sonnet-20241022` |
| `visual-engineering` | `claude-3-5-sonnet-20241022` |
| `unspecified-high`   | `claude-3-5-sonnet-20241022` |
| `ultrabrain`         | `claude-3-5-sonnet-20241022` |

### 2.2 Skill

Type: `string` (enum)

Valid values:

- `"playwright"` - Browser automation, web scraping
- `"git-master"` - Git operations, version control
- `"frontend-ui-ux"` - Frontend development, design
- `"mcp-integration"` - Multi-tool integration via MCP

**System Prompt Additions**:

Each skill adds specific instructions to the system prompt. For exact prompts, see `src/orchestrator/ai-executor.ts` lines 45-84.

### 2.3 DelegateTaskRequest

```typescript
interface DelegateTaskRequest {
  category: Category;
  load_skills: Skill[];
  prompt: string;
  session_id: string;
  organizationId?: string;
  userId?: string;
  context?: {
    availableMCPs?: MCPConnection[];
    [key: string]: any;
  };
}
```

### 2.4 DelegateTaskResponse

```typescript
interface DelegateTaskResponse {
  output: string; // AI-generated response text
  status: "success" | "failed";
  metadata: {
    model: string; // e.g., "claude-3-5-sonnet-20241022"
    duration?: number; // milliseconds
    inputTokens?: number; // token count
    outputTokens?: number; // token count
    cost?: number; // USD
    error?: string; // error code if failed
  };
}
```

---

## 3. Error Handling

### 3.1 Error Codes

| Code                   | HTTP Status | Description                | Retry?               |
| ---------------------- | ----------- | -------------------------- | -------------------- |
| `VALIDATION_ERROR`     | 400         | Invalid request parameters | ❌ No                |
| `AUTHENTICATION_ERROR` | 401         | Missing/invalid auth token | ❌ No                |
| `RATE_LIMIT_ERROR`     | 429         | Too many requests          | ✅ Yes (exp backoff) |
| `EXECUTION_ERROR`      | 500         | OpenCode execution failed  | ✅ Yes (max 3 times) |
| `TIMEOUT_ERROR`        | 500         | Request exceeded 120s      | ❌ No                |
| `SERVICE_UNAVAILABLE`  | 503         | Circuit breaker open       | ✅ Yes (after reset) |

### 3.2 Timeout Behavior

- **Client timeout**: 120,000ms (120 seconds) - set by Nubabel
- **Circuit breaker timeout**: 30,000ms (30 seconds) - enforced by circuit breaker
- **Effective timeout**: 30 seconds (circuit breaker wins)

**Implementation**: Sidecar should respect 120s timeout but aim to respond within 30s to avoid circuit breaker trips.

### 3.3 Retry Policy (Client-side)

Nubabel's circuit breaker implements automatic retries for certain status codes:

| Status                  | Retry? | Max Attempts | Backoff                  |
| ----------------------- | ------ | ------------ | ------------------------ |
| 200 OK                  | ❌ No  | -            | -                        |
| 400 Bad Request         | ❌ No  | -            | -                        |
| 429 Rate Limit          | ✅ Yes | 3            | Exponential (1s, 2s, 4s) |
| 500 Internal Error      | ❌ No  | -            | -                        |
| 502 Bad Gateway         | ✅ Yes | 3            | Exponential              |
| 503 Service Unavailable | ✅ Yes | 3            | Exponential              |
| 504 Gateway Timeout     | ✅ Yes | 3            | Exponential              |

**Implementation Note**: Sidecar should NOT implement retry logic internally. Let the client (Nubabel) handle retries.

---

## 4. Performance Requirements

### 4.1 Latency Targets

| Metric      | Target | Notes                 |
| ----------- | ------ | --------------------- |
| P50 latency | < 5s   | Median response time  |
| P95 latency | < 15s  | 95th percentile       |
| P99 latency | < 25s  | 99th percentile       |
| Max latency | 30s    | Circuit breaker limit |

### 4.2 Throughput

| Metric              | Target |
| ------------------- | ------ |
| Concurrent sessions | 100+   |
| Requests per minute | 60+    |
| Failed requests     | < 1%   |

### 4.3 Resource Usage

| Resource | Limit      | Notes                        |
| -------- | ---------- | ---------------------------- |
| Memory   | 500MB-2GB  | Depends on active sessions   |
| CPU      | 0.5-2 vCPU | Mostly I/O-bound (API calls) |
| Disk     | 1GB        | Logs, session storage        |

---

## 5. Security

### 5.1 Authentication (v1.0 - Optional)

Initial version supports optional internal service token:

```
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
```

**Future (v2.0)**:

- JWT-based authentication
- Per-organization API keys
- Rate limiting by organization

### 5.2 Input Sanitization

All inputs must be validated:

1. **Category**: Must be one of 7 valid enum values
2. **Skills**: Must be array of valid skill names (max 4)
3. **Prompt**: Max 10,000 characters, sanitize for XSS
4. **Session ID**: Must match pattern `ses_<timestamp>_<random>`
5. **Context**: Max 100KB JSON payload

### 5.3 Multi-Tenant Isolation

**v1.0**: Shared OpenCode instance with context tagging

- Each session tagged with `organizationId` in context
- MCP connections filtered per organization
- No cross-tenant data sharing

**Future (v2.0)**: Per-tenant OpenCode instances for enterprise tiers

---

## 6. Monitoring & Observability

### 6.1 Metrics to Track

| Metric                      | Type                | Purpose                 |
| --------------------------- | ------------------- | ----------------------- |
| `sidecar.requests.total`    | Counter             | Total requests          |
| `sidecar.requests.status`   | Counter (by status) | Success/failure rate    |
| `sidecar.requests.duration` | Histogram           | Latency distribution    |
| `sidecar.active_sessions`   | Gauge               | Current active sessions |
| `sidecar.opencode.ready`    | Gauge (0/1)         | OpenCode health         |

### 6.2 Logs

All requests should log:

```typescript
{
  timestamp: "2026-01-26T12:00:00Z",
  level: "info",
  message: "Task delegated",
  category: "ultrabrain",
  skills: ["git-master"],
  sessionId: "ses_1234567890_abc123",
  organizationId: "org_123",
  duration: 3456,
  model: "claude-3-5-sonnet-20241022",
  tokens: { input: 1234, output: 567 },
  cost: 0.0089,
  status: "success"
}
```

---

## 7. Example Flows

### 7.1 Successful Delegation

````bash
# Request
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "visual-engineering",
    "load_skills": ["frontend-ui-ux", "playwright"],
    "prompt": "Create a responsive navbar component",
    "session_id": "ses_1738000000_abc123",
    "context": {
      "organizationId": "org_123",
      "userId": "user_456"
    }
  }'

# Response (200 OK)
{
  "output": "Here's a responsive navbar component using React and Tailwind CSS:\n\n```tsx\n...\n```",
  "status": "success",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 4567,
    "inputTokens": 987,
    "outputTokens": 432,
    "cost": 0.0098
  }
}
````

### 7.2 Validation Error

```bash
# Request with invalid category
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "invalid-category",
    "load_skills": [],
    "prompt": "Do something",
    "session_id": "ses_1738000000_abc123"
  }'

# Response (400 Bad Request)
{
  "output": "Invalid category: must be one of visual-engineering, ultrabrain, artistry, quick, writing, unspecified-low, unspecified-high",
  "status": "failed",
  "metadata": {
    "model": "unknown",
    "duration": 3,
    "error": "VALIDATION_ERROR"
  }
}
```

### 7.3 Health Check

```bash
# Request
curl http://localhost:3001/health

# Response (200 OK)
{
  "status": "healthy",
  "opencode": {
    "ready": true,
    "version": "3.4.0"
  },
  "activeSessions": 5,
  "uptime": 7200,
  "timestamp": "2026-01-26T14:00:00Z"
}
```

---

## 8. Implementation Checklist

### Phase 1: Core Functionality

- [ ] Express.js server setup
- [ ] POST /delegate endpoint
- [ ] GET /health endpoint
- [ ] Request validation
- [ ] Response formatting
- [ ] Basic error handling

### Phase 2: OpenCode Integration

- [ ] OpenCode SDK initialization
- [ ] OhMyOpenCode plugin loading
- [ ] Session management
- [ ] Model selection logic
- [ ] Token counting & cost tracking

### Phase 3: Production Hardening

- [ ] Timeout handling (30s)
- [ ] Graceful shutdown
- [ ] Health check with OpenCode status
- [ ] Structured logging
- [ ] Metrics collection

### Phase 4: Testing

- [ ] Unit tests for validation
- [ ] Integration tests with OpenCode
- [ ] Load testing (100 concurrent)
- [ ] Error scenario testing
- [ ] Circuit breaker testing

---

## 9. Migration Path

### Current State (Nubabel)

```typescript
// src/orchestrator/delegate-task.ts
export async function delegateTask(params: DelegateTaskParams) {
  if (!OPENCODE_SIDECAR_URL) {
    return executeWithAI(params); // Built-in mode
  }

  // POST to sidecar
  const response = await fetch(`${OPENCODE_SIDECAR_URL}/delegate`, {
    method: "POST",
    body: JSON.stringify(params),
  });

  return await response.json();
}
```

### Future State (with Sidecar)

```typescript
// No code changes required!
// Just set OPENCODE_SIDECAR_URL=http://localhost:3001
```

**Deployment Strategy**:

1. Deploy sidecar service
2. Set `OPENCODE_SIDECAR_URL` env var
3. Test with `/health` endpoint
4. Gradually enable (10% → 50% → 100%)
5. Monitor error rates and latency
6. Fallback: unset `OPENCODE_SIDECAR_URL` to use built-in mode

---

## 10. API Versioning (Future)

### v1.0 (Current)

- Basic delegation
- Optional authentication
- Shared OpenCode instance

### v2.0 (Planned)

- JWT authentication required
- Per-organization rate limits
- Streaming responses (SSE)
- WebSocket support for real-time updates
- Per-tenant OpenCode instances

### v3.0 (Future)

- GraphQL API
- Background task management
- Progress reporting
- Multi-agent orchestration
- Task cancellation

---

**Document Status**: Implementation Ready  
**Next**: Create `opencode-sidecar/` directory structure  
**Contact**: Nubabel Engineering Team
