# Mega App Architecture Plan: Fashion Value Stream Integration

> **Status**: REVISION 2 - Addressing Critic Feedback
> **Created**: 2026-01-30
> **Updated**: 2026-01-30 (Iteration 2)
> **Author**: Planner Agent (Ralplan)

---

## 0. Critical Decisions (Addressing Critic Feedback)

### Decision 1: Event Bus Implementation
**Use BullMQ Events** for Value Stream Bus.

**Rationale**: Nubabel already uses BullMQ for job queues (`src/queue/orchestration.queue.ts`). Adding a separate Redis Pub/Sub would create unnecessary complexity. BullMQ's event system provides:
- Job completion events (`completed`, `failed`, `progress`)
- Persistent queue with retry logic
- Already integrated with existing worker pattern

**Implementation**: Create `src/queue/value-stream.queue.ts` following existing `orchestration.queue.ts` pattern.

### Decision 2: Orchestrator Integration
**Mega App Manager uses existing Orchestrator**.

Modules execute via the existing `delegateTask()` function (`src/orchestrator/delegate-task.ts`). The relationship:
- Module agents are registered as new skills in `ExtensionRegistry`
- Module execution uses existing `AgentExecution` table (NOT creating new `ModuleExecution`)
- Mega App Manager is a **coordination layer on top** of Orchestrator, not a parallel system

### Decision 3: Extension System Integration
**Mega App modules ARE MarketplaceExtensions with a new `moduleConfig` field**.

- Use existing `ExtensionRegistry` service (`src/services/extension-registry/extension-registry.ts`)
- Add `megaAppConfig` JSON field to `MarketplaceExtension` schema
- `kyndof-fashion` will be MIGRATED (not deprecated) to the new structure

### Decision 4: Database Schema Compatibility
**Verified compatibility with existing 80+ tables**.

- `AgentTeam` is RENAMED to `MegaAppTeam` to avoid conflict with existing `Team` model
- All new tables follow existing naming conventions and index patterns
- Migration will be tested with `npx prisma validate` before implementation

### Decision 5: User Role Assignment
**Extend existing Membership model** instead of creating separate role assignment.

- Add `megaAppRoleId` field to existing `Membership` table
- This links users to `MegaAppRole` via their organization membership

### Decision 6: Timeline Adjustment
**Extended to 16 weeks with MVP scope**.

- Phase 1 (Week 1-4): Mega App MVP with 3 core modules
- Phase 2 (Week 5-10): Full module chain
- Phase 3 (Week 11-16): Polish, dynamic scaling, advanced features

---

## 1. Executive Summary

### Vision
**"Tenant의 조직이 필요로 하는 기능들을 담은 Mega App"** - 패션 밸류스트림 전체를 연결하는 모듈형 플랫폼을 구축합니다. 각 모듈은 독립적으로 동작하면서도 데이터가 자연스럽게 흘러 **Value Stream Continuity**를 보장합니다.

### Core Principles
1. **Module Independence**: 각 모듈은 제한된 컨텍스트에서 최적의 결과
2. **Data Flow Continuity**: 모듈 간 데이터가 끊김 없이 연결
3. **Order-Independent Development**: 개발 순서와 상관없이 연결 가능
4. **Mega App Manager**: 전체를 관리하고 기획하는 오케스트레이션 레이어

---

## 2. Value Stream Analysis

### 2.1 Target Value Stream (End-to-End)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         FASHION VALUE STREAM                                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │ Fashion │───▶│ Product │───▶│ Design  │───▶│ Work    │───▶│ Work    │        │
│  │ Research│    │ Planning│    │ Auto    │    │ Order   │    │ Instruct│        │
│  │ AI      │    │ AI      │    │         │    │ Auto    │    │ Notes   │        │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘        │
│       │              │              │              │              │              │
│       ▼              ▼              ▼              ▼              ▼              │
│  [Trend Data]   [SKU Plan]    [Design File] [Order Sheet]  [QC Notes]          │
│                                     │              │              │              │
│                                     │              │              │              │
│                              ┌──────┴──────────────┴──────────────┘              │
│                              │                                                   │
│                              ▼                                                   │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │Material │───▶│ Line    │───▶│ Cost    │───▶│ Sales   │───▶│ [Future]│        │
│  │ Sourcing│    │ Sheet   │    │ Predict │    │ Predict │    │ Modules │        │
│  │ Tips    │    │ Auto    │    │         │    │         │    │         │        │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘        │
│       │              │              │              │                             │
│       ▼              ▼              ▼              ▼                             │
│  [Material List] [Line Sheet]  [Cost Est.]   [Sales Forecast]                    │
│       │                                                                          │
│       └────────────────▶ Feedback to Design & Work Order ◀───────────────────────│
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Definitions

| # | Module ID | Module Name | Input | Output | Dependencies |
|---|-----------|-------------|-------|--------|--------------|
| 1 | `fashion-research` | 패션리서치 AI | Market data, Social trends | Trend report, Keywords | None |
| 2 | `product-planning` | 상품구성 기획 AI | Trend report | SKU plan, Category mix | fashion-research |
| 3 | `design-auto` | 디자인 자동화 | SKU plan, Trend data | Design files, Mockups | product-planning |
| 4 | `work-order` | 작업지시서 자동 | Design files | Tech pack, Specs | design-auto |
| 5 | `work-instructions` | 작업 주의사항 | Design + Material | QC notes, Warnings | work-order, material-sourcing |
| 6 | `material-sourcing` | 부자재 소싱 팁 | Design specs | Material list, Suppliers | design-auto |
| 7 | `line-sheet` | 라인시트 생성 | Designs, SKU info | Line sheet PDF/Excel | design-auto, product-planning |
| 8 | `cost-prediction` | 생산비 예측 | Materials, Labor rates | Cost breakdown | work-order, material-sourcing |
| 9 | `sales-prediction` | 판매량 예측 | Historical data, Trends | Sales forecast | fashion-research, product-planning |

### 2.3 Data Flow Contracts (API Interfaces)

각 모듈 간 데이터 교환을 위한 **Standardized Data Contract**:

```typescript
// Core Data Types
interface ValueStreamArtifact {
  id: string;
  moduleId: string;
  organizationId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'review' | 'approved' | 'archived';
  data: unknown; // Module-specific data
  metadata: {
    upstream: ArtifactReference[]; // What this was created from
    downstream: ArtifactReference[]; // What was created from this
    tags: string[];
    seasonCode: string; // e.g., "2026SS"
    collectionId?: string;
  };
}

interface ArtifactReference {
  artifactId: string;
  moduleId: string;
  version: number;
  relationshipType: 'source' | 'derived' | 'reference';
}

// Module-Specific Data Interfaces
interface TrendReport extends ValueStreamArtifact {
  moduleId: 'fashion-research';
  data: {
    trends: TrendItem[];
    keywords: string[];
    colorPalette: Color[];
    targetDemographic: Demographic;
    marketInsights: string[];
  };
}

interface SKUPlan extends ValueStreamArtifact {
  moduleId: 'product-planning';
  data: {
    categories: ProductCategory[];
    skuCount: number;
    pricePoints: PriceRange[];
    targetMargin: number;
    seasonalMix: Record<string, number>;
  };
}

interface DesignFile extends ValueStreamArtifact {
  moduleId: 'design-auto';
  data: {
    designType: 'cad' | 'mockup' | 'tech-drawing';
    fileUrls: string[];
    specifications: GarmentSpec;
    colorways: Colorway[];
    sizeRange: string[];
  };
}

// ... Additional interfaces for each module
```

---

## 3. Architecture Design

### 3.1 System Architecture (Mega App Layer)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              MEGA APP LAYER                                       │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                     Mega App Manager (Orchestration)                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │ Module      │  │ Data Flow   │  │ Dependency  │  │ Health &    │        │ │
│  │  │ Registry    │  │ Controller  │  │ Resolver    │  │ Monitoring  │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                          │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                        Value Stream Bus (Event-Driven)                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │ │
│  │  │  artifact.created | artifact.updated | module.completed | ...       │   │ │
│  │  └─────────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                          │
│       ┌───────────────────────────────┼───────────────────────────────┐          │
│       │               │               │               │               │          │
│       ▼               ▼               ▼               ▼               ▼          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │ Module  │    │ Module  │    │ Module  │    │ Module  │    │ Module  │        │
│  │   1     │    │   2     │    │   3     │    │   ...   │    │   N     │        │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘        │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           NUBABEL CORE PLATFORM                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │Extension │  │ AI       │  │ MCP      │  │ Workflow │  │ Storage  │           │
│  │ System   │  │Orchestr. │  │ Registry │  │ Engine   │  │ (DB/S3)  │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Mega App Manager Components

#### 3.2.1 Module Registry
```typescript
// src/mega-app/registry/module-registry.ts
interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;

  // Input/Output contracts
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;

  // Dependencies
  requiredInputs: string[]; // Module IDs that must provide input
  optionalInputs: string[]; // Can enhance if available

  // Execution
  executorType: 'ai-agent' | 'workflow' | 'mcp-tool' | 'hybrid';
  executorConfig: ModuleExecutorConfig;

  // UI
  dashboardComponent?: string;
  settingsComponent?: string;
}

interface ModuleRegistry {
  register(module: ModuleDefinition): Promise<void>;
  unregister(moduleId: string): Promise<void>;
  get(moduleId: string): ModuleDefinition | undefined;
  list(filter?: ModuleFilter): ModuleDefinition[];

  // Dependency resolution
  getDependencies(moduleId: string): string[];
  getDependents(moduleId: string): string[];
  getExecutionOrder(targetModuleIds: string[]): string[];
}
```

#### 3.2.2 Data Flow Controller
```typescript
// src/mega-app/flow/data-flow-controller.ts
interface DataFlowController {
  // Artifact management
  createArtifact<T extends ValueStreamArtifact>(
    moduleId: string,
    data: T['data'],
    upstreamRefs?: ArtifactReference[]
  ): Promise<T>;

  updateArtifact<T extends ValueStreamArtifact>(
    artifactId: string,
    updates: Partial<T['data']>
  ): Promise<T>;

  // Lineage tracking
  getUpstream(artifactId: string, depth?: number): Promise<ArtifactReference[]>;
  getDownstream(artifactId: string, depth?: number): Promise<ArtifactReference[]>;

  // Auto-propagation
  propagateChanges(
    artifactId: string,
    options?: PropagationOptions
  ): Promise<PropagationResult>;

  // Subscriptions
  onArtifactCreated(
    moduleId: string,
    callback: (artifact: ValueStreamArtifact) => void
  ): Unsubscribe;
}
```

#### 3.2.3 Dependency Resolver
```typescript
// src/mega-app/resolver/dependency-resolver.ts
interface DependencyResolver {
  // Check if module can execute
  canExecute(moduleId: string, context: ExecutionContext): CanExecuteResult;

  // Find missing dependencies
  getMissingInputs(moduleId: string, context: ExecutionContext): MissingInput[];

  // Suggest execution path
  suggestPath(
    fromState: ValueStreamState,
    toModuleId: string
  ): ExecutionPath[];

  // Auto-execute dependencies
  resolveAndExecute(
    moduleId: string,
    context: ExecutionContext,
    options?: ResolveOptions
  ): Promise<ExecutionResult>;
}
```

### 3.3 Integration with Existing Extension System

**How Mega App integrates with ExtensionRegistry**:

```typescript
// Existing ExtensionRegistry service is REUSED
// File: src/services/extension-registry/extension-registry.ts

// Mega App modules are registered as MarketplaceExtension with extensionType='module'
// The new `megaAppConfig` field contains module-specific configuration

interface MegaAppModuleConfig {
  moduleId: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  requiredInputs: string[];
  optionalInputs: string[];
  executorConfig: {
    type: 'ai-agent' | 'workflow' | 'mcp-tool';
    agentId?: string;
    workflowId?: string;
    mcpTool?: string;
  };
}

// Example: Registering a Mega App module
const fashionResearchModule = await extensionRegistry.registerExtension(orgId, {
  slug: 'fashion-research',
  name: 'Fashion Research AI',
  extensionType: 'module', // NEW extension type
  category: 'mega-app',
  runtimeType: 'agent',
  // ... standard fields
  megaAppConfig: {
    moduleId: 'fashion-research',
    inputSchema: { /* ... */ },
    outputSchema: { /* ... */ },
    requiredInputs: [],
    optionalInputs: [],
  }
});
```

**Migration path for kyndof-fashion**:
1. Add `megaAppConfig` to existing extension manifest
2. Split CLO3D tools into `design-automation` module
3. Keep backward compatibility during transition (6 weeks)
4. Deprecate old structure after full migration

### 3.4 Database Schema Extensions

**Pre-implementation Validation**:
```bash
# MUST run before applying migration
npx prisma validate
npx prisma migrate dev --name mega-app-schema --create-only
# Review generated migration SQL before applying
```

**Compatibility Notes**:
- `MegaAppTeam` (not `AgentTeam`) to avoid conflict with existing `Team` model
- All new tables follow existing index patterns from schema.prisma
- Foreign keys reference existing `Organization`, `User` tables

```prisma
// prisma/schema.prisma additions

// ============================================================================
// MEGA APP - VALUE STREAM TABLES
// ============================================================================

/// Value Stream Artifacts (Core data flowing between modules)
model ValueStreamArtifact {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  moduleId       String   @map("module_id") @db.VarChar(100)

  // Versioning
  version        Int      @default(1)
  previousVersion String? @map("previous_version") @db.Uuid

  // Status
  status         String   @default("draft") @db.VarChar(50)

  // Data
  data           Json     @db.JsonB

  // Metadata
  seasonCode     String?  @map("season_code") @db.VarChar(20)
  collectionId   String?  @map("collection_id") @db.Uuid
  tags           String[] @default([]) @db.VarChar(100)

  // Timestamps
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy      String?  @map("created_by") @db.Uuid

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  upstreamLinks  ArtifactLink[] @relation("DownstreamArtifact")
  downstreamLinks ArtifactLink[] @relation("UpstreamArtifact")

  @@index([organizationId, moduleId])
  @@index([organizationId, seasonCode])
  @@index([organizationId, status])
  @@index([collectionId])
  @@map("value_stream_artifacts")
}

/// Artifact Links (Lineage tracking)
model ArtifactLink {
  id               String   @id @default(uuid()) @db.Uuid
  upstreamId       String   @map("upstream_id") @db.Uuid
  downstreamId     String   @map("downstream_id") @db.Uuid
  relationshipType String   @map("relationship_type") @db.VarChar(50) // source, derived, reference

  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  upstream         ValueStreamArtifact @relation("UpstreamArtifact", fields: [upstreamId], references: [id], onDelete: Cascade)
  downstream       ValueStreamArtifact @relation("DownstreamArtifact", fields: [downstreamId], references: [id], onDelete: Cascade)

  @@unique([upstreamId, downstreamId])
  @@index([upstreamId])
  @@index([downstreamId])
  @@map("artifact_links")
}

/// Module Definitions (Stored module metadata)
model MegaAppModule {
  id             String   @id @db.VarChar(100) // e.g., "fashion-research"
  organizationId String   @map("organization_id") @db.Uuid

  name           String   @db.VarChar(255)
  description    String?  @db.Text
  version        String   @db.VarChar(50)

  // Schemas
  inputSchema    Json     @map("input_schema") @db.JsonB
  outputSchema   Json     @map("output_schema") @db.JsonB

  // Dependencies
  requiredInputs String[] @default([]) @map("required_inputs") @db.VarChar(100)
  optionalInputs String[] @default([]) @map("optional_inputs") @db.VarChar(100)

  // Executor
  executorType   String   @map("executor_type") @db.VarChar(50)
  executorConfig Json     @map("executor_config") @db.JsonB

  // Status
  enabled        Boolean  @default(true)
  status         String   @default("draft") @db.VarChar(50) // draft, active, deprecated

  // Timestamps
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, id])
  @@index([organizationId, enabled])
  @@map("mega_app_modules")
}

// NOTE: Module executions use existing AgentExecution table
// No separate ModuleExecution table needed (Critic feedback addressed)
//
// To track module executions:
// - Use AgentExecution.metadata.moduleId for module context
// - Use AgentExecution.inputData for input artifact references
// - Use AgentExecution.outputData for output artifact references

/// Value Stream Templates (Pre-defined flows)
model ValueStreamTemplate {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String?  @map("organization_id") @db.Uuid // NULL = global template

  name           String   @db.VarChar(255)
  description    String?  @db.Text

  // Flow definition
  moduleOrder    String[] @map("module_order") @db.VarChar(100)
  flowConfig     Json     @map("flow_config") @db.JsonB

  // Usage
  isPublic       Boolean  @default(false) @map("is_public")
  usageCount     Int      @default(0) @map("usage_count")

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([organizationId])
  @@index([isPublic])
  @@map("value_stream_templates")
}
```

---

## 4. Module Implementation Strategy

### 4.1 Module Structure

각 모듈은 **독립적인 Extension**으로 구현:

```
extensions/
├── kyndof-fashion/                    # Existing (refactor)
│   └── extension.yaml
│
├── mega-app-core/                     # NEW: Core module manager
│   ├── extension.yaml
│   ├── src/
│   │   ├── registry/
│   │   ├── flow/
│   │   ├── resolver/
│   │   └── ui/
│   └── index.ts
│
├── fashion-research/                  # Module 1
│   ├── extension.yaml
│   ├── agents/
│   │   └── trend-analyst.yaml
│   ├── skills/
│   │   ├── trend-scraping.yaml
│   │   └── keyword-extraction.yaml
│   ├── mcp/
│   │   ├── google-trends/
│   │   └── social-media/
│   └── index.ts
│
├── product-planning/                  # Module 2
│   ├── extension.yaml
│   ├── agents/
│   │   └── md-planner.yaml
│   ├── skills/
│   │   ├── sku-optimization.yaml
│   │   └── category-mix.yaml
│   └── index.ts
│
├── design-automation/                 # Module 3
│   ├── extension.yaml
│   ├── agents/
│   │   └── design-generator.yaml
│   ├── mcp/
│   │   ├── clo3d/                    # Migrate from kyndof-fashion
│   │   ├── midjourney/
│   │   └── figma/
│   └── index.ts
│
├── work-order-generator/              # Module 4
│   ├── extension.yaml
│   ├── agents/
│   │   └── tech-pack-creator.yaml
│   ├── skills/
│   │   └── spec-extraction.yaml
│   └── index.ts
│
├── work-instructions/                 # Module 5
│   ├── extension.yaml
│   ├── agents/
│   │   └── qc-advisor.yaml
│   └── index.ts
│
├── material-sourcing/                 # Module 6
│   ├── extension.yaml
│   ├── agents/
│   │   └── sourcing-advisor.yaml
│   ├── mcp/
│   │   └── supplier-db/
│   └── index.ts
│
├── line-sheet-generator/              # Module 7
│   ├── extension.yaml
│   ├── agents/
│   │   └── linesheet-creator.yaml
│   └── index.ts
│
├── cost-prediction/                   # Module 8
│   ├── extension.yaml
│   ├── agents/
│   │   └── cost-estimator.yaml
│   └── index.ts
│
└── sales-prediction/                  # Module 9
    ├── extension.yaml
    ├── agents/
    │   └── demand-forecaster.yaml
    └── index.ts
```

### 4.2 Module Development Template

```yaml
# extensions/fashion-research/extension.yaml
id: fashion-research
name: Fashion Research AI
version: 1.0.0
description: 패션 트렌드 리서치 및 분석 자동화

category: mega-app-module
tags:
  - fashion
  - research
  - trends
  - mega-app

nubabelVersion: ">=2.0.0"

# Mega App Integration
megaApp:
  moduleId: fashion-research
  inputSchema:
    type: object
    properties:
      seasonCode:
        type: string
        description: Target season (e.g., 2026SS)
      targetMarket:
        type: string
        enum: [korea, japan, china, usa, europe]
      categories:
        type: array
        items:
          type: string
  outputSchema:
    type: object
    properties:
      trends:
        type: array
        items:
          $ref: "#/definitions/TrendItem"
      keywords:
        type: array
        items:
          type: string
      colorPalette:
        type: array
        items:
          $ref: "#/definitions/Color"

  requiredInputs: [] # No dependencies - entry point
  optionalInputs: []

components:
  agents:
    - id: trend-analyst
      configPath: ./agents/trend-analyst.yaml

  skills:
    - id: trend-scraping
      configPath: ./skills/trend-scraping.yaml
    - id: keyword-extraction
      configPath: ./skills/keyword-extraction.yaml

  mcpTools:
    - id: google-trends
      handler: ./mcp/google-trends/index.ts
    - id: instagram-scraper
      handler: ./mcp/social-media/instagram.ts
    - id: pinterest-trends
      handler: ./mcp/social-media/pinterest.ts

hooks:
  onArtifactRequest: ./hooks/onArtifactRequest.ts
  onArtifactCreated: ./hooks/onArtifactCreated.ts

permissions:
  - read:web
  - execute:workflows
```

---

## 5. User Experience Design

### 5.1 Mega App Dashboard

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  🏭 Mega App Manager                                              [2026SS] ▼    │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─ Value Stream Progress ──────────────────────────────────────────────────────┐│
│  │                                                                               ││
│  │  Research ──▶ Planning ──▶ Design ──▶ Work Order ──▶ Line Sheet             ││
│  │     ✅          🔄           ⏸️          ⏳            ⏳                     ││
│  │   100%        45%          0%          0%           0%                       ││
│  │                                                                               ││
│  └───────────────────────────────────────────────────────────────────────────────┘│
│                                                                                   │
│  ┌─ Module Cards ───────────────────────────────────────────────────────────────┐│
│  │                                                                               ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐             ││
│  │  │📊 Research │  │📋 Planning │  │🎨 Design   │  │📝 Work Order│             ││
│  │  │            │  │            │  │            │  │            │             ││
│  │  │ 3 reports  │  │ 2 plans    │  │ 0 designs  │  │ 0 orders   │             ││
│  │  │ ✅ Ready   │  │ 🔄 Active  │  │ ⏸️ Waiting │  │ ⏳ Blocked │             ││
│  │  │            │  │            │  │            │  │            │             ││
│  │  │ [View] [+] │  │ [View] [+] │  │ [Start]    │  │ [Blocked]  │             ││
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘             ││
│  │                                                                               ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐             ││
│  │  │🧵 Material │  │📑 Line Sheet│ │💰 Cost     │  │📈 Sales    │             ││
│  │  │ Sourcing   │  │            │  │ Prediction │  │ Forecast   │             ││
│  │  │            │  │            │  │            │  │            │             ││
│  │  │ 0 lists    │  │ 0 sheets   │  │ 0 estimates│  │ 0 forecasts│             ││
│  │  │ ⏳ Blocked │  │ ⏳ Blocked │  │ ⏳ Blocked │  │ ⏳ Blocked │             ││
│  │  │            │  │            │  │            │  │            │             ││
│  │  │ [Blocked]  │  │ [Blocked]  │  │ [Blocked]  │  │ [Blocked]  │             ││
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘             ││
│  └───────────────────────────────────────────────────────────────────────────────┘│
│                                                                                   │
│  ┌─ Recent Activity ────────────────────────────────────────────────────────────┐│
│  │  • [10:32] Product Planning generated SKU plan v2 from Trend Report v1       ││
│  │  • [10:15] Fashion Research completed Trend Analysis                          ││
│  │  • [09:45] User uploaded competitor analysis data                            ││
│  └───────────────────────────────────────────────────────────────────────────────┘│
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Slack Integration

```
User: @nubabel 2026SS 트렌드 리서치 시작해줘

Nubabel: 🚀 Fashion Research 모듈을 시작합니다.

📊 *2026SS Trend Research*
├ Target: Korea, Japan, USA
├ Categories: Women's Casual, Athleisure
└ Status: ⏳ Running...

Progress: ▓▓▓▓░░░░░░ 40%
• Google Trends 분석 완료
• Instagram 트렌드 수집 중...

---

Nubabel: ✅ Fashion Research 완료!

*📊 Trend Report v1 생성됨*
├ 12개 주요 트렌드 발견
├ 45개 키워드 추출
└ 컬러 팔레트 생성

다음 단계: *Product Planning* 모듈이 이 데이터를 사용할 수 있습니다.
[상품 기획 시작] [리포트 보기] [수정하기]
```

---

## 6. Implementation Roadmap (Revised - 16 Weeks)

> **Timeline extended from 10 to 16 weeks** per Critic feedback. Scope split into MVP and Full phases.

### Phase 1: Mega App MVP (Week 1-4)

**Goal**: Minimal viable Value Stream with 3 core modules

#### Week 1-2: Foundation
**Tasks**:
1. **Database Schema Migration**
   - Create `value_stream_artifacts` table
   - Create `artifact_links` table
   - Add `megaAppConfig` field to `MarketplaceExtension`
   - Add `megaAppRoleId` to `Membership` table

2. **Schema Validation**
   ```bash
   npx prisma validate  # MUST pass before proceeding
   npx prisma migrate dev --name mega-app-foundation
   ```

3. **Core Services (follow existing patterns)**
   - `src/services/mega-app/module-registry.ts`
     - Pattern: Follow `src/services/extension-registry/extension-registry.ts`
   - `src/services/mega-app/artifact-service.ts`
     - Pattern: Follow existing Prisma service patterns

**Acceptance Criteria** (Specific & Measurable):
- [ ] `npx prisma validate` passes without errors
- [ ] `npx prisma migrate dev` applies without conflicts
- [ ] Unit test: `moduleRegistry.register()` creates record in DB
- [ ] Unit test: `artifactService.create()` creates artifact with proper indexes
- [ ] Unit test: `artifactService.linkArtifacts()` creates bidirectional links

#### Week 3-4: First Module Chain
**Tasks**:
1. **Fashion Research Module** (Entry point module)
   - Create `extensions/fashion-research/extension.yaml`
   - Implement `trend-analyst` agent via existing `delegateTask()`
   - Register as skill in `ExtensionRegistry`

2. **Product Planning Module** (Consumes Research output)
   - Create `extensions/product-planning/extension.yaml`
   - Implement dependency resolution (waits for Research artifact)

3. **Integration Testing**
   ```bash
   npm run test:e2e -- --grep "mega-app"
   ```

**Acceptance Criteria** (Specific & Measurable):
- [ ] E2E test: Research module creates TrendReport artifact
- [ ] E2E test: Planning module waits for Research completion
- [ ] E2E test: Planning module consumes Research artifact
- [ ] E2E test: Artifact lineage shows Research → Planning link
- [ ] Slack command `/nubabel research 2026SS` triggers Research module

### Phase 2: Full Module Chain (Week 5-10)

**Goal**: Complete all 9 modules with data flow

#### Week 5-6: Design Chain
**Tasks**:
1. **Design Automation Module**
   - Migrate CLO3D from `kyndof-fashion` (keep backward compat)
   - Add Midjourney/DALL-E integration for mockups

2. **Work Order Generator Module**
   - Tech pack template system
   - Spec extraction from Design artifacts

**Acceptance Criteria**:
- [ ] Design module consumes Planning artifact
- [ ] Work Order module consumes Design artifact
- [ ] CLO3D tools work in new module structure
- [ ] Backward compatibility test: old kyndof-fashion commands still work

#### Week 7-8: Supporting Modules
**Tasks**:
1. **Material Sourcing Module** (with feedback loop)
2. **Line Sheet Generator Module**
3. **Work Instructions Module**

**Acceptance Criteria**:
- [ ] Material Sourcing feedback propagates to Design (event-driven)
- [ ] Line Sheet export in PDF and Excel formats
- [ ] End-to-end flow: Research → ... → Line Sheet works

#### Week 9-10: Prediction Modules
**Tasks**:
1. **Cost Prediction Module**
2. **Sales Prediction Module**
3. **Basic Dashboard UI** (read-only view of progress)

**Acceptance Criteria**:
- [ ] Cost Prediction consumes Work Order + Material data
- [ ] Sales Prediction consumes Research + Planning data
- [ ] Dashboard shows all 9 modules with status

### Phase 3: Advanced Features (Week 11-16)

#### Week 11-12: Access Control & Permissions
**Tasks**:
1. **ModulePermission implementation**
2. **MegaAppRole management UI**
3. **Data scope enforcement**

#### Week 13-14: Feature Request Pipeline
**Tasks**:
1. **Feature Request capture from Slack**
2. **Feature Analyzer agent**
3. **Backlog prioritization UI**

#### Week 15-16: Polish & Documentation
**Tasks**:
1. **Full Mega App Dashboard** (with actions)
2. **Dynamic agent scaling (basic)**
3. **Documentation and training materials**
4. **Performance testing and optimization**

---

## 7. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Module dependency complexity | High | Medium | Start with linear flow, add branches later |
| Data schema evolution | High | High | Version artifacts, migration strategy |
| AI model inconsistency | Medium | Medium | Standardized prompts, output validation |
| Performance at scale | Medium | Low | Async processing, caching |
| User adoption | Medium | Medium | Intuitive UI, Slack-first experience |

---

## 8. Resolved Architecture Questions

### Q1: Event Bus Implementation → RESOLVED
**Decision**: Use BullMQ Events (see Decision 1 above)

**Cross-module event ordering**: Events are ordered by timestamp. For strict ordering, use `jobId` with sequential numbering per artifact lineage.

### Q2: Artifact Storage → RESOLVED
**Decision**: Store metadata in PostgreSQL, large files in S3.

- `ValueStreamArtifact.data` contains metadata and small JSON
- Large files (designs, PDFs) → S3 with `fileUrls` array in artifact data
- Versioning: Create new artifact record with `previousVersionId` reference, keep old versions for 90 days

### Q3: Module Isolation → RESOLVED
**Decision**: Shared database schema with organizationId scoping.

- All modules share the same Prisma schema
- Organization-level RLS provides isolation
- Module-specific secrets stored in `MegaAppModuleConfig.secrets` (encrypted)

### Q4: Feedback Loops → RESOLVED
**Decision**: Event-driven with optional manual trigger.

- Material Sourcing completion emits `artifact.created` event
- Design module subscribes to this event
- UI shows "Feedback Available" notification for manual review
- Auto-propagation is OPT-IN per organization (default: manual)

---

## 9. Verification Steps

1. **Schema Verification**
   - Run `npx prisma validate`
   - Check migration compatibility

2. **Architecture Verification**
   - Review with team
   - Load test module registry

3. **Integration Verification**
   - E2E test: Research → Planning → Design
   - Slack command test

---

## 10. Access Control & Permission System

### 10.1 Multi-Level Permission Model

사용자별로 앱, 기능, 데이터에 대한 접근 권한이 매우 다양해야 합니다.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         PERMISSION HIERARCHY                                      │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  Organization Level                                                               │
│  └── Role-Based (owner, admin, member, viewer)                                   │
│       │                                                                          │
│       ▼                                                                          │
│  Module Level                                                                     │
│  └── Per-module permissions (fashion-research:read, product-planning:execute)    │
│       │                                                                          │
│       ▼                                                                          │
│  Function Level                                                                   │
│  └── Specific actions (create-artifact, approve-output, modify-config)           │
│       │                                                                          │
│       ▼                                                                          │
│  Data Level                                                                       │
│  └── Artifact-based (view-own, view-team, view-all, sensitive-data)             │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Permission Schema

**User-to-Role Assignment**: Users are assigned MegaAppRoles via the existing `Membership` table.

```prisma
// MODIFICATION to existing Membership model (not a new table)
// Add this field to prisma/schema.prisma Membership model:

model Membership {
  // ... existing fields ...

  // NEW: Mega App role assignment
  megaAppRoleId  String?  @map("mega_app_role_id") @db.Uuid

  megaAppRole    MegaAppRole? @relation(fields: [megaAppRoleId], references: [id])
}

/// User Role Templates (pre-configured permission sets)
model MegaAppRole {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  name           String   @db.VarChar(100)  // e.g., "MD", "Designer", "Production Manager"
  description    String?  @db.Text

  // Default module permissions for this role
  defaultPermissions Json @map("default_permissions") @db.JsonB

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberships    Membership[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("mega_app_roles")
}

/// Module-level permissions (overrides role defaults for specific users)
model ModulePermission {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  moduleId       String   @map("module_id") @db.VarChar(100)

  // Who (one of these must be set)
  userId         String?  @map("user_id") @db.Uuid  // Specific user override
  megaAppRoleId  String?  @map("mega_app_role_id") @db.Uuid  // Role-based default

  // What permissions
  canView        Boolean  @default(false) @map("can_view")
  canExecute     Boolean  @default(false) @map("can_execute")
  canCreate      Boolean  @default(false) @map("can_create")
  canApprove     Boolean  @default(false) @map("can_approve")
  canConfigure   Boolean  @default(false) @map("can_configure")
  canDelete      Boolean  @default(false) @map("can_delete")

  // Data visibility
  dataScope      String   @default("own") @map("data_scope") @db.VarChar(50) // own, team, all

  // Timestamps
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User?        @relation(fields: [userId], references: [id], onDelete: Cascade)
  megaAppRole    MegaAppRole? @relation(fields: [megaAppRoleId], references: [id], onDelete: Cascade)

  @@unique([organizationId, moduleId, userId])
  @@unique([organizationId, moduleId, megaAppRoleId])
  @@index([organizationId])
  @@index([userId])
  @@index([megaAppRoleId])
  @@map("module_permissions")
}

// Permission resolution order:
// 1. Check ModulePermission for specific user (userId)
// 2. Check ModulePermission for user's MegaAppRole (via Membership.megaAppRoleId)
// 3. Fall back to MegaAppRole.defaultPermissions
// 4. Deny if no permission found
```

### 10.3 Example Role Configurations

```typescript
const roleConfigurations = {
  'MD (상품기획)': {
    modules: {
      'fashion-research': { canView: true, canExecute: true, canApprove: true },
      'product-planning': { canView: true, canExecute: true, canCreate: true, canApprove: true },
      'design-auto': { canView: true, canApprove: true },
      'cost-prediction': { canView: true, canExecute: true },
      'sales-prediction': { canView: true, canExecute: true, canApprove: true },
    },
    dataScope: 'all'
  },

  'Designer (디자이너)': {
    modules: {
      'fashion-research': { canView: true },
      'product-planning': { canView: true },
      'design-auto': { canView: true, canExecute: true, canCreate: true },
      'work-order': { canView: true, canCreate: true },
      'material-sourcing': { canView: true },
    },
    dataScope: 'team'
  },

  'Production Manager (생산관리)': {
    modules: {
      'design-auto': { canView: true },
      'work-order': { canView: true, canExecute: true, canApprove: true },
      'work-instructions': { canView: true, canExecute: true, canCreate: true },
      'material-sourcing': { canView: true, canExecute: true },
      'cost-prediction': { canView: true, canExecute: true },
    },
    dataScope: 'all'
  },

  'Viewer (조회자)': {
    modules: {
      '*': { canView: true }
    },
    dataScope: 'own'
  }
};
```

---

## 11. Fragmented Feature Request Handling

### 11.1 Feature Request Ingestion System

구성원들이 파편화되어 이야기하는 기능 요청을 체계적으로 수집하고 Mega App에 반영:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    FEATURE REQUEST PIPELINE                                       │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐                                                             │
│  │ Input Channels  │                                                             │
│  │                 │                                                             │
│  │ • Slack 대화    │                                                             │
│  │ • Web 피드백    │                                                             │
│  │ • Notion 요청   │                                                             │
│  │ • 이메일        │                                                             │
│  └────────┬────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                    Feature Request Analyzer (AI Agent)                      ││
│  │                                                                              ││
│  │  1. Intent Extraction: 무엇을 원하는가?                                      ││
│  │  2. Module Mapping: 어떤 모듈과 관련있는가?                                  ││
│  │  3. Duplicate Detection: 이미 요청된/개발중인 기능인가?                      ││
│  │  4. Priority Assessment: 얼마나 중요한가? (빈도, 비즈니스 영향)              ││
│  │  5. Dependency Analysis: 다른 기능에 의존하는가?                             ││
│  │                                                                              ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                    Feature Backlog (Prioritized)                            ││
│  │                                                                              ││
│  │  [P0] 부자재 소싱 → 디자인 피드백 연결                                       ││
│  │       ├ Related: material-sourcing, design-auto                             ││
│  │       ├ Requests: 5건 (김MD, 박디자이너, ...)                                ││
│  │       └ Status: Planning                                                    ││
│  │                                                                              ││
│  │  [P1] 경쟁사 라인시트 분석 기능                                              ││
│  │       ├ Related: fashion-research, line-sheet                               ││
│  │       ├ Requests: 3건                                                        ││
│  │       └ Status: Backlog                                                     ││
│  │                                                                              ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                    Development Planning                                      ││
│  │                                                                              ││
│  │  • Auto-generate module enhancement specs                                    ││
│  │  • Update module roadmap                                                     ││
│  │  • Assign to development agent                                              ││
│  │  • Track implementation status                                              ││
│  │                                                                              ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Feature Request Schema

```prisma
/// Feature Requests (Captured from various channels)
model FeatureRequest {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  // Source
  source         String   @db.VarChar(50)  // slack, web, notion, email
  sourceRef      String?  @map("source_ref") @db.Text  // message ID, page ID, etc.
  requesterId    String?  @map("requester_id") @db.Uuid

  // Content
  rawContent     String   @map("raw_content") @db.Text  // Original request text
  analyzedIntent String?  @map("analyzed_intent") @db.Text  // AI-extracted intent

  // Categorization
  relatedModules String[] @default([]) @map("related_modules") @db.VarChar(100)
  tags           String[] @default([]) @db.VarChar(100)

  // Prioritization
  priority       Int      @default(3)  // 0=Critical, 1=High, 2=Medium, 3=Low
  businessImpact String?  @map("business_impact") @db.VarChar(50)
  requestCount   Int      @default(1) @map("request_count")  // Duplicate aggregation

  // Status
  status         String   @default("new") @db.VarChar(50)  // new, analyzing, backlog, planning, developing, released

  // Linking
  parentRequestId String? @map("parent_request_id") @db.Uuid  // Merged into
  linkedModuleId  String? @map("linked_module_id") @db.VarChar(100)  // When implemented

  // Timestamps
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([organizationId, status])
  @@index([organizationId, priority])
  @@index([relatedModules])
  @@map("feature_requests")
}
```

---

## 12. Agent Organization Structure

### 12.1 Development Agent Hierarchy

> **Note**: `MegaAppTeam` (not `AgentTeam`) to avoid conflict with existing `Team` model in schema.

기능마다, 그리고 기능이 고도화되면서 개발조직(Agent)의 조직도가 유연하게 변화:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    AGENT ORGANIZATION STRUCTURE                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                           ┌──────────────────┐                                   │
│                           │  Mega App        │                                   │
│                           │  Orchestrator    │                                   │
│                           │  (CEO Agent)     │                                   │
│                           └────────┬─────────┘                                   │
│                                    │                                              │
│          ┌─────────────────────────┼─────────────────────────┐                   │
│          │                         │                         │                   │
│          ▼                         ▼                         ▼                   │
│  ┌───────────────┐        ┌───────────────┐        ┌───────────────┐            │
│  │ Planning      │        │ Design        │        │ Production    │            │
│  │ Domain Lead   │        │ Domain Lead   │        │ Domain Lead   │            │
│  │ (VP Agent)    │        │ (VP Agent)    │        │ (VP Agent)    │            │
│  └───────┬───────┘        └───────┬───────┘        └───────┬───────┘            │
│          │                        │                        │                    │
│    ┌─────┴─────┐            ┌─────┴─────┐            ┌─────┴─────┐              │
│    │           │            │           │            │           │              │
│    ▼           ▼            ▼           ▼            ▼           ▼              │
│ ┌──────┐  ┌──────┐     ┌──────┐  ┌──────┐     ┌──────┐  ┌──────┐              │
│ │Research│ │Product│    │Design │ │Work   │    │Material│ │Cost   │              │
│ │Module │ │Plan   │    │Auto   │ │Order  │    │Sourcing│ │Predict│              │
│ │Agent  │ │Agent  │    │Agent  │ │Agent  │    │Agent   │ │Agent  │              │
│ └───┬───┘ └───┬───┘    └───┬───┘ └───┬───┘    └───┬───┘ └───┬───┘              │
│     │         │            │         │            │         │                   │
│     ▼         ▼            ▼         ▼            ▼         ▼                   │
│  [Skills] [Skills]     [Skills] [Skills]     [Skills] [Skills]                  │
│  [MCPs]   [MCPs]       [MCPs]   [MCPs]       [MCPs]   [MCPs]                    │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘

Evolution Example (Module Maturation):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1 (MVP):                 Phase 2 (Growth):              Phase 3 (Mature):
┌────────────┐                ┌────────────┐                 ┌────────────────┐
│ Design     │                │ Design     │                 │ Design Domain  │
│ Module     │  ──────────▶   │ Lead Agent │  ──────────▶    │ Lead Agent     │
│ Agent      │                │            │                 │                │
└────────────┘                │ ┌────────┐ │                 │ ┌────────────┐ │
 (1 agent)                    │ │ CAD    │ │                 │ │ CAD Team   │ │
                              │ │ Agent  │ │                 │ │ Lead       │ │
                              │ └────────┘ │                 │ │ ├ CAD-1    │ │
                              │ ┌────────┐ │                 │ │ ├ CAD-2    │ │
                              │ │ Render │ │                 │ │ └ CAD-3    │ │
                              │ │ Agent  │ │                 │ └────────────┘ │
                              │ └────────┘ │                 │ ┌────────────┐ │
                              └────────────┘                 │ │ Render Team│ │
                               (3 agents)                    │ └────────────┘ │
                                                             │ ┌────────────┐ │
                                                             │ │ QA Agent   │ │
                                                             │ └────────────┘ │
                                                             └────────────────┘
                                                              (6+ agents)
```

### 12.2 Agent Configuration Schema

```prisma
/// Mega App Agent Teams (Hierarchical agent organization)
/// Named MegaAppTeam to avoid conflict with existing Team model
model MegaAppTeam {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid

  name           String   @db.VarChar(255)
  description    String?  @db.Text

  // Hierarchy
  parentTeamId   String?  @map("parent_team_id") @db.Uuid
  moduleId       String?  @map("module_id") @db.VarChar(100)  // Primary module responsibility

  // Lead agent
  leadAgentId    String?  @map("lead_agent_id") @db.Uuid

  // Configuration
  maxAgents      Int      @default(5) @map("max_agents")
  scalingPolicy  String   @default("manual") @map("scaling_policy") @db.VarChar(50)  // manual, auto, demand-based

  // Status
  status         String   @default("active") @db.VarChar(50)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Self-referential relation for hierarchy
  parentTeam     MegaAppTeam?  @relation("MegaAppTeamHierarchy", fields: [parentTeamId], references: [id])
  childTeams     MegaAppTeam[] @relation("MegaAppTeamHierarchy")

  @@index([organizationId])
  @@index([parentTeamId])
  @@index([moduleId])
  @@map("mega_app_teams")
}

/// Agent Scaling Rules (Auto-scaling configuration)
model AgentScalingRule {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  teamId         String   @map("team_id") @db.Uuid

  // Trigger conditions
  triggerType    String   @map("trigger_type") @db.VarChar(50)  // queue-depth, latency, schedule
  triggerValue   Int      @map("trigger_value")  // threshold value

  // Action
  action         String   @db.VarChar(50)  // scale-up, scale-down
  agentCount     Int      @map("agent_count")
  agentTemplate  String   @map("agent_template") @db.VarChar(100)  // Which agent type to spawn

  // Limits
  minAgents      Int      @default(1) @map("min_agents")
  maxAgents      Int      @default(10) @map("max_agents")
  cooldownMinutes Int     @default(5) @map("cooldown_minutes")

  enabled        Boolean  @default(true)

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([teamId])
  @@map("agent_scaling_rules")
}
```

### 12.3 Dynamic Agent Spawning

```typescript
// src/mega-app/agents/dynamic-spawner.ts
interface DynamicAgentSpawner {
  // Spawn agents based on workload
  evaluateAndScale(moduleId: string): Promise<ScalingDecision>;

  // Spawn specialized agent for task
  spawnSpecialist(
    teamId: string,
    taskType: string,
    context: TaskContext
  ): Promise<Agent>;

  // Retire agent when idle
  evaluateRetirement(agentId: string): Promise<boolean>;

  // Promote agent to lead when team grows
  evaluatePromotion(teamId: string): Promise<PromotionDecision | null>;
}

// Example: Auto-scaling based on queue depth
const scalingExample = {
  moduleId: 'design-auto',
  currentAgents: 2,
  queueDepth: 15,
  avgProcessingTime: 300, // seconds

  decision: {
    action: 'scale-up',
    targetAgents: 4,
    reason: 'Queue depth (15) exceeds threshold (10) with avg processing time 5min',
    agentTemplate: 'design-auto-worker',
  }
};
```

---

## 13. Error Handling Specifications

### 13.1 Module Execution Failures

| Scenario | Handling |
|----------|----------|
| Module fails mid-stream | Mark artifact as `failed`, emit `artifact.failed` event, notify via Slack |
| Upstream artifact deleted | Downstream artifacts marked `orphaned`, UI shows warning, manual resolution required |
| Circular dependency detected | Reject module registration, return validation error with cycle details |
| AI execution timeout | Retry 3 times with exponential backoff, then mark as `failed` |

### 13.2 Data Integrity

```typescript
// Artifact deletion protection
async function deleteArtifact(artifactId: string, options: DeleteOptions) {
  // Check for downstream dependencies
  const downstream = await artifactService.getDownstream(artifactId);

  if (downstream.length > 0 && !options.force) {
    throw new Error(
      `Cannot delete artifact ${artifactId}: ${downstream.length} downstream artifacts depend on it. ` +
      `Use force=true to delete anyway (will orphan downstream).`
    );
  }

  if (options.force) {
    // Mark downstream as orphaned
    await artifactService.markOrphaned(downstream.map(d => d.id));
  }

  // Soft delete (mark as archived, retain for 30 days)
  await artifactService.archive(artifactId);
}
```

---

## 14. Slack Integration Examples (i18n)

### English Response

```
User: @nubabel start trend research for 2026SS

Nubabel: 🚀 Starting Fashion Research module.

📊 *2026SS Trend Research*
├ Target: Korea, Japan, USA
├ Categories: Women's Casual, Athleisure
└ Status: ⏳ Running...

Progress: ▓▓▓▓░░░░░░ 40%
• Google Trends analysis complete
• Instagram trends collection in progress...

---

Nubabel: ✅ Fashion Research complete!

*📊 Trend Report v1 created*
├ 12 key trends identified
├ 45 keywords extracted
└ Color palette generated

Next step: *Product Planning* module can use this data.
[Start Planning] [View Report] [Edit]
```

### Korean Response (한국어)

```
User: @nubabel 2026SS 트렌드 리서치 시작해줘

Nubabel: 🚀 Fashion Research 모듈을 시작합니다.

📊 *2026SS 트렌드 리서치*
├ 대상 시장: 한국, 일본, 미국
├ 카테고리: 여성 캐주얼, 애슬레저
└ 상태: ⏳ 실행 중...

진행률: ▓▓▓▓░░░░░░ 40%
• Google Trends 분석 완료
• Instagram 트렌드 수집 중...

---

Nubabel: ✅ Fashion Research 완료!

*📊 Trend Report v1 생성됨*
├ 12개 주요 트렌드 발견
├ 45개 키워드 추출
└ 컬러 팔레트 생성

다음 단계: *Product Planning* 모듈이 이 데이터를 사용할 수 있습니다.
[상품 기획 시작] [리포트 보기] [수정하기]
```

---

## 15. Feature Request Analyzer Agent Specification

```yaml
# extensions/mega-app-core/agents/feature-analyzer.yaml
id: feature-analyzer
name: Feature Request Analyzer
description: Analyzes fragmented feature requests and categorizes them for the Mega App backlog

model: claude-sonnet-4-20250514
temperature: 0.3

systemPrompt: |
  You are a Feature Request Analyzer for a Fashion Value Stream platform.

  Your job is to:
  1. Extract the core intent from user requests (even if vague or fragmented)
  2. Map requests to existing Mega App modules
  3. Detect duplicates or similar existing requests
  4. Assess business impact and priority
  5. Identify dependencies on other features

  Output format:
  {
    "intent": "Brief description of what user wants",
    "relatedModules": ["module-id-1", "module-id-2"],
    "isDuplicate": false,
    "similarRequests": [],
    "priority": "P0|P1|P2|P3",
    "businessImpact": "high|medium|low",
    "dependencies": ["feature-id-1"],
    "suggestedTitle": "Concise feature title"
  }

triggers:
  - "기능 요청"
  - "feature request"
  - "이런 기능 있으면"
  - "would be nice if"
  - "필요한 기능"

inputSchema:
  type: object
  required: [rawRequest, source]
  properties:
    rawRequest:
      type: string
      description: The raw feature request text
    source:
      type: string
      enum: [slack, web, notion, email]
    requesterId:
      type: string
      description: User ID who made the request
```

---

## 16. Summary of Revisions (Critic Feedback Addressed)

| Critic Issue | Resolution |
|--------------|------------|
| Event Bus undecided | **Decision 1**: Use BullMQ Events |
| Missing Extension integration | **Section 3.3**: Integration with existing ExtensionRegistry |
| Database schema conflicts | **Decision 4**: Renamed to MegaAppTeam, validation steps added |
| Missing file references | **Section 6**: Explicit patterns to follow for each file |
| Unclear Orchestrator relationship | **Decision 2**: Mega App uses existing delegateTask() |
| Unrealistic 10-week timeline | **Section 6**: Extended to 16 weeks with MVP scope |
| Missing User-Role assignment | **Section 10.2**: Extended Membership model |
| Missing error handling | **Section 13**: Error handling specifications |
| Hardcoded Korean Slack | **Section 14**: Both English and Korean examples |
| Feature Analyzer not specified | **Section 15**: Full agent YAML specification |

---

## 17. Comprehensive User Stories

### 17.1 MD (상품기획자) User Stories

#### 17.1.1 Fashion Research Module

**US-MD-FR-001: Initiate Trend Research**
```gherkin
Feature: MD initiates seasonal trend research

Scenario: Start new trend research for upcoming season
  Given MD is logged into Mega App with "MD" role
  And MD has "canExecute" permission for "fashion-research" module
  And no active research exists for target season "2026FW"
  When MD clicks "Start Research" on Fashion Research module card
  And MD selects target season "2026FW"
  And MD selects target markets ["Korea", "Japan", "USA"]
  And MD selects categories ["Women's Casual", "Men's Streetwear"]
  And MD clicks "Execute"
  Then system creates new TrendReport artifact with status "processing"
  And system emits "module.execution.started" event
  And system spawns "trend-analyst" agent via delegateTask()
  And Slack notification is sent to MD's channel
  And dashboard shows Fashion Research module status as "Running"

Pre-conditions:
  - User has valid session with organization context
  - User's Membership.megaAppRoleId links to "MD" role
  - ModulePermission for MD role includes canExecute for fashion-research
  - No rate limit exceeded for module execution

Post-conditions:
  - ValueStreamArtifact record created with moduleId="fashion-research"
  - AgentExecution record created with metadata.moduleId="fashion-research"
  - Audit log entry created for module execution

Error Scenarios:
  - E1: Research already in progress → Show "Active research exists. View or cancel?"
  - E2: Permission denied → Show "You don't have permission to execute this module"
  - E3: External API failure (Google Trends) → Retry 3x, then show partial results
  - E4: Agent timeout (>30min) → Mark as failed, notify MD, offer manual retry

Acceptance Criteria:
  - [ ] Research starts within 5 seconds of execution
  - [ ] Progress updates visible in real-time (every 30 seconds)
  - [ ] Slack notification includes deep link to dashboard
  - [ ] Cancel button available during execution
```

**US-MD-FR-002: Review Trend Research Results**
```gherkin
Feature: MD reviews completed trend research

Scenario: View and approve trend report
  Given trend research for "2026FW" has completed
  And TrendReport artifact exists with status "review"
  And MD has "canApprove" permission for "fashion-research" module
  When MD opens the TrendReport artifact
  Then MD sees:
    | Section | Content |
    | Trend Summary | List of 10-20 identified trends with confidence scores |
    | Keywords | Extracted keywords with frequency and source |
    | Color Palette | Suggested colors with Pantone codes and usage % |
    | Market Insights | Per-market analysis with regional differences |
    | Source References | Links to original data sources |
  And MD can click "Approve" to set status to "approved"
  And MD can click "Request Revision" to add feedback
  And MD can click "Reject" to archive with reason

Scenario: Request revision on trend report
  Given MD is viewing TrendReport with status "review"
  When MD clicks "Request Revision"
  And MD enters feedback "Need more focus on sustainable materials trend"
  And MD clicks "Submit Feedback"
  Then artifact status changes to "revision_requested"
  And feedback is stored in artifact.metadata.revisionHistory
  And trend-analyst agent is re-triggered with feedback context
  And new version is created (version incremented)
  And original version remains accessible

Error Scenarios:
  - E1: Concurrent edit by another user → Show optimistic lock error, refresh
  - E2: Approval without reviewing all sections → Warning prompt
  - E3: Network timeout during approval → Retry with idempotency key
```

**US-MD-FR-003: Compare Multiple Trend Reports**
```gherkin
Feature: MD compares trend reports across seasons

Scenario: Side-by-side season comparison
  Given TrendReports exist for ["2025FW", "2026SS", "2026FW"]
  And all reports have status "approved"
  When MD selects "Compare Reports" action
  And MD selects reports for "2025FW" and "2026FW"
  Then system displays side-by-side comparison showing:
    | Aspect | 2025FW | 2026FW | Delta |
    | Top Trends | [list] | [list] | +3 new, -2 dropped |
    | Color Palette | [colors] | [colors] | Shift toward earth tones |
    | Keywords | [list] | [list] | 15 new, 8 continued |
  And MD can export comparison as PDF or Excel
  And MD can create "Trend Evolution" artifact linking both reports

Pre-conditions:
  - At least 2 approved TrendReports exist
  - MD has canView permission

Acceptance Criteria:
  - [ ] Comparison loads within 3 seconds
  - [ ] Visual diff highlighting for changed elements
  - [ ] Export includes all comparison data
```

#### 17.1.2 Product Planning Module

**US-MD-PP-001: Create SKU Plan from Trend Report**
```gherkin
Feature: MD creates product SKU plan

Scenario: Generate SKU plan from approved trends
  Given TrendReport "TR-2026FW-001" has status "approved"
  And MD has "canExecute" and "canCreate" permissions for "product-planning"
  When MD navigates to Product Planning module
  And MD clicks "Create from Trend Report"
  And MD selects TrendReport "TR-2026FW-001"
  And MD configures:
    | Parameter | Value |
    | Target SKU Count | 150 |
    | Price Point Distribution | Budget:20%, Mid:50%, Premium:30% |
    | Category Mix | Tops:40%, Bottoms:30%, Outerwear:20%, Accessories:10% |
    | Target Margin | 45% |
  And MD clicks "Generate Plan"
  Then system creates SKUPlan artifact linked to TrendReport
  And SKUPlan contains:
    | Field | Content |
    | categories | Array of ProductCategory with SKU allocation |
    | skuCount | 150 (matching target) |
    | pricePoints | Distribution matching configuration |
    | seasonalMix | Based on trend seasonality data |
  And artifact.metadata.upstream includes TrendReport reference
  And TrendReport.metadata.downstream includes SKUPlan reference

Scenario: Manually adjust generated SKU plan
  Given SKUPlan "SP-2026FW-001" exists with status "draft"
  When MD opens SKUPlan for editing
  And MD changes "Tops" allocation from 40% to 35%
  And MD adds new subcategory "Sustainable Line" with 5% allocation
  And MD clicks "Save Changes"
  Then SKUPlan version increments to 2
  And previous version remains in history
  And system validates total allocation equals 100%
  And system recalculates SKU distribution

Error Scenarios:
  - E1: Allocation exceeds 100% → Validation error with suggestion
  - E2: Target margin unrealistic (<20% or >80%) → Warning with industry benchmarks
  - E3: TrendReport modified after plan creation → Show "Source updated" notification
```

**US-MD-PP-002: Approve SKU Plan for Design Phase**
```gherkin
Feature: MD approves SKU plan for downstream processing

Scenario: Final approval with stakeholder sign-off
  Given SKUPlan "SP-2026FW-001" has been reviewed by team
  And all required comments have been resolved
  And MD has "canApprove" permission
  When MD clicks "Approve for Design"
  And MD confirms approval in modal
  Then SKUPlan status changes to "approved"
  And system emits "artifact.approved" event
  And Design Auto module becomes unblocked
  And notification sent to Designer role users
  And approval recorded in audit log with MD's userId

Pre-conditions:
  - All mandatory fields populated
  - No unresolved comments/threads
  - Budget validation passed

Post-conditions:
  - Design Auto module shows "Ready to Start"
  - Downstream artifact creation enabled
```

#### 17.1.3 Cost Prediction Module

**US-MD-CP-001: Review Cost Estimates**
```gherkin
Feature: MD reviews production cost predictions

Scenario: Analyze cost breakdown by category
  Given CostEstimate artifact exists for SKUPlan "SP-2026FW-001"
  And CostEstimate has status "completed"
  When MD opens Cost Prediction module
  And MD selects CostEstimate "CE-2026FW-001"
  Then MD sees dashboard with:
    | Section | Details |
    | Summary | Total estimated cost, per-unit average, margin projection |
    | Category Breakdown | Cost per category (Tops, Bottoms, etc.) |
    | Cost Drivers | Material 45%, Labor 30%, Overhead 15%, Shipping 10% |
    | Risk Factors | Currency fluctuation, material shortage, lead time |
    | Comparison | vs. previous season, vs. budget target |
  And MD can drill down into any category
  And MD can export detailed report

Scenario: Request cost optimization suggestions
  Given CostEstimate shows margin below target (40% vs 45% target)
  When MD clicks "Suggest Optimizations"
  Then system runs cost-estimator agent with optimization prompt
  And agent suggests:
    | Optimization | Impact | Trade-off |
    | Alternative fabric supplier | -8% material cost | Slightly lower quality |
    | Batch size increase | -5% per-unit labor | Higher inventory risk |
    | Consolidated shipping | -3% logistics | Longer lead time |
  And MD can accept/reject each suggestion
  And accepted suggestions create new CostEstimate version
```

#### 17.1.4 Sales Prediction Module

**US-MD-SP-001: Generate Sales Forecast**
```gherkin
Feature: MD generates sales predictions

Scenario: Create demand forecast from plan and trends
  Given approved SKUPlan and TrendReport exist
  And historical sales data available for organization
  When MD navigates to Sales Prediction module
  And MD clicks "Generate Forecast"
  And MD selects:
    | Input | Selection |
    | SKU Plan | SP-2026FW-001 |
    | Trend Report | TR-2026FW-001 |
    | Historical Range | Last 3 seasons |
    | Confidence Level | 90% |
  And MD clicks "Execute"
  Then system creates SalesForecast artifact
  And forecast includes:
    | Metric | Content |
    | Total Units | Point estimate with confidence interval |
    | Revenue Projection | Based on price points |
    | Seasonal Curve | Expected sales by week/month |
    | Category Performance | Predicted top/bottom performers |
    | Risk Assessment | Market factors that could impact forecast |

Error Scenarios:
  - E1: Insufficient historical data → Show minimum requirements, suggest alternatives
  - E2: Conflicting trend signals → Flag uncertainty, widen confidence interval
  - E3: External data unavailable → Use cached data with staleness warning
```

#### 17.1.5 Cross-Module Scenarios for MD

**US-MD-CROSS-001: End-to-End Value Stream Monitoring**
```gherkin
Feature: MD monitors entire value stream progress

Scenario: Dashboard overview of all modules
  Given MD is logged in with full module visibility
  When MD opens Mega App Dashboard
  Then MD sees:
    | Module | Status | Progress | Artifacts | Actions |
    | Fashion Research | Completed | 100% | 2 reports | [View] |
    | Product Planning | Active | 60% | 1 draft plan | [View] [Edit] |
    | Design Auto | Blocked | 0% | 0 designs | [Blocked: Waiting on Planning] |
    | Work Order | Blocked | 0% | 0 orders | [Blocked: Waiting on Design] |
    | ... | ... | ... | ... | ... |
  And MD can click any module to drill down
  And MD sees recent activity feed
  And MD sees blockers and recommended actions

Scenario: Identify and resolve bottleneck
  Given Product Planning has been "In Progress" for 5+ days
  And downstream modules are blocked
  When MD clicks "View Bottleneck Analysis"
  Then system shows:
    | Analysis | Finding |
    | Blocking Module | Product Planning |
    | Duration | 5 days 3 hours |
    | Waiting Modules | Design Auto, Work Order, Material Sourcing |
    | Estimated Delay | 8 days if not resolved today |
    | Suggested Action | Approve draft plan or assign additional reviewer |
  And MD can take action directly from analysis view
```

### 17.2 Designer (디자이너) User Stories

#### 17.2.1 Design Automation Module

**US-DES-DA-001: Generate Design Concepts**
```gherkin
Feature: Designer generates design concepts from SKU plan

Scenario: Create initial design mockups
  Given SKUPlan "SP-2026FW-001" has status "approved"
  And Designer has "canExecute" permission for "design-auto"
  When Designer opens Design Auto module
  And Designer selects SKU category "Women's Tops"
  And Designer selects design type "Mockup"
  And Designer configures:
    | Parameter | Value |
    | Style References | [uploaded images or URLs] |
    | Color Application | From TrendReport palette |
    | Quantity | 10 concepts |
    | Output Format | PNG + AI source |
  And Designer clicks "Generate"
  Then system spawns design-generator agent
  And agent uses Midjourney/DALL-E MCP tools
  And system creates 10 DesignFile artifacts
  And each artifact linked to SKUPlan upstream
  And Designer receives notification when complete

Post-conditions:
  - DesignFile artifacts created with moduleId="design-auto"
  - Files uploaded to S3 with URLs in artifact.data.fileUrls
  - Thumbnails generated for gallery view

Error Scenarios:
  - E1: AI generation fails → Show partial results, offer retry
  - E2: Style reference unclear → Request clarification or proceed with defaults
  - E3: Output quota exceeded → Show limit, offer batch processing
```

**US-DES-DA-002: Refine Design with CLO3D**
```gherkin
Feature: Designer refines mockup in CLO3D

Scenario: Convert mockup to 3D garment
  Given DesignFile mockup "DF-001" exists
  And Designer has "canExecute" permission
  When Designer selects mockup and clicks "Open in CLO3D"
  And Designer selects garment template "Basic T-Shirt"
  And Designer applies design pattern from mockup
  And Designer adjusts fit parameters
  And Designer clicks "Render 3D"
  Then system calls CLO3D MCP server
  And 3D render generated with multiple angles
  And new DesignFile artifact created with designType="cad"
  And artifact linked to original mockup as upstream

Scenario: Generate tech drawing from 3D model
  Given DesignFile CAD "DF-002" exists with 3D model
  When Designer clicks "Generate Tech Drawing"
  Then system extracts pattern pieces
  And system generates flat technical drawing
  And measurements automatically extracted
  And new DesignFile created with designType="tech-drawing"
  And tech drawing suitable for Work Order module

Error Scenarios:
  - E1: CLO3D server unavailable → Queue request, notify when available
  - E2: Incompatible garment template → Suggest alternatives
  - E3: Render timeout → Reduce complexity, retry with lower quality
```

**US-DES-DA-003: Manage Design Versions**
```gherkin
Feature: Designer manages design iterations

Scenario: Create new version with changes
  Given DesignFile "DF-001" version 1 exists
  And Designer makes modifications
  When Designer clicks "Save as New Version"
  And Designer adds version note "Adjusted neckline per MD feedback"
  Then new artifact created with version 2
  And version 1 remains accessible
  And version history shows timeline with notes
  And downstream artifacts show "Source Updated" notification

Scenario: Revert to previous version
  Given DesignFile "DF-001" has versions [1, 2, 3]
  And current version is 3
  When Designer selects version 1 from history
  And Designer clicks "Restore This Version"
  And Designer confirms "Create as Version 4"
  Then version 4 created with version 1 content
  And version history preserved
  And downstream artifacts notified of change
```

#### 17.2.2 Work Order Module (Designer View)

**US-DES-WO-001: Generate Work Order from Design**
```gherkin
Feature: Designer creates work order

Scenario: Auto-generate tech pack
  Given DesignFile tech drawing "DF-003" is approved
  And Designer has "canCreate" permission for "work-order"
  When Designer clicks "Create Work Order"
  And Designer selects DesignFile "DF-003"
  Then system extracts specifications:
    | Spec Type | Extracted Data |
    | Measurements | All dimensions from tech drawing |
    | Materials | Fabric type, weight, composition |
    | Construction | Seam types, finishing details |
    | Colorways | All approved color variations |
    | Size Range | Graded measurements for all sizes |
  And system creates WorkOrder artifact
  And Designer can review and adjust specs
  And Designer submits for Production Manager review

Error Scenarios:
  - E1: Missing critical specs → Highlight gaps, prevent submission
  - E2: Measurement inconsistency → Flag potential errors
  - E3: Unsupported construction detail → Request manual input
```

#### 17.2.3 Material Sourcing Module (Designer View)

**US-DES-MS-001: View Material Suggestions**
```gherkin
Feature: Designer views material suggestions for designs

Scenario: Review sourcing recommendations
  Given DesignFile "DF-003" specifies "Cotton twill, 280gsm"
  And Material Sourcing module has completed
  When Designer opens Material Sourcing results for "DF-003"
  Then Designer sees:
    | Recommendation | Supplier | Price | Lead Time | Sustainability |
    | Primary | SupplierA | $5.20/m | 3 weeks | OEKO-TEX certified |
    | Alternative 1 | SupplierB | $4.80/m | 4 weeks | None |
    | Alternative 2 | SupplierC | $5.50/m | 2 weeks | GOTS organic |
  And Designer can view supplier details
  And Designer can request samples
  And Designer can provide feedback affecting future recommendations

Pre-conditions:
  - Designer has canView permission for material-sourcing
  - MaterialList artifact exists linked to the design
```

### 17.3 Production Manager (생산관리) User Stories

#### 17.3.1 Work Order Module

**US-PM-WO-001: Review and Approve Work Orders**
```gherkin
Feature: Production Manager approves work orders

Scenario: Complete work order review
  Given WorkOrder "WO-001" submitted by Designer
  And Production Manager has "canApprove" permission
  When Production Manager opens WorkOrder for review
  Then PM sees:
    | Section | Checkpoints |
    | Specifications | All measurements complete and valid |
    | Materials | Availability confirmed with suppliers |
    | Construction | Feasible with factory capabilities |
    | Timeline | Realistic based on capacity |
    | Cost | Within budget parameters |
  And PM can add comments per section
  And PM can request changes with specific instructions
  And PM can approve to proceed to production

Scenario: Reject with detailed feedback
  Given WorkOrder "WO-001" has issues
  When PM clicks "Request Revision"
  And PM selects affected sections ["Specifications", "Materials"]
  And PM adds comments:
    - "Seam allowance insufficient for industrial sewing"
    - "Specified fabric unavailable, suggest alternative"
  And PM clicks "Send Feedback"
  Then WorkOrder status changes to "revision_requested"
  And Designer notified with specific feedback
  And feedback linked to relevant DesignFile artifacts
  And revision deadline auto-set based on timeline

Error Scenarios:
  - E1: Approving incomplete work order → Block with checklist
  - E2: Conflicting material availability → Show real-time status
```

**US-PM-WO-002: Bulk Work Order Management**
```gherkin
Feature: Production Manager handles multiple work orders

Scenario: Batch approve similar work orders
  Given 15 WorkOrders exist for same collection
  And all have passed initial review
  When PM selects multiple WorkOrders [WO-001 through WO-015]
  And PM clicks "Batch Actions"
  And PM selects "Approve All"
  And PM confirms with reason "Collection approved per meeting 2026-01-30"
  Then all selected WorkOrders status updated to "approved"
  And single audit log entry with batch reference
  And notifications consolidated (one per recipient)
  And downstream modules unblocked for all

Scenario: Filter and prioritize work orders
  Given 50 WorkOrders in various states
  When PM applies filters:
    | Filter | Value |
    | Status | pending_review |
    | Priority | high |
    | Due Date | within 7 days |
  Then list shows 8 matching WorkOrders
  And sorted by due date ascending
  And PM can bulk-assign reviewers
```

#### 17.3.2 Work Instructions Module

**US-PM-WI-001: Create Production Instructions**
```gherkin
Feature: Production Manager creates work instructions

Scenario: Generate QC notes and warnings
  Given WorkOrder "WO-001" is approved
  And MaterialList "ML-001" is finalized
  When PM navigates to Work Instructions module
  And PM selects WorkOrder "WO-001"
  And PM clicks "Generate Instructions"
  Then system spawns qc-advisor agent
  And agent analyzes:
    - Design complexity from DesignFile
    - Material handling requirements from MaterialList
    - Historical defect patterns for similar items
    - Factory-specific considerations
  And creates WorkInstructions artifact containing:
    | Section | Content |
    | Pre-production | Material inspection checklist |
    | Construction | Step-by-step assembly with photos |
    | Quality Checks | In-line inspection points |
    | Common Defects | Issues to watch for, with images |
    | Packaging | Folding, tagging, packing specs |

Scenario: Add manual instructions
  Given WorkInstructions "WI-001" generated
  When PM adds custom instruction:
    "Special handling: This fabric shows needle marks easily.
     Use size 70 needle, not standard 80."
  And PM marks as "Critical Warning"
  And PM attaches reference photo
  Then instruction added with priority flag
  And appears highlighted in production view
  And factory notification includes warning
```

#### 17.3.3 Material Sourcing Module

**US-PM-MS-001: Manage Material Procurement**
```gherkin
Feature: Production Manager manages material sourcing

Scenario: Confirm material selection
  Given MaterialList "ML-001" has recommendations
  And PM has "canExecute" permission for material-sourcing
  When PM reviews material options
  And PM selects preferred suppliers for each material
  And PM enters order quantities based on WorkOrder
  And PM clicks "Confirm Selection"
  Then MaterialList status changes to "confirmed"
  And purchase requisition data prepared
  And lead times added to production schedule
  And cost data sent to Cost Prediction module

Scenario: Handle material shortage
  Given confirmed material "MAT-001" supplier reports shortage
  When system detects availability change
  And PM receives alert
  Then PM sees:
    | Impact | Details |
    | Affected Work Orders | WO-001, WO-003, WO-007 |
    | Shortage Amount | 500m of 2000m ordered |
    | Alternative Suppliers | SupplierB (4 week lead), SupplierC (3 week, +10% cost) |
    | Timeline Impact | 2 week delay if no action |
  And PM can select alternative
  And PM can split order across suppliers
  And PM can escalate to MD for decision

Error Scenarios:
  - E1: All alternatives unavailable → Escalate with design modification suggestion
  - E2: Cost increase exceeds threshold → Require MD approval
```

#### 17.3.4 Cost Prediction Module

**US-PM-CP-001: Validate Cost Estimates**
```gherkin
Feature: Production Manager validates cost predictions

Scenario: Review and adjust cost factors
  Given CostEstimate "CE-001" generated from WorkOrder and MaterialList
  When PM reviews cost breakdown
  And PM identifies incorrect labor rate
  And PM updates:
    | Factor | Original | Corrected | Reason |
    | Labor Rate | $8/hour | $9.50/hour | New factory contract |
  And PM clicks "Recalculate"
  Then cost estimate recalculated with adjustment
  And variance report shows impact (+12% labor cost)
  And MD notified of significant cost change
  And new version created with audit trail

Acceptance Criteria:
  - [ ] Real-time recalculation within 5 seconds
  - [ ] All adjustments logged with reason
  - [ ] Alerts for variance exceeding thresholds (>5%, >10%)
```

### 17.4 Viewer (조회자) User Stories

**US-VIEW-001: Read-Only Dashboard Access**
```gherkin
Feature: Viewer accesses dashboard in read-only mode

Scenario: View value stream progress
  Given Viewer is logged in with "Viewer" role
  And Viewer has dataScope "own" (sees only their team's data)
  When Viewer opens Mega App Dashboard
  Then Viewer sees:
    - All modules with status indicators
    - Progress percentages
    - Artifact counts
  And all action buttons are hidden or disabled
  And Viewer cannot edit, execute, or approve anything
  And Viewer can export reports (PDF only, no raw data)

Scenario: View specific artifact
  Given DesignFile "DF-001" exists
  And Viewer has canView permission
  When Viewer clicks to open DesignFile
  Then Viewer sees read-only view with:
    - Design images
    - Specifications (non-editable)
    - Version history
    - Related artifacts (view links only)
  And no edit, delete, or execute buttons shown
  And download limited to preview quality

Error Scenarios:
  - E1: Attempt to access restricted artifact → "Permission denied" with contact info
  - E2: Attempt direct API manipulation → 403 response, audit logged
```

**US-VIEW-002: Generate View-Only Reports**
```gherkin
Feature: Viewer generates reports

Scenario: Export progress summary
  Given Viewer wants to share status with external stakeholders
  When Viewer clicks "Export Report"
  And Viewer selects report type "Progress Summary"
  And Viewer selects date range
  Then system generates PDF with:
    - Module status overview
    - Key milestones achieved
    - Timeline projection
    - No sensitive cost or pricing data
  And watermark shows "View Only - [Viewer Name] - [Date]"
  And export logged in audit trail
```

### 17.5 Admin User Stories

#### 17.5.1 Permission Management

**US-ADMIN-001: Configure Role Permissions**
```gherkin
Feature: Admin configures Mega App roles

Scenario: Create new role
  Given Admin is logged in with "owner" or "admin" organization role
  When Admin navigates to Mega App Settings > Roles
  And Admin clicks "Create Role"
  And Admin enters:
    | Field | Value |
    | Name | "Senior Designer" |
    | Description | "Experienced designer with approval rights" |
  And Admin configures permissions:
    | Module | View | Execute | Create | Approve | Configure | Delete |
    | fashion-research | Yes | No | No | No | No | No |
    | product-planning | Yes | No | No | No | No | No |
    | design-auto | Yes | Yes | Yes | Yes | No | No |
    | work-order | Yes | Yes | Yes | No | No | No |
    | material-sourcing | Yes | No | No | No | No | No |
  And Admin sets dataScope to "team"
  And Admin clicks "Save Role"
  Then MegaAppRole record created
  And role available for user assignment
  And permissions take effect immediately for assigned users

Scenario: Modify existing role permissions
  Given role "Designer" exists with current permissions
  When Admin edits "Designer" role
  And Admin grants "canApprove" for "design-auto"
  And Admin clicks "Save Changes"
  Then role updated
  And all users with this role immediately gain new permission
  And change logged in audit trail with Admin's userId
  And affected users notified of permission change

Error Scenarios:
  - E1: Role name already exists → Validation error
  - E2: Attempt to remove all approvers for module → Warning about workflow impact
```

**US-ADMIN-002: User-Level Permission Override**
```gherkin
Feature: Admin sets user-specific permission overrides

Scenario: Grant additional permissions to specific user
  Given User "김디자이너" has "Designer" role
  And Designer role has canView but not canApprove for work-order
  And Admin wants to give this user approval rights
  When Admin navigates to User Permissions for "김디자이너"
  And Admin clicks "Add Override"
  And Admin selects module "work-order"
  And Admin enables "canApprove"
  And Admin enters reason "Acting lead while 박팀장 on leave"
  And Admin sets expiration "2026-02-28"
  Then ModulePermission record created with userId (not roleId)
  And user immediately has approval permission
  And override shows in user's permission summary
  And system reminder scheduled for expiration review

Scenario: Revoke override
  Given override exists for user
  When Admin deletes the override
  Then user's permissions revert to role defaults
  And revocation logged
  And user notified of change
```

#### 17.5.2 Module Configuration

**US-ADMIN-003: Configure Module Settings**
```gherkin
Feature: Admin configures module behavior

Scenario: Adjust module execution parameters
  Given Admin wants to configure "fashion-research" module
  When Admin opens Module Configuration
  And Admin adjusts:
    | Setting | Value |
    | Default Markets | ["Korea", "Japan"] |
    | Max Concurrent Executions | 3 |
    | Execution Timeout | 45 minutes |
    | Auto-retry on Failure | Enabled, max 2 retries |
    | Notification Channel | #mega-app-alerts |
  And Admin clicks "Save Configuration"
  Then MegaAppModule.executorConfig updated
  And future executions use new settings
  And active executions unaffected

Scenario: Enable/disable module
  Given module "sales-prediction" not needed for organization
  When Admin toggles module to "Disabled"
  Then module hidden from dashboard
  And execution blocked
  And existing artifacts remain accessible (read-only)
  And dependency warnings shown if downstream modules affected

Error Scenarios:
  - E1: Disable module with active executions → Warning, option to wait or force
  - E2: Disable required upstream module → Block with dependency explanation
```

#### 17.5.3 Data Management

**US-ADMIN-004: Manage Artifact Lifecycle**
```gherkin
Feature: Admin manages artifact data

Scenario: Archive old season data
  Given season "2025SS" artifacts exist
  And season completed over 1 year ago
  When Admin navigates to Data Management
  And Admin selects season "2025SS"
  And Admin clicks "Archive Season"
  And Admin confirms with "Archive and compress"
  Then all artifacts for season marked as "archived"
  And data compressed and moved to cold storage
  And artifacts no longer appear in active views
  And restoration option available for 7 years
  And storage costs reduced

Scenario: Permanently delete artifacts
  Given archived artifacts for discontinued product line
  And retention period (7 years) passed
  When Admin requests permanent deletion
  And requires secondary admin approval
  And both admins approve
  Then artifacts permanently deleted
  And S3 files removed
  And deletion recorded in compliance log
  And action irreversible

Error Scenarios:
  - E1: Delete artifact with active downstream → Block with dependency list
  - E2: Delete within retention period → Require compliance override
```

#### 17.5.4 Agent Team Management

**US-ADMIN-005: Configure Agent Teams**
```gherkin
Feature: Admin manages agent organization

Scenario: Create new agent team
  Given Admin wants to expand Design domain capacity
  When Admin navigates to Agent Teams
  And Admin clicks "Create Team"
  And Admin configures:
    | Field | Value |
    | Name | "CAD Specialists" |
    | Parent Team | "Design Domain" |
    | Primary Module | "design-auto" |
    | Max Agents | 5 |
    | Scaling Policy | "demand-based" |
  And Admin clicks "Create"
  Then MegaAppTeam record created
  And team appears in hierarchy under Design Domain
  And ready to receive agent assignments

Scenario: Configure auto-scaling rules
  Given team "CAD Specialists" exists
  When Admin adds scaling rule:
    | Trigger | Threshold | Action |
    | Queue Depth | > 10 tasks | Scale up by 2 agents |
    | Queue Depth | < 3 tasks for 30min | Scale down by 1 agent |
  Then AgentScalingRule records created
  And system monitors queue and auto-scales
  And scaling events logged
  And Admin receives daily scaling summary

Acceptance Criteria:
  - [ ] Scaling reacts within 2 minutes of threshold breach
  - [ ] Cooldown prevents thrashing (minimum 5 min between scale actions)
  - [ ] Cost impact shown before enabling auto-scale
```

---

## 18. Edge Cases & Error Scenarios

### 18.1 Module Data Flow Interruptions

#### 18.1.1 Partial Completion Scenarios

**EC-FLOW-001: Agent Crashes Mid-Execution**
```typescript
interface PartialCompletionScenario {
  scenario: "Agent process terminates unexpectedly during artifact creation";
  detection: {
    method: "Heartbeat monitoring + execution timeout",
    heartbeatInterval: "30 seconds",
    timeoutThreshold: "3 missed heartbeats",
    implementation: `
      // BullMQ worker heartbeat
      worker.on('active', (job) => {
        const heartbeat = setInterval(async () => {
          await job.updateProgress({ heartbeat: Date.now() });
        }, 30000);
        job.data._heartbeatInterval = heartbeat;
      });
    `
  };
  recovery: {
    step1: "Mark AgentExecution as 'interrupted'",
    step2: "Check for partial artifacts (status='processing')",
    step3: "If partial artifact exists: mark as 'incomplete', preserve data",
    step4: "Emit 'execution.interrupted' event",
    step5: "Auto-retry if retryCount < maxRetries",
    step6: "If max retries exceeded: notify user, require manual intervention"
  };
  dataIntegrity: {
    partialArtifact: "Preserved with status 'incomplete' for inspection",
    upstreamLinks: "Retained for lineage tracking",
    downstreamBlocking: "Downstream modules remain blocked"
  };
  userExperience: {
    notification: "Module execution interrupted. Partial results saved. [Retry] [View Partial] [Cancel]",
    dashboard: "Module shows 'Interrupted' status with warning icon"
  };
}
```

**EC-FLOW-002: Timeout During External API Call**
```typescript
interface ExternalAPITimeoutScenario {
  scenario: "External service (Google Trends, CLO3D, etc.) times out";
  detection: {
    perAPITimeout: "60 seconds per request",
    totalExecutionTimeout: "30 minutes",
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: "5 minutes",
      halfOpenRequests: 3
    }
  };
  recovery: {
    immediate: [
      "Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)",
      "Try alternative API if available (e.g., Pinterest instead of Google Trends)",
      "Use cached data if fresh enough (< 24 hours)"
    ],
    persistent: [
      "Mark service as degraded in health status",
      "Continue with partial data, flag output as 'partial_data'",
      "Queue for background completion when service recovers"
    ]
  };
  userNotification: {
    slack: "Fashion Research partially complete. Google Trends unavailable. Using cached data from [date]. [View Results] [Retry Full]",
    dashboard: "Yellow warning: 'Partial data - some sources unavailable'"
  };
}
```

**EC-FLOW-003: Database Connection Lost During Write**
```typescript
interface DBConnectionLossScenario {
  scenario: "PostgreSQL connection drops during artifact save";
  prevention: {
    connectionPool: "PgBouncer with max 100 connections",
    idleTimeout: "30 seconds",
    connectionRetry: "3 attempts with 1s delay"
  };
  detection: {
    errorTypes: ["ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST"],
    monitoring: "Prometheus postgres_connections_active metric"
  };
  recovery: {
    transactionRollback: "Automatic via Prisma transaction",
    stateReconstruction: [
      "Check BullMQ job state for last known progress",
      "Compare artifact.updatedAt with job progress timestamp",
      "Reconstruct from job.data if artifact partially written"
    ],
    retry: "Automatic retry with fresh connection"
  };
  dataConsistency: {
    guarantee: "ACID transaction - either full commit or full rollback",
    orphanPrevention: "Foreign key constraints prevent orphaned links"
  };
}
```

#### 18.1.2 Cascade Failure Scenarios

**EC-FLOW-004: Upstream Artifact Deletion with Active Downstream**
```typescript
interface CascadeDeletionScenario {
  scenario: "User attempts to delete TrendReport while SKUPlan references it";
  prevention: {
    softDeleteOnly: "All artifacts use soft delete (archived status)",
    deletionCheck: `
      async function canDelete(artifactId: string): Promise<DeleteCheckResult> {
        const downstream = await getDownstreamArtifacts(artifactId);
        const activeDownstream = downstream.filter(d => d.status !== 'archived');

        if (activeDownstream.length > 0) {
          return {
            canDelete: false,
            reason: 'active_downstream',
            blockingArtifacts: activeDownstream.map(d => ({
              id: d.id,
              moduleId: d.moduleId,
              status: d.status
            }))
          };
        }
        return { canDelete: true };
      }
    `
  };
  handling: {
    blocked: "Return 409 Conflict with list of dependent artifacts",
    forceDelete: {
      requirement: "Admin role + explicit force flag + reason",
      action: "Archive upstream, mark downstream as 'orphaned'",
      notification: "Notify all downstream artifact owners"
    }
  };
  orphanHandling: {
    status: "orphaned",
    visibility: "Warning banner on artifact view",
    restoration: "Re-link to alternative upstream or create placeholder",
    cleanup: "Orphan artifacts auto-archived after 90 days if unresolved"
  };
}
```

**EC-FLOW-005: Module Version Incompatibility**
```typescript
interface VersionIncompatibilityScenario {
  scenario: "Module upgrade changes output schema, existing artifacts incompatible";
  detection: {
    schemaValidation: "JSON Schema validation on artifact load",
    versionTracking: "artifact.metadata.moduleVersion field",
    incompatibilityCheck: `
      function isCompatible(artifact: Artifact, moduleSchema: JSONSchema): boolean {
        const result = ajv.validate(moduleSchema, artifact.data);
        return result === true;
      }
    `
  };
  migration: {
    strategy: "Version-specific transformers",
    implementation: `
      const migrators: Record<string, ArtifactMigrator> = {
        'fashion-research:1.0->2.0': (artifact) => ({
          ...artifact.data,
          trends: artifact.data.trends.map(t => ({
            ...t,
            confidenceScore: t.confidence ?? 0.5 // New required field
          }))
        })
      };
    `,
    execution: "Background job on module upgrade",
    rollback: "Original version preserved in artifact.metadata.previousData"
  };
  userExperience: {
    notification: "Module upgraded. Migrating [N] artifacts. This may take [time].",
    progress: "Migration progress visible in admin dashboard",
    compatibility: "Old artifacts remain readable during migration"
  };
}
```

### 18.2 Permission Conflicts

#### 18.2.1 Role vs User-Level Override Conflicts

**EC-PERM-001: Conflicting Permission Grants**
```typescript
interface PermissionConflictScenario {
  scenario: "User has role permission but user-level override denies";
  resolution: {
    rule: "Most specific wins: User override > Role default",
    implementation: `
      async function resolvePermission(
        userId: string,
        moduleId: string,
        action: PermissionAction
      ): Promise<boolean> {
        // 1. Check user-specific override (highest priority)
        const userOverride = await db.modulePermission.findFirst({
          where: { userId, moduleId }
        });
        if (userOverride) {
          return userOverride[action]; // Explicit allow or deny
        }

        // 2. Check role-based permission
        const membership = await db.membership.findFirst({
          where: { userId },
          include: { megaAppRole: true }
        });
        if (membership?.megaAppRole) {
          const rolePermission = await db.modulePermission.findFirst({
            where: { megaAppRoleId: membership.megaAppRoleId, moduleId }
          });
          if (rolePermission) return rolePermission[action];

          // 3. Check role defaults
          const defaults = membership.megaAppRole.defaultPermissions as PermissionSet;
          return defaults[moduleId]?.[action] ?? false;
        }

        // 4. Deny by default
        return false;
      }
    `
  };
  auditTrail: {
    logging: "All permission checks logged with resolution path",
    format: {
      userId: "uuid",
      moduleId: "string",
      action: "string",
      result: "boolean",
      resolvedVia: "user_override | role_permission | role_default | denied_default",
      timestamp: "ISO8601"
    }
  };
}
```

**EC-PERM-002: Permission Escalation Attempt**
```typescript
interface PermissionEscalationScenario {
  scenario: "User attempts to grant themselves higher permissions";
  detection: {
    selfModification: "Block any ModulePermission where grantor === grantee",
    roleEscalation: "Block granting permissions not held by grantor",
    implementation: `
      async function validatePermissionGrant(
        grantorId: string,
        granteeId: string,
        moduleId: string,
        permissions: PermissionSet
      ): Promise<ValidationResult> {
        // Self-grant prevention
        if (grantorId === granteeId) {
          return { valid: false, reason: 'self_grant_prohibited' };
        }

        // Check grantor has admin rights
        const grantorCanConfigure = await resolvePermission(
          grantorId, moduleId, 'canConfigure'
        );
        if (!grantorCanConfigure) {
          return { valid: false, reason: 'insufficient_privilege' };
        }

        // Prevent granting higher than self
        for (const [action, value] of Object.entries(permissions)) {
          if (value && !await resolvePermission(grantorId, moduleId, action)) {
            return {
              valid: false,
              reason: 'cannot_grant_unowned_permission',
              detail: \`Cannot grant \${action} - grantor does not have this permission\`
            };
          }
        }

        return { valid: true };
      }
    `
  };
  response: {
    httpStatus: 403,
    errorCode: "PERMISSION_ESCALATION_BLOCKED",
    logging: "Security event logged with full context",
    notification: "Admin notified of escalation attempt"
  };
}
```

#### 18.2.2 Concurrent Permission Changes

**EC-PERM-003: Race Condition in Permission Check**
```typescript
interface PermissionRaceConditionScenario {
  scenario: "Permission revoked while user mid-operation";
  prevention: {
    permissionCaching: {
      duration: "5 minutes",
      invalidation: "Immediate on any permission change for user"
    },
    operationLocking: `
      async function executeWithPermissionLock(
        userId: string,
        moduleId: string,
        operation: () => Promise<void>
      ) {
        const lockKey = \`perm:\${userId}:\${moduleId}\`;
        const lock = await redisLock.acquire(lockKey, 30000);

        try {
          // Re-check permission with fresh data
          const hasPermission = await resolvePermission(userId, moduleId, 'canExecute');
          if (!hasPermission) {
            throw new PermissionDeniedError('Permission revoked during operation');
          }
          await operation();
        } finally {
          await lock.release();
        }
      }
    `
  };
  handling: {
    midOperation: "Allow current operation to complete, block subsequent",
    notification: "User notified of permission change on next action",
    gracePeriod: "5 minute grace period for in-flight operations"
  };
}
```

### 18.3 Data Inconsistency Scenarios

#### 18.3.1 Version Mismatches

**EC-DATA-001: Stale Data in Concurrent Edits**
```typescript
interface StaleDataScenario {
  scenario: "Two users edit same artifact simultaneously";
  detection: {
    optimisticLocking: `
      // Prisma update with version check
      const updated = await prisma.valueStreamArtifact.updateMany({
        where: {
          id: artifactId,
          version: expectedVersion // Optimistic lock
        },
        data: {
          data: newData,
          version: { increment: 1 },
          updatedAt: new Date()
        }
      });

      if (updated.count === 0) {
        throw new OptimisticLockError('Artifact modified by another user');
      }
    `
  };
  resolution: {
    strategy: "Last-write-wins with merge option",
    userOptions: [
      "Overwrite (discard other's changes)",
      "Merge (attempt automatic merge)",
      "Review (show diff, manual resolution)",
      "Cancel (discard my changes)"
    ],
    mergeAlgorithm: "JSON diff/patch with conflict markers for incompatible changes"
  };
  prevention: {
    realTimePresence: "Show who is currently editing",
    lockOnEdit: "Optional exclusive lock for 15 minutes",
    autoSave: "Draft auto-saves every 30 seconds to prevent loss"
  };
}
```

**EC-DATA-002: Orphaned Artifacts from Failed Linking**
```typescript
interface OrphanedArtifactScenario {
  scenario: "Artifact created but link to upstream fails";
  prevention: {
    atomicCreation: `
      await prisma.$transaction(async (tx) => {
        // Create artifact
        const artifact = await tx.valueStreamArtifact.create({ data: artifactData });

        // Create links (fails entire transaction if this fails)
        await tx.artifactLink.createMany({
          data: upstreamIds.map(upId => ({
            upstreamId: upId,
            downstreamId: artifact.id,
            relationshipType: 'source'
          }))
        });

        return artifact;
      });
    `
  };
  detection: {
    orphanDetector: `
      // Scheduled job runs hourly
      const orphans = await prisma.valueStreamArtifact.findMany({
        where: {
          moduleId: { not: 'fashion-research' }, // Entry modules exempt
          upstreamLinks: { none: {} },
          status: { notIn: ['archived', 'orphaned'] },
          createdAt: { lt: subHours(new Date(), 1) } // Grace period
        }
      });
    `,
    alertThreshold: "Any orphan triggers investigation"
  };
  resolution: {
    automatic: "Attempt to infer upstream from metadata.sourceArtifactId",
    manual: "Flag for admin review, suggest likely upstream artifacts",
    cleanup: "Mark as orphaned after 7 days unresolved"
  };
}
```

#### 18.3.2 Cross-Module Data Drift

**EC-DATA-003: Upstream Modified After Downstream Created**
```typescript
interface DataDriftScenario {
  scenario: "TrendReport updated, but derived SKUPlan still references old version";
  detection: {
    versionTracking: `
      interface ArtifactReference {
        artifactId: string;
        moduleId: string;
        version: number; // Version at time of reference
      }
    `,
    driftDetection: `
      async function checkDrift(artifactId: string): Promise<DriftReport> {
        const artifact = await getArtifact(artifactId);
        const upstreams = await getUpstreamArtifacts(artifactId);

        const drifted = upstreams.filter(up => {
          const refVersion = artifact.metadata.upstream
            .find(u => u.artifactId === up.id)?.version;
          return up.version > refVersion;
        });

        return {
          hasDrift: drifted.length > 0,
          driftedUpstreams: drifted.map(d => ({
            artifactId: d.id,
            referencedVersion: /* ... */,
            currentVersion: d.version,
            changesSummary: /* diff summary */
          }))
        };
      }
    `
  };
  notification: {
    trigger: "On upstream version increment",
    message: "Source data updated. Your [artifact] may need review.",
    actions: ["View Changes", "Re-sync", "Acknowledge (no action needed)"]
  };
  resolution: {
    manual: "User reviews changes and decides action",
    autoSync: "For non-critical modules, option to auto-propagate",
    propagation: `
      async function propagateChanges(upstreamId: string) {
        const downstreams = await getDownstreamArtifacts(upstreamId);
        for (const ds of downstreams) {
          if (ds.metadata.autoSync) {
            await requeueModuleExecution(ds.moduleId, ds.id);
          } else {
            await notifyDrift(ds.id, upstreamId);
          }
        }
      }
    `
  };
}
```

### 18.4 Concurrent Access Scenarios

#### 18.4.1 Simultaneous Edits

**EC-CONC-001: Multiple Users Editing Same Artifact**
```typescript
interface SimultaneousEditScenario {
  scenario: "Designer A and Designer B both editing DesignFile";
  realTimeCollaboration: {
    presence: `
      // WebSocket presence tracking
      interface EditSession {
        artifactId: string;
        userId: string;
        userName: string;
        cursorPosition?: { section: string; field: string };
        lastActivity: Date;
      }

      // On artifact open
      await websocket.emit('artifact:join', { artifactId, userId });

      // Broadcast to other editors
      socket.to(\`artifact:\${artifactId}\`).emit('user:joined', {
        userId, userName, timestamp: Date.now()
      });
    `,
    conflictPrevention: [
      "Show real-time who is editing what section",
      "Warn before editing section another user is in",
      "Auto-lock section when user starts typing (5 second timeout)"
    ]
  };
  conflictResolution: {
    sectionLevel: "Lock at section level, not entire artifact",
    timeout: "Section lock expires after 30 seconds of inactivity",
    override: "User can request lock override (notifies current holder)"
  };
}
```

#### 18.4.2 Race Conditions in Module Execution

**EC-CONC-002: Duplicate Module Execution Requests**
```typescript
interface DuplicateExecutionScenario {
  scenario: "User double-clicks Execute, or API called twice";
  prevention: {
    idempotencyKey: `
      // Client generates unique key per action
      const idempotencyKey = \`\${userId}:\${moduleId}:\${Date.now()}\`;

      // Server checks before execution
      const existing = await redis.get(\`idem:\${idempotencyKey}\`);
      if (existing) {
        return { status: 'already_processing', executionId: existing };
      }

      // Set with 1 hour expiry
      await redis.setex(\`idem:\${idempotencyKey}\`, 3600, executionId);
    `,
    uiDebounce: "Disable Execute button for 2 seconds after click",
    singletonExecution: `
      // Only one active execution per module per context
      const activeExecution = await prisma.agentExecution.findFirst({
        where: {
          'metadata.moduleId': moduleId,
          'metadata.contextId': contextId, // e.g., seasonCode
          status: { in: ['pending', 'running'] }
        }
      });

      if (activeExecution) {
        throw new DuplicateExecutionError(\`Execution already in progress: \${activeExecution.id}\`);
      }
    `
  };
  handling: {
    duplicate: "Return existing execution ID, don't create new",
    nearSimultaneous: "First request wins, second returns 409 Conflict"
  };
}
```

#### 18.4.3 Lock Contention

**EC-CONC-003: Deadlock in Cross-Module Operations**
```typescript
interface DeadlockScenario {
  scenario: "Module A waits for artifact X (locked by B), Module B waits for artifact Y (locked by A)";
  prevention: {
    lockOrdering: "Always acquire locks in consistent order (by artifact ID)",
    lockTimeout: "Maximum 30 second wait for any lock",
    deadlockDetection: `
      // Lock manager tracks wait-for graph
      class LockManager {
        private waitGraph: Map<string, string[]> = new Map();

        async acquireLock(resourceId: string, holderId: string): Promise<Lock> {
          // Check for cycle before waiting
          if (this.wouldCauseCycle(holderId, resourceId)) {
            throw new DeadlockPreventedError(\`Acquiring \${resourceId} would cause deadlock\`);
          }
          // ... acquire logic
        }

        private wouldCauseCycle(requester: string, resource: string): boolean {
          // DFS to detect cycle
          const visited = new Set<string>();
          const stack = [this.getHolder(resource)];
          while (stack.length > 0) {
            const current = stack.pop()!;
            if (current === requester) return true;
            if (visited.has(current)) continue;
            visited.add(current);
            stack.push(...this.getWaitingFor(current));
          }
          return false;
        }
      }
    `
  };
  recovery: {
    detection: "Timeout-based (30 seconds)",
    resolution: "Abort younger transaction, retry with backoff",
    notification: "Log deadlock event, alert if recurring"
  };
}
```

### 18.5 Rollback & Recovery Scenarios

#### 18.5.1 Failed Mid-Stream Operations

**EC-ROLLBACK-001: Partial Pipeline Failure**
```typescript
interface PartialPipelineFailureScenario {
  scenario: "Design → Work Order → Material Sourcing: Work Order succeeds, Material Sourcing fails";
  state: {
    design: { status: "approved", version: 1 },
    workOrder: { status: "completed", version: 1 }, // Succeeded
    materialSourcing: { status: "failed", error: "Supplier API down" } // Failed
  };
  recovery: {
    options: [
      {
        name: "Retry failed step",
        action: "Re-execute Material Sourcing with same inputs",
        when: "Transient failure (API timeout, rate limit)"
      },
      {
        name: "Rollback to checkpoint",
        action: "Archive Work Order, return to Design approved state",
        when: "Fundamental incompatibility discovered"
      },
      {
        name: "Manual intervention",
        action: "Flag for human review, provide partial results",
        when: "Business decision required"
      },
      {
        name: "Skip and continue",
        action: "Mark Material Sourcing as 'skipped', proceed with defaults",
        when: "Non-critical module for workflow"
      }
    ],
    implementation: `
      async function handlePipelineFailure(
        pipelineId: string,
        failedStep: string,
        error: Error
      ): Promise<RecoveryAction> {
        const pipeline = await getPipeline(pipelineId);
        const failedModule = pipeline.steps.find(s => s.moduleId === failedStep);

        // Check if retryable
        if (isTransientError(error) && failedModule.retryCount < 3) {
          return { action: 'retry', delay: exponentialBackoff(failedModule.retryCount) };
        }

        // Check if skippable
        if (failedModule.optional) {
          return { action: 'skip', reason: error.message };
        }

        // Require manual intervention
        return {
          action: 'pause',
          notification: await notifyPipelineOwner(pipelineId, failedStep, error)
        };
      }
    `
  };
}
```

#### 18.5.2 Artifact Restoration

**EC-ROLLBACK-002: Restore Deleted/Corrupted Artifact**
```typescript
interface ArtifactRestorationScenario {
  scenario: "User accidentally archives critical artifact, needs restoration";
  backupStrategy: {
    softDelete: "All deletes are soft (status='archived')",
    retention: "Archived artifacts retained 90 days",
    snapshots: "Daily snapshots of all artifacts to cold storage",
    pointInTime: "Transaction log enables point-in-time recovery"
  };
  restoration: {
    fromArchive: `
      async function restoreFromArchive(artifactId: string): Promise<Artifact> {
        const archived = await prisma.valueStreamArtifact.findFirst({
          where: { id: artifactId, status: 'archived' }
        });

        if (!archived) throw new NotFoundError('Archived artifact not found');

        // Restore with new version
        return await prisma.valueStreamArtifact.update({
          where: { id: artifactId },
          data: {
            status: 'restored',
            version: { increment: 1 },
            metadata: {
              ...archived.metadata,
              restoredAt: new Date().toISOString(),
              restoredFrom: 'archive'
            }
          }
        });
      }
    `,
    fromSnapshot: `
      async function restoreFromSnapshot(
        artifactId: string,
        snapshotDate: Date
      ): Promise<Artifact> {
        // Fetch from cold storage
        const snapshot = await coldStorage.getSnapshot(artifactId, snapshotDate);

        // Create new version with snapshot data
        return await prisma.valueStreamArtifact.create({
          data: {
            ...snapshot,
            id: undefined, // Generate new ID
            previousVersionId: artifactId,
            status: 'restored',
            metadata: {
              ...snapshot.metadata,
              restoredAt: new Date().toISOString(),
              restoredFrom: \`snapshot:\${snapshotDate.toISOString()}\`
            }
          }
        });
      }
    `
  };
  cascadeRestoration: {
    upstreamCheck: "Verify all upstream artifacts exist or restore them too",
    downstreamNotification: "Notify owners of downstream artifacts",
    linkReconstruction: "Recreate ArtifactLink records"
  };
}
```

#### 18.5.3 Cascade Failure Recovery

**EC-ROLLBACK-003: Full Value Stream Recovery**
```typescript
interface CascadeRecoveryScenario {
  scenario: "Catastrophic failure corrupts multiple interconnected artifacts";
  detection: {
    integrityCheck: `
      async function checkValueStreamIntegrity(seasonCode: string): Promise<IntegrityReport> {
        const artifacts = await prisma.valueStreamArtifact.findMany({
          where: { seasonCode },
          include: { upstreamLinks: true, downstreamLinks: true }
        });

        const issues: IntegrityIssue[] = [];

        for (const artifact of artifacts) {
          // Check data schema validity
          const moduleSchema = await getModuleSchema(artifact.moduleId);
          if (!ajv.validate(moduleSchema, artifact.data)) {
            issues.push({ type: 'schema_invalid', artifactId: artifact.id });
          }

          // Check link integrity
          for (const link of artifact.upstreamLinks) {
            const upstream = artifacts.find(a => a.id === link.upstreamId);
            if (!upstream) {
              issues.push({ type: 'broken_link', artifactId: artifact.id, missingId: link.upstreamId });
            }
          }

          // Check version consistency
          // ... additional checks
        }

        return { seasonCode, artifactCount: artifacts.length, issues };
      }
    `
  };
  recovery: {
    isolated: "Recover individual artifacts without affecting others",
    cascade: `
      async function recoverValueStream(seasonCode: string, toDate: Date): Promise<RecoveryResult> {
        // 1. Identify recovery point
        const snapshot = await findNearestSnapshot(seasonCode, toDate);

        // 2. Build dependency order
        const recoveryOrder = await buildRecoveryOrder(seasonCode);

        // 3. Recover in order (upstream first)
        const results: RecoveryResult[] = [];
        for (const artifactId of recoveryOrder) {
          try {
            const result = await restoreFromSnapshot(artifactId, snapshot.date);
            results.push({ artifactId, status: 'recovered', newId: result.id });
          } catch (error) {
            results.push({ artifactId, status: 'failed', error: error.message });
          }
        }

        // 4. Rebuild links
        await rebuildArtifactLinks(seasonCode, results);

        return { seasonCode, recoveredAt: new Date(), artifacts: results };
      }
    `
  };
  verification: {
    postRecovery: "Run full integrity check",
    userConfirmation: "Require user to verify critical artifacts",
    auditLog: "Complete recovery audit trail"
  };
}
```

---

## 19. Agent Development Organization Evolution

### 19.1 MVP Phase: Single Agent Per Module

#### 19.1.1 Initial Agent Structure

```typescript
interface MVPAgentStructure {
  phase: "MVP";
  timeline: "Week 1-4";
  agentCount: "1 agent per module (9 total)";

  structure: {
    "fashion-research": {
      agent: "trend-analyst",
      responsibilities: [
        "Scrape trend data from multiple sources",
        "Extract keywords and patterns",
        "Generate color palettes",
        "Create trend reports"
      ],
      skills: [
        "trend-scraping",
        "keyword-extraction",
        "color-analysis",
        "report-generation"
      ],
      mcpTools: ["google-trends", "instagram-scraper", "pinterest-trends"]
    },
    "product-planning": {
      agent: "md-planner",
      responsibilities: [
        "Consume trend reports",
        "Generate SKU distribution",
        "Optimize category mix",
        "Calculate margin targets"
      ],
      skills: ["sku-optimization", "category-mix", "margin-calculator"]
    },
    "design-auto": {
      agent: "design-generator",
      responsibilities: [
        "Generate design concepts",
        "Create 3D models",
        "Produce tech drawings",
        "Manage design versions"
      ],
      skills: ["concept-generation", "clo3d-integration", "tech-drawing"],
      mcpTools: ["clo3d", "midjourney", "figma"]
    },
    "work-order": {
      agent: "tech-pack-creator",
      responsibilities: [
        "Extract specs from designs",
        "Generate tech packs",
        "Validate measurements",
        "Create size grading"
      ],
      skills: ["spec-extraction", "measurement-validation", "size-grading"]
    },
    "work-instructions": {
      agent: "qc-advisor",
      responsibilities: [
        "Analyze production requirements",
        "Generate QC checklists",
        "Create warning notes",
        "Document common defects"
      ],
      skills: ["qc-analysis", "defect-prediction", "instruction-generation"]
    },
    "material-sourcing": {
      agent: "sourcing-advisor",
      responsibilities: [
        "Match materials to specs",
        "Query supplier databases",
        "Compare pricing and lead times",
        "Suggest alternatives"
      ],
      skills: ["material-matching", "supplier-search", "cost-comparison"],
      mcpTools: ["supplier-db"]
    },
    "line-sheet": {
      agent: "linesheet-creator",
      responsibilities: [
        "Compile product information",
        "Generate line sheet layouts",
        "Export to PDF/Excel",
        "Manage pricing display"
      ],
      skills: ["layout-generation", "pdf-export", "excel-export"]
    },
    "cost-prediction": {
      agent: "cost-estimator",
      responsibilities: [
        "Calculate material costs",
        "Estimate labor costs",
        "Factor overhead and shipping",
        "Generate cost breakdowns"
      ],
      skills: ["cost-calculation", "labor-estimation", "overhead-analysis"]
    },
    "sales-prediction": {
      agent: "demand-forecaster",
      responsibilities: [
        "Analyze historical data",
        "Apply trend factors",
        "Generate demand curves",
        "Calculate confidence intervals"
      ],
      skills: ["historical-analysis", "forecasting", "confidence-modeling"]
    }
  };

  metrics: {
    successCriteria: {
      taskCompletionRate: ">90%",
      averageExecutionTime: "<30 minutes per module",
      errorRate: "<5%"
    },
    monitoredMetrics: [
      "execution_duration_seconds",
      "task_success_rate",
      "retry_count",
      "error_type_distribution"
    ]
  };
}
```

### 19.2 Growth Phase: Team Expansion (2-3 Agents)

#### 19.2.1 Split Triggers

```typescript
interface GrowthPhaseStructure {
  phase: "Growth";
  timeline: "Week 5-10 and ongoing";

  splitTriggers: {
    workloadBased: {
      queueDepth: ">10 pending tasks for >1 hour",
      avgWaitTime: ">15 minutes",
      utilizationRate: ">80% consistently"
    },
    complexityBased: {
      taskDiversity: "Multiple distinct task types requiring different skills",
      errorPatterns: "Specific task types showing higher error rates",
      expertiseGap: "Tasks requiring specialized knowledge"
    },
    qualityBased: {
      outputQuality: "Quality scores declining with volume",
      reviewFeedback: "Frequent revision requests on specific task types",
      expertiseNeed: "Complex tasks requiring deeper domain knowledge"
    }
  };

  splitStrategies: {
    "functional-split": {
      description: "Split by function/skill type",
      example: {
        before: "design-generator (all design tasks)",
        after: [
          "concept-artist (mockups, initial concepts)",
          "cad-specialist (3D modeling, tech drawings)"
        ]
      },
      when: "Tasks clearly divide into distinct skill sets"
    },
    "quality-tier-split": {
      description: "Split by quality/complexity tier",
      example: {
        before: "cost-estimator (all cost calculations)",
        after: [
          "quick-estimator (rough estimates, <5 min)",
          "detailed-analyst (full breakdown, complex scenarios)"
        ]
      },
      when: "Mix of simple and complex tasks with different SLAs"
    },
    "pipeline-split": {
      description: "Split sequential steps into specialists",
      example: {
        before: "tech-pack-creator (full tech pack)",
        after: [
          "spec-extractor (extract from designs)",
          "grading-specialist (size grading)",
          "pack-assembler (compile final document)"
        ]
      },
      when: "Sequential steps can be parallelized"
    }
  };
}
```

#### 19.2.2 Growth Phase Agent Configurations

```yaml
# Design Domain Growth Example
# extensions/design-automation/agents/team-config.yaml

team:
  name: "Design Automation Team"
  module: "design-auto"
  phase: "growth"

  lead:
    id: design-lead
    model: claude-sonnet-4-20250514
    responsibilities:
      - Task routing and prioritization
      - Quality review of outputs
      - Escalation handling
      - Team coordination

  workers:
    - id: concept-artist
      model: claude-sonnet-4-20250514
      specialization: "Visual concept generation"
      skills:
        - concept-generation
        - style-interpretation
        - color-application
      mcpTools:
        - midjourney
        - dall-e
      taskTypes:
        - initial_mockup
        - style_exploration
        - color_variant

    - id: cad-specialist
      model: claude-sonnet-4-20250514
      specialization: "3D modeling and technical drawings"
      skills:
        - clo3d-integration
        - tech-drawing
        - pattern-generation
      mcpTools:
        - clo3d
        - figma
      taskTypes:
        - 3d_model
        - tech_drawing
        - pattern_piece

  routing:
    rules:
      - condition: "taskType in ['initial_mockup', 'style_exploration']"
        assignTo: "concept-artist"
      - condition: "taskType in ['3d_model', 'tech_drawing']"
        assignTo: "cad-specialist"
      - condition: "priority == 'urgent'"
        assignTo: "design-lead"  # Lead handles urgent directly

  scaling:
    minWorkers: 2
    maxWorkers: 5
    scaleUpThreshold:
      queueDepth: 10
      waitTime: "10 minutes"
    scaleDownThreshold:
      queueDepth: 2
      idleTime: "30 minutes"
```

### 19.3 Mature Phase: Full Team Structure

#### 19.3.1 Mature Organization Hierarchy

```typescript
interface MaturePhaseStructure {
  phase: "Mature";
  timeline: "Week 11+ (as needed)";

  hierarchy: {
    level1_orchestrator: {
      agent: "mega-app-orchestrator",
      role: "CEO Agent",
      responsibilities: [
        "Cross-domain coordination",
        "Resource allocation across domains",
        "Strategic decision escalation",
        "Performance optimization"
      ],
      model: "claude-opus-4-5-20251101",
      reports: ["planning-lead", "design-lead", "production-lead"]
    },

    level2_domainLeads: {
      "planning-lead": {
        role: "VP Planning",
        modules: ["fashion-research", "product-planning", "sales-prediction"],
        responsibilities: [
          "Planning domain coordination",
          "Cross-module data flow",
          "Quality assurance for planning outputs",
          "Stakeholder communication"
        ],
        model: "claude-sonnet-4-20250514"
      },
      "design-lead": {
        role: "VP Design",
        modules: ["design-auto", "line-sheet"],
        responsibilities: [
          "Design quality standards",
          "Creative direction alignment",
          "Design team capacity management",
          "Tool integration oversight"
        ],
        model: "claude-sonnet-4-20250514"
      },
      "production-lead": {
        role: "VP Production",
        modules: ["work-order", "work-instructions", "material-sourcing", "cost-prediction"],
        responsibilities: [
          "Production feasibility review",
          "Supply chain coordination",
          "Cost optimization",
          "Factory communication"
        ],
        model: "claude-sonnet-4-20250514"
      }
    },

    level3_teamLeads: {
      description: "Lead agent per module team",
      responsibilities: [
        "Daily task assignment",
        "Worker agent supervision",
        "Quality review before delivery",
        "Issue escalation to domain lead"
      ]
    },

    level4_workers: {
      description: "Specialist workers",
      types: [
        "Execution workers (task completion)",
        "QA workers (review and validation)",
        "Research workers (data gathering)"
      ]
    }
  };

  teamSizes: {
    "fashion-research": { lead: 1, workers: "2-4" },
    "product-planning": { lead: 1, workers: "1-3" },
    "design-auto": { lead: 1, workers: "3-8" },  // Highest volume
    "work-order": { lead: 1, workers: "2-4" },
    "work-instructions": { lead: 1, workers: "1-2" },
    "material-sourcing": { lead: 1, workers: "2-4" },
    "line-sheet": { lead: 1, workers: "1-2" },
    "cost-prediction": { lead: 1, workers: "1-3" },
    "sales-prediction": { lead: 1, workers: "1-2" }
  };
}
```

### 19.4 Agent Collaboration Protocol

#### 19.4.1 Communication Patterns

```typescript
interface AgentCollaborationProtocol {
  communicationChannels: {
    taskHandoff: {
      mechanism: "BullMQ job queue",
      format: {
        fromAgent: "string",
        toAgent: "string",
        taskId: "string",
        context: "TaskContext",
        artifacts: "ArtifactReference[]",
        priority: "number",
        deadline: "Date?"
      },
      acknowledgment: "Required within 30 seconds"
    },

    statusBroadcast: {
      mechanism: "Redis Pub/Sub",
      channel: "agent:status:{moduleId}",
      events: [
        "agent.started",
        "agent.idle",
        "agent.busy",
        "agent.error",
        "agent.completed"
      ]
    },

    escalation: {
      mechanism: "Direct agent invocation via delegateTask()",
      levels: [
        { from: "worker", to: "team-lead", threshold: "2 retries failed" },
        { from: "team-lead", to: "domain-lead", threshold: "decision required" },
        { from: "domain-lead", to: "orchestrator", threshold: "cross-domain impact" }
      ]
    }
  };

  handoffProtocol: {
    standard: `
      async function handoffTask(
        fromAgent: AgentContext,
        toAgentType: string,
        task: Task,
        artifacts: Artifact[]
      ): Promise<HandoffResult> {
        // 1. Prepare context summary
        const contextSummary = await fromAgent.summarizeContext();

        // 2. Package artifacts with lineage
        const packagedArtifacts = artifacts.map(a => ({
          ...a,
          handoffMetadata: {
            fromAgent: fromAgent.id,
            timestamp: Date.now(),
            contextSnapshot: contextSummary
          }
        }));

        // 3. Create handoff job
        const job = await valueStreamQueue.add('handoff', {
          targetAgent: toAgentType,
          task,
          artifacts: packagedArtifacts,
          context: contextSummary,
          priority: task.priority
        });

        // 4. Wait for acknowledgment
        const ack = await waitForAck(job.id, 30000);
        if (!ack) {
          throw new HandoffTimeoutError(\`Agent \${toAgentType} did not acknowledge\`);
        }

        return { jobId: job.id, receivingAgent: ack.agentId };
      }
    `
  };

  conflictResolution: {
    resourceConflict: {
      detection: "Two agents request same artifact lock",
      resolution: "Priority-based (higher priority wins) + queue",
      fallback: "Escalate to lead after 5 minute wait"
    },
    decisionConflict: {
      detection: "Agents disagree on approach",
      resolution: "Escalate to lead with both perspectives",
      documentation: "Decision recorded with rationale"
    }
  };
}
```

#### 19.4.2 Context Sharing

```typescript
interface ContextSharingProtocol {
  sharedContext: {
    storage: "Redis with organization namespace",
    structure: {
      global: "Organization-wide context (season, deadlines)",
      domain: "Domain-specific context (design guidelines, cost targets)",
      module: "Module-specific context (current artifacts, active tasks)",
      task: "Task-specific context (requirements, constraints)"
    },
    ttl: {
      global: "24 hours",
      domain: "8 hours",
      module: "4 hours",
      task: "Until task completion + 1 hour"
    }
  };

  contextInheritance: `
    interface TaskContext {
      // Inherited from parent (read-only)
      inherited: {
        organizationId: string;
        seasonCode: string;
        collectionId?: string;
        costTargets: CostTarget;
        designGuidelines: DesignGuideline;
      };

      // Task-specific (mutable)
      local: {
        taskId: string;
        requirements: string[];
        constraints: Constraint[];
        inputArtifacts: ArtifactReference[];
        progress: TaskProgress;
      };

      // Agent-added insights (shared with downstream)
      insights: {
        agentId: string;
        findings: Finding[];
        recommendations: Recommendation[];
        warnings: Warning[];
      }[];
    }

    // Context propagation to downstream tasks
    async function propagateContext(
      upstreamTask: Task,
      downstreamTask: Task
    ): Promise<void> {
      const upstreamContext = await getTaskContext(upstreamTask.id);

      // Merge insights from upstream
      const downstreamContext = {
        inherited: upstreamContext.inherited,
        local: {
          ...downstreamTask.initialContext,
          inputArtifacts: [
            ...downstreamTask.initialContext.inputArtifacts,
            ...upstreamTask.outputArtifacts
          ]
        },
        insights: [
          ...upstreamContext.insights,
          // Add handoff insight
          {
            agentId: upstreamTask.agentId,
            findings: upstreamTask.findings,
            recommendations: upstreamTask.recommendations
          }
        ]
      };

      await setTaskContext(downstreamTask.id, downstreamContext);
    }
  `;
}
```

### 19.5 Promotion, Demotion & Retirement Criteria

#### 19.5.1 Performance Metrics

```typescript
interface AgentPerformanceMetrics {
  coreMetrics: {
    taskCompletionRate: {
      formula: "completed_tasks / (completed + failed + abandoned)",
      excellent: ">98%",
      good: "95-98%",
      acceptable: "90-95%",
      poor: "<90%"
    },
    averageTaskTime: {
      formula: "sum(task_duration) / completed_tasks",
      benchmarkBy: "task_type",
      excellent: "<50% of benchmark",
      good: "50-80% of benchmark",
      acceptable: "80-120% of benchmark",
      poor: ">120% of benchmark"
    },
    qualityScore: {
      formula: "weighted_avg(revision_rate, error_rate, approval_rate)",
      weights: { revision: 0.3, error: 0.3, approval: 0.4 },
      excellent: ">95",
      good: "85-95",
      acceptable: "70-85",
      poor: "<70"
    },
    resourceEfficiency: {
      formula: "output_value / (tokens_used + api_calls)",
      trackingPeriod: "7 days rolling"
    }
  };

  leadMetrics: {
    teamPerformance: "avg(worker_quality_scores)",
    escalationRate: "escalations / total_tasks",
    teamUtilization: "active_time / available_time",
    decisionQuality: "overturned_decisions / total_decisions"
  };
}
```

#### 19.5.2 Promotion Criteria

```typescript
interface PromotionCriteria {
  workerToLead: {
    minimumTenure: "30 days active",
    performanceRequirements: {
      taskCompletionRate: ">98%",
      qualityScore: ">90",
      avgTaskTime: "<70% benchmark"
    },
    additionalCriteria: [
      "Handled 500+ tasks successfully",
      "Zero critical errors in last 30 days",
      "Demonstrated cross-task coordination",
      "Positive peer agent feedback"
    ],
    evaluationProcess: `
      async function evaluateForPromotion(agentId: string): Promise<PromotionEvaluation> {
        const metrics = await getAgentMetrics(agentId, { days: 30 });
        const history = await getAgentHistory(agentId);

        const criteria = {
          tenure: history.activeDays >= 30,
          completionRate: metrics.taskCompletionRate >= 0.98,
          qualityScore: metrics.qualityScore >= 90,
          taskCount: history.completedTasks >= 500,
          criticalErrors: metrics.criticalErrorsLast30Days === 0,
          coordination: await evaluateCoordination(agentId)
        };

        const eligible = Object.values(criteria).every(c => c === true);

        return {
          agentId,
          eligible,
          criteria,
          recommendation: eligible ? 'promote' : 'continue_monitoring',
          nextReviewDate: addDays(new Date(), eligible ? 0 : 14)
        };
      }
    `
  };

  leadToDomainLead: {
    minimumTenure: "90 days as lead",
    performanceRequirements: {
      teamPerformance: ">90",
      escalationRate: "<5%",
      decisionQuality: ">95%"
    },
    additionalCriteria: [
      "Team size grown under leadership",
      "Cross-module collaboration demonstrated",
      "Strategic contributions documented"
    ]
  };
}
```

#### 19.5.3 Demotion & Retirement

```typescript
interface DemotionRetirementCriteria {
  demotion: {
    triggers: {
      performanceDecline: {
        condition: "qualityScore < 70 for 14 consecutive days",
        action: "Warning → Performance plan → Demotion if no improvement"
      },
      criticalErrors: {
        condition: "3+ critical errors in 7 days",
        action: "Immediate review → Possible demotion"
      },
      resourceInefficiency: {
        condition: "Resource usage 200%+ of peers for same task types",
        action: "Investigation → Retraining → Demotion if systemic"
      }
    },
    process: [
      "Document performance issues",
      "Assign performance improvement plan (7-14 days)",
      "Monitor with increased oversight",
      "If no improvement: demote to lower tier or retire"
    ],
    appeals: {
      reviewPeriod: "48 hours",
      reviewedBy: "Domain lead + orchestrator"
    }
  };

  retirement: {
    triggers: {
      obsolescence: "Module deprecated or consolidated",
      persistentUnderperformance: "Failed 2 consecutive improvement plans",
      costInefficiency: "Operating cost exceeds value delivered",
      replacementAvailable: "Superior agent version available"
    },
    process: `
      async function retireAgent(agentId: string, reason: RetirementReason): Promise<void> {
        // 1. Stop new task assignment
        await pauseAgentTaskQueue(agentId);

        // 2. Complete or reassign in-flight tasks
        const activeTasks = await getActiveTasks(agentId);
        for (const task of activeTasks) {
          if (task.progress < 50) {
            await reassignTask(task.id, await findReplacementAgent(task));
          } else {
            await waitForCompletion(task.id, 3600000); // 1 hour max
          }
        }

        // 3. Archive agent state and learnings
        await archiveAgentState(agentId);
        await extractAndSaveLearnings(agentId);

        // 4. Update team structure
        await removeFromTeam(agentId);

        // 5. Mark as retired
        await updateAgentStatus(agentId, 'retired', reason);

        // 6. Log for analysis
        await logRetirement(agentId, reason, await getAgentMetrics(agentId));
      }
    `,
    knowledgePreservation: [
      "Extract successful task patterns",
      "Document learned optimizations",
      "Save prompt templates that worked well",
      "Record error patterns and solutions"
    ]
  };
}
```

### 19.6 Cross-Module Collaboration

#### 19.6.1 Collaboration Patterns

```typescript
interface CrossModuleCollaboration {
  patterns: {
    sequential: {
      description: "Output of one module feeds into next",
      example: "TrendReport → SKUPlan → DesignFile",
      coordination: "Event-driven via artifact.created events",
      handoffProtocol: "Standard artifact linking"
    },

    parallel: {
      description: "Multiple modules work on same inputs simultaneously",
      example: "DesignFile → [WorkOrder, MaterialSourcing, LineSheet]",
      coordination: "Fan-out from shared upstream artifact",
      conflictAvoidance: "Separate output artifacts, no shared writes"
    },

    feedback: {
      description: "Downstream module provides feedback to upstream",
      example: "MaterialSourcing → Design (material constraints)",
      coordination: "Feedback artifact type with source reference",
      implementation: `
        interface FeedbackArtifact extends ValueStreamArtifact {
          moduleId: 'cross-module-feedback';
          data: {
            feedbackType: 'constraint' | 'suggestion' | 'warning' | 'blocker';
            sourceModule: string;
            targetModule: string;
            targetArtifactId: string;
            content: string;
            severity: 'info' | 'warning' | 'critical';
            suggestedAction?: string;
          };
        }
      `
    },

    collaborative: {
      description: "Multiple modules contribute to single output",
      example: "Design + WorkOrder + Material → CompleteProductSpec",
      coordination: "Aggregator agent collects and merges",
      conflictResolution: "Priority rules + human arbitration for conflicts"
    }
  };

  sharedArtifactProtocol: {
    readAccess: "Any module can read any artifact (with permission)",
    writeAccess: "Only owning module can modify",
    enrichment: "Modules can add to artifact.metadata.enrichments[]",
    enrichmentFormat: {
      moduleId: "string",
      enrichmentType: "string",
      data: "any",
      timestamp: "Date"
    }
  };
}
```

### 19.7 Specialization Strategy

#### 19.7.1 Generalist vs Specialist Decision Matrix

```typescript
interface SpecializationStrategy {
  decisionMatrix: {
    keepGeneralist: {
      conditions: [
        "Task volume < 50/week for module",
        "Task types highly similar (variance < 20%)",
        "No quality issues with current approach",
        "Cost efficiency already optimal"
      ],
      benefits: [
        "Lower overhead (fewer agents to coordinate)",
        "Broader context understanding",
        "Flexibility in task handling"
      ]
    },

    createSpecialist: {
      conditions: [
        "Task volume > 100/week with queue buildup",
        "Clear task type clustering (3+ distinct types)",
        "Quality scores vary significantly by task type",
        "Specific tasks require deep tool expertise"
      ],
      benefits: [
        "Higher quality on specialized tasks",
        "Faster execution (no context switching)",
        "Better tool utilization"
      ]
    }
  };

  specializationProcess: `
    async function evaluateSpecialization(moduleId: string): Promise<SpecializationRecommendation> {
      const tasks = await getTaskHistory(moduleId, { days: 30 });
      const metrics = await getModuleMetrics(moduleId, { days: 30 });

      // Cluster tasks by type and characteristics
      const clusters = await clusterTasks(tasks);

      // Analyze performance by cluster
      const clusterPerformance = clusters.map(cluster => ({
        clusterId: cluster.id,
        taskCount: cluster.tasks.length,
        avgQuality: avg(cluster.tasks.map(t => t.qualityScore)),
        avgDuration: avg(cluster.tasks.map(t => t.duration)),
        variance: standardDeviation(cluster.tasks.map(t => t.qualityScore))
      }));

      // Decision logic
      const shouldSpecialize =
        clusters.length >= 3 &&
        metrics.queueDepth > 10 &&
        standardDeviation(clusterPerformance.map(c => c.avgQuality)) > 10;

      if (shouldSpecialize) {
        return {
          recommendation: 'specialize',
          suggestedSpecializations: clusterPerformance.map(c => ({
            name: \`\${moduleId}-\${c.clusterId}-specialist\`,
            taskTypes: clusters.find(cl => cl.id === c.clusterId)!.taskTypes,
            expectedImprovement: \`+\${(100 - c.variance).toFixed(0)}% quality consistency\`
          }))
        };
      }

      return {
        recommendation: 'keep_generalist',
        reason: 'Insufficient task diversity or volume for specialization benefit'
      };
    }
  `;

  hybridApproach: {
    description: "Generalist lead with specialist workers",
    structure: {
      lead: {
        role: "Routing, quality review, exception handling",
        handles: "Complex/unusual tasks directly"
      },
      specialists: {
        role: "High-volume specific task types",
        handles: "Routine tasks matching their specialty"
      }
    },
    routing: `
      async function routeTask(task: Task, team: Team): Promise<Agent> {
        // Check for specialist match
        for (const specialist of team.specialists) {
          if (specialist.taskTypes.includes(task.type) && !specialist.busy) {
            return specialist;
          }
        }

        // Complex or unusual → lead
        if (task.complexity === 'high' || !team.specialists.some(s => s.taskTypes.includes(task.type))) {
          return team.lead;
        }

        // Queue for next available specialist
        return await waitForSpecialist(team, task.type);
      }
    `
  };
}
```

---

## 20. Feature Request → Development → Release Pipeline

### 20.1 Intake: Multi-Channel Request Capture

#### 20.1.1 Channel Integrations

```typescript
interface FeatureRequestIntake {
  channels: {
    slack: {
      triggers: [
        "Direct mention: @nubabel feature request",
        "Reaction: :bulb: emoji on any message",
        "Keyword detection: '기능 요청', 'feature request', '이런거 있으면'"
      ],
      capture: `
        // Slack event handler
        app.event('message', async ({ event, client }) => {
          if (isFeatureRequest(event.text)) {
            const request = await captureFromSlack({
              source: 'slack',
              sourceRef: \`\${event.channel}:\${event.ts}\`,
              rawContent: event.text,
              requesterId: event.user,
              timestamp: new Date(parseFloat(event.ts) * 1000),
              threadContext: await getThreadContext(event.channel, event.thread_ts)
            });

            // Acknowledge capture
            await client.reactions.add({
              channel: event.channel,
              timestamp: event.ts,
              name: 'memo'
            });

            await client.chat.postEphemeral({
              channel: event.channel,
              user: event.user,
              text: \`Feature request captured! Tracking ID: \${request.id}\`
            });
          }
        });
      `,
      contextEnrichment: [
        "Thread history for conversation context",
        "User's recent messages for additional context",
        "Channel topic for domain context"
      ]
    },

    web: {
      endpoints: [
        "POST /api/feature-requests (direct submission)",
        "POST /api/feedback (general feedback with feature extraction)",
        "Widget: In-app feedback button"
      ],
      capture: `
        // Web API endpoint
        router.post('/api/feature-requests', async (req, res) => {
          const { title, description, category, urgency, attachments } = req.body;

          const request = await createFeatureRequest({
            source: 'web',
            sourceRef: req.headers['x-request-id'],
            rawContent: \`\${title}\n\n\${description}\`,
            requesterId: req.user.id,
            metadata: {
              category,
              urgency,
              attachments,
              userAgent: req.headers['user-agent'],
              currentPage: req.headers['referer']
            }
          });

          res.json({ requestId: request.id, status: 'captured' });
        });
      `,
      contextEnrichment: [
        "Current page/module user was viewing",
        "Recent user actions in session",
        "User's role and permissions"
      ]
    },

    notion: {
      integration: "Notion API webhook on database changes",
      capture: `
        // Notion webhook handler
        app.post('/webhooks/notion', async (req) => {
          const { page_id, properties } = req.body;

          if (properties.Type?.select?.name === 'Feature Request') {
            const pageContent = await notion.pages.retrieve({ page_id });
            const blocks = await notion.blocks.children.list({ block_id: page_id });

            const request = await createFeatureRequest({
              source: 'notion',
              sourceRef: page_id,
              rawContent: extractTextFromBlocks(blocks),
              requesterId: await mapNotionUserToInternal(pageContent.created_by.id),
              metadata: {
                notionProperties: properties,
                linkedPages: extractLinkedPages(blocks)
              }
            });
          }
        });
      `,
      syncBack: "Update Notion page with tracking ID and status"
    },

    email: {
      integration: "Dedicated email inbox with AI parsing",
      capture: `
        // Email processor (via SendGrid Inbound Parse or similar)
        async function processInboundEmail(email: InboundEmail): Promise<void> {
          const request = await createFeatureRequest({
            source: 'email',
            sourceRef: email.messageId,
            rawContent: \`Subject: \${email.subject}\n\n\${email.textBody || email.htmlBody}\`,
            requesterId: await findUserByEmail(email.from),
            metadata: {
              subject: email.subject,
              attachments: email.attachments.map(a => a.filename),
              cc: email.cc
            }
          });

          // Send acknowledgment
          await sendEmail({
            to: email.from,
            subject: \`Re: \${email.subject} [Tracking: \${request.id}]\`,
            body: \`Your feature request has been received. Track status at: ...\`
          });
        }
      `
    }
  };

  deduplication: {
    nearDuplicateDetection: `
      async function findSimilarRequests(newRequest: FeatureRequest): Promise<SimilarRequest[]> {
        // Generate embedding for new request
        const embedding = await generateEmbedding(newRequest.rawContent);

        // Search existing requests using vector similarity
        const similar = await vectorStore.search({
          vector: embedding,
          topK: 10,
          minScore: 0.85,
          filter: {
            organizationId: newRequest.organizationId,
            status: { $nin: ['released', 'rejected'] }
          }
        });

        return similar.map(s => ({
          requestId: s.id,
          similarity: s.score,
          status: s.metadata.status,
          createdAt: s.metadata.createdAt
        }));
      }
    `,
    mergeStrategy: {
      automatic: "Similarity > 95%: auto-merge, increment requestCount",
      suggested: "Similarity 85-95%: suggest merge to admin",
      separate: "Similarity < 85%: treat as distinct"
    }
  };
}
```

### 20.2 Analysis: AI-Powered Intent Extraction

#### 20.2.1 Feature Analyzer Agent

```typescript
interface FeatureAnalysisPipeline {
  intentExtraction: {
    agent: "feature-analyzer",
    prompt: `
      Analyze this feature request and extract structured information:

      Request: {{rawContent}}
      User Role: {{requesterRole}}
      Current Module Context: {{moduleContext}}

      Extract:
      1. Core Intent: What does the user fundamentally want to achieve?
      2. Specific Feature: What concrete functionality is being requested?
      3. Problem Statement: What problem is the user trying to solve?
      4. Success Criteria: How would the user know this feature works?
      5. Affected Workflows: Which current workflows would change?

      Output JSON:
      {
        "coreIntent": "string",
        "specificFeature": "string",
        "problemStatement": "string",
        "successCriteria": ["string"],
        "affectedWorkflows": ["string"],
        "confidence": 0-100
      }
    `,
    lowConfidenceHandling: {
      threshold: 70,
      action: "Request clarification from user",
      clarificationTemplate: `
        We received your feature request but need a bit more detail:

        Our understanding: {{analyzedIntent}}

        Could you clarify:
        {{clarificationQuestions}}
      `
    }
  };

  moduleMapping: {
    algorithm: `
      async function mapToModules(analysis: FeatureAnalysis): Promise<ModuleMapping[]> {
        const modules = await getAllModules();

        const mappings: ModuleMapping[] = [];

        for (const module of modules) {
          // Keyword matching
          const keywordScore = calculateKeywordOverlap(
            analysis.specificFeature,
            module.keywords
          );

          // Workflow matching
          const workflowScore = analysis.affectedWorkflows
            .filter(w => module.workflows.includes(w))
            .length / analysis.affectedWorkflows.length;

          // Semantic similarity
          const semanticScore = await calculateSemanticSimilarity(
            analysis.coreIntent,
            module.description
          );

          const totalScore = (keywordScore * 0.3) + (workflowScore * 0.3) + (semanticScore * 0.4);

          if (totalScore > 0.3) {
            mappings.push({
              moduleId: module.id,
              confidence: totalScore,
              matchReasons: {
                keywords: keywordScore > 0.3,
                workflows: workflowScore > 0.3,
                semantic: semanticScore > 0.3
              }
            });
          }
        }

        return mappings.sort((a, b) => b.confidence - a.confidence);
      }
    `,
    crossModuleDetection: {
      indicators: [
        "Request mentions multiple modules explicitly",
        "Workflow spans module boundaries",
        "Data flow enhancement between modules"
      ],
      handling: "Create linked requests for each module, mark as 'cross-module'"
    }
  };

  duplicateDetection: {
    levels: [
      {
        type: "exact",
        method: "Hash of normalized text",
        action: "Auto-merge"
      },
      {
        type: "near-duplicate",
        method: "Vector similarity > 95%",
        action: "Auto-merge with notification"
      },
      {
        type: "related",
        method: "Vector similarity 80-95%",
        action: "Link as related, suggest merge"
      },
      {
        type: "same-problem-different-solution",
        method: "Problem statement similarity > 90%, feature similarity < 50%",
        action: "Flag for human review"
      }
    ],
    existingFeatureMatch: {
      check: "Compare against released features and roadmap",
      outcomes: [
        { match: "Already released", action: "Inform user, close request" },
        { match: "In development", action: "Link to existing, update priority" },
        { match: "On roadmap", action: "Link, potentially accelerate" }
      ]
    }
  };
}
```

### 20.3 Consolidation: Request Merging & Linking

#### 20.3.1 Consolidation Rules

```typescript
interface RequestConsolidation {
  mergeRules: {
    autoMerge: {
      criteria: [
        "Same organization",
        "Same module mapping (primary module matches)",
        "Similarity score > 95%",
        "Neither request has comments/discussion"
      ],
      action: `
        async function autoMerge(primary: FeatureRequest, duplicate: FeatureRequest): Promise<void> {
          // Increment request count
          await prisma.featureRequest.update({
            where: { id: primary.id },
            data: {
              requestCount: { increment: 1 },
              metadata: {
                ...primary.metadata,
                mergedFrom: [
                  ...(primary.metadata.mergedFrom || []),
                  {
                    requestId: duplicate.id,
                    requesterId: duplicate.requesterId,
                    rawContent: duplicate.rawContent,
                    mergedAt: new Date()
                  }
                ]
              }
            }
          });

          // Update duplicate status
          await prisma.featureRequest.update({
            where: { id: duplicate.id },
            data: {
              status: 'merged',
              parentRequestId: primary.id
            }
          });

          // Notify duplicate requester
          await notifyUser(duplicate.requesterId, {
            type: 'request_merged',
            message: \`Your request was merged with a similar existing request.\`,
            primaryRequestId: primary.id
          });
        }
      `
    },

    suggestedMerge: {
      criteria: [
        "Same organization",
        "Similarity score 80-95%",
        "At least one request has engagement"
      ],
      action: `
        async function suggestMerge(requests: FeatureRequest[]): Promise<MergeSuggestion> {
          const analysis = await analyzeRequestsForMerge(requests);

          return {
            suggestionId: uuid(),
            requests: requests.map(r => r.id),
            mergeRecommendation: {
              suggestedPrimary: analysis.mostComplete.id,
              combinedIntent: analysis.mergedIntent,
              conflictingPoints: analysis.conflicts
            },
            status: 'pending_review',
            expiresAt: addDays(new Date(), 7)
          };
        }
      `,
      reviewProcess: "Admin reviews and approves/rejects merge suggestion"
    }
  };

  linking: {
    relationshipTypes: [
      {
        type: "duplicate",
        description: "Essentially the same request",
        behavior: "Merged, one becomes canonical"
      },
      {
        type: "related",
        description: "Similar theme but distinct features",
        behavior: "Linked for context, developed separately"
      },
      {
        type: "depends-on",
        description: "Request B requires Request A first",
        behavior: "A must be completed before B can start"
      },
      {
        type: "conflicts-with",
        description: "Requests are mutually exclusive",
        behavior: "Require decision on which to pursue"
      },
      {
        type: "enhances",
        description: "Request B extends functionality of A",
        behavior: "Can be bundled or sequenced"
      }
    ],
    autoLinking: `
      async function detectAndCreateLinks(request: FeatureRequest): Promise<void> {
        const similarRequests = await findSimilarRequests(request);

        for (const similar of similarRequests) {
          if (similar.similarity > 0.95) {
            await createLink(request.id, similar.requestId, 'duplicate');
          } else if (similar.similarity > 0.8) {
            await createLink(request.id, similar.requestId, 'related');
          }
        }

        // Check for dependency relationships
        const dependencies = await detectDependencies(request);
        for (const dep of dependencies) {
          await createLink(request.id, dep.requestId, 'depends-on');
        }
      }
    `
  };
}
```

### 20.4 Prioritization: Auto-Scoring Algorithm

#### 20.4.1 Priority Calculation

```typescript
interface PrioritizationAlgorithm {
  scoringFactors: {
    frequency: {
      weight: 0.25,
      calculation: `
        // Number of unique requesters asking for similar feature
        function frequencyScore(request: FeatureRequest): number {
          const uniqueRequesters = new Set([
            request.requesterId,
            ...(request.metadata.mergedFrom || []).map(m => m.requesterId)
          ]).size;

          // Logarithmic scale: 1 requester = 20, 5 = 60, 10 = 80, 20+ = 100
          return Math.min(100, 20 + (40 * Math.log2(uniqueRequesters + 1)));
        }
      `
    },

    businessImpact: {
      weight: 0.30,
      factors: [
        {
          name: "revenueImpact",
          source: "Module usage * estimated revenue contribution",
          scale: "0-100"
        },
        {
          name: "userRetention",
          source: "Requester churn risk if not addressed",
          scale: "0-100"
        },
        {
          name: "competitiveAdvantage",
          source: "Competitor analysis for similar features",
          scale: "0-100"
        }
      ],
      calculation: `
        function businessImpactScore(request: FeatureRequest): number {
          const moduleUsage = getModuleUsageStats(request.relatedModules);
          const requesterValue = getRequesterValue(request.requesterId);
          const marketAnalysis = getCompetitorFeatureAnalysis(request.specificFeature);

          const revenueImpact = moduleUsage.avgRevenueContribution * requesterValue.organizationTier;
          const retentionRisk = requesterValue.churnProbability * 100;
          const competitiveGap = marketAnalysis.competitorHasFeature ? 80 : 40;

          return (revenueImpact * 0.4) + (retentionRisk * 0.3) + (competitiveGap * 0.3);
        }
      `
    },

    strategicAlignment: {
      weight: 0.20,
      factors: [
        "Alignment with product roadmap themes",
        "Supports key OKRs",
        "Enables future planned features"
      ],
      calculation: `
        function alignmentScore(request: FeatureRequest): number {
          const roadmap = getCurrentRoadmap();

          // Check theme alignment
          const themeMatch = roadmap.themes.some(theme =>
            request.analyzedIntent.toLowerCase().includes(theme.toLowerCase())
          ) ? 30 : 0;

          // Check OKR support
          const okrSupport = roadmap.okrs.filter(okr =>
            request.affectedWorkflows.some(w => okr.relatedWorkflows.includes(w))
          ).length * 20;

          // Check if enables planned features
          const enablesPlanned = roadmap.plannedFeatures.filter(pf =>
            pf.dependencies?.includes(request.specificFeature)
          ).length * 25;

          return Math.min(100, themeMatch + okrSupport + enablesPlanned);
        }
      `
    },

    implementationEffort: {
      weight: 0.15,
      inverse: true, // Lower effort = higher priority
      estimation: `
        async function estimateEffort(request: FeatureRequest): Promise<EffortEstimate> {
          // AI-powered effort estimation
          const estimate = await agentEstimateEffort({
            feature: request.specificFeature,
            affectedModules: request.relatedModules,
            existingCodePatterns: await findSimilarImplementations(request)
          });

          return {
            developmentDays: estimate.days,
            complexity: estimate.complexity, // low, medium, high
            riskLevel: estimate.risks,
            score: 100 - (estimate.days * 5) // 20 days = 0 score
          };
        }
      `
    },

    urgency: {
      weight: 0.10,
      sources: [
        "Explicit urgency from requester",
        "Time-sensitive business context",
        "Blocking other high-priority work"
      ]
    }
  };

  priorityCalculation: `
    async function calculatePriority(request: FeatureRequest): Promise<PriorityResult> {
      const scores = {
        frequency: frequencyScore(request),
        businessImpact: await businessImpactScore(request),
        alignment: alignmentScore(request),
        effort: (await estimateEffort(request)).score,
        urgency: request.metadata.urgency || 50
      };

      const weights = { frequency: 0.25, businessImpact: 0.30, alignment: 0.20, effort: 0.15, urgency: 0.10 };

      const totalScore = Object.entries(scores).reduce(
        (sum, [key, score]) => sum + (score * weights[key]),
        0
      );

      // Map to priority levels
      const priority =
        totalScore >= 80 ? 'P0' :
        totalScore >= 60 ? 'P1' :
        totalScore >= 40 ? 'P2' : 'P3';

      return {
        requestId: request.id,
        totalScore,
        priority,
        breakdown: scores,
        calculatedAt: new Date()
      };
    }
  `;

  reCalculationTriggers: [
    "New request merged (frequency changes)",
    "Similar request prioritized (alignment changes)",
    "Roadmap updated (strategic alignment changes)",
    "Weekly scheduled recalculation"
  ];
}
```

### 20.5 Development Assignment

#### 20.5.1 Agent Team Assignment

```typescript
interface DevelopmentAssignment {
  assignmentProcess: {
    moduleBasedRouting: `
      async function assignToAgentTeam(request: FeatureRequest): Promise<Assignment> {
        const primaryModule = request.relatedModules[0];
        const team = await getTeamForModule(primaryModule);

        // Check team capacity
        const capacity = await getTeamCapacity(team.id);
        if (capacity.utilizationRate > 0.9) {
          // Team overloaded - check for cross-training
          const alternativeTeam = await findTeamWithCapacity(request.relatedModules);
          if (alternativeTeam) {
            return assignWithNote(alternativeTeam, request, 'Cross-team assignment due to capacity');
          }
          // Queue for later
          return queueForTeam(team, request);
        }

        return assign(team, request);
      }
    `,

    crossModuleAssignment: {
      strategy: "Primary module team leads, others contribute",
      coordination: `
        async function assignCrossModuleFeature(request: FeatureRequest): Promise<CrossModuleAssignment> {
          const modules = request.relatedModules;
          const primaryModule = determinePrimaryModule(request);

          const assignment: CrossModuleAssignment = {
            requestId: request.id,
            leadTeam: await getTeamForModule(primaryModule),
            contributingTeams: await Promise.all(
              modules.filter(m => m !== primaryModule).map(m => getTeamForModule(m))
            ),
            coordinationPlan: {
              kickoffMeeting: 'Async sync via shared context',
              checkpoints: ['Design review', 'Integration test', 'Final review'],
              escalationPath: 'Domain leads → Orchestrator'
            }
          };

          return assignment;
        }
      `
    }
  };

  workBreakdown: {
    taskGeneration: `
      async function generateTasksFromRequest(request: FeatureRequest): Promise<Task[]> {
        // AI-powered task breakdown
        const breakdown = await agentBreakdownFeature({
          feature: request.specificFeature,
          successCriteria: request.successCriteria,
          affectedModules: request.relatedModules,
          existingPatterns: await getModulePatterns(request.relatedModules)
        });

        const tasks: Task[] = breakdown.tasks.map(t => ({
          id: uuid(),
          featureRequestId: request.id,
          title: t.title,
          description: t.description,
          moduleId: t.moduleId,
          estimatedHours: t.estimate,
          dependencies: t.dependsOn,
          assignee: null, // Assigned by team lead
          status: 'pending'
        }));

        return tasks;
      }
    `,
    taskTypes: [
      { type: 'analysis', agent: 'architect', estimateMultiplier: 1.0 },
      { type: 'implementation', agent: 'executor', estimateMultiplier: 1.5 },
      { type: 'testing', agent: 'qa-tester', estimateMultiplier: 0.5 },
      { type: 'documentation', agent: 'writer', estimateMultiplier: 0.3 },
      { type: 'review', agent: 'code-reviewer', estimateMultiplier: 0.2 }
    ]
  };
}
```

### 20.6 Implementation Tracking

#### 20.6.1 Progress Monitoring

```typescript
interface ImplementationTracking {
  statusStates: [
    { status: 'new', description: 'Request captured, not yet analyzed' },
    { status: 'analyzing', description: 'AI analyzing request' },
    { status: 'backlog', description: 'Analyzed, prioritized, awaiting development' },
    { status: 'planning', description: 'Tasks being created and assigned' },
    { status: 'in_development', description: 'Active development by agent team' },
    { status: 'in_review', description: 'Code/output under review' },
    { status: 'testing', description: 'QA testing in progress' },
    { status: 'ready_for_release', description: 'Completed, awaiting release window' },
    { status: 'released', description: 'Deployed to production' },
    { status: 'rejected', description: 'Not pursuing (with reason)' }
  ];

  progressTracking: `
    interface FeatureProgress {
      requestId: string;
      status: FeatureStatus;
      progress: {
        overall: number; // 0-100
        byPhase: {
          analysis: { status: PhaseStatus; completedAt?: Date };
          planning: { status: PhaseStatus; taskCount: number; completedAt?: Date };
          development: { status: PhaseStatus; tasksComplete: number; tasksTotal: number };
          review: { status: PhaseStatus; reviewsComplete: number; reviewsRequired: number };
          testing: { status: PhaseStatus; testsPassed: number; testsTotal: number };
        };
      };
      timeline: {
        createdAt: Date;
        startedAt?: Date;
        targetCompletion?: Date;
        actualCompletion?: Date;
      };
      blockers: Blocker[];
    }

    async function updateFeatureProgress(requestId: string): Promise<void> {
      const tasks = await getTasksForRequest(requestId);

      const progress = {
        overall: (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100,
        byPhase: calculatePhaseProgress(tasks)
      };

      await prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          metadata: {
            ...existing.metadata,
            progress
          }
        }
      });

      // Broadcast progress update
      await broadcastProgressUpdate(requestId, progress);
    }
  `;

  blockerManagement: {
    blockerTypes: [
      { type: 'dependency', description: 'Waiting on another feature/task' },
      { type: 'decision_needed', description: 'Requires human decision' },
      { type: 'external', description: 'Waiting on external factor' },
      { type: 'resource', description: 'Insufficient agent capacity' },
      { type: 'technical', description: 'Technical challenge discovered' }
    ],
    escalation: `
      async function handleBlocker(blocker: Blocker): Promise<void> {
        // Log blocker
        await logBlocker(blocker);

        // Determine escalation path
        const escalationLevel = blocker.severity === 'critical' ? 'immediate' :
                               blocker.ageHours > 24 ? 'urgent' : 'standard';

        // Notify appropriate parties
        switch (escalationLevel) {
          case 'immediate':
            await notifyDomainLead(blocker);
            await notifyProductOwner(blocker);
            break;
          case 'urgent':
            await notifyTeamLead(blocker);
            break;
          case 'standard':
            await addToBlockerReview(blocker);
            break;
        }

        // Suggest resolution if possible
        const suggestion = await agentSuggestBlockerResolution(blocker);
        if (suggestion.confidence > 0.8) {
          await proposeResolution(blocker.id, suggestion);
        }
      }
    `
  };

  stakeholderNotifications: {
    requesterUpdates: [
      { trigger: 'status_change', template: 'Your feature request {{title}} is now {{status}}' },
      { trigger: 'milestone', template: 'Progress update: {{milestone}} completed for {{title}}' },
      { trigger: 'blocker', template: 'Your request {{title}} is blocked: {{blockerDescription}}' },
      { trigger: 'release', template: 'Great news! {{title}} is now live!' }
    ],
    channels: ['slack', 'email', 'in-app'],
    preferences: 'User-configurable notification preferences'
  };
}
```

### 20.7 Release Integration

#### 20.7.1 Value Stream Connection

```typescript
interface ReleaseIntegration {
  releaseTypes: {
    moduleEnhancement: {
      description: "Improvement to existing module",
      integration: "Update module version, migrate artifacts if needed",
      deployment: "Hot-deploy via extension system"
    },
    newModule: {
      description: "Entirely new module",
      integration: "Register in ModuleRegistry, add to Value Stream",
      deployment: "Feature-flagged rollout"
    },
    crossModuleFeature: {
      description: "Feature spanning multiple modules",
      integration: "Coordinate module updates, ensure compatibility",
      deployment: "Coordinated release with rollback plan"
    }
  };

  valueStreamIntegration: `
    async function integrateRelease(release: Release): Promise<IntegrationResult> {
      const affectedModules = release.features.flatMap(f => f.relatedModules);

      // Validate compatibility
      const compatibility = await validateValueStreamCompatibility(affectedModules, release.changes);
      if (!compatibility.valid) {
        return { success: false, errors: compatibility.issues };
      }

      // Update module versions
      for (const moduleUpdate of release.moduleUpdates) {
        await updateModuleVersion(moduleUpdate.moduleId, moduleUpdate.newVersion);
      }

      // Update data flow contracts if changed
      if (release.schemaChanges.length > 0) {
        await applySchemaChanges(release.schemaChanges);
        await runArtifactMigrations(release.schemaChanges);
      }

      // Update Value Stream documentation
      await updateValueStreamDocs(release);

      return { success: true, deployedModules: affectedModules };
    }
  `;

  rollbackPlan: {
    triggers: [
      "Critical error rate > 5% post-deploy",
      "Module execution failures > 10%",
      "User-reported critical issues"
    ],
    process: `
      async function rollbackRelease(releaseId: string): Promise<void> {
        const release = await getRelease(releaseId);

        // 1. Revert module versions
        for (const moduleUpdate of release.moduleUpdates) {
          await revertModuleVersion(moduleUpdate.moduleId, moduleUpdate.previousVersion);
        }

        // 2. Revert schema changes (if reversible)
        if (release.schemaChanges.some(s => !s.reversible)) {
          throw new Error('Cannot auto-rollback: Irreversible schema changes');
        }
        await revertSchemaChanges(release.schemaChanges);

        // 3. Notify stakeholders
        await notifyRollback(release);

        // 4. Update feature request status
        for (const feature of release.features) {
          await updateFeatureStatus(feature.requestId, 'ready_for_release', {
            note: 'Rolled back due to issues'
          });
        }
      }
    `
  };
}
```

### 20.8 Post-Release: Feedback & Iteration

#### 20.8.1 Feedback Collection

```typescript
interface PostReleaseFeedback {
  feedbackChannels: {
    automaticMetrics: {
      sources: [
        "Module execution success rate",
        "User interaction patterns",
        "Error frequency and types",
        "Performance metrics"
      ],
      collection: `
        async function collectReleaseMetrics(releaseId: string): Promise<ReleaseMetrics> {
          const release = await getRelease(releaseId);
          const sinceRelease = release.deployedAt;

          const metrics = {
            executionSuccessRate: await getModuleSuccessRate(release.affectedModules, sinceRelease),
            avgExecutionTime: await getAvgExecutionTime(release.affectedModules, sinceRelease),
            errorRate: await getErrorRate(release.affectedModules, sinceRelease),
            userEngagement: await getUserEngagement(release.affectedModules, sinceRelease)
          };

          // Compare to pre-release baseline
          const baseline = await getBaselineMetrics(release.affectedModules, {
            before: sinceRelease,
            duration: '7d'
          });

          return {
            current: metrics,
            baseline,
            delta: calculateDelta(metrics, baseline),
            releaseId
          };
        }
      `
    },

    userFeedback: {
      prompts: [
        { trigger: '24h_after_first_use', question: 'How useful was [feature]?' },
        { trigger: 'weekly_digest', question: 'Any issues with recent updates?' }
      ],
      sentimentAnalysis: "AI categorizes feedback as positive/neutral/negative",
      actionableExtraction: "Extract specific improvement suggestions"
    }
  };

  iterationPlanning: {
    feedbackToRequest: `
      async function feedbackToFeatureRequest(feedback: UserFeedback): Promise<void> {
        // Analyze if feedback is a new request or iteration on existing
        const relatedRelease = await findRelatedRelease(feedback);
        const relatedRequest = relatedRelease?.features.find(f =>
          feedback.context.moduleId === f.relatedModules[0]
        );

        if (relatedRequest) {
          // Create iteration request linked to original
          await createFeatureRequest({
            source: 'post_release_feedback',
            rawContent: feedback.content,
            requesterId: feedback.userId,
            parentRequestId: relatedRequest.id,
            metadata: {
              iterationType: 'improvement',
              originalReleaseId: relatedRelease.id,
              feedbackSentiment: feedback.sentiment
            }
          });
        } else {
          // New feature request
          await createFeatureRequest({
            source: 'post_release_feedback',
            rawContent: feedback.content,
            requesterId: feedback.userId
          });
        }
      }
    `,

    continuousImprovement: {
      weeklyReview: "AI summarizes feedback, suggests priority adjustments",
      quarterlyRetrospective: "Human review of release success metrics",
      roadmapAdjustment: "Update roadmap based on feedback patterns"
    }
  };
}
```

### 20.9 Pipeline Database Schema

```prisma
// Additional schema for Feature Request Pipeline

/// Feature Request Comments (discussion thread)
model FeatureRequestComment {
  id             String   @id @default(uuid()) @db.Uuid
  requestId      String   @map("request_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  agentId        String?  @map("agent_id") @db.VarChar(100) // If from agent

  content        String   @db.Text
  commentType    String   @default("discussion") @map("comment_type") @db.VarChar(50) // discussion, clarification, decision, status_update

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  request        FeatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  user           User           @relation(fields: [userId], references: [id])

  @@index([requestId])
  @@map("feature_request_comments")
}

/// Feature Request Links (relationships between requests)
model FeatureRequestLink {
  id              String   @id @default(uuid()) @db.Uuid
  sourceId        String   @map("source_id") @db.Uuid
  targetId        String   @map("target_id") @db.Uuid
  linkType        String   @map("link_type") @db.VarChar(50) // duplicate, related, depends-on, conflicts-with, enhances

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy       String?  @map("created_by") @db.Uuid

  @@unique([sourceId, targetId, linkType])
  @@index([sourceId])
  @@index([targetId])
  @@map("feature_request_links")
}

/// Development Tasks (from feature request breakdown)
model DevelopmentTask {
  id               String   @id @default(uuid()) @db.Uuid
  featureRequestId String   @map("feature_request_id") @db.Uuid
  organizationId   String   @map("organization_id") @db.Uuid

  title            String   @db.VarChar(255)
  description      String?  @db.Text
  taskType         String   @map("task_type") @db.VarChar(50) // analysis, implementation, testing, documentation, review

  moduleId         String?  @map("module_id") @db.VarChar(100)
  assignedTeamId   String?  @map("assigned_team_id") @db.Uuid
  assignedAgentId  String?  @map("assigned_agent_id") @db.VarChar(100)

  estimatedHours   Float?   @map("estimated_hours")
  actualHours      Float?   @map("actual_hours")

  status           String   @default("pending") @db.VarChar(50) // pending, in_progress, blocked, in_review, completed
  priority         Int      @default(3)

  dependencies     String[] @default([]) @db.Uuid // Task IDs this depends on
  blockedBy        String?  @map("blocked_by") @db.Text // Blocker description

  startedAt        DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt      DateTime? @map("completed_at") @db.Timestamptz(6)

  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  featureRequest   FeatureRequest @relation(fields: [featureRequestId], references: [id], onDelete: Cascade)

  @@index([featureRequestId])
  @@index([organizationId, status])
  @@index([assignedTeamId])
  @@map("development_tasks")
}

/// Releases (deployment records)
model Release {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid

  version         String   @db.VarChar(50)
  name            String   @db.VarChar(255)
  description     String?  @db.Text

  // Features included
  featureIds      String[] @map("feature_ids") @db.Uuid
  moduleUpdates   Json     @map("module_updates") @db.JsonB // { moduleId, previousVersion, newVersion }[]
  schemaChanges   Json     @map("schema_changes") @db.JsonB // { type, reversible, migration }[]

  // Status
  status          String   @default("draft") @db.VarChar(50) // draft, ready, deploying, deployed, rolled_back
  deployedAt      DateTime? @map("deployed_at") @db.Timestamptz(6)
  rolledBackAt    DateTime? @map("rolled_back_at") @db.Timestamptz(6)

  // Metrics
  postReleaseMetrics Json? @map("post_release_metrics") @db.JsonB

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy       String   @map("created_by") @db.Uuid

  @@index([organizationId])
  @@index([status])
  @@map("releases")
}
```

---

## 21. Flexibility & Extensibility

### 21.1 New Module Addition

#### 21.1.1 Module Addition Checklist

```typescript
interface NewModuleAdditionChecklist {
  phase1_planning: {
    duration: "1-2 days",
    tasks: [
      {
        task: "Define module purpose and boundaries",
        deliverable: "Module specification document",
        template: `
          # Module Specification: [module-id]

          ## Purpose
          [One sentence description of what this module does]

          ## Value Stream Position
          - Upstream modules: [list]
          - Downstream modules: [list]
          - Standalone capable: [yes/no]

          ## Input Requirements
          - Required inputs: [artifact types with schemas]
          - Optional inputs: [artifact types that enhance output]

          ## Output Artifacts
          - Primary output: [artifact type with schema]
          - Secondary outputs: [if any]

          ## User Roles
          - Primary users: [roles]
          - Secondary users: [roles with limited access]

          ## Success Metrics
          - [Metric 1: definition and target]
          - [Metric 2: definition and target]
        `
      },
      {
        task: "Design input/output schemas",
        deliverable: "JSON Schema definitions",
        requirements: [
          "Compatible with existing artifact structure",
          "Versioned from v1.0.0",
          "Includes all required metadata fields"
        ]
      },
      {
        task: "Identify dependencies",
        deliverable: "Dependency map",
        validation: "Ensure no circular dependencies introduced"
      },
      {
        task: "Define permissions",
        deliverable: "Permission matrix",
        template: `
          | Role | View | Execute | Create | Approve | Configure |
          |------|------|---------|--------|---------|-----------|
          | MD   |      |         |        |         |           |
          | Designer |  |         |        |         |           |
          | PM   |      |         |        |         |           |
          | Viewer | X |         |        |         |           |
          | Admin| X    | X       | X      | X       | X         |
        `
      }
    ]
  };

  phase2_schemaRegistration: {
    duration: "1 day",
    tasks: [
      {
        task: "Add module to MegaAppModule table",
        script: `
          // migrations/add-[module-id]-module.ts
          import { PrismaClient } from '@prisma/client';

          export async function addModule(prisma: PrismaClient, organizationId: string) {
            await prisma.megaAppModule.create({
              data: {
                id: '[module-id]',
                organizationId,
                name: '[Module Display Name]',
                description: '[Description]',
                version: '1.0.0',
                inputSchema: { /* JSON Schema */ },
                outputSchema: { /* JSON Schema */ },
                requiredInputs: ['upstream-module-1', 'upstream-module-2'],
                optionalInputs: [],
                executorType: 'ai-agent',
                executorConfig: {
                  agentId: '[agent-id]',
                  timeout: 1800000, // 30 minutes
                  retries: 3
                },
                enabled: false, // Enable after testing
                status: 'draft'
              }
            });
          }
        `
      },
      {
        task: "Register in ExtensionRegistry",
        implementation: `
          // extensions/[module-id]/index.ts
          import { ExtensionRegistration } from '@nubabel/extension-sdk';

          export const registration: ExtensionRegistration = {
            id: '[module-id]',
            version: '1.0.0',
            extensionType: 'module',
            category: 'mega-app',

            megaAppConfig: {
              moduleId: '[module-id]',
              inputSchema: require('./schemas/input.json'),
              outputSchema: require('./schemas/output.json'),
              requiredInputs: [],
              optionalInputs: [],
            },

            activate: async (context) => {
              // Module initialization
              await context.registerAgent('[agent-id]', './agents/[agent-name].yaml');
              await context.registerSkills('./skills/*.yaml');

              // Subscribe to upstream events
              context.onArtifactCreated('[upstream-module-id]', handleUpstreamArtifact);
            },

            deactivate: async (context) => {
              // Cleanup
            }
          };
        `
      },
      {
        task: "Add default permissions for existing roles",
        script: `
          async function addModulePermissions(prisma: PrismaClient, organizationId: string) {
            const roles = await prisma.megaAppRole.findMany({
              where: { organizationId }
            });

            const defaultPermissions = {
              'MD': { canView: true, canExecute: true, canApprove: true },
              'Designer': { canView: true },
              'Production Manager': { canView: true },
              'Viewer': { canView: true },
              'Admin': { canView: true, canExecute: true, canCreate: true, canApprove: true, canConfigure: true }
            };

            for (const role of roles) {
              const perms = defaultPermissions[role.name] || { canView: true };
              await prisma.modulePermission.create({
                data: {
                  organizationId,
                  moduleId: '[module-id]',
                  megaAppRoleId: role.id,
                  ...perms
                }
              });
            }
          }
        `
      }
    ]
  };

  phase3_agentDevelopment: {
    duration: "3-5 days",
    tasks: [
      {
        task: "Create agent configuration",
        template: `
          # extensions/[module-id]/agents/[agent-name].yaml
          id: [agent-id]
          name: [Agent Display Name]
          description: [What this agent does]

          model: claude-sonnet-4-20250514
          temperature: 0.3

          systemPrompt: |
            You are a [role] agent for the [Module Name] module.

            Your responsibilities:
            1. [Responsibility 1]
            2. [Responsibility 2]

            Input artifacts you receive:
            - [Artifact type 1]: [What it contains]

            Output you must produce:
            - [Artifact type]: [Schema reference]

            Quality standards:
            - [Standard 1]
            - [Standard 2]

          inputSchema:
            type: object
            required: [context, upstreamArtifacts]
            properties:
              context:
                $ref: '#/definitions/TaskContext'
              upstreamArtifacts:
                type: array
                items:
                  $ref: '#/definitions/ArtifactReference'

          outputSchema:
            type: object
            required: [artifact, status]
            properties:
              artifact:
                $ref: '#/definitions/[OutputArtifactType]'
              status:
                enum: [success, partial, failed]
        `
      },
      {
        task: "Implement skills",
        structure: `
          extensions/[module-id]/skills/
          ├── [skill-1].yaml
          ├── [skill-2].yaml
          └── shared/
              └── common-utils.yaml
        `
      },
      {
        task: "Integrate MCP tools if needed",
        structure: `
          extensions/[module-id]/mcp/
          ├── [tool-name]/
          │   ├── index.ts
          │   ├── schema.json
          │   └── README.md
          └── ...
        `
      }
    ]
  };

  phase4_testing: {
    duration: "2-3 days",
    tasks: [
      {
        task: "Unit tests for agent",
        coverage: "Agent logic, schema validation, error handling"
      },
      {
        task: "Integration tests",
        scenarios: [
          "Module receives valid upstream artifact → produces valid output",
          "Module receives invalid input → graceful error",
          "Module timeout → proper failure handling",
          "Downstream modules can consume output"
        ]
      },
      {
        task: "E2E test in value stream",
        test: `
          // tests/e2e/[module-id].test.ts
          describe('[Module Name] in Value Stream', () => {
            it('should process upstream artifacts and produce valid output', async () => {
              // 1. Create upstream artifact
              const upstreamArtifact = await createTestArtifact('[upstream-module-id]');

              // 2. Trigger module execution
              const execution = await triggerModuleExecution('[module-id]', {
                upstreamArtifacts: [upstreamArtifact.id]
              });

              // 3. Wait for completion
              const result = await waitForExecution(execution.id, 60000);
              expect(result.status).toBe('completed');

              // 4. Validate output artifact
              const outputArtifact = await getArtifact(result.outputArtifactId);
              expect(validateSchema(outputArtifact.data, '[module-id]-output')).toBe(true);

              // 5. Verify lineage
              expect(outputArtifact.metadata.upstream).toContainEqual({
                artifactId: upstreamArtifact.id,
                moduleId: '[upstream-module-id]',
                version: 1
              });
            });
          });
        `
      }
    ]
  };

  phase5_deployment: {
    duration: "1 day",
    tasks: [
      {
        task: "Enable module for beta users",
        steps: [
          "Set module status to 'beta'",
          "Enable for selected organizations",
          "Monitor execution metrics"
        ]
      },
      {
        task: "Documentation",
        deliverables: [
          "User guide for module",
          "Admin configuration guide",
          "API documentation",
          "Troubleshooting guide"
        ]
      },
      {
        task: "General availability",
        criteria: [
          "Success rate > 95% in beta",
          "No critical bugs reported",
          "Documentation complete",
          "Support team trained"
        ]
      }
    ]
  };

  totalDuration: "8-12 days for standard module";
}
```

### 21.2 Module Deprecation

#### 21.2.1 Deprecation Process

```typescript
interface ModuleDeprecation {
  phases: {
    announcement: {
      duration: "Immediate",
      actions: [
        "Update module status to 'deprecated'",
        "Add deprecation banner in UI",
        "Notify all users via Slack/email",
        "Document migration path"
      ],
      notification: `
        📢 **Module Deprecation Notice**

        The **[Module Name]** module will be deprecated on [date].

        **Reason:** [Brief explanation]

        **Migration Path:**
        - [Alternative 1]: [Description]
        - [Alternative 2]: [Description]

        **Timeline:**
        - [Date]: New executions blocked for new users
        - [Date]: New executions blocked for all users
        - [Date]: Module fully removed

        **Action Required:**
        Please migrate your workflows by [date]. [Link to migration guide]

        Questions? Contact #mega-app-support
      `
    },

    softDeprecation: {
      duration: "4 weeks minimum",
      behavior: {
        existingUsers: "Can continue using with warning",
        newUsers: "Cannot enable module",
        newExecutions: "Allowed with deprecation warning in output",
        ui: "Warning banner, 'deprecated' badge"
      },
      implementation: `
        async function checkModuleDeprecation(moduleId: string, userId: string): Promise<DeprecationCheck> {
          const module = await getModule(moduleId);

          if (module.status !== 'deprecated') {
            return { allowed: true };
          }

          const userFirstUse = await getUserFirstModuleUse(userId, moduleId);

          if (!userFirstUse) {
            // New user
            return {
              allowed: false,
              reason: 'Module deprecated - not available for new users',
              alternatives: module.metadata.deprecation.alternatives
            };
          }

          // Existing user - allow with warning
          return {
            allowed: true,
            warning: \`This module is deprecated and will be removed on \${module.metadata.deprecation.removalDate}\`,
            alternatives: module.metadata.deprecation.alternatives
          };
        }
      `
    },

    hardDeprecation: {
      duration: "2 weeks",
      behavior: {
        existingUsers: "Blocked from new executions",
        existingArtifacts: "Remain accessible (read-only)",
        downstream: "Can still reference existing artifacts"
      }
    },

    removal: {
      actions: [
        "Archive module configuration",
        "Mark all artifacts as 'from_deprecated_module'",
        "Update downstream modules to handle missing upstream",
        "Remove from UI and API"
      ],
      dataRetention: {
        artifacts: "Retained for 1 year after removal",
        configuration: "Archived permanently",
        executionHistory: "Retained per standard retention policy"
      }
    }
  };

  migrationSupport: {
    automaticMigration: {
      when: "Direct replacement module exists",
      process: `
        async function migrateToNewModule(oldModuleId: string, newModuleId: string, orgId: string): Promise<MigrationResult> {
          // 1. Map artifacts
          const oldArtifacts = await getArtifacts(orgId, oldModuleId);

          const migrationResults = [];
          for (const artifact of oldArtifacts) {
            try {
              // Transform data to new schema
              const transformedData = await transformArtifact(artifact, oldModuleId, newModuleId);

              // Create new artifact
              const newArtifact = await createArtifact(newModuleId, transformedData, {
                migratedFrom: artifact.id
              });

              // Update downstream references
              await updateDownstreamReferences(artifact.id, newArtifact.id);

              migrationResults.push({ old: artifact.id, new: newArtifact.id, status: 'success' });
            } catch (error) {
              migrationResults.push({ old: artifact.id, status: 'failed', error: error.message });
            }
          }

          // 2. Update user workflows
          await updateWorkflowReferences(orgId, oldModuleId, newModuleId);

          return { results: migrationResults, summary: summarizeMigration(migrationResults) };
        }
      `
    },

    manualMigration: {
      when: "No direct replacement or complex transformation needed",
      support: [
        "Migration guide documentation",
        "Data export in standard format",
        "Support ticket prioritization",
        "Extended deprecation timeline if needed"
      ]
    }
  };
}
```

### 21.3 Dependency Changes

#### 21.3.1 Impact Analysis Tools

```typescript
interface DependencyChangeManagement {
  impactAnalysis: {
    tool: "dependency-analyzer",
    usage: `
      async function analyzeDependencyChange(change: DependencyChange): Promise<ImpactAnalysis> {
        const { moduleId, changeType, details } = change;

        // Get dependency graph
        const graph = await buildDependencyGraph();
        const affected = findAffectedModules(graph, moduleId, changeType);

        const analysis: ImpactAnalysis = {
          changeDescription: describeChange(change),
          directlyAffected: affected.direct.map(m => ({
            moduleId: m.id,
            relationshipType: m.relationship,
            impactLevel: assessImpact(m, change)
          })),
          transitivelyAffected: affected.transitive.map(m => ({
            moduleId: m.id,
            pathFromChange: m.path,
            impactLevel: assessTransitiveImpact(m, change)
          })),
          artifactImpact: {
            count: await countAffectedArtifacts(affected.all),
            breakdown: await breakdownByStatus(affected.all)
          },
          recommendations: generateRecommendations(change, affected),
          riskLevel: calculateRiskLevel(affected)
        };

        return analysis;
      }
    `,

    changeTypes: [
      {
        type: "schema_change",
        subtypes: ["field_added", "field_removed", "field_type_changed", "field_renamed"],
        analysisPoints: ["Downstream schema compatibility", "Existing artifact validity"]
      },
      {
        type: "dependency_added",
        analysisPoints: ["Circular dependency check", "Execution order changes"]
      },
      {
        type: "dependency_removed",
        analysisPoints: ["Orphaned modules", "Broken workflows"]
      },
      {
        type: "behavior_change",
        analysisPoints: ["Output quality changes", "Downstream processing changes"]
      }
    ]
  };

  cascadeDetection: {
    algorithm: `
      function findCascadeEffects(graph: DependencyGraph, sourceModule: string): CascadeEffect[] {
        const effects: CascadeEffect[] = [];
        const visited = new Set<string>();
        const queue: { moduleId: string; depth: number; path: string[] }[] = [
          { moduleId: sourceModule, depth: 0, path: [sourceModule] }
        ];

        while (queue.length > 0) {
          const { moduleId, depth, path } = queue.shift()!;

          if (visited.has(moduleId)) continue;
          visited.add(moduleId);

          const dependents = graph.getDependents(moduleId);
          for (const dependent of dependents) {
            const effect: CascadeEffect = {
              moduleId: dependent.id,
              depth: depth + 1,
              propagationPath: [...path, dependent.id],
              effectType: dependent.dependencyType === 'required' ? 'breaking' : 'potential',
              mitigationOptions: suggestMitigation(dependent, depth + 1)
            };
            effects.push(effect);
            queue.push({ moduleId: dependent.id, depth: depth + 1, path: effect.propagationPath });
          }
        }

        return effects;
      }
    `,
    visualization: `
      // Generates Mermaid diagram of cascade effects
      function visualizeCascade(effects: CascadeEffect[]): string {
        let diagram = 'graph TD\n';

        for (const effect of effects) {
          const path = effect.propagationPath;
          for (let i = 0; i < path.length - 1; i++) {
            const style = effect.effectType === 'breaking' ? '-->|breaking|' : '-.->|potential|';
            diagram += \`  \${path[i]} \${style} \${path[i + 1]}\n\`;
          }
        }

        return diagram;
      }
    `
  };

  safeUpdateProtocol: {
    steps: [
      {
        step: "Pre-flight check",
        actions: [
          "Run impact analysis",
          "Validate no breaking changes OR migration plan ready",
          "Ensure all tests pass"
        ]
      },
      {
        step: "Staged rollout",
        actions: [
          "Deploy to staging environment",
          "Run integration tests with dependent modules",
          "Process sample artifacts through full pipeline"
        ]
      },
      {
        step: "Canary deployment",
        actions: [
          "Enable for 5% of traffic",
          "Monitor error rates",
          "Compare output quality with baseline"
        ],
        rollbackTrigger: "Error rate > 1% OR quality degradation > 5%"
      },
      {
        step: "Full deployment",
        actions: [
          "Gradual traffic increase (25% → 50% → 100%)",
          "Monitor for 24 hours",
          "Document any issues"
        ]
      }
    ],

    rollbackProcedure: `
      async function rollbackDependencyChange(changeId: string): Promise<void> {
        const change = await getChange(changeId);

        // 1. Revert module configuration
        await revertModuleConfig(change.moduleId, change.previousConfig);

        // 2. Revert schema if changed
        if (change.schemaChange) {
          await revertSchema(change.moduleId, change.previousSchema);
        }

        // 3. Reprocess affected artifacts if needed
        if (change.affectedArtifacts.length > 0 && change.reprocessOnRollback) {
          await queueReprocessing(change.affectedArtifacts);
        }

        // 4. Notify stakeholders
        await notifyRollback(change);
      }
    `
  };
}
```

### 21.4 Tenant Customization

#### 21.4.1 Per-Organization Configuration

```typescript
interface TenantCustomization {
  moduleConfiguration: {
    perOrgSettings: `
      interface OrganizationModuleConfig {
        organizationId: string;
        moduleId: string;

        // Execution settings
        execution: {
          timeout: number;
          maxRetries: number;
          priority: 'low' | 'normal' | 'high';
          concurrencyLimit: number;
        };

        // Input/output customization
        dataConfig: {
          defaultInputs: Record<string, any>;
          outputFilters: OutputFilter[];
          customValidation: ValidationRule[];
        };

        // UI customization
        uiConfig: {
          displayName: string;
          icon: string;
          dashboardPosition: number;
          hiddenFromRoles: string[];
        };

        // Integration settings
        integrations: {
          webhooks: WebhookConfig[];
          externalApis: ExternalApiConfig[];
        };
      }
    `,

    configurationUI: {
      adminPanel: "Per-module configuration editor",
      validation: "Real-time validation against module constraints",
      preview: "Preview mode before applying changes"
    }
  };

  customModules: {
    types: [
      {
        type: "organization_custom",
        description: "Module created for single organization",
        restrictions: ["Cannot be shared", "Limited support"],
        development: "Self-service with templates"
      },
      {
        type: "industry_vertical",
        description: "Module for specific industry (e.g., sportswear, luxury)",
        availability: "Available to organizations in that vertical",
        development: "Platform team with industry input"
      },
      {
        type: "partner_integration",
        description: "Module integrating with specific partner (e.g., specific PLM)",
        availability: "Available to partner's customers",
        development: "Co-developed with partner"
      }
    ],

    customModuleRegistration: `
      // Organization can register custom modules
      interface CustomModuleRegistration {
        organizationId: string;
        moduleDefinition: {
          id: string; // Prefixed with org_[orgId]_
          name: string;
          description: string;
          // ... standard module fields
        };
        deployment: {
          type: 'extension' | 'workflow' | 'external-api';
          config: DeploymentConfig;
        };
        approval: {
          status: 'pending' | 'approved' | 'rejected';
          reviewedBy?: string;
          notes?: string;
        };
      }

      async function registerCustomModule(
        orgId: string,
        definition: CustomModuleDefinition
      ): Promise<CustomModuleRegistration> {
        // Validate definition
        await validateModuleDefinition(definition);

        // Check for conflicts
        await checkModuleConflicts(orgId, definition.id);

        // Create registration
        const registration = await prisma.customModuleRegistration.create({
          data: {
            organizationId: orgId,
            moduleId: \`org_\${orgId}_\${definition.id}\`,
            definition,
            approval: { status: 'pending' }
          }
        });

        // Notify for review (if required)
        if (requiresReview(definition)) {
          await notifyForReview(registration);
        } else {
          // Auto-approve simple modules
          await approveModule(registration.id);
        }

        return registration;
      }
    `
  };

  featureFlags: {
    levels: [
      {
        level: "global",
        description: "Platform-wide feature flags",
        examples: ["new_ui_enabled", "beta_features"]
      },
      {
        level: "organization",
        description: "Per-organization feature enablement",
        examples: ["module_x_enabled", "advanced_analytics"]
      },
      {
        level: "user",
        description: "Per-user feature access",
        examples: ["early_adopter_features", "power_user_tools"]
      }
    ],

    implementation: `
      interface FeatureFlagService {
        // Check if feature enabled for context
        isEnabled(flag: string, context: FlagContext): Promise<boolean>;

        // Get all flags for context
        getFlags(context: FlagContext): Promise<Record<string, boolean>>;

        // Admin: Set flag value
        setFlag(flag: string, level: FlagLevel, targetId: string, value: boolean): Promise<void>;
      }

      // Usage in module code
      async function executeModule(context: ExecutionContext): Promise<void> {
        const features = await featureFlags.getFlags({
          organizationId: context.organizationId,
          userId: context.userId
        });

        if (features.enhanced_output_format) {
          // Use new output format
        } else {
          // Use legacy format
        }

        if (features.experimental_ai_model) {
          // Use experimental model
        }
      }
    `,

    flagSchema: `
      model FeatureFlag {
        id             String   @id @default(uuid()) @db.Uuid
        name           String   @db.VarChar(100)
        description    String?  @db.Text

        // Targeting
        level          String   @db.VarChar(50) // global, organization, user
        targetId       String?  @map("target_id") @db.Uuid // org or user ID

        // Value
        enabled        Boolean  @default(false)

        // Metadata
        category       String?  @db.VarChar(50)
        tags           String[] @default([]) @db.VarChar(50)

        // Lifecycle
        expiresAt      DateTime? @map("expires_at") @db.Timestamptz(6)
        createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
        updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

        @@unique([name, level, targetId])
        @@index([name])
        @@index([level, targetId])
        @@map("feature_flags")
      }
    `
  };

  brandingAndWhiteLabel: {
    customizable: [
      "Module display names",
      "Dashboard layout",
      "Color scheme (within constraints)",
      "Logo and branding elements",
      "Notification templates",
      "Export document templates"
    ],

    configuration: `
      interface OrganizationBranding {
        organizationId: string;

        visual: {
          primaryColor: string;
          secondaryColor: string;
          logo: string; // URL
          favicon: string; // URL
        };

        content: {
          productName: string; // Override "Mega App"
          moduleNames: Record<string, string>; // Override module display names
          customTerminology: Record<string, string>; // e.g., "Artifact" → "Asset"
        };

        templates: {
          emailHeader: string;
          emailFooter: string;
          exportHeader: string;
          exportFooter: string;
        };
      }
    `
  };
}
```

### 21.5 Extensibility Patterns

#### 21.5.1 Hook System

```typescript
interface HookSystem {
  availableHooks: {
    moduleLifecycle: [
      "beforeModuleExecution",
      "afterModuleExecution",
      "onModuleError",
      "onModuleTimeout"
    ],
    artifactLifecycle: [
      "beforeArtifactCreate",
      "afterArtifactCreate",
      "beforeArtifactUpdate",
      "afterArtifactUpdate",
      "beforeArtifactArchive",
      "afterArtifactArchive"
    ],
    userActions: [
      "onUserLogin",
      "onPermissionCheck",
      "onArtifactAccess",
      "onModuleAccess"
    ],
    valueStream: [
      "onValueStreamStart",
      "onModuleComplete",
      "onValueStreamComplete",
      "onBlockerDetected"
    ]
  };

  hookRegistration: `
    // extensions/[module-id]/hooks/index.ts
    import { HookRegistry } from '@nubabel/hook-sdk';

    export function registerHooks(registry: HookRegistry) {
      // Before execution hook
      registry.on('beforeModuleExecution', async (context) => {
        // Custom validation
        if (!context.inputArtifacts.every(a => validateCustomRules(a))) {
          throw new ValidationError('Custom validation failed');
        }

        // Enrich context
        context.customData = await fetchExternalData(context);

        return context;
      });

      // After execution hook
      registry.on('afterModuleExecution', async (result) => {
        // Custom logging
        await logToExternalSystem(result);

        // Trigger external workflow
        if (result.status === 'success') {
          await triggerExternalWebhook(result);
        }

        return result;
      });

      // Error handling hook
      registry.on('onModuleError', async (error, context) => {
        // Custom error handling
        await notifyCustomChannel(error, context);

        // Optionally transform error
        return new EnhancedError(error, context);
      });
    }
  `;

  hookExecution: `
    async function executeWithHooks<T>(
      hookName: string,
      executor: () => Promise<T>,
      context: HookContext
    ): Promise<T> {
      const hooks = await getRegisteredHooks(hookName, context.organizationId);

      // Execute 'before' hooks
      let modifiedContext = context;
      for (const hook of hooks.filter(h => h.timing === 'before')) {
        modifiedContext = await hook.handler(modifiedContext);
      }

      // Execute main logic
      let result: T;
      try {
        result = await executor();
      } catch (error) {
        // Execute 'error' hooks
        for (const hook of hooks.filter(h => h.timing === 'error')) {
          error = await hook.handler(error, modifiedContext);
        }
        throw error;
      }

      // Execute 'after' hooks
      for (const hook of hooks.filter(h => h.timing === 'after')) {
        result = await hook.handler(result, modifiedContext);
      }

      return result;
    }
  `;
}
```

#### 21.5.2 Plugin Architecture

```typescript
interface PluginArchitecture {
  pluginTypes: [
    {
      type: "data-transformer",
      purpose: "Transform data between formats",
      interface: `
        interface DataTransformerPlugin {
          id: string;
          name: string;
          inputFormats: string[];
          outputFormats: string[];
          transform(input: any, options: TransformOptions): Promise<any>;
        }
      `
    },
    {
      type: "external-connector",
      purpose: "Connect to external systems",
      interface: `
        interface ExternalConnectorPlugin {
          id: string;
          name: string;
          systemType: string;
          connect(credentials: Credentials): Promise<Connection>;
          sync(connection: Connection, options: SyncOptions): Promise<SyncResult>;
        }
      `
    },
    {
      type: "output-renderer",
      purpose: "Render artifacts in custom formats",
      interface: `
        interface OutputRendererPlugin {
          id: string;
          name: string;
          supportedArtifactTypes: string[];
          outputFormats: string[];
          render(artifact: Artifact, format: string, options: RenderOptions): Promise<Buffer>;
        }
      `
    },
    {
      type: "ai-enhancer",
      purpose: "Enhance AI agent capabilities",
      interface: `
        interface AIEnhancerPlugin {
          id: string;
          name: string;
          enhancementType: 'prompt' | 'postprocess' | 'validation';
          enhance(context: EnhancementContext): Promise<EnhancementResult>;
        }
      `
    }
  ];

  pluginLifecycle: `
    interface PluginManager {
      // Registration
      register(plugin: Plugin): Promise<void>;
      unregister(pluginId: string): Promise<void>;

      // Discovery
      getPlugins(type: PluginType): Plugin[];
      getPlugin(id: string): Plugin | undefined;

      // Execution
      execute<T>(pluginId: string, method: string, ...args: any[]): Promise<T>;

      // Lifecycle
      enable(pluginId: string): Promise<void>;
      disable(pluginId: string): Promise<void>;
    }

    // Plugin sandbox for security
    async function executePluginSandboxed(
      plugin: Plugin,
      method: string,
      args: any[]
    ): Promise<any> {
      const sandbox = createSandbox({
        timeout: 30000,
        memoryLimit: '256MB',
        allowedModules: plugin.manifest.requiredModules,
        networkAccess: plugin.manifest.networkAccess
      });

      try {
        return await sandbox.execute(plugin.code, method, args);
      } finally {
        await sandbox.cleanup();
      }
    }
  `;
}
```

---

## 22. Appendix: Complete TypeScript Interfaces

```typescript
// Complete interface definitions for reference

// ============================================================================
// VALUE STREAM CORE
// ============================================================================

interface ValueStreamArtifact {
  id: string;
  organizationId: string;
  moduleId: string;
  version: number;
  previousVersionId?: string;
  status: ArtifactStatus;
  data: unknown;
  seasonCode?: string;
  collectionId?: string;
  tags: string[];
  metadata: ArtifactMetadata;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

type ArtifactStatus = 'draft' | 'processing' | 'review' | 'approved' | 'archived' | 'failed' | 'orphaned' | 'incomplete' | 'restored';

interface ArtifactMetadata {
  upstream: ArtifactReference[];
  downstream: ArtifactReference[];
  revisionHistory?: RevisionEntry[];
  enrichments?: Enrichment[];
  moduleVersion: string;
  executionId?: string;
}

interface ArtifactReference {
  artifactId: string;
  moduleId: string;
  version: number;
  relationshipType: 'source' | 'derived' | 'reference';
}

// ============================================================================
// MODULE SYSTEM
// ============================================================================

interface MegaAppModule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  version: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  requiredInputs: string[];
  optionalInputs: string[];
  executorType: 'ai-agent' | 'workflow' | 'mcp-tool' | 'hybrid';
  executorConfig: ExecutorConfig;
  enabled: boolean;
  status: ModuleStatus;
  createdAt: Date;
  updatedAt: Date;
}

type ModuleStatus = 'draft' | 'active' | 'deprecated' | 'beta';

interface ExecutorConfig {
  agentId?: string;
  workflowId?: string;
  mcpTool?: string;
  timeout: number;
  retries: number;
  priority: 'low' | 'normal' | 'high';
}

// ============================================================================
// PERMISSIONS
// ============================================================================

interface MegaAppRole {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  defaultPermissions: PermissionSet;
  createdAt: Date;
  updatedAt: Date;
}

interface ModulePermission {
  id: string;
  organizationId: string;
  moduleId: string;
  userId?: string;
  megaAppRoleId?: string;
  canView: boolean;
  canExecute: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  canDelete: boolean;
  dataScope: 'own' | 'team' | 'all';
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionSet {
  [moduleId: string]: {
    canView?: boolean;
    canExecute?: boolean;
    canCreate?: boolean;
    canApprove?: boolean;
    canConfigure?: boolean;
    canDelete?: boolean;
  };
}

// ============================================================================
// FEATURE REQUESTS
// ============================================================================

interface FeatureRequest {
  id: string;
  organizationId: string;
  source: 'slack' | 'web' | 'notion' | 'email' | 'post_release_feedback';
  sourceRef?: string;
  requesterId?: string;
  rawContent: string;
  analyzedIntent?: string;
  relatedModules: string[];
  tags: string[];
  priority: 0 | 1 | 2 | 3;
  businessImpact?: 'high' | 'medium' | 'low';
  requestCount: number;
  status: FeatureStatus;
  parentRequestId?: string;
  linkedModuleId?: string;
  metadata: FeatureRequestMetadata;
  createdAt: Date;
  updatedAt: Date;
}

type FeatureStatus = 'new' | 'analyzing' | 'backlog' | 'planning' | 'in_development' | 'in_review' | 'testing' | 'ready_for_release' | 'released' | 'rejected' | 'merged';

interface FeatureRequestMetadata {
  mergedFrom?: MergedRequest[];
  progress?: FeatureProgress;
  analysis?: FeatureAnalysis;
  iterationType?: 'improvement' | 'bug_fix' | 'enhancement';
  originalReleaseId?: string;
}

// ============================================================================
// AGENT TEAMS
// ============================================================================

interface MegaAppTeam {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  parentTeamId?: string;
  moduleId?: string;
  leadAgentId?: string;
  maxAgents: number;
  scalingPolicy: 'manual' | 'auto' | 'demand-based';
  status: 'active' | 'inactive' | 'scaling';
  createdAt: Date;
  updatedAt: Date;
}

interface AgentScalingRule {
  id: string;
  organizationId: string;
  teamId: string;
  triggerType: 'queue-depth' | 'latency' | 'schedule';
  triggerValue: number;
  action: 'scale-up' | 'scale-down';
  agentCount: number;
  agentTemplate: string;
  minAgents: number;
  maxAgents: number;
  cooldownMinutes: number;
  enabled: boolean;
  createdAt: Date;
}
```

---

**PLAN_READY: .omc/plans/mega-app-architecture.md**
```
```
