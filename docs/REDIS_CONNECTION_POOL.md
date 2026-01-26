# Redis Connection Pool

## Overview

Nubabel now uses a production-grade Redis connection pooling system powered by **ioredis**. Two independent pools are maintained to isolate workloads and prevent noisy-neighbor effects:

- **Queue Pool**: Used for queue operations (BullMQ queues, caching, and general Redis operations).
- **Worker Pool**: Used for worker operations (BullMQ workers and long-running Redis usage).

Each pool maintains minimum/maximum connections, health monitoring, and automatic recycling when connections drop.

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────┐
│  Queue Pool (min 5/max10)│       │ Worker Pool (min5/max15) │
│  - Queue ops             │       │ - Worker ops             │
│  - General Redis helpers │       │ - Long-running workers   │
└──────────────────────────┘       └──────────────────────────┘
           │                                  │
           └──────────────┬───────────────────┘
                          ▼
                    Redis Server
```

## Configuration

Pool configuration is centralized in `src/db/redis.ts`:

```ts
const queuePool = new RedisConnectionPool({ min: 5, max: 10, acquireTimeoutMillis: 5000 }, "queue");

const workerPool = new RedisConnectionPool(
  { min: 5, max: 15, acquireTimeoutMillis: 10000 },
  "worker",
);
```

Connection options (TLS, password, retry strategy) are automatically derived from environment variables:

- `REDIS_URL`
- `REDIS_PASSWORD`
- `NODE_ENV` (used for key prefixing)

## Usage Examples

### Queue/Worker Connections

```ts
import { getQueueConnection, releaseQueueConnection } from "../db/redis";

const conn = await getQueueConnection();
try {
  await conn.set("my:key", "value");
} finally {
  releaseQueueConnection(conn);
}
```

### Safe Helper Wrapper (recommended)

```ts
import { withQueueConnection } from "../db/redis";

const value = await withQueueConnection((redis) => redis.get("cache:key"));
```

### BullMQ Integration

Queues and workers automatically pull from the appropriate pool:

```ts
import { getQueueConnectionSync, getWorkerConnectionSync } from "../db/redis";

new Queue("my-queue", { connection: getQueueConnectionSync() });
new Worker("my-queue", handler, { connection: getWorkerConnectionSync() });
```

## Health Monitoring

Pool stats are exposed via:

- **Endpoint**: `GET /health/redis-pool`
- **Prometheus Metric**: `redis_pool_size{pool="queue|worker", state="available|inUse"}`

The health endpoint returns **503** if either pool has no available connections.

## Automatic Recycling

Connections are recycled automatically when they emit `end` or `close` events. The pool refills itself to maintain the configured minimum size.

## Performance Characteristics

- Minimizes connection churn under concurrency
- Isolates worker traffic from queue operations
- Configured for 100+ concurrent requests
- Low-latency acquire with bounded pool size

## Troubleshooting

**Pool exhausted errors**

- Ensure connections are always released after use.
- Increase pool `max` if sustained concurrency is higher than expected.

**Health endpoint reports unhealthy**

- Check Redis connectivity and credentials.
- Confirm pool is not saturated (metrics show `available=0`).

**BullMQ workers not processing**

- Ensure worker pool connections are available.
- Verify Redis server availability via `/health/redis`.

**Connection flapping**

- Check TLS settings and network stability.
- Review retry logs for repeated failures.
