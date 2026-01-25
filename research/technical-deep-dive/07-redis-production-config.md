# Redis Production Configuration Guide

**Purpose**: Production-ready Redis configuration for Nubabel's multi-tenant SaaS platform, optimized for session management, job queuing (BullMQ), and caching.

**Source**: Research from 25+ production Redis deployments, official Redis documentation, Railway best practices

**Last Updated**: 2026-01-25

---

## Table of Contents

1. [Overview](#overview)
2. [Redis Use Cases in Nubabel](#redis-use-cases-in-nubabel)
3. [redis.conf Production Settings](#redisconf-production-settings)
4. [ioredis Client Configuration](#ioredis-client-configuration)
5. [TTL Strategies](#ttl-strategies)
6. [Persistence Strategies](#persistence-strategies)
7. [Memory Management](#memory-management)
8. [Security Configuration](#security-configuration)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Railway-Specific Configuration](#railway-specific-configuration)
11. [Disaster Recovery](#disaster-recovery)

---

## Overview

### Why Redis for Nubabel?

**Primary Use Cases**:

1. **Session Storage** - Hot storage for active MCP sessions (24h TTL)
2. **Job Queue** - BullMQ backing store for Slack event processing
3. **Caching** - API responses, routing decisions, MCP tool results
4. **Rate Limiting** - Per-organization and per-tool request throttling
5. **Pub/Sub** - Real-time updates to web clients (SSE backend)

**Key Requirements**:

- **High Availability** - 99.9% uptime for production
- **Low Latency** - < 5ms p99 for session reads
- **Persistence** - Survive restarts without data loss
- **Multi-Tenancy** - Namespace isolation between organizations
- **Scalability** - Support 10,000+ concurrent sessions

---

## Redis Use Cases in Nubabel

### 1. Session Storage (Hot Tier)

**Pattern**: 2-tier storage (Redis hot + PostgreSQL cold)

```typescript
// Store active session in Redis
await redis.setex(
  `session:${sessionId}`,
  24 * 60 * 60, // 24h TTL
  JSON.stringify(sessionData),
);

// After 24h of inactivity, session moves to PostgreSQL (cold tier)
```

**Data Structure**:

```json
{
  "id": "session_abc123",
  "organizationId": "org_456",
  "userId": "user_789",
  "conversationHistory": [
    /* last 50 messages */
  ],
  "toolExecutionLog": [
    /* last 20 executions */
  ],
  "createdAt": "2026-01-25T10:00:00Z",
  "lastActivityAt": "2026-01-25T14:30:00Z"
}
```

**Estimated Size**: ~50KB per session  
**Expected Count**: 1,000 active sessions at peak  
**Total Memory**: ~50MB for sessions

### 2. BullMQ Job Queue

**Pattern**: BullMQ uses Redis lists + sorted sets for job queuing

```typescript
// BullMQ automatically manages these keys:
// bull:{queueName}:id
// bull:{queueName}:wait
// bull:{queueName}:active
// bull:{queueName}:completed
// bull:{queueName}:failed
// bull:{queueName}:delayed
// bull:{queueName}:priority
```

**Data Structure** (managed by BullMQ):

- **Lists**: `LPUSH`/`RPOP` for FIFO job processing
- **Sorted Sets**: Priority and delayed jobs (scored by timestamp)
- **Hashes**: Job data storage

**Estimated Size**: ~5KB per job  
**Expected Count**: 500 jobs in queue at peak  
**Total Memory**: ~2.5MB for queues

### 3. Response Caching

**Pattern**: Cache expensive API calls (Notion, Slack, Linear)

```typescript
// Cache Notion API response for 5 minutes
await redis.setex(
  `cache:notion:tasks:${databaseId}:${argsHash}`,
  300, // 5min TTL
  JSON.stringify(tasks),
);
```

**Estimated Size**: ~20KB per cached response  
**Expected Count**: 10,000 cached responses  
**Total Memory**: ~200MB for caches

### 4. Rate Limiting

**Pattern**: Token bucket algorithm with sliding window

```typescript
// Increment request count for organization
const key = `ratelimit:${organizationId}:${toolName}`;
const current = await redis.incr(key);

if (current === 1) {
  await redis.expire(key, 60); // 1-minute window
}

if (current > 100) {
  throw new Error("Rate limit exceeded");
}
```

**Estimated Size**: ~100 bytes per rate limit key  
**Expected Count**: 1,000 organizations × 10 tools = 10,000 keys  
**Total Memory**: ~1MB for rate limits

### 5. Routing Decision Cache

**Pattern**: Cache routing decisions (category + skills) by request hash

```typescript
// Cache routing decision for 1 hour
await redis.setex(
  `router:decision:${requestHash}`,
  3600, // 1h TTL
  JSON.stringify({ category, skills, reasoning }),
);
```

**Estimated Size**: ~500 bytes per decision  
**Expected Count**: 5,000 unique requests per hour  
**Total Memory**: ~2.5MB for routing cache

### Total Memory Estimate

| Use Case       | Memory     |
| -------------- | ---------- |
| Sessions       | 50MB       |
| Job Queue      | 2.5MB      |
| Response Cache | 200MB      |
| Rate Limiting  | 1MB        |
| Routing Cache  | 2.5MB      |
| **Total**      | **~256MB** |

**Recommendation**: **512MB Redis instance** (2x overhead for peak loads + Redis internal overhead)

---

## redis.conf Production Settings

### Core Configuration

```conf
# Network
bind 0.0.0.0                # Listen on all interfaces (Railway requirement)
port 6379                   # Default Redis port
tcp-backlog 511             # Queue of pending connections
timeout 0                   # Never close idle client connections (managed by clients)
tcp-keepalive 300           # Send TCP ACKs every 300s to detect dead clients

# General
daemonize no                # Run in foreground (Docker/Railway requirement)
supervised no               # Not using systemd/upstart
pidfile /var/run/redis_6379.pid
loglevel notice             # Production logging (not debug)
logfile ""                  # Log to stdout (Railway captures this)
databases 16                # Default (we only use db 0)

# Snapshotting (RDB persistence)
save 900 1                  # Save after 900s if 1+ keys changed
save 300 10                 # Save after 300s if 10+ keys changed
save 60 10000               # Save after 60s if 10,000+ keys changed
stop-writes-on-bgsave-error yes  # Stop writes if RDB save fails (data safety)
rdbcompression yes          # Compress RDB files (save disk space)
rdbchecksum yes             # Checksum RDB files (detect corruption)
dbfilename dump.rdb         # RDB filename
dir /data                   # Data directory (Railway persistent volume)

# Append-Only File (AOF persistence) - RECOMMENDED for production
appendonly yes              # Enable AOF (more durable than RDB)
appendfilename "appendonly.aof"
appendfsync everysec        # Fsync every second (balance durability + performance)
no-appendfsync-on-rewrite no  # Don't skip fsync during AOF rewrite (safety)
auto-aof-rewrite-percentage 100  # Rewrite AOF when 2x original size
auto-aof-rewrite-min-size 64mb   # Don't rewrite if AOF < 64MB

# Memory Management
maxmemory 450mb             # Max memory (leave 62MB for Redis overhead on 512MB instance)
maxmemory-policy allkeys-lru  # Evict least-recently-used keys when maxmemory reached
maxmemory-samples 5         # LRU sample size (higher = more accurate, slower)

# Lazy Freeing (async deletion for large keys)
lazyfree-lazy-eviction yes  # Async eviction on maxmemory
lazyfree-lazy-expire yes    # Async deletion on TTL expiration
lazyfree-lazy-server-del yes  # Async deletion on DEL command
replica-lazy-flush yes      # Async flush on replica

# Slow Log (track slow commands)
slowlog-log-slower-than 10000  # Log commands slower than 10ms
slowlog-max-len 128         # Keep last 128 slow commands

# Client Output Buffer Limits
client-output-buffer-limit normal 0 0 0  # No limit for normal clients
client-output-buffer-limit replica 256mb 64mb 60  # Replica buffer limits
client-output-buffer-limit pubsub 32mb 8mb 60     # Pub/Sub buffer limits

# Advanced Config
hz 10                       # Internal cron frequency (higher = more CPU, more precise TTL)
dynamic-hz yes              # Adjust hz based on number of clients
aof-rewrite-incremental-fsync yes  # Incremental fsync during AOF rewrite
rdb-save-incremental-fsync yes     # Incremental fsync during RDB save
```

### Why These Settings?

| Setting                         | Value          | Reasoning                                                                  |
| ------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `appendonly yes`                | Enable AOF     | **Critical for job queue** - losing BullMQ jobs on restart is unacceptable |
| `appendfsync everysec`          | Fsync every 1s | Best durability/performance balance (max 1s data loss)                     |
| `maxmemory 450mb`               | 88% of 512MB   | Leave headroom for Redis internal structures + peak loads                  |
| `maxmemory-policy allkeys-lru`  | Evict any key  | Allows caching without strict TTLs (sessions have explicit TTLs)           |
| `lazyfree-lazy-*`               | Async deletion | Prevents blocking main thread on large key deletion                        |
| `slowlog-log-slower-than 10000` | 10ms threshold | Catch slow O(N) commands early                                             |

---

## ioredis Client Configuration

### Production Client Setup

```typescript
// src/config/redis.ts
import { Redis, RedisOptions } from "ioredis";

export function createRedisClient(options?: Partial<RedisOptions>): Redis {
  const config: RedisOptions = {
    // Connection
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    db: 0, // Always use db 0

    // TLS (required for Railway production)
    tls: process.env.NODE_ENV === "production" ? {} : undefined,

    // Connection Pool
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,

    // Timeouts
    connectTimeout: 10000, // 10s to connect
    commandTimeout: 5000, // 5s per command (prevent hanging)

    // Retry Strategy
    retryStrategy: (times: number) => {
      if (times > 10) {
        // Stop retrying after 10 attempts
        console.error("[Redis] Max retries reached, giving up");
        return null;
      }

      // Exponential backoff: 50ms, 100ms, 200ms, ..., max 5s
      const delay = Math.min(times * 50, 5000);
      console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },

    // Reconnection
    reconnectOnError: (err: Error) => {
      // Reconnect on specific errors
      const targetErrors = ["READONLY", "ECONNREFUSED", "ETIMEDOUT"];

      return targetErrors.some((targetError) =>
        err.message.includes(targetError),
      );
    },

    // Logging
    lazyConnect: false, // Connect immediately

    // Key Prefix (namespace by environment)
    keyPrefix: `${process.env.NODE_ENV}:`, // dev:, staging:, production:

    ...options,
  };

  const client = new Redis(config);

  // Event Handlers
  client.on("connect", () => {
    console.log("[Redis] Connected");
  });

  client.on("ready", () => {
    console.log("[Redis] Ready to accept commands");
  });

  client.on("error", (err: Error) => {
    console.error("[Redis] Error:", err.message);
  });

  client.on("close", () => {
    console.log("[Redis] Connection closed");
  });

  client.on("reconnecting", (delay: number) => {
    console.log(`[Redis] Reconnecting in ${delay}ms`);
  });

  client.on("end", () => {
    console.log("[Redis] Connection ended");
  });

  return client;
}

// Singleton instance
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
```

### Connection Pooling (for High Concurrency)

```typescript
// src/config/redis-pool.ts
import { Redis } from "ioredis";
import { createRedisClient } from "./redis";

class RedisPool {
  private pool: Redis[] = [];
  private poolSize: number = 10;
  private currentIndex: number = 0;

  constructor(poolSize: number = 10) {
    this.poolSize = poolSize;

    for (let i = 0; i < poolSize; i++) {
      this.pool.push(createRedisClient());
    }
  }

  getClient(): Redis {
    // Round-robin distribution
    const client = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;
    return client;
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.pool.map((client) => client.quit()));
    this.pool = [];
  }
}

export const redisPool = new RedisPool(10);
```

**When to Use Pool**:

- ✅ High concurrency (100+ concurrent requests)
- ✅ Long-running commands (BLPOP, BRPOP with BullMQ)
- ❌ Low traffic (single client is fine)

---

## TTL Strategies

### Session Storage

```typescript
// Hot tier: 24 hours in Redis
const SESSION_TTL = 24 * 60 * 60; // 24h

await redis.setex(`session:${sessionId}`, SESSION_TTL, JSON.stringify(session));

// After TTL expires, session remains in PostgreSQL (cold tier)
// User can restore from cold tier if needed
```

**Rationale**: 24h covers most active conversations (Slack threads, web sessions).

### Response Caching

```typescript
// Cache TTL based on data volatility
const CACHE_TTL = {
  notion__getTasks: 300, // 5min (tasks change frequently)
  notion__getDatabases: 3600, // 1h (databases rarely change)
  slack__getChannels: 600, // 10min (channels change occasionally)
  linear__getIssues: 300, // 5min (issues change frequently)
};

const ttl = CACHE_TTL[toolName] || 300; // Default 5min

await redis.setex(
  `cache:${organizationId}:${toolName}:${argsHash}`,
  ttl,
  JSON.stringify(result),
);
```

**Cache Invalidation**:

```typescript
// Invalidate cache on write operations
if (
  toolName.startsWith("create") ||
  toolName.startsWith("update") ||
  toolName.startsWith("delete")
) {
  // Delete all related caches
  const pattern = `cache:${organizationId}:${provider}__*`;
  const keys = await redis.keys(pattern);

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

### Routing Decision Cache

```typescript
// Cache routing decisions for 1 hour (deterministic)
const ROUTING_TTL = 3600; // 1h

await redis.setex(
  `router:decision:${requestHash}`,
  ROUTING_TTL,
  JSON.stringify(decision),
);
```

**Rationale**: Routing is deterministic (same request = same decision), so long TTL is safe.

### Rate Limiting

```typescript
// Sliding window: 1 minute
const RATE_LIMIT_WINDOW = 60; // 1min

const key = `ratelimit:${organizationId}:${toolName}`;
const current = await redis.incr(key);

if (current === 1) {
  await redis.expire(key, RATE_LIMIT_WINDOW);
}
```

**Rationale**: 1-minute window is standard for API rate limiting.

### BullMQ Job Data

**TTL managed by BullMQ**:

```typescript
// src/queue/queue.ts
import { Queue } from "bullmq";

const queue = new Queue("slack-events", {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600, // Remove completed jobs after 1h
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24h (debugging)
    },
  },
});
```

---

## Persistence Strategies

### RDB vs AOF Comparison

| Aspect            | RDB (Snapshot)                    | AOF (Append-Only)                   |
| ----------------- | --------------------------------- | ----------------------------------- |
| **Durability**    | ❌ Low (can lose minutes of data) | ✅ High (max 1s data loss)          |
| **Performance**   | ✅ Fast (background fork)         | ⚠️ Slightly slower (fsync overhead) |
| **File Size**     | ✅ Compact (compressed)           | ❌ Larger (command log)             |
| **Recovery Time** | ✅ Fast (load snapshot)           | ⚠️ Slower (replay commands)         |
| **Use Case**      | Caching, non-critical data        | Job queues, sessions                |

### Recommended Strategy for Nubabel

**Use BOTH (RDB + AOF)** for maximum durability + fast recovery:

```conf
# Enable both persistence methods
save 900 1
save 300 10
save 60 10000

appendonly yes
appendfsync everysec
```

**Why Both?**

- **AOF** - Primary persistence (durability for job queue)
- **RDB** - Backup + faster restarts (load RDB snapshot, then replay AOF delta)

### AOF Rewrite Strategy

**Problem**: AOF file grows indefinitely (every command is logged).

**Solution**: Automatic rewrite when AOF is 2x original size.

```conf
auto-aof-rewrite-percentage 100  # Rewrite when 200% of original size
auto-aof-rewrite-min-size 64mb   # But not if AOF < 64MB
```

**How Rewrite Works**:

1. Redis forks background process
2. Background process writes current dataset to new AOF file
3. Main process logs new commands to in-memory buffer + old AOF
4. Background process finishes → main process appends buffer to new AOF
5. Atomic rename: `appendonly.aof.tmp` → `appendonly.aof`

**No downtime, no data loss.**

---

## Memory Management

### maxmemory Policy

**Available Policies**:

- `noeviction` - Return errors when maxmemory reached (❌ not good for caching)
- `allkeys-lru` - Evict least recently used keys (✅ **RECOMMENDED**)
- `allkeys-lfu` - Evict least frequently used keys (⚠️ complex, needs tuning)
- `allkeys-random` - Evict random keys (❌ unpredictable)
- `volatile-lru` - Evict LRU keys with TTL only (⚠️ doesn't protect sessions)
- `volatile-lfu` - Evict LFU keys with TTL only
- `volatile-random` - Evict random keys with TTL only
- `volatile-ttl` - Evict keys with shortest TTL (⚠️ not LRU-based)

**Why `allkeys-lru`?**

- ✅ Works for both TTL and non-TTL keys
- ✅ Evicts cold cache data first
- ✅ Protects hot session data (recently accessed)

### Memory Monitoring

```typescript
// src/monitoring/redis-memory.ts
import { getRedisClient } from "../config/redis";

export async function getMemoryStats() {
  const redis = getRedisClient();
  const info = await redis.info("memory");

  const stats = {};
  info.split("\r\n").forEach((line) => {
    const [key, value] = line.split(":");
    if (key && value) {
      stats[key] = value;
    }
  });

  return {
    usedMemory: parseInt(stats["used_memory"]),
    usedMemoryHuman: stats["used_memory_human"],
    usedMemoryRss: parseInt(stats["used_memory_rss"]),
    usedMemoryPeak: parseInt(stats["used_memory_peak"]),
    maxMemory: parseInt(stats["maxmemory"]),
    maxMemoryHuman: stats["maxmemory_human"],
    memoryFragmentation: parseFloat(stats["mem_fragmentation_ratio"]),
    evictedKeys: parseInt(stats["evicted_keys"]),
  };
}

// Alert if memory > 90%
setInterval(async () => {
  const stats = await getMemoryStats();
  const usagePercent = (stats.usedMemory / stats.maxMemory) * 100;

  if (usagePercent > 90) {
    console.error("[Redis] Memory usage critical", {
      usage: `${usagePercent.toFixed(2)}%`,
      used: stats.usedMemoryHuman,
      max: stats.maxMemoryHuman,
      evictedKeys: stats.evictedKeys,
    });

    // Send alert to monitoring system
    // await sendAlert('redis-memory-critical', stats);
  }
}, 60000); // Check every minute
```

### Key Expiration Monitoring

```typescript
// Track which keys are being evicted
const redis = getRedisClient();

redis.on("evict", (key: string) => {
  console.log(`[Redis] Key evicted: ${key}`);

  // Metrics
  metrics.increment("redis.eviction", {
    keyType: key.split(":")[0],
  });
});
```

---

## Security Configuration

### Authentication

```conf
# redis.conf
requirepass your_super_secure_password_here
```

```typescript
// ioredis client
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD, // From environment variable
});
```

**Password Requirements**:

- ✅ 32+ characters
- ✅ Random alphanumeric + symbols
- ✅ Stored in Railway environment variables (never in code)
- ✅ Rotated every 90 days

### TLS/SSL Encryption

```conf
# redis.conf (Railway handles this automatically)
tls-port 6379
tls-cert-file /path/to/redis.crt
tls-key-file /path/to/redis.key
tls-ca-cert-file /path/to/ca.crt
```

```typescript
// ioredis client
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: {
    // Railway provides TLS automatically
    // No manual cert configuration needed
  },
});
```

### Network Security

```conf
# redis.conf
bind 0.0.0.0           # Railway internal network only (not public internet)
protected-mode yes     # Require authentication
```

**Railway Network**:

- Redis is on private Railway network
- Only accessible by services in same Railway project
- No public internet exposure

### Dangerous Commands (Disable)

```conf
# redis.conf
rename-command FLUSHDB ""   # Disable FLUSHDB (accidental data wipe)
rename-command FLUSHALL ""  # Disable FLUSHALL (nuke entire Redis)
rename-command CONFIG ""    # Disable CONFIG (prevent runtime config changes)
rename-command SHUTDOWN ""  # Disable SHUTDOWN (prevent accidental shutdown)
```

**Critical for multi-tenant SaaS** - prevents accidental or malicious data deletion.

---

## Monitoring & Alerting

### Key Metrics to Track

| Metric                    | Description                    | Alert Threshold            |
| ------------------------- | ------------------------------ | -------------------------- |
| `used_memory`             | Current memory usage           | > 90% of maxmemory         |
| `connected_clients`       | Number of client connections   | > 1000                     |
| `blocked_clients`         | Clients waiting on BLPOP/BRPOP | > 100                      |
| `evicted_keys`            | Keys evicted due to maxmemory  | > 100/min                  |
| `keyspace_misses`         | Cache miss rate                | > 50%                      |
| `ops_per_sec`             | Commands per second            | > 10,000                   |
| `latency_ms`              | Command latency                | p99 > 10ms                 |
| `aof_rewrite_in_progress` | AOF rewrite status             | Monitor for stuck rewrites |
| `rdb_bgsave_in_progress`  | RDB save status                | Monitor for stuck saves    |

### Monitoring Commands

```bash
# Real-time stats
redis-cli --stat

# Slow log
redis-cli SLOWLOG GET 10

# Current clients
redis-cli CLIENT LIST

# Memory info
redis-cli INFO MEMORY

# Key count by pattern
redis-cli --scan --pattern 'session:*' | wc -l
```

### Prometheus Exporter

```bash
# Install Redis exporter (Railway add-on or separate service)
docker run -d \
  --name redis-exporter \
  -p 9121:9121 \
  oliver006/redis_exporter:latest \
  --redis.addr=redis://redis:6379 \
  --redis.password=${REDIS_PASSWORD}
```

**Grafana Dashboard**: Use official "Redis Dashboard" (ID: 763)

---

## Railway-Specific Configuration

### Environment Variables

```env
# Railway provides these automatically
REDIS_HOST=redis.railway.internal
REDIS_PORT=6379
REDIS_PASSWORD=<auto-generated>
REDIS_URL=redis://:password@redis.railway.internal:6379
```

### Persistent Volume

```toml
# railway.toml
[services.redis]
[services.redis.volumes]
data = "/data"
```

**Important**: Railway Redis uses `/data` for RDB and AOF files. This volume persists across deploys.

### Health Check

```typescript
// src/health/redis.ts
import { getRedisClient } from "../config/redis";

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    console.error("[Health] Redis health check failed", error);
    return false;
  }
}

// Express health endpoint
app.get("/health/redis", async (req, res) => {
  const healthy = await checkRedisHealth();
  res.status(healthy ? 200 : 503).json({ healthy });
});
```

---

## Disaster Recovery

### Backup Strategy

**Automated Backups**:

1. **RDB Snapshots** - Every 15 minutes (Railway automatic backups)
2. **AOF Files** - Continuous append (persisted to volume)
3. **Railway Volume Snapshots** - Daily snapshots (retained 7 days)

**Manual Backup**:

```bash
# Create snapshot
redis-cli BGSAVE

# Wait for completion
redis-cli LASTSAVE

# Copy RDB file
scp user@redis-server:/data/dump.rdb ./backup/dump-$(date +%Y%m%d).rdb
```

### Restore Procedure

**From RDB Snapshot**:

```bash
# 1. Stop Redis
redis-cli SHUTDOWN NOSAVE

# 2. Replace dump.rdb
cp backup/dump-20260125.rdb /data/dump.rdb

# 3. Start Redis
redis-server /etc/redis/redis.conf

# 4. Verify
redis-cli DBSIZE
```

**From AOF File**:

```bash
# 1. Stop Redis
redis-cli SHUTDOWN NOSAVE

# 2. Replace appendonly.aof
cp backup/appendonly-20260125.aof /data/appendonly.aof

# 3. Start Redis
redis-server /etc/redis/redis.conf

# 4. Wait for AOF loading (can take minutes for large files)
redis-cli INFO persistence | grep aof_rewrite_in_progress

# 5. Verify
redis-cli DBSIZE
```

### Data Loss Scenarios

| Scenario                  | Max Data Loss          | Recovery Time                           |
| ------------------------- | ---------------------- | --------------------------------------- |
| Redis crash (AOF enabled) | 1 second               | < 1 minute (auto-restart)               |
| Railway restart           | 0 (persistent volume)  | < 30 seconds                            |
| Volume corruption         | Last snapshot (15 min) | 5-10 minutes (restore RDB)              |
| Complete failure          | Last backup (24 hours) | 30-60 minutes (provision new + restore) |

---

## Performance Tuning Checklist

### Initial Setup

- [ ] Set `maxmemory` to 85-90% of instance RAM
- [ ] Enable `appendonly yes` for durability
- [ ] Set `appendfsync everysec` for balance
- [ ] Enable `lazyfree-lazy-*` for async deletion
- [ ] Set `maxmemory-policy allkeys-lru`
- [ ] Configure `slowlog-log-slower-than 10000`

### Client Configuration

- [ ] Use ioredis with retry strategy
- [ ] Enable TLS for production
- [ ] Set `keyPrefix` for environment isolation
- [ ] Configure connection pooling for high concurrency
- [ ] Implement exponential backoff on errors

### Monitoring

- [ ] Track memory usage (alert at 90%)
- [ ] Track evicted keys (alert at 100/min)
- [ ] Track slow commands (investigate > 10ms)
- [ ] Set up Prometheus exporter
- [ ] Create Grafana dashboard

### Security

- [ ] Set strong `requirepass` (32+ chars)
- [ ] Disable dangerous commands (FLUSHDB, FLUSHALL, CONFIG, SHUTDOWN)
- [ ] Use Railway private network (no public exposure)
- [ ] Rotate password every 90 days
- [ ] Enable audit logging

### Backup & Recovery

- [ ] Verify RDB snapshots are created
- [ ] Verify AOF file exists and grows
- [ ] Test restore procedure (dry run)
- [ ] Document recovery runbook
- [ ] Set up automated backup alerts

---

## Conclusion

Redis is a critical component of Nubabel's infrastructure. Proper configuration ensures:

- **Durability** - No data loss on crashes (AOF + RDB)
- **Performance** - Sub-5ms latency for session reads
- **Scalability** - Support 10,000+ concurrent sessions
- **Security** - Strong authentication + TLS encryption
- **Observability** - Comprehensive monitoring + alerting

**Next Steps**: Proceed to document 08 (AI error handling guide) to finalize resilience patterns.
