# Notification Services

Slack notification services for alerts and agent activity tracking.

## Services

1. **Alert Service** - Quota and circuit breaker alerts with cooldown management
2. **Slack Activity Service** - Real-time agent activity notifications to #it-test

---

# Alert Service

Slack notification service for quota and circuit breaker alerts with cooldown management.

## Features

- **Block Kit Formatting**: Rich Slack messages with structured layouts
- **Cooldown Management**: Prevents alert spam with configurable cooldowns
- **Multi-Tenant Support**: Organization-based Slack integrations
- **Configurable Channels**: Environment variable for alert channel

## Usage

### Send Quota Alert

```typescript
import { alertService, QuotaAlert } from "./services/notifications/alert.service";

const alert: QuotaAlert = {
  accountId: "acc_123",
  accountName: "Production Account",
  organizationId: "org_456",
  severity: "warning",
  thresholdType: "daily",
  percentageUsed: 85.5,
  currentValue: 8550,
  limit: 10000,
  recommendation: "Consider adding additional accounts or increasing daily limits",
};

await alertService.sendQuotaAlert(alert);
```

### Send Circuit Breaker Alert

```typescript
await alertService.sendCircuitBreakerAlert("acc_123", "Rate limit exceeded (429)", "org_456");
```

### Send All Accounts Exhausted Alert

```typescript
await alertService.sendAllAccountsExhaustedAlert("org_456");
```

## Cooldown Periods

| Alert Type             | Cooldown   | Purpose                                              |
| ---------------------- | ---------- | ---------------------------------------------------- |
| Quota Alert            | 30 minutes | Prevent repeated warnings for same account/threshold |
| Circuit Breaker        | 5 minutes  | Avoid spam during circuit open state                 |
| All Accounts Exhausted | 1 hour     | Critical alert sent once per hour                    |

## Environment Variables

```bash
SLACK_ALERT_CHANNEL="#eng-alerts"  # Default channel for alerts
```

## Integration with QuotaMonitorService

The alert service is designed to be called by `QuotaMonitorService` when thresholds are exceeded:

```typescript
import { alertService } from "../notifications/alert.service";

if (percentageUsed >= 90) {
  await alertService.sendQuotaAlert({
    accountId: account.id,
    accountName: account.name,
    organizationId: account.organizationId,
    severity: "critical",
    thresholdType: "daily",
    percentageUsed,
    currentValue: account.dailyQuotaUsed,
    limit: account.dailyQuotaLimit,
    recommendation: "Immediate action required: Add accounts or increase limits",
  });
}
```

## Cooldown Management

Check if an alert is in cooldown:

```typescript
const inCooldown = await alertService.isInCooldown("acc_123", "quota_daily");
```

Clear cooldown (for testing or manual override):

```typescript
await alertService.clearCooldown("acc_123", "quota_daily");
```

## Block Kit Message Format

### Quota Alert

```
🚨 Quota Alert: Production Account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Severity: CRITICAL
Threshold Type: DAILY
Usage: 85.5%
Current / Limit: 8,550 / 10,000

Recommendation:
Consider adding additional accounts or increasing daily limits

Account ID: acc_123 | Organization: org_456
```

### Circuit Breaker Alert

```
🔴 Circuit Breaker Opened: Production Account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Account: Production Account
Status: CIRCUIT OPEN
Reason: Rate limit exceeded (429)
Consecutive Failures: 5

Last Failure: 2026-01-30 14:30:00

Account ID: acc_123 | Organization: org_456
```

### All Accounts Exhausted Alert

```
🚨🚨🚨 CRITICAL: All Accounts Exhausted 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@channel All active Claude accounts are currently exhausted or unavailable.

Total Active Accounts: 10
Exhausted/Unavailable: 10

Immediate Actions Required:
• Add new Claude accounts
• Increase quota limits on existing accounts
• Check for circuit breaker issues
• Review recent usage patterns

Organization: org_456 | Time: 2026-01-30 14:30:00
```

## Redis Keys

Alert cooldowns are stored in Redis with the following key patterns:

- Quota alerts: `alert:cooldown:{accountId}:quota_{thresholdType}`
- Circuit breaker: `alert:cooldown:{accountId}:circuit_breaker`
- All exhausted: `alert:cooldown:{organizationId}:all_accounts_exhausted`

## Error Handling

All alert methods catch and log errors without throwing, ensuring that alert failures don't break the calling service:

```typescript
try {
  await alertService.sendQuotaAlert(alert);
} catch (error) {
  // Errors are logged but not thrown
}
```

---

# Slack Activity Service

Real-time agent activity notifications to Slack #it-test channel with @Nubabel mentions.

## Features

- **Rich Block Kit Formatting**: Professional message layout with headers, fields, and context
- **Message Threading**: Progress updates posted as threaded replies
- **Rate Limiting**: Max 1 update per 10 seconds, or when progress changes by 5%+
- **Real-time Notifications**: Instant updates when agents start, progress, or complete

## Usage

### Basic Example

```typescript
import {
  slackActivityService,
  AgentActivity,
} from "./services/notifications/slack-activity.service";

const activity: AgentActivity = {
  id: "act_123456789",
  organizationId: "org_abc",
  userId: "user_xyz",
  sessionId: "sess_789",
  agentType: "executor",
  model: "claude-sonnet-4",
  category: "quick",
  taskDescription: "Fix TypeScript errors in authentication module",
  status: "started",
  startedAt: new Date(),
};

const messageTs = await slackActivityService.postAgentStart(activity);

if (messageTs) {
  activity.status = "in_progress";
  activity.progress = 50;
  await slackActivityService.updateAgentProgress(activity, messageTs);

  activity.status = "completed";
  activity.completedAt = new Date();
  activity.result = {
    summary: "Fixed 5 TypeScript errors",
    filesModified: ["src/auth/auth.service.ts"],
    tokensUsed: 1500,
  };
  await slackActivityService.postAgentComplete(activity, messageTs);
}
```

### Integration with Orchestrator

```typescript
import { slackActivityService } from "./services/notifications/slack-activity.service";

async function orchestrate(request: OrchestrationRequest) {
  const activity: AgentActivity = {
    id: randomUUID(),
    organizationId: request.organizationId,
    userId: request.userId,
    sessionId: request.sessionId,
    agentType: "executor",
    model: "claude-sonnet-4",
    category: categorySelection.category,
    taskDescription: request.userRequest,
    status: "started",
    startedAt: new Date(),
  };

  const messageTs = await slackActivityService.postAgentStart(activity);

  try {
    const result = await delegateTask({
      subagent_type: "executor",
      model: "sonnet",
      prompt: request.userRequest,
    });

    activity.status = "completed";
    activity.completedAt = new Date();
    activity.result = {
      summary: result.output,
      tokensUsed: result.metadata.tokens,
    };

    if (messageTs) {
      await slackActivityService.postAgentComplete(activity, messageTs);
    }
  } catch (error) {
    activity.status = "failed";
    activity.completedAt = new Date();
    activity.result = {
      error: error instanceof Error ? error.message : String(error),
    };

    if (messageTs) {
      await slackActivityService.postAgentComplete(activity, messageTs);
    }
  }
}
```

## Configuration

### Environment Variables

```bash
NUBABEL_BOT_USER_ID=U01234567  # Optional: Nubabel bot user ID for mentions
```

If not set, the service will fetch it automatically via Slack API.

### Channel Configuration

Default channel: `#it-test`

To change the channel, modify the `channelName` property in `SlackActivityService`:

```typescript
export class SlackActivityService {
  private channelName = "your-channel-name";
}
```

## Rate Limiting

Progress updates are throttled to prevent Slack API spam:

- **Time-based**: Minimum 10 seconds between updates
- **Progress-based**: Only update if progress changed by 5%+ (e.g., 45% → 50%)

This ensures smooth updates without hitting Slack rate limits.

## Message Format

### Agent Start

```
🤖 Agent Started
@Nubabel New agent activity detected

Agent Type: executor
Model: claude-sonnet-4
Category: quick
Started: Jan 30, 2026 at 10:30 AM

Task Description:
Fix TypeScript errors in authentication module

Session: sess_789 | Activity: act_1234
```

### Agent Progress (Threaded)

```
⏳ In Progress

▓▓▓▓▓░░░░░ 50%
```

### Agent Completed

```
✅ Agent Completed
@Nubabel Agent activity completed

Agent Type: executor
Model: claude-sonnet-4
Category: quick
Duration: 2m 34s

Task Description:
Fix TypeScript errors in authentication module

Result:
Fixed 5 TypeScript errors

📁 Files: src/auth/auth.service.ts | 🎫 Tokens: 1,500 | Session: sess_789 | Activity: act_1234
```

### Agent Failed

```
❌ Agent Failed
@Nubabel Agent activity failed

Agent Type: executor
Model: claude-sonnet-4
Category: quick
Duration: 1m 12s

Task Description:
Fix TypeScript errors in authentication module

Error:
```

Build failed: Type 'string' is not assignable to type 'number'

```

Session: sess_789 | Activity: act_1234
```

## Error Handling

The service gracefully handles errors:

- **No Slack integration**: Returns `null` from `postAgentStart()`, logs debug message
- **Channel not found**: Returns `null`, logs warning
- **API errors**: Logs error, returns `null` or silently fails for updates

All errors are logged but do not throw exceptions to prevent disrupting the main orchestration flow.
