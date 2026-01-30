/**
 * Application Performance Monitoring (APM) Service
 *
 * Provides traditional APM features beyond the existing OpenTelemetry tracing:
 * - Transaction tracking with nested spans and lifecycle timings
 * - Error rate monitoring by endpoint and service
 * - Apdex score calculation (Application Performance Index)
 * - Dependency mapping for external service call performance
 * - Custom metrics collection for business-level KPIs
 * - Alerting thresholds for performance degradation detection
 * - Performance budgets with enforcement and violation reporting
 *
 * All metrics are stored in Redis with the `apm:` prefix using 1-hour
 * rolling windows so data automatically expires.
 */

import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// =============================================================================
// Constants
// =============================================================================

/** Default Apdex threshold in milliseconds (T). */
const DEFAULT_APDEX_THRESHOLD_MS = 500;

/** Rolling window TTL in seconds (1 hour). */
const ROLLING_WINDOW_TTL_SECONDS = 3600;

/** Maximum in-memory transactions before oldest are evicted. */
const MAX_ACTIVE_TRANSACTIONS = 10_000;

/** Maximum in-memory custom metric entries before pruning. */
const MAX_CUSTOM_METRIC_ENTRIES = 50_000;

/** Redis key prefix for all APM data. */
const REDIS_PREFIX = "apm:";

// =============================================================================
// Types
// =============================================================================

export interface Span {
  name: string;
  startTime: number;
  endTime: number | undefined;
  status: string;
  tags: Record<string, string>;
}

export interface Transaction {
  id: string;
  name: string;
  type: string;
  startTime: number;
  endTime: number | undefined;
  status: string;
  tags: Record<string, string>;
  spans: Span[];
  addSpan: (name: string) => Span;
  setStatus: (status: string) => void;
  addTag: (key: string, value: string) => void;
}

export interface DependencyMetrics {
  name: string;
  totalCalls: number;
  totalErrors: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  p99ResponseMs: number;
  errorRate: number;
}

export interface BudgetViolation {
  endpoint: string;
  budgetMs: number;
  actualP95Ms: number;
  exceededBy: number;
  violatedAt: string;
}

export interface CustomMetricEntry {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

export interface ServiceOverview {
  totalTransactions: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  p99ResponseMs: number;
  errorRate: number;
  apdex: number;
  activeTransactions: number;
  budgetViolations: BudgetViolation[];
  topEndpoints: EndpointSummary[];
  dependencies: DependencyMetrics[];
}

export interface EndpointSummary {
  name: string;
  count: number;
  avgMs: number;
  errorRate: number;
}

interface AlertThreshold {
  metric: string;
  operator: "gt" | "lt" | "gte" | "lte";
  value: number;
  windowMs: number;
  label: string;
}

interface AlertViolation {
  threshold: AlertThreshold;
  currentValue: number;
  detectedAt: string;
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function currentWindowKey(): string {
  const now = Date.now();
  const windowStart = Math.floor(now / (ROLLING_WINDOW_TTL_SECONDS * 1000));
  return String(windowStart);
}

// =============================================================================
// APM Service
// =============================================================================

export class APMService {
  private activeTransactions: Map<string, Transaction> = new Map();
  private completedDurations: Map<string, number[]> = new Map();
  private endpointErrors: Map<string, number> = new Map();
  private endpointTotals: Map<string, number> = new Map();
  private dependencyData: Map<string, number[]> = new Map();
  private dependencyErrors: Map<string, number> = new Map();
  private dependencyCalls: Map<string, number> = new Map();
  private customMetrics: CustomMetricEntry[] = [];
  private budgets: Map<string, number> = new Map();
  private alertThresholds: AlertThreshold[] = [];
  private apdexThresholdMs: number;

  constructor(apdexThresholdMs: number = DEFAULT_APDEX_THRESHOLD_MS) {
    this.apdexThresholdMs = apdexThresholdMs;
    logger.info("APM service initialized", { apdexThresholdMs });
  }

  // ---------------------------------------------------------------------------
  // Transaction Tracking
  // ---------------------------------------------------------------------------

  /**
   * Begin tracking a new transaction (e.g. an HTTP request lifecycle).
   * Returns a Transaction object with methods to add spans, tags, and status.
   */
  startTransaction(name: string, type: string): Transaction {
    const id = generateId();
    const spans: Span[] = [];
    const tags: Record<string, string> = {};

    const transaction: Transaction = {
      id,
      name,
      type,
      startTime: Date.now(),
      endTime: undefined,
      status: "ok",
      tags,
      spans,
      addSpan: (spanName: string): Span => {
        const span: Span = {
          name: spanName,
          startTime: Date.now(),
          endTime: undefined,
          status: "ok",
          tags: {},
        };
        spans.push(span);
        return span;
      },
      setStatus: (status: string): void => {
        transaction.status = status;
      },
      addTag: (key: string, value: string): void => {
        tags[key] = value;
      },
    };

    this.activeTransactions.set(id, transaction);

    // Evict oldest if we exceed the cap
    if (this.activeTransactions.size > MAX_ACTIVE_TRANSACTIONS) {
      const oldestKey = this.activeTransactions.keys().next().value;
      if (oldestKey) {
        this.activeTransactions.delete(oldestKey);
        logger.warn("APM evicted stale transaction", { transactionId: oldestKey });
      }
    }

    logger.debug("APM transaction started", { id, name, type });
    return transaction;
  }

  /**
   * Complete a transaction and persist its duration metrics.
   * Automatically ends any open spans within the transaction.
   */
  endTransaction(transaction: Transaction): void {
    transaction.endTime = Date.now();
    const durationMs = transaction.endTime - transaction.startTime;

    // Close any open spans
    for (const span of transaction.spans) {
      if (span.endTime === undefined) {
        span.endTime = transaction.endTime;
      }
    }

    // Record duration by endpoint name
    const key = transaction.name;
    if (!this.completedDurations.has(key)) {
      this.completedDurations.set(key, []);
    }
    const durations = this.completedDurations.get(key)!;
    durations.push(durationMs);

    // Cap per-endpoint buffer size
    if (durations.length > 10_000) {
      durations.splice(0, durations.length - 10_000);
    }

    // Track totals
    this.endpointTotals.set(key, (this.endpointTotals.get(key) || 0) + 1);

    // Track errors
    if (transaction.status === "error") {
      this.endpointErrors.set(key, (this.endpointErrors.get(key) || 0) + 1);
    }

    // Remove from active
    this.activeTransactions.delete(transaction.id);

    // Persist to Redis asynchronously
    this.persistTransactionToRedis(transaction, durationMs).catch((err) => {
      logger.error("APM failed to persist transaction to Redis", {
        transactionId: transaction.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.debug("APM transaction ended", {
      id: transaction.id,
      name: transaction.name,
      durationMs,
      status: transaction.status,
      spanCount: transaction.spans.length,
    });
  }

  // ---------------------------------------------------------------------------
  // Error Rate Monitoring
  // ---------------------------------------------------------------------------

  /**
   * Record an error occurrence for a given endpoint.
   * Increments both in-memory and Redis-backed counters.
   */
  recordError(endpoint: string, error: Error): void {
    this.endpointErrors.set(endpoint, (this.endpointErrors.get(endpoint) || 0) + 1);
    this.endpointTotals.set(endpoint, (this.endpointTotals.get(endpoint) || 0) + 1);

    logger.debug("APM error recorded", {
      endpoint,
      errorName: error.name,
      errorMessage: error.message,
    });

    // Persist to Redis
    const windowKey = currentWindowKey();
    const errorsRedisKey = `${REDIS_PREFIX}errors:${endpoint}:${windowKey}`;
    const totalsRedisKey = `${REDIS_PREFIX}totals:${endpoint}:${windowKey}`;

    Promise.all([
      redis.incr(errorsRedisKey).then(() => redis.expire(errorsRedisKey, ROLLING_WINDOW_TTL_SECONDS)),
      redis.incr(totalsRedisKey).then(() => redis.expire(totalsRedisKey, ROLLING_WINDOW_TTL_SECONDS)),
    ]).catch((err) => {
      logger.error("APM failed to persist error metrics to Redis", {
        endpoint,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Get the error rate for a specific endpoint or across all endpoints.
   * Returns a value between 0 and 1.
   */
  getErrorRate(endpoint?: string): number {
    if (endpoint) {
      const errors = this.endpointErrors.get(endpoint) || 0;
      const total = this.endpointTotals.get(endpoint) || 0;
      return total === 0 ? 0 : errors / total;
    }

    let totalErrors = 0;
    let totalRequests = 0;
    for (const count of this.endpointErrors.values()) {
      totalErrors += count;
    }
    for (const count of this.endpointTotals.values()) {
      totalRequests += count;
    }
    return totalRequests === 0 ? 0 : totalErrors / totalRequests;
  }

  // ---------------------------------------------------------------------------
  // Apdex Score Calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate the Apdex score for a specific service or all services.
   *
   * Apdex = (Satisfied + Tolerated/2) / Total
   *
   * - Satisfied: response time <= T (threshold)
   * - Tolerating: response time <= 4T
   * - Frustrated: response time > 4T
   *
   * Returns a value between 0 and 1.
   */
  getApdex(serviceName?: string): number {
    const T = this.apdexThresholdMs;
    const toleratedThreshold = T * 4;

    let allDurations: number[] = [];

    if (serviceName) {
      allDurations = this.completedDurations.get(serviceName) || [];
    } else {
      for (const durations of this.completedDurations.values()) {
        allDurations = allDurations.concat(durations);
      }
    }

    if (allDurations.length === 0) return 1; // No data = perfect score

    let satisfied = 0;
    let tolerated = 0;

    for (const duration of allDurations) {
      if (duration <= T) {
        satisfied++;
      } else if (duration <= toleratedThreshold) {
        tolerated++;
      }
      // Frustrated samples are implicitly counted by exclusion
    }

    const apdex = (satisfied + tolerated / 2) / allDurations.length;
    return Math.round(apdex * 1000) / 1000; // 3 decimal places
  }

  // ---------------------------------------------------------------------------
  // Dependency Mapping
  // ---------------------------------------------------------------------------

  /**
   * Record an external dependency call (database, HTTP API, cache, etc.).
   */
  recordDependencyCall(
    name: string,
    durationMs: number,
    success: boolean,
  ): void {
    if (!this.dependencyData.has(name)) {
      this.dependencyData.set(name, []);
    }
    const durations = this.dependencyData.get(name)!;
    durations.push(durationMs);

    if (durations.length > 10_000) {
      durations.splice(0, durations.length - 10_000);
    }

    this.dependencyCalls.set(name, (this.dependencyCalls.get(name) || 0) + 1);
    if (!success) {
      this.dependencyErrors.set(name, (this.dependencyErrors.get(name) || 0) + 1);
    }

    // Persist to Redis
    const windowKey = currentWindowKey();
    const hashKey = `${REDIS_PREFIX}dep:${name}:${windowKey}`;
    Promise.all([
      redis.hincrby(hashKey, "calls", 1),
      redis.hincrby(hashKey, "totalMs", Math.round(durationMs)),
      success ? Promise.resolve(0) : redis.hincrby(hashKey, "errors", 1),
      redis.expire(hashKey, ROLLING_WINDOW_TTL_SECONDS),
    ]).catch((err) => {
      logger.error("APM failed to persist dependency metrics to Redis", {
        dependency: name,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Get performance metrics for all tracked external dependencies.
   */
  getDependencyMetrics(): DependencyMetrics[] {
    const results: DependencyMetrics[] = [];

    for (const [name, durations] of this.dependencyData) {
      const totalCalls = this.dependencyCalls.get(name) || 0;
      const totalErrors = this.dependencyErrors.get(name) || 0;
      const avgResponseMs =
        durations.length === 0
          ? 0
          : durations.reduce((sum, d) => sum + d, 0) / durations.length;

      results.push({
        name,
        totalCalls,
        totalErrors,
        avgResponseMs: Math.round(avgResponseMs * 100) / 100,
        p95ResponseMs: Math.round(percentile(durations, 0.95) * 100) / 100,
        p99ResponseMs: Math.round(percentile(durations, 0.99) * 100) / 100,
        errorRate: totalCalls === 0 ? 0 : totalErrors / totalCalls,
      });
    }

    return results.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  // ---------------------------------------------------------------------------
  // Custom Metrics Collection
  // ---------------------------------------------------------------------------

  /**
   * Record a custom business-level metric (e.g. signups, orders, revenue).
   */
  recordCustomMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
  ): void {
    const entry: CustomMetricEntry = {
      name,
      value,
      tags: tags || {},
      timestamp: Date.now(),
    };

    this.customMetrics.push(entry);

    // Prune oldest entries if we exceed the cap
    if (this.customMetrics.length > MAX_CUSTOM_METRIC_ENTRIES) {
      this.customMetrics = this.customMetrics.slice(-MAX_CUSTOM_METRIC_ENTRIES);
    }

    // Persist to Redis
    const windowKey = currentWindowKey();
    const tagSuffix = tags
      ? Object.entries(tags)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join(",")
      : "";
    const redisKey = `${REDIS_PREFIX}custom:${name}:${tagSuffix}:${windowKey}`;

    redis
      .hincrby(redisKey, "count", 1)
      .then(() => redis.hincrby(redisKey, "sum", Math.round(value * 1000)))
      .then(() => redis.expire(redisKey, ROLLING_WINDOW_TTL_SECONDS))
      .catch((err) => {
        logger.error("APM failed to persist custom metric to Redis", {
          metricName: name,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    logger.debug("APM custom metric recorded", { name, value, tags });
  }

  /**
   * Retrieve custom metric entries, optionally filtered by name and time range.
   */
  getCustomMetrics(
    name?: string,
    sinceMs?: number,
  ): CustomMetricEntry[] {
    let entries = this.customMetrics;

    if (name) {
      entries = entries.filter((e) => e.name === name);
    }

    if (sinceMs) {
      const cutoff = Date.now() - sinceMs;
      entries = entries.filter((e) => e.timestamp >= cutoff);
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // Performance Budgets
  // ---------------------------------------------------------------------------

  /**
   * Set a response time budget for an endpoint.
   * Use `checkBudgets()` to see which budgets are currently violated.
   */
  setBudget(endpoint: string, maxResponseMs: number): void {
    this.budgets.set(endpoint, maxResponseMs);
    logger.info("APM performance budget set", { endpoint, maxResponseMs });
  }

  /**
   * Remove a previously set budget for an endpoint.
   */
  removeBudget(endpoint: string): void {
    this.budgets.delete(endpoint);
    logger.info("APM performance budget removed", { endpoint });
  }

  /**
   * Check all configured performance budgets against current P95 response times.
   * Returns an array of violations where P95 exceeds the budget.
   */
  checkBudgets(): BudgetViolation[] {
    const violations: BudgetViolation[] = [];

    for (const [endpoint, budgetMs] of this.budgets) {
      const durations = this.completedDurations.get(endpoint);
      if (!durations || durations.length === 0) continue;

      const p95 = percentile(durations, 0.95);

      if (p95 > budgetMs) {
        violations.push({
          endpoint,
          budgetMs,
          actualP95Ms: Math.round(p95 * 100) / 100,
          exceededBy: Math.round((p95 - budgetMs) * 100) / 100,
          violatedAt: new Date().toISOString(),
        });
      }
    }

    if (violations.length > 0) {
      logger.warn("APM budget violations detected", {
        violationCount: violations.length,
        endpoints: violations.map((v) => v.endpoint),
      });
    }

    return violations;
  }

  // ---------------------------------------------------------------------------
  // Alerting Thresholds
  // ---------------------------------------------------------------------------

  /**
   * Register an alerting threshold. When `checkAlerts()` is called, any
   * threshold whose condition is met will produce an AlertViolation.
   */
  addAlertThreshold(threshold: AlertThreshold): void {
    this.alertThresholds.push(threshold);
    logger.info("APM alert threshold added", {
      metric: threshold.metric,
      operator: threshold.operator,
      value: threshold.value,
      label: threshold.label,
    });
  }

  /**
   * Remove all alert thresholds matching the given label.
   */
  removeAlertThreshold(label: string): void {
    this.alertThresholds = this.alertThresholds.filter(
      (t) => t.label !== label,
    );
  }

  /**
   * Evaluate all registered alert thresholds against current metric values.
   * Returns an array of currently firing alerts.
   */
  checkAlerts(): AlertViolation[] {
    const violations: AlertViolation[] = [];

    for (const threshold of this.alertThresholds) {
      const currentValue = this.resolveMetricValue(threshold.metric, threshold.windowMs);

      if (currentValue === null) continue;

      const isViolated = this.evaluateThreshold(
        currentValue,
        threshold.operator,
        threshold.value,
      );

      if (isViolated) {
        violations.push({
          threshold,
          currentValue,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    if (violations.length > 0) {
      logger.warn("APM alert thresholds violated", {
        alertCount: violations.length,
        labels: violations.map((v) => v.threshold.label),
      });
    }

    return violations;
  }

  // ---------------------------------------------------------------------------
  // Service Overview
  // ---------------------------------------------------------------------------

  /**
   * Produce a summary overview suitable for a monitoring dashboard.
   */
  getServiceOverview(): ServiceOverview {
    // Aggregate all durations
    let allDurations: number[] = [];
    for (const durations of this.completedDurations.values()) {
      allDurations = allDurations.concat(durations);
    }

    const totalTransactions = allDurations.length;
    const avgResponseMs =
      totalTransactions === 0
        ? 0
        : allDurations.reduce((sum, d) => sum + d, 0) / totalTransactions;

    // Top endpoints by volume
    const topEndpoints: EndpointSummary[] = [];
    for (const [name, durations] of this.completedDurations) {
      const count = durations.length;
      const avg = durations.reduce((sum, d) => sum + d, 0) / count;
      const errors = this.endpointErrors.get(name) || 0;
      const total = this.endpointTotals.get(name) || count;

      topEndpoints.push({
        name,
        count,
        avgMs: Math.round(avg * 100) / 100,
        errorRate: total === 0 ? 0 : errors / total,
      });
    }

    topEndpoints.sort((a, b) => b.count - a.count);

    return {
      totalTransactions,
      avgResponseMs: Math.round(avgResponseMs * 100) / 100,
      p95ResponseMs: Math.round(percentile(allDurations, 0.95) * 100) / 100,
      p99ResponseMs: Math.round(percentile(allDurations, 0.99) * 100) / 100,
      errorRate: this.getErrorRate(),
      apdex: this.getApdex(),
      activeTransactions: this.activeTransactions.size,
      budgetViolations: this.checkBudgets(),
      topEndpoints: topEndpoints.slice(0, 20),
      dependencies: this.getDependencyMetrics(),
    };
  }

  // ---------------------------------------------------------------------------
  // Redis Persistence Helpers
  // ---------------------------------------------------------------------------

  /**
   * Load Apdex data from Redis for a service.
   * Useful when restoring state after a restart.
   */
  async getApdexFromRedis(serviceName?: string): Promise<number> {
    try {
      const windowKey = currentWindowKey();
      const pattern = serviceName
        ? `${REDIS_PREFIX}txn:${serviceName}:${windowKey}`
        : `${REDIS_PREFIX}txn:*:${windowKey}`;

      if (serviceName) {
        const data = await redis.hgetall(pattern);
        if (!data || !data.count) return 1;

        const satisfied = parseInt(data.satisfied || "0", 10);
        const tolerated = parseInt(data.tolerated || "0", 10);
        const count = parseInt(data.count, 10);

        if (count === 0) return 1;
        return Math.round(((satisfied + tolerated / 2) / count) * 1000) / 1000;
      }

      // Without a specific service, fall back to in-memory calculation
      return this.getApdex();
    } catch (err) {
      logger.error("APM failed to load Apdex from Redis", {
        serviceName,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.getApdex(serviceName);
    }
  }

  // ---------------------------------------------------------------------------
  // Reset / Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clear all in-memory APM data. Useful for testing or manual resets.
   * Redis data will naturally expire via TTLs.
   */
  reset(): void {
    this.activeTransactions.clear();
    this.completedDurations.clear();
    this.endpointErrors.clear();
    this.endpointTotals.clear();
    this.dependencyData.clear();
    this.dependencyErrors.clear();
    this.dependencyCalls.clear();
    this.customMetrics = [];
    this.budgets.clear();
    this.alertThresholds = [];
    logger.info("APM service reset");
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private async persistTransactionToRedis(
    transaction: Transaction,
    durationMs: number,
  ): Promise<void> {
    const windowKey = currentWindowKey();
    const T = this.apdexThresholdMs;
    const toleratedThreshold = T * 4;

    // Transaction hash: count, totalMs, satisfied, tolerated, frustrated, errors
    const hashKey = `${REDIS_PREFIX}txn:${transaction.name}:${windowKey}`;

    const apdexCategory =
      durationMs <= T
        ? "satisfied"
        : durationMs <= toleratedThreshold
          ? "tolerated"
          : "frustrated";

    await Promise.all([
      redis.hincrby(hashKey, "count", 1),
      redis.hincrby(hashKey, "totalMs", Math.round(durationMs)),
      redis.hincrby(hashKey, apdexCategory, 1),
      transaction.status === "error"
        ? redis.hincrby(hashKey, "errors", 1)
        : Promise.resolve(0),
      redis.expire(hashKey, ROLLING_WINDOW_TTL_SECONDS),
    ]);

    // Also store in a global aggregation key
    const globalKey = `${REDIS_PREFIX}global:${windowKey}`;
    await Promise.all([
      redis.hincrby(globalKey, "count", 1),
      redis.hincrby(globalKey, "totalMs", Math.round(durationMs)),
      redis.hincrby(globalKey, apdexCategory, 1),
      transaction.status === "error"
        ? redis.hincrby(globalKey, "errors", 1)
        : Promise.resolve(0),
      redis.expire(globalKey, ROLLING_WINDOW_TTL_SECONDS),
    ]);
  }

  private resolveMetricValue(metric: string, windowMs: number): number | null {
    const cutoff = Date.now() - windowMs;

    switch (metric) {
      case "error_rate":
        return this.getErrorRate();

      case "apdex":
        return this.getApdex();

      case "p95_response_ms": {
        let allDurations: number[] = [];
        for (const durations of this.completedDurations.values()) {
          allDurations = allDurations.concat(durations);
        }
        return allDurations.length === 0 ? null : percentile(allDurations, 0.95);
      }

      case "p99_response_ms": {
        let allDurations: number[] = [];
        for (const durations of this.completedDurations.values()) {
          allDurations = allDurations.concat(durations);
        }
        return allDurations.length === 0 ? null : percentile(allDurations, 0.99);
      }

      case "active_transactions":
        return this.activeTransactions.size;

      default: {
        // Try to resolve as a custom metric (average value in window)
        const entries = this.customMetrics.filter(
          (e) => e.name === metric && e.timestamp >= cutoff,
        );
        if (entries.length === 0) return null;
        return entries.reduce((sum, e) => sum + e.value, 0) / entries.length;
      }
    }
  }

  private evaluateThreshold(
    currentValue: number,
    operator: "gt" | "lt" | "gte" | "lte",
    thresholdValue: number,
  ): boolean {
    switch (operator) {
      case "gt":
        return currentValue > thresholdValue;
      case "lt":
        return currentValue < thresholdValue;
      case "gte":
        return currentValue >= thresholdValue;
      case "lte":
        return currentValue <= thresholdValue;
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const apmService = new APMService();
