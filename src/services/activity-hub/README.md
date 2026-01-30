# Activity Hub Service

Central event emitter for agent activity events. Provides a lightweight event bus for inter-service communication.

## Architecture

```
Agent Services
    ↓
Activity Hub (EventEmitter)
    ↓ (broadcasts to)
- Slack Agent Notifier
- Metrics Tracker
- Audit Logger
- Real-time Dashboard (SSE)
- ... any subscriber
```

## Features

- **Event-driven**: Standard Node.js EventEmitter pattern
- **Type-safe events**: TypeScript interfaces for all events
- **Lightweight**: In-memory event bus with zero dependencies
- **Extensible**: Easy to add new event types or subscribers
- **Wildcard support**: Subscribe to all events with `*` listener

## Event Types

### Execution Events
- `execution:start` - Agent execution started
- `execution:progress` - Progress update during execution
- `execution:complete` - Execution completed successfully
- `execution:failed` - Execution failed with error

### Tool Events
- `tool:call` - Agent called a tool
- `tool:complete` - Tool execution completed

### Collaboration Events
- `delegation:start` - Agent delegated task to another agent
- `delegation:complete` - Delegated task completed
- `escalation:triggered` - Issue escalated to manager/supervisor

## Usage

### Emitting Events

```typescript
import { activityHub } from "../services/activity-hub";

// Execution lifecycle
activityHub.emitExecutionStart(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  { taskDescription: "Analyze Q4 sales" }
);

activityHub.emitExecutionProgress(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  50, // progress percent
  "Processing Q4 data", // current action
  { recordsProcessed: 1000 }
);

activityHub.emitExecutionComplete(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  { result: "Report generated" }
);

activityHub.emitExecutionFailed(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  "API rate limit exceeded",
  "RateLimitError",
  { retryAfter: 60 }
);

// Tool usage
activityHub.emitToolCall(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  "notion_search",
  { query: "Q4 sales targets" }
);

activityHub.emitToolComplete(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "org-789",
  "notion_search",
  { results: [...] }
);

// Collaboration
activityHub.emitDelegationStart(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "agent-789",
  "Report Generator",
  "org-789",
  "Generate Q4 sales report"
);

activityHub.emitDelegationComplete(
  "exec-123",
  "agent-456",
  "Sales Agent",
  "agent-789",
  "Report Generator",
  "org-789",
  { reportUrl: "https://..." }
);

activityHub.emitEscalation(
  "exec-123",
  "agent-456",
  "Junior Agent",
  "manager-123",
  "Senior Manager",
  "org-789",
  "Budget approval needed"
);
```

### Subscribing to Events

```typescript
import { activityHub, ActivityEvent } from "../services/activity-hub";

// Subscribe to specific event type
activityHub.on("execution:start", (event: ActivityEvent) => {
  console.log(`${event.agentName} started execution ${event.executionId}`);
  // Send to metrics, logging, notifications, etc.
});

// Subscribe to execution lifecycle
activityHub.on("execution:complete", (event: ActivityEvent) => {
  console.log(`${event.agentName} completed execution ${event.executionId}`);
  // Update database, send notifications
});

activityHub.on("execution:failed", (event: ActivityEvent) => {
  console.error(`${event.agentName} failed:`, event.data.error);
  // Alert on-call engineer, retry logic
});

// Subscribe to ALL events (wildcard)
activityHub.on("*", (event: ActivityEvent) => {
  console.log("Any event:", event.type, event);
  // Universal logging, debugging
});

// Subscribe to tool usage
activityHub.on("tool:call", (event: ActivityEvent) => {
  console.log(`${event.agentName} called ${event.data.toolName}`);
  // Track tool usage metrics
});

// Subscribe to collaboration events
activityHub.on("delegation:start", (event: ActivityEvent) => {
  console.log(
    `${event.agentName} delegated to ${event.data.toAgentName}: ${event.data.taskDescription}`
  );
  // Visualize delegation chains
});

activityHub.on("escalation:triggered", (event: ActivityEvent) => {
  console.log(
    `${event.agentName} escalated to ${event.data.toManagerName}: ${event.data.reason}`
  );
  // Alert managers, track escalation patterns
});
```

### Low-level Event API

For custom events or advanced use cases:

```typescript
import { activityHub } from "../services/activity-hub";

// Emit custom event
activityHub.emitActivity({
  type: "tool:call",
  executionId: "exec-123",
  agentId: "agent-456",
  agentName: "Sales Agent",
  organizationId: "org-789",
  data: {
    toolName: "custom_tool",
    customField: "custom value",
  },
});

// Subscribe with once (auto-unsubscribe after first event)
activityHub.once("execution:complete", (event) => {
  console.log("First execution completed:", event);
});

// Unsubscribe
const listener = (event: ActivityEvent) => {
  console.log("Event:", event);
};
activityHub.on("execution:start", listener);
activityHub.off("execution:start", listener);
```

## Event Data Structure

```typescript
interface ActivityEvent {
  type: ActivityEventType;
  executionId: string;
  agentId: string;
  agentName: string;
  organizationId: string;
  timestamp: Date; // Auto-added
  data: Record<string, unknown>; // Event-specific data
}
```

### Event-Specific Data Fields

| Event Type | Data Fields |
|-----------|-------------|
| `execution:start` | `taskDescription?` |
| `execution:progress` | `progress`, `currentAction` |
| `execution:complete` | `result?`, `durationMs?` |
| `execution:failed` | `error`, `errorType?` |
| `tool:call` | `toolName`, `toolArgs?` |
| `tool:complete` | `toolName`, `toolResult?` |
| `delegation:start` | `toAgentId`, `toAgentName`, `taskDescription` |
| `delegation:complete` | `toAgentId`, `toAgentName` |
| `escalation:triggered` | `toManagerId`, `toManagerName`, `reason` |

## Integration Examples

### Slack Notifications

```typescript
import { activityHub } from "../services/activity-hub";
import { slackAgentNotifier } from "../services/slack-agent-notifier";

// Slack notifier subscribes to events
slackAgentNotifier.initialize(slackClient);

// Now any emitted event triggers Slack notifications
activityHub.emitExecutionStart(...); // → Slack message posted
```

### Metrics Tracking

```typescript
import { activityHub } from "../services/activity-hub";
import { metrics } from "../utils/metrics";

activityHub.on("execution:start", (event) => {
  metrics.increment("agent.execution.start", {
    agentId: event.agentId,
    organizationId: event.organizationId,
  });
});

activityHub.on("execution:complete", (event) => {
  metrics.increment("agent.execution.complete");
  if (event.data.durationMs) {
    metrics.timing("agent.execution.duration", event.data.durationMs as number);
  }
});

activityHub.on("tool:call", (event) => {
  metrics.increment("tool.usage", {
    toolName: event.data.toolName as string,
  });
});
```

### Real-time Dashboard (SSE)

```typescript
import { activityHub } from "../services/activity-hub";
import { sseManager } from "../api/sse";

// Forward all events to SSE clients
activityHub.on("*", (event) => {
  sseManager.sendToOrganization(
    event.organizationId,
    `agent:${event.type}`,
    event
  );
});
```

### Audit Logging

```typescript
import { activityHub } from "../services/activity-hub";
import { createAuditLog } from "../services/audit-logger";

activityHub.on("execution:failed", async (event) => {
  await createAuditLog({
    organizationId: event.organizationId,
    action: "agent.execution.failed",
    resourceType: "AgentExecution",
    resourceId: event.executionId,
    details: {
      agentId: event.agentId,
      error: event.data.error,
      errorType: event.data.errorType,
    },
  });
});
```

## Best Practices

1. **Emit early**: Emit `execution:start` before work begins
2. **Emit completion**: Always emit either `complete` or `failed`
3. **Include context**: Put useful data in `data` field
4. **Avoid blocking**: Subscribers should not block emitter
5. **Handle errors**: Wrap subscriber logic in try-catch
6. **Use typed data**: Type-assert `data` fields for safety

## Error Handling

Subscribers should catch their own errors:

```typescript
activityHub.on("execution:start", async (event) => {
  try {
    await sendNotification(event);
  } catch (error) {
    logger.error("Failed to send notification", { error, event });
    // Don't throw - don't block other subscribers
  }
});
```

## Performance

- In-memory event emitter (no I/O)
- Non-blocking by default (subscribers run async)
- Max 50 listeners per event (configurable)
- Zero external dependencies

## Testing

```typescript
import { activityHub } from "../services/activity-hub";

// Mock listener
const mockListener = jest.fn();
activityHub.on("execution:start", mockListener);

// Emit event
activityHub.emitExecutionStart("exec-123", "agent-456", "Test Agent", "org-789");

// Verify
expect(mockListener).toHaveBeenCalledWith(
  expect.objectContaining({
    type: "execution:start",
    executionId: "exec-123",
    agentName: "Test Agent",
  })
);
```

## See Also

- [Slack Agent Notifier](../slack-agent-notifier/README.md)
- [Agent Events Service](../agent-events.ts)
- [Node.js EventEmitter](https://nodejs.org/api/events.html)
