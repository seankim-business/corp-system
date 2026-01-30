# Sub-Agent Spawning (Phase 3 Intelligence Layer)

## Overview

The sub-agent spawning system enables agents to spawn child agents for complex subtasks, creating hierarchical execution trees with proper tracking and depth limiting.

**Feature ID**: E2-T1
**Status**: ✅ Implemented
**Location**: `src/orchestrator/sub-agent-spawner.ts`

## Architecture

### Core Components

1. **AgentContext** - Enhanced execution context with spawn capability
2. **SubAgentConfig** - Configuration for spawning sub-agents
3. **SubAgentResult** - Results from sub-agent execution
4. **Execution Tracking** - Database records linking parent/child executions

### Key Features

- ✅ Hierarchical agent execution
- ✅ Depth limiting (configurable max depth, hard limit at 5)
- ✅ Execution tree tracking via `rootExecutionId` and `parentExecutionId`
- ✅ Timeout protection (5 minutes per child)
- ✅ Automatic error handling and recovery
- ✅ Metrics and logging for spawn operations
- 🔄 Token budget tracking (E2-T2)
- 🔄 Rate limiting (E2-T5)

## Usage

### Basic Spawning

```typescript
import { createAgentContext, spawnSubAgent } from '@/orchestrator/sub-agent-spawner';
import { AgentExecutionContext } from '@/orchestrator/agent-coordinator';

// Create a spawnable context
const baseContext: AgentExecutionContext = {
  organizationId: 'org-123',
  userId: 'user-456',
  sessionId: 'session-789',
  depth: 0,
  maxDepth: 3,
};

const executionId = 'exec-001';
const context = createAgentContext(baseContext, executionId);

// Spawn a sub-agent
const result = await context.spawnSubAgent({
  agentType: 'data',
  task: 'Extract metrics from the last 30 days',
  contextToPass: {
    dateRange: '2024-01-01 to 2024-01-30',
  },
  maxDepth: 3,
  tokenBudget: 10000, // Will be enforced in E2-T2
});

console.log('Success:', result.success);
console.log('Output:', result.result);
console.log('Execution time:', result.executionTime, 'ms');
console.log('Child executions:', result.childExecutions.length);
```

### Within Multi-Agent Orchestrator

The multi-agent orchestrator automatically creates root execution records:

```typescript
import { orchestrateMultiAgent } from '@/orchestrator/multi-agent-orchestrator';

const result = await orchestrateMultiAgent({
  userRequest: 'Analyze sales data and create a report',
  sessionId: 'session-123',
  organizationId: 'org-456',
  userId: 'user-789',
  enableMultiAgent: true,
  enableParallel: true,
});

// Root execution ID is automatically tracked
// Sub-agents spawned will reference this root
```

## Data Model

### OrchestratorExecution

```typescript
{
  id: string;                    // Execution UUID
  organizationId: string;
  userId: string;
  sessionId: string;
  category: string;              // "sub-agent" for spawned agents
  status: string;                // "running" | "success" | "failed"
  duration: number;              // Execution time in ms

  inputData: {
    task: string;                // The task description
    agentType: string;           // Type of agent spawned
    context?: Record<string, unknown>;
  };

  outputData?: {
    output: string;              // Agent's output
    model: string;               // Model used
  };

  metadata: {
    parentExecutionId?: string;  // Parent execution UUID
    rootExecutionId?: string;    // Root execution UUID
    depth: number;               // Current depth in spawn tree
    maxDepth: number;            // Maximum allowed depth
    tokenBudget?: number;        // Token budget (E2-T2)
  };
}
```

## Depth Limiting

### Default Limits

| Limit Type | Value | Configurable |
|------------|-------|--------------|
| Default Max Depth | 3 | ✅ Yes (per spawn call) |
| Hard Max Depth | 5 | ❌ No (system limit) |
| Timeout | 5 minutes | ❌ No (system limit) |

### Example: Depth Enforcement

```typescript
// Parent at depth 0
const parentContext = createAgentContext(baseContext, 'exec-001');

// Child 1 at depth 1 (OK)
const child1 = await parentContext.spawnSubAgent({
  agentType: 'data',
  task: 'Get data',
  maxDepth: 3,
});

// Child 2 at depth 2 (OK)
const child2Context = createAgentContext(
  { ...baseContext, depth: 1 },
  'exec-002',
  'exec-001' // root execution
);

const child2 = await child2Context.spawnSubAgent({
  agentType: 'report',
  task: 'Create report',
  maxDepth: 3,
});

// Child 3 at depth 3 (OK - at limit)
const child3Context = createAgentContext(
  { ...baseContext, depth: 2 },
  'exec-003',
  'exec-001'
);

const child3 = await child3Context.spawnSubAgent({
  agentType: 'analytics',
  task: 'Analyze trends',
  maxDepth: 3,
});

// Child 4 at depth 4 (REJECTED - exceeds maxDepth)
const child4Context = createAgentContext(
  { ...baseContext, depth: 3 },
  'exec-004',
  'exec-001'
);

const child4 = await child4Context.spawnSubAgent({
  agentType: 'search',
  task: 'Find more data',
  maxDepth: 3,
});
// Returns: { success: false, error: "Maximum spawn depth (3) exceeded" }
```

## Querying Spawn Trees

### Get Spawn Tree

```typescript
import { getSpawnTree } from '@/orchestrator/sub-agent-spawner';

const tree = await getSpawnTree('root-exec-id');

tree.forEach(exec => {
  console.log(`${' '.repeat(exec.depth * 2)}${exec.agentType} (${exec.status})`);
});

// Output:
// orchestrator (success)
//   data (success)
//     analytics (success)
//   report (success)
```

### Get Spawn Statistics

```typescript
import { getSpawnStatistics } from '@/orchestrator/sub-agent-spawner';

const stats = await getSpawnStatistics('org-123', new Date('2024-01-01'));

console.log('Total spawns:', stats.total);
console.log('Success rate:', (stats.successful / stats.total * 100).toFixed(1) + '%');
console.log('Average duration:', stats.averageDuration, 'ms');
console.log('Max depth reached:', stats.maxDepthReached);
console.log('Depth distribution:', stats.depthDistribution);

// Output:
// Total spawns: 42
// Success rate: 95.2%
// Average duration: 1234 ms
// Max depth reached: 3
// Depth distribution: { 0: 1, 1: 15, 2: 20, 3: 6 }
```

## Metrics

The following metrics are emitted:

| Metric | Type | Tags | Description |
|--------|------|------|-------------|
| `sub_agent.spawn_started` | counter | `organizationId`, `agentType`, `depth` | Sub-agent spawn initiated |
| `sub_agent.spawn_completed` | counter | `organizationId`, `agentType`, `success` | Sub-agent spawn completed |
| `sub_agent.spawn_failed` | counter | `organizationId`, `agentType`, `depth` | Sub-agent spawn failed |
| `sub_agent.execution_duration` | histogram | `agentType`, `depth` | Execution duration in ms |

## Error Handling

### Common Errors

1. **Max Depth Exceeded**
   ```typescript
   {
     success: false,
     error: "Maximum spawn depth (3) exceeded",
     executionTime: 10,
     tokensUsed: 0,
     childExecutions: []
   }
   ```

2. **Hard Limit Exceeded**
   ```typescript
   {
     success: false,
     error: "Hard spawn depth limit (5) exceeded",
     executionTime: 10,
     tokensUsed: 0,
     childExecutions: []
   }
   ```

3. **Timeout**
   ```typescript
   {
     success: false,
     error: "Sub-agent execution timed out after 300000ms",
     executionTime: 300000,
     tokensUsed: 0,
     childExecutions: []
   }
   ```

4. **Agent Not Found**
   ```typescript
   {
     success: false,
     error: "Agent type 'invalid-agent' not found in registry",
     executionTime: 50,
     tokensUsed: 0,
     childExecutions: []
   }
   ```

## Best Practices

### 1. Set Appropriate Max Depth

```typescript
// Simple data extraction - shallow depth OK
const result = await context.spawnSubAgent({
  agentType: 'data',
  task: 'Get user count',
  maxDepth: 1, // Don't allow further spawning
});

// Complex analysis - allow deeper tree
const result = await context.spawnSubAgent({
  agentType: 'analytics',
  task: 'Comprehensive market analysis',
  maxDepth: 3, // Allow child agents to spawn their own children
});
```

### 2. Pass Minimal Context

```typescript
// ❌ Bad - passing entire session state
const result = await context.spawnSubAgent({
  agentType: 'report',
  task: 'Create report',
  contextToPass: sessionState, // Too much data
});

// ✅ Good - only relevant data
const result = await context.spawnSubAgent({
  agentType: 'report',
  task: 'Create report',
  contextToPass: {
    reportType: 'sales',
    period: 'Q1-2024',
  },
});
```

### 3. Handle Failures Gracefully

```typescript
const result = await context.spawnSubAgent({
  agentType: 'search',
  task: 'Find related documents',
});

if (!result.success) {
  logger.warn('Search agent failed, using fallback', {
    error: result.error,
  });

  // Fallback logic
  return getDefaultDocuments();
}

return parseDocuments(result.result);
```

### 4. Monitor Execution Trees

```typescript
// After complex operation, log the tree
const tree = await getSpawnTree(rootExecutionId);

logger.info('Execution tree completed', {
  rootExecutionId,
  totalNodes: tree.length,
  maxDepth: Math.max(...tree.map(n => n.depth)),
  failedNodes: tree.filter(n => n.status === 'failed').length,
});
```

## Future Enhancements

### E2-T2: Token Budget Tracking
- Track actual token usage per sub-agent
- Enforce budget limits
- Share budget pool between parent and children

### E2-T3: Spawn Tree Visualization
- Visual tree rendering in logs
- Real-time tree updates in UI
- Execution timeline view

### E2-T4: Context Inheritance
- Smart context merging from parent to child
- Context filtering based on agent capabilities
- Context compression for deep trees

### E2-T5: Rate Limiting
- Per-organization spawn rate limits
- Per-user spawn rate limits
- Burst protection for spawn storms

## Testing

```typescript
import { createAgentContext, spawnSubAgent } from '@/orchestrator/sub-agent-spawner';

describe('Sub-Agent Spawning', () => {
  it('should spawn a sub-agent successfully', async () => {
    const context = createAgentContext(baseContext, 'test-exec-001');

    const result = await context.spawnSubAgent({
      agentType: 'data',
      task: 'Test task',
    });

    expect(result.success).toBe(true);
    expect(result.childExecutions.length).toBe(1);
  });

  it('should reject spawn when max depth exceeded', async () => {
    const context = createAgentContext(
      { ...baseContext, depth: 3 },
      'test-exec-002'
    );

    const result = await context.spawnSubAgent({
      agentType: 'data',
      task: 'Test task',
      maxDepth: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum spawn depth');
  });
});
```

## References

- Agent Registry: `src/orchestrator/agent-registry.ts`
- Agent Coordinator: `src/orchestrator/agent-coordinator.ts`
- Multi-Agent Orchestrator: `src/orchestrator/multi-agent-orchestrator.ts`
- Database Schema: `prisma/schema.prisma` (OrchestratorExecution model)

## Support

For questions or issues, contact the platform team or check the internal documentation.
