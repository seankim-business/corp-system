# Auto-Development Pipeline

## Overview

The Auto-Development Pipeline automatically transforms approved feature requests into working, tested code through intelligent task generation, agent orchestration, and quality validation.

## Architecture

```
┌─────────────────────┐
│ Feature Request     │
│ (approved status)   │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ AutoDeveloperService│
│ - createPlan()      │
│ - execute()         │
│ - runQA()           │
│ - requestRelease()  │
└──────────┬──────────┘
           │
           ├──→ TaskGeneratorService
           │    (Break down into tasks)
           │
           ├──→ AR Assignment
           │    (Assign agents)
           │
           ├──→ Orchestrator
           │    (Execute tasks)
           │
           └──→ AR Approval
                (Release approval)
```

## Components

### 1. AutoDeveloperService

**Location:** `src/services/mega-app/development-pipeline/auto-developer.service.ts`

**Main Methods:**

```typescript
class AutoDeveloperService {
  // Generate development plan from feature request
  async createPlan(featureRequestId: string): Promise<DevelopmentPlan>

  // Execute all tasks in the plan
  async execute(plan: DevelopmentPlan): Promise<DevelopmentResult>

  // Run QA validation (type check, tests, breaking changes)
  async runQA(planId: string, artifacts: DevelopmentArtifacts): Promise<QAResult>

  // Request release approval from AR
  async requestRelease(
    planId: string,
    artifacts: DevelopmentArtifacts,
    qaResult: QAResult
  ): Promise<"pending" | "approved" | "rejected">

  // Complete release after approval
  async release(planId: string): Promise<ReleaseResult>
}
```

**Workflow:**

1. **Plan Creation**
   - Parse feature analysis from `FeatureRequest.analyzedIntent`
   - Determine target module(s)
   - Generate development tasks
   - Calculate effort estimates
   - Assess risks

2. **Execution**
   - Sort tasks by dependencies
   - Request agent assignments (optional)
   - Execute tasks via `delegateTask()`
   - Collect artifacts (files created/modified)
   - Handle failures gracefully

3. **QA Validation**
   - Run TypeScript type check
   - Execute relevant tests
   - Detect breaking changes
   - Validate success criteria

4. **Release Approval**
   - Create AR approval request (Level 2 - PROCESS)
   - Auto-approval for low-risk changes
   - Track approval status

5. **Release**
   - Update module version
   - Mark feature request as "released"
   - Log metrics

### 2. TaskGeneratorService

**Location:** `src/services/mega-app/development-pipeline/task-generator.service.ts`

**Task Types:**

```typescript
type DevelopmentTaskType =
  | "code"    // Source code implementation
  | "config"  // Configuration changes
  | "skill"   // New skill definition
  | "agent"   // New agent capability
  | "test";   // Test creation
```

**Task Generation Strategies:**

| Feature Type | Tasks Generated |
|--------------|-----------------|
| **skill-enhancement** | Skill definition → Registry update → Documentation |
| **agent-capability** | Agent profile → Controller → Registry → Tests |
| **config-change** | Config update → Schema validation → Documentation |
| **new-feature** | Service layer → API endpoints → Types → DB schema |
| **api-extension** | API routes → Validation → Documentation |
| **generic** | Architect-driven planning task |

**Example Task:**

```typescript
{
  id: "uuid",
  type: "code",
  description: "Implement service: Auto-Approval Logic",
  targetFiles: ["src/services/auto-approval.service.ts"],
  assignedAgentType: "executor",
  category: "artistry",
  status: "pending",
  dependencies: ["type-definition-task-id"],
  estimatedTokens: 12000,
  metadata: {
    layer: "service",
    businessLogic: "Check request against approval rules..."
  }
}
```

## Integration Points

### With AR System

```typescript
// Request agent assignment for task
const agentId = await arAssignmentService.requestAgentAssignment({
  taskType: task.type,
  estimatedTokens: task.estimatedTokens,
  priority: "normal"
});
```

### With Orchestrator

```typescript
// Execute task via delegateTask
const result = await delegateTask({
  category: task.category,          // "quick" | "artistry" | "ultrabrain"
  load_skills: ["code-generation"],
  prompt: buildTaskPrompt(task, plan),
  session_id: `dev-${planId}`,
  organizationId: this.organizationId,
  context: {
    taskId: task.id,
    planId: plan.id,
    agentId,
    targetFiles: task.targetFiles,
  }
});
```

### With AR Approval

```typescript
// Request release approval
const approvalRequest = await arApprovalService.createRequest({
  organizationId: this.organizationId,
  requestType: "task",
  level: 2, // PROCESS level
  title: `Release: Feature Request ${featureRequestId}`,
  description: releaseDescription,
  context: {
    planId,
    artifacts,
    qaResult,
  },
  requesterType: "agent",
  requesterId: "auto-developer"
});
```

## Usage

### Basic Usage

```typescript
import { AutoDeveloperService } from "@/services/mega-app/development-pipeline";

// Initialize service
const autoDev = new AutoDeveloperService("org-123");

// Create development plan
const plan = await autoDev.createPlan("feature-request-456");

// Execute plan
const result = await autoDev.execute(plan);

// Check results
if (result.success && result.approvalStatus === "approved") {
  await autoDev.release(plan.id);
}
```

### With Event-Driven Flow

```typescript
// In feature request approval handler
async function onFeatureRequestApproved(featureRequestId: string) {
  const autoDev = new AutoDeveloperService(organizationId);

  // Auto-create plan
  const plan = await autoDev.createPlan(featureRequestId);

  // Emit to queue
  await queue.publish("value-stream", {
    event: "plan.created",
    planId: plan.id,
    featureRequestId,
  });

  // Auto-execute (or wait for manual trigger)
  const result = await autoDev.execute(plan);

  await queue.publish("value-stream", {
    event: "development.completed",
    planId: plan.id,
    success: result.success,
  });
}
```

## QA Validation

### Type Check

```bash
npm run typecheck
```

### Test Execution

```bash
npm test -- --testPathPattern="development-pipeline"
```

### Breaking Change Detection

Automatically detects:
- **API Changes**: Modified endpoints in `src/api/`
- **Schema Changes**: Updates to `prisma/schema.prisma`
- **Config Changes**: Modifications to config files

### Success Criteria Validation

Validates against feature request success criteria:
- Functionality verification
- Performance benchmarks
- Integration tests
- User acceptance criteria

## Data Flow

### Plan Storage

Plans are stored in `FeatureRequest.analyzedIntent` as JSON:

```json
{
  "coreIntent": "...",
  "specificFeature": "...",
  "problemStatement": "...",
  "successCriteria": [...],
  "developmentPlanId": "plan-uuid",
  "developmentPlan": {
    "id": "plan-uuid",
    "featureRequestId": "...",
    "moduleId": "...",
    "tasks": [...],
    "status": "in_progress"
  }
}
```

### Artifacts Collection

```typescript
interface DevelopmentArtifacts {
  filesCreated: string[];      // New files
  filesModified: string[];     // Changed files
  testsAdded: string[];        // Test files
  skillsCreated?: string[];    // New skills
  agentsConfigured?: string[]; // Agent configs
}
```

### Progress Tracking

Real-time progress via `updateProgress()`:

```typescript
{
  planId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentPhase: "planning" | "execution" | "qa" | "approval" | "release";
  currentTask?: DevelopmentTask;
  lastUpdate: Date;
}
```

## Error Handling

### Task Failure

- **Non-critical tasks**: Continue with remaining tasks
- **Critical tasks** (base code, no dependencies): Stop execution
- All errors collected in `DevelopmentResult.errors[]`

### QA Failure

- Type check failure → Block release
- Test failure → Block release
- Breaking changes → Require higher approval level

### Recovery

```typescript
// Retry failed task
task.status = "pending";
const result = await execute(plan);

// Partial success handling
if (result.artifacts.filesModified.length > 0 && !result.qaResult.success) {
  // Some work done but QA failed - create fix-up plan
  const fixPlan = await autoDev.createPlan(featureRequestId);
}
```

## Metrics

Emitted metrics:

```typescript
metrics.histogram("development.plan_creation_duration", ms);
metrics.increment("development.plans_created");
metrics.histogram("development.execution_duration", ms);
metrics.increment("development.executions_completed", { success: "true" });
metrics.increment("development.qa_completed", { passed: "true" });
metrics.increment("development.releases_completed");
```

## Future Enhancements

1. **Separate DevelopmentPlan Table**
   - Currently stored in FeatureRequest.analyzedIntent
   - Should be its own Prisma model

2. **Real-time Progress Updates**
   - WebSocket or SSE for live progress
   - Task status dashboard

3. **Rollback Support**
   - Git branch management
   - Automatic rollback on failure

4. **Cost Tracking**
   - Token usage per task
   - Budget enforcement

5. **Parallel Task Execution**
   - Execute independent tasks concurrently
   - Dependency graph optimization

6. **Learning Loop**
   - Track successful patterns
   - Improve task generation over time

## Related Documentation

- [AR Management System](./AR_MANAGEMENT_SYSTEM.md)
- [MegaApp Manager](./MEGAAPP_MANAGER.md)
- [Feature Request Pipeline](./FEATURE_REQUEST_PIPELINE.md)
- [Multi-Agent Orchestration](./MULTI_AGENT_ORCHESTRATION.md)
