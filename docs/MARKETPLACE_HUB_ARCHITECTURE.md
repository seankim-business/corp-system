# Marketplace Hub Architecture

> 외부 AI 생태계(MCP, ComfyUI, Prompts, Agents)를 Nubabel에 통합하는 허브 시스템

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Nubabel Marketplace Hub                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Unified Search API                           │   │
│  │   GET /api/marketplace-hub/search?q=...&sources=...       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ MCP Sources │     │ Workflow    │     │ Prompt      │       │
│  │             │     │ Sources     │     │ Sources     │       │
│  │ - Smithery  │     │ - ComfyUI   │     │ - LangChain │       │
│  │ - Official  │     │ - CivitAI   │     │ - PromptLyr │       │
│  │ - Glama     │     │             │     │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Installation Executor                        │   │
│  │   - npx/uvx (MCP servers)                                │   │
│  │   - git clone + pip (ComfyUI nodes)                      │   │
│  │   - API pull (Prompts)                                   │   │
│  │   - Download + Import (Workflows)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Tool Recommender (AI-Powered)                │   │
│  │   - Analyze user request → suggest tools                 │   │
│  │   - Auto-install (YOLO mode) or ask for approval         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 1. External Sources

### 1.1 Base Interface

```typescript
// src/marketplace/services/sources/base-external-source.ts

export interface ExternalSourceItem {
  // Universal fields
  id: string;
  source: string; // 'smithery' | 'mcp-registry' | 'comfyui' | etc.
  type: ExtensionType; // 'mcp_server' | 'skill' | 'workflow' | 'prompt'
  name: string;
  description: string;
  version?: string;

  // Metadata
  author?: string;
  repository?: string;
  homepage?: string;
  license?: string;
  tags?: string[];

  // Stats
  downloads?: number;
  stars?: number;
  rating?: number;

  // Installation
  installMethod: InstallMethod;
  installConfig: InstallConfig;

  // Raw data from source
  rawData?: unknown;
}

export type InstallMethod =
  | "npx" // npx -y @package/name
  | "uvx" // uvx package-name
  | "docker" // docker run ...
  | "http" // Remote MCP server
  | "git" // git clone + setup
  | "download" // Direct file download
  | "api" // Pull via API (LangChain Hub)
  | "manual"; // Manual installation required

export interface InstallConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  configSchema?: JSONSchema;
}

export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  type?: ExtensionType;
  tags?: string[];
}

export abstract class BaseExternalSource {
  abstract readonly sourceId: string;
  abstract readonly displayName: string;
  abstract readonly supportedTypes: ExtensionType[];

  abstract search(options: SearchOptions): Promise<ExternalSourceItem[]>;
  abstract getById(id: string): Promise<ExternalSourceItem | null>;
  abstract getInstallInstructions(item: ExternalSourceItem): Promise<string>;
}
```

### 1.2 MCP Sources

#### Smithery Source

```typescript
// src/marketplace/services/sources/smithery-source.ts

import { Smithery } from "@smithery/api";

export class SmitherySource extends BaseExternalSource {
  readonly sourceId = "smithery";
  readonly displayName = "Smithery";
  readonly supportedTypes = ["mcp_server"];

  private client: Smithery;

  constructor(apiKey?: string) {
    this.client = new Smithery({
      apiKey: apiKey || process.env.SMITHERY_API_KEY,
    });
  }

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    const results = await this.client.servers.list({
      q: options.query,
      pageSize: options.limit || 20,
    });

    return results.map((server) => this.mapToItem(server));
  }

  private mapToItem(server: SmitheryServer): ExternalSourceItem {
    return {
      id: server.qualifiedName,
      source: "smithery",
      type: "mcp_server",
      name: server.displayName,
      description: server.description,
      // ... installation config based on server.connections
    };
  }
}
```

#### Official MCP Registry Source

```typescript
// src/marketplace/services/sources/mcp-registry-source.ts

export class MCPRegistrySource extends BaseExternalSource {
  readonly sourceId = "mcp-registry";
  readonly displayName = "MCP Registry";
  readonly supportedTypes = ["mcp_server"];

  private baseUrl = "https://registry.modelcontextprotocol.io/v0.1";

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    const params = new URLSearchParams({
      limit: String(options.limit || 100),
      ...(options.query && { search: options.query }),
    });

    const response = await fetch(`${this.baseUrl}/servers?${params}`);
    const data = await response.json();

    return data.servers.map((s) => this.mapToItem(s.server));
  }
}
```

#### Glama Source

```typescript
// src/marketplace/services/sources/glama-source.ts

export class GlamaSource extends BaseExternalSource {
  readonly sourceId = "glama";
  readonly displayName = "Glama";
  readonly supportedTypes = ["mcp_server"];

  private baseUrl = "https://glama.ai";

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    // Glama MCP server search
    const response = await fetch(`${this.baseUrl}/mcp/servers?query=${options.query}`);
    // ... map results
  }
}
```

### 1.3 Workflow Sources

#### ComfyUI Registry Source

```typescript
// src/marketplace/services/sources/comfyui-source.ts

export class ComfyUISource extends BaseExternalSource {
  readonly sourceId = "comfyui";
  readonly displayName = "ComfyUI Registry";
  readonly supportedTypes = ["extension", "workflow"];

  private baseUrl = "https://api.comfy.org";

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    const params = new URLSearchParams({
      limit: String(options.limit || 20),
      ...(options.query && { q: options.query }),
    });

    const response = await fetch(`${this.baseUrl}/nodes?${params}`);
    const data = await response.json();

    return data.nodes.map((node) => ({
      id: node.id,
      source: "comfyui",
      type: "extension",
      name: node.name,
      description: node.description,
      installMethod: "git",
      installConfig: {
        url: node.repository,
      },
      downloads: node.downloads,
      stars: node.github_stars,
    }));
  }
}
```

#### CivitAI Source

```typescript
// src/marketplace/services/sources/civitai-source.ts

export class CivitAISource extends BaseExternalSource {
  readonly sourceId = "civitai";
  readonly displayName = "CivitAI";
  readonly supportedTypes = ["workflow", "extension"];

  private baseUrl = "https://civitai.com/api/v1";

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    const response = await fetch(
      `${this.baseUrl}/models?query=${options.query}&types=Workflows&limit=${options.limit}`,
    );
    // ... map results
  }
}
```

### 1.4 Prompt Sources

#### LangChain Hub Source

```typescript
// src/marketplace/services/sources/langchain-hub-source.ts

export class LangChainHubSource extends BaseExternalSource {
  readonly sourceId = "langchain-hub";
  readonly displayName = "LangChain Hub";
  readonly supportedTypes = ["prompt", "skill"];

  async search(options: SearchOptions): Promise<ExternalSourceItem[]> {
    // LangChain Hub uses langsmith SDK
    // Search via LangSmith API
  }

  async pullPrompt(repoPath: string): Promise<unknown> {
    // Uses hub.pull() functionality
  }
}
```

## 2. Installation Executor

```typescript
// src/marketplace/services/installation-executor.ts

export class InstallationExecutor {
  async install(
    item: ExternalSourceItem,
    orgId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    switch (item.installMethod) {
      case "npx":
        return this.installNpx(item, orgId, config);
      case "uvx":
        return this.installUvx(item, orgId, config);
      case "docker":
        return this.installDocker(item, orgId, config);
      case "http":
        return this.installHttp(item, orgId, config);
      case "git":
        return this.installGit(item, orgId, config);
      case "api":
        return this.installApi(item, orgId, config);
      default:
        throw new Error(`Unsupported install method: ${item.installMethod}`);
    }
  }

  private async installNpx(
    item: ExternalSourceItem,
    orgId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    // 1. Create MCP server config
    const mcpConfig = {
      command: "npx",
      args: ["-y", item.installConfig.command!, ...(item.installConfig.args || [])],
      env: { ...item.installConfig.env, ...config },
    };

    // 2. Register in MCPConnection
    await prisma.mCPConnection.create({
      data: {
        organizationId: orgId,
        provider: item.source,
        namespace: item.id,
        name: item.name,
        config: mcpConfig,
        enabled: true,
      },
    });

    // 3. Create MarketplaceExtension record
    await prisma.marketplaceExtension.create({
      data: {
        organizationId: orgId,
        slug: item.id,
        name: item.name,
        description: item.description,
        extensionType: "mcp_server",
        source: item.source,
        // ...
      },
    });

    return { success: true, extensionId: item.id };
  }
}
```

## 3. Tool Recommender

```typescript
// src/marketplace/services/tool-recommender.ts

export class ToolRecommender {
  private sources: BaseExternalSource[];
  private aiProvider: AIProvider;

  async recommendTools(
    request: string,
    context: RecommendationContext,
  ): Promise<ToolRecommendation[]> {
    // 1. Analyze request with AI
    const analysis = await this.analyzeRequest(request);

    // 2. Search across all sources
    const searchPromises = this.sources.map((source) =>
      source.search({
        query: analysis.searchQuery,
        type: analysis.preferredType,
        limit: 5,
      }),
    );

    const results = await Promise.all(searchPromises);
    const allItems = results.flat();

    // 3. Rank and filter
    const ranked = await this.rankItems(allItems, analysis);

    // 4. Return recommendations
    return ranked.slice(0, 5).map((item) => ({
      item,
      reason: this.generateReason(item, analysis),
      confidence: item.score,
    }));
  }

  private async analyzeRequest(request: string): Promise<RequestAnalysis> {
    const prompt = `
Analyze this user request and identify what external tools might be helpful:

Request: "${request}"

Return JSON:
{
  "searchQuery": "search terms for finding relevant tools",
  "preferredType": "mcp_server" | "workflow" | "prompt" | "skill",
  "capabilities": ["list", "of", "needed", "capabilities"],
  "urgency": "high" | "medium" | "low"
}
`;

    const result = await this.aiProvider.complete(prompt);
    return JSON.parse(result);
  }
}
```

## 4. Installation Modes

### 4.1 Mode Configuration

```typescript
// src/marketplace/types/installation-modes.ts

export type InstallationMode =
  | "manual" // User must explicitly install
  | "recommend" // Bot recommends, user approves
  | "yolo"; // Bot auto-installs

export interface InstallationPolicy {
  mode: InstallationMode;
  allowedSources?: string[]; // Whitelist of sources
  blockedSources?: string[]; // Blacklist of sources
  maxAutoInstalls?: number; // Max auto-installs per session
  requireReview?: boolean; // Require human review for YOLO
}
```

### 4.2 Organization Settings

```prisma
// prisma/schema.prisma additions

model OrganizationSettings {
  id                String @id @default(uuid())
  organizationId    String @unique

  // Marketplace Hub settings
  installationMode  String @default("recommend")  // manual, recommend, yolo
  allowedSources    String[] @default([])
  blockedSources    String[] @default([])
  maxAutoInstalls   Int @default(5)

  organization      Organization @relation(...)
}

model AgentInstallationPolicy {
  id                String @id @default(uuid())
  organizationId    String
  agentId           String

  // Per-agent override
  installationMode  String?
  allowedSources    String[]

  @@unique([organizationId, agentId])
}
```

### 4.3 Flow by Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Request                                  │
│  "Slack에서 메시지 보내줘"                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Tool Recommender Analysis                           │
│  → Needs: Slack MCP Server                                       │
│  → Found: @anthropic/slack-mcp (Smithery)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    [mode=manual]      [mode=recommend]      [mode=yolo]
          │                   │                   │
          ▼                   ▼                   ▼
    "Slack MCP가       "Slack MCP 설치할까요?    자동으로 설치
    필요합니다.         [설치] [취소]"           + 바로 실행
    직접 설치하세요"
```

## 5. API Endpoints

### 5.1 Search API

```typescript
// GET /api/marketplace-hub/search
router.get("/search", requireAuth, async (req, res) => {
  const {
    q,
    sources = "all", // 'all' | 'mcp' | 'comfyui' | 'prompts' | comma-separated
    type, // 'mcp_server' | 'skill' | 'workflow' | 'prompt'
    limit = 20,
  } = req.query;

  const hub = new MarketplaceHub();
  const results = await hub.search({
    query: q,
    sources: sources === "all" ? undefined : sources.split(","),
    type,
    limit: parseInt(limit),
  });

  res.json({ success: true, data: results });
});
```

### 5.2 Install API

```typescript
// POST /api/marketplace-hub/install
router.post("/install", requireAuth, async (req, res) => {
  const { source, itemId, config } = req.body;
  const orgId = req.user.organizationId;

  const hub = new MarketplaceHub();
  const result = await hub.install({
    source,
    itemId,
    orgId,
    config,
  });

  res.json({ success: true, data: result });
});
```

### 5.3 Recommend API

```typescript
// POST /api/marketplace-hub/recommend
router.post("/recommend", requireAuth, async (req, res) => {
  const { request, context } = req.body;
  const orgId = req.user.organizationId;

  const recommender = new ToolRecommender();
  const recommendations = await recommender.recommendTools(request, {
    orgId,
    ...context,
  });

  res.json({ success: true, data: recommendations });
});
```

## 6. Database Schema Extensions

```prisma
// prisma/schema.prisma additions

/// External marketplace connection credentials
model ExternalMarketplaceCredential {
  id             String @id @default(uuid())
  organizationId String

  source         String   // smithery, langchain-hub, etc.
  apiKey         String?  // Encrypted
  accessToken    String?  // Encrypted
  refreshToken   String?  // Encrypted
  expiresAt      DateTime?

  enabled        Boolean @default(true)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)

  @@unique([organizationId, source])
}

/// Installation queue for background processing
model InstallationQueue {
  id             String @id @default(uuid())
  organizationId String

  source         String
  itemId         String
  itemName       String
  itemType       String

  status         String @default("pending")  // pending, installing, completed, failed
  config         Json?
  error          String?

  requestedBy    String   // User or Agent ID
  requestedAt    DateTime @default(now())
  completedAt    DateTime?

  // Approval tracking (for recommend mode)
  requiresApproval Boolean @default(false)
  approvedBy       String?
  approvedAt       DateTime?

  organization   Organization @relation(...)
}
```

## 7. Implementation Priority

### Phase 1: Core Infrastructure (Week 1)

1. ✅ BaseExternalSource interface
2. ✅ SmitherySource + MCPRegistrySource
3. ✅ Basic search API
4. ✅ Simple installation executor (npx/uvx)

### Phase 2: More Sources (Week 2)

1. GlamaSource
2. ComfyUISource
3. LangChainHubSource
4. Installation executor extensions

### Phase 3: Intelligence (Week 3)

1. ToolRecommender with AI analysis
2. Installation modes (manual/recommend/yolo)
3. Per-org and per-agent policies

### Phase 4: Polish (Week 4)

1. Frontend Marketplace Hub page
2. Installation queue with background processing
3. Usage analytics
4. Error handling and retry logic

## 8. Security Considerations

### 8.1 API Key Management

- All external API keys stored encrypted
- Keys scoped to organization
- Rotation support

### 8.2 Installation Sandboxing

- MCP servers run in isolated processes
- Resource limits per server
- Network policies for remote servers

### 8.3 Audit Logging

- All installations logged
- YOLO mode actions highlighted
- Compliance reporting

## 9. Monitoring

### 9.1 Metrics

- Search latency per source
- Installation success/failure rates
- YOLO vs manual installation ratio
- Most popular tools per org

### 9.2 Alerts

- External API failures
- Installation timeouts
- Unusual YOLO activity
