# BullMQ Queue Infrastructure - Implementation Complete

**Status**: ✅ Complete (TODO #021-030)  
**Date**: 2026-01-26  
**LOC**: 652 lines across 7 files

---

## Overview

Implemented production-ready BullMQ job queue system for asynchronous processing of Slack events, AI orchestration, and notifications.

### Architecture

```
┌─────────────────────┐
│   Slack Bot API     │
│  (src/api/slack.ts) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  SlackEventQueue    │  ← Enqueue app_mention events
│  (100 events/min)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  SlackEventWorker   │  ← Process in background
│  (TODO #121)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ OrchestrationQueue  │  ← Enqueue AI task
│  (20 tasks/min)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ OrchestrationWorker │  ← Call delegate_task()
│  (TODO #122)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  NotificationQueue  │  ← Enqueue Slack reply
│  (200 msgs/min)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ NotificationWorker  │  ← Send to Slack
│  (TODO #123)        │
└─────────────────────┘

        ┌───────────────┐
        │ Dead Letter   │  ← Failed jobs after 3 retries
        │ Queue (DLQ)   │
        └───────────────┘

        ┌───────────────┐
        │ Bull Board UI │  ← Monitor all queues
        │ /admin/queues │
        └───────────────┘
```

---

## Files Created

### 1. `src/queue/base.queue.ts` (146 LOC)

**Purpose**: Shared configuration for all queues

**Features**:

- Redis connection pooling
- Exponential backoff with jitter algorithm
- Default retry strategy (3 attempts)
- Job retention policies (24h complete, 7d failed)
- Queue metrics collection

**Key Functions**:

- `createRedisConnection()` - Redis client factory
- `exponentialBackoffWithJitter()` - Retry delay calculator
- `createQueue<T>()` - Standardized queue factory
- `getQueueMetrics()` - Real-time queue stats

### 2. `src/queue/slack-event.queue.ts` (74 LOC)

**Purpose**: Process Slack events asynchronously

**Rate Limits**:

- 100 events per minute per organization

**Job Types**:

- `app_mention` - @bot mentions
- `direct_message` - DMs to bot
- `slash_command` - /nubabel commands (future)
- `interactive` - Button clicks (future)

**Key Functions**:

- `enqueueSlackEvent(data)` - Add event to queue
- `getPendingSlackEvents(orgId)` - Get active jobs

### 3. `src/queue/orchestration.queue.ts` (159 LOC)

**Purpose**: Process AI orchestration requests

**Rate Limits**:

- 20 orchestrations per minute per organization
- 5 minute timeout per job (for long LLM calls)

**Features**:

- Progress tracking (via SSE - TODO #141)
- Job cancellation support
- Cost tracking per organization
- Priority: Slack (1) > Web (10)

**Key Functions**:

- `enqueueOrchestration(data)` - Add orchestration job
- `cancelOrchestration(jobId)` - Cancel running job
- `getOrchestrationStatus(jobId)` - Get job state
- `getOrchestrationMetrics(orgId)` - Success rate, avg duration

### 4. `src/queue/notification.queue.ts` (132 LOC)

**Purpose**: Deliver notifications to users

**Rate Limits**:

- 200 notifications per minute

**Notification Types**:

- `slack_thread` - Thread replies (priority 1)
- `slack_dm` - Direct messages (priority 5)
- `email` - Email notifications (future)
- `webhook` - Webhook callbacks (future)

**Features**:

- 5 retry attempts (more than other queues for transient failures)
- Rich content support (Slack Block Kit)

**Key Functions**:

- `sendNotification(data)` - Generic sender
- `sendSlackThreadReply()` - Convenience for Slack threads
- `sendSlackDM()` - Convenience for Slack DMs

### 5. `src/queue/dead-letter.queue.ts` (113 LOC)

**Purpose**: Store failed jobs for manual retry

**Features**:

- Never auto-remove jobs (infinite retention)
- Track original queue, job ID, failure reason
- Per-organization filtering
- Retry capability

**Key Functions**:

- `moveToDLQ(job, queue, reason)` - Move failed job to DLQ
- `getFailedJobsByOrganization(orgId)` - Get failures
- `retryFromDLQ(dlqJobId)` - Retry failed job
- `getDLQMetrics(orgId?)` - Failure analytics

### 6. `src/queue/bull-board.ts` (22 LOC)

**Purpose**: Web UI for queue monitoring

**URL**: `/admin/queues` (requires authentication)

**Features**:

- Real-time queue metrics
- Job inspection (data, logs, errors)
- Job retry/delete actions
- Per-queue filtering

**Queues Monitored**:

1. slack-events
2. orchestration
3. notifications
4. dead-letter

### 7. `src/queue/index.ts` (6 LOC)

**Purpose**: Central export point

---

## Integration

### Main Server (`src/index.ts`)

```typescript
import { bullBoardAdapter } from "./queue/bull-board";

app.use("/admin/queues", authenticate, bullBoardAdapter.getRouter());
```

**Access**: `http://localhost:3000/admin/queues`

---

## Configuration

### Environment Variables Required

```bash
REDIS_URL=redis://localhost:6379  # BullMQ requires Redis
```

### Rate Limits (Configurable)

```typescript
// src/queue/base.queue.ts
export const defaultRateLimits = {
  "slack-events": { max: 100, duration: 60000 }, // 100/min
  orchestration: { max: 20, duration: 60000 }, // 20/min
  notifications: { max: 200, duration: 60000 }, // 200/min
};
```

### Retry Strategy

```typescript
// Default for all queues
attempts: 3
backoff: exponential with jitter
  - Attempt 1: ~1s delay
  - Attempt 2: ~2s delay
  - Attempt 3: ~4s delay
  - After 3 failures → Move to DLQ
```

---

## Next Steps

### Workers (TODO #121-128)

Need to implement worker processes to consume jobs:

1. **SlackEventWorker** (`src/workers/slack-event.worker.ts`)
   - Listen to `slack-events` queue
   - Extract event data
   - Enqueue to `orchestration` queue
   - Send immediate acknowledgment to Slack

2. **OrchestrationWorker** (`src/workers/orchestration.worker.ts`)
   - Listen to `orchestration` queue
   - Call `delegate_task()` from OhMyOpenCode
   - Update job progress (for SSE)
   - Enqueue result to `notifications` queue

3. **NotificationWorker** (`src/workers/notification.worker.ts`)
   - Listen to `notifications` queue
   - Send messages via Slack API
   - Handle Slack rate limits
   - Retry on transient failures

### Example Worker Pattern

```typescript
// src/workers/slack-event.worker.ts
import { Worker } from "bullmq";
import { slackEventQueue, enqueueOrchestration } from "../queue";

const worker = new Worker("slack-events", async (job) => {
  const { userRequest, organizationId, userId, channelId, threadTs } = job.data;

  const orchestrationJobId = await enqueueOrchestration({
    organizationId,
    userId,
    sessionId: `slack-${threadTs}`,
    userRequest,
    metadata: { source: "slack", channelId, threadTs },
  });

  return { orchestrationJobId };
});

worker.on("completed", (job) => {
  console.log(`Slack event processed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`Slack event failed: ${job?.id}`, err);
});
```

---

## Testing

### Manual Testing

```bash
# Start server
npm run dev

# Access Bull Board
open http://localhost:3000/admin/queues

# Test queue enqueue (from Node REPL or test script)
import { enqueueSlackEvent } from "./src/queue";

await enqueueSlackEvent({
  eventType: "app_mention",
  organizationId: "...",
  userId: "...",
  slackUserId: "U12345",
  slackWorkspaceId: "T12345",
  channelId: "C12345",
  text: "Hello bot!",
  event: { ts: "1234567890.123456" },
});

# Check Bull Board - job should appear in "Waiting" state
```

### Automated Testing (Future)

- Unit tests for queue functions
- Integration tests with Redis
- E2E tests with workers

---

## Performance Metrics

### Expected Latency

- **Enqueue**: <10ms (in-memory operation)
- **Processing start**: <1s (worker pickup)
- **Total (Slack → Response)**: <100ms (acknowledgment) + 30s-5min (orchestration)

### Capacity

- **Slack Events**: 100 events/min/org = 6,000/hour/org
- **Orchestration**: 20 tasks/min/org = 1,200/hour/org
- **Notifications**: 200 msgs/min/org = 12,000/hour/org

### Redis Memory Usage

- **Per Job**: ~1KB (serialized JSON)
- **1,000 jobs**: ~1MB
- **100,000 jobs**: ~100MB

---

## Monitoring

### Bull Board Metrics

- Queue length (waiting, active, completed, failed, delayed)
- Job throughput (jobs/sec)
- Job latency (enqueue → process → complete)
- Failure rate

### Custom Metrics (Future - TODO #193-195)

```typescript
// src/utils/metrics.ts
metrics.increment("queue.enqueued", { queue: "slack-events" });
metrics.increment("queue.processed", { queue: "slack-events" });
metrics.increment("queue.failed", { queue: "slack-events" });
metrics.timing("queue.latency", duration, { queue: "slack-events" });
```

---

## Known Limitations

### Current

1. **No workers yet** - Jobs enqueue but don't process (TODO #121-128)
2. **No SSE integration** - Can't send real-time updates (TODO #141-148)
3. **No Prometheus metrics** - Only Bull Board UI (TODO #193)

### Design Constraints

1. **BullMQ requires Redis** - Can't use without Redis
2. **Single Redis instance** - No Redis Cluster yet (TODO #019)
3. **In-process workers** - Workers run in same process as server (could separate later)

---

## References

### Documentation

- [BullMQ Official Docs](https://docs.bullmq.io/)
- [Bull Board GitHub](https://github.com/felixmosh/bull-board)
- [Research: `research/technical-deep-dive/04-slack-integration-patterns.md`](../research/technical-deep-dive/04-slack-integration-patterns.md)

### Related Files

- `src/orchestrator/index.ts` - Orchestration logic (will call queue)
- `src/api/slack.ts` - Slack Bot (will use queue)
- `src/utils/logger.ts` - Structured logging
- `src/utils/metrics.ts` - Metrics collection

---

## Completion Summary

**TODO Items Completed**: 10/10 (#021-030)

✅ #021 - Install BullMQ package  
✅ #022 - Create queue directory structure  
✅ #023 - Implement SlackEventQueue  
✅ #024 - Implement OrchestrationQueue  
✅ #025 - Implement NotificationQueue  
✅ #026 - Configure exponential backoff with jitter  
✅ #027 - Set up dead letter queue (DLQ)  
✅ #028 - Implement rate limiting (per organization)  
✅ #029 - Install Bull Board UI  
✅ #030 - Configure queue monitoring dashboard

**Total Time**: ~30 minutes  
**Total Code**: 652 lines  
**Build Status**: ✅ Passing (0 TypeScript errors)  
**Ready for**: Worker implementation (TODO #121-128)
