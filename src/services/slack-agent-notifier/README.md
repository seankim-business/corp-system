# Slack Agent Notifier Service

Sends agent activity notifications to Slack channels via the Activity Hub event system.

## Architecture

```
Activity Hub (Event Emitter)
       ↓
Slack Agent Notifier (Subscriber)
       ↓
Slack API (WebClient)
```

## Features

- **Event-driven notifications**: Listens to activity hub events
- **Configurable notification types**: Control which events trigger Slack messages
- **Thread support**: Posts updates in Slack threads for context
- **Progress tracking**: Visual progress bars and status updates
- **Delegation/escalation tracking**: Visibility into agent collaboration

## Usage

### 1. Initialize the Notifier

```typescript
import { slackAgentNotifier } from "../services/slack-agent-notifier";
import { WebClient } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

slackAgentNotifier.initialize(slackClient);
```

### 2. Emit Events via Activity Hub

The notifier automatically listens to activity hub events:

```typescript
import { activityHub } from "../services/activity-hub";

// Execution started
activityHub.emitExecutionStart(
  executionId,
  agentId,
  agentName,
  organizationId,
  { taskDescription: "Analyze sales data" }
);

// Progress update
activityHub.emitExecutionProgress(
  executionId,
  agentId,
  agentName,
  organizationId,
  50,
  "Processing Q4 results"
);

// Execution complete
activityHub.emitExecutionComplete(
  executionId,
  agentId,
  agentName,
  organizationId,
  { durationMs: 5000 }
);

// Execution failed
activityHub.emitExecutionFailed(
  executionId,
  agentId,
  agentName,
  organizationId,
  "API rate limit exceeded",
  "RateLimitError"
);

// Tool usage
activityHub.emitToolCall(
  executionId,
  agentId,
  agentName,
  organizationId,
  "notion_search",
  { query: "sales targets" }
);

// Delegation
activityHub.emitDelegationStart(
  executionId,
  fromAgentId,
  fromAgentName,
  toAgentId,
  toAgentName,
  organizationId,
  "Generate weekly report"
);

// Escalation
activityHub.emitEscalation(
  executionId,
  fromAgentId,
  fromAgentName,
  toManagerId,
  toManagerName,
  organizationId,
  "Requires approval for budget increase"
);
```

### 3. Configuration

Customize notification behavior:

```typescript
import { SlackAgentNotifier } from "../services/slack-agent-notifier";

const notifier = new SlackAgentNotifier({
  notifyOnStart: true,
  notifyOnProgress: false, // Too noisy for production
  notifyOnComplete: true,
  notifyOnFailed: true,
  notifyOnToolUse: false, // Enable for debugging
});

notifier.initialize(slackClient);
```

### 4. Manual Notifications

For custom notifications outside the activity hub:

```typescript
// Delegation notification
await slackAgentNotifier.notifyDelegation(
  "Sales Agent",
  "Report Generator",
  "Create Q4 sales report",
  "C12345678", // Slack channel ID
  "1234567890.123456" // Thread timestamp (optional)
);

// Escalation notification
await slackAgentNotifier.notifyEscalation(
  "Junior Agent",
  "Senior Manager",
  "Budget approval needed",
  "C12345678",
  "1234567890.123456"
);

// Progress update
await slackAgentNotifier.updateProgress(
  executionId,
  75,
  "Finalizing report"
);
```

## Slack Message Examples

### Execution Start
```
🤖 Sales Agent started working
> Analyze Q4 sales data and generate insights

Position: Sales Analyst | Status: 🔄 In Progress
```

### Execution Complete
```
✅ Sales Agent completed in 12s

Execution ID: `a3b4c5d6`
```

### Execution Failed
```
❌ Sales Agent failed

```
API rate limit exceeded - please retry in 60 seconds
```

Execution ID: `a3b4c5d6` | Error Type: `RateLimitError`
```

### Delegation
```
↪️ Sales Agent delegated to Report Generator
> Create Q4 sales report with charts
```

### Escalation
```
⬆️ Junior Agent escalated to Senior Manager
_Reason:_ Budget approval needed for new software license
```

### Progress Update (with bar)
```
🤖 Sales Agent is working...

▓▓▓▓▓▓▓░░░ 75%
_Finalizing report and adding charts_
```

## Database Integration

The notifier queries `AgentExecution` records to:
- Get agent display name and avatar
- Retrieve Slack channel/thread IDs
- Store message timestamps for updates

Required fields in `AgentExecution`:
- `slackChannelId`: Slack channel to post in
- `slackThreadTs`: Thread timestamp (for threaded replies)
- `slackMessageTs`: Message timestamp (for updates)

## Event Types

| Activity Hub Event | Slack Notification | Default |
|-------------------|-------------------|---------|
| `execution:start` | Agent started working | ✅ Enabled |
| `execution:progress` | Progress update | ❌ Disabled |
| `execution:complete` | Agent completed | ✅ Enabled |
| `execution:failed` | Agent failed with error | ✅ Enabled |
| `tool:call` | Tool usage | ❌ Disabled |
| `delegation:start` | Custom via `notifyDelegation()` | Manual |
| `escalation:triggered` | Custom via `notifyEscalation()` | Manual |

## Best Practices

1. **Initialize once**: Call `initialize()` during app startup
2. **Use activity hub**: Emit events via activity hub, not directly to notifier
3. **Store Slack IDs**: Always save `slackChannelId`, `slackThreadTs`, `slackMessageTs` in executions
4. **Disable noisy events**: Turn off progress/tool notifications in production
5. **Thread messages**: Use `slackThreadTs` to keep related messages together
6. **Truncate long text**: Messages are auto-truncated (200-300 chars)

## Error Handling

All notification methods catch errors silently to prevent Slack failures from blocking agent work:

```typescript
activityHub.on("execution:start", (event) => {
  this.notifyExecutionStart(event).catch((e) =>
    logger.error("Failed to notify execution start", { error: e })
  );
});
```

Errors are logged but don't throw.

## Testing

```typescript
import { activityHub } from "../services/activity-hub";
import { slackAgentNotifier } from "../services/slack-agent-notifier";

// Mock Slack client
const mockSlackClient = {
  chat: {
    postMessage: jest.fn().mockResolvedValue({ ts: "123.456" }),
    update: jest.fn().mockResolvedValue({ ts: "123.456" }),
  },
};

slackAgentNotifier.initialize(mockSlackClient as any);

// Emit test event
activityHub.emitExecutionStart(
  "exec-123",
  "agent-456",
  "Test Agent",
  "org-789"
);

// Verify Slack was called
expect(mockSlackClient.chat.postMessage).toHaveBeenCalled();
```

## See Also

- [Activity Hub Service](../activity-hub/README.md)
- [Agent Events Service](../agent-events.ts)
- [Slack API Documentation](https://api.slack.com/)
