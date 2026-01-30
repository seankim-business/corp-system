# Self-Modifying Agent System - Complete Architecture Plan

## Executive Summary

Design a system where Nubabel agents can autonomously debug, fix, and implement features in the codebase through Slack commands or Web UI interactions, with proper safety mechanisms and approval workflows.

---

## Current State Analysis (REVISED: ~30% Complete)

### Honest Assessment

The Critic correctly identified that the previous "75% complete" claim was misleading. Here's the accurate picture:

| Component | Status | Reality Check |
|-----------|--------|---------------|
| Slack Bot with commands | Complete | Works for conversations, NOT for code operations |
| AI Executor with tool loop | Complete | Executes AI prompts, but **cannot read/write files** |
| Queue/Worker system | Complete | Infrastructure exists, but no code-operation workers |
| MCP Provider infrastructure | Complete | For **external services** (Notion, Slack, Linear), NOT filesystem |
| Approval system (basic) | Complete | Works for generic approvals, needs code-specific logic |
| Feature Request Pipeline | Partial | Captures requests, but `auto-developer.service.ts` uses `delegateTask()` which only sends prompts |
| Auto-Developer Service | **Stub Only** | Cannot actually modify files - just sends prompts to AI |
| GitHub MCP | Partial | Read-only operations (issues, PRs), no file operations |

### Critical Gap: No Code Modification Capability

**What `delegateTask()` actually does:**
```typescript
// From src/orchestrator/delegate-task.ts
// It sends prompts to AI via executeWithAI() or OpenCode sidecar
// The AI can THINK about code, but cannot EXECUTE file operations
const result = await delegateTask({
  category: "quick",
  prompt: "Fix the bug in auth.ts", // AI responds with TEXT, not actions
  ...
});
```

**What we need but don't have:**
- Filesystem read/write tools (0%)
- Git operations tools (0%)
- Test runner tools (0%)
- Sandboxed execution environment (0%)
- Secrets protection layer (0%)

### Actual Completion: ~30%

| Layer | Completion | Notes |
|-------|------------|-------|
| User Interface (Slack/Web) | 80% | Slack commands exist, Web UI partial |
| API Layer | 60% | Express routing works, need code-ops endpoints |
| Orchestration Layer | 70% | AI execution works, needs tool integration |
| Queue/Worker Layer | 50% | Infrastructure exists, need code workers |
| **Tool Layer (MCP for code)** | **0%** | **Critical gap - nothing exists** |
| Safety Layer | 20% | Basic approval exists, need code-specific |
| Execution Environment | **0%** | **No sandboxing, no isolation** |

---

## NEW SECTION: Execution Environment Architecture

### The Fundamental Question: Where Does Code Run?

**Answer: Dedicated Code Worker Container on Railway**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RAILWAY DEPLOYMENT                                    │
│                                                                              │
│  ┌─────────────────────┐        ┌─────────────────────────────────────────┐ │
│  │ Main Nubabel App    │        │ Code Worker Service (ISOLATED)          │ │
│  │                     │        │                                          │ │
│  │ - Express API       │◄──────►│ - Dedicated Railway Service              │ │
│  │ - Slack Bot         │  Redis │ - Git repository clone                   │ │
│  │ - Web UI            │  Queue │ - Filesystem access (sandboxed)          │ │
│  │ - AI Executor       │        │ - Git operations                         │ │
│  │                     │        │ - Test runner                            │ │
│  │ NO code operations  │        │ - Build tools                            │ │
│  │ NO file access      │        │                                          │ │
│  └─────────────────────┘        │ Resource limits enforced                 │ │
│                                  │ Non-root user (nodejs:1001)              │ │
│                                  │ Read-only except /workspace              │ │
│                                  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Separate Service?

1. **Isolation**: Code operations don't affect main app stability
2. **Resource Control**: Can limit CPU/memory independently
3. **Security**: Smaller attack surface, dedicated hardening
4. **Scaling**: Can scale code workers independently
5. **Recovery**: If code worker crashes, main app continues

### Execution Environment Specification

**File:** `Dockerfile.code-worker`

```dockerfile
# Code Worker - Isolated Environment for Code Operations
FROM node:20-alpine

# Security: Non-root user
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001

# Install ONLY necessary tools
RUN apk add --no-cache \
    git \
    openssh-client \
    dumb-init

# Create sandboxed workspace
RUN mkdir -p /workspace && chown coderunner:coderunner /workspace

# Resource limits (enforced via Railway)
# - Memory: 2GB max
# - CPU: 1 core
# - Disk: 10GB max
# - Network: Internal only (no external except GitHub)

# No privileged operations
USER coderunner
WORKDIR /workspace

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "process.exit(0)"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/worker.js"]
```

### Process Sandboxing

**Command Execution Wrapper:**

```typescript
// src/code-worker/sandbox/command-executor.ts

interface SandboxConfig {
  maxExecutionTime: number;      // 5 minutes default
  maxMemoryMB: number;           // 512MB default
  maxOutputSize: number;         // 10MB default
  allowedCommands: string[];     // Whitelist
  workingDirectory: string;      // /workspace only
}

const ALLOWED_COMMANDS = [
  'git', 'npm', 'npx', 'node', 'tsc', 'eslint', 'prettier',
  'cat', 'ls', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'find', 'grep'
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,           // rm -rf / or ~
  /curl|wget|nc|telnet/,         // Network tools
  /\|\s*sh/,                     // Pipe to shell
  />\s*\/(?!workspace)/,         // Write outside workspace
  /eval|exec/,                   // Dynamic execution
  /sudo|su\s/,                   // Privilege escalation
];

async function executeCommand(
  command: string,
  config: SandboxConfig
): Promise<CommandResult> {
  // 1. Validate command against whitelist
  const baseCommand = command.split(' ')[0];
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    throw new Error(`Command not allowed: ${baseCommand}`);
  }

  // 2. Check for dangerous patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked dangerous pattern: ${pattern}`);
    }
  }

  // 3. Execute with timeout and resource limits
  const child = spawn('sh', ['-c', command], {
    cwd: config.workingDirectory,
    timeout: config.maxExecutionTime,
    maxBuffer: config.maxOutputSize,
    env: {
      ...SAFE_ENV_VARS,
      PATH: '/usr/local/bin:/usr/bin:/bin',  // Restricted PATH
    },
  });

  // 4. Monitor and kill if limits exceeded
  return monitoredExecution(child, config);
}
```

### Directory Isolation

```
/workspace/                      # Sandboxed root
├── repos/                       # Cloned repositories
│   └── {org}/{repo}/           # One per operation
├── tmp/                         # Temporary files
└── artifacts/                   # Build outputs

# BLOCKED paths (read-only filesystem mount):
/etc/*                           # System config
/home/*                          # User directories
/root/*                          # Root home
/var/*                           # System state
```

---

## NEW SECTION: Secrets Management

### Problem Statement

1. **Path blacklist is insufficient** - `.env` files are just one vector
2. **Railway environment variables** - Accessible via `process.env`
3. **Secrets in generated code** - AI might output API keys
4. **Secrets scanning** - Need pre-commit hooks

### Multi-Layer Secrets Protection

#### Layer 1: Environment Variable Isolation

```typescript
// Code Worker starts with SANITIZED environment
const SAFE_ENV_VARS = {
  NODE_ENV: 'production',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/workspace',
  // EXPLICITLY no:
  // - DATABASE_URL
  // - ANTHROPIC_API_KEY
  // - SLACK_BOT_TOKEN
  // - GITHUB_TOKEN (use per-operation tokens)
};

// Railway config: Code Worker service has ONLY:
// - REDIS_URL (for job queue communication)
// - NUBABEL_URL (for callbacks)
// - GITHUB_APP_INSTALLATION_TOKEN (scoped, rotated)
```

#### Layer 2: Path-Based Protection

```typescript
// src/code-worker/security/path-validator.ts

const BLOCKED_PATHS = [
  // Exact matches
  '.env', '.env.local', '.env.production',
  'credentials.json', 'service-account.json',
  '.npmrc', '.pypirc',
  'id_rsa', 'id_ed25519', '*.pem', '*.key',

  // Patterns
  /secrets?\//i,
  /\.aws\//,
  /\.ssh\//,
  /\.gnupg\//,
  /\.config\/gcloud/,
];

const BLOCKED_CONTENT_PATTERNS = [
  // API Keys
  /sk-[a-zA-Z0-9]{32,}/,           // OpenAI
  /ghp_[a-zA-Z0-9]{36}/,           // GitHub PAT
  /xoxb-[0-9]+-[a-zA-Z0-9]+/,      // Slack Bot
  /AKIA[0-9A-Z]{16}/,              // AWS Access Key

  // Private Keys
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /-----BEGIN OPENSSH PRIVATE KEY-----/,

  // Database URLs with passwords
  /postgres:\/\/[^:]+:[^@]+@/,
  /mysql:\/\/[^:]+:[^@]+@/,
];

function validatePathForRead(path: string): boolean {
  // Check against blocked paths
  for (const blocked of BLOCKED_PATHS) {
    if (typeof blocked === 'string' && path.includes(blocked)) {
      return false;
    }
    if (blocked instanceof RegExp && blocked.test(path)) {
      return false;
    }
  }
  return true;
}

function validateContentForWrite(content: string): ValidationResult {
  const findings: SecretFinding[] = [];

  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      findings.push({
        pattern: pattern.toString(),
        match: matches[0].substring(0, 20) + '...',
        severity: 'critical',
      });
    }
  }

  return {
    allowed: findings.length === 0,
    findings,
  };
}
```

#### Layer 3: Pre-Commit Secret Scanning

```typescript
// src/code-worker/security/pre-commit-scanner.ts

async function scanForSecretsBeforeCommit(
  changedFiles: string[]
): Promise<ScanResult> {
  const findings: SecretFinding[] = [];

  for (const file of changedFiles) {
    const content = await readFile(file);
    const validation = validateContentForWrite(content);

    if (!validation.allowed) {
      findings.push(...validation.findings.map(f => ({
        ...f,
        file,
      })));
    }
  }

  // Also run external scanner (gitleaks)
  const gitleaksResult = await runGitleaks(changedFiles);
  findings.push(...gitleaksResult.findings);

  return {
    passed: findings.length === 0,
    findings,
    blockedCommit: findings.some(f => f.severity === 'critical'),
  };
}
```

#### Layer 4: Railway Secrets Scoping

```yaml
# railway.toml for code-worker service
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.code-worker"

[deploy]
# NO SENSITIVE ENVIRONMENT VARIABLES
# Only:
# - REDIS_URL (for job queue)
# - NUBABEL_CALLBACK_URL
# - GITHUB_APP_ID (not token - generate per operation)

# Main app passes SCOPED, SHORT-LIVED tokens per job:
# - GitHub installation token (1 hour expiry)
# - Repository-specific permissions only
```

---

## NEW SECTION: Concurrency Control

### Problem Statement

1. **Two agents modify same file** - Race condition
2. **Two PRs have merge conflicts** - Integration failure
3. **Integration with `.omc/AGENT_BOARD.md`** - Coordination protocol

### Solution: Distributed File Locking + Branch Coordination

#### File-Level Locking

```typescript
// src/code-worker/concurrency/file-lock.ts

interface FileLock {
  path: string;
  operationId: string;
  agentId: string;
  acquiredAt: Date;
  expiresAt: Date;  // Auto-release after 30 minutes
}

// Store in Redis for distributed coordination
const FILE_LOCK_PREFIX = 'nubabel:filelock:';
const DEFAULT_LOCK_TTL = 30 * 60; // 30 minutes

async function acquireFileLock(
  operationId: string,
  agentId: string,
  paths: string[]
): Promise<LockResult> {
  const redis = getRedisClient();
  const locks: FileLock[] = [];
  const conflicts: string[] = [];

  for (const path of paths) {
    const key = `${FILE_LOCK_PREFIX}${path}`;
    const existing = await redis.get(key);

    if (existing) {
      const existingLock: FileLock = JSON.parse(existing);
      if (existingLock.operationId !== operationId) {
        conflicts.push(path);
        continue;
      }
    }

    const lock: FileLock = {
      path,
      operationId,
      agentId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + DEFAULT_LOCK_TTL * 1000),
    };

    await redis.set(key, JSON.stringify(lock), 'EX', DEFAULT_LOCK_TTL);
    locks.push(lock);
  }

  if (conflicts.length > 0) {
    // Release any acquired locks
    for (const lock of locks) {
      await releaseFileLock(lock.path, operationId);
    }
    return { success: false, conflicts };
  }

  return { success: true, locks };
}

async function releaseFileLock(path: string, operationId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${FILE_LOCK_PREFIX}${path}`;
  const existing = await redis.get(key);

  if (existing) {
    const lock: FileLock = JSON.parse(existing);
    if (lock.operationId === operationId) {
      await redis.del(key);
    }
  }
}
```

#### Branch Coordination

```typescript
// src/code-worker/concurrency/branch-coordinator.ts

interface BranchOperation {
  operationId: string;
  branchName: string;
  baseBranch: string;
  status: 'active' | 'merging' | 'merged' | 'abandoned';
  conflictsWith: string[];  // Other branch names
}

// Before starting work:
async function registerBranch(operation: BranchOperation): Promise<void> {
  // 1. Check for conflicts with existing branches
  const existingBranches = await getActiveBranches();

  for (const existing of existingBranches) {
    const hasConflict = await checkPotentialConflict(
      operation.branchName,
      existing.branchName
    );
    if (hasConflict) {
      operation.conflictsWith.push(existing.branchName);
    }
  }

  // 2. Register in Redis
  await redis.hset('nubabel:branches', operation.branchName, JSON.stringify(operation));
}

// Before merging:
async function requestMergeLock(branchName: string): Promise<MergeLockResult> {
  // Only one branch can merge at a time to prevent conflicts
  const lockKey = 'nubabel:merge-lock';
  const acquired = await redis.set(lockKey, branchName, 'NX', 'EX', 300);

  if (!acquired) {
    const currentHolder = await redis.get(lockKey);
    return { success: false, waitingOn: currentHolder };
  }

  return { success: true };
}
```

#### AGENT_BOARD.md Integration

```typescript
// src/code-worker/concurrency/agent-board.ts

const AGENT_BOARD_PATH = '.omc/AGENT_BOARD.md';

async function updateAgentBoard(
  operation: CodeOperation,
  action: 'start' | 'complete' | 'failed'
): Promise<void> {
  // 1. Read current board
  const content = await filesystem.readFile(AGENT_BOARD_PATH);

  // 2. Parse markdown table
  const board = parseAgentBoard(content);

  // 3. Update entry
  if (action === 'start') {
    board.activeAgents.push({
      agentId: operation.agentId,
      task: operation.description,
      files: operation.targetFiles.join(', '),
      status: 'WORKING',
      time: new Date().toISOString(),
    });
  } else if (action === 'complete' || action === 'failed') {
    // Move from active to completed
    const idx = board.activeAgents.findIndex(a => a.agentId === operation.agentId);
    if (idx >= 0) {
      const entry = board.activeAgents.splice(idx, 1)[0];
      entry.status = action === 'complete' ? 'DONE' : 'FAILED';
      board.recentlyCompleted.unshift(entry);
    }
  }

  // 4. Write back
  const newContent = renderAgentBoard(board);
  await filesystem.writeFile(AGENT_BOARD_PATH, newContent);

  // 5. Commit the update
  await git.add([AGENT_BOARD_PATH]);
  await git.commit(`chore: update AGENT_BOARD.md [${operation.operationId}]`);
}
```

---

## NEW SECTION: Feature Request Pipeline Integration

### Current State

The existing `auto-developer.service.ts` calls `delegateTask()` which:
1. Sends a prompt to the AI
2. AI generates TEXT response
3. Response is logged but **no actual code changes happen**

### Integration Path

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEATURE REQUEST → CODE CHANGE FLOW                        │
│                                                                              │
│  1. User: /implement "Add rate limiting"                                     │
│                    │                                                         │
│                    ▼                                                         │
│  2. Feature Request Pipeline (existing)                                      │
│     - Captures request                                                       │
│     - AI analysis → intent, modules, priority                                │
│     - Stores in FeatureRequest table                                         │
│                    │                                                         │
│                    ▼                                                         │
│  3. Auto-Developer Service (MODIFIED)                                        │
│     - createPlan() → generates DevelopmentPlan                               │
│     - execute() NOW QUEUES to code-operation queue                           │
│                    │                                                         │
│                    ▼                                                         │
│  4. Code Operation Queue (NEW)                                               │
│     - Job contains: plan, target files, requirements                         │
│     - Dispatched to Code Worker Service                                      │
│                    │                                                         │
│                    ▼                                                         │
│  5. Code Worker Service (NEW)                                                │
│     - Clones repository                                                      │
│     - Creates branch                                                         │
│     - AI + Tools: reads files, writes changes, runs tests                    │
│     - Commits, pushes, creates PR                                            │
│                    │                                                         │
│                    ▼                                                         │
│  6. Approval Flow                                                            │
│     - PR created with diff                                                   │
│     - Slack notification for approval                                        │
│     - Human reviews and approves                                             │
│                    │                                                         │
│                    ▼                                                         │
│  7. Merge & Deploy                                                           │
│     - PR merged                                                              │
│     - Railway auto-deploys                                                   │
│     - Feature request marked "released"                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Modified Auto-Developer Integration

```typescript
// CHANGES to src/services/mega-app/development-pipeline/auto-developer.service.ts

async execute(plan: DevelopmentPlan): Promise<DevelopmentResult> {
  // BEFORE: Called delegateTask() which just sends prompts
  // AFTER: Queue to code-operation worker

  const job = await codeOperationQueue.add('execute-plan', {
    operationType: 'implement',
    planId: plan.id,
    featureRequestId: plan.featureRequestId,
    tasks: plan.tasks,
    targetFiles: plan.tasks.flatMap(t => t.targetFiles),
    organizationId: this.organizationId,
    priority: 'medium',
    approvalRequired: true,
  });

  // Return immediately - worker will process async
  return {
    planId: plan.id,
    success: true,  // Queued successfully
    jobId: job.id,
    status: 'queued',
    artifacts: { filesCreated: [], filesModified: [], testsAdded: [] },
  };
}
```

---

## Architect Questions: Answers

### Q1: Should filesystem/git tools run in Docker on Railway, or separate worker?

**Answer: Separate Railway Service (Code Worker)**

Reasons:
- Main app handles user-facing APIs - must be stable
- Code operations are resource-intensive and unpredictable
- Isolation prevents code operation failures from affecting main app
- Can scale workers independently based on demand
- Better security posture - smaller attack surface per service

### Q2: Should code-operation worker bypass orchestrator and call MCP tools directly?

**Answer: Hybrid Approach**

```
┌──────────────────────────────────────────────────────────────────┐
│ Code Worker                                                       │
│                                                                   │
│  ┌─────────────────┐      ┌─────────────────────────────────┐   │
│  │ AI Executor     │──────│ Built-in Code Tools (Direct)     │   │
│  │ (Anthropic API) │      │ - filesystem (read/write/edit)   │   │
│  │                 │      │ - git (status/commit/push)       │   │
│  │                 │      │ - testRunner (npm test)          │   │
│  │                 │      │                                   │   │
│  │ Tool calls from │──────│ These are LOCAL to Code Worker   │   │
│  │ Claude go HERE  │      │ NOT via MCP HTTP protocol        │   │
│  └─────────────────┘      └─────────────────────────────────┘   │
│                                                                   │
│  WHY: MCP adds latency and complexity for local operations        │
│  The AI in Code Worker calls tools directly (like Claude Code)    │
└──────────────────────────────────────────────────────────────────┘
```

The Code Worker has its own AI executor that:
1. Uses Anthropic API directly (via organization's API key or Claude Max account)
2. Has tools defined inline (not MCP servers)
3. Tools execute locally within the container

### Q3: How does this interact with Agent Hierarchy system?

**Answer: AR Integration for Permission Escalation**

```typescript
// Agent hierarchy levels (from ar-integration.service.ts)
enum ARPosition {
  JUNIOR = 0,      // Can propose changes, cannot commit
  SENIOR = 1,      // Can commit to feature branches
  LEAD = 2,        // Can merge to develop
  PRINCIPAL = 3,   // Can merge to main (with approval)
  DIRECTOR = 4,    // Can deploy to production
}

// Code Worker respects AR position
async function executeWithPermissions(
  operation: CodeOperation,
  agentPosition: ARPosition
): Promise<void> {
  // Junior agents: Create PR, require review
  if (agentPosition <= ARPosition.JUNIOR) {
    await createPRForReview(operation);
    return;
  }

  // Senior+ agents: Can commit directly to feature branches
  if (agentPosition >= ARPosition.SENIOR) {
    await commitToFeatureBranch(operation);
  }

  // Lead+ agents: Can request merge
  if (agentPosition >= ARPosition.LEAD) {
    await requestMergeApproval(operation);
  }
}
```

### Q4: Claude Max doesn't support tools - should code agents always use Anthropic API?

**Answer: Yes, Code Worker uses Anthropic API exclusively**

```typescript
// Code Worker configuration
const CODE_WORKER_CONFIG = {
  // ALWAYS use Anthropic API for code operations
  aiProvider: 'anthropic',

  // Claude Max accounts are used for:
  // - Conversational AI in Slack
  // - Non-tool-based analysis

  // Why Anthropic API for code:
  // 1. Tool use is essential for code modification
  // 2. Predictable pricing (no rate limits like Max)
  // 3. Better control over context and tool definitions
  // 4. Can use extended thinking for complex tasks

  model: 'claude-sonnet-4-20250514',  // Best balance of speed/quality
  maxTokens: 16384,
  tools: CODE_OPERATION_TOOLS,
};
```

---

## Architecture Overview (REVISED)

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   USER INTERFACE                     │
                    │  ┌────────────────┐    ┌────────────────────────┐   │
                    │  │ Slack Commands │    │ Web Dashboard (React)  │   │
                    │  │ /debug, /impl  │    │ Agent Monitor + Approve│   │
                    │  └───────┬────────┘    └───────────┬────────────┘   │
                    └──────────┼─────────────────────────┼────────────────┘
                               │                         │
                               ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     MAIN NUBABEL APP (Railway Service 1)                  │
│  ┌────────────────┐   ┌─────────────────┐   ┌────────────────────────┐   │
│  │ src/api/       │   │ src/api/        │   │ src/api/               │   │
│  │ slack.ts       │   │ code-ops.ts     │   │ agent-monitor.ts       │   │
│  │ (exists)       │   │ (NEW - facade)  │   │ (NEW)                  │   │
│  └───────┬────────┘   └────────┬────────┘   └───────────┬────────────┘   │
│          │                     │                        │                 │
│          ▼                     ▼                        ▼                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  AI Executor (conversations, analysis - NO code modification)      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│          │                     │                        │                 │
│          ▼                     ▼                        ▼                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  BullMQ Queues: orchestration, code-operation (NEW), deployment    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               │ Redis (job dispatch)
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   CODE WORKER SERVICE (Railway Service 2)                 │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Code Operation Worker                                              │  │
│  │  - Processes jobs from code-operation queue                         │  │
│  │  - Has its own AI Executor with TOOLS                               │  │
│  │  - Sandboxed execution environment                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                               │                                           │
│                               ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Built-in Code Tools (NOT MCP - direct function calls)              │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │  │
│  │  │ filesystem   │ │ git          │ │ testRunner   │ │ security   │ │  │
│  │  │ read/write   │ │ branch/commit│ │ npm test     │ │ scanner    │ │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                               │                                           │
│                               ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Safety Layer                                                       │  │
│  │  - Path validation (no .env, credentials)                           │  │
│  │  - Content scanning (no secrets in code)                            │  │
│  │  - Command whitelist (no rm -rf /)                                  │  │
│  │  - Resource limits (memory, CPU, time)                              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                               │                                           │
│                               ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  /workspace (sandboxed filesystem)                                  │  │
│  │  - Repository clones                                                │  │
│  │  - Build artifacts                                                  │  │
│  │  - No access to system directories                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Code Modification Tools

**Duration:** 3-4 days
**Risk:** Medium
**Dependencies:** None

### 1.1 Filesystem Tools (Direct, not MCP)

**File:** `src/code-worker/tools/filesystem.ts`

```typescript
// Tools to implement (called directly by AI in Code Worker):
interface FilesystemTools {
  readFile(path: string, encoding?: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, edits: LineEdit[]): Promise<void>;
  listDirectory(path: string, recursive?: boolean): Promise<FileInfo[]>;
  searchFiles(pattern: string, directory: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] Can read any file in the cloned repository
- [ ] Can write files with proper encoding
- [ ] Can perform line-based edits (like Claude Code's Edit tool)
- [ ] Path validation: Only `/workspace/repos/{org}/{repo}/` allowed
- [ ] Content validation: No secrets in written content
- [ ] Logs all file operations to audit trail

**Security Controls:**
- Path whitelist: Only paths under `/workspace/repos/`
- Path blacklist: `.env`, `*.key`, `credentials.*`, `*.pem`
- Content scanning: Block writes containing API keys, passwords
- Size limits: Max 1MB read, 500KB write per operation
- Rate limit: Max 100 file operations per minute per session

### 1.2 Git Operations Tools

**File:** `src/code-worker/tools/git.ts`

```typescript
interface GitTools {
  status(): Promise<GitStatus>;
  diff(staged?: boolean): Promise<string>;
  log(limit?: number): Promise<GitLogEntry[]>;
  createBranch(name: string, base?: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  add(files: string[]): Promise<void>;
  commit(message: string): Promise<string>;  // Returns SHA
  push(branch?: string): Promise<void>;
  createPR(title: string, body: string, base: string, head: string): Promise<PRInfo>;
  resetFile(path: string): Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] All git operations work from repository root in workspace
- [ ] Branch naming follows convention: `agent/{ticket-id}-{description}`
- [ ] Commits include agent metadata in trailer (Co-Authored-By)
- [ ] Force push is BLOCKED (no `--force` flag allowed)
- [ ] PR creation uses GitHub App installation token (scoped, short-lived)

### 1.3 Test Runner Tools

**File:** `src/code-worker/tools/test-runner.ts`

```typescript
interface TestRunnerTools {
  typecheck(): Promise<TypecheckResult>;
  lint(files?: string[]): Promise<LintResult>;
  test(pattern?: string): Promise<TestResult>;
  build(): Promise<BuildResult>;
  formatCheck(files?: string[]): Promise<FormatResult>;
}
```

**Acceptance Criteria:**
- [ ] Returns structured output (pass/fail, error locations)
- [ ] Timeout: Max 5 minutes per operation
- [ ] Can run subset of tests (--grep pattern)
- [ ] Parses and returns actionable error information
- [ ] Captures stdout/stderr for debugging

---

## Phase 2: Code Worker Service

**Duration:** 3-4 days
**Risk:** Medium
**Dependencies:** Phase 1

### 2.1 Code Worker Infrastructure

**Files:**
- `Dockerfile.code-worker` - Container definition
- `src/code-worker/index.ts` - Worker entry point
- `src/code-worker/ai-executor.ts` - AI with tools
- `railway.code-worker.toml` - Railway deployment config

### 2.2 Code Operation Queue

**File:** `src/queue/code-operation.queue.ts`

```typescript
interface CodeOperationJob {
  operationType: 'debug' | 'implement' | 'refactor' | 'fix';
  description: string;
  targetFiles?: string[];

  // Repository info
  repository: {
    owner: string;
    name: string;
    branch: string;  // Base branch
  };

  // Context
  errorContext?: {
    errorMessage: string;
    stackTrace?: string;
    logs?: string;
  };
  featureContext?: {
    featureRequestId?: string;
    requirements: string;
    acceptanceCriteria: string[];
  };

  // Organization
  organizationId: string;
  userId: string;
  agentPosition: number;  // AR position for permissions

  // Tracking
  sessionId: string;
  eventId: string;
  slackChannel?: string;
  slackThreadTs?: string;

  // Safety
  approvalRequired: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}
```

### 2.3 Code Operation Worker

**File:** `src/code-worker/worker.ts`

**Workflow:**
```
1. Receive job from queue
2. Acquire file locks for target files
3. Clone repository to /workspace/repos/{org}/{repo}
4. Create agent branch: git createBranch
5. AI Loop:
   a. Analyze problem/requirement
   b. Plan changes
   c. Execute changes (read → modify → write)
   d. Run typecheck
   e. Run tests
   f. If fails: iterate (max 5 attempts)
6. If tests pass:
   a. Scan for secrets (pre-commit)
   b. git add + commit
   c. git push
   d. Create PR (if approvalRequired)
7. Release file locks
8. Update AGENT_BOARD.md
9. Report results to main app (callback)
10. Cleanup workspace
```

---

## Phase 3: Slack Command Integration

**Duration:** 2-3 days
**Risk:** Low
**Dependencies:** Phase 2

### 3.1 New Slack Commands

**File:** `src/api/slack.ts` (modify existing)

```typescript
// Add new commands that queue to Code Worker:
app.command("/debug", handleDebugCommand);     // Queue code operation
app.command("/implement", handleImplementCommand);
app.command("/fix", handleFixCommand);
app.command("/deploy", handleDeployCommand);
```

### 3.2 Command: /debug

**Syntax:** `/debug [error description or paste error]`

**Flow:**
```
User: /debug TypeError: Cannot read property 'id' of undefined in auth.ts:45

Bot: Analyzing error...

[After Code Worker processes]

Bot: Fix Applied!
     Branch: agent/fix-auth-null-check
     PR: #123 - Fix null check in auth.ts

     Changes:
     - auth.ts: Added null check on line 45

     [View PR] [Approve] [Request Changes]
```

### 3.3 Command: /implement

**Syntax:** `/implement [feature description]`

**Flow:**
```
User: /implement Add rate limiting to the API endpoints

Bot: Creating implementation plan...

     Plan:
     1. Install express-rate-limit
     2. Create src/middleware/rate-limit.ts
     3. Apply to routes in src/index.ts
     4. Add tests

     Estimated: 15-20 minutes
     Files: 4 new, 2 modified

     [Start Implementation] [Modify Plan] [Cancel]
```

---

## Phase 4: Safety & Approval System

**Duration:** 3-4 days
**Risk:** High (Critical for production safety)
**Dependencies:** Phase 2, Phase 3

### 4.1 Code Safety Service

**File:** `src/services/code-safety.ts`

```typescript
interface SafetyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalLevel: 'auto' | 'team-lead' | 'admin';
  risks: Risk[];
  blockers: Blocker[];
  secretsFound: SecretFinding[];
}

// Functions:
- assessChangeRisk(diff: string): Promise<SafetyCheckResult>
- checkPathSafety(path: string): boolean
- validateCommit(message: string, diff: string): ValidationResult
- canAutoApprove(change: Change): boolean
- scanForSecrets(content: string): SecretFinding[]
```

### 4.2 Auto-Approval Criteria

```typescript
// Auto-approval (no human needed) if ALL of:
const AUTO_APPROVE_CRITERIA = {
  maxLinesChanged: 20,
  allowedFileTypes: ['.test.ts', '.spec.ts', '.md'],
  noNewDependencies: true,
  noSchemaChanges: true,
  noAPIChanges: true,
  noSecurityFiles: true,
  testsPass: true,
  typecheckPass: true,
};
```

---

## Phase 5: Deployment Integration

**Duration:** 2-3 days
**Risk:** High
**Dependencies:** Phase 4

(Same as original plan - Railway integration for deployments)

---

## Phase 6: Web UI for Monitoring

**Duration:** 4-5 days
**Risk:** Medium
**Dependencies:** Phase 2, Phase 4

(Same as original plan - React components for monitoring)

---

## Implementation Order & Timeline (REVISED)

| Phase | Duration | Priority | Dependencies | Notes |
|-------|----------|----------|--------------|-------|
| **Phase 1:** Code Tools | 3-4 days | P0 | None | Foundation |
| **Phase 2:** Code Worker Service | 3-4 days | P0 | Phase 1 | Critical infrastructure |
| **Phase 3:** Slack Commands | 2-3 days | P1 | Phase 2 | User-facing |
| **Phase 4:** Safety System | 3-4 days | P0 | Phase 2 | Must be solid before production |
| **Phase 5:** Deployment | 2-3 days | P1 | Phase 4 | After safety |
| **Phase 6:** Web UI | 4-5 days | P2 | Phase 2, 4 | Can be parallelized |

**Total Estimated Time:** 18-24 days

**Critical Path:** Phase 1 → Phase 2 → Phase 4 (Safety must block production use)

---

## Risk Mitigations (EXPANDED)

### Risk 1: Agent Runs Destructive Commands

**Mitigation:**
- Command whitelist (only git, npm, node, etc.)
- Pattern blacklist (no `rm -rf /`, no `curl | sh`)
- Sandboxed workspace (cannot access system directories)
- Non-root user in container
- Resource limits (memory, CPU, time)

### Risk 2: Secrets Exposure

**Mitigation:**
- Multi-layer secrets protection (see Secrets Management section)
- Environment variable isolation in Code Worker
- Pre-commit secret scanning (gitleaks integration)
- Content validation on all writes
- Scoped, short-lived GitHub tokens

### Risk 3: Concurrent Modification Conflicts

**Mitigation:**
- Distributed file locking via Redis
- Branch coordination system
- AGENT_BOARD.md integration
- Merge lock for sequential merging

### Risk 4: Code Worker Compromised

**Mitigation:**
- Minimal attack surface (alpine-based image)
- No network access except GitHub and internal APIs
- Read-only filesystem except /workspace
- Short-lived credentials (rotated per operation)
- Audit logging of all operations

### Risk 5: AI Generates Malicious Code

**Mitigation:**
- AI code review before commit
- Human approval required for non-trivial changes
- Test requirements enforced
- PR-based workflow (no direct commits to main)

---

## Success Criteria (REVISED)

### Minimum Viable Product (MVP)

- [ ] Code Worker can clone repository
- [ ] Code Worker can read and write files safely
- [ ] Code Worker can create branches and commits
- [ ] `/debug` command works end-to-end
- [ ] Human approval required for all code changes
- [ ] Secrets scanning prevents credential leaks
- [ ] File locking prevents concurrent modification

### Full Feature Set

- [ ] All Slack commands implemented
- [ ] Web UI for monitoring and approval
- [ ] Automated deployment with rollback
- [ ] AI code review integration
- [ ] Complete audit trail
- [ ] Feature request → Implementation pipeline working
- [ ] AR position-based permissions enforced
- [ ] Concurrent agent coordination working

---

## File Structure Summary (REVISED)

```
src/
├── api/
│   ├── slack.ts                    # (modify) Add /debug, /implement, /fix
│   ├── code-ops.ts                 # (NEW) Code operation endpoints
│   └── agent-monitor.ts            # (NEW) Monitoring endpoints
├── queue/
│   ├── code-operation.queue.ts     # (NEW) Queue definition
│   └── deployment.queue.ts         # (NEW) Deploy queue
├── services/
│   ├── code-safety.ts              # (NEW) Risk assessment
│   ├── change-reviewer.ts          # (NEW) AI code review
│   └── railway-deploy.ts           # (NEW) Railway integration
└── workers/
    └── code-operation.worker.ts    # (NEW) Dispatches to Code Worker

# SEPARATE SERVICE: code-worker/
code-worker/
├── Dockerfile                      # Isolated container
├── package.json                    # Minimal dependencies
├── src/
│   ├── index.ts                    # Worker entry point
│   ├── ai-executor.ts              # AI with code tools
│   ├── tools/
│   │   ├── filesystem.ts           # Read/write/edit files
│   │   ├── git.ts                  # Git operations
│   │   └── test-runner.ts          # npm test, typecheck
│   ├── sandbox/
│   │   ├── command-executor.ts     # Safe command execution
│   │   └── path-validator.ts       # Path whitelist/blacklist
│   ├── security/
│   │   ├── secrets-scanner.ts      # Pre-commit scanning
│   │   └── content-validator.ts    # API key detection
│   └── concurrency/
│       ├── file-lock.ts            # Distributed locking
│       ├── branch-coordinator.ts   # Branch management
│       └── agent-board.ts          # AGENT_BOARD.md sync

frontend/src/
└── pages/
    └── AgentMonitorPage.tsx        # (NEW) Monitoring UI

prisma/
└── schema.prisma                   # (modify) Add CodeOperation, Deployment
```

---

## Commit Strategy (REVISED)

### Phase 1 Commits

```
feat(code-worker): scaffold code worker service
feat(code-worker): add filesystem tools with path validation
feat(code-worker): add git tools with branch management
feat(code-worker): add test runner tools
feat(code-worker): add secrets scanning layer
```

### Phase 2 Commits

```
feat(queue): add code-operation queue definition
feat(code-worker): implement AI executor with tools
feat(code-worker): add sandbox command executor
feat(code-worker): add distributed file locking
feat(db): add CodeOperation model
```

### Phase 3-6: (Same as original plan)

---

## Next Steps After Plan Approval

1. **Run:** `/oh-my-claudecode:start-work self-modifying-agent-system`
2. Begin with Phase 1 (Code Tools) in Code Worker scaffold
3. Set up Railway second service for Code Worker
4. Implement safety layer (Phase 4) in parallel with Phase 2/3
5. Deploy incrementally with feature flags
6. Test extensively in staging before production

---

PLAN_READY: .omc/plans/self-modifying-agent-system.md
