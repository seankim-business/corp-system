import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface SlowQuery {
  model: string;
  operation: string;
  durationMs: number;
  timestamp: number;
  args?: string;
}

export interface ModelStats {
  model: string;
  operation: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  recentDurations: number[];
}

export interface QueryMonitorConfig {
  /** Queries slower than this are logged as slow. Default: 500ms */
  slowQueryThresholdMs: number;
  /** Maximum number of slow queries to keep in buffer. Default: 1000 */
  maxBufferSize: number;
  /** Maximum number of recent durations to track per model. Default: 200 */
  maxRecentDurations: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: QueryMonitorConfig = {
  slowQueryThresholdMs: 500,
  maxBufferSize: 1000,
  maxRecentDurations: 200,
};

// =============================================================================
// Query Monitor
// =============================================================================

class QueryMonitor {
  private config: QueryMonitorConfig;
  private slowQueries: SlowQuery[] = [];
  private statsMap: Map<string, ModelStats> = new Map();
  private totalQueries = 0;
  private totalSlowQueries = 0;

  constructor(config?: Partial<QueryMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a Prisma middleware function that records query timing.
   * Usage: prisma.$use(queryMonitor.createMiddleware())
   */
  createMiddleware(): (params: any, next: (params: any) => Promise<any>) => Promise<any> {
    return async (params: any, next: (params: any) => Promise<any>) => {
      const model = params.model ?? "unknown";
      const action = params.action ?? "unknown";
      const start = performance.now();

      try {
        const result = await next(params);
        const durationMs = Math.round(performance.now() - start);
        this.recordQuery(model, action, durationMs, params.args);
        return result;
      } catch (error) {
        const durationMs = Math.round(performance.now() - start);
        this.recordQuery(model, action, durationMs, params.args, true);
        throw error;
      }
    };
  }

  /**
   * Record a query execution.
   */
  private recordQuery(
    model: string,
    operation: string,
    durationMs: number,
    args?: unknown,
    _errored = false,
  ): void {
    this.totalQueries++;
    const key = `${model}:${operation}`;

    // Update model stats
    let stats = this.statsMap.get(key);
    if (!stats) {
      stats = {
        model,
        operation,
        count: 0,
        totalMs: 0,
        avgMs: 0,
        minMs: Infinity,
        maxMs: 0,
        p95Ms: 0,
        recentDurations: [],
      };
      this.statsMap.set(key, stats);
    }

    stats.count++;
    stats.totalMs += durationMs;
    stats.avgMs = Math.round(stats.totalMs / stats.count);
    stats.minMs = Math.min(stats.minMs, durationMs);
    stats.maxMs = Math.max(stats.maxMs, durationMs);

    stats.recentDurations.push(durationMs);
    if (stats.recentDurations.length > this.config.maxRecentDurations) {
      stats.recentDurations = stats.recentDurations.slice(-this.config.maxRecentDurations);
    }
    stats.p95Ms = calculateP95(stats.recentDurations);

    // Check for slow query
    if (durationMs >= this.config.slowQueryThresholdMs) {
      this.totalSlowQueries++;

      const slowQuery: SlowQuery = {
        model,
        operation,
        durationMs,
        timestamp: Date.now(),
        args: args ? summarizeArgs(args) : undefined,
      };

      this.slowQueries.push(slowQuery);
      if (this.slowQueries.length > this.config.maxBufferSize) {
        this.slowQueries = this.slowQueries.slice(-this.config.maxBufferSize);
      }

      logger.warn("Slow query detected", {
        model,
        operation,
        durationMs,
        threshold: this.config.slowQueryThresholdMs,
      });
    }
  }

  /**
   * Get recent slow queries.
   */
  getSlowQueries(limit = 50): SlowQuery[] {
    return this.slowQueries.slice(-limit).reverse();
  }

  /**
   * Get per-model/operation stats.
   */
  getStats(): ModelStats[] {
    return Array.from(this.statsMap.values())
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  /**
   * Get stats for a specific model.
   */
  getModelStats(model: string): ModelStats[] {
    return Array.from(this.statsMap.values())
      .filter((s) => s.model === model)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    totalQueries: number;
    totalSlowQueries: number;
    slowQueryRate: number;
    uniqueModelOperations: number;
    topSlowest: Array<{ key: string; avgMs: number; count: number }>;
  } {
    const topSlowest = Array.from(this.statsMap.entries())
      .sort(([, a], [, b]) => b.avgMs - a.avgMs)
      .slice(0, 10)
      .map(([key, s]) => ({ key, avgMs: s.avgMs, count: s.count }));

    return {
      totalQueries: this.totalQueries,
      totalSlowQueries: this.totalSlowQueries,
      slowQueryRate: this.totalQueries > 0
        ? Math.round((this.totalSlowQueries / this.totalQueries) * 10000) / 10000
        : 0,
      uniqueModelOperations: this.statsMap.size,
      topSlowest,
    };
  }

  /**
   * Reset all collected data.
   */
  reset(): void {
    this.slowQueries = [];
    this.statsMap.clear();
    this.totalQueries = 0;
    this.totalSlowQueries = 0;
    logger.info("Query monitor reset");
  }

  /**
   * Update the slow query threshold.
   */
  setThreshold(thresholdMs: number): void {
    this.config.slowQueryThresholdMs = thresholdMs;
    logger.info("Query monitor threshold updated", { thresholdMs });
  }
}

// =============================================================================
// Helpers
// =============================================================================

function calculateP95(durations: number[]): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * Summarize query args for logging (truncate large objects).
 */
function summarizeArgs(args: unknown): string {
  try {
    const str = JSON.stringify(args);
    if (str.length > 500) {
      return str.slice(0, 500) + "...[truncated]";
    }
    return str;
  } catch {
    return "[unserializable]";
  }
}

// =============================================================================
// Export
// =============================================================================

export const queryMonitor = new QueryMonitor();
