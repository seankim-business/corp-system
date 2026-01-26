# APM Patterns for Node.js/Express with OpenTelemetry

> **Purpose**: Best practices and implementation patterns for Application Performance Monitoring (APM) in Node.js/Express applications using OpenTelemetry.
> **Last Updated**: January 2026
> **Target**: Nubabel production infrastructure

---

## Table of Contents

1. [Overview](#overview)
2. [Recommended Tools & Packages](#recommended-tools--packages)
3. [Tracing](#tracing)
4. [Metrics](#metrics)
5. [Logs Correlation](#logs-correlation)
6. [Sampling Strategies](#sampling-strategies)
7. [PII Handling & Data Redaction](#pii-handling--data-redaction)
8. [Multi-Tenant Tagging](#multi-tenant-tagging)
9. [OTLP Exporters](#otlp-exporters)
10. [Minimal Setup Snippets](#minimal-setup-snippets)
11. [Production Checklist](#production-checklist)
12. [References](#references)

---

## Overview

OpenTelemetry (OTel) is the CNCF standard for observability, providing vendor-neutral APIs and SDKs for collecting traces, metrics, and logs. For Node.js/Express applications, OTel enables:

- **Distributed Tracing**: Track requests across microservices
- **Metrics Collection**: Monitor performance indicators (latency, throughput, errors)
- **Logs Correlation**: Link logs to traces via trace/span IDs
- **Vendor Agnosticism**: Export to any backend (Jaeger, Tempo, Datadog, etc.)

### Key Principles

1. **Initialize OTel BEFORE importing other modules** (Express, database clients)
2. **Use auto-instrumentation as baseline**, supplement with manual spans for business logic
3. **Configure BatchSpanProcessor for production** (not SimpleSpanProcessor)
4. **Implement sampling to control costs** without losing critical traces
5. **Correlate all signals** (traces, metrics, logs) via resource attributes

---

## Recommended Tools & Packages

### Core SDK

| Package                               | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `@opentelemetry/sdk-node`             | Main SDK for Node.js applications                    |
| `@opentelemetry/api`                  | Core API for manual instrumentation                  |
| `@opentelemetry/resources`            | Define service metadata (name, version, environment) |
| `@opentelemetry/semantic-conventions` | Standard attribute names                             |

### Auto-Instrumentation

| Package                                     | Purpose                                         |
| ------------------------------------------- | ----------------------------------------------- |
| `@opentelemetry/auto-instrumentations-node` | Meta-package for all Node.js instrumentations   |
| `@opentelemetry/instrumentation-express`    | Express-specific spans                          |
| `@opentelemetry/instrumentation-http`       | HTTP client/server spans (required for Express) |

### Exporters

| Package                                      | Protocol      | Use Case                         |
| -------------------------------------------- | ------------- | -------------------------------- |
| `@opentelemetry/exporter-trace-otlp-proto`   | HTTP/protobuf | Recommended for most backends    |
| `@opentelemetry/exporter-trace-otlp-grpc`    | gRPC          | High-throughput scenarios        |
| `@opentelemetry/exporter-trace-otlp-http`    | HTTP/JSON     | Debugging, browser compatibility |
| `@opentelemetry/exporter-metrics-otlp-proto` | HTTP/protobuf | Metrics export                   |

### Logging Integration

| Package                        | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `pino`                         | High-performance structured logging |
| `pino-opentelemetry-transport` | Inject trace context into Pino logs |

**Citation**: [OpenTelemetry JS Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) [^1]

---

## Tracing

### Auto-Instrumentation Setup

The recommended approach is using `@opentelemetry/auto-instrumentations-node` which automatically instruments:

- HTTP/HTTPS clients and servers
- Express routes and middleware
- Database clients (PostgreSQL, MySQL, MongoDB, Redis)
- Message queues (RabbitMQ, Kafka)
- gRPC

```typescript
// instrumentation.ts - MUST be imported FIRST
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "nubabel-api",
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || "1.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || "http://localhost:4318/v1/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OTel SDK shut down"))
    .catch((err) => console.error("Error shutting down OTel SDK", err))
    .finally(() => process.exit(0));
});
```

### Manual Span Creation

For business logic not covered by auto-instrumentation:

```typescript
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("nubabel-business-logic");

async function processOrder(orderId: string): Promise<void> {
  return tracer.startActiveSpan("process-order", async (span) => {
    try {
      span.setAttribute("order.id", orderId);

      // Nested span for sub-operation
      await tracer.startActiveSpan("validate-inventory", async (childSpan) => {
        // ... validation logic
        childSpan.end();
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Express Request Hook

Enrich spans with request-specific attributes:

```typescript
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";

const expressInstrumentation = new ExpressInstrumentation({
  requestHook: (span, info) => {
    span.setAttribute("http.request.id", info.request.headers["x-request-id"] || "");
    span.setAttribute("user.id", info.request.user?.id || "anonymous");
  },
});
```

**Citation**: [OpenTelemetry Express Instrumentation](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express) [^2]

---

## Metrics

### Setup with OTLP Exporter

```typescript
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const sdk = new NodeSDK({
  // ... other config
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || "http://localhost:4318/v1/metrics",
    }),
    exportIntervalMillis: 10000, // Export every 10 seconds
  }),
});
```

### Custom Business Metrics

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("nubabel-business-metrics");

// Counter for events
const orderCounter = meter.createCounter("orders.created", {
  description: "Number of orders created",
  unit: "1",
});

// Histogram for latency
const processingDuration = meter.createHistogram("order.processing.duration", {
  description: "Order processing duration",
  unit: "ms",
});

// Usage
orderCounter.add(1, { "order.type": "subscription", "tenant.id": tenantId });
processingDuration.record(durationMs, { "order.status": "completed" });
```

**Citation**: [Backstage OpenTelemetry Setup](https://github.com/backstage/backstage/blob/master/packages/backend/src/instrumentation.js) [^3]

---

## Logs Correlation

### The Problem

Without correlation, logs and traces exist in silos. Debugging requires manually matching timestamps across systems.

### Solution: Inject Trace Context into Logs

Using Pino with `pino-opentelemetry-transport`:

```typescript
// logger.ts
import pino from "pino";

const transport = pino.transport({
  target: "pino-opentelemetry-transport",
  options: {
    logRecordProcessorOptions: [
      {
        recordProcessorType: "batch",
        exporterOptions: { protocol: "http" },
      },
    ],
  },
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    messageKey: "message",
  },
  transport,
);
```

### Manual Trace Context Injection

If not using the transport, manually inject trace context:

```typescript
import { trace, context } from "@opentelemetry/api";

function getTraceContext() {
  const span = trace.getSpan(context.active());
  if (!span) return {};

  const spanContext = span.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags,
  };
}

// Usage in logging
logger.info({ ...getTraceContext(), orderId }, "Processing order");
```

### Log Output Format

```json
{
  "level": "info",
  "message": "Processing order",
  "orderId": "ord_123",
  "trace_id": "abc123def456...",
  "span_id": "789xyz...",
  "timestamp": "2026-01-26T10:30:00.000Z"
}
```

**Citation**: [SigNoz - Correlating Traces, Logs, Metrics](https://signoz.io/opentelemetry/correlating-traces-logs-metrics-nodejs/) [^4], [pino-opentelemetry-transport](https://github.com/pinojs/pino-opentelemetry-transport) [^5]

---

## Sampling Strategies

### Why Sample?

- **Cost Control**: Reduce storage and processing costs
- **Performance**: Lower overhead on high-traffic services
- **Signal-to-Noise**: Focus on meaningful traces

### Head-Based Sampling (Recommended Start)

Decision made at trace creation. Simple, predictable, but cannot sample based on outcome (errors, latency).

```typescript
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";

const sampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1), // Sample 10% of root spans
  // Respect parent's sampling decision for child spans
  remoteParentSampled: new AlwaysOnSampler(),
  remoteParentNotSampled: new AlwaysOffSampler(),
});

const sdk = new NodeSDK({
  // ... other config
  sampler,
});
```

### Environment Variable Configuration

```bash
# Sample 10% of traces
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

### Tail-Based Sampling (Advanced)

Decision made after trace completion. Requires OpenTelemetry Collector.

**Collector Configuration** (`otel-collector-config.yaml`):

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      # Always sample errors
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      # Always sample slow requests
      - name: slow-requests
        type: latency
        latency:
          threshold_ms: 1000
      # Sample 10% of remaining
      - name: probabilistic
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

### Hybrid Approach (Production Recommended)

```typescript
// Custom sampler: always sample errors, rate-limit normal traffic
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";

class HybridSampler implements Sampler {
  private ratioSampler = new TraceIdRatioBasedSampler(0.1);

  shouldSample(context, traceId, spanName, spanKind, attributes): SamplingResult {
    // Always sample if error indicator present
    if (attributes["error"] === true || attributes["http.status_code"] >= 500) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Otherwise use ratio-based sampling
    return this.ratioSampler.shouldSample(context, traceId, spanName, spanKind, attributes);
  }

  toString(): string {
    return "HybridSampler";
  }
}
```

**Citation**: [Uptrace - OpenTelemetry Sampling](https://uptrace.dev/opentelemetry/sampling.html) [^6], [base14 Scout - Node.js APM Guide](https://docs.base14.io/instrument/apps/auto-instrumentation/nodejs/) [^7]

---

## PII Handling & Data Redaction

### Defense in Depth Strategy

1. **Application Layer**: Prevent PII from entering telemetry
2. **Collector Layer**: Redact/mask before export
3. **Backend Layer**: Access controls and retention policies

### Application-Level: Attribute Allow-Lists

```typescript
// Centralized attribute helper - only approved attributes
const ALLOWED_USER_ATTRIBUTES = ["user.id", "user.role", "user.tier"];

function getSafeUserAttributes(user: User): Record<string, string> {
  return {
    "user.id": hashUserId(user.id), // Hash instead of raw ID
    "user.role": user.role,
    "user.tier": user.tier,
    // Explicitly NOT including: email, name, phone, address
  };
}
```

### Custom Span Processor for PII Masking

```typescript
import { SpanProcessor, ReadableSpan, Span } from "@opentelemetry/sdk-trace-base";

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b\d{16}\b/g, // Credit card (simplified)
];

class PIIMaskingProcessor implements SpanProcessor {
  onStart(span: Span): void {}

  onEnd(span: ReadableSpan): void {
    const attributes = span.attributes;
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === "string") {
        let masked = value;
        for (const pattern of PII_PATTERNS) {
          masked = masked.replace(pattern, "[REDACTED]");
        }
        if (masked !== value) {
          // Note: attributes are immutable after span ends
          // This processor should run BEFORE export
          console.warn(`PII detected in span attribute: ${key}`);
        }
      }
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
```

### Collector-Level: Redaction Processor

```yaml
# otel-collector-config.yaml
processors:
  redaction:
    allow_all_keys: false
    allowed_keys:
      - http.method
      - http.route
      - http.status_code
      - user.id # Hashed at application level
      - tenant.id
      - order.id
    blocked_values:
      # Credit card patterns
      - "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b"
      # Email patterns
      - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"

  attributes:
    actions:
      # Hash sensitive IDs
      - key: user.email
        action: hash
      # Delete explicitly banned attributes
      - key: user.password
        action: delete
      - key: http.request.body
        action: delete
```

### Best Practices

| Practice               | Implementation                      |
| ---------------------- | ----------------------------------- |
| **Default Deny**       | Use allow-lists, not block-lists    |
| **Hash, Don't Delete** | Preserve cardinality for debugging  |
| **Classify Data**      | Tag attributes by sensitivity level |
| **Audit Regularly**    | Review what's being collected       |
| **Use Canonical IDs**  | UUIDs over emails/names             |

**Citation**: [OpenTelemetry Security - Handling Sensitive Data](https://opentelemetry.io/docs/security/handling-sensitive-data/) [^8], [Honeycomb - Data Prep and Cleansing](https://www.honeycomb.io/blog/opentelemetry-best-practices-data-prep-cleansing) [^9]

---

## Multi-Tenant Tagging

### Why Multi-Tenant Tagging?

For SaaS applications, tenant isolation in observability enables:

- **Per-tenant dashboards and alerts**
- **Cost attribution**
- **Performance comparison across tenants**
- **Compliance (data isolation)**

### Resource Attributes vs Span Attributes

| Type                    | Scope                   | Use Case                                  |
| ----------------------- | ----------------------- | ----------------------------------------- |
| **Resource Attributes** | Entire service instance | Service name, version, environment        |
| **Span Attributes**     | Individual request      | Tenant ID, user ID, request-specific data |

For multi-tenant apps, **tenant ID should be a span attribute** (varies per request).

### Implementation Pattern

```typescript
import { trace, context } from "@opentelemetry/api";

// Middleware to extract and propagate tenant context
function tenantMiddleware(req, res, next) {
  const tenantId = extractTenantId(req); // From JWT, header, subdomain, etc.

  // Get current span and add tenant attribute
  const span = trace.getSpan(context.active());
  if (span) {
    span.setAttribute("tenant.id", tenantId);
    span.setAttribute("tenant.tier", getTenantTier(tenantId)); // e.g., 'free', 'pro', 'enterprise'
  }

  // Store in request for downstream use
  req.tenantId = tenantId;
  next();
}

// Helper for manual spans
function createTenantSpan(name: string, tenantId: string, fn: () => Promise<void>) {
  const tracer = trace.getTracer("nubabel");
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("tenant.id", tenantId);
    try {
      await fn();
    } finally {
      span.end();
    }
  });
}
```

### Collector Routing by Tenant

For strict tenant isolation, route traces to different backends:

```yaml
# otel-collector-config.yaml
connectors:
  routing:
    default_pipelines: [traces/default]
    table:
      - statement: attributes["tenant.id"] == "tenant-a"
        pipelines: [traces/tenant-a]
      - statement: attributes["tenant.id"] == "tenant-b"
        pipelines: [traces/tenant-b]

exporters:
  otlp/tenant-a:
    endpoint: jaeger-tenant-a:4317
  otlp/tenant-b:
    endpoint: jaeger-tenant-b:4317
  otlp/default:
    endpoint: jaeger-default:4317

service:
  pipelines:
    traces/tenant-a:
      receivers: [routing]
      exporters: [otlp/tenant-a]
    traces/tenant-b:
      receivers: [routing]
      exporters: [otlp/tenant-b]
    traces/default:
      receivers: [routing]
      exporters: [otlp/default]
```

**Citation**: [AWS - Tracing Tenant Activity for Multi-Account SaaS](https://aws.amazon.com/blogs/apn/tracing-cross-account-tenant-activities-for-saas-solutions-with-aws-distro-for-open-telemetry) [^10], [Medium - Multi-Tenant Distributed Tracing](https://medium.com/@aaronbytestream/multi-tenant-distributed-tracing-withopentelemetry-86e1cf940d2e) [^11]

---

## OTLP Exporters

### Protocol Options

| Protocol          | Package                     | Pros                        | Cons                                    |
| ----------------- | --------------------------- | --------------------------- | --------------------------------------- |
| **HTTP/protobuf** | `exporter-trace-otlp-proto` | Balanced, firewall-friendly | Slightly larger payloads than gRPC      |
| **gRPC**          | `exporter-trace-otlp-grpc`  | Efficient, streaming        | Requires HTTP/2, complex firewall rules |
| **HTTP/JSON**     | `exporter-trace-otlp-http`  | Human-readable, debugging   | Largest payloads, slowest               |

**Recommendation**: Use HTTP/protobuf for most production deployments.

### Production Configuration

```typescript
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  headers: {
    Authorization: `Bearer ${process.env.OTEL_AUTH_TOKEN}`,
  },
  compression: "gzip", // Reduce bandwidth
  timeoutMillis: 30000,
});

// BatchSpanProcessor settings for production
const spanProcessor = new BatchSpanProcessor(traceExporter, {
  maxQueueSize: 2048, // Max spans in queue
  maxExportBatchSize: 512, // Spans per export batch
  scheduledDelayMillis: 5000, // Export interval
  exportTimeoutMillis: 30000, // Export timeout
});
```

### Environment Variable Configuration

```bash
# Exporter endpoints
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel-collector.example.com:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otel-collector.example.com:4318/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otel-collector.example.com:4318/v1/logs

# Protocol and compression
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_COMPRESSION=gzip

# Authentication
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer token123"

# BatchSpanProcessor tuning
OTEL_BSP_SCHEDULE_DELAY=5000
OTEL_BSP_MAX_QUEUE_SIZE=2048
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
OTEL_BSP_EXPORT_TIMEOUT=30000
```

**Citation**: [npm - @opentelemetry/exporter-trace-otlp-http](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-http) [^12], [Vercel AI SDK Examples](https://github.com/vercel/ai/blob/main/examples/ai-functions/src/telemetry/generate-text.ts) [^13]

---

## Minimal Setup Snippets

### Complete Production Setup

```typescript
// src/instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "nubabel-api",
  [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || "1.0.0",
  "deployment.environment": process.env.NODE_ENV || "development",
});

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  spanProcessors: [
    new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
  ],
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || "0.1")),
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    }),
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-express": {
        requestHook: (span, info) => {
          // Add tenant context from request
          const tenantId = info.request.headers["x-tenant-id"];
          if (tenantId) {
            span.setAttribute("tenant.id", tenantId);
          }
        },
      },
      "@opentelemetry/instrumentation-http": {
        // Don't trace health checks
        ignoreIncomingRequestHook: (req) => req.url === "/health",
      },
    }),
  ],
});

sdk.start();

// Graceful shutdown
const shutdown = async () => {
  try {
    await sdk.shutdown();
    console.log("OpenTelemetry SDK shut down successfully");
  } catch (err) {
    console.error("Error shutting down OpenTelemetry SDK", err);
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { sdk };
```

### Application Entry Point

```typescript
// src/index.ts
import "./instrumentation"; // MUST be first import

import express from "express";
import { logger } from "./logger";

const app = express();

app.get("/health", (req, res) => res.send("OK"));

app.get("/api/orders/:id", async (req, res) => {
  logger.info({ orderId: req.params.id }, "Fetching order");
  // ... business logic
  res.json({ id: req.params.id });
});

app.listen(3000, () => {
  logger.info("Server started on port 3000");
});
```

### Zero-Code Instrumentation (Alternative)

For simpler setups, use environment variables only:

```bash
# .env
NODE_OPTIONS="--import @opentelemetry/auto-instrumentations-node/register"
OTEL_SERVICE_NAME=nubabel-api
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_LOG_LEVEL=info
```

```bash
# Start application
node --import @opentelemetry/auto-instrumentations-node/register src/index.js
```

---

## Production Checklist

### Pre-Deployment

- [ ] OTel SDK initialized BEFORE other imports
- [ ] Service name and version set via resource attributes
- [ ] BatchSpanProcessor configured (not SimpleSpanProcessor)
- [ ] Sampling rate configured (start with 10%, adjust based on volume)
- [ ] Health check endpoints excluded from tracing
- [ ] PII redaction implemented at application and/or collector level
- [ ] Graceful shutdown handlers registered

### Collector Configuration

- [ ] Tail-based sampling for errors and slow requests
- [ ] Redaction processor for sensitive data
- [ ] Resource detection enabled (cloud metadata)
- [ ] Retry and queue limits configured
- [ ] TLS enabled for production endpoints

### Monitoring the Monitors

- [ ] Collector health metrics exposed
- [ ] Exporter error rates monitored
- [ ] Queue overflow alerts configured
- [ ] Sampling effectiveness reviewed periodically

### Multi-Tenant Considerations

- [ ] Tenant ID propagated in all spans
- [ ] Per-tenant dashboards created
- [ ] Cost attribution reports configured
- [ ] Data isolation verified (if required)

---

## References

[^1]: OpenTelemetry. "Getting Started with Node.js." https://opentelemetry.io/docs/languages/js/getting-started/nodejs/

[^2]: OpenTelemetry JS Contrib. "Express Instrumentation." https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express

[^3]: Backstage. "OpenTelemetry Instrumentation." https://github.com/backstage/backstage/blob/master/packages/backend/src/instrumentation.js

[^4]: SigNoz. "Correlating Traces, Logs, and Metrics in Node.js." https://signoz.io/opentelemetry/correlating-traces-logs-metrics-nodejs/

[^5]: Pino. "pino-opentelemetry-transport." https://github.com/pinojs/pino-opentelemetry-transport

[^6]: Uptrace. "OpenTelemetry Sampling: Head-based and Tail-based." https://uptrace.dev/opentelemetry/sampling.html

[^7]: base14 Scout. "Node.js OpenTelemetry Instrumentation Guide." https://docs.base14.io/instrument/apps/auto-instrumentation/nodejs/

[^8]: OpenTelemetry. "Handling Sensitive Data." https://opentelemetry.io/docs/security/handling-sensitive-data/

[^9]: Honeycomb. "OpenTelemetry Best Practices: Data Prep and Cleansing." https://www.honeycomb.io/blog/opentelemetry-best-practices-data-prep-cleansing

[^10]: AWS. "Tracing Tenant Activity for Multi-Account SaaS with ADOT." https://aws.amazon.com/blogs/apn/tracing-cross-account-tenant-activities-for-saas-solutions-with-aws-distro-for-open-telemetry

[^11]: Medium. "Multi-Tenant Distributed Tracing with OpenTelemetry." https://medium.com/@aaronbytestream/multi-tenant-distributed-tracing-withopentelemetry-86e1cf940d2e

[^12]: npm. "@opentelemetry/exporter-trace-otlp-http." https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-http

[^13]: Vercel AI SDK. "Telemetry Examples." https://github.com/vercel/ai/blob/main/examples/ai-functions/src/telemetry/generate-text.ts

---

## Additional Resources

- [OpenTelemetry Official Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry JS SDK](https://github.com/open-telemetry/opentelemetry-js)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [BetterStack - OpenTelemetry Best Practices](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)
- [Last9 - OpenTelemetry Express Guide](https://last9.io/blog/opentelemetry-express/)
