# Quota Monitoring Service

Syncs usage data from Claude Admin API and creates alerts when accounts approach quota limits.

## Features

- **Admin API Sync**: Fetches usage data from Claude Admin API every 60 seconds
- **Threshold Monitoring**: Checks request and token quotas against limits
- **Alert Creation**: Creates alerts at 80%, 95%, and 100% thresholds
- **Deduplication**: Prevents duplicate alerts for the same condition
- **Resilient**: Continues running even if individual account syncs fail

## Setup

### 1. Environment Variables

```bash
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-...
```

### 2. Database Migration

Run the migration to create the `quota_alerts` table:

```bash
npx prisma migrate deploy
```

### 3. Account Configuration

Each `ClaudeAccount` must have quota limits in its metadata:

```typescript
await prisma.claudeAccount.create({
  data: {
    organizationId: "...",
    name: "Production Account",
    metadata: {
      apiKeyId: "key_abc123",
      requestLimit: 1000000,
      tokenLimit: 5000000000,
    },
  },
});
```

## Usage

### Start Background Sync

```typescript
import { QuotaMonitorService } from "./services/monitoring/quota-monitor.service";

const quotaMonitor = new QuotaMonitorService(process.env.ANTHROPIC_ADMIN_API_KEY!);

quotaMonitor.scheduledSync();
```

### Manual Sync

```typescript
await quotaMonitor.syncUsageFromAdminAPI();

await quotaMonitor.syncUsageFromAdminAPI(accountId);
```

### Check Thresholds

```typescript
await quotaMonitor.checkThresholds(accountId);
```

### Get Alerts

```typescript
const unresolvedAlerts = await quotaMonitor.getUnresolvedAlerts(accountId);

const allAlerts = await quotaMonitor.getAllAlerts(accountId);
```

### Resolve Alert

```typescript
await quotaMonitor.resolveAlert(alertId);
```

## Alert Thresholds

| Percentage | Type              | Severity | Action                       |
| ---------- | ----------------- | -------- | ---------------------------- |
| 80-94%     | approaching_limit | warning  | Create warning alert         |
| 95-99%     | approaching_limit | critical | Create critical alert        |
| 100%+      | quota_exceeded    | critical | Create alert + set exhausted |

## Database Schema

### ClaudeAccount Metadata

```json
{
  "apiKeyId": "key_abc123",
  "requestLimit": 1000000,
  "tokenLimit": 5000000000,
  "currentMonthRequests": 850000,
  "currentMonthTokens": 4200000000,
  "lastSyncedAt": "2026-01-30T12:00:00Z"
}
```

### QuotaAlert

```sql
CREATE TABLE quota_alerts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES claude_accounts(id),
  type VARCHAR(50),
  severity VARCHAR(20),
  message TEXT,
  current_value INTEGER,
  limit INTEGER,
  percentage FLOAT,
  quota_type VARCHAR(50),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

## Error Handling

The service is designed to be resilient:

- Individual account sync failures don't stop the entire sync
- All errors are logged but not thrown
- Background sync continues even after errors
- Rate limit errors are handled with exponential backoff

## Production Considerations

The current implementation is simplified. For production:

1. **Billing Period Tracking**: Track actual billing periods instead of "current month"
2. **Usage Accumulation**: Accumulate usage over time rather than replacing it
3. **Month Rollovers**: Handle month boundaries properly
4. **Alert Notifications**: Send alerts via Slack/email
5. **Alert Auto-Resolution**: Auto-resolve alerts when usage drops below threshold

## Integration Example

```typescript
import express from "express";
import { QuotaMonitorService } from "./services/monitoring/quota-monitor.service";

const app = express();
const quotaMonitor = new QuotaMonitorService(process.env.ANTHROPIC_ADMIN_API_KEY!);

quotaMonitor.scheduledSync();

app.get("/api/quota/alerts/:accountId", async (req, res) => {
  const alerts = await quotaMonitor.getUnresolvedAlerts(req.params.accountId);
  res.json(alerts);
});

app.post("/api/quota/alerts/:alertId/resolve", async (req, res) => {
  await quotaMonitor.resolveAlert(req.params.alertId);
  res.json({ success: true });
});

app.listen(3000);
```
