import { Router, Request, Response } from "express";
import { getPoolStats, redis, withQueueConnection } from "../db/redis";
import { getAllCircuitBreakers } from "../utils/circuit-breaker";
import { logger } from "../utils/logger";

interface MetricValue {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram" | "summary";
  values: Array<{
    labels: Record<string, string>;
    value: number;
  }>;
}

interface MetricDefinition {
  help: string;
  type: "counter" | "gauge" | "histogram" | "summary";
}

class MetricsCollector {
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, number>> = new Map();
  private histograms: Map<string, Map<string, number[]>> = new Map();
  private definitions: Map<string, MetricDefinition> = new Map();

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelKey(labels);
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    const counter = this.counters.get(name)!;
    counter.set(key, (counter.get(key) || 0) + value);
  }

  setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = this.labelKey(labels);
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    this.gauges.get(name)!.set(key, value);
  }

  observeHistogram(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = this.labelKey(labels);
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
    }
    const histogram = this.histograms.get(name)!;
    if (!histogram.has(key)) {
      histogram.set(key, []);
    }
    histogram.get(key)!.push(value);
  }

  describeMetric(name: string, definition: MetricDefinition): void {
    this.definitions.set(name, definition);
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
  }

  async collect(): Promise<MetricValue[]> {
    const metrics: MetricValue[] = [];

    for (const [name, values] of this.counters) {
      const definition = this.definitions.get(name);
      metrics.push({
        name,
        help: definition?.help || `Counter for ${name}`,
        type: definition?.type || "counter",
        values: Array.from(values.entries()).map(([key, value]) => ({
          labels: this.parseLabels(key),
          value,
        })),
      });
    }

    for (const [name, values] of this.gauges) {
      const definition = this.definitions.get(name);
      metrics.push({
        name,
        help: definition?.help || `Gauge for ${name}`,
        type: definition?.type || "gauge",
        values: Array.from(values.entries()).map(([key, value]) => ({
          labels: this.parseLabels(key),
          value,
        })),
      });
    }

    await this.collectSystemMetrics(metrics);
    await this.collectQueueMetrics(metrics);
    await this.collectCircuitBreakerMetrics(metrics);

    return metrics;
  }

  getCounterValues(name: string): Array<{ labels: Record<string, string>; value: number }> {
    const values = this.counters.get(name);
    if (!values) {
      return [];
    }

    return Array.from(values.entries()).map(([key, value]) => ({
      labels: this.parseLabels(key),
      value,
    }));
  }

  getHistogramValues(name: string): number[] {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      return [];
    }

    const observations: number[] = [];
    for (const values of histogram.values()) {
      observations.push(...values);
    }

    return observations;
  }

  private parseLabels(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    const matches = key.matchAll(/(\w+)="([^"]+)"/g);
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    return labels;
  }

  private async collectSystemMetrics(metrics: MetricValue[]): Promise<void> {
    const memUsage = process.memoryUsage();

    metrics.push({
      name: "nodejs_heap_size_bytes",
      help: "Process heap size in bytes",
      type: "gauge",
      values: [{ labels: { type: "total" }, value: memUsage.heapTotal }],
    });

    metrics.push({
      name: "nodejs_heap_used_bytes",
      help: "Process heap used in bytes",
      type: "gauge",
      values: [{ labels: { type: "used" }, value: memUsage.heapUsed }],
    });

    metrics.push({
      name: "nodejs_external_memory_bytes",
      help: "Process external memory in bytes",
      type: "gauge",
      values: [{ labels: {}, value: memUsage.external }],
    });

    metrics.push({
      name: "process_uptime_seconds",
      help: "Process uptime in seconds",
      type: "gauge",
      values: [{ labels: {}, value: Math.floor(process.uptime()) }],
    });
  }

  private async collectQueueMetrics(metrics: MetricValue[]): Promise<void> {
    try {
      const queueNames = [
        "webhooks",
        "orchestration",
        "notifications",
        "slack-events",
        "dead-letter",
      ];

      for (const queueName of queueNames) {
        const waitingKey = `bull:${queueName}:wait`;
        const activeKey = `bull:${queueName}:active`;
        const completedKey = `bull:${queueName}:completed`;
        const failedKey = `bull:${queueName}:failed`;

        const [waiting, active, completed, failed] = await Promise.all([
          this.getListLength(waitingKey),
          this.getListLength(activeKey),
          this.getSetSize(completedKey),
          this.getSetSize(failedKey),
        ]);

        metrics.push({
          name: "bullmq_queue_jobs",
          help: "Number of jobs in queue by state",
          type: "gauge",
          values: [
            { labels: { queue: queueName, state: "waiting" }, value: waiting },
            { labels: { queue: queueName, state: "active" }, value: active },
            { labels: { queue: queueName, state: "completed" }, value: completed },
            { labels: { queue: queueName, state: "failed" }, value: failed },
          ],
        });
      }
    } catch (error) {
      logger.error("Failed to collect queue metrics", { error });
    }
  }

  private async getListLength(key: string): Promise<number> {
    try {
      const result = await redis.lrange(key, 0, -1);
      return result.length;
    } catch {
      return 0;
    }
  }

  private async getSetSize(key: string): Promise<number> {
    try {
      return await withQueueConnection((client) => client.zcard(key));
    } catch {
      return 0;
    }
  }

  private async collectCircuitBreakerMetrics(metrics: MetricValue[]): Promise<void> {
    const breakers = getAllCircuitBreakers();

    for (const [name, breaker] of breakers) {
      const stats = breaker.getStats();
      const stateValue = stats.state === "CLOSED" ? 0 : stats.state === "HALF_OPEN" ? 1 : 2;

      metrics.push({
        name: "circuit_breaker_state",
        help: "Circuit breaker state (0=closed, 1=half_open, 2=open)",
        type: "gauge",
        values: [{ labels: { name }, value: stateValue }],
      });

      metrics.push({
        name: "circuit_breaker_failures",
        help: "Circuit breaker failure count",
        type: "gauge",
        values: [{ labels: { name }, value: stats.failureCount }],
      });
    }
  }

  formatPrometheus(metrics: MetricValue[]): string {
    const lines: string[] = [];

    for (const metric of metrics) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      for (const { labels, value } of metric.values) {
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");

        if (labelStr) {
          lines.push(`${metric.name}{${labelStr}} ${value}`);
        } else {
          lines.push(`${metric.name} ${value}`);
        }
      }
    }

    return lines.join("\n") + "\n";
  }
}

export const metricsCollector = new MetricsCollector();

metricsCollector.describeMetric("mcp_pool_acquisitions_total", {
  help: "Total MCP connection pool acquisitions",
  type: "counter",
});
metricsCollector.describeMetric("mcp_pool_timeouts_total", {
  help: "Total MCP connection pool acquire timeouts",
  type: "counter",
});
metricsCollector.describeMetric("mcp_pool_evictions_total", {
  help: "Total MCP connection pool evictions",
  type: "counter",
});

export class Gauge {
  private name: string;

  constructor(config: { name: string; help: string; labelNames: string[] }) {
    this.name = config.name;
    metricsCollector.describeMetric(config.name, { help: config.help, type: "gauge" });
  }

  set(value: number, labels: Record<string, string> = {}): void {
    metricsCollector.setGauge(this.name, labels, value);
  }
}

export const httpErrorRate = new Gauge({
  name: "http_error_rate",
  help: "Percentage of HTTP requests that failed (5xx)",
  labelNames: [],
});

export const httpLatencyP95 = new Gauge({
  name: "http_latency_p95_seconds",
  help: "P95 latency for HTTP requests",
  labelNames: [],
});

export const httpLatencyP99 = new Gauge({
  name: "http_latency_p99_seconds",
  help: "P99 latency for HTTP requests",
  labelNames: [],
});

export const redisPoolSize = new Gauge({
  name: "redis_pool_size",
  help: "Current Redis pool size",
  labelNames: ["pool", "state"],
});

export const mcpPoolSize = new Gauge({
  name: "mcp_pool_size",
  help: "Current MCP connection pool size",
  labelNames: ["provider", "state"],
});

setInterval(() => {
  if (!shouldRecordMetrics()) {
    return;
  }

  const stats = getPoolStats();
  redisPoolSize.set(stats.queue.available, { pool: "queue", state: "available" });
  redisPoolSize.set(stats.queue.inUse, { pool: "queue", state: "inUse" });
  redisPoolSize.set(stats.worker.available, { pool: "worker", state: "available" });
  redisPoolSize.set(stats.worker.inUse, { pool: "worker", state: "inUse" });
}, 5000).unref?.();

export function calculateSLI(): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  const counterValues = metricsCollector.getCounterValues("http_requests_total");
  let total = 0;
  let errors = 0;

  for (const { labels, value } of counterValues) {
    total += value;
    if (labels.status && labels.status.startsWith("5")) {
      errors += value;
    }
  }

  const errorRate = total === 0 ? 0 : (errors / total) * 100;
  httpErrorRate.set(errorRate);

  const durations = metricsCollector.getHistogramValues("http_request_duration_seconds");
  const p95 = percentile(durations, 0.95);
  const p99 = percentile(durations, 0.99);
  httpLatencyP95.set(p95);
  httpLatencyP99.set(p99);
}

export function createMetricsRouter(): Router {
  const router = Router();

  router.get("/metrics", async (_req: Request, res: Response) => {
    try {
      const metrics = await metricsCollector.collect();
      const output = metricsCollector.formatPrometheus(metrics);

      res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.send(output);
    } catch (error) {
      logger.error("Failed to collect metrics", { error });
      res.status(500).send("Failed to collect metrics");
    }
  });

  return router;
}

export function recordHttpRequest(params: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
}): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  const { method, path, statusCode, duration } = params;
  metricsCollector.incrementCounter("http_requests_total", {
    method,
    path: normalizePath(path),
    status: String(statusCode),
  });

  metricsCollector.observeHistogram(
    "http_request_duration_seconds",
    {
      method,
      path: normalizePath(path),
    },
    duration / 1000,
  );
}

export function recordAiRequest(params: {
  model: string;
  category: string;
  success: boolean;
  duration: number;
  inputTokens: number;
  outputTokens: number;
}): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  const { model, category, success, duration, inputTokens, outputTokens } = params;
  metricsCollector.incrementCounter("ai_requests_total", {
    model,
    category,
    success: String(success),
  });

  metricsCollector.observeHistogram(
    "ai_request_duration_seconds",
    {
      model,
      category,
    },
    duration / 1000,
  );

  metricsCollector.incrementCounter(
    "ai_tokens_total",
    {
      model,
      type: "input",
    },
    inputTokens,
  );

  metricsCollector.incrementCounter(
    "ai_tokens_total",
    {
      model,
      type: "output",
    },
    outputTokens,
  );

  metricsCollector.incrementCounter(
    "ai_tokens_total",
    {
      model,
      type: "total",
    },
    inputTokens + outputTokens,
  );
}

export function recordMcpToolCall(params: {
  provider: string;
  toolName: string;
  success: boolean;
  duration: number;
}): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  const { provider, toolName, success, duration } = params;
  metricsCollector.incrementCounter("mcp_tool_calls_total", {
    provider,
    tool: toolName,
    success: String(success),
  });

  metricsCollector.observeHistogram(
    "mcp_tool_duration_seconds",
    {
      provider,
      tool: toolName,
    },
    duration / 1000,
  );
}

export function recordMcpPoolAcquisition(provider: string): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  metricsCollector.incrementCounter("mcp_pool_acquisitions_total", {
    provider,
  });
}

export function recordMcpPoolTimeout(provider: string): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  metricsCollector.incrementCounter("mcp_pool_timeouts_total", {
    provider,
  });
}

export function recordMcpPoolEviction(provider: string, count = 1): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  metricsCollector.incrementCounter(
    "mcp_pool_evictions_total",
    {
      provider,
    },
    count,
  );
}

export function recordMcpPoolSize(provider: string, active: number, idle: number): void {
  if (!shouldRecordMetrics()) {
    return;
  }

  mcpPoolSize.set(active, { provider, state: "active" });
  mcpPoolSize.set(idle, { provider, state: "idle" });
}

function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function shouldRecordMetrics(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "development" && env !== "test";
}
