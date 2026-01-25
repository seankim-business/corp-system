# Orchestrator Architecture - Technical Deep Dive

> **작성일**: 2026-01-26  
> **목적**: Nubabel Orchestrator 시스템의 상세 아키텍처 및 구현 가이드

---

## 📐 Architecture Overview

### High-Level Flow

```
User Request (Slack/Web/API)
    │
    ▼
┌─────────────────────────────────────────┐
│ Request Analyzer                        │
│  - Intent extraction                    │
│  - Complexity analysis                  │
│  - Multi-agent detection                │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Category Selector                       │
│  - Keyword matching (fast path)         │
│  - Complexity fallback                  │
│  - Model selection                      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Skill Selector                          │
│  - Domain expertise detection           │
│  - MCP integration check                │
│  - Multi-skill combination              │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ MCP Registry Query                      │
│  - Get active connections for org       │
│  - Load available tools                 │
│  - Build context                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ OhMyOpenCode delegate_task              │
│  - Category-based model selection       │
│  - Skills injection                     │
│  - Session continuity                   │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Execution Tracking                      │
│  - PostgreSQL logging                   │
│  - Duration tracking                    │
│  - Error capture                        │
└─────────────────────────────────────────┘
```

---

## 🔍 Component Deep Dive

### 1. Request Analyzer

**File**: `src/orchestrator/request-analyzer.ts`

**Purpose**: Extract intent and analyze request complexity

**Current Implementation** (stubbed):

```typescript
// TODO: 실제 구현은 리서치 완료 후 진행
export async function analyzeRequest(
  userRequest: string,
): Promise<RequestAnalysis> {
  return {
    intent: extractIntent(userRequest),
    complexity: assessComplexity(userRequest),
    requiresMultiAgent: detectMultiAgent(userRequest),
    entities: extractEntities(userRequest),
  };
}
```

**Future Enhancement** (based on research):

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeRequest(
  userRequest: string,
): Promise<RequestAnalysis> {
  // Fast path: Simple keyword heuristics
  const simpleAnalysis = quickAnalyze(userRequest);
  if (simpleAnalysis.confidence > 0.9) {
    return simpleAnalysis;
  }

  // Slow path: LLM-based analysis
  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022", // Cheap, fast model for analysis
    max_tokens: 500,
    system: `Analyze user request for intent, complexity, and multi-agent requirements.
Return JSON with:
- intent: 'create_task' | 'search' | 'analyze' | 'multi_step'
- complexity: 'low' | 'medium' | 'high'
- requiresMultiAgent: boolean
- entities: string[]`,
    messages: [{ role: "user", content: userRequest }],
  });

  const analysis = JSON.parse(response.content[0].text);

  return {
    ...analysis,
    confidence: 1.0,
    method: "llm",
  };
}

function quickAnalyze(
  userRequest: string,
): RequestAnalysis & { confidence: number } {
  const text = userRequest.toLowerCase();

  // Simple task creation
  if (
    (text.includes("create") ||
      text.includes("만들") ||
      text.includes("작성")) &&
    (text.includes("task") || text.includes("태스크"))
  ) {
    return {
      intent: "create_task",
      complexity: "low",
      requiresMultiAgent: false,
      entities: extractSimpleEntities(userRequest),
      confidence: 0.95,
      method: "keyword",
    };
  }

  // Multi-step indicators
  if (text.match(/하고.*해/) || text.match(/and.*then/)) {
    return {
      intent: "multi_step",
      complexity: "high",
      requiresMultiAgent: true,
      entities: [],
      confidence: 0.9,
      method: "keyword",
    };
  }

  // Default to LLM analysis
  return {
    intent: "unknown",
    complexity: "medium",
    requiresMultiAgent: false,
    entities: [],
    confidence: 0.5,
    method: "keyword",
  };
}
```

**Performance Optimization**:

- **Fast path (keyword)**: ~1ms, 0 cost
- **Slow path (LLM)**: ~500ms, $0.001 per request
- **Coverage target**: 90%+ requests via fast path

---

### 2. Category Selector

**File**: `src/orchestrator/category-selector.ts`

**Purpose**: Select optimal category for task delegation

**Categories** (from research):

| Category             | Model             | Use Case                             | Cost      |
| -------------------- | ----------------- | ------------------------------------ | --------- |
| `visual-engineering` | Claude 3.7 Sonnet | Frontend, UI/UX, design              | High      |
| `ultrabrain`         | Claude Opus       | Complex architecture, deep reasoning | Very High |
| `artistry`           | Claude 3.7 Sonnet | Creative tasks, content creation     | High      |
| `quick`              | Claude 3.5 Haiku  | Simple file changes, typos           | Low       |
| `unspecified-low`    | Claude 3.5 Haiku  | Generic low-effort tasks             | Low       |
| `unspecified-high`   | Claude 3.7 Sonnet | Generic high-effort tasks            | High      |
| `writing`            | Claude 3.7 Sonnet | Documentation, technical writing     | Medium    |

**Current Implementation**:

```typescript
export function selectCategory(
  userRequest: string,
  analysis: RequestAnalysis,
): Category {
  const text = userRequest.toLowerCase();

  // Keyword-based scoring
  const scores = calculateKeywordScores(text);

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 0) {
    return getWinner(scores);
  }

  // Fallback to complexity
  if (analysis.complexity === "low") return "quick";
  if (analysis.complexity === "high") return "unspecified-high";
  return "unspecified-low";
}
```

**Cost Optimization Strategy**:

```typescript
// Example: Avoid expensive models for simple tasks
const estimatedCost = estimateTaskCost(category, userRequest);

if (estimatedCost > COST_THRESHOLD && category !== "ultrabrain") {
  // Try cheaper alternative
  const cheaperCategory = downgradeCategoryIfPossible(category);

  // Log for analysis
  console.log(
    `[Cost Optimization] Downgraded ${category} → ${cheaperCategory}`,
  );

  return cheaperCategory;
}
```

---

### 3. Skill Selector

**File**: `src/orchestrator/skill-selector.ts`

**Purpose**: Select domain-specific skills to inject into agent

**Available Skills**:

1. **`mcp-integration`** - MCP tool loading and execution
2. **`playwright`** - Browser automation
3. **`git-master`** - Git operations
4. **`frontend-ui-ux`** - UI/UX design

**Current Implementation**:

```typescript
export function selectSkills(userRequest: string): Skill[] {
  const text = userRequest.toLowerCase();
  const skills: Skill[] = [];

  if (needsMCPIntegration(text)) skills.push("mcp-integration");
  if (needsBrowser(text)) skills.push("playwright");
  if (needsGit(text)) skills.push("git-master");
  if (needsDesign(text)) skills.push("frontend-ui-ux");

  return Array.from(new Set(skills));
}
```

**Skill Combination Patterns** (from research):

```typescript
// Pattern 1: MCP + Git (common)
// "Create task in Notion and commit changes"
skills: ["mcp-integration", "git-master"];

// Pattern 2: Browser + MCP (testing)
// "Screenshot the Notion page and verify"
skills: ["playwright", "mcp-integration"];

// Pattern 3: Design + MCP (implementation)
// "Design a component and update Figma"
skills: ["frontend-ui-ux", "mcp-integration"];
```

---

### 4. Session Manager

**File**: `src/orchestrator/session-manager.ts`

**Purpose**: Cross-interface session continuity

**Storage Strategy**:

```
┌─────────────────────────────────────────┐
│ Redis (Hot)                             │
│  - TTL: 3600s                           │
│  - Fast read/write                      │
│  - Active conversations                 │
└─────────────────────────────────────────┘
          │ Write-through
          ▼
┌─────────────────────────────────────────┐
│ PostgreSQL (Cold)                       │
│  - Permanent storage                    │
│  - History & analytics                  │
│  - Recovery on Redis failure            │
└─────────────────────────────────────────┘
```

**Session Structure**:

```typescript
interface Session {
  id: string; // ses_1737889200_a3f9d2
  userId: string;
  organizationId: string;
  source: "slack" | "web" | "terminal" | "api";

  // AI conversation state
  state: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; content: string }>;

  // Source-specific tracking
  metadata: {
    slackThreadTs?: string; // Slack thread ID
    userAgent?: string; // Web user agent
    ipAddress?: string; // Security tracking
  };

  createdAt: Date;
  expiresAt: Date;
}
```

**Key Operations**:

```typescript
// Create session
const session = await sessionManager.createSession({
  userId: "user_123",
  organizationId: "org_456",
  source: "slack",
  slackThreadTs: "ts_789",
});

// Add conversation
await sessionManager.updateHistory(session.id, {
  role: "user",
  content: "Create a task in Notion",
});

await sessionManager.updateHistory(session.id, {
  role: "assistant",
  content: 'Created task "New Feature"',
});

// Switch interface (Slack → Web)
await sessionManager.switchInterface(session.id, "web", {
  userAgent: "Mozilla/5.0...",
});

// Session still contains full conversation history
```

---

## 🔄 Execution Flow Example

### Scenario: "Create task in Notion"

```typescript
// 1. User mentions bot in Slack
const slackEvent = {
  user: "U123",
  channel: "C456",
  text: "@nubabel Create task in Notion for new feature",
  ts: "1737889200.123456",
};

// 2. Slack handler queues job (BullMQ)
await agentQueue.add("slack-mention", {
  userId: user.id,
  organizationId: user.organizationId,
  message: slackEvent.text,
  slackThreadTs: slackEvent.ts,
  slackChannel: slackEvent.channel,
});

// 3. Worker picks up job
worker.process(async (job) => {
  // Create session
  const session = await sessionManager.createSession({
    userId: job.data.userId,
    organizationId: job.data.organizationId,
    source: "slack",
    slackThreadTs: job.data.slackThreadTs,
  });

  // Orchestrate
  const result = await orchestrate({
    userRequest: job.data.message,
    sessionId: session.id,
    organizationId: job.data.organizationId,
    userId: job.data.userId,
  });

  // Send result to Slack
  await slackClient.chat.postMessage({
    channel: job.data.slackChannel,
    thread_ts: job.data.slackThreadTs,
    text: result.output,
  });
});

// 4. Inside orchestrate()
const analysis = await analyzeRequest(message);
// → { intent: 'create_task', complexity: 'low', requiresMultiAgent: false }

const category = selectCategory(message, analysis);
// → 'quick' (simple task creation)

const skills = selectSkills(message);
// → ['mcp-integration'] (needs MCP tools)

const mcpConnections = await getActiveMCPConnections(organizationId);
// → [{ provider: 'notion', name: 'Workspace 1', enabled: true }]

const context = {
  availableMCPs: mcpConnections.map((c) => ({
    provider: c.provider,
    name: c.name,
  })),
  organizationId,
  userId,
};

// 5. Delegate to OhMyOpenCode
const result = await delegate_task({
  category: "quick",
  load_skills: ["mcp-integration"],
  prompt: message,
  session_id: session.id,
  context,
});

// 6. Agent executes with mcp-integration skill
// - Loads Notion MCP tools
// - Calls notion__createTask
// - Returns result

// 7. Save execution log
await saveExecution({
  organizationId,
  userId,
  sessionId: session.id,
  category: "quick",
  skills: ["mcp-integration"],
  prompt: message,
  result: result.output,
  status: "success",
  duration: 2340, // ms
});
```

---

## 📊 Performance Characteristics

### Latency Breakdown

| Phase              | Expected Time | Notes                        |
| ------------------ | ------------- | ---------------------------- |
| Request analysis   | 1-500ms       | 1ms (keyword) or 500ms (LLM) |
| Category selection | <1ms          | Pure keyword matching        |
| Skill selection    | <1ms          | Pure keyword matching        |
| MCP registry query | 5-10ms        | PostgreSQL query             |
| delegate_task call | 2-30s         | Depends on task complexity   |
| Execution logging  | 10-50ms       | PostgreSQL write             |
| **Total**          | **2-31s**     | Slack timeout: 3s for ack    |

**Optimization**: Job queue handles long-running tasks

---

## 🚨 Error Handling

### Error Categories

```typescript
class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean,
  ) {
    super(message);
  }
}

enum ErrorCode {
  ANALYSIS_FAILED = "ANALYSIS_FAILED",
  MCP_CONNECTION_FAILED = "MCP_CONNECTION_FAILED",
  DELEGATE_TASK_FAILED = "DELEGATE_TASK_FAILED",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
}
```

### Error Handling Strategy

```typescript
try {
  const result = await orchestrate(request);
} catch (error) {
  if (error instanceof OrchestratorError) {
    if (error.retryable) {
      // Queue for retry
      await retryQueue.add("retry-orchestration", request, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    } else {
      // Terminal error, notify user
      await notifyUser({
        userId: request.userId,
        message: getUserFriendlyError(error),
      });
    }
  }

  // Log for monitoring
  await logError(error, request);
}
```

---

## 🔐 Security Considerations

### Multi-Tenant Isolation

```typescript
// ALWAYS verify organizationId before MCP access
const mcpConnections = await getActiveMCPConnections(organizationId);

// PostgreSQL RLS ensures row-level security
// Even if organizationId is manipulated, DB rejects access
```

### Credential Encryption

```typescript
// MCP credentials stored encrypted at rest
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.MCP_ENCRYPTION_KEY;

function encryptCredential(credential: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(credential), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptCredential(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedData = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  return Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]).toString();
}
```

---

## 📈 Monitoring & Observability

### Key Metrics

```typescript
// Prometheus metrics
import { Histogram, Counter, Gauge } from "prom-client";

const orchestrationDuration = new Histogram({
  name: "orchestration_duration_seconds",
  help: "Time taken for orchestration",
  labelNames: ["category", "status"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const orchestrationCount = new Counter({
  name: "orchestration_total",
  help: "Total orchestrations",
  labelNames: ["category", "status"],
});

const activeOrcestrations = new Gauge({
  name: "orchestration_active",
  help: "Currently active orchestrations",
});

const mcpToolCalls = new Counter({
  name: "mcp_tool_calls_total",
  help: "Total MCP tool calls",
  labelNames: ["provider", "tool", "status"],
});
```

### Structured Logging

```typescript
logger.info("orchestration_started", {
  sessionId: session.id,
  organizationId,
  userId,
  category,
  skills,
  source: session.source,
});

logger.info("orchestration_completed", {
  sessionId: session.id,
  duration: endTime - startTime,
  status: "success",
  category,
  model: result.metadata.model,
  tokensUsed: result.metadata.tokens,
});
```

---

**작성일**: 2026-01-26  
**버전**: 1.0.0  
**다음 단계**: BullMQ job queue 구현 가이드 작성
