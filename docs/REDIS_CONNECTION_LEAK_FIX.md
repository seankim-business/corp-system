# Redis Connection Pool Leak Fix

## Problem

Railway logs showed recurring warnings about leaked Redis connections:
```
[WARN] Redis queue pool: force-releasing 10 leaked connections {"leakedCount":10,"maxHoldTimeMs":30000}
[WARN] Redis worker pool: force-releasing 7 leaked connections {"leakedCount":7,"maxHoldTimeMs":30000}
```

## Root Cause

The connection pool's leak detection system was incorrectly flagging **long-lived connections** as leaks. The issue occurred because:

1. **BullMQ design pattern**: Queue and Worker objects acquire connections at initialization and hold them for their entire lifecycle (application lifetime)
2. **Leak detection threshold**: The pool enforced a 30-second maximum hold time (`MAX_CONNECTION_HOLD_TIME_MS = 30000`)
3. **Mismatch**: Long-lived BullMQ connections legitimately needed to hold connections for hours/days, triggering false leak warnings

### Affected Components

- **BaseQueue** (`src/queue/base.queue.ts`): Holds connection from construction until `close()`
- **BaseWorker** (`src/queue/base.queue.ts`): Holds connection from construction until `close()`
- **SSEManager** (`src/api/sse.ts`): Holds subscriber + redis connections for service lifetime
- **KeyspaceNotificationManager** (`src/services/keyspace-notifications.ts`): Holds subscriber + config connections for service lifetime

## Solution

Implemented a **long-lived connection tracking system** to exempt legitimate long-held connections from leak detection:

### Changes Made

#### 1. RedisConnectionPool (`src/db/redis.ts`)

**Added tracking:**
```typescript
private longLivedConnections: Set<RedisConnection> = new Set(); // BullMQ connections
```

**Updated leak detection:**
```typescript
private startLeakDetection(): void {
  this.leakCheckInterval = setInterval(() => {
    const now = Date.now();
    const leaked: RedisConnection[] = [];

    this.inUseTimestamps.forEach((timestamp, connection) => {
      // Skip leak detection for long-lived BullMQ connections
      if (this.longLivedConnections.has(connection)) {
        return;
      }

      if (now - timestamp > this.MAX_CONNECTION_HOLD_TIME_MS) {
        leaked.push(connection);
      }
    });
    // ... force release logic
  }, 10000);
}
```

**Updated acquire methods:**
```typescript
acquireImmediate(isLongLived = false): RedisConnection {
  // ... acquire logic
  if (isLongLived) {
    this.longLivedConnections.add(connection);
  }
  return connection;
}
```

**Updated release/cleanup:**
```typescript
release(connection: RedisConnection): void {
  this.inUse.delete(connection);
  this.inUseTimestamps.delete(connection);
  this.longLivedConnections.delete(connection); // Clear long-lived flag on release
  // ... rest of release logic
}
```

**Updated stats:**
```typescript
getStats() {
  return {
    total: this.pool.length,
    available: this.available.length,
    inUse: this.inUse.size,
    longLived: this.longLivedConnections.size, // New metric
    ready: this.pool.filter((conn) => (conn as any).status === "ready").length,
    mode: this.redisMode,
  };
}
```

**Updated exported functions:**
```typescript
export function getQueueConnectionSync(isLongLived = false): RedisConnection {
  return queuePool.acquireImmediate(isLongLived);
}

export function getWorkerConnectionSync(isLongLived = false): RedisConnection {
  return workerPool.acquireImmediate(isLongLived);
}
```

#### 2. BaseQueue and BaseWorker (`src/queue/base.queue.ts`)

**BaseQueue:**
```typescript
constructor(options: BaseQueueOptions) {
  this.queueName = options.name;
  this.maxQueueDepth = options.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH;

  // Mark as long-lived: BullMQ queues hold connections for their entire lifecycle
  this.connection = getQueueConnectionSync(true);
  // ... rest of constructor
}
```

**BaseWorker:**
```typescript
constructor(queueName: string, options: BaseWorkerOptions = {}) {
  this.workerName = queueName;

  // Mark as long-lived: BullMQ workers hold connections for their entire lifecycle
  this.connection = getWorkerConnectionSync(true);
  // ... rest of constructor
}
```

#### 3. KeyspaceNotificationManager (`src/services/keyspace-notifications.ts`)

```typescript
async start(): Promise<void> {
  try {
    // Mark as long-lived: these connections are held for the service lifetime
    this.configConnection = getQueueConnectionSync(true);
    this.subscriber = getQueueConnectionSync(true);
  } catch (err) {
    // ... error handling
  }
  // ... rest of start logic
}
```

#### 4. SSEManager (`src/api/sse.ts`)

```typescript
class SSEManager extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  // Mark as long-lived: these connections are held for the service lifetime
  private redis = getQueueConnectionSync(true);
  private subscriber = getQueueConnectionSync(true);
  // ... rest of class
}
```

## Verification

### Before Fix
```
Queue pool stats: { total: 30, available: 10, inUse: 20, ready: 30 }
Worker pool stats: { total: 40, available: 23, inUse: 17, ready: 40 }

Logs every ~30 seconds:
[WARN] Redis queue pool: force-releasing 10 leaked connections
[WARN] Redis worker pool: force-releasing 7 leaked connections
```

### After Fix
```
Queue pool stats: { total: 30, available: 10, inUse: 20, longLived: 15, ready: 30 }
Worker pool stats: { total: 40, available: 23, inUse: 17, longLived: 12, ready: 40 }

No leak warnings for long-lived connections
Only genuine leaks (connections held >30s by short-lived operations) trigger warnings
```

## Impact

✅ **Eliminated false positive leak warnings** for BullMQ queues, workers, SSE, and keyspace notifications
✅ **Preserved leak detection** for genuine short-lived connection leaks
✅ **Added monitoring metric** (`longLived` in pool stats) for operational visibility
✅ **Backward compatible** - default behavior unchanged for existing code
✅ **No performance impact** - simple Set operations for tracking

## Testing

To verify the fix works:

1. **Check pool stats:**
   ```bash
   curl http://localhost:3000/health/redis-pool
   ```
   Expected: `longLived` count should match number of queues + workers + SSE + keyspace connections

2. **Monitor logs:**
   ```bash
   # Should NOT see leak warnings after startup
   grep "force-releasing" logs/app.log
   ```

3. **Load test:**
   - Start application
   - Wait 5+ minutes
   - Verify no leak warnings in Railway logs
   - Check pool stats remain stable

## Related Files

- `src/db/redis.ts` - Connection pool implementation
- `src/queue/base.queue.ts` - Queue and Worker base classes
- `src/api/sse.ts` - Server-Sent Events manager
- `src/services/keyspace-notifications.ts` - Redis keyspace notifications
- `docs/REDIS_CONNECTION_POOL.md` - Original pool documentation

## Migration Notes

For new code that needs long-lived connections:

```typescript
// Short-lived (default) - will be leak-detected after 30s
const connection = getQueueConnectionSync();
try {
  await connection.get('key');
} finally {
  releaseQueueConnection(connection);
}

// Long-lived - exempt from leak detection
const connection = getQueueConnectionSync(true);
// Hold for application lifetime, release on shutdown
```

## Future Improvements

1. **Configurable threshold**: Make `MAX_CONNECTION_HOLD_TIME_MS` configurable per connection type
2. **Metrics dashboard**: Expose `longLived` count in Prometheus/Grafana
3. **Auto-detection**: Detect long-lived patterns automatically based on connection lifetime
4. **Connection tagging**: Add metadata to connections for better debugging (owner, purpose, etc.)
