# Multi-Agent Orchestration System Plan

## Executive Summary

Design a Claude Code-based multi-agent orchestration system for Nubabel that leverages Claude Max subscriptions (zero API cost) with per-agent differentiation (MCP servers, tools, credentials, permissions, org hierarchy) and real-time monitoring via Web UI and Slack.

---

## Architecture Overview

```
+----------------------------------------------------------------------------------+
|                         NUBABEL MULTI-AGENT ORCHESTRATION                        |
+----------------------------------------------------------------------------------+
|                                                                                   |
|  +-------------------------------------------------------------------------+     |
|  |                        REAL-TIME MONITORING LAYER                        |     |
|  |  +--------------+  +--------------+  +------------------------------+  |     |
|  |  |   Web UI     |  |    Slack     |  |     SSE/WebSocket Hub        |  |     |
|  |  |  Dashboard   |  |   Updates    |  |   (Redis Pub/Sub backbone)   |  |     |
|  |  +--------------+  +--------------+  +------------------------------+  |     |
|  +-------------------------------------------------------------------------+     |
|                                         |                                         |
|  +-------------------------------------------------------------------------+     |
|  |                      AGENT ORCHESTRATION LAYER                           |     |
|  |                                                                           |     |
|  |  +-------------------------------------------------------------+    |     |
|  |  |                  AGENT SUPERVISOR SERVICE                        |    |     |
|  |  |  * Agent lifecycle management                                    |    |     |
|  |  |  * Task routing & delegation                                     |    |     |
|  |  |  * Hierarchical coordination (org chart)                         |    |     |
|  |  |  * Permission enforcement                                        |    |     |
|  |  +-------------------------------------------------------------+    |     |
|  |                              |                                           |     |
|  |  +----------+  +----------+  |  +----------+  +----------+             |     |
|  |  | Agent A  |  | Agent B  |  |  | Agent C  |  | Agent D  |             |     |
|  |  | (CEO)    |  | (PM)     |  |  | (Dev)    |  | (QA)     |             |     |
|  |  |          |  |          |  |  |          |  |          |             |     |
|  |  | MCP: X,Y |  | MCP: Y,Z |  |  | MCP: A,B |  | MCP: C   |             |     |
|  |  | Perms: * |  | Perms: r |  |  | Perms: rw|  | Perms: r |             |     |
|  |  +----------+  +----------+  |  +----------+  +----------+             |     |
|  |                              |                                           |     |
|  +-------------------------------------------------------------------------+     |
|                                         |                                         |
|  +-------------------------------------------------------------------------+     |
|  |                      CLAUDE CLI EXECUTION LAYER                          |     |
|  |                                                                           |     |
|  |  +-------------------------------------------------------------+    |     |
|  |  |           CLAUDE CLI BRIDGE (Enhanced)                           |    |     |
|  |  |  * Spawns `claude --print` processes per agent                   |    |     |
|  |  |  * Injects per-agent CLAUDE.md & MCP configs                     |    |     |
|  |  |  * Streams output via SSE                                        |    |     |
|  |  |  * Manages concurrent agent executions                           |    |     |
|  |  +-------------------------------------------------------------+    |     |
|  |                              |                                           |     |
|  |  +-------------------------------------------------------------+    |     |
|  |  |           CLAUDE MAX ACCOUNT POOL                                |    |     |
|  |  |  * N accounts per organization                                   |    |     |
|  |  |  * Drain-rate based selection                                    |    |     |
|  |  |  * Rate limit detection & rotation                               |    |     |
|  |  |  * Usage estimation & quota tracking                             |    |     |
|  |  +-------------------------------------------------------------+    |     |
|  |                                                                           |     |
|  +-------------------------------------------------------------------------+     |
|                                         |                                         |
|  +-------------------------------------------------------------------------+     |
|  |                      PER-AGENT CONFIGURATION LAYER                       |     |
|  |                                                                           |     |
|  |  +----------------+  +----------------+  +------------------------+     |     |
|  |  | Agent Profile  |  | MCP Server     |  | Credential Vault       |     |     |
|  |  | Store          |  | Registry       |  | (per-agent tokens)     |     |     |
|  |  |                |  |                |  |                        |     |     |
|  |  | * Role         |  | * Tool sets    |  | * Notion tokens        |     |     |
|  |  | * Hierarchy    |  | * Permissions  |  | * Linear tokens        |     |     |
|  |  | * System prompt|  | * Scopes       |  | * GitHub tokens        |     |     |
|  |  | * CLAUDE.md    |  |                |  | * Custom integrations  |     |     |
|  |  +----------------+  +----------------+  +------------------------+     |     |
|  |                                                                           |     |
|  +-------------------------------------------------------------------------+     |
|                                                                                   |
+----------------------------------------------------------------------------------+
```

---

## CRITICAL: Existing Model Analysis & Resolution

### Issue #1: Existing `Agent` Model Conflict

**Current State:** An `Agent` model already exists at `prisma/schema.prisma:208-240` with fields:
- `id`, `organizationId`, `name`, `type` (permanent/temporary/contractor)
- `role`, `managerId`, `teamId`, `skills[]`
- `sessionId`, `hiredAt`, `contractEnd`, `projectId`, `status`

**Resolution: EXTEND, not replace.**

The existing `Agent` model represents **agent identity** (who the agent is, team membership, employment type). The new `AgentProfile` fields represent **agent configuration** (how the agent executes - CLAUDE.md, MCP configs, credentials).

**Strategy: Add configuration fields directly to existing `Agent` model.**

```prisma
// EXTEND existing Agent model (prisma/schema.prisma:208-240)
model Agent {
  // === EXISTING FIELDS (unchanged) ===
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String    @db.VarChar(100)
  type           String    @db.VarChar(50) // permanent, temporary, contractor
  role           String    @db.Text
  managerId      String?   @map("manager_id") @db.Uuid
  teamId         String?   @map("team_id") @db.Uuid
  skills         String[]  @db.VarChar(100)
  sessionId      String?   @map("session_id") @db.VarChar(255)
  hiredAt        DateTime  @default(now()) @map("hired_at") @db.Timestamptz(6)
  contractEnd    DateTime? @map("contract_end") @db.Timestamptz(6)
  projectId      String?   @map("project_id") @db.Uuid
  status         String    @default("active") @db.VarChar(50)
  metadata       Json      @default("{}") @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // === NEW FIELDS (orchestration configuration) ===
  displayName     String?   @map("display_name") @db.VarChar(255)  // "Alex (CEO)"
  avatar          String?   @db.Text  // Avatar URL or emoji
  position        String?   @db.VarChar(100)  // "CEO", "Product Manager"
  department      String?   @db.VarChar(100)  // "Engineering", "Product"

  // Permission level for orchestration
  permissionLevel String   @default("member") @map("permission_level") @db.VarChar(50)
  // "owner" | "admin" | "member" | "viewer" | "restricted"

  // Claude CLI Configuration (per-agent execution settings)
  claudeMdContent String?  @map("claude_md_content") @db.Text  // Per-agent CLAUDE.md override
  mcpConfigJson   Json?    @map("mcp_config_json") @db.JsonB   // MCP server configs
  toolAllowlist   String[] @default([]) @map("tool_allowlist") @db.VarChar(100)
  toolDenylist    String[] @default([]) @map("tool_denylist") @db.VarChar(100)

  // Execution preferences
  preferredModel  String?  @map("preferred_model") @db.VarChar(50)
  maxTokenBudget  Int?     @map("max_token_budget")
  maxConcurrency  Int      @default(1) @map("max_concurrency")

  lastActiveAt    DateTime? @map("last_active_at") @db.Timestamptz(6)

  // === EXISTING RELATIONS (unchanged) ===
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  manager      Agent?       @relation("AgentHierarchy", fields: [managerId], references: [id])
  subordinates Agent[]      @relation("AgentHierarchy")
  team         Team?        @relation(fields: [teamId], references: [id])
  skillAssignments AgentSkillAssignment[]

  // === NEW RELATIONS ===
  credentials    AgentCredential[]
  mcpAssignments AgentMCPAssignment[]
  executions     AgentExecution[]

  @@index([organizationId])
  @@index([managerId])
  @@index([teamId])
  @@index([type])
  @@index([status])
  @@index([department])
  @@map("agents")
}
```

**Migration Strategy:**
1. Add new columns as nullable with defaults
2. No data migration needed - existing agents get default values
3. Existing functionality continues working unchanged

---

### Issue #2: AgentExecution vs AgentActivity Overlap

**Current State:** `AgentActivity` model exists at `prisma/schema.prisma:479-519` and `agent-activity.service.ts` tracks:
- `agentType`, `agentName`, `sessionId`, `parentActivityId`
- `taskDescription`, `category`, `skills[]`
- `status`, `progress`, `currentStep`
- `startedAt`, `completedAt`, `durationMs`
- `inputData`, `outputData`, `errorMessage`
- Slack visibility fields

**Resolution: DISTINCT PURPOSES**

| Model | Purpose | Scope | Lifecycle |
|-------|---------|-------|-----------|
| `AgentActivity` | **Session-level tracking** for OMC agent types (sisyphus, oracle, executor, etc.) | Generic OMC agents | Per-delegation within a session |
| `AgentExecution` | **Agent-profile execution** for named organizational agents with full config context | Named org agents (CEO-Alex, PM-Sarah) | Full CLI execution with streaming |

**Key Distinctions:**

| Field | AgentActivity | AgentExecution |
|-------|---------------|----------------|
| Agent identity | `agentType` (OMC type) | `agentId` (FK to Agent) |
| Configuration | None | Full CLAUDE.md + MCP config snapshot |
| Streaming | Not tracked | `streamChunks[]` for replay |
| Tool calls | Not tracked | `toolCalls[]` with timing |
| Account tracking | `claudeMaxAccountId` | `claudeMaxAccountId` |
| Hierarchy | `parentActivityId` | `parentExecutionId` |

**Integration Strategy:**
1. When an **organizational agent** (from `Agent` table) executes, create `AgentExecution`
2. When an **OMC agent type** (sisyphus, executor, etc.) runs, use existing `AgentActivity`
3. `AgentExecution` CAN reference `AgentActivity` via `linkedActivityId` for correlation
4. ActivityHub service publishes to BOTH systems

```prisma
model AgentExecution {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  agentId        String   @map("agent_id") @db.Uuid  // FK to Agent (not AgentProfile!)

  // Link to AgentActivity for correlation (optional)
  linkedActivityId String? @map("linked_activity_id") @db.Uuid

  // Session tracking
  sessionId      String   @map("session_id") @db.VarChar(255)
  parentExecutionId String? @map("parent_execution_id") @db.Uuid

  // Execution details
  taskDescription String   @map("task_description") @db.Text
  status         String   @default("pending") @db.VarChar(50)
  // pending, running, streaming, completed, failed, cancelled

  // Progress tracking
  progressPercent Int      @default(0) @map("progress_percent")
  currentAction   String?  @map("current_action") @db.Text

  // Configuration snapshot at execution time
  configSnapshot  Json     @map("config_snapshot") @db.JsonB
  // { claudeMdContent, mcpConfig, toolAllowlist, toolDenylist }

  // Claude Max account used
  claudeMaxAccountId String? @map("claude_max_account_id") @db.Uuid

  // Timing
  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(6)
  durationMs     Int?      @map("duration_ms")

  // Input/Output
  inputData      Json?     @map("input_data") @db.JsonB
  outputData     Json?     @map("output_data") @db.JsonB
  streamChunks   Json[]    @default([]) @map("stream_chunks") @db.JsonB

  // Tool usage tracking
  toolCalls      Json[]    @default([]) @map("tool_calls") @db.JsonB

  // Error tracking
  errorMessage   String?   @map("error_message") @db.Text
  errorType      String?   @map("error_type") @db.VarChar(50)

  // Slack/UI visibility
  slackChannelId String?   @map("slack_channel_id") @db.VarChar(50)
  slackThreadTs  String?   @map("slack_thread_ts") @db.VarChar(50)
  slackMessageTs String?   @map("slack_message_ts") @db.VarChar(50)

  metadata       Json      @default("{}") @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  agent           Agent           @relation(fields: [agentId], references: [id], onDelete: Cascade)
  parentExecution AgentExecution? @relation("ExecutionHierarchy", fields: [parentExecutionId], references: [id])
  childExecutions AgentExecution[] @relation("ExecutionHierarchy")

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([agentId, createdAt(sort: Desc)])
  @@index([sessionId])
  @@index([status])
  @@index([parentExecutionId])
  @@index([slackChannelId, slackThreadTs])
  @@map("agent_executions")
}
```

---

### Issue #3: Claude CLI Config Injection Mechanism

**Complete specification for per-agent config injection:**

#### Environment Variables

| Variable | Purpose | Set By |
|----------|---------|--------|
| `CLAUDE_CONFIG_DIR` | Override config directory | Agent executor |
| `ANTHROPIC_CONFIG_DIR` | Claude CLI uses this for settings | Agent executor |

#### Temp File Structure

```
/tmp/nubabel-agent-{executionId}/
  +-- CLAUDE.md              # Per-agent instructions
  +-- mcp_servers.json       # Per-agent MCP config
  +-- .env                   # Per-agent credentials (short-lived)
```

**File Naming Convention:**
- Base path: `/tmp/nubabel-agent-{executionId}/`
- `executionId` = UUID from `AgentExecution.id`
- Files created at execution start, deleted at completion/failure

#### Config Generator Implementation

```typescript
// src/services/claude-cli-bridge/config-generator.ts

interface AgentEnvironment {
  tempDir: string;
  claudeMdPath: string;
  mcpConfigPath: string;
  envVars: Record<string, string>;
}

class ConfigGenerator {
  private readonly TEMP_BASE = '/tmp/nubabel-agent';

  async createAgentEnvironment(
    agent: Agent,
    executionId: string,
    credentials: DecryptedCredential[]
  ): Promise<AgentEnvironment> {
    const tempDir = `${this.TEMP_BASE}-${executionId}`;
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });

    // 1. Generate CLAUDE.md
    const claudeMdPath = `${tempDir}/CLAUDE.md`;
    const claudeMdContent = this.buildClaudeMd(agent);
    await fs.writeFile(claudeMdPath, claudeMdContent, { mode: 0o600 });

    // 2. Generate MCP config
    const mcpConfigPath = `${tempDir}/mcp_servers.json`;
    const mcpConfig = await this.buildMcpConfig(agent, credentials);
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), { mode: 0o600 });

    // 3. Build environment variables
    const envVars: Record<string, string> = {
      ANTHROPIC_CONFIG_DIR: tempDir,
      CLAUDE_CONFIG_DIR: tempDir,
      // Credentials injected as env vars for MCP servers
      ...this.credentialsToEnvVars(credentials),
    };

    return { tempDir, claudeMdPath, mcpConfigPath, envVars };
  }

  async cleanup(tempDir: string): Promise<void> {
    try {
      // Secure delete: overwrite files before removing
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        const path = `${tempDir}/${file}`;
        const stat = await fs.stat(path);
        // Overwrite with random data
        await fs.writeFile(path, crypto.randomBytes(stat.size));
        await fs.unlink(path);
      }
      await fs.rmdir(tempDir);
    } catch (err) {
      logger.error('Failed to cleanup agent temp dir', { tempDir, error: err });
    }
  }

  private buildClaudeMd(agent: Agent): string {
    const baseContent = `# Agent: ${agent.displayName || agent.name}

## Role
${agent.role}

## Position
${agent.position || 'Team Member'}

## Department
${agent.department || 'General'}

## Skills
${agent.skills.join(', ')}

## Permissions
Level: ${agent.permissionLevel}

`;

    // Append agent-specific CLAUDE.md if exists
    if (agent.claudeMdContent) {
      return baseContent + '\n---\n\n' + agent.claudeMdContent;
    }
    return baseContent;
  }

  private async buildMcpConfig(
    agent: Agent,
    credentials: DecryptedCredential[]
  ): Promise<MCPServersConfig> {
    // Start with agent's stored MCP config
    const baseConfig = (agent.mcpConfigJson as MCPServersConfig) || { mcpServers: {} };

    // Inject credentials into appropriate MCP server configs
    for (const cred of credentials) {
      if (baseConfig.mcpServers[cred.provider]) {
        baseConfig.mcpServers[cred.provider].env = {
          ...baseConfig.mcpServers[cred.provider].env,
          ...this.credentialToMcpEnv(cred),
        };
      }
    }

    // Apply tool allowlist/denylist
    // (MCP SDK supports tool filtering in config)

    return baseConfig;
  }

  private credentialsToEnvVars(credentials: DecryptedCredential[]): Record<string, string> {
    const envVars: Record<string, string> = {};
    for (const cred of credentials) {
      // Standard naming: NUBABEL_{PROVIDER}_{TYPE}
      // e.g., NUBABEL_NOTION_TOKEN, NUBABEL_GITHUB_TOKEN
      const key = `NUBABEL_${cred.provider.toUpperCase()}_${cred.type.toUpperCase()}`;
      envVars[key] = cred.value;
    }
    return envVars;
  }
}
```

#### CLI Invocation

```typescript
// src/services/claude-cli-bridge/agent-executor.ts

async executeForAgent(
  agent: Agent,
  prompt: string,
  options: AgentExecutionOptions
): Promise<ExecutionResult> {
  const execution = await this.createExecution(agent, prompt);

  try {
    // 1. Resolve credentials for this agent
    const credentials = await this.credentialVault.getAgentCredentials(agent.id);

    // 2. Create isolated environment
    const env = await this.configGenerator.createAgentEnvironment(
      agent,
      execution.id,
      credentials
    );

    // 3. Spawn Claude CLI with injected config
    const process = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',  // We handle permissions at our layer
      prompt
    ], {
      cwd: options.workingDirectory || process.cwd(),
      env: {
        ...process.env,
        ...env.envVars,
        // Force Claude to use our config directory
        HOME: env.tempDir,  // Claude looks for ~/.claude/
      }
    });

    // 4. Stream output and track tool calls
    const result = await this.streamOutput(execution.id, process);

    return result;
  } finally {
    // 5. Cleanup temp files
    await this.configGenerator.cleanup(env.tempDir);
  }
}
```

#### Cleanup Strategy

| Event | Cleanup Action |
|-------|----------------|
| Execution completes | Immediate cleanup via `finally` block |
| Execution fails | Immediate cleanup via `finally` block |
| Process crash | Cleanup via process exit handler |
| Orphan detection | Cron job cleans `/tmp/nubabel-agent-*` older than 1 hour |

```typescript
// Orphan cleanup cron (runs every 30 minutes)
async cleanupOrphanedAgentDirs(): Promise<void> {
  const tmpDir = '/tmp';
  const entries = await fs.readdir(tmpDir);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const entry of entries) {
    if (entry.startsWith('nubabel-agent-')) {
      const fullPath = `${tmpDir}/${entry}`;
      const stat = await fs.stat(fullPath);
      if (stat.mtimeMs < oneHourAgo) {
        await this.configGenerator.cleanup(fullPath);
        logger.info('Cleaned up orphaned agent dir', { path: fullPath });
      }
    }
  }
}
```

---

### Issue #4: Encryption Key Management Architecture

**Key Storage Strategy: Environment Variable + AWS Secrets Manager (production)**

#### Key Hierarchy

```
+----------------------------------+
|  Master Key (ENCRYPTION_SECRET)  |  <- Stored in AWS Secrets Manager / env
+----------------------------------+
              |
              v
+----------------------------------+
|    Derived Key (PBKDF2)          |  <- Per-encryption salt
+----------------------------------+
              |
              v
+----------------------------------+
|    Data Encryption (AES-256-GCM) |
+----------------------------------+
```

#### Current Implementation (Reuse)

The system already has encryption infrastructure at `src/services/encryption.service.ts`:
- AES-256-GCM with authenticated encryption
- PBKDF2 key derivation with per-encryption salt
- `ENCRYPTION_SECRET` environment variable (min 32 chars)

**For Agent Credentials, reuse this existing service:**

```typescript
// src/services/agent-credential-vault/index.ts
import { encryptToString, decryptFromString } from '../encryption.service';

class AgentCredentialVault {
  async storeCredential(
    agentId: string,
    provider: string,
    credential: Credential
  ): Promise<string> {
    const credentialId = generateCredentialRef();  // cred_xxxx

    // Encrypt the full credential payload
    const payload = JSON.stringify({
      value: credential.value,
      type: credential.type,
      scopes: credential.scopes,
      metadata: credential.metadata,
    });
    const encrypted = encryptToString(payload);

    // Store in database
    await prisma.agentCredential.create({
      data: {
        id: credentialId,
        agentId,
        organizationId: await this.getAgentOrgId(agentId),
        provider,
        name: credential.name,
        credentialType: credential.type,
        encryptedData: encrypted,  // Single string, includes salt+iv+tag
        scopes: credential.scopes || [],
        expiresAt: credential.expiresAt,
        enabled: true,
      }
    });

    return credentialId;
  }

  async getCredential(credentialId: string): Promise<DecryptedCredential | null> {
    const record = await prisma.agentCredential.findUnique({
      where: { id: credentialId },
    });
    if (!record || !record.enabled) return null;

    const decrypted = decryptFromString(record.encryptedData);
    const payload = JSON.parse(decrypted);

    return {
      id: record.id,
      provider: record.provider,
      name: record.name,
      type: record.credentialType,
      value: payload.value,
      scopes: payload.scopes,
      expiresAt: record.expiresAt,
    };
  }
}
```

#### Key Rotation Strategy

| Environment | Key Storage | Rotation Method |
|-------------|-------------|-----------------|
| Development | `.env` file | Manual update |
| Staging | Railway env vars | Manual via Railway dashboard |
| Production | AWS Secrets Manager | Automated 90-day rotation |

**Rotation Process (Zero Downtime):**

```typescript
// Key rotation supports dual-key period
class EncryptionKeyRotator {
  // During rotation, try current key first, fall back to previous
  async decryptWithRotation(encrypted: string): Promise<string> {
    try {
      return decryptFromString(encrypted); // Current key
    } catch {
      // Fall back to previous key during rotation window
      const previousKey = process.env.ENCRYPTION_SECRET_PREVIOUS;
      if (previousKey) {
        return decryptFromStringWithKey(encrypted, previousKey);
      }
      throw new Error('Decryption failed with all available keys');
    }
  }

  // Re-encrypt all credentials with new key
  async rotateAllCredentials(): Promise<void> {
    const credentials = await prisma.agentCredential.findMany();
    for (const cred of credentials) {
      const decrypted = await this.decryptWithRotation(cred.encryptedData);
      const reEncrypted = encryptToString(decrypted); // Uses current key
      await prisma.agentCredential.update({
        where: { id: cred.id },
        data: { encryptedData: reEncrypted },
      });
    }
  }
}
```

**Security Requirements:**
- `ENCRYPTION_SECRET`: Minimum 32 characters, recommend 64
- Never log or expose the key
- Key is not stored in database
- Salt is unique per encryption (stored with ciphertext)

---

### Issue #5: Complete OAuth Flow for Agent Credentials

**Question: Who authorizes OAuth on behalf of an agent?**

**Answer: The human admin initiates OAuth, agent receives the credential.**

#### OAuth Flow Architecture

```
+-------------+     +----------------+     +------------------+     +------------+
|   Admin     |     |  Nubabel API   |     |  OAuth Provider  |     |   Agent    |
|   (Human)   |     |                |     |  (Notion, etc.)  |     |  Profile   |
+-------------+     +----------------+     +------------------+     +------------+
      |                    |                       |                      |
      | 1. Click "Connect  |                       |                      |
      |    Notion for      |                       |                      |
      |    Agent: CEO-Alex"|                       |                      |
      |------------------->|                       |                      |
      |                    |                       |                      |
      |                    | 2. Generate state     |                      |
      |                    |    (agentId + nonce)  |                      |
      |                    |---------------------->|                      |
      |                    |                       |                      |
      | 3. Redirect to     |                       |                      |
      |    OAuth authorize |                       |                      |
      |<-------------------|                       |                      |
      |                    |                       |                      |
      |                    | 4. User authorizes    |                      |
      |-------------------------------------------->|                      |
      |                    |                       |                      |
      |                    | 5. Callback with code |                      |
      |                    |<----------------------|                      |
      |                    |                       |                      |
      |                    | 6. Exchange code for  |                      |
      |                    |    tokens             |                      |
      |                    |---------------------->|                      |
      |                    |                       |                      |
      |                    |<----------------------|                      |
      |                    |                       |                      |
      |                    | 7. Encrypt & store    |                      |
      |                    |    for agent          |                      |
      |                    |--------------------------------------->|
      |                    |                       |                      |
      | 8. Success!        |                       |                      |
      |<-------------------|                       |                      |
```

#### Callback Routing

```typescript
// src/api/agent-credentials.ts

// OAuth initiation endpoint - includes agentId in state
router.get(
  '/agents/:agentId/oauth/:provider/start',
  requireAuth,
  requirePermission(Permission.AGENT_MANAGE),
  async (req: Request, res: Response) => {
    const { agentId, provider } = req.params;
    const { organizationId, id: userId } = req.user!;

    // Verify agent belongs to org
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, organizationId },
    });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get OAuth config for provider
    const config = getOAuthConfig(provider);
    if (!config) {
      return res.status(400).json({ error: 'Unsupported OAuth provider' });
    }

    // Build state with agentId for callback routing
    const state = await encodeAgentOAuthState({
      organizationId,
      userId,
      agentId,  // <-- Key difference from org-level OAuth
      provider,
    });

    // Redirect to OAuth authorize
    const authorizeUrl = buildAuthorizeUrl(config, state);
    return res.redirect(authorizeUrl);
  }
);

// Unified callback handler - routes based on state
router.get(
  '/oauth/callback',
  async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL;

    if (error) {
      return res.redirect(`${frontendUrl}/settings/agents?error=${error}`);
    }

    const stateData = await decodeAgentOAuthState(String(state));
    if (!stateData) {
      return res.redirect(`${frontendUrl}/settings/agents?error=invalid_state`);
    }

    const { organizationId, agentId, provider } = stateData;

    try {
      // Exchange code for tokens
      const config = getOAuthConfig(provider);
      const tokens = await exchangeCodeForTokens(config, String(code));

      // Store credential for the AGENT (not org)
      await agentCredentialVault.storeCredential(agentId, provider, {
        name: `${provider} OAuth Token`,
        type: 'oauth_token',
        value: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : undefined,
        scopes: tokens.scope?.split(' ') || [],
      });

      // Store refresh token separately if exists
      if (tokens.refreshToken) {
        await agentCredentialVault.storeRefreshToken(agentId, provider, {
          value: tokens.refreshToken,
          expiresAt: null,  // Refresh tokens typically don't expire
        });
      }

      logger.info('Agent OAuth credential stored', {
        organizationId,
        agentId,
        provider,
      });

      return res.redirect(
        `${frontendUrl}/settings/agents/${agentId}?oauth_success=${provider}`
      );
    } catch (err) {
      logger.error('Agent OAuth callback failed', {
        error: err instanceof Error ? err.message : err,
        agentId,
        provider,
      });
      return res.redirect(
        `${frontendUrl}/settings/agents/${agentId}?oauth_error=${provider}`
      );
    }
  }
);
```

#### State Encoding (Agent-Aware)

```typescript
// State includes agentId for routing
interface AgentOAuthState {
  organizationId: string;
  userId: string;
  agentId: string;  // Which agent receives the credential
  provider: string;
  nonce: string;
  timestamp: number;
}

async function encodeAgentOAuthState(params: Omit<AgentOAuthState, 'nonce' | 'timestamp'>): Promise<string> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();

  const state: AgentOAuthState = {
    ...params,
    nonce,
    timestamp,
  };

  // Store in Redis for validation
  await redis.set(
    `agent_oauth_state:${nonce}`,
    JSON.stringify(state),
    600  // 10 minute TTL
  );

  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

async function decodeAgentOAuthState(encoded: string): Promise<AgentOAuthState | null> {
  try {
    const state: AgentOAuthState = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    );

    // Validate not expired
    if (Date.now() - state.timestamp > 10 * 60 * 1000) {
      return null;
    }

    // Validate nonce exists in Redis
    const stored = await redis.get(`agent_oauth_state:${state.nonce}`);
    if (!stored) return null;

    // Delete nonce (single use)
    await redis.del(`agent_oauth_state:${state.nonce}`);

    return state;
  } catch {
    return null;
  }
}
```

#### Token Storage During Flow

```
OAuth Flow Timeline:
+-----------+     +-------------+     +---------------+     +-----------------+
| t=0       |     | t=1-60s     |     | t=callback    |     | t=callback+1s   |
| Start     |     | Waiting     |     | Exchange      |     | Stored          |
+-----------+     +-------------+     +---------------+     +-----------------+
     |                  |                    |                      |
     v                  v                    v                      v
 State in          State in            Tokens in           Encrypted in
 Redis             Redis               memory only         AgentCredential
 (10min TTL)       (decrementing)      (transient)         (permanent)
```

**During the flow, tokens are NEVER written to disk or logged.**

---

## Database Schema Changes

### Modified Tables

```prisma
// ============================================================================
// MODIFIED: Agent Model (extend existing)
// ============================================================================

model Agent {
  // ... existing fields preserved ...

  // NEW: Orchestration configuration fields
  displayName     String?   @map("display_name") @db.VarChar(255)
  avatar          String?   @db.Text
  position        String?   @db.VarChar(100)
  department      String?   @db.VarChar(100)
  permissionLevel String   @default("member") @map("permission_level") @db.VarChar(50)
  claudeMdContent String?  @map("claude_md_content") @db.Text
  mcpConfigJson   Json?    @map("mcp_config_json") @db.JsonB
  toolAllowlist   String[] @default([]) @map("tool_allowlist") @db.VarChar(100)
  toolDenylist    String[] @default([]) @map("tool_denylist") @db.VarChar(100)
  preferredModel  String?  @map("preferred_model") @db.VarChar(50)
  maxTokenBudget  Int?     @map("max_token_budget")
  maxConcurrency  Int      @default(1) @map("max_concurrency")
  lastActiveAt    DateTime? @map("last_active_at") @db.Timestamptz(6)

  // NEW: Relations
  credentials    AgentCredential[]
  mcpAssignments AgentMCPAssignment[]
  executions     AgentExecution[]
}
```

### New Tables

```prisma
// ============================================================================
// NEW: Agent Credentials (Per-agent integration tokens)
// ============================================================================

model AgentCredential {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  agentId        String   @map("agent_id") @db.Uuid

  provider       String   @db.VarChar(100)  // notion, linear, github, slack
  name           String   @db.VarChar(255)  // Human-readable name

  // Encrypted credential (uses encryptToString format)
  credentialType String   @map("credential_type") @db.VarChar(50)  // oauth, api_key, token
  encryptedData  String   @map("encrypted_data") @db.Text  // AES-256-GCM encrypted

  // OAuth-specific (encrypted separately)
  expiresAt      DateTime? @map("expires_at") @db.Timestamptz(6)
  refreshTokenId String?   @map("refresh_token_id") @db.Uuid  // FK to separate refresh token

  // Scopes & Permissions
  scopes         String[]  @default([]) @db.VarChar(100)

  // Status
  enabled        Boolean   @default(true)
  lastUsedAt     DateTime? @map("last_used_at") @db.Timestamptz(6)
  lastError      String?   @map("last_error") @db.Text

  metadata       Json      @default("{}") @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  agent          Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([agentId, provider, name])
  @@index([agentId])
  @@index([provider])
  @@map("agent_credentials")
}

// ============================================================================
// NEW: Agent MCP Assignments
// ============================================================================

model AgentMCPAssignment {
  id              String   @id @default(uuid()) @db.Uuid
  agentId         String   @map("agent_id") @db.Uuid
  mcpConnectionId String   @map("mcp_connection_id") @db.Uuid

  // Permissions within this MCP
  allowedTools    String[] @default([]) @map("allowed_tools") @db.VarChar(100)
  deniedTools     String[] @default([]) @map("denied_tools") @db.VarChar(100)

  // Override credentials (if different from org-level)
  useAgentCredential Boolean @default(false) @map("use_agent_credential")
  agentCredentialId  String? @map("agent_credential_id") @db.Uuid

  enabled        Boolean   @default(true)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  agent          Agent         @relation(fields: [agentId], references: [id], onDelete: Cascade)
  mcpConnection  MCPConnection @relation(fields: [mcpConnectionId], references: [id], onDelete: Cascade)

  @@unique([agentId, mcpConnectionId])
  @@index([agentId])
  @@index([mcpConnectionId])
  @@map("agent_mcp_assignments")
}

// ============================================================================
// NEW: Agent Executions (distinct from AgentActivity)
// ============================================================================

model AgentExecution {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  agentId        String   @map("agent_id") @db.Uuid

  // Link to AgentActivity for correlation
  linkedActivityId String? @map("linked_activity_id") @db.Uuid

  // Session tracking
  sessionId      String   @map("session_id") @db.VarChar(255)
  parentExecutionId String? @map("parent_execution_id") @db.Uuid

  // Execution details
  taskDescription String   @map("task_description") @db.Text
  status         String   @default("pending") @db.VarChar(50)

  // Progress
  progressPercent Int      @default(0) @map("progress_percent")
  currentAction   String?  @map("current_action") @db.Text

  // Config snapshot at execution time
  configSnapshot  Json     @map("config_snapshot") @db.JsonB

  // Claude Max account
  claudeMaxAccountId String? @map("claude_max_account_id") @db.Uuid

  // Timing
  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(6)
  durationMs     Int?      @map("duration_ms")

  // Input/Output
  inputData      Json?     @map("input_data") @db.JsonB
  outputData     Json?     @map("output_data") @db.JsonB
  streamChunks   Json[]    @default([]) @map("stream_chunks") @db.JsonB

  // Tool usage
  toolCalls      Json[]    @default([]) @map("tool_calls") @db.JsonB

  // Errors
  errorMessage   String?   @map("error_message") @db.Text
  errorType      String?   @map("error_type") @db.VarChar(50)

  // Slack visibility
  slackChannelId String?   @map("slack_channel_id") @db.VarChar(50)
  slackThreadTs  String?   @map("slack_thread_ts") @db.VarChar(50)
  slackMessageTs String?   @map("slack_message_ts") @db.VarChar(50)

  metadata       Json      @default("{}") @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  agent           Agent           @relation(fields: [agentId], references: [id], onDelete: Cascade)
  parentExecution AgentExecution? @relation("ExecutionHierarchy", fields: [parentExecutionId], references: [id])
  childExecutions AgentExecution[] @relation("ExecutionHierarchy")

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([agentId, createdAt(sort: Desc)])
  @@index([sessionId])
  @@index([status])
  @@index([parentExecutionId])
  @@index([slackChannelId, slackThreadTs])
  @@map("agent_executions")
}
```

---

## New Services & Modules

### 1. Agent Profile Service
**File:** `src/services/agent-profile/index.ts`

```typescript
interface AgentProfileService {
  // CRUD (operates on existing Agent model)
  createAgent(orgId: string, data: CreateAgentDTO): Promise<Agent>;
  getAgent(agentId: string): Promise<Agent | null>;
  getOrgAgents(orgId: string): Promise<Agent[]>;
  updateAgent(agentId: string, data: UpdateAgentDTO): Promise<Agent>;
  archiveAgent(agentId: string): Promise<void>;

  // Hierarchy
  getOrgChart(orgId: string): Promise<OrgChartNode[]>;
  getSubordinates(agentId: string): Promise<Agent[]>;
  getManager(agentId: string): Promise<Agent | null>;

  // Configuration
  generateClaudeMd(agentId: string): Promise<string>;
  generateMCPConfig(agentId: string): Promise<MCPConfigJson>;
  resolveEffectivePermissions(agentId: string): Promise<EffectivePermissions>;
}
```

### 2. Agent Credential Vault
**File:** `src/services/agent-credential-vault/index.ts`

```typescript
interface AgentCredentialVault {
  // Secure storage using existing encryption.service.ts
  storeCredential(agentId: string, provider: string, credential: Credential): Promise<string>;
  getCredential(credentialId: string): Promise<DecryptedCredential | null>;
  getAgentCredentials(agentId: string): Promise<DecryptedCredential[]>;
  rotateCredential(credentialId: string, newCredential: Credential): Promise<void>;
  revokeCredential(credentialId: string): Promise<void>;

  // OAuth handling
  initiateOAuth(agentId: string, provider: string): Promise<OAuthFlowURL>;
  completeOAuth(state: string, code: string): Promise<void>;
  refreshToken(credentialId: string): Promise<void>;
}
```

### 3. Agent Supervisor Service
**File:** `src/services/agent-supervisor/index.ts`

```typescript
interface AgentSupervisorService {
  // Task delegation
  delegateToAgent(agentId: string, task: TaskRequest): Promise<ExecutionId>;
  delegateToSubordinate(managerId: string, task: TaskRequest): Promise<ExecutionId>;
  escalateToManager(agentId: string, task: TaskRequest, reason: string): Promise<ExecutionId>;

  // Execution management
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
  cancelExecution(executionId: string, reason: string): Promise<void>;
  retryExecution(executionId: string): Promise<ExecutionId>;

  // Monitoring
  getActiveExecutions(orgId: string): Promise<AgentExecution[]>;
  getAgentWorkload(agentId: string): Promise<WorkloadStats>;

  // Permission checks
  canAgentPerform(agentId: string, action: string, resource: string): Promise<boolean>;
  canAgentDelegate(fromId: string, toId: string): Promise<boolean>;
}
```

### 4. Enhanced Claude CLI Bridge
**File:** `src/services/claude-cli-bridge/agent-executor.ts`

```typescript
interface AgentExecutor {
  // Execute with per-agent configuration
  executeForAgent(
    agent: Agent,
    prompt: string,
    options: AgentExecutionOptions
  ): Promise<ExecutionResult>;

  // Configuration injection
  buildAgentEnvironment(agent: Agent): Promise<AgentEnvironment>;
  generateTempClaudeMd(agent: Agent): Promise<string>;
  generateTempMCPConfig(agent: Agent): Promise<string>;

  // Process management
  spawnAgentProcess(env: AgentEnvironment, prompt: string): ChildProcess;
  streamAgentOutput(executionId: string, process: ChildProcess): AsyncGenerator<StreamChunk>;
}
```

### 5. Real-Time Activity Hub
**File:** `src/services/activity-hub/index.ts`

```typescript
interface ActivityHub {
  // Event publishing (publishes to BOTH AgentActivity and AgentExecution systems)
  publishExecutionStart(execution: AgentExecution): Promise<void>;
  publishExecutionProgress(executionId: string, progress: ProgressUpdate): Promise<void>;
  publishExecutionComplete(executionId: string, result: ExecutionResult): Promise<void>;
  publishToolCall(executionId: string, toolCall: ToolCallEvent): Promise<void>;

  // Subscriptions
  subscribeToOrg(orgId: string, callback: EventCallback): Unsubscribe;
  subscribeToAgent(agentId: string, callback: EventCallback): Unsubscribe;
  subscribeToExecution(executionId: string, callback: EventCallback): Unsubscribe;

  // History
  getRecentActivity(orgId: string, limit: number): Promise<ActivityEvent[]>;
  getExecutionTimeline(executionId: string): Promise<TimelineEvent[]>;
}
```

---

## API Endpoints

### Agent Profile Management

```typescript
// src/api/agent-profiles.ts

// CRUD
POST   /api/v1/agents                  // Create agent
GET    /api/v1/agents                  // List org agents (with hierarchy)
GET    /api/v1/agents/:id              // Get agent details
PUT    /api/v1/agents/:id              // Update agent
DELETE /api/v1/agents/:id              // Archive agent

// Hierarchy
GET    /api/v1/agents/org-chart        // Full org chart visualization
GET    /api/v1/agents/:id/subordinates // Get direct reports
POST   /api/v1/agents/:id/reassign     // Change manager

// Configuration
GET    /api/v1/agents/:id/config       // Get effective config (CLAUDE.md + MCP)
PUT    /api/v1/agents/:id/claude-md    // Update agent's CLAUDE.md
GET    /api/v1/agents/:id/permissions  // Get effective permissions
```

### Agent Credentials

```typescript
// src/api/agent-credentials.ts

POST   /api/v1/agents/:id/credentials           // Add credential
GET    /api/v1/agents/:id/credentials           // List credentials (masked)
DELETE /api/v1/agents/:id/credentials/:credId   // Remove credential
POST   /api/v1/agents/:id/credentials/:credId/refresh  // Refresh OAuth

// OAuth flows
GET    /api/v1/agents/:id/oauth/:provider/start    // Start OAuth
GET    /api/v1/oauth/callback                      // Unified OAuth callback
```

### Agent Execution

```typescript
// src/api/agent-execution.ts

POST   /api/v1/agents/:id/execute      // Execute task with agent
GET    /api/v1/executions/:id          // Get execution status
GET    /api/v1/executions/:id/stream   // SSE stream for execution
POST   /api/v1/executions/:id/cancel   // Cancel execution

// Bulk operations
GET    /api/v1/executions              // List executions (filterable)
GET    /api/v1/executions/active       // Currently running
```

### Real-Time Monitoring

```typescript
// src/api/monitoring.ts

GET    /api/v1/monitoring/stream            // SSE: All org activity
GET    /api/v1/monitoring/agents/:id/stream // SSE: Single agent activity
GET    /api/v1/monitoring/dashboard         // Dashboard stats
GET    /api/v1/monitoring/org-chart/live    // Live org chart with status
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Focus: Schema migration and core services**

| Task | Files | Effort |
|------|-------|--------|
| Database schema migration (extend Agent) | `prisma/migrations/xxx_multi_agent.sql` | 2h |
| AgentProfile service (wraps Agent) | `src/services/agent-profile/index.ts` | 4h |
| AgentCredential vault | `src/services/agent-credential-vault/index.ts` | 6h |
| Encryption integration (reuse existing) | Already exists | 0h |
| Basic CRUD API | `src/api/agent-profiles.ts` | 4h |
| Unit tests | `src/__tests__/services/agent-profile.test.ts` | 3h |

### Phase 2: CLI Integration (Week 3-4)
**Focus: Per-agent Claude CLI execution**

| Task | Files | Effort |
|------|-------|--------|
| Config generator (temp files) | `src/services/claude-cli-bridge/config-generator.ts` | 4h |
| Agent executor | `src/services/claude-cli-bridge/agent-executor.ts` | 6h |
| Temp file cleanup | `src/services/claude-cli-bridge/cleanup.ts` | 2h |
| Process management with isolation | `src/services/claude-cli-bridge/process-manager.ts` | 4h |
| Streaming with agent context | `src/services/claude-cli-bridge/stream-handler.ts` | 4h |
| Integration tests | `src/__tests__/e2e/agent-execution.test.ts` | 4h |

### Phase 3: OAuth & Credentials (Week 5)
**Focus: Per-agent OAuth flows**

| Task | Files | Effort |
|------|-------|--------|
| Agent OAuth routes | `src/api/agent-credentials.ts` | 4h |
| OAuth state encoding (agent-aware) | `src/services/agent-credential-vault/oauth.ts` | 3h |
| Unified callback handler | `src/api/agent-credentials.ts` | 3h |
| Token refresh for agents | `src/services/agent-credential-vault/refresh.ts` | 2h |
| Integration tests | `src/__tests__/e2e/agent-oauth.test.ts` | 3h |

### Phase 4: Monitoring (Week 6-7)
**Focus: Real-time visibility**

| Task | Files | Effort |
|------|-------|--------|
| Activity Hub service | `src/services/activity-hub/index.ts` | 6h |
| AgentExecution tracking | `src/services/activity-hub/execution.ts` | 4h |
| SSE endpoints for monitoring | `src/api/monitoring.ts` | 4h |
| Slack notifier service | `src/services/slack-agent-notifier/index.ts` | 6h |
| Dashboard API | `src/api/monitoring-dashboard.ts` | 4h |
| Integration tests | `src/__tests__/e2e/monitoring.test.ts` | 3h |

### Phase 5: Hierarchy & Delegation (Week 8-9)
**Focus: Org chart and intelligent routing**

| Task | Files | Effort |
|------|-------|--------|
| Agent Supervisor service | `src/services/agent-supervisor/index.ts` | 8h |
| Delegation chain tracking | `src/services/agent-supervisor/delegation.ts` | 4h |
| Permission resolution | `src/services/agent-supervisor/permissions.ts` | 4h |
| Escalation logic | `src/services/agent-supervisor/escalation.ts` | 4h |
| Org chart API | `src/api/agent-org-chart.ts` | 3h |
| E2E tests | `src/__tests__/e2e/agent-delegation.test.ts` | 4h |

### Phase 6: MCP Per-Agent (Week 10)
**Focus: Differentiated tool access**

| Task | Files | Effort |
|------|-------|--------|
| Agent MCP assignment service | `src/services/agent-mcp/index.ts` | 4h |
| Per-agent tool filtering | `src/services/agent-mcp/tool-filter.ts` | 4h |
| Credential injection per-MCP | `src/services/agent-mcp/credential-injector.ts` | 4h |
| MCP config API | `src/api/agent-mcp.ts` | 3h |
| Tool allowlist/denylist logic | `src/services/agent-mcp/access-control.ts` | 4h |
| Integration tests | `src/__tests__/e2e/agent-mcp.test.ts` | 4h |

---

## File-by-File Changes

### New Files

| File | Purpose |
|------|---------|
| `prisma/migrations/xxx_multi_agent_orchestration.sql` | Schema migration |
| `src/services/agent-profile/index.ts` | Agent profile operations |
| `src/services/agent-profile/hierarchy.ts` | Org chart operations |
| `src/services/agent-credential-vault/index.ts` | Secure credential storage |
| `src/services/agent-credential-vault/oauth.ts` | Agent OAuth flow handling |
| `src/services/agent-supervisor/index.ts` | Task delegation & coordination |
| `src/services/agent-supervisor/delegation.ts` | Delegation chain logic |
| `src/services/agent-supervisor/permissions.ts` | Permission resolution |
| `src/services/agent-supervisor/escalation.ts` | Escalation handling |
| `src/services/claude-cli-bridge/agent-executor.ts` | Per-agent CLI execution |
| `src/services/claude-cli-bridge/config-generator.ts` | CLAUDE.md & MCP config generation |
| `src/services/claude-cli-bridge/cleanup.ts` | Temp file cleanup |
| `src/services/activity-hub/index.ts` | Real-time event hub |
| `src/services/activity-hub/execution.ts` | AgentExecution tracking |
| `src/services/slack-agent-notifier/index.ts` | Slack integration |
| `src/api/agent-profiles.ts` | Agent CRUD API |
| `src/api/agent-credentials.ts` | Credentials & OAuth API |
| `src/api/agent-execution.ts` | Execution API |
| `src/api/agent-mcp.ts` | MCP assignment API |
| `src/api/agent-org-chart.ts` | Org chart API |
| `src/api/monitoring-dashboard.ts` | Dashboard API |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Extend Agent model, add AgentCredential, AgentMCPAssignment, AgentExecution |
| `src/services/claude-cli-bridge/index.ts` | Integrate with agent-executor |
| `src/services/monitoring/agent-activity.service.ts` | Integrate with ActivityHub |
| `src/api/sse.ts` | Add agent-specific SSE channels |
| `src/api/slack.ts` | Integrate slack-agent-notifier |
| `src/orchestrator/delegate-task.ts` | Route through agent-supervisor when agent specified |
| `src/index.ts` | Register new routes |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Agent model extended with orchestration fields (migration successful)
- [ ] Can create/update/delete agent profiles via API
- [ ] Agent hierarchy (manager/subordinate) works
- [ ] Credentials stored with AES-256-GCM encryption (reusing existing service)
- [ ] Unit tests pass

### Phase 2 Complete When:
- [ ] Agent executes with temp CLAUDE.md injected
- [ ] Agent executes with temp MCP config
- [ ] Temp files cleaned up after execution
- [ ] Streaming output includes agent identification

### Phase 3 Complete When:
- [ ] OAuth flow works for per-agent credentials
- [ ] Callback correctly routes to agent
- [ ] Token refresh works for agent credentials
- [ ] OAuth tests pass

### Phase 4 Complete When:
- [ ] SSE stream shows all agent activity in real-time
- [ ] Slack receives start/progress/complete notifications
- [ ] Dashboard API returns live agent status
- [ ] AgentExecution timeline is recorded (distinct from AgentActivity)

### Phase 5 Complete When:
- [ ] Agent can delegate task to subordinate
- [ ] Agent can escalate to manager
- [ ] Permission checks enforce hierarchy
- [ ] Delegation chains are tracked

### Phase 6 Complete When:
- [ ] Each agent has specific MCP servers assigned
- [ ] Tool allowlist/denylist enforced
- [ ] Per-agent credentials injected to MCP calls
- [ ] All E2E tests pass

---

## Commit Strategy

1. **feat(db): extend Agent model for orchestration** - Schema migration
2. **feat(agent-profile): implement agent profile service** - Core CRUD
3. **feat(credential-vault): add per-agent credential storage** - Encryption & storage
4. **feat(cli-bridge): per-agent execution with config injection** - CLI integration
5. **feat(credential-vault): per-agent OAuth flows** - OAuth handling
6. **feat(activity-hub): real-time monitoring infrastructure** - SSE & events
7. **feat(slack-notifier): agent activity notifications** - Slack integration
8. **feat(supervisor): hierarchical delegation & permissions** - Org chart logic
9. **feat(agent-mcp): per-agent MCP assignment & filtering** - Tool access control
10. **feat(api): complete REST API for multi-agent system** - API endpoints
11. **test(e2e): comprehensive multi-agent tests** - Full coverage

---

## Dependencies

### External
- Claude CLI (`claude` binary) - Already available
- Redis - Already configured
- PostgreSQL - Already configured

### Internal (Reused)
- `src/services/encryption.service.ts` - Reuse for credential encryption
- `src/services/credential-manager.ts` - Pattern reference
- `src/mcp-servers/mcp-oauth.ts` - OAuth pattern reference
- `src/api/notion-oauth.ts` - OAuth flow reference
- `src/services/claude-cli-bridge/index.ts` - Extend for per-agent
- `src/services/claude-max-pool/index.ts` - Use for account rotation
- `src/api/sse.ts` - Extend for agent channels
- `src/services/monitoring/agent-activity.service.ts` - Integrate with ActivityHub

---

## Notes

1. **Schema Strategy**: EXTEND existing `Agent` model rather than creating new `AgentProfile` - avoids data duplication and maintains existing functionality.

2. **Activity Tracking Strategy**: `AgentExecution` is for named org agents with full config context; `AgentActivity` remains for OMC agent types. Both integrated via ActivityHub.

3. **Config Injection**: Temp files created at `/tmp/nubabel-agent-{executionId}/`, cleaned up immediately after execution, orphan cleanup runs every 30 minutes.

4. **Encryption**: Reuse existing `src/services/encryption.service.ts` - no need for new encryption infrastructure. Keys stored in `ENCRYPTION_SECRET` env var.

5. **OAuth Flow**: Human admin initiates OAuth, agent receives credential. State includes `agentId` for callback routing.

6. **Backward Compatibility**: Existing `delegateTask()` continues to work without agent specification - uses default org-level execution.

---

**Plan Version:** 2.0 (Critic Feedback Addressed)
**Created:** 2026-01-30
**Updated:** 2026-01-30
**Author:** Prometheus (Planner Agent)
