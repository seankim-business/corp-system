# Agent Activity SSE Implementation

## Overview

Real-time agent activity streaming system for web UI using Server-Sent Events (SSE).

## Components Created

### 1. Database Schema

**File**: `prisma/schema.prisma`

Added `AgentActivity` model:

- Tracks agent execution lifecycle (start, progress, completion)
- Organization-scoped for multi-tenancy
- Indexed for efficient querying

**Migration**: `prisma/migrations/20260130_add_agent_activities/migration.sql`

### 2. AgentActivityService

**File**: `src/services/monitoring/agent-activity.service.ts`

Core service implementing:

- `trackStart(params)`: Create activity record, broadcast to SSE clients, notify Slack
- `trackProgress(activityId, update)`: Update progress, broadcast event
- `trackComplete(activityId, result)`: Mark complete/failed, broadcast final event
- SSE client management (add/remove/broadcast)
- Organization-scoped filtering (security)
- Heartbeat every 30 seconds
- Graceful shutdown

**Event Types**:

- `agent_started`
- `agent_progress`
- `agent_completed`
- `agent_failed`

### 3. SSE Endpoint

**File**: `src/api/sse.ts`

Added route: `GET /api/activity/stream`

- Requires authentication
- Sets SSE headers (Content-Type, Cache-Control, Connection)
- Generates unique clientId
- Registers client in AgentActivityService
- Sends initial event with recent activities (last 100)
- Supports Last-Event-ID for reconnection
- Auto-cleanup on disconnect

### 4. Integration

**Files Modified**:

- `src/index.ts`: Added shutdown hook for AgentActivityService
- `src/services/monitoring/index.ts`: Export service

## Usage Example

```typescript
import { agentActivityService } from "./services/monitoring";

const activityId = await agentActivityService.trackStart({
  organizationId: "org-123",
  sessionId: "ses-456",
  agentType: "executor",
  agentName: "executor-high",
  category: "ultrabrain",
  inputData: { prompt: "Implement feature X" },
  metadata: { userId: "user-789", source: "slack" },
});

await agentActivityService.trackProgress(activityId, {
  message: "Analyzing codebase...",
  progress: 30,
});

await agentActivityService.trackComplete(activityId, {
  outputData: { filesChanged: ["src/api/users.ts"] },
});
```

## Frontend Integration

Frontend already has SSE hook (`useSSE`) and AgentActivityPage component.

**Expected SSE events**:

```json
{
  "type": "agent_started",
  "activityId": "uuid",
  "organizationId": "org-123",
  "sessionId": "ses-456",
  "agentType": "executor",
  "agentName": "executor-high",
  "category": "ultrabrain",
  "data": { "inputData": {...}, "metadata": {...} },
  "timestamp": "2026-01-30T12:00:00Z"
}
```

## Security

- **Organization-scoped**: Users only see activities from their organization
- **Authentication required**: All endpoints require valid JWT
- **Auto-cleanup**: Disconnected clients removed from memory
- **Heartbeat**: Detects stale connections (30s interval)

## Deployment Steps

1. **Run migration**:

   ```bash
   npx prisma migrate deploy
   ```

2. **Regenerate Prisma client**:

   ```bash
   npx prisma generate
   ```

3. **Restart server**:

   ```bash
   npm run build
   npm start
   ```

4. **Verify endpoint**:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        http://localhost:3000/api/activity/stream
   ```

## Slack Integration (Optional)

To enable Slack notifications, implement SlackActivityService with:

- `postAgentStart(params)`
- `updateAgentProgress(activityId, update)`
- `postAgentComplete(activityId, result)`

Then inject into AgentActivityService:

```typescript
agentActivityService.setSlackService(slackActivityService);
```

## Performance Considerations

- **Memory**: Clients stored in Map (O(1) lookup)
- **Database**: Indexed queries on organizationId + createdAt
- **Broadcast**: Filters by organizationId before sending
- **Heartbeat**: Single interval for all clients
- **Cleanup**: Automatic on disconnect + graceful shutdown

## Monitoring

- **Logs**: Client connect/disconnect, broadcast events
- **Metrics**: Total clients, events sent per organization
- **Health**: Heartbeat failures trigger auto-cleanup

## Next Steps

1. Add Slack integration (optional)
2. Add metrics collection (Prometheus/OpenTelemetry)
3. Add activity retention policy (auto-delete old records)
4. Add activity search/filter API endpoints
5. Add WebSocket fallback for older browsers
