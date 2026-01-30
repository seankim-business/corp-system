/**
 * Prometheus-compatible Metrics Exporter
 *
 * Implements Prometheus text exposition format without external dependencies.
 * Provides Counter, Gauge, and Histogram primitives plus a singleton registry.
 */

import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return (
    "{" +
    entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",") +
    "}"
  );
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

// ---------------------------------------------------------------------------
// Metric interface
// ---------------------------------------------------------------------------

interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: "counter" | "gauge" | "histogram";
  collect(): string;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

export class Counter implements Metric {
  readonly name: string;
  readonly help: string;
  readonly type = "counter" as const;
  private readonly labelNames: string[];
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  constructor(config: { name: string; help: string; labels: string[] }) {
    this.name = config.name;
    this.help = config.help;
    this.labelNames = config.labels;
  }

  inc(labels?: Labels, value = 1): void {
    const resolved = labels ?? {};
    const key = labelKey(resolved);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels: resolved, value });
    }
  }

  get(labels?: Labels): number {
    const key = labelKey(labels ?? {});
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    for (const entry of Array.from(this.values.values())) {
      lines.push(`${this.name}${formatLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join("\n");
  }

  /** Exposed for introspection only. */
  getLabelNames(): string[] {
    return this.labelNames;
  }
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

export class Gauge implements Metric {
  readonly name: string;
  readonly help: string;
  readonly type = "gauge" as const;
  private readonly labelNames: string[];
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  constructor(config: { name: string; help: string; labels: string[] }) {
    this.name = config.name;
    this.help = config.help;
    this.labelNames = config.labels;
  }

  set(labels: Labels | undefined, value: number): void {
    const resolved = labels ?? {};
    const key = labelKey(resolved);
    const existing = this.values.get(key);
    if (existing) {
      existing.value = value;
    } else {
      this.values.set(key, { labels: resolved, value });
    }
  }

  inc(labels?: Labels, value = 1): void {
    const resolved = labels ?? {};
    const key = labelKey(resolved);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels: resolved, value });
    }
  }

  dec(labels?: Labels, value = 1): void {
    const resolved = labels ?? {};
    const key = labelKey(resolved);
    const existing = this.values.get(key);
    if (existing) {
      existing.value -= value;
    } else {
      this.values.set(key, { labels: resolved, value: -value });
    }
  }

  get(labels?: Labels): number {
    const key = labelKey(labels ?? {});
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);
    for (const entry of Array.from(this.values.values())) {
      lines.push(`${this.name}${formatLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join("\n");
  }

  /** Exposed for introspection only. */
  getLabelNames(): string[] {
    return this.labelNames;
  }
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface HistogramEntry {
  labels: Labels;
  sum: number;
  count: number;
  bucketCounts: number[]; // one per bucket + +Inf
}

export class Histogram implements Metric {
  readonly name: string;
  readonly help: string;
  readonly type = "histogram" as const;
  private readonly labelNames: string[];
  private readonly buckets: number[];
  private readonly entries = new Map<string, HistogramEntry>();

  constructor(config: {
    name: string;
    help: string;
    labels: string[];
    buckets?: number[];
  }) {
    this.name = config.name;
    this.help = config.help;
    this.labelNames = config.labels;
    this.buckets = config.buckets
      ? [...config.buckets].sort((a, b) => a - b)
      : [...DEFAULT_BUCKETS];
  }

  observe(labels: Labels | undefined, value: number): void {
    const resolved = labels ?? {};
    const key = labelKey(resolved);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        labels: resolved,
        sum: 0,
        count: 0,
        bucketCounts: new Array(this.buckets.length + 1).fill(0), // +1 for +Inf
      };
      this.entries.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        entry.bucketCounts[i] += 1;
      }
    }
    // +Inf bucket always increments
    entry.bucketCounts[this.buckets.length] += 1;
  }

  get(labels?: Labels): { sum: number; count: number } {
    const key = labelKey(labels ?? {});
    const entry = this.entries.get(key);
    return entry ? { sum: entry.sum, count: entry.count } : { sum: 0, count: 0 };
  }

  reset(): void {
    this.entries.clear();
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    for (const entry of Array.from(this.entries.values())) {
      const baseLabelStr = formatLabels(entry.labels);

      // Cumulative bucket counts
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += entry.bucketCounts[i];
        const bucketLabels: Labels = { ...entry.labels, le: String(this.buckets[i]) };
        lines.push(`${this.name}_bucket${formatLabels(bucketLabels)} ${cumulative}`);
      }
      // +Inf bucket
      const infLabels: Labels = { ...entry.labels, le: "+Inf" };
      lines.push(`${this.name}_bucket${formatLabels(infLabels)} ${entry.count}`);

      // Sum and count
      lines.push(`${this.name}_sum${baseLabelStr} ${entry.sum}`);
      lines.push(`${this.name}_count${baseLabelStr} ${entry.count}`);
    }
    return lines.join("\n");
  }

  /** Exposed for introspection only. */
  getLabelNames(): string[] {
    return this.labelNames;
  }
}

// ---------------------------------------------------------------------------
// MetricsRegistry (Singleton)
// ---------------------------------------------------------------------------

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private readonly metrics: Metric[] = [];

  private constructor() {
    // singleton
  }

  static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  register<T extends Metric>(metric: T): T {
    this.metrics.push(metric);
    return metric;
  }

  collect(): string {
    try {
      const sections: string[] = [];
      for (const metric of this.metrics) {
        const output = metric.collect();
        if (output) {
          sections.push(output);
        }
      }
      return sections.join("\n\n") + "\n";
    } catch (error) {
      logger.error("Failed to collect Prometheus metrics", { error });
      return "";
    }
  }

  clear(): void {
    for (const metric of this.metrics) {
      metric.reset();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton registry instance
// ---------------------------------------------------------------------------

export const metricsRegistry = MetricsRegistry.getInstance();

// ---------------------------------------------------------------------------
// Pre-registered metrics
// ---------------------------------------------------------------------------

export const httpRequestsTotal = metricsRegistry.register(
  new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labels: ["method", "path", "status"],
  }),
);

export const httpRequestDurationMs = metricsRegistry.register(
  new Histogram({
    name: "http_request_duration_ms",
    help: "HTTP request duration in milliseconds",
    labels: ["method", "path"],
  }),
);

export const queueJobsTotal = metricsRegistry.register(
  new Counter({
    name: "queue_jobs_total",
    help: "Total queue jobs processed",
    labels: ["queue", "status"],
  }),
);

export const queueJobDurationMs = metricsRegistry.register(
  new Histogram({
    name: "queue_job_duration_ms",
    help: "Queue job duration in milliseconds",
    labels: ["queue"],
  }),
);

export const sseConnectionsActive = metricsRegistry.register(
  new Gauge({
    name: "sse_connections_active",
    help: "Currently active SSE connections",
    labels: ["organization_id"],
  }),
);

export const cacheOperationsTotal = metricsRegistry.register(
  new Counter({
    name: "cache_operations_total",
    help: "Total cache operations",
    labels: ["operation", "result"],
  }),
);

export const orchestrationDurationMs = metricsRegistry.register(
  new Histogram({
    name: "orchestration_duration_ms",
    help: "Orchestration execution duration in milliseconds",
    labels: ["skill_id"],
  }),
);

export const errorsTotal = metricsRegistry.register(
  new Counter({
    name: "errors_total",
    help: "Total errors",
    labels: ["type", "source"],
  }),
);

// ---------------------------------------------------------------------------
// Helper: record HTTP metrics in one call
// ---------------------------------------------------------------------------

export function recordHttpMetrics(
  method: string,
  path: string,
  status: string,
  durationMs: number,
): void {
  httpRequestsTotal.inc({ method, path, status });
  httpRequestDurationMs.observe({ method, path }, durationMs);
}
