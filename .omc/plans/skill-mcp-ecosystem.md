# Nubabel Skill & MCP Ecosystem Implementation Plan

**Created:** 2026-01-29
**Revised:** 2026-01-29 (Iteration 2 - Critic/Architect feedback incorporated)
**Status:** Ready for Implementation
**Complexity:** HIGH
**Estimated Duration:** 6-8 weeks

---

## Executive Summary

This plan establishes a comprehensive Skill & MCP Ecosystem for Nubabel that enables:

1. **Standards Compatibility** - Support for Claude Skills (SKILL.md), MCP marketplace, OpenAI Actions, and LangChain tools
2. **Cross-Platform Discovery** - Auto-search skills/MCPs from GitHub repos, npm packages (primary), with future skillsmp.com and MCP registry support
3. **Autonomous Acquisition** - Agents independently find, install, and learn skills
4. **Self-Evolution** - Agents upgrade, modify, and create new skills from experience
5. **Secure Multi-Tenant Access** - Role-based skill permissions with organizational hierarchy

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill Storage | YAML + Database Hybrid | YAML for code-defined/versioned, DB for marketplace/generated |
| Execution Model | Declarative Runtime Mapping | Skills declare capabilities, runtime maps to MCP/code/prompt |
| Marketplace Scope | Merged with existing Extension model | Add `extensionType` discriminator for skills/mcp-servers |
| Permission Granularity | Skill + Tool Level | Inheritance from org -> role -> agent with overrides |
| **Sandboxing** | **isolated-vm (V8 isolates)** | Fast startup, 64MB memory limit, Permission Proxy for MCP |
| **External Sources** | **Git-first (GitHub API)** | Stable API, npm secondary, registry APIs deferred |
| **Type Migration** | **Gradual with branded strings** | `SkillId` branded type, deprecate legacy `Skill` union |

---

## External API Documentation

### Primary Sources (Implemented in Phase 4)

#### GitHub API (Primary Source)
- **Base URL:** `https://api.github.com`
- **Auth:** PAT or GitHub App installation token
- **Key Endpoints:**
  - `GET /repos/{owner}/{repo}/contents/{path}` - Fetch SKILL.md or skill YAML
  - `GET /search/repositories?q={query}+topic:claude-skill` - Discover skills by topic
  - `GET /repos/{owner}/{repo}/releases/latest` - Get latest version
- **Rate Limits:** 5000 req/hour (authenticated), 60/hour (unauthenticated)
- **Reference:** https://docs.github.com/en/rest

#### npm Registry (Secondary Source)
- **Base URL:** `https://registry.npmjs.org`
- **Auth:** None required for public packages
- **Key Endpoints:**
  - `GET /{package}` - Package metadata including versions
  - `GET /{package}/{version}` - Specific version details
  - `GET /-/v1/search?text={query}` - Search packages
- **Reference:** https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md

### Deferred Sources (Future Implementation)

#### skillsmp.com API
- **Status:** API not publicly documented as of 2026-01
- **Action:** Research required before implementation
- **Placeholder:** `SkillSource` interface allows pluggable addition

#### MCP Registry (registry.modelcontextprotocol.io)
- **Status:** API specification evolving
- **Action:** Monitor for stable API release
- **Placeholder:** `SkillSource` interface allows pluggable addition

### Skill Format Specifications

| Format | Specification | Reference |
|--------|--------------|-----------|
| SKILL.md | Claude Skills format | https://github.com/anthropics/anthropic-cookbook/blob/main/skills/skills_spec.md |
| OpenAI Action | OpenAPI 3.0 schema | https://platform.openai.com/docs/actions/introduction |
| LangChain Tool | Tool class definition | https://python.langchain.com/docs/modules/tools/ |

---

## Sandboxing Architecture

### Technology: isolated-vm (V8 Isolates)

**Package:** `isolated-vm` (npm)
**Rationale:** V8 isolates provide true memory isolation, fast cold start (<500ms with pre-warming), and deterministic resource limits.

### Resource Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory | 64 MB | Sufficient for data transformation, prevents DoS |
| CPU Time | 500 ms | Prevents runaway computation |
| Wall Time | 5000 ms | Allows async operations but caps total duration |
| Script Size | 1 MB | Prevents massive code injection |

### Permission Proxy Pattern for MCP Access

```typescript
interface PermissionProxy {
  // Skills cannot access MCP tools directly
  // All tool access goes through permission-checked proxy
  callTool(provider: string, tool: string, args: unknown): Promise<unknown>;

  // Proxy validates:
  // 1. Skill has permission for this provider/tool combination
  // 2. Rate limits not exceeded
  // 3. Audit log entry created
}
```

### Network Access Policy

| Skill Type | Network Access | Rationale |
|------------|----------------|-----------|
| MCP-based | Via Permission Proxy only | MCP tools handle external calls |
| Code-based | Blocked by default | Prevent data exfiltration |
| Prompt-based | N/A (AI handles) | No direct network from skill |

### Pre-warming Strategy

- Maintain pool of 3 warm isolates per organization
- Isolate reuse with state reset between executions
- Cold start fallback if pool exhausted

---

## Existing Codebase Integration

### Relationship to `src/marketplace/` Module

**Current State:** The `src/marketplace/` directory exists as untracked files (per git status). This plan:

1. **Validates** the existing marketplace structure if present
2. **Extends** it with skill-specific functionality via `extensionType` discriminator
3. **Creates** if not present, following the merged architecture

### Migration Path for Existing `Skill` Type Union

**Current Definition** (`src/orchestrator/types.ts` line 10):
```typescript
export type Skill = "playwright" | "git-master" | "frontend-ui-ux" | "mcp-integration" | "skillsmp-downloader";
```

**Migration Strategy (Gradual, 3 Phases):**

```typescript
// Phase 1: Add branded SkillId type alongside legacy
export type SkillId = string & { readonly __brand: 'SkillId' };
export type LegacySkill = "playwright" | "git-master" | "frontend-ui-ux" | "mcp-integration" | "skillsmp-downloader";

// @deprecated Use SkillId from skill-registry
export type Skill = LegacySkill;

// Phase 2: Type guards for migration
export function isLegacySkill(id: string): id is LegacySkill {
  return ['playwright', 'git-master', 'frontend-ui-ux', 'mcp-integration', 'skillsmp-downloader'].includes(id);
}

export function toSkillId(id: string): SkillId {
  return id as SkillId;
}

// Phase 3: UnifiedSkillConfig extends existing SkillConfig
export interface UnifiedSkillConfig extends SkillConfig {
  // New fields for database-backed skills
  source: 'yaml' | 'marketplace' | 'generated';
  runtimeType: 'mcp' | 'code' | 'prompt' | 'composite';
  // ... additional fields
}
```

### Modifications to `skill-selector.ts`

**Current Behavior:** Hardcoded `SKILL_KEYWORDS` and `SKILL_PRIORITY` maps.

**Migration:**
1. Keep existing maps as fallback for legacy skills
2. Add registry lookup for new skills
3. Merge results with priority to registry skills

```typescript
// Modified selectSkillsEnhanced
export async function selectSkillsEnhanced(
  orgId: string,
  userRequest: string,
  options: SelectOptions = {}
): Promise<SkillSelection> {
  // 1. Query skill registry for dynamic skills
  const registrySkills = await skillRegistry.resolveSkillsForRequest(orgId, userRequest);

  // 2. Fall back to legacy matching for built-in skills
  const legacySkills = legacySelectSkills(userRequest);

  // 3. Merge with registry skills taking priority
  return mergeSkillSelections(registrySkills, legacySkills);
}
```

---

## Redis Cache Patterns

### Cache Key Patterns

| Pattern | TTL | Purpose |
|---------|-----|---------|
| `skill:registry:{orgId}:all` | 5 min | Full skill list for org |
| `skill:perm:{orgId}:{skillId}:{agentId}` | 10 min | Resolved permissions |
| `skill:perm:{orgId}:{skillId}:default` | 10 min | Org-wide default permissions |
| `skill:meta:{skillId}` | 30 min | Skill metadata (global skills) |
| `skill:exec:{orgId}:count:{skillId}` | 1 day | Execution count for rate limiting |
| `mcp:tools:{orgId}:{provider}` | 15 min | Available MCP tools per provider |

### Cache Invalidation Strategy

| Event | Invalidate |
|-------|------------|
| Skill installed | `skill:registry:{orgId}:*` |
| Permission changed | `skill:perm:{orgId}:{skillId}:*` |
| Skill updated | `skill:meta:{skillId}`, `skill:registry:*` |
| MCP connection changed | `mcp:tools:{orgId}:{provider}` |

---

## Database Schema Additions

### Merged Marketplace Extension Model

```prisma
// ============================================================================
// MARKETPLACE EXTENSIONS (Unified Skills/MCPs/Extensions)
// ============================================================================

/// ExtensionType enum for discriminator
enum ExtensionType {
  extension   // Traditional extensions
  skill       // Claude Skills, OpenAI Actions, LangChain tools
  mcp_server  // MCP server definitions
}

/// MarketplaceExtension (Unified marketplace item)
/// Extends to support skills and MCP servers alongside traditional extensions
model MarketplaceExtension {
  id             String        @id @default(uuid()) @db.Uuid
  organizationId String?       @map("organization_id") @db.Uuid  // NULL = global/marketplace

  // Identity
  slug           String        @db.VarChar(100)
  name           String        @db.VarChar(255)
  description    String        @db.Text
  version        String        @db.VarChar(20)

  // Discriminator
  extensionType  ExtensionType @default(extension) @map("extension_type")

  // Classification
  category       String        @db.VarChar(50)
  tags           String[]      @default([]) @db.VarChar(50)

  // Source & Format (for skills)
  source         String?       @db.VarChar(50)   // yaml, marketplace, generated, github, npm
  format         String?       @db.VarChar(20)   // skill-md, openai-action, langchain-tool

  // Content
  manifest       Json          @db.JsonB         // ExtensionManifest with skill-specific fields
  definition     Json?         @db.JsonB         // Skill definition (for skills only)

  // Execution (for skills)
  runtimeType    String?       @map("runtime_type") @db.VarChar(30)  // mcp, code, prompt, composite
  runtimeConfig  Json?         @map("runtime_config") @db.JsonB

  // Triggers & Parameters (for skills)
  triggers       String[]      @default([]) @db.VarChar(100)
  parameters     Json          @default("[]") @db.JsonB
  outputs        Json          @default("[]") @db.JsonB

  // Dependencies (for skills)
  dependencies   String[]      @default([]) @db.VarChar(100)
  toolsRequired  String[]      @default([]) @map("tools_required") @db.VarChar(100)
  mcpProviders   String[]      @default([]) @map("mcp_providers") @db.VarChar(50)

  // MCP Server fields (for mcp_server type)
  protocol       String?       @db.VarChar(20)   // stdio, http, websocket
  command        String?       @db.Text          // for stdio servers
  url            String?       @db.Text          // for http/websocket servers
  authType       String?       @map("auth_type") @db.VarChar(30)  // none, api_key, oauth2
  authConfig     Json?         @map("auth_config") @db.JsonB
  tools          Json?         @default("[]") @db.JsonB  // MCP tools provided

  // Marketplace
  publisherId    String?       @map("publisher_id") @db.Uuid
  isPublic       Boolean       @default(false) @map("is_public")
  verified       Boolean       @default(false)
  downloads      Int           @default(0)
  rating         Float?        @db.Real
  ratingCount    Int           @default(0) @map("rating_count")

  // Status
  status         String        @default("active") @db.VarChar(20)
  enabled        Boolean       @default(true)

  // Audit
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy      String?       @map("created_by") @db.Uuid

  // Relations
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  publisher      ExtensionPublisher? @relation(fields: [publisherId], references: [id])
  versions       ExtensionVersion[]
  installations  ExtensionInstallation[]
  usageLogs      ExtensionUsageLog[]
  permissions    ExtensionPermission[]

  @@unique([organizationId, slug])
  @@unique([publisherId, slug, version])
  @@index([organizationId])
  @@index([extensionType])
  @@index([category])
  @@index([isPublic, status, extensionType])
  @@index([tags], type: Gin)
  @@index([triggers], type: Gin)
  @@map("marketplace_extensions")
}

/// ExtensionVersion (Version history)
model ExtensionVersion {
  id             String   @id @default(uuid()) @db.Uuid
  extensionId    String   @map("extension_id") @db.Uuid
  version        String   @db.VarChar(20)
  manifest       Json     @db.JsonB
  definition     Json?    @db.JsonB
  changelog      String?  @db.Text

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy      String?  @map("created_by") @db.Uuid

  extension      MarketplaceExtension @relation(fields: [extensionId], references: [id], onDelete: Cascade)

  @@unique([extensionId, version])
  @@index([extensionId])
  @@map("extension_versions")
}

/// ExtensionInstallation (Org-level installations)
model ExtensionInstallation {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  extensionId    String    @map("extension_id") @db.Uuid
  version        String    @db.VarChar(20)

  // Configuration overrides
  configOverrides Json?    @map("config_overrides") @db.JsonB

  // MCP-specific: credentials for MCP servers
  credentials    Json?     @db.JsonB  // encrypted

  // Status
  status         String    @default("active") @db.VarChar(20)
  autoUpdate     Boolean   @default(true) @map("auto_update")
  healthStatus   String    @default("unknown") @map("health_status") @db.VarChar(20)
  lastHealthAt   DateTime? @map("last_health_at") @db.Timestamptz(6)

  installedAt    DateTime  @default(now()) @map("installed_at") @db.Timestamptz(6)
  installedBy    String    @map("installed_by") @db.Uuid
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  extension      MarketplaceExtension @relation(fields: [extensionId], references: [id], onDelete: Cascade)

  @@unique([organizationId, extensionId])
  @@index([organizationId])
  @@index([extensionId])
  @@map("extension_installations")
}

/// ExtensionPublisher (Publisher accounts)
model ExtensionPublisher {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String?  @map("organization_id") @db.Uuid  // NULL = individual

  name           String   @db.VarChar(255)
  slug           String   @unique @db.VarChar(100)
  description    String?  @db.Text
  website        String?  @db.Text
  verified       Boolean  @default(false)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  extensions     MarketplaceExtension[]

  @@index([organizationId])
  @@map("extension_publishers")
}

/// ExtensionPermission (Org/Role/Agent access control)
model ExtensionPermission {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  // Target (one of these must be set)
  extensionId    String?  @map("extension_id") @db.Uuid
  extensionType  ExtensionType?  @map("extension_type_filter")  // category filter
  category       String?  @db.VarChar(50)  // category wildcard

  // Scope (one of these must be set, in priority order)
  agentId        String?  @map("agent_id") @db.Uuid      // highest priority
  roleId         String?  @map("role_id") @db.VarChar(50)
  teamId         String?  @map("team_id") @db.Uuid
  // if all NULL = org-wide default

  // Permissions
  canExecute     Boolean  @default(true) @map("can_execute")
  canConfigure   Boolean  @default(false) @map("can_configure")
  canInstall     Boolean  @default(false) @map("can_install")
  canPublish     Boolean  @default(false) @map("can_publish")

  // Tool-level restrictions (for skills/mcp-servers)
  allowedTools   String[] @default([]) @map("allowed_tools") @db.VarChar(100)
  deniedTools    String[] @default([]) @map("denied_tools") @db.VarChar(100)

  // Constraints
  maxExecutionsPerDay  Int?  @map("max_executions_per_day")
  requiresApproval     Boolean @default(false) @map("requires_approval")
  approverRoles        String[] @default([]) @map("approver_roles") @db.VarChar(50)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  extension      MarketplaceExtension? @relation(fields: [extensionId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([extensionId])
  @@index([agentId])
  @@index([roleId])
  @@map("extension_permissions")
}

/// ExtensionUsageLog (Execution history)
model ExtensionUsageLog {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  extensionId    String   @map("extension_id") @db.Uuid
  agentId        String?  @map("agent_id") @db.Uuid
  sessionId      String?  @map("session_id") @db.VarChar(255)

  // Execution details
  executionId    String   @map("execution_id") @db.Uuid
  status         String   @db.VarChar(20)  // success, failed, timeout, denied
  durationMs     Int      @map("duration_ms")

  // Input/Output (redacted for privacy)
  inputHash      String?  @map("input_hash") @db.VarChar(64)
  outputType     String?  @map("output_type") @db.VarChar(50)

  // Error tracking
  errorCode      String?  @map("error_code") @db.VarChar(50)
  errorMessage   String?  @map("error_message") @db.Text

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  extension      MarketplaceExtension @relation(fields: [extensionId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([extensionId, createdAt(sort: Desc)])
  @@index([agentId])
  @@index([status])
  @@map("extension_usage_logs")
}

// ============================================================================
// LEARNING & EVOLUTION TABLES
// ============================================================================

/// SkillLearningPattern (Detected patterns for skill generation)
model SkillLearningPattern {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  // Pattern identification
  patternHash    String   @map("pattern_hash") @db.VarChar(64)
  patternType    String   @map("pattern_type") @db.VarChar(30)  // sequence, retry, composite

  // Pattern data
  steps          Json     @db.JsonB
  frequency      Int      @default(1)

  // Context
  triggerPhrases String[] @default([]) @map("trigger_phrases") @db.Text
  contextTags    String[] @default([]) @map("context_tags") @db.VarChar(50)

  // Evolution status
  status         String   @default("detected") @db.VarChar(20)  // detected, validated, converted, dismissed
  generatedExtensionId String? @map("generated_extension_id") @db.Uuid

  firstSeenAt    DateTime @default(now()) @map("first_seen_at") @db.Timestamptz(6)
  lastSeenAt     DateTime @default(now()) @map("last_seen_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, patternHash])
  @@index([organizationId])
  @@index([status])
  @@index([frequency])
  @@map("skill_learning_patterns")
}

/// AgentSkillAssignment (Agent-specific skill configurations)
model AgentSkillAssignment {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  agentId        String   @map("agent_id") @db.Uuid
  extensionId    String   @map("extension_id") @db.Uuid

  // Assignment type
  assignmentType String   @map("assignment_type") @db.VarChar(20)  // default, learned, admin

  // Configuration
  enabled        Boolean  @default(true)
  priority       Int      @default(100)
  configOverrides Json?   @map("config_overrides") @db.JsonB

  // Performance tracking
  successCount   Int      @default(0) @map("success_count")
  failureCount   Int      @default(0) @map("failure_count")
  avgDurationMs  Int?     @map("avg_duration_ms")

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  agent          Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)
  extension      MarketplaceExtension @relation(fields: [extensionId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([agentId, extensionId])
  @@index([organizationId])
  @@index([agentId])
  @@map("agent_skill_assignments")
}
```

### Schema Migration Notes

1. Add `ExtensionType` enum before creating tables
2. Add relations to existing `Organization` and `Agent` models
3. Create index on `extensionType` for efficient filtering
4. Run enum validation via Prisma middleware

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                           NUBABEL SKILL & MCP ECOSYSTEM                           |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +---------------------------+     +---------------------------+                  |
|  |   UNIFIED EXTENSION       |     |   EXTERNAL SOURCES        |                  |
|  |   REGISTRY                |     |   (SkillSource Interface) |                  |
|  |                           |     |                           |                  |
|  |  +-------------------+    |     |  +-------------------+    |                  |
|  |  | YAML Skills       |    |     |  | GitHub Repos      |    |                  |
|  |  | (config/skills/)  |    |     |  | (primary)         |    |                  |
|  |  +-------------------+    |     |  +-------------------+    |                  |
|  |           |               |     |           |               |                  |
|  |  +-------------------+    |     |  +-------------------+    |                  |
|  |  | DB Extensions     |    |     |  | npm Packages      |    |                  |
|  |  | (marketplace/gen) |    |     |  | (secondary)       |    |                  |
|  |  +-------------------+    |     |  +-------------------+    |                  |
|  +---------------------------+     +---------------------------+                  |
|              |                                  |                                 |
|              +----------------------------------+                                 |
|                              |                                                    |
|  +---------------------------v-------------------------------------------------+  |
|  |                    UNIFIED CAPABILITY RESOLVER                               |  |
|  |  +-------------------------------------------------------------------------+ |  |
|  |  |  Request Analysis -> Skill Matching -> Permission Check -> Execution    | |  |
|  |  +-------------------------------------------------------------------------+ |  |
|  +------------------------------------------------------------------------------+  |
|              |                                                                   |
|  +-----------v---------------------+  +-------------------------------------+    |
|  |  SKILL EXECUTION RUNTIME        |  |  MARKETPLACE SERVICE                |    |
|  |                                 |  |                                     |    |
|  |  +---------------------------+  |  |  +-----------------------------+    |    |
|  |  | MCP Tool Executor         |  |  |  | Skill Discovery             |    |    |
|  |  | (via mcp-registry.ts)     |  |  |  | (GitHub, npm, future APIs)  |    |    |
|  |  +---------------------------+  |  |  +-----------------------------+    |    |
|  |  | Code Function Executor    |  |  |  | Skill Installation          |    |    |
|  |  | (isolated-vm sandbox)     |  |  |  | (validation, sandboxing)    |    |    |
|  |  +---------------------------+  |  |  +-----------------------------+    |    |
|  |  | Prompt Template Executor  |  |  |  | Version Management          |    |    |
|  |  | (AI-based skills)         |  |  |  | (upgrades, rollback)        |    |    |
|  |  +---------------------------+  |  |  +-----------------------------+    |    |
|  +---------------------------------+  +-------------------------------------+    |
|              |                                                                   |
|  +-----------v-----------------------------------------------------------------+  |
|  |                    PERMISSION & SECURITY LAYER                               |  |
|  |                                                                              |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |  | Org Permissions   |  | Role Permissions  |  | Agent Overrides   |         |  |
|  |  | (ext_perms)       |  | (role_ext_perms)  |  | (agent_perm_ovr)  |         |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |                              |                                               |  |
|  |  +---------------------------v-----------------------------------------+     |  |
|  |  | Tool-Level Permissions (per-skill tool whitelist/blacklist)        |     |  |
|  |  +---------------------------------------------------------------------+     |  |
|  +------------------------------------------------------------------------------+  |
|              |                                                                   |
|  +-----------v-----------------------------------------------------------------+  |
|  |                    LEARNING & EVOLUTION ENGINE                               |  |
|  |                                                                              |  |
|  |  +---------------------------+  +------------------------------------+       |  |
|  |  | Experience Tracker        |  | Skill Generator                    |       |  |
|  |  | (repeated tasks, failures)|  | (pattern -> skill conversion)      |       |  |
|  |  +---------------------------+  +------------------------------------+       |  |
|  |  | Pattern Detector          |  | Skill Optimizer                    |       |  |
|  |  | (common sequences)        |  | (performance tuning)               |       |  |
|  |  +---------------------------+  +------------------------------------+       |  |
|  +------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## Core Module Specifications

### Module 1: Unified Extension Registry (`src/services/extension-registry/`)

```
src/services/extension-registry/
  index.ts                 # Main exports
  extension-registry.ts    # Core registry service
  extension-loader.ts      # Unified loader (YAML + DB)
  extension-resolver.ts    # Request -> Extension matching
  extension-validator.ts   # Schema validation
  types.ts                 # TypeScript interfaces
  formats/
    skill-md.ts            # Claude SKILL.md parser
    openai-action.ts       # OpenAI Action converter
    langchain-tool.ts      # LangChain tool converter
```

**Key Interface:**
```typescript
// Branded type for type safety
export type ExtensionId = string & { readonly __brand: 'ExtensionId' };
export type SkillId = ExtensionId; // Alias for skill-specific contexts

interface ExtensionRegistry {
  // Discovery
  listExtensions(orgId: string, options?: ListOptions): Promise<Extension[]>;
  listSkills(orgId: string, options?: ListOptions): Promise<Extension[]>;  // Filtered by type
  getExtension(orgId: string, slug: string): Promise<Extension | null>;
  searchExtensions(query: string, options?: SearchOptions): Promise<Extension[]>;

  // Resolution
  resolveSkillsForRequest(orgId: string, request: string, agentId?: string): Promise<ResolvedSkill[]>;
  getSkillsForAgent(agentId: string): Promise<Extension[]>;

  // Lifecycle
  registerExtension(extension: ExtensionDefinition): Promise<Extension>;
  updateExtension(id: ExtensionId, updates: Partial<ExtensionDefinition>): Promise<Extension>;
  deprecateExtension(id: ExtensionId): Promise<void>;

  // Import/Export
  importFromSource(source: SkillSource, ref: string, orgId: string): Promise<Extension>;
  exportToMarketplace(id: ExtensionId): Promise<string>;
}

// Pluggable source interface for future expansion
interface SkillSource {
  readonly name: string;
  search(query: string): Promise<ExternalSkillRef[]>;
  fetch(ref: ExternalSkillRef): Promise<SkillDefinition>;
  getVersions(ref: ExternalSkillRef): Promise<string[]>;
}
```

### Module 2: Skill Execution Runtime (`src/services/skill-runtime/`)

```
src/services/skill-runtime/
  index.ts
  skill-executor.ts        # Main execution orchestrator
  executors/
    mcp-executor.ts        # MCP tool execution
    code-executor.ts       # isolated-vm sandboxed execution
    prompt-executor.ts     # AI prompt-based skills
    composite-executor.ts  # Multi-step skill chains
  sandbox/
    isolate-pool.ts        # Pre-warmed isolate pool
    permission-proxy.ts    # MCP tool access proxy
    resource-limiter.ts    # CPU/memory/time limits
```

**Sandbox Implementation:**
```typescript
import ivm from 'isolated-vm';

interface SandboxConfig {
  memoryLimitMB: number;      // Default: 64
  cpuTimeoutMs: number;       // Default: 500
  wallTimeoutMs: number;      // Default: 5000
  maxScriptSize: number;      // Default: 1MB
}

class SkillSandbox {
  private isolatePool: IsolatePool;
  private permissionProxy: PermissionProxy;

  async execute(
    skill: CodeSkill,
    input: unknown,
    context: ExecutionContext
  ): Promise<SkillOutput> {
    const isolate = await this.isolatePool.acquire();
    try {
      // Create context with permission proxy
      const ctx = await isolate.createContext();

      // Inject permission-checked MCP access
      await ctx.global.set('mcp', this.permissionProxy.createBridge(context));

      // Execute with resource limits
      const script = await isolate.compileScript(skill.code);
      return await script.run(ctx, {
        timeout: this.config.cpuTimeoutMs,
      });
    } finally {
      await this.isolatePool.release(isolate);
    }
  }
}
```

### Module 3: Marketplace Service (`src/services/marketplace/`)

Reuses existing marketplace structure with skill-specific extensions.

```
src/services/marketplace/
  index.ts
  search.ts                # Reuse for unified search
  publisher.ts             # Reuse for publisher management
  downloads.ts             # Reuse for download tracking
  skill-discovery.ts       # Skill-specific discovery
  skill-installer.ts       # Skill installation workflow
  sources/
    github-source.ts       # GitHub API client (primary)
    npm-source.ts          # npm registry client (secondary)
    source-interface.ts    # SkillSource interface
```

**GitHub Source Implementation:**
```typescript
class GitHubSkillSource implements SkillSource {
  readonly name = 'github';

  async search(query: string): Promise<ExternalSkillRef[]> {
    // Search repos with claude-skill topic
    const response = await this.octokit.search.repos({
      q: `${query} topic:claude-skill`,
      sort: 'stars',
      per_page: 20,
    });

    return response.data.items.map(repo => ({
      source: 'github',
      owner: repo.owner.login,
      repo: repo.name,
      ref: repo.default_branch,
    }));
  }

  async fetch(ref: ExternalSkillRef): Promise<SkillDefinition> {
    // Fetch SKILL.md or skill.yaml from repo
    const content = await this.octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path: 'SKILL.md',
    });

    return this.parser.parse(content);
  }
}
```

### Module 4: Permission Manager (`src/services/extension-permissions/`)

```
src/services/extension-permissions/
  index.ts
  permission-resolver.ts   # Hierarchical permission resolution
  permission-cache.ts      # Redis-backed permission cache
  approval-workflow.ts     # Execution approvals
```

**Permission Resolution Order:**
1. Agent-specific override (highest priority)
2. Team permissions
3. Role permissions
4. Org-wide defaults
5. Global defaults (lowest priority)

### Module 5: Learning Engine (`src/services/skill-learning/`)

```
src/services/skill-learning/
  index.ts
  pattern-detector.ts      # Detect recurring patterns
  skill-generator.ts       # Generate skills from patterns
  experience-tracker.ts    # Track execution patterns
```

---

## API Endpoints

### Extensions API (`/api/v1/extensions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/extensions` | List extensions for organization |
| GET | `/extensions?type=skill` | List skills only |
| GET | `/extensions/:slug` | Get extension details |
| POST | `/extensions` | Create/register extension |
| PUT | `/extensions/:slug` | Update extension |
| DELETE | `/extensions/:slug` | Delete/deprecate extension |
| POST | `/extensions/:slug/execute` | Execute skill |
| GET | `/extensions/:slug/usage` | Get usage analytics |

### Marketplace API (`/api/v1/marketplace`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketplace/search` | Search marketplace (unified) |
| GET | `/marketplace/search?type=skill` | Search skills only |
| GET | `/marketplace/extensions/:id` | Get marketplace item details |
| POST | `/marketplace/install` | Install from marketplace |
| POST | `/marketplace/publish` | Publish to marketplace |
| GET | `/marketplace/sources` | List available sources |
| POST | `/marketplace/import` | Import from external source |

### Permissions API (`/api/v1/extension-permissions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/permissions` | List all permissions |
| GET | `/permissions/agent/:agentId` | Get agent's permissions |
| POST | `/permissions` | Create permission |
| PUT | `/permissions/:id` | Update permission |
| DELETE | `/permissions/:id` | Delete permission |
| GET | `/permissions/check` | Check execution permission |

### Learning API (`/api/v1/skill-learning`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/patterns` | List detected patterns |
| POST | `/patterns/:id/convert` | Convert pattern to skill |
| POST | `/patterns/:id/dismiss` | Dismiss pattern |
| GET | `/suggestions` | Get optimization suggestions |

---

## Security Model

### Five-Layer Security Architecture

```
Layer 1: Authentication (OAuth 2.1 + PKCE)
  |
  v
Layer 2: Organization Isolation (Multi-tenant data boundaries)
  |
  v
Layer 3: Role-Based Access Control (Admin/Member/Custom)
  |
  v
Layer 4: Extension/Tool Permissions (Granular execution rights)
  |
  v
Layer 5: Execution Sandboxing (isolated-vm + Permission Proxy)
```

### Security Controls

| Control | Implementation |
|---------|----------------|
| Credential Encryption | AES-256-GCM for all stored credentials |
| Token Refresh | Automatic OAuth token refresh with lock coordination |
| Input Validation | Zod schema validation for all skill inputs |
| Output Sanitization | Redact PII/secrets from logs and analytics |
| Rate Limiting | Per-org, per-agent, per-skill limits (Redis-backed) |
| Execution Timeout | Configurable per-skill timeout (default: 60s) |
| Resource Limits | 64MB memory, 500ms CPU via isolated-vm |
| Audit Logging | All skill executions logged to audit_logs |
| Network Isolation | Code skills blocked from direct network access |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Deliverables:**
1. Database migrations for merged extension tables
2. Unified ExtensionRegistry service
3. Enhanced extension-loader supporting DB + YAML
4. Basic extension-resolver with trigger matching
5. Type migration: SkillId branded type + type guards

**Tasks:**
- [ ] Create Prisma schema additions with ExtensionType enum
- [ ] Run migrations and generate client
- [ ] Implement ExtensionRegistry core with SkillId branded type
- [ ] Update skill-loader.ts to use registry (with legacy fallback)
- [ ] Migrate existing YAML skills to registry
- [ ] Add type guards for legacy Skill union migration
- [ ] Write unit tests for registry (>80% coverage)

**Dependencies:** None

**Verification:**
- `npm run db:migrate` succeeds
- Existing skills load from both YAML and DB
- `GET /api/v1/extensions?type=skill` returns unified skill list
- Type guards correctly identify legacy vs new skills

**Rollback Procedure:**
1. Revert migration: `prisma migrate rollback --to 20260128_xxx`
2. Restore skill-loader.ts from git
3. Clear Redis cache: `redis-cli FLUSHDB`

---

### Phase 2: Execution Runtime (Week 2-3)

**Deliverables:**
1. Skill execution runtime with MCP executor
2. isolated-vm sandbox with resource limits
3. Permission Proxy for MCP tool access
4. Prompt-based skill executor
5. Usage logging and analytics

**Tasks:**
- [ ] Implement SkillExecutor interface
- [ ] Build MCP executor using existing mcp-registry
- [ ] Implement isolated-vm sandbox with 64MB/500ms limits
- [ ] Build Permission Proxy for sandboxed MCP access
- [ ] Build prompt executor for AI-based skills
- [ ] Implement isolate pool with pre-warming (3 per org)
- [ ] Add usage logging to ExtensionUsageLog
- [ ] Wire up to orchestrator

**Dependencies:** Phase 1

**Test Coverage Requirements:**
- Unit tests: >80% line coverage
- Integration tests: All execution paths covered
- Performance tests: <500ms cold start, <100ms warm start

**Verification:**
- Skills can execute via `POST /api/v1/extensions/:slug/execute`
- MCP tools are invoked through Permission Proxy
- Resource limits enforced (64MB memory, 500ms CPU)
- Usage logs are created for each execution

**Performance Baseline:**
| Metric | Target | Measurement |
|--------|--------|-------------|
| Cold start | <500ms | `time skill.execute()` first call |
| Warm start | <100ms | `time skill.execute()` with pooled isolate |
| Memory overhead | <10MB | `process.memoryUsage()` before/after |

**Rollback Procedure:**
1. Disable skill execution in orchestrator config
2. Revert executor files from git
3. Keep existing direct MCP execution path

---

### Phase 3: Permission System (Week 3-4)

**Deliverables:**
1. Hierarchical permission resolver
2. Permission management API
3. Approval workflow for restricted skills
4. Redis permission caching with TTL

**Tasks:**
- [ ] Implement PermissionManager with hierarchy resolution
- [ ] Build permission resolver with 5-level hierarchy
- [ ] Create permission management endpoints
- [ ] Integrate approval workflow (extend existing Approval model)
- [ ] Add Redis caching with documented key patterns
- [ ] Implement cache invalidation on permission changes
- [ ] Update executor to check permissions

**Dependencies:** Phase 2

**Test Coverage Requirements:**
- Unit tests: >85% coverage for permission resolver
- Integration tests: All hierarchy combinations tested

**Verification:**
- Permissions are resolved correctly by hierarchy
- Restricted skills trigger approval workflow
- Cache hit rate >90% for repeated checks
- Cache invalidation triggers on permission changes

**Rollback Procedure:**
1. Set feature flag `skill_permissions_enabled: false`
2. Fall back to existing AgentPermissionOverride
3. Clear permission cache keys

---

### Phase 4: External Source Integration (Week 4-5)

**Deliverables:**
1. SkillSource interface for pluggable sources
2. GitHub source client (primary)
3. npm source client (secondary)
4. Skill installation workflow with validation
5. Skill format conversion (SKILL.md, OpenAI Action, LangChain)

**Tasks:**
- [ ] Define SkillSource interface
- [ ] Implement GitHubSkillSource with rate limit handling
- [ ] Implement NpmSkillSource
- [ ] Build unified search across sources
- [ ] Create installation workflow with validation
- [ ] Implement format converters (skill-md, openai-action, langchain)
- [ ] Handle skill format conversion
- [ ] Build admin UI for source management

**Dependencies:** Phase 3

**Verification:**
- Can search GitHub repos with claude-skill topic
- Can search npm packages with skill keyword
- Can install skills from GitHub/npm
- Installed skills are executable
- Format conversion preserves functionality

**Rollback Procedure:**
1. Disable external source installation via feature flag
2. Keep locally installed skills functional
3. Revert source client files

---

### Phase 5: Learning Engine (Week 5-6)

**Deliverables:**
1. Execution pattern tracking
2. Pattern detection algorithms
3. Skill generation from patterns
4. Optimization suggestions

**Tasks:**
- [ ] Implement experience tracker (log execution sequences)
- [ ] Build pattern detection (sequence, retry, composite)
- [ ] Create skill generator from patterns
- [ ] Add optimization suggestion engine
- [ ] Build review UI for patterns
- [ ] Integrate with Meta Agent

**Dependencies:** Phase 2

**Test Coverage Requirements:**
- Unit tests: >75% coverage
- Integration tests: Pattern detection accuracy >80%

**Verification:**
- Patterns are detected from execution history
- Generated skills are valid and executable
- Suggestions improve skill performance metrics

**Rollback Procedure:**
1. Stop pattern detection job
2. Keep existing manually created skills
3. Clear pattern tables (optional)

---

### Phase 6: Publishing & Ecosystem (Week 6-8)

**Deliverables:**
1. Publisher account management
2. Skill publishing workflow
3. Version management
4. Rating and review system

**Tasks:**
- [ ] Build publisher registration (extend ExtensionPublisher)
- [ ] Create publishing validation workflow
- [ ] Implement version management with semver
- [ ] Add rating/review functionality
- [ ] Build publisher dashboard
- [ ] Documentation and examples

**Dependencies:** Phase 4

**Verification:**
- Organizations can register as publishers
- Published skills appear in marketplace search
- Version upgrades work correctly
- Ratings persist and aggregate correctly

**Rollback Procedure:**
1. Disable publishing via feature flag
2. Keep existing published skills visible
3. Revert publisher-related endpoints

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Malicious marketplace skills | HIGH | Code review, isolated-vm sandbox, publisher verification |
| Permission escalation | HIGH | Strict hierarchy, no self-grant, audit logging |
| Token/credential leakage | HIGH | Encryption at rest, redaction in logs, no client exposure |
| Performance degradation | MEDIUM | Permission caching, isolate pooling, async execution |
| Breaking changes to existing skills | MEDIUM | Backward-compatible type migration, version pinning |
| External API rate limits | MEDIUM | Rate limit handling, caching, graceful degradation |
| isolated-vm security bypass | HIGH | Regular package updates, security monitoring, fallback to process isolation |

---

## Verification Criteria

### Phase 1 Verification
- [ ] All migrations apply cleanly
- [ ] YAML skills load as before (backward compatible)
- [ ] DB skills can be created and retrieved
- [ ] Trigger matching works for both sources
- [ ] Type guards correctly identify skill types

### Phase 2 Verification
- [ ] Skills execute via API
- [ ] MCP tools are invoked via Permission Proxy
- [ ] Prompt skills produce valid output
- [ ] Execution logs are created
- [ ] Resource limits enforced (test with memory/CPU intensive skill)
- [ ] Performance baselines met

### Phase 3 Verification
- [ ] Permission hierarchy resolves correctly
- [ ] Denied executions return 403
- [ ] Approval workflow triggers for restricted skills
- [ ] Cache hit rate >90%
- [ ] Cache invalidation works within 1 second

### Phase 4 Verification
- [ ] GitHub search returns results
- [ ] npm search returns results
- [ ] Skills install successfully from both sources
- [ ] Format conversion preserves functionality
- [ ] Installed skills execute correctly

### Phase 5 Verification
- [ ] Patterns detected in test data (>80% accuracy)
- [ ] Generated skills are valid
- [ ] Suggestions improve metrics

### Phase 6 Verification
- [ ] Publishing workflow completes
- [ ] Published skills searchable
- [ ] Version upgrades apply
- [ ] Ratings persist

---

## Success Criteria

1. **Compatibility**: Successfully import 10+ skills from GitHub repos
2. **Performance**: Skill execution <500ms for 95th percentile (warm)
3. **Security**: Zero credential leaks in 30-day audit
4. **Adoption**: 50% of agents using marketplace skills within 60 days
5. **Evolution**: 5+ skills auto-generated from patterns within 90 days

---

## Test Coverage Requirements

| Module | Unit Test | Integration Test | E2E Test |
|--------|-----------|------------------|----------|
| extension-registry | >80% | Required | Optional |
| skill-runtime | >80% | Required | Required |
| permission-resolver | >85% | Required | Required |
| marketplace sources | >75% | Required | Optional |
| learning engine | >75% | Required | Optional |

---

## Files to Create/Modify

### New Files
```
src/services/extension-registry/
  index.ts
  extension-registry.ts
  extension-loader.ts
  extension-resolver.ts
  extension-validator.ts
  types.ts
  formats/skill-md.ts
  formats/openai-action.ts
  formats/langchain-tool.ts

src/services/skill-runtime/
  index.ts
  skill-executor.ts
  executors/mcp-executor.ts
  executors/code-executor.ts
  executors/prompt-executor.ts
  executors/composite-executor.ts
  sandbox/isolate-pool.ts
  sandbox/permission-proxy.ts
  sandbox/resource-limiter.ts

src/services/marketplace/
  skill-discovery.ts
  skill-installer.ts
  sources/github-source.ts
  sources/npm-source.ts
  sources/source-interface.ts

src/services/extension-permissions/
  index.ts
  permission-resolver.ts
  permission-cache.ts
  approval-workflow.ts

src/services/skill-learning/
  index.ts
  pattern-detector.ts
  skill-generator.ts
  experience-tracker.ts

src/api/extensions.ts
src/api/extension-permissions.ts
src/api/skill-learning.ts

prisma/migrations/20260129_add_skill_ecosystem/
```

### Modified Files
```
prisma/schema.prisma           # Add merged extension tables + enum
src/config/skill-loader.ts     # Use unified registry with legacy fallback
src/orchestrator/skill-selector.ts  # Delegate to registry, merge with legacy
src/orchestrator/types.ts      # Add SkillId branded type, deprecate Skill union
src/services/mcp-registry.ts   # Add tool permission checks
src/index.ts                   # Register new routes
```

---

**PLAN_READY: .omc/plans/skill-mcp-ecosystem.md**
