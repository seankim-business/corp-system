# Load Testing Strategy for Nubabel SaaS Platform

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Author:** Research compiled from k6, Artillery, BullMQ, and PostgreSQL documentation

---

## Executive Summary

This document provides a comprehensive load testing strategy for Nubabel's API, job queue (BullMQ), and database (PostgreSQL). Based on research from production implementations and official documentation, we recommend **k6** as the primary load testing tool due to its developer-friendly scripting, excellent CI/CD integration, and superior performance metrics.

**Key Recommendations:**
- **Tool:** k6 (with Artillery as secondary for specific scenarios)
- **CI/CD:** GitHub Actions integration
- **Database:** pgbench for PostgreSQL baseline + custom k6 tests
- **Queue:** BullMQ performance monitoring with Redis metrics
- **Target Metrics:** p95 < 200ms, p99 < 500ms, error rate < 0.1%

---

## 1. Load Testing Tool Comparison

### 1.1 Tool Feature Matrix

| Feature | k6 | Artillery | JMeter | Locust |
|---------|-----|-----------|--------|--------|
| **Scripting Language** | JavaScript (ES6+) | YAML/JavaScript | GUI/XML | Python |
| **Performance** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Good |
| **Developer Experience** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good | ⭐⭐ Poor | ⭐⭐⭐⭐ Good |
| **CI/CD Integration** | ⭐⭐⭐⭐⭐ Native | ⭐⭐⭐⭐ Good | ⭐⭐⭐ Moderate | ⭐⭐⭐ Moderate |
| **Distributed Load** | ✅ Cloud/K8s | ✅ AWS Lambda/Fargate | ✅ Manual | ✅ Manual |
| **Real-time Metrics** | ✅ Built-in | ✅ Built-in | ⚠️ Limited | ✅ Web UI |
| **Protocol Support** | HTTP/2, WebSocket, gRPC | HTTP, WebSocket, Socket.IO | Everything | HTTP, WebSocket |
| **Learning Curve** | Low | Low | High | Low-Medium |
| **Cost** | Free (OSS) + Cloud | Free (OSS) + Pro | Free (OSS) | Free (OSS) |

**Source:** [Medium: k6 vs Artillery vs Locust comparison (Jan 2026)](https://medium.com/@sohail_saifi/load-testing-your-api-k6-vs-artillery-vs-locust-66a8d7f575bd)

### 1.2 Recommendation: k6

**Why k6 wins for Nubabel:**

1. **Developer-Friendly Scripting**
   - Modern JavaScript (ES6+) - familiar to your team
   - TypeScript support for type safety
   - Modular test organization
   - Easy to version control

2. **Superior CI/CD Integration**
   - Official GitHub Actions: `grafana/setup-k6-action` and `grafana/run-k6-action`
   - Built-in threshold checks (fail builds on SLO violations)
   - JSON/HTML reports for artifacts
   - Railway deployment compatible

3. **Performance & Scalability**
   - Written in Go - minimal resource overhead
   - Can generate 30,000+ RPS from a single machine
   - Distributed execution on Kubernetes
   - Cloud execution via Grafana Cloud k6

4. **Metrics & Observability**
   - Built-in metrics: p50, p95, p99, throughput, error rate
   - Custom metrics support
   - Export to Prometheus, Datadog, New Relic
   - Real-time web dashboard

**Evidence:** n8n (workflow automation platform similar to Nubabel) uses k6 for their API benchmarks:
- [n8n k6 benchmark scripts](https://github.com/n8n-io/n8n/tree/master/packages/@n8n/benchmark)

### 1.3 When to Use Artillery

Artillery excels in specific scenarios:

1. **Quick Prototyping** - YAML config is faster for simple tests
2. **Socket.IO Testing** - Better native support than k6
3. **Playwright Integration** - Browser-based load testing
4. **AWS Lambda** - Serverless distributed testing

**Use Case for Nubabel:** Artillery for Slack real-time event testing (Socket.IO-like patterns)

---

## 2. Realistic Load Profiles

### 2.1 Load Testing Types

Based on [k6 documentation](https://grafana.com/docs/k6/latest/testing-guides/test-types/):

#### Smoke Test (Sanity Check)
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 10 }, // 10 users for 1 minute
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};
```
**Purpose:** Verify system works under minimal load

#### Load Test (Average Traffic)
```javascript
export const options = {
  stages: [
    { duration: '5m', target: 100 },  // Ramp to 100 users
    { duration: '10m', target: 100 }, // Stay at 100 users
    { duration: '5m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.001'],
  },
};
```
**Purpose:** Validate performance under typical load

#### Stress Test (Find Breaking Point)
```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 400 },
    { duration: '5m', target: 800 },  // Push to failure
    { duration: '10m', target: 0 },   // Recovery
  ],
};
```
**Purpose:** Identify system limits and failure modes

#### Spike Test (Sudden Traffic Surge)
```javascript
export const options = {
  stages: [
    { duration: '10s', target: 100 },
    { duration: '1m', target: 1000 },  // 10x spike
    { duration: '10s', target: 100 },
    { duration: '3m', target: 100 },
  ],
};
```
**Purpose:** Test auto-scaling and error handling

#### Soak Test (Endurance)
```javascript
export const options = {
  stages: [
    { duration: '5m', target: 200 },
    { duration: '24h', target: 200 },  // 24-hour sustained load
    { duration: '5m', target: 0 },
  ],
};
```
**Purpose:** Detect memory leaks and resource exhaustion

### 2.2 Calculating Realistic User Counts

**Formula for Concurrent Users:**
```
Concurrent Users = (Requests per Second × Average Response Time) / Think Time

Example:
- Target: 1000 req/sec
- Avg response: 200ms (0.2s)
- Think time: 1s between requests

Concurrent Users = (1000 × 0.2) / 1 = 200 VUs
```

**Nubabel Baseline Estimates:**
- **100 users:** Small team testing (10-50 workflows/min)
- **1,000 users:** Medium organization (100-500 workflows/min)
- **10,000 users:** Enterprise scale (1000+ workflows/min)

---

## 3. API Endpoint Load Testing

### 3.1 k6 Test Script Structure

**File:** `tests/load/workflow-crud.test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const workflowCreateDuration = new Trend('workflow_create_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.1'],
    'workflow_create_duration': ['p(95)<300'],
  },
};

// Test data
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY;

export function setup() {
  // Authenticate and get token
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'test123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return { token: loginRes.json('token') };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // Test 1: Create Workflow
  const createPayload = JSON.stringify({
    name: `Test Workflow ${__VU}-${__ITER}`,
    description: 'Load test workflow',
    steps: [
      { type: 'http_request', url: 'https://api.example.com' },
      { type: 'transform', script: 'return data;' },
    ],
  });

  const createStart = Date.now();
  const createRes = http.post(
    `${BASE_URL}/api/workflows`,
    createPayload,
    { headers }
  );
  workflowCreateDuration.add(Date.now() - createStart);

  const createCheck = check(createRes, {
    'workflow created': (r) => r.status === 201,
    'has workflow id': (r) => r.json('id') !== undefined,
  });
  errorRate.add(!createCheck);

  const workflowId = createRes.json('id');
  sleep(1);

  // Test 2: Get Workflow
  const getRes = http.get(
    `${BASE_URL}/api/workflows/${workflowId}`,
    { headers }
  );

  check(getRes, {
    'workflow retrieved': (r) => r.status === 200,
    'correct workflow': (r) => r.json('id') === workflowId,
  });

  sleep(1);

  // Test 3: Update Workflow
  const updateRes = http.put(
    `${BASE_URL}/api/workflows/${workflowId}`,
    JSON.stringify({ name: 'Updated Workflow' }),
    { headers }
  );

  check(updateRes, {
    'workflow updated': (r) => r.status === 200,
  });

  sleep(1);

  // Test 4: Delete Workflow
  const deleteRes = http.del(
    `${BASE_URL}/api/workflows/${workflowId}`,
    null,
    { headers }
  );

  check(deleteRes, {
    'workflow deleted': (r) => r.status === 204,
  });

  sleep(2); // Think time between iterations
}

export function teardown(data) {
  // Cleanup if needed
}
```

**Evidence:** Based on [n8n's k6 benchmark patterns](https://github.com/n8n-io/n8n/blob/master/packages/@n8n/benchmark/scenarios/single-webhook/single-webhook.script.js)

### 3.2 MCP Tool Execution Test

**File:** `tests/load/mcp-tool-execution.test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    mcp_tool_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '1m', target: 50 },  // Ramp to 50 req/s
        { duration: '3m', target: 100 }, // Sustain 100 req/s
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{endpoint:mcp_execute}': ['p(95)<1000', 'p(99)<2000'],
    'http_req_failed{endpoint:mcp_execute}': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function() {
  const payload = JSON.stringify({
    tool: 'filesystem_read',
    arguments: {
      path: '/tmp/test.txt',
    },
  });

  const res = http.post(
    `${BASE_URL}/api/mcp/execute`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'mcp_execute' },
    }
  );

  check(res, {
    'tool executed': (r) => r.status === 200,
    'has result': (r) => r.json('result') !== undefined,
    'execution time acceptable': (r) => r.timings.duration < 2000,
  });

  sleep(0.5);
}
```

### 3.3 Slack Webhook Test (Artillery)

**File:** `tests/load/slack-webhooks.yml`

```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 20
      name: 'Sustained webhook load'
  plugins:
    metrics-by-endpoint:
      stripQueryString: true
  processor: './slack-webhook-helpers.js'

scenarios:
  - name: 'Slack Event Webhook'
    flow:
      - post:
          url: '/api/slack/events'
          json:
            type: 'event_callback'
            event:
              type: 'message'
              channel: 'C12345'
              user: 'U67890'
              text: 'Test message {{ $randomString() }}'
              ts: '{{ $timestamp() }}'
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: 'ok'
```

**Helper:** `tests/load/slack-webhook-helpers.js`

```javascript
module.exports = {
  $randomString: function(context, events, done) {
    context.vars.$randomString = Math.random().toString(36).substring(7);
    return done();
  },
  $timestamp: function(context, events, done) {
    context.vars.$timestamp = Date.now() / 1000;
    return done();
  },
};
```

### 3.4 SSE (Server-Sent Events) Test

**File:** `tests/load/sse-streaming.test.js`

```javascript
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  scenarios: {
    sse_connections: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function() {
  const res = http.get(`${BASE_URL}/api/workflows/stream`, {
    headers: {
      'Accept': 'text/event-stream',
    },
    timeout: '30s',
  });

  check(res, {
    'SSE connection established': (r) => r.status === 200,
    'content-type is SSE': (r) => r.headers['Content-Type'] === 'text/event-stream',
  });
}
```

---

## 4. Database Performance Testing

### 4.1 PostgreSQL Baseline with pgbench

**Purpose:** Establish database performance baseline before application load testing

**Installation:**
```bash
# pgbench comes with PostgreSQL
psql --version
```

**Initialize Test Database:**
```bash
# Create test database with scale factor 50 (50 * 100,000 rows)
pgbench -i -s 50 testdb

# Tables created:
# - pgbench_accounts (5,000,000 rows)
# - pgbench_branches (50 rows)
# - pgbench_tellers (500 rows)
# - pgbench_history (0 rows initially)
```

**Run Benchmark:**
```bash
# Test with 10 clients, 2 threads, 60 seconds
pgbench -c 10 -j 2 -T 60 -P 5 testdb

# Output:
# transaction type: <builtin: TPC-B (sort of)>
# scaling factor: 50
# query mode: simple
# number of clients: 10
# number of threads: 2
# duration: 60 s
# number of transactions actually processed: 45231
# latency average = 13.267 ms
# tps = 753.850000 (including connections establishing)
# tps = 754.123456 (excluding connections establishing)
```

**Custom SQL Test:**

**File:** `tests/db/workflow-queries.sql`

```sql
-- Simulate workflow query patterns
\set workflow_id random(1, 1000000)
\set user_id random(1, 10000)

BEGIN;

-- Read workflow
SELECT id, name, steps, created_at
FROM workflows
WHERE id = :workflow_id;

-- Read user's workflows
SELECT id, name, status
FROM workflows
WHERE user_id = :user_id
ORDER BY created_at DESC
LIMIT 10;

-- Update workflow status
UPDATE workflows
SET status = 'running', updated_at = NOW()
WHERE id = :workflow_id;

-- Insert execution log
INSERT INTO workflow_executions (workflow_id, status, started_at)
VALUES (:workflow_id, 'running', NOW());

COMMIT;
```

**Run Custom Benchmark:**
```bash
pgbench -c 50 -j 4 -T 300 -f tests/db/workflow-queries.sql -n testdb
```

**Evidence:** [PostgreSQL pgbench documentation](https://www.postgresql.org/docs/current/pgbench.html)

### 4.2 Connection Pool Testing

**Scenario:** Test PostgreSQL under connection pool saturation

**File:** `tests/load/db-connection-pool.test.js`

```javascript
import sql from 'k6/x/sql';
import { check } from 'k6';

const db = sql.open('postgres', __ENV.DATABASE_URL);

export const options = {
  scenarios: {
    pool_saturation: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 200 },  // Exceed pool size
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    'sql_query_duration': ['p(95)<100', 'p(99)<200'],
    'sql_connection_errors': ['rate<0.01'],
  },
};

export default function() {
  const result = sql.query(db, `
    SELECT id, name, status
    FROM workflows
    WHERE user_id = $1
    LIMIT 10
  `, Math.floor(Math.random() * 10000));

  check(result, {
    'query successful': (r) => r.length >= 0,
  });
}

export function teardown() {
  db.close();
}
```

**PostgreSQL Configuration for Testing:**

```ini
# postgresql.conf - Optimized for load testing

# Connection Settings
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings (for 16GB server)
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 16MB
maintenance_work_mem = 512MB

# Checkpoint Settings
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
wal_buffers = 16MB

# Query Planner
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200

# Logging (for performance analysis)
log_min_duration_statement = 100  # Log queries > 100ms
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Autovacuum (aggressive for high-write workloads)
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 10s
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02
```

**Evidence:** [PostgreSQL Performance Tuning Guide (Jan 2026)](https://www.pgedge.com/blog/postgresql-performance-tuning)

### 4.3 Query Performance Monitoring

**During Load Test:**

```sql
-- Monitor active queries
SELECT pid, usename, state, query_start, 
       now() - query_start AS duration,
       query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Check connection pool usage
SELECT COUNT(*) as total_connections,
       COUNT(*) FILTER (WHERE state = 'active') as active,
       COUNT(*) FILTER (WHERE state = 'idle') as idle,
       COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
FROM pg_stat_activity;

-- Identify slow queries
SELECT query, calls, total_exec_time, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table bloat
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
       n_live_tup, n_dead_tup,
       ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## 5. Job Queue Performance Testing

### 5.1 BullMQ Throughput Test

**File:** `tests/load/bullmq-throughput.test.js`

```javascript
import { Queue, Worker } from 'bullmq';
import { check, sleep } from 'k6';

const REDIS_URL = __ENV.REDIS_URL || 'redis://localhost:6379';

export const options = {
  scenarios: {
    job_producer: {
      executor: 'constant-arrival-rate',
      rate: 100,  // 100 jobs/sec
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    'job_enqueue_duration': ['p(95)<50', 'p(99)<100'],
    'job_enqueue_errors': ['rate<0.001'],
  },
};

let queue;

export function setup() {
  queue = new Queue('workflow-execution', {
    connection: { url: REDIS_URL },
  });
  return { queueName: 'workflow-execution' };
}

export default function(data) {
  const jobData = {
    workflowId: `wf-${__VU}-${__ITER}`,
    userId: Math.floor(Math.random() * 1000),
    steps: [
      { type: 'http', url: 'https://api.example.com' },
      { type: 'transform', script: 'return data;' },
    ],
  };

  const start = Date.now();
  
  try {
    const job = queue.add('execute-workflow', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    const duration = Date.now() - start;
    
    check(job, {
      'job enqueued': (j) => j.id !== undefined,
      'enqueue time acceptable': () => duration < 100,
    });

  } catch (error) {
    console.error('Job enqueue failed:', error);
  }

  sleep(0.01); // Small delay between jobs
}

export function teardown(data) {
  queue.close();
}
```

### 5.2 BullMQ Worker Performance

**File:** `tests/workers/benchmark-worker.js`

```javascript
const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
});

// Metrics tracking
let processedJobs = 0;
let failedJobs = 0;
let totalProcessingTime = 0;

const worker = new Worker(
  'workflow-execution',
  async (job) => {
    const startTime = Date.now();
    
    try {
      // Simulate workflow execution
      await simulateWorkflowExecution(job.data);
      
      const processingTime = Date.now() - startTime;
      totalProcessingTime += processingTime;
      processedJobs++;
      
      return { success: true, processingTime };
    } catch (error) {
      failedJobs++;
      throw error;
    }
  },
  {
    connection,
    concurrency: 10,  // Process 10 jobs concurrently
    limiter: {
      max: 100,       // Max 100 jobs
      duration: 1000, // per second
    },
  }
);

async function simulateWorkflowExecution(data) {
  // Simulate async work (API calls, transformations, etc.)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
}

// Metrics reporting
setInterval(() => {
  const avgProcessingTime = processedJobs > 0 
    ? (totalProcessingTime / processedJobs).toFixed(2)
    : 0;
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    processedJobs,
    failedJobs,
    avgProcessingTime,
    throughput: processedJobs / 60, // jobs per second (assuming 60s interval)
  }));
  
  // Reset counters
  processedJobs = 0;
  failedJobs = 0;
  totalProcessingTime = 0;
}, 60000);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

process.on('SIGTERM', async () => {
  await worker.close();
  connection.disconnect();
});
```

**Run Worker Benchmark:**
```bash
# Start 4 worker processes
for i in {1..4}; do
  node tests/workers/benchmark-worker.js &
done

# Monitor Redis
redis-cli --stat

# Monitor queue metrics
redis-cli INFO stats
redis-cli LLEN bull:workflow-execution:wait
redis-cli LLEN bull:workflow-execution:active
```

### 5.3 BullMQ Performance Baselines

**Evidence:** [BullMQ Benchmark Repository](https://github.com/taskforcesh/bullmq-bench)

**Expected Performance (Redis on SSD):**
- **Throughput:** 5,000-10,000 jobs/sec (single worker)
- **Latency:** p95 < 50ms (job enqueue)
- **Queue Depth:** Monitor `waiting` queue length
- **Worker Scaling:** Linear up to ~50 workers per Redis instance

**Optimization Tips:**
1. **Use Redis Cluster** for >10k jobs/sec
2. **Enable Pipelining** for batch job insertion
3. **Tune Worker Concurrency** based on job I/O vs CPU
4. **Monitor Memory** - Redis is in-memory

**Redis Configuration for BullMQ:**

```ini
# redis.conf - Optimized for BullMQ

# Memory
maxmemory 8gb
maxmemory-policy noeviction  # Don't evict job data

# Persistence (for job durability)
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

---

## 6. CI/CD Integration

### 6.1 GitHub Actions Workflow

**File:** `.github/workflows/load-test.yml`

```yaml
name: Load Testing

on:
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:
    inputs:
      test_type:
        description: 'Test type to run'
        required: true
        default: 'smoke'
        type: choice
        options:
          - smoke
          - load
          - stress
          - spike
          - soak

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' || github.event.inputs.test_type == 'smoke'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup k6
        uses: grafana/setup-k6-action@v1

      - name: Run smoke test
        uses: grafana/run-k6-action@v1
        with:
          path: tests/load/smoke-test.js
          flags: --out json=results.json
        env:
          API_BASE_URL: ${{ secrets.STAGING_API_URL }}
          API_KEY: ${{ secrets.STAGING_API_KEY }}

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: k6-smoke-results
          path: results.json

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('results.json'));
            
            const metrics = results.metrics;
            const comment = `
            ## 🚀 Load Test Results (Smoke)
            
            | Metric | Value | Threshold | Status |
            |--------|-------|-----------|--------|
            | p95 Latency | ${metrics.http_req_duration.values.p95.toFixed(2)}ms | <500ms | ${metrics.http_req_duration.values.p95 < 500 ? '✅' : '❌'} |
            | p99 Latency | ${metrics.http_req_duration.values.p99.toFixed(2)}ms | <1000ms | ${metrics.http_req_duration.values.p99 < 1000 ? '✅' : '❌'} |
            | Error Rate | ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}% | <1% | ${metrics.http_req_failed.values.rate < 0.01 ? '✅' : '❌'} |
            | Throughput | ${metrics.http_reqs.values.rate.toFixed(2)} req/s | - | ℹ️ |
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

  load-test:
    runs-on: ubuntu-latest
    if: github.event.inputs.test_type == 'load' || github.event_name == 'schedule'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup k6
        uses: grafana/setup-k6-action@v1

      - name: Run load test
        uses: grafana/run-k6-action@v1
        with:
          path: |
            tests/load/workflow-crud.test.js
            tests/load/mcp-tool-execution.test.js
          flags: --out json=results.json --out cloud
        env:
          API_BASE_URL: ${{ secrets.STAGING_API_URL }}
          K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}

      - name: Generate HTML report
        run: |
          docker run --rm -v $PWD:/app \
            grafana/k6-reporter:latest \
            /app/results.json \
            /app/report.html

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: k6-load-report
          path: |
            results.json
            report.html

  stress-test:
    runs-on: ubuntu-latest
    if: github.event.inputs.test_type == 'stress'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup k6
        uses: grafana/setup-k6-action@v1

      - name: Run stress test
        uses: grafana/run-k6-action@v1
        with:
          path: tests/load/stress-test.js
          flags: --out influxdb=http://influxdb:8086/k6
        env:
          API_BASE_URL: ${{ secrets.STAGING_API_URL }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚨 Stress test failed on ${{ github.ref }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Stress test failed. Check the logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

**Evidence:** [Grafana k6 GitHub Actions Guide](https://grafana.com/blog/performance-testing-with-grafana-k6-and-github-actions/)

### 6.2 Railway Deployment Integration

**File:** `.github/workflows/deploy-and-test.yml`

```yaml
name: Deploy to Railway and Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    outputs:
      deployment_url: ${{ steps.deploy.outputs.url }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to Railway
        id: deploy
        run: |
          # Railway CLI deployment
          railway up --service api
          DEPLOYMENT_URL=$(railway status --service api --json | jq -r '.url')
          echo "url=$DEPLOYMENT_URL" >> $GITHUB_OUTPUT
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  smoke-test-deployment:
    needs: deploy
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup k6
        uses: grafana/setup-k6-action@v1

      - name: Wait for deployment
        run: sleep 30

      - name: Run smoke test against deployment
        uses: grafana/run-k6-action@v1
        with:
          path: tests/load/smoke-test.js
        env:
          API_BASE_URL: ${{ needs.deploy.outputs.deployment_url }}

      - name: Rollback on failure
        if: failure()
        run: |
          railway rollback --service api
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 7. Performance Baselines & SLOs

### 7.1 Target Metrics

| Endpoint | p50 | p95 | p99 | Error Rate | Throughput |
|----------|-----|-----|-----|------------|------------|
| **GET /api/workflows** | <50ms | <100ms | <200ms | <0.1% | 500 req/s |
| **POST /api/workflows** | <100ms | <200ms | <500ms | <0.1% | 100 req/s |
| **POST /api/mcp/execute** | <500ms | <1000ms | <2000ms | <1% | 50 req/s |
| **POST /api/slack/events** | <100ms | <200ms | <500ms | <0.5% | 200 req/s |
| **GET /api/workflows/stream** | <100ms | <200ms | <500ms | <1% | 100 concurrent |

### 7.2 Database Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| **Query Latency (p95)** | <50ms | <100ms |
| **Connection Pool Usage** | <80% | <95% |
| **Active Connections** | <150 | <180 |
| **Idle in Transaction** | <10 | <20 |
| **Table Bloat** | <20% | <40% |
| **Autovacuum Lag** | <5 min | <15 min |

### 7.3 Queue Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| **Job Throughput** | >1000 jobs/s | >500 jobs/s |
| **Job Latency (p95)** | <100ms | <500ms |
| **Queue Depth (waiting)** | <1000 | <5000 |
| **Failed Job Rate** | <1% | <5% |
| **Worker CPU** | <70% | <90% |
| **Redis Memory** | <80% | <95% |

---

## 8. Monitoring & Observability

### 8.1 Real-Time Metrics Export

**k6 to Prometheus:**

```javascript
// tests/load/workflow-crud.test.js
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export const options = {
  // ... test config
  
  // Export to Prometheus
  ext: {
    loadimpact: {
      projectID: 12345,
      name: 'Workflow CRUD Test',
    },
  },
};

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
    'prometheus.txt': prometheusFormat(data),
  };
}

function prometheusFormat(data) {
  const metrics = [];
  
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.values) {
      for (const [key, value] of Object.entries(metric.values)) {
        metrics.push(`k6_${name}_${key} ${value}`);
      }
    }
  }
  
  return metrics.join('\n');
}
```

**Grafana Dashboard:**

```json
{
  "dashboard": {
    "title": "Nubabel Load Testing",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(k6_http_reqs_total[5m])",
            "legendFormat": "{{method}} {{url}}"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "targets": [
          {
            "expr": "k6_http_req_duration_p95",
            "legendFormat": "p95"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(k6_http_req_failed_total[5m])",
            "legendFormat": "errors"
          }
        ]
      }
    ]
  }
}
```

### 8.2 Database Monitoring During Tests

**PostgreSQL Metrics Collection:**

```sql
-- Create monitoring view
CREATE OR REPLACE VIEW load_test_metrics AS
SELECT
  NOW() as timestamp,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_tx,
  (SELECT SUM(numbackends) FROM pg_stat_database) as total_backends,
  (SELECT SUM(xact_commit) FROM pg_stat_database) as total_commits,
  (SELECT SUM(xact_rollback) FROM pg_stat_database) as total_rollbacks,
  (SELECT SUM(blks_read) FROM pg_stat_database) as disk_blocks_read,
  (SELECT SUM(blks_hit) FROM pg_stat_database) as buffer_blocks_hit,
  (SELECT ROUND(SUM(blks_hit) * 100.0 / NULLIF(SUM(blks_hit) + SUM(blks_read), 0), 2) FROM pg_stat_database) as cache_hit_ratio;

-- Export metrics during test
\copy (SELECT * FROM load_test_metrics) TO '/tmp/db_metrics.csv' CSV HEADER;
```

**Continuous Monitoring Script:**

```bash
#!/bin/bash
# tests/monitoring/db-monitor.sh

while true; do
  psql -U postgres -d nubabel -c "
    SELECT
      NOW() as time,
      COUNT(*) FILTER (WHERE state = 'active') as active,
      COUNT(*) FILTER (WHERE state = 'idle') as idle,
      ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - query_start))), 2) as avg_query_duration
    FROM pg_stat_activity
    WHERE state != 'idle'
  " >> /tmp/db_monitor.log
  
  sleep 5
done
```

---

## 9. Load Test Execution Plan

### 9.1 Pre-Test Checklist

- [ ] **Environment Setup**
  - [ ] Staging environment matches production specs
  - [ ] Database seeded with realistic data (1M+ workflows)
  - [ ] Redis cluster configured and warmed up
  - [ ] Workers scaled to expected capacity

- [ ] **Monitoring**
  - [ ] Grafana dashboards configured
  - [ ] PostgreSQL slow query log enabled
  - [ ] Redis monitoring active
  - [ ] Application logs streaming

- [ ] **Baseline Metrics**
  - [ ] Run pgbench baseline
  - [ ] Record current API response times
  - [ ] Document current queue throughput

### 9.2 Test Execution Sequence

**Week 1: Baseline & Smoke Tests**
```bash
# Day 1: Database baseline
pgbench -i -s 100 nubabel_test
pgbench -c 20 -j 4 -T 300 nubabel_test

# Day 2-3: API smoke tests
k6 run tests/load/smoke-test.js
k6 run tests/load/workflow-crud.test.js --vus 10 --duration 5m

# Day 4-5: Queue baseline
node tests/workers/benchmark-worker.js
# Monitor: 1000 jobs/sec for 10 minutes
```

**Week 2: Load & Stress Tests**
```bash
# Day 1-2: Gradual load increase
k6 run tests/load/workflow-crud.test.js --vus 50 --duration 30m
k6 run tests/load/workflow-crud.test.js --vus 100 --duration 30m
k6 run tests/load/workflow-crud.test.js --vus 200 --duration 30m

# Day 3: Stress test (find breaking point)
k6 run tests/load/stress-test.js

# Day 4: Spike test
k6 run tests/load/spike-test.js

# Day 5: Analysis and tuning
```

**Week 3: Endurance & Integration**
```bash
# Day 1-2: Soak test (24 hours)
k6 run tests/load/soak-test.js --duration 24h

# Day 3-4: Full integration test
# - API load
# - Queue processing
# - Database queries
# - Slack webhooks
# All running simultaneously

# Day 5: Final validation
```

### 9.3 Post-Test Analysis

**Automated Report Generation:**

```bash
#!/bin/bash
# tests/scripts/generate-report.sh

# Combine k6 results
k6 report results/*.json --output report.html

# Extract database metrics
psql -U postgres -d nubabel -f tests/sql/performance-summary.sql > db-report.txt

# Generate comparison
python tests/scripts/compare-baselines.py \
  --baseline baseline-metrics.json \
  --current results/summary.json \
  --output comparison.html
```

---

## 10. Troubleshooting Guide

### 10.1 Common Issues

**Issue: High p99 latency but low p95**
- **Cause:** Occasional slow queries or GC pauses
- **Solution:** 
  - Check PostgreSQL slow query log
  - Review Node.js GC metrics
  - Identify outlier requests in k6 logs

**Issue: Connection pool exhausted**
- **Cause:** Too many concurrent requests
- **Solution:**
  - Increase `max_connections` in PostgreSQL
  - Implement connection pooling (PgBouncer)
  - Add request queuing in application

**Issue: Queue depth growing**
- **Cause:** Workers can't keep up with job rate
- **Solution:**
  - Scale workers horizontally
  - Optimize job processing logic
  - Implement job prioritization

**Issue: Redis memory spike**
- **Cause:** Large job payloads or queue backlog
- **Solution:**
  - Reduce job payload size
  - Implement job data compression
  - Scale Redis cluster

### 10.2 Performance Tuning Checklist

**Application Layer:**
- [ ] Enable HTTP/2
- [ ] Implement response caching
- [ ] Optimize database queries (use EXPLAIN ANALYZE)
- [ ] Add database indexes
- [ ] Implement request batching

**Database Layer:**
- [ ] Tune `shared_buffers` (25% of RAM)
- [ ] Increase `work_mem` for complex queries
- [ ] Enable query plan caching
- [ ] Configure autovacuum aggressively
- [ ] Add read replicas for read-heavy workloads

**Queue Layer:**
- [ ] Enable Redis pipelining
- [ ] Implement job batching
- [ ] Optimize worker concurrency
- [ ] Add job result caching
- [ ] Implement circuit breakers

---

## 11. Next Steps

### 11.1 Immediate Actions (Week 1)

1. **Set up k6 locally**
   ```bash
   brew install k6  # macOS
   # or
   docker pull grafana/k6
   ```

2. **Create first smoke test**
   - Copy `workflow-crud.test.js` template
   - Update `API_BASE_URL` to staging
   - Run: `k6 run tests/load/smoke-test.js`

3. **Establish baselines**
   - Run pgbench on staging database
   - Document current API response times
   - Record queue throughput

### 11.2 Short-Term (Month 1)

1. **Integrate with CI/CD**
   - Add GitHub Actions workflow
   - Configure smoke tests on PRs
   - Set up nightly load tests

2. **Build monitoring**
   - Set up Grafana dashboards
   - Configure alerts for SLO violations
   - Implement automated reporting

3. **Optimize bottlenecks**
   - Address slow queries
   - Tune connection pools
   - Scale workers

### 11.3 Long-Term (Quarter 1)

1. **Production load testing**
   - Shadow production traffic
   - Implement chaos engineering
   - Test disaster recovery

2. **Advanced scenarios**
   - Multi-region testing
   - Failover testing
   - Data migration under load

3. **Continuous improvement**
   - Monthly performance reviews
   - Quarterly capacity planning
   - Annual architecture review

---

## 12. Resources & References

### 12.1 Official Documentation

- **k6:** https://grafana.com/docs/k6/latest/
- **Artillery:** https://www.artillery.io/docs
- **BullMQ:** https://docs.bullmq.io/
- **PostgreSQL:** https://www.postgresql.org/docs/current/pgbench.html

### 12.2 Real-World Examples

- **n8n k6 Benchmarks:** https://github.com/n8n-io/n8n/tree/master/packages/@n8n/benchmark
- **Grafana k6 Examples:** https://github.com/grafana/k6/tree/master/examples
- **BullMQ Benchmarks:** https://github.com/taskforcesh/bullmq-bench

### 12.3 Tools & Utilities

- **k6 GitHub Action:** https://github.com/grafana/run-k6-action
- **k6 Cloud:** https://grafana.com/products/cloud/k6/
- **PgBouncer:** https://www.pgbouncer.org/
- **Redis Cluster:** https://redis.io/docs/management/scaling/

### 12.4 Further Reading

- [Load Testing Your API: k6 vs Artillery vs Locust (Jan 2026)](https://medium.com/@sohail_saifi/load-testing-your-api-k6-vs-artillery-vs-locust-66a8d7f575bd)
- [PostgreSQL Performance Tuning (Jan 2026)](https://www.pgedge.com/blog/postgresql-performance-tuning)
- [BullMQ Performance Optimization (Jan 2026)](https://www.oreateai.com/blog/optimization-practice-guide-for-multiqueue-task-processing-architecture-with-nestjs-and-bullmq/)
- [k6 GitHub Actions Integration (Jul 2024)](https://grafana.com/blog/performance-testing-with-grafana-k6-and-github-actions/)

---

## Appendix A: Complete Test Scripts

### A.1 Smoke Test

**File:** `tests/load/smoke-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function() {
  const res = http.get(`${BASE_URL}/api/health`);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

### A.2 Load Test

**File:** `tests/load/load-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 100 },
    { duration: '10m', target: 100 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function() {
  // Workflow list
  let res = http.get(`${BASE_URL}/api/workflows`);
  check(res, { 'list workflows': (r) => r.status === 200 });
  sleep(1);
  
  // Create workflow
  res = http.post(
    `${BASE_URL}/api/workflows`,
    JSON.stringify({ name: 'Test Workflow' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'create workflow': (r) => r.status === 201 });
  sleep(2);
}
```

### A.3 Stress Test

**File:** `tests/load/stress-test.js`

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 400 },
    { duration: '5m', target: 800 },
    { duration: '10m', target: 0 },
  ],
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function() {
  const res = http.get(`${BASE_URL}/api/workflows`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

---

**End of Document**
