# Nubabel ↔ OpenCode Sidecar Bidirectional Integration Plan

**Date**: 2026-01-27  
**Status**: In Progress  
**Goal**: Full bidirectional integration with OhMyOpenCode for multi-agent orchestration

---

## Executive Summary

**Current State**: Sidecar exists but uses simple Anthropic SDK wrapper (Path A)  
**Target State**: Full OhMyOpenCode integration with bidirectional callbacks (Path B)  
**Timeline**: 8 weeks across 4 phases

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    NUBABEL CORE                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Orchestrator (delegate-task.ts)                    │     │
│  │ - HTTP POST to sidecar                            │     │
│  │ - Session mapping (Nubabel ↔ OpenCode)           │     │
│  │ - Circuit breaker + retry                         │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Callback Endpoints (NEW)                          │     │
│  │ - /sidecar/sessions/:id/update                    │     │
│  │ - /sidecar/mcp/invoke                             │     │
│  │ - /sidecar/sessions/:id/progress                  │     │
│  │ - /sidecar/sessions/:id/stream (SSE)              │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ MCP Registry                                      │     │
│  │ - Multi-tenant credentials (encrypted)            │     │
│  │ - OAuth token refresh                             │     │
│  │ - Tool execution with isolation                   │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                         ↕ HTTP + Callbacks
┌─────────────────────────────────────────────────────────────┐
│              OPENCODE SIDECAR (Separate Service)            │
│  ┌────────────────────────────────────────────────────┐     │
│  │ OpenCode SDK + OhMyOpenCode Plugin                │     │
│  │ - Sisyphus orchestrator                           │     │
│  │ - Background agents (Oracle, Librarian, Explore) │     │
│  │ - LSP tools (refactor, rename, diagnostics)       │     │
│  │ - Multi-agent orchestration                       │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Nubabel Bridge Plugin (NEW)                       │     │
│  │ - Event listener (session.idle, progress)         │     │
│  │ - Custom tool: nubabel_mcp_invoke                 │     │
│  │ - Callbacks to Nubabel                            │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Callback Infrastructure (Week 1-2)

### Goals

- Nubabel can receive callbacks from sidecar
- MCP tools execute with Nubabel credentials
- Session state synchronization works

### Tasks

#### 1.1 Create Callback Endpoints in Nubabel

**File**: `src/api/sidecar-callbacks.ts` (NEW)

```typescript
import { Router } from "express";
import { prisma } from "../db/client";
import { redis } from "../db/redis";
import { executeNotionTool } from "../mcp-servers/notion";
import { getMCPConnectionsByProvider } from "../services/mcp-registry";
import { getAccessTokenFromConfig } from "../services/mcp-registry";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";

export const sidecarCallbacksRouter = Router();
export const progressEmitter = new EventEmitter();

// Session state updates
sidecarCallbacksRouter.post("/sidecar/sessions/:sessionId/update", async (req, res) => {
  const { sessionId } = req.params;
  const { state, metadata } = req.body;

  try {
    // Update session in Redis (hot)
    await redis.hset(`session:${sessionId}`, "state", JSON.stringify(state));

    // Update session in PostgreSQL (cold)
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        state,
        metadata,
        updatedAt: new Date(),
      },
    });

    logger.info("Session state updated via sidecar callback", { sessionId, state });
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to update session state", { sessionId, error });
    res.status(500).json({ error: "Failed to update session state" });
  }
});

// MCP tool execution callback
sidecarCallbacksRouter.post("/sidecar/mcp/invoke", async (req, res) => {
  const { organizationId, provider, toolName, args } = req.body;

  try {
    // Get MCP connection for organization
    const connections = await getMCPConnectionsByProvider(organizationId, provider);

    if (connections.length === 0) {
      return res.status(404).json({ error: `No ${provider} connection found for organization` });
    }

    const connection = connections[0];

    // Execute MCP tool with Nubabel's credentials
    let result;
    switch (provider) {
      case "notion":
        result = await executeNotionTool(
          getAccessTokenFromConfig(connection.config),
          toolName,
          args,
          organizationId,
          connection,
        );
        break;
      // Add other providers as needed
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    logger.info("MCP tool executed via sidecar callback", {
      organizationId,
      provider,
      toolName,
    });

    res.json({ result });
  } catch (error) {
    logger.error("Failed to execute MCP tool", {
      organizationId,
      provider,
      toolName,
      error,
    });
    res.status(500).json({ error: "Failed to execute MCP tool" });
  }
});

// Progress updates (for real-time streaming)
sidecarCallbacksRouter.post("/sidecar/sessions/:sessionId/progress", async (req, res) => {
  const { sessionId } = req.params;
  const { progress } = req.body;

  try {
    // Publish to Redis pub/sub for cross-instance updates
    await redis.publish(`session:${sessionId}:progress`, JSON.stringify(progress));

    // Emit to local SSE listeners
    progressEmitter.emit(`session:${sessionId}:progress`, progress);

    logger.debug("Progress update received", { sessionId, progress });
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to handle progress update", { sessionId, error });
    res.status(500).json({ error: "Failed to handle progress update" });
  }
});

// SSE endpoint for real-time progress streaming
sidecarCallbacksRouter.get("/sidecar/sessions/:sessionId/stream", (req, res) => {
  const { sessionId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

  const listener = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  progressEmitter.on(`session:${sessionId}:progress`, listener);

  req.on("close", () => {
    progressEmitter.off(`session:${sessionId}:progress`, listener);
    logger.debug("SSE connection closed", { sessionId });
  });
});
```

**Register in main app** (`src/index.ts`):

```typescript
import { sidecarCallbacksRouter } from "./api/sidecar-callbacks";

app.use("/api", sidecarCallbacksRouter);
```

#### 1.2 Update Sidecar to Pass Callback URLs

**File**: `opencode-sidecar/src/types.ts` (UPDATE)

Add callback URLs to request type:

```typescript
export interface DelegateTaskRequest {
  category: Category;
  load_skills: Skill[];
  prompt: string;
  session_id: string;
  organizationId?: string;
  userId?: string;
  context?: Record<string, unknown>;
  callbacks?: {
    // NEW
    sessionUpdate: string;
    mcpInvoke: string;
    progress: string;
  };
}
```

**File**: `opencode-sidecar/src/delegate.ts` (UPDATE)

Store callbacks for later use:

```typescript
export async function delegateTask(request: DelegateTaskRequest): Promise<DelegateTaskResponse> {
  const startTime = Date.now();

  // Store callbacks globally for plugin access (simple approach for now)
  if (request.callbacks) {
    global.nubabelCallbacks = global.nubabelCallbacks || new Map();
    global.nubabelCallbacks.set(request.session_id, request.callbacks);
  }

  // ... rest of implementation
}
```

#### 1.3 Environment Variables

**Nubabel** (`.env`):

```bash
# No new vars needed - callbacks use existing NUBABEL_URL or detect from request
```

**Sidecar** (`opencode-sidecar/.env`):

```bash
NUBABEL_CALLBACK_URL=http://localhost:3000  # or production URL
```

### Acceptance Criteria

- ✅ Callback endpoints respond to POST requests
- ✅ MCP tools execute with correct credentials
- ✅ Session state updates persist to Redis + PostgreSQL
- ✅ SSE endpoint streams progress events

---

## Phase 2: OhMyOpenCode Integration (Week 3-4)

### Goals

- Sidecar uses OpenCode SDK instead of Anthropic SDK
- OhMyOpenCode plugin loaded and functional
- Background agents (Oracle, Librarian, Explore) working
- LSP tools available

### Tasks

#### 2.1 Add OpenCode SDK Dependencies

**File**: `opencode-sidecar/package.json` (UPDATE)

```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^1.0.150",
    "@opencode-ai/plugin": "^1.0.0",
    "oh-my-opencode": "^3.1.0"
  }
}
```

Run:

```bash
cd opencode-sidecar
npm install
```

#### 2.2 Create OpenCode Client Wrapper

**File**: `opencode-sidecar/src/opencode-client.ts` (NEW)

```typescript
import { createOpencode } from "@opencode-ai/sdk";
import type { DelegateTaskRequest } from "./types";
import { logger } from "./logger";

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;

export async function getOpencodeClient() {
  if (!opencodeInstance) {
    logger.info("Initializing OpenCode client with OhMyOpenCode plugin");

    opencodeInstance = await createOpencode({
      port: 0, // Random port
      config: {
        plugin: ["oh-my-opencode"],
        model: "anthropic/claude-sonnet-4-5",
      },
    });

    logger.info("OpenCode client initialized", {
      url: opencodeInstance.url,
    });
  }

  return opencodeInstance;
}

export async function createOpencodeSession(request: DelegateTaskRequest) {
  const client = await getOpencodeClient();

  logger.info("Creating OpenCode session", {
    sessionId: request.session_id,
    category: request.category,
    skills: request.load_skills,
  });

  // Create session with Nubabel context
  const session = await client.client.session.create({
    body: {
      title: `Nubabel task ${request.session_id}`,
      agent: "sisyphus", // OhMyOpenCode's main orchestrator
      context: {
        nubabel: {
          sessionId: request.session_id,
          organizationId: request.organizationId,
          userId: request.userId,
          category: request.category,
          skills: request.load_skills,
          callbacks: request.callbacks,
        },
      },
    },
  });

  logger.info("OpenCode session created", {
    opencodeSessionId: session.data.id,
    nubabelSessionId: request.session_id,
  });

  return session.data.id;
}

export async function sendPromptToSession(opencodeSessionId: string, prompt: string) {
  const client = await getOpencodeClient();

  logger.info("Sending prompt to OpenCode session", {
    opencodeSessionId,
    promptLength: prompt.length,
  });

  await client.client.session.prompt({
    path: { id: opencodeSessionId },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
  });
}

export async function getSessionMessages(opencodeSessionId: string) {
  const client = await getOpencodeClient();

  const session = await client.client.session.get({
    path: { id: opencodeSessionId },
  });

  return session.data.messages;
}

export async function waitForSessionCompletion(
  opencodeSessionId: string,
  timeoutMs: number = 120000,
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const messages = await getSessionMessages(opencodeSessionId);

    // Check if session has completed (last message is from assistant)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      // Extract text content
      const textParts = lastMessage.content.filter((c: any) => c.type === "text");
      return textParts.map((p: any) => p.text).join("\n");
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Session completion timeout after ${timeoutMs}ms`);
}
```

#### 2.3 Create Nubabel Bridge Plugin

**File**: `opencode-sidecar/.opencode/plugins/nubabel-bridge.ts` (NEW)

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export default (async (ctx) => {
  console.log("[nubabel-bridge] Plugin loaded");

  return {
    // Listen to all OpenCode events
    event: async ({ event }) => {
      const nubabelContext = (ctx as any).sessionState?.context?.nubabel;
      if (!nubabelContext || !nubabelContext.callbacks) {
        return; // Not a Nubabel session
      }

      console.log("[nubabel-bridge] Event received", {
        type: event.type,
        sessionId: nubabelContext.sessionId,
      });

      try {
        // Session completion callback
        if (event.type === "session.idle") {
          console.log("[nubabel-bridge] Session idle, calling completion callback");

          await fetch(nubabelContext.callbacks.sessionUpdate, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: "completed",
              metadata: {
                opencodeSessionId: (ctx as any).sessionID,
                completedAt: new Date().toISOString(),
              },
            }),
          });
        }

        // Progress updates
        if (event.type === "message.part.updated") {
          await fetch(nubabelContext.callbacks.progress, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              progress: {
                type: "message_part",
                data: event.properties.part,
                timestamp: new Date().toISOString(),
              },
            }),
          });
        }

        // Tool execution events
        if (event.type === "tool.execute.before") {
          await fetch(nubabelContext.callbacks.progress, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              progress: {
                type: "tool_execute_start",
                tool: event.properties.tool,
                timestamp: new Date().toISOString(),
              },
            }),
          });
        }

        if (event.type === "tool.execute.after") {
          await fetch(nubabelContext.callbacks.progress, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              progress: {
                type: "tool_execute_end",
                tool: event.properties.tool,
                output: event.properties.output,
                timestamp: new Date().toISOString(),
              },
            }),
          });
        }
      } catch (error) {
        console.error("[nubabel-bridge] Callback failed", { error });
      }
    },

    // Custom tool for MCP invocation
    tool: {
      nubabel_mcp_invoke: {
        description: "Invoke Nubabel MCP tool with organization credentials",
        args: {
          provider: {
            type: "string",
            description: "MCP provider (notion, linear, github, etc.)",
          },
          toolName: {
            type: "string",
            description: "Tool name (e.g., 'getTasks', 'createIssue')",
          },
          args: {
            type: "object",
            description: "Tool arguments",
          },
        },
        async execute(args) {
          const nubabelContext = (ctx as any).sessionState?.context?.nubabel;
          if (!nubabelContext || !nubabelContext.callbacks) {
            throw new Error("Nubabel context not available");
          }

          console.log("[nubabel-bridge] Invoking MCP tool", {
            provider: args.provider,
            toolName: args.toolName,
            organizationId: nubabelContext.organizationId,
          });

          const response = await fetch(nubabelContext.callbacks.mcpInvoke, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: nubabelContext.organizationId,
              provider: args.provider,
              toolName: args.toolName,
              args: args.args,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MCP invocation failed: ${response.statusText} - ${errorText}`);
          }

          const result = await response.json();
          return result.result;
        },
      },
    },
  };
}) satisfies Plugin;
```

**File**: `opencode-sidecar/.opencode/opencode.json` (NEW)

```json
{
  "plugin": ["nubabel-bridge"],
  "model": "anthropic/claude-sonnet-4-5"
}
```

#### 2.4 Update Delegate Endpoint to Use OpenCode

**File**: `opencode-sidecar/src/index.ts` (UPDATE)

```typescript
import {
  createOpencodeSession,
  sendPromptToSession,
  waitForSessionCompletion,
} from "./opencode-client";

app.post("/delegate", async (req, res) => {
  const validationResult = validateRequest(req.body);

  if (!validationResult.valid) {
    // ... validation error handling (same as before)
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Request timeout"));
    }, TIMEOUTS.DEFAULT_REQUEST_TIMEOUT);
  });

  try {
    const request = validationResult.data;

    // Add callbacks if not provided
    if (!request.callbacks && process.env.NUBABEL_CALLBACK_URL) {
      request.callbacks = {
        sessionUpdate: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/sessions/${request.session_id}/update`,
        mcpInvoke: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/mcp/invoke`,
        progress: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/sessions/${request.session_id}/progress`,
      };
    }

    // Create OpenCode session
    const opencodeSessionId = await createOpencodeSession(request);

    // Send prompt
    await sendPromptToSession(opencodeSessionId, request.prompt);

    // Wait for completion (with timeout)
    const output = await Promise.race([
      waitForSessionCompletion(opencodeSessionId),
      timeoutPromise,
    ]);

    res.json({
      output,
      status: "success",
      metadata: {
        model: "claude-3-5-sonnet-20241022", // OhMyOpenCode uses this by default
        opencodeSessionId,
        nubabelSessionId: request.session_id,
      },
    });
  } catch (error: unknown) {
    // ... error handling (same as before)
  }
});
```

### Acceptance Criteria

- ✅ OpenCode SDK initializes successfully
- ✅ Nubabel Bridge plugin loads
- ✅ Delegate endpoint creates OpenCode sessions
- ✅ MCP tool invocation callback works
- ✅ Session completion callback fires

---

## Phase 3: Session Continuity (Week 5-6)

### Goals

- Multi-turn conversations work
- Session mapping between Nubabel ↔ OpenCode
- Session state preserved across requests

### Tasks

#### 3.1 Create Session Mapping Utilities

**File**: `src/orchestrator/session-mapping.ts` (NEW)

```typescript
import { redis } from "../db/redis";
import { prisma } from "../db/client";
import { logger } from "../utils/logger";

export async function createSessionMapping(
  nubabelSessionId: string,
  opencodeSessionId: string,
): Promise<void> {
  logger.info("Creating session mapping", { nubabelSessionId, opencodeSessionId });

  // Store in Redis (hot) - bidirectional
  await redis.hset(`session:mapping:${nubabelSessionId}`, "opencodeSessionId", opencodeSessionId);
  await redis.hset(`session:mapping:${opencodeSessionId}`, "nubabelSessionId", nubabelSessionId);

  // Store in PostgreSQL (cold)
  await prisma.session.update({
    where: { id: nubabelSessionId },
    data: {
      state: {
        ...(await prisma.session.findUnique({ where: { id: nubabelSessionId } }))?.state,
        opencodeSessionId,
        lastSyncAt: new Date().toISOString(),
      },
    },
  });
}

export async function getOpencodeSessionId(nubabelSessionId: string): Promise<string | null> {
  // Check Redis first (hot path)
  const cached = await redis.hget(`session:mapping:${nubabelSessionId}`, "opencodeSessionId");

  if (cached) {
    logger.debug("OpenCode session ID found in cache", {
      nubabelSessionId,
      opencodeSessionId: cached,
    });
    return cached;
  }

  // Fallback to PostgreSQL (cold path)
  const session = await prisma.session.findUnique({
    where: { id: nubabelSessionId },
  });

  const opencodeSessionId = session?.state?.opencodeSessionId || null;

  // Re-cache if found
  if (opencodeSessionId) {
    await redis.hset(`session:mapping:${nubabelSessionId}`, "opencodeSessionId", opencodeSessionId);
  }

  return opencodeSessionId;
}

export async function getNubabelSessionId(opencodeSessionId: string): Promise<string | null> {
  // Check Redis first
  const cached = await redis.hget(`session:mapping:${opencodeSessionId}`, "nubabelSessionId");

  if (cached) {
    return cached;
  }

  // Fallback to PostgreSQL
  const session = await prisma.session.findFirst({
    where: {
      state: {
        path: ["opencodeSessionId"],
        equals: opencodeSessionId,
      },
    },
  });

  const nubabelSessionId = session?.id || null;

  // Re-cache if found
  if (nubabelSessionId) {
    await redis.hset(`session:mapping:${opencodeSessionId}`, "nubabelSessionId", nubabelSessionId);
  }

  return nubabelSessionId;
}
```

#### 3.2 Update Delegate Task to Check for Existing Sessions

**File**: `src/orchestrator/delegate-task.ts` (UPDATE)

```typescript
import { getOpencodeSessionId, createSessionMapping } from "./session-mapping";

export async function delegateTask(params: DelegateTaskParams): Promise<DelegateTaskResult> {
  if (!OPENCODE_SIDECAR_URL && USE_BUILTIN_AI && process.env.ANTHROPIC_API_KEY) {
    // ... built-in AI executor (unchanged)
  }

  if (!OPENCODE_SIDECAR_URL) {
    // ... stub response (unchanged)
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENCODE_SIDECAR_TIMEOUT);

  try {
    // Check if session already has OpenCode session (for multi-turn)
    const existingOpencodeSession = await getOpencodeSessionId(params.session_id);

    let endpoint: string;
    let body: any;

    if (existingOpencodeSession) {
      // Resume existing session
      logger.info("Resuming existing OpenCode session", {
        sessionId: params.session_id,
        opencodeSessionId: existingOpencodeSession,
      });

      endpoint = `${OPENCODE_SIDECAR_URL}/sessions/${existingOpencodeSession}/prompt`;
      body = { prompt: params.prompt };
    } else {
      // Create new session
      logger.info("Creating new OpenCode session", {
        sessionId: params.session_id,
        category: params.category,
        skills: params.load_skills,
      });

      endpoint = `${OPENCODE_SIDECAR_URL}/delegate`;
      body = {
        ...params,
        callbacks: {
          sessionUpdate: `${NUBABEL_URL}/api/sidecar/sessions/${params.session_id}/update`,
          mcpInvoke: `${NUBABEL_URL}/api/sidecar/mcp/invoke`,
          progress: `${NUBABEL_URL}/api/sidecar/sessions/${params.session_id}/progress`,
        },
      };
    }

    const response = await sidecarBreaker.execute(async () => {
      let attempt = 0;
      for (;;) {
        attempt++;
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (r.ok) {
          return r;
        }

        // ... retry logic (unchanged)
      }
    });

    const result = await response.json();

    // Store session mapping if new session created
    if (!existingOpencodeSession && result.metadata?.opencodeSessionId) {
      await createSessionMapping(params.session_id, result.metadata.opencodeSessionId);
    }

    return result;
  } catch (error) {
    // ... error handling (unchanged)
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### 3.3 Add /sessions/:id/prompt Endpoint to Sidecar

**File**: `opencode-sidecar/src/index.ts` (UPDATE)

```typescript
// Add new endpoint for multi-turn conversations
app.post("/sessions/:opencodeSessionId/prompt", async (req, res) => {
  const { opencodeSessionId } = req.params;
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({
      output: "Validation error: prompt is required and must be a string",
      status: "failed",
      metadata: {
        model: "unknown",
        error: "VALIDATION_ERROR",
      },
    });
  }

  try {
    // Send prompt to existing session
    await sendPromptToSession(opencodeSessionId, prompt);

    // Wait for completion
    const output = await waitForSessionCompletion(opencodeSessionId);

    res.json({
      output,
      status: "success",
      metadata: {
        model: "claude-3-5-sonnet-20241022",
        opencodeSessionId,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("Session prompt error:", error);
    return res.status(500).json({
      output: `Failed to send prompt to session: ${errorMessage}`,
      status: "failed",
      metadata: {
        model: "unknown",
        opencodeSessionId,
        error: "EXECUTION_ERROR",
      },
    });
  }
});
```

### Acceptance Criteria

- ✅ Session mapping created on first request
- ✅ Subsequent requests resume existing session
- ✅ Multi-turn conversation context preserved
- ✅ Session state synchronized between Nubabel and OpenCode

---

## Phase 4: Real-time Streaming (Week 7-8)

### Goals

- Real-time progress updates via SSE
- Cross-instance progress synchronization via Redis pub/sub
- Slack Bot shows live progress

### Tasks

#### 4.1 Add Redis Pub/Sub for Cross-Instance Progress

**File**: `src/api/sidecar-callbacks.ts` (UPDATE)

```typescript
import { createClient } from "redis";

// Create separate Redis client for pub/sub
const redisSubscriber = createClient({
  url: process.env.REDIS_URL,
});

redisSubscriber.connect();

// Subscribe to progress updates
redisSubscriber.subscribe("session:*:progress", (message, channel) => {
  const sessionId = channel.split(":")[1];
  const progress = JSON.parse(message);

  // Emit to local SSE listeners
  progressEmitter.emit(`session:${sessionId}:progress`, progress);
});

// Rest of the file unchanged...
```

#### 4.2 Update Slack Bot to Show Progress

**File**: `src/api/slack.ts` (UPDATE)

```typescript
import { progressEmitter } from "./sidecar-callbacks";

// When creating orchestration job, subscribe to progress
async function handleAppMention(event: any) {
  const { user, text, channel, ts } = event;

  // Create session
  const session = await createSession({ ... });

  // Start listening to progress updates
  const progressListener = async (progress: any) => {
    if (progress.type === "tool_execute_start") {
      await slackClient.chat.update({
        channel,
        ts: replyTs,
        text: `⏳ Executing ${progress.tool}...`,
      });
    } else if (progress.type === "tool_execute_end") {
      await slackClient.chat.update({
        channel,
        ts: replyTs,
        text: `✅ ${progress.tool} completed`,
      });
    }
  };

  progressEmitter.on(`session:${session.id}:progress`, progressListener);

  // Enqueue orchestration
  await orchestrationQueue.enqueueOrchestration({ ... });

  // Clean up listener after completion
  setTimeout(() => {
    progressEmitter.off(`session:${session.id}:progress`, progressListener);
  }, 300000); // 5 minutes timeout
}
```

### Acceptance Criteria

- ✅ SSE endpoint streams progress events
- ✅ Redis pub/sub distributes progress across instances
- ✅ Slack Bot shows real-time progress updates
- ✅ Progress updates work for all event types (tool execution, message parts, etc.)

---

## Testing Strategy

### Unit Tests

- Session mapping utilities
- Callback endpoint handlers
- OpenCode client wrapper functions

### Integration Tests

- End-to-end flow: Nubabel → Sidecar → Callback → Nubabel
- MCP tool execution via callback
- Session continuity across multiple requests
- SSE streaming

### E2E Tests

- Full Slack Bot flow with progress updates
- Multi-turn conversation via Slack
- OhMyOpenCode background agents execution

---

## Rollout Plan

### Week 1-2 (Phase 1)

- Implement callback infrastructure
- Deploy to staging
- Test with manual API calls

### Week 3-4 (Phase 2)

- Add OpenCode SDK integration
- Deploy to staging
- Test OhMyOpenCode features

### Week 5-6 (Phase 3)

- Implement session continuity
- Deploy to staging
- Test multi-turn conversations

### Week 7-8 (Phase 4)

- Add SSE streaming
- Deploy to production
- Monitor performance and errors

---

## Success Metrics

### Phase 1

- ✅ 100% callback success rate
- ✅ <100ms latency for callbacks

### Phase 2

- ✅ OhMyOpenCode features working (Oracle, Librarian, Explore agents)
- ✅ LSP tools functional (refactor, rename, diagnostics)
- ✅ <5s p95 latency for delegate_task

### Phase 3

- ✅ Session continuity works for 100% of multi-turn requests
- ✅ Zero session mapping errors

### Phase 4

- ✅ SSE streaming <100ms latency
- ✅ Real-time progress updates visible in Slack

---

## Risks & Mitigation

| Risk                          | Impact | Probability | Mitigation                                    |
| ----------------------------- | ------ | ----------- | --------------------------------------------- |
| OpenCode SDK breaking changes | High   | Low         | Pin exact versions, test thoroughly           |
| Callback timeout/failures     | Medium | Medium      | Implement retry logic, queue failed callbacks |
| Session state drift           | Medium | Low         | Regular sync checks, reconciliation job       |
| High memory usage (OpenCode)  | Medium | Medium      | Monitor and set resource limits               |
| SSE connection drops          | Low    | Medium      | Auto-reconnect logic, graceful degradation    |

---

## Next Steps After Completion

1. **Performance Optimization**
   - Cache OpenCode sessions
   - Optimize callback routing
   - Reduce latency

2. **Advanced Features**
   - Multiple OpenCode instances for scaling
   - Per-tenant OpenCode configuration
   - Advanced MCP tool routing

3. **Monitoring & Observability**
   - Distributed tracing for callback flow
   - Detailed metrics for OpenCode usage
   - Error alerting

---

**Status**: 🟡 In Progress  
**Last Updated**: 2026-01-27
