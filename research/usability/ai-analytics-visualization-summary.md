# AI Usage Analytics Visualization: Concise Summary

**Created**: 2026-01-26  
**Purpose**: Quick reference for implementing AI-specific metrics dashboards  
**Focus**: Token usage, model performance, cost tracking

---

## 1. Token Usage Visualization

### Core Metrics to Track

```typescript
interface TokenMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number; // Anthropic prompt caching
  cacheWriteTokens: number; // Anthropic prompt caching
  timestamp: Date;
}
```

### Recommended Visualizations

| Metric                    | Chart Type        | Purpose                       |
| ------------------------- | ----------------- | ----------------------------- |
| **Token usage over time** | Line/Area Chart   | Identify trends and spikes    |
| **Token distribution**    | Histogram         | Find outliers (P50, P90, P99) |
| **Token by model**        | Stacked Bar Chart | Compare model efficiency      |
| **Token by feature**      | Treemap           | Identify high-usage features  |

### Implementation Pattern

```typescript
// Time-series aggregation (1-minute buckets)
const tokenUsageData = await prisma.aIUsage.groupBy({
  by: ['createdAt', 'model'],
  where: {
    organizationId,
    createdAt: { gte: startDate, lte: endDate }
  },
  _sum: {
    inputTokens: true,
    outputTokens: true,
    cacheReadTokens: true,
    cacheWriteTokens: true
  }
});

// Recharts visualization
<LineChart data={tokenUsageData}>
  <XAxis dataKey="timestamp" />
  <YAxis />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="inputTokens" stroke="#8884d8" />
  <Line type="monotone" dataKey="outputTokens" stroke="#82ca9d" />
  <Line type="monotone" dataKey="cacheReadTokens" stroke="#ffc658" />
</LineChart>
```

---

## 2. Model Performance Metrics

### Core Metrics to Track

```typescript
interface PerformanceMetrics {
  model: string;
  latencyMs: number; // Total request time
  timeToFirstToken: number; // TTFT (streaming)
  tokensPerSecond: number; // TPOT (streaming)
  successRate: number; // % successful requests
  errorRate: number; // % failed requests
  errorTypes: Record<string, number>;
}
```

### Recommended Visualizations

| Metric                  | Chart Type               | Purpose                       |
| ----------------------- | ------------------------ | ----------------------------- |
| **Latency percentiles** | Line Chart (P50/P90/P99) | Monitor performance SLAs      |
| **Success rate**        | Gauge Chart              | Real-time health indicator    |
| **Error distribution**  | Pie/Donut Chart          | Identify error patterns       |
| **Model comparison**    | Grouped Bar Chart        | Compare latency across models |
| **Latency heatmap**     | Heatmap                  | Time-of-day patterns          |

### Implementation Pattern (Prometheus-style)

```typescript
// Track latency with histogram buckets
const latencyBuckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

// Calculate percentiles
function calculatePercentiles(latencies: number[]) {
  const sorted = latencies.sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

// Visualization
<LineChart data={latencyData}>
  <XAxis dataKey="timestamp" />
  <YAxis label="Latency (ms)" />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="p50" stroke="#82ca9d" name="P50" />
  <Line type="monotone" dataKey="p90" stroke="#ffc658" name="P90" />
  <Line type="monotone" dataKey="p99" stroke="#ff7c7c" name="P99" />
</LineChart>
```

---

## 3. Cost Tracking Dashboard

### Core Metrics to Track

```typescript
interface CostMetrics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByUser: Record<string, number>;
  costByFeature: Record<string, number>;
  budgetUtilization: number; // % of monthly budget used
}
```

### Anthropic Pricing (2026)

```typescript
const ANTHROPIC_PRICING = {
  "claude-opus-4": {
    input: 15.0, // $ per 1M tokens
    output: 75.0,
  },
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
  },
  "claude-haiku-4": {
    input: 0.25,
    output: 1.25,
  },
};

// Cost calculation
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = ANTHROPIC_PRICING[model];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
```

### Recommended Visualizations

| Metric                    | Chart Type         | Purpose                                |
| ------------------------- | ------------------ | -------------------------------------- |
| **Daily cost trend**      | Stacked Area Chart | Track spending over time               |
| **Cost breakdown**        | Treemap            | Hierarchical view (org → user → model) |
| **Budget utilization**    | Gauge Chart        | Alert on budget limits                 |
| **Cost per request**      | Line Chart         | Monitor efficiency                     |
| **Model cost comparison** | Bar Chart          | Identify expensive models              |

### Implementation Pattern

```typescript
// Daily cost aggregation
const dailyCosts = await prisma.aIUsage.groupBy({
  by: ['createdAt', 'model'],
  where: {
    organizationId,
    createdAt: { gte: startOfMonth }
  },
  _sum: { cost: true, inputTokens: true, outputTokens: true }
});

// Budget check
async function checkBudget(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { aiMonthlyBudget: true }
  });

  const spent = await prisma.aIUsage.aggregate({
    where: {
      organizationId,
      createdAt: { gte: startOfMonth }
    },
    _sum: { cost: true }
  });

  return {
    spent: spent._sum.cost || 0,
    limit: org.aiMonthlyBudget || 100,
    utilization: ((spent._sum.cost || 0) / (org.aiMonthlyBudget || 100)) * 100
  };
}

// Visualization
<GaugeChart
  value={budgetUtilization}
  max={100}
  label="Budget Utilization"
  thresholds={[
    { value: 70, color: 'green' },
    { value: 85, color: 'yellow' },
    { value: 100, color: 'red' }
  ]}
/>
```

---

## 4. Real-Time Monitoring Patterns

### Essential Real-Time Metrics

```typescript
interface RealtimeMetrics {
  currentRPS: number; // Requests per second
  activeConcurrentRequests: number;
  avgLatencyLast1Min: number;
  errorRateLast5Min: number;
  costPerHour: number;
}
```

### Recommended Visualizations

| Metric                 | Chart Type   | Update Frequency |
| ---------------------- | ------------ | ---------------- |
| **Live activity feed** | List/Table   | 1-5 seconds      |
| **Current RPS**        | Sparkline    | 5 seconds        |
| **Active requests**    | Number Badge | 5 seconds        |
| **Rolling latency**    | Line Chart   | 10 seconds       |
| **Error rate**         | Gauge        | 30 seconds       |

### Implementation Pattern (WebSocket/SSE)

```typescript
// Server-Sent Events for real-time updates
app.get("/api/analytics/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(async () => {
    const metrics = await getRealtimeMetrics(req.organizationId);
    res.write(`data: ${JSON.stringify(metrics)}\n\n`);
  }, 5000); // Update every 5 seconds

  req.on("close", () => clearInterval(interval));
});

// Client-side (React)
useEffect(() => {
  const eventSource = new EventSource("/api/analytics/stream");

  eventSource.onmessage = (event) => {
    const metrics = JSON.parse(event.data);
    setRealtimeMetrics(metrics);
  };

  return () => eventSource.close();
}, []);
```

---

## 5. Alert Thresholds

### Recommended Alert Configuration

```typescript
const ALERT_THRESHOLDS = {
  latency: {
    warning: 5000, // P95 > 5s
    critical: 10000, // P95 > 10s
  },
  errorRate: {
    warning: 0.05, // 5% error rate
    critical: 0.1, // 10% error rate
  },
  cost: {
    warning: 0.85, // 85% of monthly budget
    critical: 0.95, // 95% of monthly budget
  },
  tokenAnomaly: {
    threshold: 1.5, // 50% above average
  },
};

// Alert check
async function checkAlerts(organizationId: string) {
  const metrics = await getCurrentMetrics(organizationId);
  const alerts = [];

  if (metrics.p95Latency > ALERT_THRESHOLDS.latency.critical) {
    alerts.push({
      severity: "critical",
      type: "latency",
      message: `P95 latency is ${metrics.p95Latency}ms (threshold: 10000ms)`,
    });
  }

  if (metrics.errorRate > ALERT_THRESHOLDS.errorRate.warning) {
    alerts.push({
      severity: "warning",
      type: "error_rate",
      message: `Error rate is ${(metrics.errorRate * 100).toFixed(2)}%`,
    });
  }

  return alerts;
}
```

---

## 6. Technology Stack Recommendations

### Visualization Libraries

| Library            | Best For              | Pros                          | Cons                   |
| ------------------ | --------------------- | ----------------------------- | ---------------------- |
| **Recharts**       | Custom dashboards     | React-native, composable      | Limited interactivity  |
| **Chart.js**       | Simple charts         | Lightweight, fast             | Basic features         |
| **Apache ECharts** | Enterprise dashboards | Rich features, large datasets | Steeper learning curve |
| **Plotly**         | Scientific analysis   | 3D charts, statistical        | Heavy bundle size      |

### Monitoring Platforms

| Platform          | Best For              | Cost               |
| ----------------- | --------------------- | ------------------ |
| **Grafana**       | Production monitoring | Free (self-hosted) |
| **Datadog**       | Enterprise APM        | $15-31/host/month  |
| **Langfuse**      | LLM observability     | Free (self-hosted) |
| **Arize Phoenix** | ML monitoring         | Free (open source) |

### Recommended Stack for Nubabel

```typescript
// Frontend: Recharts + TanStack Query
import { LineChart, BarChart, PieChart } from "recharts";
import { useQuery } from "@tanstack/react-query";

// Backend: Prometheus metrics + PostgreSQL analytics
import { Histogram, Counter, Gauge } from "prom-client";

// Real-time: Server-Sent Events (SSE)
// Alerting: Custom alerts + email/Slack notifications
```

---

## 7. Database Schema for AI Analytics

```prisma
model AIUsage {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  model          String
  inputTokens    Int
  outputTokens   Int
  cacheReadTokens Int?
  cacheWriteTokens Int?
  cost           Float
  latencyMs      Int
  category       String   // e.g., "orchestrator", "slack-bot", "workflow"
  success        Boolean
  errorType      String?
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@index([organizationId, createdAt])
  @@index([model, createdAt])
  @@index([category, createdAt])
}
```

---

## 8. Quick Implementation Checklist

### Phase 1: Core Tracking (Week 1)

- [ ] Add `AIUsage` table to Prisma schema
- [ ] Implement `calculateCost()` function
- [ ] Log all AI API calls to database
- [ ] Create basic cost aggregation queries

### Phase 2: Basic Dashboard (Week 2)

- [ ] Daily cost chart (Recharts Line Chart)
- [ ] Token usage breakdown (Stacked Bar Chart)
- [ ] Budget utilization gauge
- [ ] Model comparison table

### Phase 3: Performance Metrics (Week 3)

- [ ] Latency percentile tracking (P50/P90/P99)
- [ ] Success/error rate monitoring
- [ ] Error type distribution chart
- [ ] Model performance comparison

### Phase 4: Real-Time Monitoring (Week 4)

- [ ] SSE endpoint for live metrics
- [ ] Real-time activity feed
- [ ] Alert system (email/Slack)
- [ ] Anomaly detection (cost spikes)

---

## 9. Key Formulas

### Cost Efficiency Metrics

```typescript
// Cost per successful request
const costPerRequest = totalCost / successfulRequests;

// Cost efficiency score
const costEfficiency = qualityScore / costPerRequest;

// Performance score
const performanceScore = successRate * (1 / p95Latency);

// ROI calculation
const roi = businessValue / totalAICost;

// Token efficiency (tokens per dollar)
const tokenEfficiency = totalTokens / totalCost;
```

### Budget Forecasting

```typescript
// Predict end-of-month cost
function forecastMonthlyCost(currentSpent: number, daysElapsed: number): number {
  const daysInMonth = 30;
  const dailyAverage = currentSpent / daysElapsed;
  return dailyAverage * daysInMonth;
}

// Alert if forecast exceeds budget
const forecast = forecastMonthlyCost(spent, daysElapsed);
if (forecast > monthlyBudget * 0.95) {
  sendAlert("Budget forecast exceeds limit");
}
```

---

## 10. Production Examples

### Langfuse Pattern (Open Source)

- **Tracing**: Nested span visualization for multi-step LLM calls
- **Analytics**: Token usage, cost, latency by tags
- **Prompt Management**: A/B test metrics

### OpenAI Dashboard Pattern

- **Daily Usage**: Stacked area chart by model
- **Cost Breakdown**: Pie chart by project
- **Activity Log**: Searchable table with filters

### Arize Phoenix Pattern

- **Embedding Viz**: UMAP/t-SNE clustering
- **Drift Detection**: Distribution comparison
- **Retrieval Analysis**: Relevance heatmaps for RAG

---

## Summary: Essential Metrics

| Category        | Top 3 Metrics                                     | Visualization           |
| --------------- | ------------------------------------------------- | ----------------------- |
| **Token Usage** | Total tokens, Input/Output ratio, Cache hit rate  | Line Chart, Stacked Bar |
| **Performance** | P95 latency, Success rate, Error distribution     | Line Chart, Gauge, Pie  |
| **Cost**        | Daily spend, Budget utilization, Cost per request | Area Chart, Gauge, Line |
| **Real-Time**   | Current RPS, Active requests, Error rate          | Sparkline, Badge, Gauge |

**Critical Implementation**: Start with cost tracking (highest ROI), then add performance metrics, then real-time monitoring.

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-26  
**Research Sources**:

- Batch 2 research findings (cloud-cost-optimization-guide.md, ai-error-handling-guide.md)
- Librarian agent research (AI analytics visualization patterns)
- Production systems (Langfuse, Arize Phoenix, OpenAI, Anthropic)
