# Load Testing Tools and Patterns for Node/Express APIs

> **Research Document for Nubabel Backend**  
> Last Updated: January 2026  
> Status: Research Complete

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Tool Comparison: k6 vs Artillery vs Locust](#tool-comparison)
3. [Recommended Tool: k6](#recommended-tool-k6)
4. [Test Scenarios for Nubabel](#test-scenarios-for-nubabel)
5. [SSE Load Testing Patterns](#sse-load-testing-patterns)
6. [Metrics Targets and Thresholds](#metrics-targets-and-thresholds)
7. [CI/CD Integration](#cicd-integration)
8. [Test Data Management](#test-data-management)
9. [Results Reporting](#results-reporting)
10. [Example Test Scripts](#example-test-scripts)
11. [References](#references)

---

## Executive Summary

This document outlines load testing strategies for the Nubabel backend, covering REST APIs, authentication flows, workflow execution, Slack event handling, and Server-Sent Events (SSE) endpoints. After evaluating k6, Artillery, and Locust, **k6 is recommended** as the primary tool due to its Go-based performance, JavaScript scripting (familiar to Node.js teams), excellent CI/CD integration, and comprehensive threshold support.

### Key Recommendations

- **Primary Tool**: k6 (Grafana)
- **SSE Testing**: k6 with custom extensions or Gatling for complex SSE scenarios
- **CI Integration**: GitHub Actions with threshold-based pass/fail
- **Metrics Focus**: p95/p99 latency, error rate, throughput (RPS)

---

## Tool Comparison

### Feature Matrix

| Feature               | k6                              | Artillery                  | Locust                    |
| --------------------- | ------------------------------- | -------------------------- | ------------------------- |
| **Language**          | JavaScript (ES6)                | YAML + JavaScript          | Python                    |
| **Runtime**           | Go (high performance)           | Node.js                    | Python (gevent)           |
| **Learning Curve**    | Low (JS developers)             | Low (YAML config)          | Medium (Python)           |
| **Max Concurrency**   | Very High (Go-based)            | Medium                     | High                      |
| **CI/CD Integration** | Excellent                       | Good                       | Good                      |
| **Thresholds**        | Built-in, powerful              | Via plugins (ensure)       | Custom scripting          |
| **Cloud Option**      | k6 Cloud (Grafana)              | Artillery Pro              | No native                 |
| **SSE Support**       | Via extensions                  | Experimental engine        | Custom scripting          |
| **WebSocket**         | Native                          | Native                     | Via plugins               |
| **Metrics Export**    | JSON, CSV, InfluxDB, Prometheus | JSON, Datadog, CloudWatch  | Web UI, CSV               |
| **GitHub Stars**      | ~26k                            | ~8.5k                      | ~25k                      |
| **Best For**          | Developer/SRE teams, CI/CD      | Node.js teams, quick tests | Python teams, distributed |

### Detailed Analysis

#### k6 (Grafana)

**Pros:**

- Written in Go, extremely efficient resource usage
- JavaScript scripting familiar to Node.js developers
- Built-in threshold system for pass/fail criteria
- Excellent Grafana/Prometheus integration
- Active development by Grafana Labs
- Comprehensive documentation

**Cons:**

- No native browser automation (use Playwright separately)
- SSE requires extensions or workarounds
- No built-in distributed mode (requires k6 Cloud or custom setup)

**Best For:** Teams wanting high performance, CI/CD integration, and JavaScript familiarity.

#### Artillery

**Pros:**

- YAML-based configuration (low barrier to entry)
- Native TypeScript support
- Built-in Playwright integration for browser tests
- Good for WebSocket and Socket.io testing
- Lightweight and fast to set up

**Cons:**

- Node.js runtime limits max concurrency
- SSE support is experimental
- Threshold system requires plugins
- Smaller community than k6

**Best For:** Quick prototyping, Node.js-heavy teams, WebSocket testing.

#### Locust

**Pros:**

- Python-based (great for data science teams)
- Distributed testing built-in
- Real-time web UI for monitoring
- Highly customizable with Python

**Cons:**

- Python knowledge required
- gevent-based concurrency has limitations
- Less integrated with modern CI/CD
- No native threshold system

**Best For:** Python teams, distributed testing, custom protocols.

### Performance Benchmarks

Based on community benchmarks and documentation:

| Tool      | VUs per Core | Memory per 1000 VUs | Requests/sec (typical) |
| --------- | ------------ | ------------------- | ---------------------- |
| k6        | ~3000-5000   | ~50-100MB           | 10,000-50,000          |
| Artillery | ~500-1000    | ~200-400MB          | 1,000-5,000            |
| Locust    | ~1000-2000   | ~100-200MB          | 5,000-15,000           |

_Note: Actual performance varies based on test complexity and system resources._

---

## Recommended Tool: k6

### Why k6 for Nubabel

1. **JavaScript Ecosystem**: Nubabel is Node.js/Express-based; k6's JavaScript scripting aligns perfectly
2. **Performance**: Go runtime handles high concurrency efficiently
3. **CI/CD Native**: Built-in thresholds return non-zero exit codes on failure
4. **Observability**: Native Grafana/Prometheus integration for dashboards
5. **Active Development**: Grafana Labs backing ensures long-term support

### Installation

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker pull grafana/k6

# npm (wrapper)
npm install -g k6
```

---

## Test Scenarios for Nubabel

### 1. Authentication Flow

Test login, token refresh, and authenticated requests.

```javascript
// tests/load/auth-flow.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics
const loginFailRate = new Rate("login_failures");
const loginDuration = new Trend("login_duration");

export const options = {
  stages: [
    { duration: "1m", target: 50 }, // Ramp up to 50 users
    { duration: "3m", target: 50 }, // Stay at 50 users
    { duration: "1m", target: 100 }, // Ramp up to 100 users
    { duration: "3m", target: 100 }, // Stay at 100 users
    { duration: "1m", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // <1% errors
    http_req_duration: ["p(95)<500"], // p95 < 500ms
    login_failures: ["rate<0.05"], // <5% login failures
    login_duration: ["p(95)<1000"], // Login p95 < 1s
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export function setup() {
  // Create test users or fetch test credentials
  return {
    testUsers: [
      { email: "loadtest1@example.com", password: "testpass123" },
      { email: "loadtest2@example.com", password: "testpass123" },
      // Add more test users for realistic distribution
    ],
  };
}

export default function (data) {
  const user = data.testUsers[Math.floor(Math.random() * data.testUsers.length)];

  // Login request
  const loginStart = Date.now();
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: user.email,
      password: user.password,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
  loginDuration.add(Date.now() - loginStart);

  const loginSuccess = check(loginRes, {
    "login status is 200": (r) => r.status === 200,
    "login returns token": (r) => r.json("accessToken") !== undefined,
  });
  loginFailRate.add(!loginSuccess);

  if (!loginSuccess) {
    return;
  }

  const token = loginRes.json("accessToken");
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Authenticated request - Get user profile
  const profileRes = http.get(`${BASE_URL}/api/users/me`, { headers: authHeaders });
  check(profileRes, {
    "profile status is 200": (r) => r.status === 200,
    "profile has user data": (r) => r.json("id") !== undefined,
  });

  sleep(1);
}
```

### 2. Workflow Execution

Test workflow creation and execution under load.

```javascript
// tests/load/workflow-execution.js
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Trend } from "k6/metrics";

const workflowsCreated = new Counter("workflows_created");
const workflowExecutionTime = new Trend("workflow_execution_time");

export const options = {
  scenarios: {
    workflow_creation: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 20 },
        { duration: "5m", target: 20 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    workflow_execution_time: ["p(95)<10000"], // Workflows complete in <10s
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };

  group("Create and Execute Workflow", function () {
    // Create workflow
    const workflowPayload = {
      name: `Load Test Workflow ${Date.now()}`,
      description: "Automated load test workflow",
      steps: [
        {
          type: "http_request",
          config: {
            url: "https://httpbin.org/post",
            method: "POST",
            body: { test: true },
          },
        },
        {
          type: "transform",
          config: {
            expression: "$.response.json",
          },
        },
      ],
    };

    const createRes = http.post(`${BASE_URL}/api/workflows`, JSON.stringify(workflowPayload), {
      headers,
    });

    const createSuccess = check(createRes, {
      "workflow created": (r) => r.status === 201,
      "workflow has id": (r) => r.json("id") !== undefined,
    });

    if (!createSuccess) return;

    workflowsCreated.add(1);
    const workflowId = createRes.json("id");

    // Execute workflow
    const execStart = Date.now();
    const execRes = http.post(
      `${BASE_URL}/api/workflows/${workflowId}/execute`,
      JSON.stringify({ input: { testData: "load-test" } }),
      { headers },
    );

    check(execRes, {
      "execution started": (r) => r.status === 200 || r.status === 202,
      "execution has run id": (r) => r.json("runId") !== undefined,
    });

    // Poll for completion (simplified)
    const runId = execRes.json("runId");
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 30) {
      sleep(1);
      const statusRes = http.get(`${BASE_URL}/api/workflows/${workflowId}/runs/${runId}`, {
        headers,
      });

      const status = statusRes.json("status");
      if (status === "completed" || status === "failed") {
        completed = true;
        workflowExecutionTime.add(Date.now() - execStart);

        check(statusRes, {
          "workflow completed successfully": (r) => r.json("status") === "completed",
        });
      }
      attempts++;
    }
  });

  sleep(2);
}
```

### 3. Slack Event Handling

Simulate Slack webhook events at scale.

```javascript
// tests/load/slack-events.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import crypto from "k6/crypto";

const eventProcessingErrors = new Rate("event_processing_errors");
const eventsProcessed = new Counter("events_processed");

export const options = {
  scenarios: {
    // Simulate burst of Slack events (common pattern)
    slack_event_burst: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: "30s", target: 50 }, // Ramp to 50 events/sec
        { duration: "2m", target: 50 }, // Sustain
        { duration: "30s", target: 100 }, // Spike to 100 events/sec
        { duration: "1m", target: 100 }, // Sustain spike
        { duration: "30s", target: 10 }, // Cool down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200", "p(99)<500"], // Slack expects fast acks
    event_processing_errors: ["rate<0.02"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SLACK_SIGNING_SECRET = __ENV.SLACK_SIGNING_SECRET || "test-secret";

// Generate Slack-style signature
function generateSlackSignature(timestamp, body) {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const signature = crypto.hmac("sha256", SLACK_SIGNING_SECRET, sigBasestring, "hex");
  return `v0=${signature}`;
}

// Sample Slack event payloads
const eventTypes = [
  {
    type: "event_callback",
    event: {
      type: "message",
      channel: "C1234567890",
      user: "U1234567890",
      text: "Hello from load test",
      ts: "1234567890.123456",
    },
  },
  {
    type: "event_callback",
    event: {
      type: "app_mention",
      channel: "C1234567890",
      user: "U1234567890",
      text: "<@U0987654321> help me with something",
      ts: "1234567890.123457",
    },
  },
  {
    type: "event_callback",
    event: {
      type: "reaction_added",
      user: "U1234567890",
      reaction: "thumbsup",
      item: {
        type: "message",
        channel: "C1234567890",
        ts: "1234567890.123456",
      },
    },
  },
];

export default function () {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const eventPayload = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  const body = JSON.stringify({
    ...eventPayload,
    token: "test-verification-token",
    team_id: "T1234567890",
    api_app_id: "A1234567890",
    event_id: `Ev${Date.now()}`,
    event_time: parseInt(timestamp),
  });

  const signature = generateSlackSignature(timestamp, body);

  const res = http.post(`${BASE_URL}/api/slack/events`, body, {
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": signature,
    },
  });

  // Slack expects immediate acknowledgment (200 within 3 seconds)
  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 3s": (r) => r.timings.duration < 3000,
  });

  eventProcessingErrors.add(!success);
  if (success) eventsProcessed.add(1);

  // Slack rate limits: ~1 event per second per workspace in practice
  // But we test higher to find limits
  sleep(0.1);
}
```

### 4. API Endpoint Mix (Realistic Traffic)

Simulate realistic traffic patterns across multiple endpoints.

```javascript
// tests/load/realistic-traffic.js
import http from "k6/http";
import { check, sleep, group } from "k6";
import { randomItem, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

export const options = {
  scenarios: {
    // Simulate normal business hours traffic
    normal_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 50 }, // Morning ramp-up
        { duration: "10m", target: 100 }, // Peak hours
        { duration: "5m", target: 50 }, // Afternoon
        { duration: "5m", target: 20 }, // Evening wind-down
      ],
      gracefulRampDown: "1m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    "http_req_duration{endpoint:health}": ["p(99)<100"],
    "http_req_duration{endpoint:workflows}": ["p(95)<1000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Weighted endpoint distribution (matches real traffic patterns)
const endpoints = [
  { weight: 30, name: "health", fn: healthCheck },
  { weight: 25, name: "list_workflows", fn: listWorkflows },
  { weight: 20, name: "get_workflow", fn: getWorkflow },
  { weight: 15, name: "list_runs", fn: listRuns },
  { weight: 10, name: "get_metrics", fn: getMetrics },
];

function selectEndpoint() {
  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;

  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) return endpoint;
  }
  return endpoints[0];
}

function healthCheck(headers) {
  const res = http.get(`${BASE_URL}/health`, {
    tags: { endpoint: "health" },
  });
  check(res, { "health check ok": (r) => r.status === 200 });
}

function listWorkflows(headers) {
  const res = http.get(`${BASE_URL}/api/workflows?limit=20`, {
    headers,
    tags: { endpoint: "workflows" },
  });
  check(res, {
    "list workflows ok": (r) => r.status === 200,
    "returns array": (r) => Array.isArray(r.json("data")),
  });
}

function getWorkflow(headers) {
  // In real tests, use actual workflow IDs from setup
  const workflowId = "wf_test_" + randomIntBetween(1, 100);
  const res = http.get(`${BASE_URL}/api/workflows/${workflowId}`, {
    headers,
    tags: { endpoint: "workflows" },
  });
  // 404 is acceptable for random IDs
  check(res, {
    "get workflow response": (r) => r.status === 200 || r.status === 404,
  });
}

function listRuns(headers) {
  const res = http.get(`${BASE_URL}/api/runs?limit=50`, {
    headers,
    tags: { endpoint: "runs" },
  });
  check(res, { "list runs ok": (r) => r.status === 200 });
}

function getMetrics(headers) {
  const res = http.get(`${BASE_URL}/api/metrics`, {
    headers,
    tags: { endpoint: "metrics" },
  });
  check(res, { "get metrics ok": (r) => r.status === 200 });
}

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
  };

  const endpoint = selectEndpoint();
  endpoint.fn(headers);

  // Realistic think time between requests
  sleep(randomIntBetween(1, 3));
}
```

---

## SSE Load Testing Patterns

### Challenges with SSE Testing

1. **Long-lived connections**: SSE connections stay open, unlike typical HTTP requests
2. **Server push**: Data flows server→client, not request/response
3. **Connection limits**: Browsers limit ~6 connections per domain
4. **Reconnection logic**: Must test `Last-Event-ID` handling
5. **Resource consumption**: Each connection consumes server resources

### Approach 1: k6 with WebSocket Extension (Recommended)

k6 doesn't have native SSE support, but SSE is HTTP-based and can be tested with custom handling:

```javascript
// tests/load/sse-streaming.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Gauge } from "k6/metrics";

const sseConnections = new Gauge("sse_active_connections");
const sseMessages = new Counter("sse_messages_received");
const sseLatency = new Trend("sse_message_latency");

export const options = {
  scenarios: {
    sse_connections: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 }, // Ramp to 50 connections
        { duration: "5m", target: 50 }, // Hold 50 connections
        { duration: "1m", target: 100 }, // Ramp to 100 connections
        { duration: "5m", target: 100 }, // Hold 100 connections
        { duration: "2m", target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    sse_messages_received: ["count>1000"], // Expect messages
    sse_message_latency: ["p(95)<1000"], // Messages arrive within 1s
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const connectionStart = Date.now();
  sseConnections.add(1);

  // SSE endpoint - use streaming response
  const res = http.get(`${BASE_URL}/api/events/stream`, {
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
    },
    timeout: "60s", // Long timeout for SSE
  });

  // Parse SSE response (simplified - k6 receives full response)
  if (res.status === 200) {
    const events = res.body.split("\n\n").filter((e) => e.startsWith("data:"));

    events.forEach((event, index) => {
      sseMessages.add(1);
      // Estimate latency based on event order (simplified)
      sseLatency.add((Date.now() - connectionStart) / (index + 1));
    });

    check(res, {
      "SSE connection established": (r) => r.status === 200,
      "received events": () => events.length > 0,
    });
  }

  sseConnections.add(-1);
  sleep(1);
}
```

### Approach 2: Artillery SSE Engine

For dedicated SSE testing, Artillery has an experimental engine:

```yaml
# tests/load/artillery-sse.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 300
      arrivalRate: 20
      name: "Sustained load"
  engines:
    sse: {}
  plugins:
    expect: {}

scenarios:
  - name: "SSE Connection Test"
    engine: sse
    flow:
      - connect:
          url: "/api/events/stream"
          headers:
            Authorization: "Bearer {{ $env.AUTH_TOKEN }}"
      - think: 30 # Hold connection for 30 seconds
      - loop:
          - waitForEvent:
              event: "message"
              timeout: 5000
          - log: "Received SSE message"
        count: 10
```

### Approach 3: Gatling (Best for Complex SSE)

Gatling has first-class SSE support:

```scala
// tests/load/GatlingSseSimulation.scala
import io.gatling.core.Predef._
import io.gatling.http.Predef._
import scala.concurrent.duration._

class SseLoadTest extends Simulation {

  val httpProtocol = http
    .baseUrl("http://localhost:3000")
    .header("Authorization", "Bearer ${authToken}")

  val sseScenario = scenario("SSE Streaming")
    .exec(
      sse("Connect to SSE")
        .connect("/api/events/stream")
        .await(30.seconds)(
          sse.checkMessage("Check message")
            .check(regex("data:(.*)").saveAs("eventData"))
        )
    )
    .pause(60.seconds)  // Hold connection
    .exec(sse("Close SSE").close())

  setUp(
    sseScenario.inject(
      rampUsers(100).during(5.minutes),
      constantUsersPerSec(20).during(10.minutes)
    )
  ).protocols(httpProtocol)
}
```

### SSE Testing Best Practices

1. **Test connection establishment time** separately from message delivery
2. **Verify reconnection** with `Last-Event-ID` header
3. **Monitor server resources** (memory, file descriptors) during tests
4. **Test heartbeat/keep-alive** mechanisms
5. **Simulate network interruptions** to test resilience

---

## Metrics Targets and Thresholds

### Recommended Thresholds by API Type

#### Real-Time APIs (SSE, WebSocket)

| Metric               | Target      | Critical    |
| -------------------- | ----------- | ----------- |
| Connection Time      | p95 < 500ms | p99 < 1s    |
| Message Latency      | p95 < 100ms | p99 < 300ms |
| Error Rate           | < 0.1%      | < 1%        |
| Reconnection Success | > 99%       | > 95%       |

#### REST APIs (Standard)

| Metric        | Target      | Critical |
| ------------- | ----------- | -------- |
| Response Time | p95 < 500ms | p99 < 1s |
| Error Rate    | < 1%        | < 5%     |
| Throughput    | > 100 RPS   | > 50 RPS |

#### Authentication Endpoints

| Metric        | Target      | Critical    |
| ------------- | ----------- | ----------- |
| Login Time    | p95 < 1s    | p99 < 2s    |
| Token Refresh | p95 < 200ms | p99 < 500ms |
| Error Rate    | < 0.5%      | < 2%        |

#### Webhook Receivers (Slack Events)

| Metric              | Target      | Critical    |
| ------------------- | ----------- | ----------- |
| Acknowledgment Time | p95 < 200ms | p99 < 500ms |
| Processing Time     | p95 < 3s    | p99 < 10s   |
| Error Rate          | < 0.1%      | < 1%        |

_Note: Slack requires acknowledgment within 3 seconds._

### k6 Threshold Configuration

```javascript
export const options = {
  thresholds: {
    // Global thresholds
    http_req_failed: ["rate<0.01"], // <1% errors
    http_req_duration: ["p(95)<500", "p(99)<1000"], // Latency

    // Per-endpoint thresholds (using tags)
    "http_req_duration{endpoint:auth}": ["p(95)<1000"],
    "http_req_duration{endpoint:health}": ["p(99)<100"],
    "http_req_duration{endpoint:workflows}": ["p(95)<2000"],
    "http_req_duration{endpoint:slack}": ["p(95)<200"],

    // Custom metrics
    login_duration: ["p(95)<1000"],
    workflow_execution_time: ["p(95)<10000"],

    // Checks (assertions)
    checks: ["rate>0.95"], // >95% of checks pass
  },
};
```

### SLO-Based Thresholds

Define thresholds based on Service Level Objectives:

```javascript
// SLO: 99.9% availability, p99 < 1s for 99% of requests
export const options = {
  thresholds: {
    http_req_failed: [
      { threshold: "rate<0.001", abortOnFail: true }, // 99.9% success
    ],
    http_req_duration: [
      { threshold: "p(99)<1000", abortOnFail: false }, // p99 < 1s
      { threshold: "p(95)<500", abortOnFail: false }, // p95 < 500ms
    ],
  },
};
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/load-tests.yml
name: Load Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 2 * * *" # Nightly at 2 AM
  workflow_dispatch:
    inputs:
      test_type:
        description: "Test type to run"
        required: true
        default: "smoke"
        type: choice
        options:
          - smoke
          - load
          - stress
          - soak

env:
  K6_VERSION: "0.49.0"

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          curl -L https://github.com/grafana/k6/releases/download/v${{ env.K6_VERSION }}/k6-v${{ env.K6_VERSION }}-linux-amd64.tar.gz | tar xz
          sudo mv k6-v${{ env.K6_VERSION }}-linux-amd64/k6 /usr/local/bin/

      - name: Start test environment
        run: docker-compose -f docker-compose.test.yml up -d

      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:3000/health; do sleep 2; done'

      - name: Run smoke test
        run: |
          k6 run \
            --out json=results/smoke-test.json \
            --env BASE_URL=http://localhost:3000 \
            --env AUTH_TOKEN=${{ secrets.TEST_AUTH_TOKEN }} \
            tests/load/smoke-test.js

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-test-results
          path: results/

      - name: Stop test environment
        if: always()
        run: docker-compose -f docker-compose.test.yml down

  load-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          curl -L https://github.com/grafana/k6/releases/download/v${{ env.K6_VERSION }}/k6-v${{ env.K6_VERSION }}-linux-amd64.tar.gz | tar xz
          sudo mv k6-v${{ env.K6_VERSION }}-linux-amd64/k6 /usr/local/bin/

      - name: Run load test against staging
        run: |
          k6 run \
            --out json=results/load-test.json \
            --out web-dashboard=export=results/dashboard/ \
            --env BASE_URL=${{ secrets.STAGING_URL }} \
            --env AUTH_TOKEN=${{ secrets.STAGING_AUTH_TOKEN }} \
            tests/load/realistic-traffic.js

      - name: Generate HTML report
        if: always()
        run: |
          k6 report results/load-test.json -o results/report.html || true

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: load-test-results
          path: results/

      - name: Post results to PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('results/load-test.json', 'utf8'));

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## ❌ Load Test Failed\n\nThresholds exceeded. Check artifacts for details.`
            });

  nightly-stress-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          curl -L https://github.com/grafana/k6/releases/download/v${{ env.K6_VERSION }}/k6-v${{ env.K6_VERSION }}-linux-amd64.tar.gz | tar xz
          sudo mv k6-v${{ env.K6_VERSION }}-linux-amd64/k6 /usr/local/bin/

      - name: Run stress test
        run: |
          k6 run \
            --out json=results/stress-test.json \
            --env BASE_URL=${{ secrets.STAGING_URL }} \
            --env AUTH_TOKEN=${{ secrets.STAGING_AUTH_TOKEN }} \
            tests/load/stress-test.js

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: stress-test-results-${{ github.run_number }}
          path: results/
          retention-days: 30

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1.25.0
        with:
          channel-id: "C1234567890"
          slack-message: "🚨 Nightly stress test failed! Check GitHub Actions for details."
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

### Test Types Configuration

```javascript
// tests/load/config/test-profiles.js

// Smoke Test: Quick validation (1-2 minutes)
export const smokeOptions = {
  vus: 5,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Load Test: Normal expected load (10-15 minutes)
export const loadOptions = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "5m", target: 100 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

// Stress Test: Beyond normal capacity (15-20 minutes)
export const stressOptions = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "5m", target: 200 },
    { duration: "5m", target: 300 },
    { duration: "5m", target: 400 },
    { duration: "3m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"], // Allow higher error rate
    http_req_duration: ["p(95)<2000"],
  },
};

// Soak Test: Extended duration (1-4 hours)
export const soakOptions = {
  stages: [
    { duration: "5m", target: 100 },
    { duration: "3h", target: 100 },
    { duration: "5m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Spike Test: Sudden traffic surge
export const spikeOptions = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "10s", target: 500 }, // Sudden spike
    { duration: "2m", target: 500 },
    { duration: "10s", target: 50 }, // Sudden drop
    { duration: "2m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.10"], // Allow 10% during spike
  },
};
```

---

## Test Data Management

### Strategies

#### 1. CSV Data Files

```javascript
// tests/load/data/users.csv
// email,password,role
// user1@test.com,pass123,admin
// user2@test.com,pass456,user

import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { SharedArray } from "k6/data";

const users = new SharedArray("users", function () {
  return papaparse.parse(open("./data/users.csv"), { header: true }).data;
});

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];
  // Use user.email, user.password
}
```

#### 2. Dynamic Data Generation

```javascript
import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

function generateWorkflow() {
  return {
    id: uuidv4(),
    name: `Workflow-${randomString(8)}`,
    steps: randomIntBetween(1, 5),
    createdAt: new Date().toISOString(),
  };
}
```

#### 3. Setup/Teardown for Test Data

```javascript
export function setup() {
  // Create test data before test runs
  const res = http.post(
    `${BASE_URL}/api/test/seed`,
    JSON.stringify({
      users: 100,
      workflows: 50,
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  return {
    testDataId: res.json("batchId"),
    userIds: res.json("userIds"),
    workflowIds: res.json("workflowIds"),
  };
}

export function teardown(data) {
  // Clean up test data after test
  http.delete(`${BASE_URL}/api/test/cleanup/${data.testDataId}`);
}
```

#### 4. Redis for Distributed Tests

```javascript
// For distributed k6 tests, use Redis to share unique data
import redis from "k6/experimental/redis";

const client = new redis.Client({
  addrs: ["redis:6379"],
});

export async function setup() {
  // Pre-populate Redis with test data
  for (let i = 0; i < 1000; i++) {
    await client.lpush(
      "test:users",
      JSON.stringify({
        email: `user${i}@test.com`,
        token: `token-${i}`,
      }),
    );
  }
}

export default async function () {
  // Each VU gets unique data
  const userData = await client.rpoplpush("test:users", "test:users:used");
  const user = JSON.parse(userData);
  // Use user data...
}
```

---

## Results Reporting

### k6 Output Options

```bash
# JSON output (for processing)
k6 run --out json=results.json test.js

# CSV output (for spreadsheets)
k6 run --out csv=results.csv test.js

# InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 test.js

# Prometheus (via Remote Write)
k6 run --out experimental-prometheus-rw test.js

# Web Dashboard (built-in)
k6 run --out web-dashboard=export=./report/ test.js

# Multiple outputs
k6 run --out json=results.json --out influxdb=http://localhost:8086/k6 test.js
```

### Grafana Dashboard Setup

```yaml
# docker-compose.monitoring.yml
version: "3.8"

services:
  influxdb:
    image: influxdb:1.8
    ports:
      - "8086:8086"
    environment:
      - INFLUXDB_DB=k6
    volumes:
      - influxdb-data:/var/lib/influxdb

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources

volumes:
  influxdb-data:
  grafana-data:
```

### Custom Report Generation

```javascript
// scripts/generate-report.js
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  return {
    "results/summary.html": htmlReport(data),
    "results/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
```

### Sample Report Output

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: tests/load/realistic-traffic.js
     output: json=results/load-test.json

  scenarios: (100.00%) 1 scenario, 100 max VUs, 25m30s max duration
           * normal_load: Up to 100 looping VUs for 25m0s

running (25m00.0s), 000/100 VUs, 15234 complete and 0 interrupted iterations
normal_load ✓ [======================================] 000/100 VUs  25m0s

     ✓ health check ok
     ✓ list workflows ok
     ✓ returns array
     ✓ get workflow response
     ✓ list runs ok
     ✓ get metrics ok

     checks.........................: 99.87% ✓ 45678      ✗ 59
     data_received..................: 125 MB 83 kB/s
     data_sent......................: 12 MB  8.0 kB/s
     http_req_blocked...............: avg=1.2ms    min=0s       med=0s       max=234ms   p(90)=0s       p(95)=0s
     http_req_connecting............: avg=0.8ms    min=0s       med=0s       max=189ms   p(90)=0s       p(95)=0s
   ✓ http_req_duration..............: avg=45.2ms   min=2ms      med=32ms     max=1.2s    p(90)=89ms     p(95)=145ms
       { endpoint:health }.........: avg=8.5ms    min=2ms      med=6ms      max=89ms    p(90)=15ms     p(95)=22ms
       { endpoint:workflows }......: avg=78.3ms   min=12ms     med=65ms     max=1.2s    p(90)=156ms    p(95)=234ms
   ✓ http_req_failed................: 0.03%  ✓ 5          ✗ 15229
     http_req_receiving.............: avg=0.5ms    min=0s       med=0s       max=45ms    p(90)=1ms      p(95)=2ms
     http_req_sending...............: avg=0.1ms    min=0s       med=0s       max=12ms    p(90)=0s       p(95)=0s
     http_req_tls_handshaking.......: avg=0s       min=0s       med=0s       max=0s      p(90)=0s       p(95)=0s
     http_req_waiting...............: avg=44.6ms   min=2ms      med=31ms     max=1.2s    p(90)=88ms     p(95)=143ms
     http_reqs......................: 15234  10.156/s
     iteration_duration.............: avg=2.05s    min=1.01s    med=2.03s    max=4.2s    p(90)=3.01s    p(95)=3.12s
     iterations.....................: 15234  10.156/s
     vus............................: 1      min=1        max=100
     vus_max........................: 100    min=100      max=100
```

---

## Example Test Scripts

### Complete Smoke Test

```javascript
// tests/load/smoke-test.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
    "health response time < 100ms": (r) => r.timings.duration < 100,
  });

  // API endpoint
  const apiRes = http.get(`${BASE_URL}/api/status`);
  check(apiRes, {
    "api status 200": (r) => r.status === 200,
  });

  sleep(1);
}
```

### Artillery Configuration Example

```yaml
# tests/load/artillery-config.yml
config:
  target: "{{ $env.BASE_URL }}"
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 300
      arrivalRate: 20
      name: "Sustained load"
    - duration: 60
      arrivalRate: 5
      name: "Cool down"

  defaults:
    headers:
      Content-Type: "application/json"

  plugins:
    expect: {}
    ensure:
      thresholds:
        - http.response_time.p95: 500
        - http.codes.2xx: 99

  payload:
    path: "data/users.csv"
    fields:
      - "email"
      - "password"

scenarios:
  - name: "Authentication Flow"
    weight: 3
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "{{ email }}"
            password: "{{ password }}"
          capture:
            - json: "$.accessToken"
              as: "token"
          expect:
            - statusCode: 200
            - hasProperty: "accessToken"

      - get:
          url: "/api/users/me"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200

  - name: "Workflow Operations"
    weight: 2
    flow:
      - get:
          url: "/api/workflows"
          headers:
            Authorization: "Bearer {{ $env.AUTH_TOKEN }}"
          expect:
            - statusCode: 200

      - think: 2

      - post:
          url: "/api/workflows"
          headers:
            Authorization: "Bearer {{ $env.AUTH_TOKEN }}"
          json:
            name: "Test Workflow {{ $randomString(8) }}"
            steps: []
          expect:
            - statusCode: 201
```

### Locust Example

```python
# tests/load/locustfile.py
from locust import HttpUser, task, between, events
from locust.runners import MasterRunner
import json
import os

class NubabelUser(HttpUser):
    wait_time = between(1, 3)
    host = os.getenv("BASE_URL", "http://localhost:3000")

    def on_start(self):
        """Login and get auth token"""
        response = self.client.post("/api/auth/login", json={
            "email": "loadtest@example.com",
            "password": "testpass123"
        })
        if response.status_code == 200:
            self.token = response.json().get("accessToken")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            self.token = None
            self.headers = {"Content-Type": "application/json"}

    @task(3)
    def list_workflows(self):
        """List workflows - most common operation"""
        with self.client.get(
            "/api/workflows",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Got status {response.status_code}")

    @task(2)
    def get_workflow_details(self):
        """Get specific workflow"""
        workflow_id = "wf_test_1"  # Use actual IDs in real tests
        self.client.get(
            f"/api/workflows/{workflow_id}",
            headers=self.headers,
            name="/api/workflows/[id]"
        )

    @task(1)
    def create_workflow(self):
        """Create new workflow"""
        payload = {
            "name": f"Load Test Workflow",
            "description": "Created by Locust",
            "steps": []
        }
        self.client.post(
            "/api/workflows",
            json=payload,
            headers=self.headers
        )

    @task(5)
    def health_check(self):
        """Health check - lightweight"""
        self.client.get("/health")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Setup before test starts"""
    if isinstance(environment.runner, MasterRunner):
        print("Running on master node")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Cleanup after test ends"""
    print(f"Test completed. Total requests: {environment.stats.total.num_requests}")
```

---

## References

### Official Documentation

1. **k6 Documentation**: https://k6.io/docs/
2. **Artillery Documentation**: https://www.artillery.io/docs
3. **Locust Documentation**: https://docs.locust.io/
4. **Gatling SSE Support**: https://docs.gatling.io/guides/use-cases/llm-api/

### Research Sources

5. **k6 vs Artillery vs Locust Comparison**: https://qacraft.com/k6-vs-other-performance-testing-tools/
6. **Load Testing Node.js Applications**: https://moldstud.com/articles/p-complete-guide-to-running-load-tests-on-nodejs-applications
7. **API Performance Metrics (P50/P90/P99)**: https://medium.com/@jfindikli/the-ultimate-guide-to-faster-api-response-times-p50-p90-p99-latencies-0fb60f0a0198
8. **k6 GitHub Actions Integration**: https://grafana.com/blog/performance-testing-with-grafana-k6-and-github-actions/

### SSE Testing Resources

9. **Artillery SSE Engine**: https://github.com/artilleryio/artillery-engine-sse
10. **LoadForge SSE Testing**: https://docs.loadforge.com/examples/real-time-applications/server-sent-events
11. **Gatling SSE Load Testing**: https://gatling.io/blog/load-test-sse

### Example Repositories

12. **k6 Examples (Grafana)**: https://github.com/grafana/k6/tree/master/examples
13. **k6 GitHub Actions Example**: https://github.com/grafana/k6-example-github-actions
14. **Artillery Examples**: https://github.com/artilleryio/artillery/tree/main/examples
15. **Locust Examples**: https://github.com/locustio/locust/tree/master/examples

### Slack-Specific Resources

16. **Slack Rate Limits**: https://docs.slack.dev/apis/web-api/rate-limits
17. **Slack Load Testing (Koi Pond)**: https://slack.engineering/load-testing-with-koi-pond/

### CI/CD Integration

18. **Azure Load Testing Thresholds**: https://learn.microsoft.com/en-us/azure/load-testing/how-to-define-test-criteria
19. **Postman Performance Metrics**: https://learning.postman.com/docs/collections/performance-testing/performance-test-metrics/

---

## Appendix: Quick Reference

### k6 CLI Commands

```bash
# Run test
k6 run test.js

# Run with options
k6 run --vus 10 --duration 30s test.js

# Run with environment variables
k6 run --env BASE_URL=http://api.example.com test.js

# Run with output
k6 run --out json=results.json test.js

# Run specific scenario
k6 run --scenario smoke test.js

# Validate script without running
k6 inspect test.js
```

### Artillery CLI Commands

```bash
# Run test
artillery run test.yml

# Quick test
artillery quick --count 10 --num 50 http://localhost:3000/api

# Run with environment
artillery run --environment staging test.yml

# Generate report
artillery report results.json --output report.html
```

### Locust CLI Commands

```bash
# Run with web UI
locust -f locustfile.py

# Run headless
locust -f locustfile.py --headless -u 100 -r 10 --run-time 5m

# Distributed mode (master)
locust -f locustfile.py --master

# Distributed mode (worker)
locust -f locustfile.py --worker --master-host=192.168.1.100
```
