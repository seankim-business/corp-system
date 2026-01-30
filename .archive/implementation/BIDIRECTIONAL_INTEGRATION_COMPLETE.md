# Bidirectional Nubabel ↔ OpenCode Integration - COMPLETE ✅

**Date**: 2026-01-27  
**Status**: ✅ Implementation Complete (Testing Pending)  
**Version**: 1.0.0

---

## 📋 Executive Summary

Successfully implemented **full bidirectional integration** between Nubabel and OpenCode Sidecar, enabling:

- ✅ **Callback Infrastructure**: Nubabel receives real-time updates from sidecar
- ✅ **OpenCode SDK Integration**: Sidecar uses OpenCode SDK + OhMyOpenCode plugin
- ✅ **Session Continuity**: Multi-turn conversations with session mapping
- ✅ **Real-time Streaming**: SSE + Redis pub/sub for progress updates
- ✅ **MCP Tool Integration**: Sidecar can invoke Nubabel's MCP tools with org credentials

---

## 🎯 Implementation Status

### Phase 1: Callback Infrastructure ✅ COMPLETE

| Task                      | Status      | Files Created/Modified          |
| ------------------------- | ----------- | ------------------------------- |
| Callback endpoints        | ✅ Complete | `src/api/sidecar-callbacks.ts`  |
| Sidecar types update      | ✅ Complete | `opencode-sidecar/src/types.ts` |
| Main app registration     | ✅ Complete | `src/index.ts`                  |
| OpenCode SDK dependencies | ✅ Complete | `opencode-sidecar/package.json` |

**Endpoints Created**:

- `POST /api/sidecar/sessions/:sessionId/update` - Session state updates
- `POST /api/sidecar/mcp/invoke` - MCP tool execution callback
- `POST /api/sidecar/sessions/:sessionId/progress` - Progress updates
- `GET /api/sidecar/sessions/:sessionId/stream` - SSE streaming

### Phase 2: OpenCode SDK Integration ✅ COMPLETE

| Task                     | Status      | Files Created/Modified                                      |
| ------------------------ | ----------- | ----------------------------------------------------------- |
| OpenCode client wrapper  | ✅ Complete | `opencode-sidecar/src/opencode-client.ts`                   |
| Nubabel Bridge plugin    | ✅ Complete | `opencode-sidecar/.opencode/plugins/nubabel-bridge.ts`      |
| OpenCode config          | ✅ Complete | `opencode-sidecar/.opencode/opencode.json`                  |
| Delegate endpoint update | ✅ Complete | `opencode-sidecar/src/index.ts`                             |
| TypeScript config        | ✅ Complete | `opencode-sidecar/tsconfig.json` (moduleResolution: node16) |

**Key Features**:

- OpenCode SDK with OhMyOpenCode plugin loaded
- Nubabel context stored in global map for plugin access
- Session creation with Nubabel metadata
- Custom `nubabel_mcp_invoke` tool using Zod schemas
- Event-driven callbacks (message.updated, tool execution)

### Phase 3: Session Continuity ✅ COMPLETE

| Task                      | Status      | Files Created/Modified                                      |
| ------------------------- | ----------- | ----------------------------------------------------------- |
| Session mapping utilities | ✅ Complete | `src/orchestrator/session-mapping.ts`                       |
| Delegate-task integration | ✅ Complete | `src/orchestrator/delegate-task.ts`                         |
| Multi-turn endpoint       | ✅ Complete | `opencode-sidecar/src/index.ts` (POST /sessions/:id/prompt) |

**Key Features**:

- Bidirectional session mapping (Nubabel ID ↔ OpenCode ID)
- Redis hot cache (24h TTL) + PostgreSQL cold storage
- First request creates both sessions
- Subsequent requests resume existing OpenCode session
- Automatic callback URL injection

### Phase 4: Real-time Streaming ✅ COMPLETE

| Task                  | Status      | Implementation                       |
| --------------------- | ----------- | ------------------------------------ |
| SSE endpoint          | ✅ Complete | Already in sidecar-callbacks.ts      |
| Progress callback     | ✅ Complete | EventEmitter + Redis pub/sub         |
| Redis pub/sub         | ✅ Complete | Cross-instance progress distribution |
| Slack Bot integration | ⏳ Pending  | Ready for testing                    |

**Key Features**:

- Server-Sent Events (SSE) for real-time updates
- Redis pub/sub for cross-instance synchronization
- EventEmitter for local process events
- Automatic connection cleanup on close

---

## 📁 File Structure

### Nubabel Core

```
src/
├── api/
│   └── sidecar-callbacks.ts          ✅ NEW - Callback endpoints
├── orchestrator/
│   ├── delegate-task.ts              ✅ UPDATED - Session continuity
│   └── session-mapping.ts            ✅ NEW - Session mapping utilities
└── index.ts                          ✅ UPDATED - Registered callbacks
```

### OpenCode Sidecar

```
opencode-sidecar/
├── .opencode/
│   ├── plugins/
│   │   └── nubabel-bridge.ts         ✅ NEW - Custom plugin
│   └── opencode.json                 ✅ NEW - OpenCode config
├── src/
│   ├── index.ts                      ✅ UPDATED - OpenCode SDK integration
│   ├── opencode-client.ts            ✅ NEW - SDK wrapper
│   └── types.ts                      ✅ UPDATED - Added callbacks field
├── package.json                      ✅ UPDATED - OpenCode dependencies
└── tsconfig.json                     ✅ UPDATED - moduleResolution: node16
```

---

## 🔧 Configuration

### Environment Variables

**Nubabel** (`.env`):

```bash
# Existing variables...
NUBABEL_URL=http://localhost:3000  # For callback URLs
```

**Sidecar** (`opencode-sidecar/.env`):

```bash
PORT=3001
NODE_ENV=development
ANTHROPIC_API_KEY=sk-ant-...

# OpenCode Integration
USE_OPENCODE=true                     # Enable OpenCode SDK
NUBABEL_CALLBACK_URL=http://localhost:3000  # Nubabel callback base URL
```

### OpenCode Configuration

**File**: `opencode-sidecar/.opencode/opencode.json`

```json
{
  "plugin": ["nubabel-bridge"],
  "model": "anthropic/claude-sonnet-4-5"
}
```

---

## 🔄 Data Flow

### 1. First Request (New Session)

```
User Request (Slack)
  ↓
Nubabel Orchestrator
  ↓
delegate-task.ts (checks session mapping → none found)
  ↓
POST /delegate → Sidecar
  {
    category, skills, prompt, session_id,
    callbacks: {
      sessionUpdate: "http://nubabel/api/sidecar/sessions/ses_123/update",
      mcpInvoke: "http://nubabel/api/sidecar/mcp/invoke",
      progress: "http://nubabel/api/sidecar/sessions/ses_123/progress"
    }
  }
  ↓
Sidecar: createOpencodeSession()
  - Creates OpenCode session
  - Stores Nubabel context in global map
  - Returns opencodeSessionId: "oc_abc"
  ↓
delegate-task.ts: createSessionMapping("ses_123", "oc_abc")
  - Redis: session:mapping:ses_123 → oc_abc
  - Redis: session:mapping:oc_abc → ses_123
  - PostgreSQL: session.state.opencodeSessionId = "oc_abc"
```

### 2. Subsequent Requests (Session Resume)

```
User Follow-up (Slack)
  ↓
Nubabel Orchestrator (same session_id: "ses_123")
  ↓
delegate-task.ts (checks session mapping → found: "oc_abc")
  ↓
POST /sessions/oc_abc/prompt → Sidecar
  { prompt: "Follow-up question" }
  ↓
Sidecar: sendPromptToSession("oc_abc", prompt)
  - Resumes existing OpenCode session
  - Full conversation context preserved
```

### 3. Callbacks During Execution

```
OpenCode Session Running
  ↓
Nubabel Bridge Plugin (event listener)
  ↓
message.updated event → POST /api/sidecar/sessions/ses_123/progress
  ↓
Nubabel: progressEmitter.emit() + Redis pub/sub
  ↓
SSE clients receive real-time updates
```

### 4. MCP Tool Invocation

```
OpenCode Agent needs MCP tool
  ↓
Calls: nubabel_mcp_invoke({ provider: "notion", toolName: "getTasks", args: {} })
  ↓
Nubabel Bridge Plugin → POST /api/sidecar/mcp/invoke
  {
    organizationId: "org_123",
    provider: "notion",
    toolName: "getTasks",
    args: {}
  }
  ↓
Nubabel: getMCPConnectionsByProvider() → finds org's Notion connection
  ↓
Nubabel: executeNotionTool() with org's encrypted credentials
  ↓
Returns result to OpenCode Agent
```

---

## 🧪 Testing Guide

### Manual Testing

#### 1. Start Services

```bash
# Terminal 1: Nubabel
npm run dev

# Terminal 2: Sidecar
cd opencode-sidecar
USE_OPENCODE=true npm run dev
```

#### 2. Test Callback Endpoints

```bash
# Health check
curl http://localhost:3001/health

# Expected: { "status": "healthy", "opencode": { "enabled": true } }
```

#### 3. Test Session Creation

```bash
# Create session via Slack Bot
# @nubabel-bot Summarize my Notion tasks

# Check logs:
# - Nubabel: "Creating new OpenCode session"
# - Sidecar: "OpenCode client initialized"
# - Sidecar: "OpenCode session created"
# - Nubabel: "Session mapping created"
```

#### 4. Test Session Resume

```bash
# Follow-up in same thread
# @nubabel-bot How many tasks are urgent?

# Check logs:
# - Nubabel: "Resuming existing OpenCode session"
# - Sidecar: "Sending prompt to existing session"
```

#### 5. Test SSE Streaming

```bash
# Open SSE connection
curl -N http://localhost:3000/api/sidecar/sessions/ses_123/stream

# Expected: Real-time events as sidecar processes request
```

### Integration Tests (TODO)

**File**: `src/__tests__/integration/bidirectional-integration.test.ts`

```typescript
describe("Bidirectional Integration", () => {
  it("should create session mapping on first request", async () => {
    // Test session creation + mapping
  });

  it("should resume session on subsequent requests", async () => {
    // Test session continuity
  });

  it("should invoke MCP tools with org credentials", async () => {
    // Test callback to Nubabel
  });

  it("should stream progress updates via SSE", async () => {
    // Test real-time streaming
  });
});
```

---

## 🚨 Known Issues & Limitations

### Current Limitations

1. **OpenCode Session Polling**: `waitForSessionCompletion()` uses simple polling (1s interval)
   - **Impact**: Potential delays in response
   - **Future**: Use OpenCode event subscriptions

2. **Global Context Storage**: Nubabel context stored in `global` map
   - **Impact**: Not ideal for multi-instance deployments
   - **Future**: Use Redis for cross-instance context sharing

3. **Plugin Event Limitations**: Not all OpenCode events are captured
   - **Current**: Only `message.updated` event
   - **Future**: Add `tool.execute.before/after`, `session.idle`, etc.

4. **No Automatic Cleanup**: Old session mappings not automatically cleaned
   - **Current**: Redis TTL = 24h
   - **Future**: Add cleanup job for expired sessions

### Testing Status

| Test Type         | Status     | Priority |
| ----------------- | ---------- | -------- |
| Manual testing    | ⏳ Pending | High     |
| Integration tests | ⏳ Pending | High     |
| E2E testing       | ⏳ Pending | Medium   |
| Load testing      | ⏳ Pending | Low      |

---

## 📊 Performance Considerations

### Expected Performance

| Metric                    | Target | Current         |
| ------------------------- | ------ | --------------- |
| First request latency     | <5s    | Testing pending |
| Follow-up request latency | <3s    | Testing pending |
| Session mapping lookup    | <10ms  | Redis cache     |
| Callback latency          | <100ms | Direct HTTP     |
| SSE connection overhead   | <50ms  | EventEmitter    |

### Scaling Considerations

1. **Redis Session Mappings**: 24h TTL, ~100 bytes per mapping
   - 1M active sessions = ~100MB Redis memory
2. **Global Context Storage**: In-memory per instance
   - Recommend: Move to Redis for multi-instance deployments

3. **SSE Connections**: One per active client
   - Recommend: Use Redis pub/sub for horizontal scaling

---

## 🔒 Security

### Implemented Safeguards

1. **MCP Credential Isolation**:
   - Credentials never leave Nubabel
   - Sidecar calls back to Nubabel for tool execution
   - Organization ID validation on callback

2. **Callback URL Validation**:
   - Callbacks use `NUBABEL_CALLBACK_URL` from env
   - No user-provided callback URLs

3. **Session Mapping Security**:
   - Session IDs are UUIDs (not guessable)
   - Organization isolation enforced

### Security Recommendations

1. **Add Callback Authentication**:

   ```typescript
   // Add HMAC signature to callbacks
   const signature = hmac(secret, body);
   headers["X-Nubabel-Signature"] = signature;
   ```

2. **Rate Limiting**:

   ```typescript
   // Add rate limiting to callback endpoints
   app.use("/api/sidecar", rateLimit({ max: 100, windowMs: 60000 }));
   ```

3. **Callback Timeout**:
   ```typescript
   // Add timeout to callback fetch
   fetch(url, { timeout: 5000 });
   ```

---

## 🚀 Deployment

### Prerequisites

1. **Nubabel**:
   - PostgreSQL with `Session` table
   - Redis for session mapping cache
   - Environment variable: `NUBABEL_URL`

2. **Sidecar**:
   - OpenCode SDK dependencies installed
   - Environment variables: `USE_OPENCODE=true`, `NUBABEL_CALLBACK_URL`
   - Port 3001 accessible from Nubabel

### Deployment Steps

#### 1. Build Sidecar

```bash
cd opencode-sidecar
npm install
npm run build
```

#### 2. Deploy Sidecar

```bash
# Railway / Fly.io / VPS
USE_OPENCODE=true \
NUBABEL_CALLBACK_URL=https://nubabel.com \
ANTHROPIC_API_KEY=sk-ant-... \
node dist/index.js
```

#### 3. Update Nubabel Environment

```bash
# Add to Nubabel's .env
OPENCODE_SIDECAR_URL=https://sidecar.nubabel.com
NUBABEL_URL=https://nubabel.com
```

#### 4. Verify Health

```bash
curl https://sidecar.nubabel.com/health
# Expected: { "status": "healthy", "opencode": { "enabled": true } }

curl https://nubabel.com/health
# Expected: { "status": "healthy", ... }
```

---

## 📚 API Reference

### Nubabel Callback Endpoints

#### POST /api/sidecar/sessions/:sessionId/update

Update session state from sidecar.

**Request**:

```json
{
  "state": {
    "opencodeSessionId": "oc_abc123",
    "status": "completed"
  },
  "metadata": {
    "completedAt": "2026-01-27T10:00:00Z"
  }
}
```

**Response**:

```json
{ "success": true }
```

#### POST /api/sidecar/mcp/invoke

Execute MCP tool with organization credentials.

**Request**:

```json
{
  "organizationId": "org_123",
  "provider": "notion",
  "toolName": "getTasks",
  "args": { "status": "active" }
}
```

**Response**:

```json
{
  "result": [{ "id": "task_1", "title": "Task 1", "status": "active" }]
}
```

#### POST /api/sidecar/sessions/:sessionId/progress

Receive progress updates from sidecar.

**Request**:

```json
{
  "progress": {
    "type": "message_updated",
    "data": { "text": "Processing..." },
    "timestamp": "2026-01-27T10:00:00Z"
  }
}
```

**Response**:

```json
{ "success": true }
```

#### GET /api/sidecar/sessions/:sessionId/stream

SSE stream for real-time progress.

**Response** (text/event-stream):

```
data: {"type":"connected","sessionId":"ses_123"}

data: {"type":"message_updated","data":{"text":"Processing..."},"timestamp":"2026-01-27T10:00:00Z"}

data: {"type":"message_updated","data":{"text":"Complete!"},"timestamp":"2026-01-27T10:00:05Z"}
```

### Sidecar Endpoints

#### POST /delegate

Create new OpenCode session and execute task.

**Request**:

```json
{
  "category": "ultrabrain",
  "load_skills": ["mcp-integration"],
  "prompt": "Summarize my Notion tasks",
  "session_id": "ses_123",
  "organizationId": "org_123",
  "userId": "user_456",
  "callbacks": {
    "sessionUpdate": "http://nubabel/api/sidecar/sessions/ses_123/update",
    "mcpInvoke": "http://nubabel/api/sidecar/mcp/invoke",
    "progress": "http://nubabel/api/sidecar/sessions/ses_123/progress"
  }
}
```

**Response**:

```json
{
  "output": "You have 5 active tasks...",
  "status": "success",
  "metadata": {
    "model": "claude-sonnet-4-5",
    "opencodeSessionId": "oc_abc123",
    "nubabelSessionId": "ses_123"
  }
}
```

#### POST /sessions/:opencodeSessionId/prompt

Resume existing session with new prompt.

**Request**:

```json
{
  "prompt": "How many are urgent?"
}
```

**Response**:

```json
{
  "output": "2 tasks are marked as urgent...",
  "status": "success",
  "metadata": {
    "model": "claude-sonnet-4-5",
    "opencodeSessionId": "oc_abc123"
  }
}
```

---

## 🎓 Next Steps

### Immediate (Week 1)

- [ ] Manual testing of all flows
- [ ] Fix any bugs discovered during testing
- [ ] Add callback authentication (HMAC)
- [ ] Write integration tests

### Short-term (Week 2-4)

- [ ] Improve OpenCode event handling
- [ ] Move global context to Redis
- [ ] Add session cleanup job
- [ ] Performance benchmarking

### Long-term (Month 2+)

- [ ] Horizontal scaling support
- [ ] Advanced monitoring/observability
- [ ] Circuit breaker improvements
- [ ] Auto-recovery mechanisms

---

## 📞 Support

For issues or questions:

- **Email**: engineering@nubabel.com
- **Docs**: See `BIDIRECTIONAL_INTEGRATION_PLAN.md` for design details
- **Logs**: Check Nubabel and Sidecar logs for debugging

---

**Implementation Complete**: 2026-01-27  
**Testing Status**: ⏳ Pending  
**Production Ready**: After testing ✅
