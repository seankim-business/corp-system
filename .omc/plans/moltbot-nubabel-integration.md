# Moltbot-Nubabel Integration Plan

## Executive Summary

### What We're Building
A non-invasive integration between Moltbot and Nubabel that unlocks enterprise-grade AI orchestration for 13+ messaging channels without modifying Moltbot's codebase. This integration leverages Moltbot as a multi-channel gateway while Nubabel provides intelligent task orchestration, budget enforcement, approval workflows, and enterprise compliance.

### Why This Matters
- **Immediate Value**: Nubabel gains access to WhatsApp, Telegram, Discord, Teams, and 9+ other channels overnight
- **Enterprise Features**: All channels inherit Nubabel's budget controls, approval workflows, and audit logging
- **Zero Moltbot Changes**: Moltbot continues operating as a standalone daemon - we only consume its APIs
- **Incremental Adoption**: Each phase delivers standalone value; no phase depends on completing all phases

### Integration Philosophy
```
Moltbot = Multi-channel I/O Layer (unchanged)
Nubabel = Enterprise AI Orchestration Engine
Bridge = Thin translation layer connecting them
```

---

## Architecture Decision

### Recommended Approach: Phased Implementation (A → B → C)

| Phase | Effort | Channels | Features |
|-------|--------|----------|----------|
| **Phase 1: Quick Win** | 2-4 hours | All 13+ (via Moltbot) | Basic orchestration |
| **Phase 2: Skill Extension** | 2-3 days | All + native Slack | Moltbot skills as tools |
| **Phase 3: Full Bridge** | 3-4 weeks | Bidirectional | Enterprise for all channels |

**Rationale**: Phase 1 alone provides 80% of the value with 5% of the effort. Phases 2 and 3 add polish and native-feeling experiences.

---

## Phase 1: Quick Win (Option A) - Moltbot as Frontend

### Overview
Enable Nubabel's existing V1 API (currently commented out) so Moltbot can use Nubabel as its AI backend. This requires verifying the API key service is functional (Step 1.0), then uncommenting two lines to enable the V1 router.

### Architecture
```
User → [WhatsApp/Telegram/Discord] → Moltbot → POST /api/v1/agents/:id/execute → Nubabel Orchestrator
                                        ↑                                              ↓
                                        └────────────────── Response ────────────────────┘
```

### Implementation Details

#### Step 1.0: Verify API Key Service Status (PREREQUISITE)

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/services/api-keys.ts`

The API key service must be functional for Phase 1 to work. The V1 API uses this service to validate incoming requests.

**Check the service status:**
1. Open `/src/services/api-keys.ts`
2. Look for TODO comments and stub implementations
3. If `create()` returns stub data or `validate()` always returns null, the service needs work

**If the service shows TODO comments and stub returns:**

**Option A: Complete API Key Service (Recommended)**
- Uncomment Prisma operations in `create()`, `validate()`, and other methods
- Verify the `APIKey` model exists in `prisma/schema.prisma`
- Run `npx prisma migrate dev --name enable_api_keys` if model is new
- Test with: `curl -H "Authorization: Bearer test-key" http://localhost:3000/api/v1/health`

**Option B: Use Environment Variable Auth (Quick Hack)**
- Add to `.env`: `MOLTBOT_API_KEY=<generate-secure-key>`
- Modify V1 API middleware (`/src/api/v1/index.ts`) to accept this env var:
  ```typescript
  // Quick auth bypass for Moltbot integration
  const moltbotKey = process.env.MOLTBOT_API_KEY;
  if (moltbotKey && req.headers.authorization === `Bearer ${moltbotKey}`) {
    // Allow request with default org context
    req.organizationId = process.env.DEFAULT_ORG_ID;
    return next();
  }
  ```
- Document this as technical debt for Phase 2 cleanup

**Effort**: Option A: 1-2 hours, Option B: 15 minutes

**Acceptance Criteria:**
- [ ] API key can be created (Option A) or env var configured (Option B)
- [ ] Request with valid key returns 200
- [ ] Request with invalid key returns 401

#### Step 1.1: Enable V1 API Router (1 line change)

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/index.ts`

**Change** (line 87):
```typescript
// Before:
// import v1ApiRouter from "./api/v1";

// After:
import v1ApiRouter from "./api/v1";
```

**Change** (line 466):
```typescript
// Before:
// app.use("/api/v1", v1ApiRouter);

// After:
app.use("/api/v1", v1ApiRouter);
```

**Effort**: 5 minutes

#### Step 1.2: Generate API Key for Moltbot

**Important**: Nubabel uses a custom `apiKeyService` (see `/src/services/api-keys.ts`). Create an API key via the admin interface or CLI utility.

**Using API Keys Service (programmatically)**:
```typescript
import { apiKeyService } from "./services/api-keys";

const apiKey = await apiKeyService.create({
  organizationId: "<organization-id>",
  name: "moltbot-integration",
  scopes: ["agents:read", "agents:execute"],
});
// Returns: { id, key, organizationId, scopes, ... }
// Store the `key` value securely - it cannot be retrieved again
```

**Or via direct database insert** (if no admin UI):
```sql
-- Using the api_keys table (check actual schema in api-keys service)
INSERT INTO "api_keys" (id, organization_id, name, key_hash, scopes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '<organization-id>',
  'moltbot-integration',
  -- Hash the key using same algorithm as apiKeyService
  'hashed_key_here',
  ARRAY['agents:read', 'agents:execute'],
  NOW(),
  NOW()
);
```

**Security Note**: Store the generated API key in environment variables or a secrets manager - NOT in plain text configuration files.

**Effort**: 15 minutes

#### Step 1.3: Configure Moltbot to Use Nubabel

**Available Agent IDs** (from `/config/agents/*.yaml`):
- `general-agent` - General purpose (recommended for default routing)
- `finance-agent` - Financial queries
- `hr-agent` - HR/people operations
- `cs-agent` - Customer service
- `product-agent` - Product management
- `data-agent` - Data analysis
- `dev-agent` - Development tasks
- `brand-agent` - Branding/marketing
- `ops-agent` - Operations
- `meta-agent` - Agent orchestration

In Moltbot's skill configuration or webhook setup:

```json
{
  "ai_backend": {
    "type": "webhook",
    "url": "http://localhost:3000/api/v1/agents/general-agent/execute",
    "headers": {
      "Authorization": "Bearer ${NUBABEL_API_KEY}"
    },
    "body_template": {
      "message": "{{user_message}}",
      "sessionId": "{{channel}}_{{user_id}}",
      "context": {
        "channel": "{{channel}}",
        "userId": "{{user_id}}"
      }
    }
  }
}
```

**Agent Selection Logic**: You can configure Moltbot to route to different agents based on message content or channel:
- `/api/v1/agents/finance-agent/execute` for finance-related messages
- `/api/v1/agents/cs-agent/execute` for customer service
- `/api/v1/agents/general-agent/execute` as fallback

**Effort**: 30 minutes (depends on Moltbot config format)

### Phase 1 Deliverables
- [ ] V1 API enabled in Nubabel
- [ ] API key generated for Moltbot
- [ ] Moltbot configured to call Nubabel
- [ ] Test message flow end-to-end

### Phase 1 Acceptance Criteria
1. Send message via WhatsApp → Receive intelligent response from Nubabel orchestrator
2. Budget tracking records the request
3. Audit log shows the execution

---

## Phase 2: Skill Extension (Option B) - Moltbot as Tool Provider

### Overview
Extend Nubabel's orchestrator to call Moltbot's HTTP API for specialized capabilities that Nubabel doesn't have natively (voice, browser automation, visual canvas).

### Architecture
```
User → Slack → Nubabel Orchestrator
                    ↓ (needs browser/voice/canvas)
               POST http://127.0.0.1:18789/tools/invoke
                    ↓
               Moltbot Skill Execution
                    ↓
               Return to Nubabel → Format → User
```

### Implementation Details

#### Step 2.1: Create Moltbot MCP Server

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/mcp-servers/moltbot/index.ts` (NEW)

Following the **actual Nubabel MCP pattern** from `/src/mcp-servers/notion/index.ts`:

```typescript
/**
 * Moltbot MCP Server Entry Point
 *
 * Exposes Moltbot's skills as tools available to Nubabel's orchestrator.
 * Follows the same function-based pattern as other MCP servers.
 */

import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { ToolCallResult } from "../../mcp/types";
import { recordMcpToolCall } from "../../services/metrics";
import { logger } from "../../utils/logger";
import { getCircuitBreaker } from "../../utils/circuit-breaker";

const MOLTBOT_URL = process.env.MOLTBOT_URL || "http://127.0.0.1:18789";
const MOLTBOT_TIMEOUT = parseInt(process.env.MOLTBOT_TIMEOUT || "30000", 10);
const MOLTBOT_SIGNATURE_SECRET = process.env.MOLTBOT_SIGNATURE_SECRET;

const moltbotBreaker = getCircuitBreaker("moltbot", {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: MOLTBOT_TIMEOUT,
  resetTimeout: 30_000,
});

// Legacy tool name mapping (snake_case → camelCase)
const legacyToolMap: Record<string, string> = {
  voice_speak: "voiceSpeak",
  voice_transcribe: "voiceTranscribe",
  browser_navigate: "browserNavigate",
  browser_screenshot: "browserScreenshot",
  browser_click: "browserClick",
  browser_fill: "browserFill",
  canvas_create: "canvasCreate",
  canvas_draw: "canvasDraw",
  canvas_export: "canvasExport",
  send_whatsapp: "sendWhatsapp",
  send_telegram: "sendTelegram",
  send_discord: "sendDiscord",
  send_teams: "sendTeams",
  send_email: "sendEmail",
};

// Map of exposed tools to Moltbot skill names
const toolToSkillMap: Record<string, string> = {
  // Voice & Audio
  voiceSpeak: "voice.speak",
  voiceTranscribe: "voice.transcribe",

  // Browser Automation
  browserNavigate: "browser.navigate",
  browserScreenshot: "browser.screenshot",
  browserClick: "browser.click",
  browserFill: "browser.fill",

  // Visual Canvas
  canvasCreate: "canvas.create",
  canvasDraw: "canvas.draw",
  canvasExport: "canvas.export",

  // Messaging (outbound)
  sendWhatsapp: "send.whatsapp",
  sendTelegram: "send.telegram",
  sendDiscord: "send.discord",
  sendTeams: "send.teams",
  sendEmail: "send.email",
};

export function registerTools(): string[] {
  return [
    // Voice & Audio
    "moltbot__voiceSpeak",
    "moltbot__voiceTranscribe",

    // Browser Automation
    "moltbot__browserNavigate",
    "moltbot__browserScreenshot",
    "moltbot__browserClick",
    "moltbot__browserFill",

    // Visual Canvas
    "moltbot__canvasCreate",
    "moltbot__canvasDraw",
    "moltbot__canvasExport",

    // Messaging
    "moltbot__sendWhatsapp",
    "moltbot__sendTelegram",
    "moltbot__sendDiscord",
    "moltbot__sendTeams",
    "moltbot__sendEmail",
  ];
}

async function invokeMoltbotSkill(
  skillName: string,
  args: Record<string, unknown>,
  sessionKey: string,
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  return moltbotBreaker.execute(async () => {
    const response = await fetch(`${MOLTBOT_URL}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(MOLTBOT_SIGNATURE_SECRET && {
          "X-Signature": generateSignature({
            tool: skillName,
            args,
            sessionKey,
          }),
        }),
      },
      body: JSON.stringify({
        tool: skillName,
        args,
        sessionKey,
      }),
      signal: AbortSignal.timeout(MOLTBOT_TIMEOUT),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Moltbot returned ${response.status}: ${errorText}`);
    }

    return response.json();
  });
}

// Simple HMAC signature for request verification (optional security layer)
function generateSignature(payload: object): string {
  if (!MOLTBOT_SIGNATURE_SECRET) return "";

  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", MOLTBOT_SIGNATURE_SECRET);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

export async function executeMoltbotTool(
  toolName: string,
  input: Record<string, unknown>,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<ToolCallResult> {
  const parsed = validateToolAccess(toolName, "moltbot", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const skillName = toolToSkillMap[resolvedToolName];
  if (!skillName) {
    return {
      success: false,
      error: {
        code: "UNKNOWN_TOOL",
        message: `Unknown Moltbot tool: ${toolName}`,
      },
      metadata: {
        duration: 0,
        cached: false,
      },
    };
  }

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "moltbot",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache ?? true, // Moltbot calls are typically not cacheable
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        const sessionKey = `nubabel_${organizationId}_${Date.now()}`;
        const moltbotResult = await invokeMoltbotSkill(skillName, input, sessionKey);

        if (!moltbotResult.success) {
          throw new Error(moltbotResult.error || "Moltbot skill execution failed");
        }

        return moltbotResult.output;
      },
    });

    success = true;
    const duration = Date.now() - startTime;

    return {
      success: true,
      data: result,
      metadata: {
        duration,
        cached: false,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Moltbot tool invocation failed", {
      tool: skillName,
      resolvedToolName,
      error: message,
      duration,
    });

    return {
      success: false,
      error: {
        code: "EXECUTION_FAILED",
        message,
      },
      metadata: {
        duration,
        cached: false,
      },
    };
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "moltbot",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}
```

**Effort**: 4-6 hours

#### Step 2.2: Register Moltbot Tools with Orchestrator

Unlike other providers, Moltbot doesn't use `registerProvider()` (which doesn't exist). Instead, tools are registered via the tool definition system.

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/mcp-servers/moltbot/tools.ts` (NEW)

```typescript
/**
 * Moltbot Tool Definitions
 *
 * Defines the schema for each Moltbot skill exposed to Nubabel.
 */

import { MCPTool } from "../../mcp/types";

export const moltbotTools: MCPTool[] = [
  // Voice Tools
  {
    name: "moltbot__voiceSpeak",
    provider: "moltbot",
    description: "Convert text to speech audio",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert to speech" },
        voice: { type: "string", description: "Voice ID or name (optional)" },
        speed: { type: "number", description: "Speech speed multiplier (0.5-2.0)" },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        audioUrl: { type: "string" },
        duration: { type: "number" },
      },
    },
    requiresAuth: false,
    permissions: {
      allowedAgents: ["*"],
    },
  },
  {
    name: "moltbot__voiceTranscribe",
    provider: "moltbot",
    description: "Transcribe audio to text",
    inputSchema: {
      type: "object",
      properties: {
        audioUrl: { type: "string", description: "URL of audio file to transcribe" },
        language: { type: "string", description: "Language code (e.g., 'en', 'ko')" },
      },
      required: ["audioUrl"],
    },
    outputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        confidence: { type: "number" },
      },
    },
    requiresAuth: false,
    permissions: {
      allowedAgents: ["*"],
    },
  },

  // Browser Tools
  {
    name: "moltbot__browserNavigate",
    provider: "moltbot",
    description: "Navigate to a URL in headless browser",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        waitFor: { type: "string", description: "CSS selector to wait for" },
      },
      required: ["url"],
    },
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        url: { type: "string" },
      },
    },
    requiresAuth: false,
    permissions: {
      allowedAgents: ["*"],
    },
  },
  {
    name: "moltbot__browserScreenshot",
    provider: "moltbot",
    description: "Take a screenshot of the current browser page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to screenshot (optional, defaults to full page)" },
        format: { type: "string", enum: ["png", "jpeg"], description: "Image format" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        imageUrl: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    requiresAuth: false,
    permissions: {
      allowedAgents: ["*"],
    },
  },

  // Messaging Tools
  {
    name: "moltbot__sendWhatsapp",
    provider: "moltbot",
    description: "Send a message via WhatsApp",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Phone number or contact ID" },
        message: { type: "string", description: "Message content" },
      },
      required: ["to", "message"],
    },
    outputSchema: {
      type: "object",
      properties: {
        messageId: { type: "string" },
        status: { type: "string" },
      },
    },
    requiresAuth: true,
    permissions: {
      allowedAgents: ["*"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  // ... (similar definitions for other messaging tools)
];
```

**Effort**: 2-3 hours

#### Step 2.3: Add Moltbot Skills to Skill Selector

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/orchestrator/skill-selector.ts`

Add new skill keywords:

```typescript
// Add to skillKeywords map
const moltbotSkillKeywords: Record<string, string[]> = {
  "moltbot-voice": ["speak", "say", "voice", "audio", "transcribe", "speech", "tts"],
  "moltbot-browser": ["browse", "navigate", "screenshot", "click", "scrape", "web", "headless"],
  "moltbot-canvas": ["canvas", "draw", "visualize", "diagram", "chart"],
  "moltbot-messaging": ["send to whatsapp", "message telegram", "post to discord", "send to teams"],
};
```

**Effort**: 1 hour

#### Step 2.4: Update Types

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/orchestrator/types.ts`

```typescript
export type Skill =
  | "playwright"
  | "git-master"
  | "frontend-ui-ux"
  | "mcp-integration"
  | "skillsmp-downloader"
  // Moltbot skills
  | "moltbot-voice"
  | "moltbot-browser"
  | "moltbot-canvas"
  | "moltbot-messaging";
```

**Effort**: 15 minutes

#### Step 2.5: Add Environment Variables

**File**: `.env.example` (update)

```bash
# Moltbot Integration (Phase 2)
MOLTBOT_URL=http://127.0.0.1:18789
MOLTBOT_TIMEOUT=30000
MOLTBOT_SIGNATURE_SECRET=your-shared-secret-here  # Optional: for request signing
```

**Effort**: 5 minutes

### Phase 2 Deliverables
- [ ] Moltbot MCP server implementation following Nubabel patterns
- [ ] Tool definitions with proper schemas
- [ ] Skill keywords for Moltbot capabilities
- [ ] Type updates for new skills
- [ ] Environment variable configuration
- [ ] Integration tests

### Phase 2 Acceptance Criteria
1. User in Slack says "take a screenshot of google.com" → Moltbot browser skill executes
2. User says "send this to my WhatsApp" → Moltbot messaging skill sends message
3. Circuit breaker protects against Moltbot downtime
4. Request signature verification works (if configured)

---

## Phase 3: Full Bridge (Option C) - Bidirectional Multi-Channel

### Overview
Create a bridge service that enables:
1. Inbound: Messages from any Moltbot channel → Nubabel processing → Response via Moltbot
2. Outbound: Nubabel-initiated messages → Any channel via Moltbot
3. Unified sessions across all channels

### Architecture
```
                    ┌─────────────────────────────────────┐
                    │         Moltbot-Nubabel Bridge      │
                    │  (WebSocket client + HTTP server)   │
                    └─────────────────────────────────────┘
                              ↑                ↓
                              │                │
       ┌──────────────────────┴──┐          ┌──┴──────────────────────┐
       │  Moltbot WebSocket API  │          │  Nubabel Orchestrator   │
       │  ws://127.0.0.1:18789   │          │  POST /api/v1/agents    │
       └─────────────────────────┘          └─────────────────────────┘
              ↑                                         ↓
              │                                         │
    ┌─────────┴─────────┐                    ┌─────────┴─────────┐
    │  13+ Channels     │                    │  Enterprise       │
    │  WhatsApp, Tele-  │                    │  Budget, Approval,│
    │  gram, Discord... │                    │  Audit, MCP...    │
    └───────────────────┘                    └───────────────────┘
```

### Implementation Details

#### Step 3.1: Add External User Mapping Table

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/prisma/schema.prisma`

**CRITICAL FIX**: Add relation to User model AND support multi-tenant scenarios.

Add to schema:

```prisma
// Add this new model
model ExternalUserMapping {
  id             String   @id @default(uuid()) @db.Uuid
  channel        String   @db.VarChar(50)    // "whatsapp", "telegram", "discord", etc.
  externalUserId String   @map("external_user_id") @db.VarChar(255)  // User ID on the external channel
  organizationId String   @map("organization_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  displayName    String?  @map("display_name") @db.VarChar(255)
  metadata       Json?    @db.JsonB         // Channel-specific metadata
  verified       Boolean  @default(false)   // Whether user completed verification
  verifiedAt     DateTime? @map("verified_at") @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Multi-tenant unique constraint: same external user can be in multiple orgs
  @@unique([channel, externalUserId, organizationId])
  @@index([organizationId])
  @@index([userId])
  @@index([channel, externalUserId])
  @@map("external_user_mappings")
}
```

**CRITICAL**: Update User model to add the relation:

```prisma
model User {
  // ... existing fields ...

  // Relations (add this line)
  externalUserMappings   ExternalUserMapping[]

  // ... rest of existing relations ...
}
```

**CRITICAL**: Update Organization model to add the relation:

```prisma
model Organization {
  // ... existing fields ...

  // Relations (add this line)
  externalUserMappings   ExternalUserMapping[]

  // ... rest of existing relations ...
}
```

Run migration:
```bash
npx prisma migrate dev --name add_external_user_mapping
```

**Effort**: 1 hour (including testing migration)

#### Step 3.2: Create External User Service

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/services/external-user.ts` (NEW)

**CRITICAL FIX**: Properly handle user resolution with actual User records.

```typescript
/**
 * External User Service
 *
 * Handles mapping between external channel users and Nubabel users.
 * Supports auto-provisioning of external users with proper User records.
 */

import { db } from "../db/client";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";

export interface ExternalUserResolution {
  userId: string;
  organizationId: string;
  isNewUser: boolean;
  mapping: {
    id: string;
    channel: string;
    externalUserId: string;
    verified: boolean;
  };
}

export interface ResolveExternalUserOptions {
  channel: string;
  externalUserId: string;
  organizationId?: string;  // Optional: if not provided, uses DEFAULT_ORG_ID
  displayName?: string;
  metadata?: Record<string, unknown>;
  autoProvision?: boolean;  // Default: false - require registration
}

const CACHE_KEY_PREFIX = "external-user-mapping";
const CACHE_TTL = 300; // 5 minutes

/**
 * Resolve an external channel user to a Nubabel user.
 *
 * Flow:
 * 1. Check cache for existing mapping
 * 2. Query database for existing mapping
 * 3. If autoProvision=true and no mapping:
 *    a. Create a new User record with email: `<channel>_<externalUserId>@external.nubabel.local`
 *    b. Create Membership linking User to Organization
 *    c. Create ExternalUserMapping
 * 4. Return resolution or null
 */
export async function resolveExternalUser(
  options: ResolveExternalUserOptions
): Promise<ExternalUserResolution | null> {
  const { channel, externalUserId, displayName, metadata, autoProvision = false } = options;
  const organizationId = options.organizationId || process.env.DEFAULT_ORG_ID;

  if (!organizationId) {
    logger.error("Cannot resolve external user: no organizationId provided and DEFAULT_ORG_ID not set");
    return null;
  }

  // Check cache first
  const cacheKey = `${CACHE_KEY_PREFIX}:${channel}:${externalUserId}:${organizationId}`;
  const cached = await cache.get<ExternalUserResolution>(cacheKey, { prefix: CACHE_KEY_PREFIX, ttl: CACHE_TTL });
  if (cached) {
    return cached;
  }

  // Query database for existing mapping
  const existingMapping = await db.externalUserMapping.findFirst({
    where: {
      channel,
      externalUserId,
      organizationId,
    },
    include: {
      user: true,
    },
  });

  if (existingMapping) {
    const resolution: ExternalUserResolution = {
      userId: existingMapping.userId,
      organizationId: existingMapping.organizationId,
      isNewUser: false,
      mapping: {
        id: existingMapping.id,
        channel: existingMapping.channel,
        externalUserId: existingMapping.externalUserId,
        verified: existingMapping.verified,
      },
    };

    await cache.set(cacheKey, resolution, { prefix: CACHE_KEY_PREFIX, ttl: CACHE_TTL });
    return resolution;
  }

  // No existing mapping - auto-provision if enabled
  if (!autoProvision) {
    logger.info("External user not found and auto-provision disabled", {
      channel,
      externalUserId,
      organizationId,
    });
    return null;
  }

  // Auto-provision new user
  logger.info("Auto-provisioning new external user", {
    channel,
    externalUserId,
    organizationId,
  });

  try {
    // Create user and mapping in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create User record with synthetic email
      const syntheticEmail = `${channel}_${externalUserId.replace(/[^a-zA-Z0-9]/g, "_")}@external.nubabel.local`;

      const newUser = await tx.user.create({
        data: {
          email: syntheticEmail,
          displayName: displayName || `${channel}:${externalUserId}`,
          emailVerified: false,
        },
      });

      // Create Membership with limited role
      await tx.membership.create({
        data: {
          organizationId,
          userId: newUser.id,
          role: "external",  // Limited role for external users
          permissions: {
            canExecuteAgents: true,
            canViewDashboard: false,
            canManageSettings: false,
          },
          joinedAt: new Date(),
        },
      });

      // Create ExternalUserMapping
      const mapping = await tx.externalUserMapping.create({
        data: {
          channel,
          externalUserId,
          organizationId,
          userId: newUser.id,
          displayName,
          metadata: metadata || {},
          verified: false,
        },
      });

      return { user: newUser, mapping };
    });

    const resolution: ExternalUserResolution = {
      userId: result.user.id,
      organizationId,
      isNewUser: true,
      mapping: {
        id: result.mapping.id,
        channel: result.mapping.channel,
        externalUserId: result.mapping.externalUserId,
        verified: result.mapping.verified,
      },
    };

    await cache.set(cacheKey, resolution, { prefix: CACHE_KEY_PREFIX, ttl: CACHE_TTL });

    logger.info("Successfully provisioned external user", {
      userId: result.user.id,
      channel,
      externalUserId,
      organizationId,
    });

    return resolution;
  } catch (error) {
    logger.error("Failed to auto-provision external user", {
      error: error instanceof Error ? error.message : String(error),
      channel,
      externalUserId,
      organizationId,
    });
    return null;
  }
}

/**
 * Link an existing Nubabel user to an external channel identity.
 * Used for the user linking flow.
 */
export async function linkExternalUser(params: {
  userId: string;
  organizationId: string;
  channel: string;
  externalUserId: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}): Promise<ExternalUserResolution> {
  const { userId, organizationId, channel, externalUserId, displayName, metadata } = params;

  // Verify user exists and belongs to organization
  const membership = await db.membership.findFirst({
    where: {
      userId,
      organizationId,
    },
    include: {
      user: true,
    },
  });

  if (!membership) {
    throw new Error(`User ${userId} is not a member of organization ${organizationId}`);
  }

  // Check for existing mapping
  const existing = await db.externalUserMapping.findFirst({
    where: {
      channel,
      externalUserId,
      organizationId,
    },
  });

  if (existing) {
    if (existing.userId !== userId) {
      throw new Error(`External user ${channel}:${externalUserId} is already linked to a different user`);
    }
    // Already linked to this user
    return {
      userId,
      organizationId,
      isNewUser: false,
      mapping: {
        id: existing.id,
        channel: existing.channel,
        externalUserId: existing.externalUserId,
        verified: existing.verified,
      },
    };
  }

  // Create new mapping
  const mapping = await db.externalUserMapping.create({
    data: {
      channel,
      externalUserId,
      organizationId,
      userId,
      displayName,
      metadata: metadata || {},
      verified: true,
      verifiedAt: new Date(),
    },
  });

  // Invalidate cache
  const cacheKey = `${CACHE_KEY_PREFIX}:${channel}:${externalUserId}:${organizationId}`;
  await cache.del(cacheKey, { prefix: CACHE_KEY_PREFIX, ttl: CACHE_TTL });

  return {
    userId,
    organizationId,
    isNewUser: false,
    mapping: {
      id: mapping.id,
      channel: mapping.channel,
      externalUserId: mapping.externalUserId,
      verified: mapping.verified,
    },
  };
}

export const externalUserService = {
  resolve: resolveExternalUser,
  link: linkExternalUser,
};
```

**Effort**: 4-5 hours

#### Step 3.3: Create Bridge Service

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/services/moltbot-bridge/index.ts` (NEW)

```typescript
/**
 * Moltbot-Nubabel Bridge Service
 *
 * Maintains WebSocket connection to Moltbot and routes messages bidirectionally.
 */

import WebSocket from "ws";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import { verifySignature } from "./security";

const MOLTBOT_WS_URL = process.env.MOLTBOT_WS_URL || "ws://127.0.0.1:18789";
const MOLTBOT_AUTH_TOKEN = process.env.MOLTBOT_AUTH_TOKEN;
const MOLTBOT_SIGNATURE_SECRET = process.env.MOLTBOT_SIGNATURE_SECRET;
const RECONNECT_INTERVAL = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 30000;

interface MoltbotMessage {
  type: "req" | "res" | "event";
  method?: string;
  params?: Record<string, any>;
  id?: string;
  result?: any;
  error?: any;
  signature?: string;  // HMAC signature for verification
}

interface ChatEvent {
  channel: string;
  from: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
  signature?: string;
}

export class MoltbotBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestId = 0;

  async start(): Promise<void> {
    if (!MOLTBOT_WS_URL) {
      logger.info("Moltbot bridge disabled (MOLTBOT_WS_URL not set)");
      return;
    }
    await this.connect();
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge shutdown"));
    }
    this.pendingRequests.clear();
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info("Connecting to Moltbot WebSocket", { url: MOLTBOT_WS_URL });
        this.ws = new WebSocket(MOLTBOT_WS_URL);

        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new Error("Connection timeout"));
          }
        }, 10000);

        this.ws.on("open", async () => {
          clearTimeout(connectionTimeout);
          logger.info("Connected to Moltbot WebSocket");

          try {
            // Authenticate
            await this.send({
              type: "req",
              method: "connect",
              params: {
                auth: { token: MOLTBOT_AUTH_TOKEN },
                capabilities: ["chat", "presence"],
              },
            });

            // Subscribe to chat events
            await this.send({
              type: "req",
              method: "subscribe",
              params: { events: ["chat", "presence"] },
            });

            this.connected = true;
            this.reconnectAttempts = 0;
            this.emit("connected");
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", (code, reason) => {
          this.connected = false;
          logger.warn("Moltbot WebSocket closed", { code, reason: reason.toString() });
          this.emit("disconnected");
          this.scheduleReconnect();
        });

        this.ws.on("error", (error) => {
          logger.error("Moltbot WebSocket error", { error: error.message });
          if (!this.connected) {
            clearTimeout(connectionTimeout);
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max reconnect attempts reached, giving up");
      this.emit("reconnect_failed");
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_INTERVAL * Math.min(this.reconnectAttempts, 5); // Exponential backoff, max 5x

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      logger.info("Attempting to reconnect to Moltbot", { attempt: this.reconnectAttempts });
      try {
        await this.connect();
      } catch (error) {
        logger.error("Reconnect failed", { error: error instanceof Error ? error.message : String(error) });
        this.scheduleReconnect();
      }
    }, delay);
  }

  private handleMessage(raw: string): void {
    try {
      const msg: MoltbotMessage = JSON.parse(raw);

      // Handle responses to our requests
      if (msg.type === "res" && msg.id) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message || "Unknown error"));
          } else {
            pending.resolve(msg.result);
          }
        }
        return;
      }

      // Handle chat events - verify signature if configured
      if (msg.type === "event" && msg.method === "chat") {
        const event = msg.params as ChatEvent;

        if (MOLTBOT_SIGNATURE_SECRET && !verifySignature(event, event.signature, MOLTBOT_SIGNATURE_SECRET)) {
          logger.warn("Rejected chat event with invalid signature", {
            channel: event.channel,
            from: event.from,
          });
          return;
        }

        this.handleChatEvent(event);
        return;
      }
    } catch (error) {
      logger.error("Failed to parse Moltbot message", { raw: raw.substring(0, 200), error });
    }
  }

  private async handleChatEvent(event: ChatEvent): Promise<void> {
    logger.info("Received chat event from Moltbot", {
      channel: event.channel,
      from: event.from,
    });

    // Emit event for handler to process
    this.emit("chat", {
      channel: event.channel,
      userId: event.from,
      message: event.message,
      timestamp: event.timestamp,
      metadata: event.metadata,
    });
  }

  async send(msg: MoltbotMessage): Promise<any> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected to Moltbot");
    }

    const id = `nubabel_${++this.requestId}`;
    msg.id = id;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  async sendMessage(channel: string, to: string, message: string): Promise<void> {
    await this.send({
      type: "req",
      method: "send",
      params: {
        channel,
        to,
        message,
        idempotencyKey: `nubabel_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      },
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let bridgeInstance: MoltbotBridge | null = null;

export function getMoltbotBridge(): MoltbotBridge {
  if (!bridgeInstance) {
    bridgeInstance = new MoltbotBridge();
  }
  return bridgeInstance;
}

export async function startMoltbotBridge(): Promise<void> {
  const bridge = getMoltbotBridge();
  await bridge.start();
}

export async function stopMoltbotBridge(): Promise<void> {
  if (bridgeInstance) {
    await bridgeInstance.stop();
    bridgeInstance = null;
  }
}
```

**Effort**: 6-8 hours

#### Step 3.4: Create Security Utilities

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/services/moltbot-bridge/security.ts` (NEW)

```typescript
/**
 * Moltbot Bridge Security Utilities
 *
 * Handles signature verification and rate limiting for incoming messages.
 */

import crypto from "crypto";
import { logger } from "../../utils/logger";

/**
 * Verify HMAC signature of incoming message.
 * Signature should be: HMAC-SHA256(JSON.stringify(payload), secret)
 */
export function verifySignature(
  payload: object,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    logger.error("Signature verification error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Generate signature for outgoing message.
 */
export function generateSignature(payload: object, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Simple in-memory rate limiter for bridge messages.
 *
 * Note: For production, consider using Redis-backed rate limiting
 * via the existing rate-limiter service.
 */
export class BridgeRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private requests: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(options: { windowMs?: number; maxRequests?: number } = {}) {
    this.windowMs = options.windowMs ?? 60000; // 1 minute
    this.maxRequests = options.maxRequests ?? 30; // 30 requests per minute
  }

  /**
   * Check if a request should be allowed.
   * @param key - Unique identifier (e.g., "channel:userId")
   * @returns true if allowed, false if rate limited
   */
  check(key: string): boolean {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now >= record.resetAt) {
      this.requests.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Clean up expired entries (call periodically).
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.requests) {
      if (now >= record.resetAt) {
        this.requests.delete(key);
      }
    }
  }
}

// Global rate limiter instance
export const bridgeRateLimiter = new BridgeRateLimiter({
  windowMs: 60000,    // 1 minute window
  maxRequests: 30,    // 30 messages per user per minute
});

// Cleanup expired entries every 5 minutes
setInterval(() => {
  bridgeRateLimiter.cleanup();
}, 5 * 60 * 1000);
```

**Effort**: 2 hours

#### Step 3.5: Create Bridge Message Handler

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/services/moltbot-bridge/handler.ts` (NEW)

```typescript
/**
 * Moltbot Bridge Message Handler
 *
 * Processes incoming messages from Moltbot channels and routes to Nubabel orchestrator.
 */

import { getMoltbotBridge } from "./index";
import { externalUserService } from "../external-user";
import { delegateTask } from "../../orchestrator/delegate-task";
import { agentRegistry } from "../../orchestrator/agent-registry";
import { logger } from "../../utils/logger";
import { sseService } from "../sse-service";
import { bridgeRateLimiter } from "./security";

interface IncomingMessage {
  channel: string;  // "whatsapp", "telegram", "discord", etc.
  userId: string;   // User identifier on that channel
  message: string;  // The actual message content
  timestamp: string;
  metadata?: Record<string, any>;
}

// Whether to auto-provision external users or require registration
const AUTO_PROVISION_USERS = process.env.MOLTBOT_AUTO_PROVISION_USERS === "true";

// Default organization for external users (must be set for auto-provision)
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID;

// Generate unique session ID for channel conversations
function getSessionId(channel: string, userId: string): string {
  return `moltbot_${channel}_${userId}`;
}

export async function handleMoltbotMessage(msg: IncomingMessage): Promise<void> {
  const { channel, userId, message } = msg;
  const sessionId = getSessionId(channel, userId);

  logger.info("Processing Moltbot message", {
    channel,
    userId: userId.substring(0, 8) + "...", // Truncate for privacy
    sessionId,
    messageLength: message.length,
  });

  // Rate limiting check
  const rateLimitKey = `${channel}:${userId}`;
  if (!bridgeRateLimiter.check(rateLimitKey)) {
    logger.warn("Rate limited Moltbot message", { channel, userId: userId.substring(0, 8) });

    const bridge = getMoltbotBridge();
    await bridge.sendMessage(
      channel,
      userId,
      "You're sending messages too quickly. Please wait a moment and try again."
    );
    return;
  }

  try {
    // Resolve external user to Nubabel user
    const resolved = await externalUserService.resolve({
      channel,
      externalUserId: userId,
      organizationId: DEFAULT_ORG_ID,
      displayName: msg.metadata?.displayName,
      metadata: msg.metadata,
      autoProvision: AUTO_PROVISION_USERS,
    });

    if (!resolved) {
      // User not registered and auto-provision disabled
      logger.info("Unregistered external user rejected", { channel, userId: userId.substring(0, 8) });

      const bridge = getMoltbotBridge();
      await bridge.sendMessage(
        channel,
        userId,
        "Please register at nubabel.com and link your account to use this service. " +
        "Visit your profile settings to generate a linking code."
      );
      return;
    }

    const { userId: nubabelUserId, organizationId } = resolved;

    // Log if new user was provisioned
    if (resolved.isNewUser) {
      logger.info("New external user provisioned", {
        nubabelUserId,
        channel,
        organizationId,
      });
    }

    // Get default agent for this organization
    const defaultAgent = agentRegistry.getAgent("general-agent");
    if (!defaultAgent) {
      throw new Error("Default agent (general-agent) not found");
    }

    // Process through Nubabel orchestrator
    const startTime = Date.now();

    const result = await delegateTask({
      category: defaultAgent.category,
      load_skills: defaultAgent.skills,
      prompt: `${defaultAgent.systemPrompt}\n\n---\n\nUser Request: ${message}`,
      session_id: sessionId,
      organizationId,
      context: {
        source: "moltbot",
        channel,
        externalUserId: userId,
        isExternalUser: true,
        mappingVerified: resolved.mapping.verified,
      },
    });

    const duration = Date.now() - startTime;

    // Send response back via Moltbot
    const bridge = getMoltbotBridge();
    await bridge.sendMessage(channel, userId, result.output);

    // Emit SSE event for dashboard visibility
    sseService.emit(organizationId, "moltbot:response", {
      channel,
      sessionId,
      status: result.status,
      duration,
      userId: nubabelUserId,
    });

    logger.info("Moltbot message processed", {
      sessionId,
      status: result.status,
      duration,
      isNewUser: resolved.isNewUser,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to process Moltbot message", { error: errorMessage, sessionId });

    // Send error response
    try {
      const bridge = getMoltbotBridge();
      await bridge.sendMessage(
        channel,
        userId,
        "Sorry, I encountered an error processing your request. Please try again."
      );
    } catch (sendError) {
      logger.error("Failed to send error response", {
        error: sendError instanceof Error ? sendError.message : String(sendError)
      });
    }
  }
}

// Initialize handler when bridge connects
export function initializeMoltbotHandler(): void {
  const bridge = getMoltbotBridge();

  bridge.on("chat", (msg: IncomingMessage) => {
    handleMoltbotMessage(msg).catch((error) => {
      logger.error("Unhandled error in Moltbot handler", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });

  bridge.on("connected", () => {
    logger.info("Moltbot handler ready");
  });

  bridge.on("disconnected", () => {
    logger.warn("Moltbot handler disconnected, will auto-reconnect");
  });

  bridge.on("reconnect_failed", () => {
    logger.error("Moltbot bridge reconnection failed permanently");
  });
}
```

**Effort**: 4-5 hours

#### Step 3.6: Start Bridge in Server Initialization

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/index.ts`

Add after Slack bot startup:

```typescript
import { startMoltbotBridge, stopMoltbotBridge } from "./services/moltbot-bridge";
import { initializeMoltbotHandler } from "./services/moltbot-bridge/handler";

// In server.listen callback, after startSlackBot():
if (process.env.MOLTBOT_WS_URL) {
  try {
    await startMoltbotBridge();
    initializeMoltbotHandler();
    logger.info("Moltbot Bridge started");
  } catch (error) {
    logger.warn("Failed to start Moltbot Bridge (continuing without multi-channel)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// In gracefulShutdown():
if (process.env.MOLTBOT_WS_URL) {
  logger.info("Stopping Moltbot Bridge");
  await stopMoltbotBridge();
  logger.info("Moltbot Bridge stopped");
}
```

**Effort**: 30 minutes

#### Step 3.7: Add User Linking API Endpoints

**File**: `/Users/sean/Documents/Kyndof/tools/nubabel/src/api/channel-linking.ts` (NEW)

```typescript
/**
 * Channel Linking API
 *
 * Endpoints for users to link their external channel accounts.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { externalUserService } from "../services/external-user";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import crypto from "crypto";

const router = Router();

// Store for temporary linking codes (in production, use Redis)
const linkingCodes = new Map<string, {
  userId: string;
  organizationId: string;
  expiresAt: number;
}>();

/**
 * POST /api/channel-linking/generate-code
 * Generate a one-time code for linking an external channel.
 */
router.post("/generate-code", requireAuth(), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.organizationId!;

    // Generate 6-character alphanumeric code
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();

    // Store with 10-minute expiry
    linkingCodes.set(code, {
      userId,
      organizationId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Clean up expired codes
    for (const [key, value] of linkingCodes) {
      if (Date.now() > value.expiresAt) {
        linkingCodes.delete(key);
      }
    }

    return res.json({
      code,
      expiresIn: 600, // 10 minutes
      instructions: "Send this code as a message in your chat app to link your account.",
    });
  } catch (error) {
    logger.error("Failed to generate linking code", { error });
    return res.status(500).json({ error: "Failed to generate linking code" });
  }
});

/**
 * POST /api/channel-linking/verify
 * Verify a linking code (called by bridge when user sends code).
 * Internal API - not exposed to external users.
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { code, channel, externalUserId, displayName } = req.body;

    // Verify internal API key
    const internalKey = req.headers["x-internal-api-key"];
    if (internalKey !== process.env.INTERNAL_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!code || !channel || !externalUserId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const codeData = linkingCodes.get(code.toUpperCase());
    if (!codeData) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    if (Date.now() > codeData.expiresAt) {
      linkingCodes.delete(code.toUpperCase());
      return res.status(400).json({ error: "Code has expired" });
    }

    // Link the external user
    const result = await externalUserService.link({
      userId: codeData.userId,
      organizationId: codeData.organizationId,
      channel,
      externalUserId,
      displayName,
    });

    // Remove used code
    linkingCodes.delete(code.toUpperCase());

    return res.json({
      success: true,
      message: "Account linked successfully",
      userId: result.userId,
    });
  } catch (error) {
    logger.error("Failed to verify linking code", { error });
    return res.status(500).json({ error: "Failed to verify linking code" });
  }
});

/**
 * GET /api/channel-linking/linked-accounts
 * Get user's linked external accounts.
 */
router.get("/linked-accounts", requireAuth(), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const mappings = await db.externalUserMapping.findMany({
      where: { userId },
      select: {
        id: true,
        channel: true,
        displayName: true,
        verified: true,
        createdAt: true,
      },
    });

    return res.json({ accounts: mappings });
  } catch (error) {
    logger.error("Failed to get linked accounts", { error });
    return res.status(500).json({ error: "Failed to get linked accounts" });
  }
});

/**
 * DELETE /api/channel-linking/:mappingId
 * Unlink an external account.
 */
router.delete("/:mappingId", requireAuth(), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { mappingId } = req.params;

    // Verify ownership
    const mapping = await db.externalUserMapping.findFirst({
      where: {
        id: mappingId,
        userId,
      },
    });

    if (!mapping) {
      return res.status(404).json({ error: "Linked account not found" });
    }

    await db.externalUserMapping.delete({
      where: { id: mappingId },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error("Failed to unlink account", { error });
    return res.status(500).json({ error: "Failed to unlink account" });
  }
});

export default router;
```

**Effort**: 3-4 hours

#### Step 3.8: Add Environment Variables

**File**: `.env.example` (update)

```bash
# Moltbot Bridge (Phase 3)
MOLTBOT_WS_URL=ws://127.0.0.1:18789
MOLTBOT_AUTH_TOKEN=your-auth-token-here
MOLTBOT_SIGNATURE_SECRET=your-shared-secret-for-hmac
MOLTBOT_AUTO_PROVISION_USERS=false  # Set to 'true' to auto-create users

# Default organization for external users (required if auto-provision enabled)
DEFAULT_ORG_ID=your-default-org-uuid

# Internal API key for bridge-to-api communication
INTERNAL_API_KEY=your-internal-api-key
```

**Security Notes**:
1. **Token Storage**: All tokens stored in environment variables should be loaded from a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) in production - NOT from plain `.env` files.
2. **MOLTBOT_SIGNATURE_SECRET**: Must be shared between Moltbot and Nubabel for request verification. Generate with: `openssl rand -hex 32`
3. **INTERNAL_API_KEY**: Used only for internal bridge-to-API communication, not exposed externally.

**Effort**: 15 minutes

### Phase 3 Deliverables
- [ ] ExternalUserMapping database table with proper relations
- [ ] External user service with auto-provisioning
- [ ] MoltbotBridge WebSocket client with reconnection
- [ ] Security utilities (signature verification, rate limiting)
- [ ] Message handler for incoming messages
- [ ] Server startup/shutdown integration
- [ ] User linking API endpoints
- [ ] Integration tests
- [ ] Operational documentation

### Phase 3 Acceptance Criteria
1. Message on WhatsApp → Nubabel processes → Response on WhatsApp
2. Message on Telegram from same user → Shares session context
3. Nubabel admin can see all channel activity in dashboard
4. Budget enforcement applies to all channels
5. Signature verification rejects tampered messages
6. Rate limiting prevents abuse
7. User linking flow works end-to-end

---

## Effort Estimates Summary (REVISED)

| Phase | Component | Effort |
|-------|-----------|--------|
| **Phase 1** | Verify/fix API key service (Step 1.0) | 15 min - 2 hours* |
| | Enable V1 API | 5 min |
| | Generate API key | 15 min |
| | Configure Moltbot | 30 min |
| | Testing & verification | 1 hour |
| | **Phase 1 Total** | **~2-4 hours*** |

*\* Step 1.0 effort depends on API key service state: 15 min for Option B (env var hack), 1-2 hours for Option A (complete the service)*
| **Phase 2** | Moltbot MCP server | 4-6 hours |
| | Tool definitions | 2-3 hours |
| | Skill selector updates | 1 hour |
| | Type updates | 15 min |
| | Environment config | 15 min |
| | Integration testing | 4-6 hours |
| | **Phase 2 Total** | **~12-16 hours (2-3 days)** |
| **Phase 3** | Database migration & relations | 1 hour |
| | External user service | 4-5 hours |
| | Bridge service | 6-8 hours |
| | Security utilities | 2 hours |
| | Message handler | 4-5 hours |
| | Server integration | 30 min |
| | User linking API | 3-4 hours |
| | User linking UI | 4-6 hours |
| | Integration testing | 6-8 hours |
| | Documentation | 2-3 hours |
| | **Phase 3 Total** | **~35-45 hours (3-4 weeks)** |

**Grand Total**: ~50-65 hours for complete implementation

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Moltbot API changes | Low | High | Version pin, monitor releases, integration tests |
| WebSocket instability | Medium | Medium | Circuit breaker, auto-reconnect with backoff |
| Rate limiting by channels | Medium | Medium | Queue outbound messages, per-channel limits |
| Session state loss | Low | Medium | Persist to Redis (use existing cache) |
| Authentication gaps | Medium | High | Require user linking for sensitive ops, signature verification |
| Database migration failures | Low | High | Test migration on staging first, backup before deploy |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User confusion (two bots) | Medium | Low | Clear naming, unified branding |
| Support complexity | Medium | Medium | Document flows, train support, add logging |
| Cost overruns (token usage) | Medium | High | Budget enforcement at bridge level, per-user limits |
| External user abuse | Medium | High | Rate limiting, require verification for sensitive operations |

### Security Considerations

1. **Token Storage**: Store all tokens (MOLTBOT_AUTH_TOKEN, SIGNATURE_SECRET) in a secrets manager, NOT environment files
2. **Signature Verification**: ALWAYS verify incoming message signatures when MOLTBOT_SIGNATURE_SECRET is configured
3. **Rate Limiting**: Apply per-user rate limits at bridge level (30/min default)
4. **User Verification**: Require phone/email verification before linking accounts
5. **Audit Logging**: Log all cross-channel operations with user context
6. **Data Isolation**: Ensure multi-tenant separation via organizationId in all queries
7. **External User Permissions**: External users get limited "external" role with restricted permissions

---

## Success Metrics

### Phase 1 Success Criteria
- [ ] API endpoint responds in <100ms (excluding AI processing)
- [ ] 0 failed requests due to configuration issues
- [ ] Budget tracking correctly records cross-channel usage

### Phase 2 Success Criteria
- [ ] Moltbot skills callable from Slack with <2s overhead
- [ ] Circuit breaker activates on Moltbot downtime
- [ ] 95% skill invocation success rate
- [ ] Request signatures verified (if configured)

### Phase 3 Success Criteria
- [ ] <500ms message routing latency (excluding AI processing)
- [ ] 99.5% message delivery rate
- [ ] Auto-reconnect within 30s of disconnection
- [ ] Dashboard shows real-time multi-channel activity
- [ ] Rate limiting correctly enforced
- [ ] Signature verification blocks invalid messages

### Business Success Criteria
- [ ] 3+ external channels active within 1 week of Phase 3
- [ ] 100+ messages processed via bridge within 1 month
- [ ] No security incidents related to integration
- [ ] <5% of messages rejected due to rate limiting (indicates proper limits)

---

## Implementation Checklist

### Pre-Implementation
- [ ] Verify Moltbot is running on target machine
- [ ] Test Moltbot HTTP API manually (`curl http://127.0.0.1:18789/skills`)
- [ ] Review Nubabel V1 API routes for completeness
- [ ] Set up development environment with both services
- [ ] Configure secrets manager for token storage

### Phase 1
- [ ] Verify API key service status (`/src/services/api-keys.ts`)
- [ ] Complete API key service (Option A) OR configure env var auth (Option B)
- [ ] Uncomment V1 API import and route (2 lines)
- [ ] Generate API key or configure MOLTBOT_API_KEY env var
- [ ] Configure Moltbot webhook to call `/api/v1/agents/general-agent/execute`
- [ ] Test end-to-end flow
- [ ] Verify budget tracking
- [ ] Document configuration

### Phase 2
- [ ] Create `/src/mcp-servers/moltbot/index.ts` following Nubabel patterns
- [ ] Create `/src/mcp-servers/moltbot/tools.ts` with tool definitions
- [ ] Add skill keywords to skill-selector.ts
- [ ] Update type definitions
- [ ] Add environment variables
- [ ] Write integration tests
- [ ] Document available Moltbot skills

### Phase 3
- [ ] Create `/src/services/external-user.ts`
- [ ] Add ExternalUserMapping to schema.prisma
- [ ] Add relation to User model
- [ ] Run database migration
- [ ] Create `/src/services/moltbot-bridge/index.ts`
- [ ] Create `/src/services/moltbot-bridge/security.ts`
- [ ] Create `/src/services/moltbot-bridge/handler.ts`
- [ ] Create `/src/api/channel-linking.ts`
- [ ] Integrate bridge with server startup/shutdown
- [ ] Add all environment variables
- [ ] Write comprehensive tests
- [ ] Create operational runbook

### Post-Implementation
- [ ] Monitor error rates for 1 week
- [ ] Review audit logs for anomalies
- [ ] Gather user feedback
- [ ] Optimize based on metrics
- [ ] Document lessons learned

---

## Commit Strategy

### Phase 1 Commits
```
feat(api): enable V1 public API for external integrations

- Uncomment v1ApiRouter import and route
- Add documentation for API key generation
- Configure general-agent as default endpoint
```

### Phase 2 Commits
```
feat(mcp): add Moltbot MCP server for multi-channel skills

- Create MoltbotProvider following Nubabel patterns
- Use executeTool/validateToolAccess from mcp-registry
- Return ToolCallResult<T> as per mcp/types
- Add circuit breaker and signature verification
```

```
feat(mcp): add Moltbot tool definitions

- Define voice, browser, canvas, messaging tools
- Add proper input/output schemas
- Configure permissions and approval requirements
```

```
feat(orchestrator): add Moltbot skill keywords

- Add moltbot-voice, moltbot-browser, moltbot-canvas skills
- Update skill selector with new keywords
- Update Skill type definition
```

### Phase 3 Commits
```
feat(db): add external user mapping for multi-channel users

- Add ExternalUserMapping model with proper relations
- Support multi-tenant scenarios (org-scoped unique constraint)
- Add relation to User model
```

```
feat(service): add external user resolution service

- Implement auto-provisioning for external users
- Create proper User records (not fabricated IDs)
- Support user linking flow
- Add caching for performance
```

```
feat(bridge): add Moltbot-Nubabel bidirectional bridge

- Create WebSocket client with auto-reconnect
- Handle incoming chat events from all channels
- Route responses back through Moltbot
- Add signature verification for security
- Implement rate limiting
```

```
feat(api): add channel linking endpoints

- Generate linking codes for users
- Verify codes from bridge
- List/delete linked accounts
```

---

## PLAN_READY

This plan has been revised to address all Critic feedback:

**Fixed Issues:**
1. **API Key Service Prerequisite (ITERATION 3)** - Added Step 1.0 to verify and fix the stub API key service before enabling V1 API. Provides two options: complete the service (recommended) or use env var auth (quick hack)
2. **MCP Architecture** - Now uses function-based `executeMoltbotTool()` pattern matching `/src/mcp-servers/notion/index.ts`, uses `ToolCallResult<T>` from `/src/mcp/types.ts`, no fake `registerProvider()` calls
3. **User Model Relation** - Added `externalUserMappings` relation to User model
4. **User ID Generation** - Replaced fabricated IDs with proper User record creation via transaction
5. **Agent ID Clarification** - Listed all available agents from `/config/agents/*.yaml`, recommended `general-agent`
6. **Effort Estimates** - Revised to realistic values: Phase 1 = 2-4 hours (depending on API key service state), Phase 2 = 12-16 hours, Phase 3 = 35-45 hours
7. **Security Gaps** - Added signature verification, clarified token storage (secrets manager, not env vars), added rate limiting
8. **Multi-Tenant ExternalUserMapping** - Changed constraint to `@@unique([channel, externalUserId, organizationId])`

**Key Points for Final Review:**
1. Phase 1 now has a mandatory prerequisite check (Step 1.0) for the API key service
2. All code samples follow actual Nubabel patterns from existing MCP servers
3. External users get actual User records with limited "external" role
4. Security is defense-in-depth: signatures, rate limits, verification
5. Effort estimates include testing and documentation time
6. All phases remain independently deployable
