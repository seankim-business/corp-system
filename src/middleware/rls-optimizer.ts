import { createHash } from "crypto";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cached execution plan for a frequently executed RLS-filtered query. */
export interface CachedQueryPlan {
  queryHash: string;
  plan: string;
  organizationId: string;
  cachedAt: number;
  hitCount: number;
  estimatedCostMs: number;
}

/** A report entry for a slow RLS query. */
export interface SlowQueryReport {
  query: string;
  organizationId: string;
  durationMs: number;
  timestamp: number;
  queryHash: string;
}

/** A recommendation for a missing index that would improve RLS performance. */
export interface IndexSuggestion {
  table: string;
  columns: string[];
  reason: string;
  estimatedImpact: "high" | "medium" | "low";
  createStatement: string;
}

/** Internal representation of per-query metric counters stored in Redis. */
interface QueryMetricEntry {
  query: string;
  organizationId: string;
  totalDurationMs: number;
  executionCount: number;
  maxDurationMs: number;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = "rls-opt";
const PLAN_CACHE_TTL_SECONDS = 3600; // 1 hour
const METRICS_TTL_SECONDS = 3600; // 1 hour
const SLOW_QUERY_TTL_SECONDS = 3600; // 1 hour
const DEFAULT_SLOW_THRESHOLD_MS = 500;
const MAX_SLOW_QUERIES_STORED = 200;

/**
 * Models known to carry an organizationId column.
 * Kept in sync with rls-enforcement.ts ORG_SCOPED_MODELS.
 */
const ORG_SCOPED_TABLES = new Set([
  "sessions",
  "skills",
  "slack_integrations",
  "agents",
  "teams",
  "projects",
  "tasks",
  "goals",
  "value_streams",
  "kpis",
  "workflows",
  "orchestrator_executions",
  "agent_activities",
  "mcp_connections",
  "claude_accounts",
  "claude_max_accounts",
  "notion_connections",
  "audit_logs",
  "approvals",
  "delegations",
  "agent_permission_overrides",
  "organization_changes",
  "drive_connections",
  "google_calendar_connections",
  "session_hijacking_attempts",
  "workspace_domains",
  "memberships",
  "feature_flag_overrides",
  "feature_flag_audit_logs",
  "marketplace_extensions",
  "extension_installations",
  "extension_permissions",
  "extension_usage_logs",
  "skill_learning_patterns",
  "agent_skill_assignments",
  "api_keys",
  "public_webhooks",
  "work_queues",
  "usage_records",
  "onboarding_states",
  "objectives",
]);

// ---------------------------------------------------------------------------
// RLS Optimizer
// ---------------------------------------------------------------------------

/**
 * RLS (Row-Level Security) performance optimization module.
 *
 * Provides:
 * 1. **Query plan caching** — caches execution plans for frequent RLS-filtered queries
 * 2. **Index recommendations** — suggests missing indexes for organization-scoped tables
 * 3. **Query rewriting** — automatically injects `organizationId` into WHERE clauses
 * 4. **Batch optimization** — combines single-row RLS checks into batch queries
 * 5. **Connection-level SET** — sets `app.current_organization_id` at connection level
 * 6. **Performance monitoring** — tracks slow RLS queries and alerts
 */
export class RLSOptimizer {
  // In-memory LRU for plan cache to avoid Redis round-trips on hot paths
  private planCacheMem = new Map<string, CachedQueryPlan>();
  private readonly memCacheMaxSize = 500;

  // In-memory slow-query buffer flushed periodically to Redis
  private slowQueryBuffer: SlowQueryReport[] = [];
  private metricsBuffer = new Map<string, QueryMetricEntry>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Flush metrics to Redis every 10 seconds
    this.flushInterval = setInterval(() => {
      void this.flushMetrics();
    }, 10_000);

    // Allow the process to exit without waiting for the interval
    if (this.flushInterval && typeof this.flushInterval.unref === "function") {
      this.flushInterval.unref();
    }
  }

  // -------------------------------------------------------------------------
  // 1. Query Rewriting
  // -------------------------------------------------------------------------

  /**
   * Rewrites a raw SQL query to include an optimal `organizationId` filter.
   *
   * Handles three common patterns:
   * - SELECT ... FROM table WHERE ... → appends AND "organizationId" = 'orgId'
   * - SELECT ... FROM table (no WHERE) → appends WHERE "organizationId" = 'orgId'
   * - Queries that already contain organizationId → returned unchanged
   *
   * The rewriter targets only tables known to carry an organizationId column
   * (see {@link ORG_SCOPED_TABLES}).
   */
  optimizeQuery(query: string, organizationId: string): string {
    // Already contains an organizationId filter — nothing to do
    if (/["']?organizationId["']?\s*=/i.test(query)) {
      return query;
    }

    // Determine which org-scoped table (if any) the query targets
    const tableMatch = query.match(
      /\bFROM\s+["']?(\w+)["']?/i,
    );
    if (!tableMatch) {
      return query;
    }

    const tableName = tableMatch[1].toLowerCase();
    if (!ORG_SCOPED_TABLES.has(tableName)) {
      return query;
    }

    const safeOrgId = organizationId.replace(/'/g, "''");
    const filter = `"organizationId" = '${safeOrgId}'`;

    // If the query already has a WHERE clause, append with AND
    if (/\bWHERE\b/i.test(query)) {
      // Insert the org filter immediately after the WHERE keyword to ensure
      // the database can use an index seek on organizationId first.
      return query.replace(
        /\bWHERE\b/i,
        `WHERE ${filter} AND`,
      );
    }

    // No WHERE clause — inject one before ORDER BY / LIMIT / GROUP BY / ; / end-of-string
    const insertionPoint = query.search(
      /\b(ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|;)\b/i,
    );
    if (insertionPoint > -1) {
      return (
        query.slice(0, insertionPoint) +
        `WHERE ${filter} ` +
        query.slice(insertionPoint)
      );
    }

    // Append at the end (trim trailing semicolons first)
    const trimmed = query.replace(/;\s*$/, "");
    return `${trimmed} WHERE ${filter}`;
  }

  // -------------------------------------------------------------------------
  // 2. Connection-Level SET for RLS
  // -------------------------------------------------------------------------

  /**
   * Sets `app.current_organization_id` at the Postgres connection level so
   * that database-level RLS policies can reference the current tenant without
   * per-query injection.
   *
   * Should be called once per request at the start of the Prisma transaction
   * or connection checkout.
   */
  async setConnectionContext(
    client: PrismaClient,
    organizationId: string,
  ): Promise<void> {
    const safeOrgId = organizationId.replace(/'/g, "''");
    try {
      await client.$executeRawUnsafe(
        `SET LOCAL app.current_organization_id = '${safeOrgId}'`,
      );
      logger.debug("RLS connection context set", { organizationId });
    } catch (error) {
      logger.error(
        "Failed to set RLS connection context",
        {
          organizationId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Query Plan Caching
  // -------------------------------------------------------------------------

  /**
   * Returns a cached query plan for the given query hash, or `null` if no
   * cached plan exists.
   *
   * Checks the in-memory LRU first and falls back to Redis.
   */
  getCachedPlan(queryHash: string): CachedQueryPlan | null {
    // Check in-memory cache first
    const memEntry = this.planCacheMem.get(queryHash);
    if (memEntry) {
      memEntry.hitCount++;
      return memEntry;
    }

    // Redis lookup is async — callers that need Redis plans should use
    // getCachedPlanAsync. The synchronous method only checks the in-memory
    // tier so it can be called in the Prisma middleware hot path without
    // awaiting.
    return null;
  }

  /**
   * Asynchronous variant that checks both in-memory and Redis caches.
   */
  async getCachedPlanAsync(queryHash: string): Promise<CachedQueryPlan | null> {
    // In-memory first
    const memEntry = this.planCacheMem.get(queryHash);
    if (memEntry) {
      memEntry.hitCount++;
      return memEntry;
    }

    // Redis fallback
    try {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}:plan:${queryHash}`);
      if (!raw) return null;

      const plan = JSON.parse(raw) as CachedQueryPlan;
      plan.hitCount++;

      // Promote to in-memory cache
      this.setMemCache(queryHash, plan);

      // Update hit count in Redis (fire and forget)
      void redis.set(
        `${REDIS_KEY_PREFIX}:plan:${queryHash}`,
        JSON.stringify(plan),
        PLAN_CACHE_TTL_SECONDS,
      );

      return plan;
    } catch (error) {
      logger.warn("Failed to read cached query plan from Redis", {
        queryHash,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Stores a query execution plan in both in-memory and Redis caches.
   */
  async cacheQueryPlan(
    queryHash: string,
    plan: string,
    organizationId: string,
    estimatedCostMs: number,
  ): Promise<void> {
    const entry: CachedQueryPlan = {
      queryHash,
      plan,
      organizationId,
      cachedAt: Date.now(),
      hitCount: 0,
      estimatedCostMs,
    };

    this.setMemCache(queryHash, entry);

    try {
      await redis.set(
        `${REDIS_KEY_PREFIX}:plan:${queryHash}`,
        JSON.stringify(entry),
        PLAN_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      logger.warn("Failed to cache query plan in Redis", {
        queryHash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Invalidates the cached plan for a given query hash.
   */
  async invalidatePlan(queryHash: string): Promise<void> {
    this.planCacheMem.delete(queryHash);
    await redis.del(`${REDIS_KEY_PREFIX}:plan:${queryHash}`);
  }

  // -------------------------------------------------------------------------
  // 4. Performance Monitoring
  // -------------------------------------------------------------------------

  /**
   * Records execution metrics for a completed query.
   *
   * Metrics are buffered in memory and flushed to Redis periodically.
   * Queries exceeding the slow threshold are immediately buffered for the
   * slow-query report.
   */
  recordQueryMetrics(
    query: string,
    durationMs: number,
    organizationId: string,
  ): void {
    const queryHash = this.hashQuery(query);

    // Update in-memory metrics buffer
    const existing = this.metricsBuffer.get(queryHash);
    if (existing) {
      existing.totalDurationMs += durationMs;
      existing.executionCount++;
      existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
      existing.lastSeen = Date.now();
    } else {
      this.metricsBuffer.set(queryHash, {
        query: this.truncateQuery(query),
        organizationId,
        totalDurationMs: durationMs,
        executionCount: 1,
        maxDurationMs: durationMs,
        lastSeen: Date.now(),
      });
    }

    // Track slow queries
    if (durationMs >= DEFAULT_SLOW_THRESHOLD_MS) {
      this.slowQueryBuffer.push({
        query: this.truncateQuery(query),
        organizationId,
        durationMs,
        timestamp: Date.now(),
        queryHash,
      });

      logger.warn("Slow RLS query detected", {
        queryHash,
        durationMs,
        organizationId,
        queryPreview: this.truncateQuery(query, 120),
      });

      // Keep the buffer bounded
      if (this.slowQueryBuffer.length > MAX_SLOW_QUERIES_STORED * 2) {
        this.slowQueryBuffer = this.slowQueryBuffer.slice(-MAX_SLOW_QUERIES_STORED);
      }
    }
  }

  /**
   * Returns recent slow RLS queries above the given threshold.
   *
   * Checks the in-memory buffer first, then merges with data persisted in
   * Redis from previous flush cycles.
   */
  getSlowQueries(thresholdMs?: number): SlowQueryReport[] {
    const threshold = thresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;
    return this.slowQueryBuffer
      .filter((sq) => sq.durationMs >= threshold)
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  /**
   * Async variant that also retrieves slow queries persisted in Redis.
   */
  async getSlowQueriesAsync(
    thresholdMs?: number,
  ): Promise<SlowQueryReport[]> {
    const threshold = thresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;

    // Merge in-memory buffer with Redis persisted data
    const combined = [...this.slowQueryBuffer];

    try {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}:slow-queries`);
      if (raw) {
        const persisted = JSON.parse(raw) as SlowQueryReport[];
        // Deduplicate by timestamp + queryHash
        const seen = new Set(
          combined.map((sq) => `${sq.queryHash}:${sq.timestamp}`),
        );
        for (const entry of persisted) {
          const key = `${entry.queryHash}:${entry.timestamp}`;
          if (!seen.has(key)) {
            combined.push(entry);
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to read slow queries from Redis", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return combined
      .filter((sq) => sq.durationMs >= threshold)
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  // -------------------------------------------------------------------------
  // 5. Index Suggestions
  // -------------------------------------------------------------------------

  /**
   * Analyzes known org-scoped tables and returns index creation
   * recommendations.
   *
   * Suggestions are based on common query patterns seen in the RLS
   * enforcement middleware (single-column organizationId, composite with
   * createdAt for time-range scans, etc.).
   */
  suggestIndexes(): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];

    // Every org-scoped table should have an index on organizationId
    const tables = Array.from(ORG_SCOPED_TABLES);
    for (const table of tables) {
      suggestions.push({
        table,
        columns: ["organizationId"],
        reason:
          "Primary RLS filter column — required for efficient tenant isolation",
        estimatedImpact: "high",
        createStatement: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${table}_org_id ON "${table}" ("organizationId");`,
      });
    }

    // High-traffic tables benefit from composite indexes
    const compositeRecommendations: Array<{
      table: string;
      columns: string[];
      reason: string;
      impact: "high" | "medium" | "low";
    }> = [
      {
        table: "sessions",
        columns: ["organizationId", "createdAt"],
        reason:
          "Sessions are frequently queried by org with time-range filters",
        impact: "high",
      },
      {
        table: "tasks",
        columns: ["organizationId", "status"],
        reason:
          "Task listing filters by organization and status simultaneously",
        impact: "high",
      },
      {
        table: "agent_activities",
        columns: ["organizationId", "createdAt"],
        reason:
          "Activity feeds are scoped by org and sorted by recency",
        impact: "high",
      },
      {
        table: "audit_logs",
        columns: ["organizationId", "createdAt"],
        reason:
          "Audit log queries scan by org within date ranges",
        impact: "high",
      },
      {
        table: "orchestrator_executions",
        columns: ["organizationId", "status", "createdAt"],
        reason:
          "Execution history filtered by org, status, and time",
        impact: "medium",
      },
      {
        table: "workflows",
        columns: ["organizationId", "status"],
        reason:
          "Workflow listing filtered by organization and active status",
        impact: "medium",
      },
      {
        table: "memberships",
        columns: ["organizationId", "userId"],
        reason:
          "Membership lookups filter by org and user together",
        impact: "medium",
      },
      {
        table: "usage_records",
        columns: ["organizationId", "createdAt"],
        reason:
          "Usage reports aggregate by organization over time ranges",
        impact: "medium",
      },
      {
        table: "approvals",
        columns: ["organizationId", "status"],
        reason:
          "Pending approvals are queried by org and status",
        impact: "low",
      },
    ];

    for (const rec of compositeRecommendations) {
      const colList = rec.columns.map((c) => `"${c}"`).join(", ");
      const indexName = `idx_${rec.table}_${rec.columns.join("_")}`;
      suggestions.push({
        table: rec.table,
        columns: rec.columns,
        reason: rec.reason,
        estimatedImpact: rec.impact,
        createStatement: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON "${rec.table}" (${colList});`,
      });
    }

    return suggestions;
  }

  // -------------------------------------------------------------------------
  // 6. Batch Query Optimization
  // -------------------------------------------------------------------------

  /**
   * Rewrites a batch of single-row RLS lookups into a single IN-clause query.
   *
   * Instead of:
   *   SELECT * FROM tasks WHERE id = '1' AND "organizationId" = 'org1';
   *   SELECT * FROM tasks WHERE id = '2' AND "organizationId" = 'org1';
   *
   * Produces:
   *   SELECT * FROM tasks WHERE id IN ('1','2') AND "organizationId" = 'org1';
   *
   * Returns null if the queries are not eligible for batching.
   */
  batchOptimize(
    queries: string[],
    organizationId: string,
  ): string | null {
    if (queries.length < 2) return null;

    // Detect common single-row SELECT pattern
    const pattern =
      /^SELECT\s+(.+?)\s+FROM\s+["']?(\w+)["']?\s+WHERE\s+["']?(\w+)["']?\s*=\s*'([^']+)'/i;

    const parsed: Array<{
      columns: string;
      table: string;
      idColumn: string;
      idValue: string;
    }> = [];

    for (const q of queries) {
      const match = q.match(pattern);
      if (!match) return null;
      parsed.push({
        columns: match[1],
        table: match[2],
        idColumn: match[3],
        idValue: match[4],
      });
    }

    // All queries must target the same table and columns
    const first = parsed[0];
    const allSame = parsed.every(
      (p) =>
        p.table === first.table &&
        p.columns === first.columns &&
        p.idColumn === first.idColumn,
    );
    if (!allSame) return null;

    const safeOrgId = organizationId.replace(/'/g, "''");
    const idValues = parsed.map((p) => `'${p.idValue.replace(/'/g, "''")}'`);

    return (
      `SELECT ${first.columns} FROM "${first.table}" ` +
      `WHERE "${first.idColumn}" IN (${idValues.join(",")}) ` +
      `AND "organizationId" = '${safeOrgId}'`
    );
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /** Compute a stable SHA-256 hash of a query for cache keying. */
  hashQuery(query: string): string {
    // Normalize whitespace so semantically identical queries share a cache key
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  /** Gracefully shut down — flush remaining metrics to Redis. */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushMetrics();
    logger.info("RLS optimizer shut down");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Flush in-memory metrics and slow-query buffers to Redis. */
  private async flushMetrics(): Promise<void> {
    // Flush per-query metrics
    if (this.metricsBuffer.size > 0) {
      const entries = Array.from(this.metricsBuffer.entries());
      this.metricsBuffer.clear();

      for (const [hash, metric] of entries) {
        try {
          const key = `${REDIS_KEY_PREFIX}:metrics:${hash}`;
          await redis.set(key, JSON.stringify(metric), METRICS_TTL_SECONDS);
        } catch (error) {
          logger.warn("Failed to flush query metric to Redis", {
            queryHash: hash,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Flush slow-query buffer
    if (this.slowQueryBuffer.length > 0) {
      try {
        // Read existing persisted slow queries and merge
        const existing = await redis.get(`${REDIS_KEY_PREFIX}:slow-queries`);
        let combined = [...this.slowQueryBuffer];
        if (existing) {
          const parsed = JSON.parse(existing) as SlowQueryReport[];
          combined = [...parsed, ...combined];
        }

        // Keep only the most recent entries
        if (combined.length > MAX_SLOW_QUERIES_STORED) {
          combined = combined
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_SLOW_QUERIES_STORED);
        }

        await redis.set(
          `${REDIS_KEY_PREFIX}:slow-queries`,
          JSON.stringify(combined),
          SLOW_QUERY_TTL_SECONDS,
        );
        this.slowQueryBuffer = [];
      } catch (error) {
        logger.warn("Failed to flush slow queries to Redis", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Add an entry to the in-memory plan cache, evicting oldest if full. */
  private setMemCache(queryHash: string, entry: CachedQueryPlan): void {
    // Simple LRU: delete and re-insert to move to "newest" position
    if (this.planCacheMem.has(queryHash)) {
      this.planCacheMem.delete(queryHash);
    } else if (this.planCacheMem.size >= this.memCacheMaxSize) {
      // Evict the oldest entry (first inserted)
      const oldestKey = this.planCacheMem.keys().next().value;
      if (oldestKey !== undefined) {
        this.planCacheMem.delete(oldestKey);
      }
    }
    this.planCacheMem.set(queryHash, entry);
  }

  /** Truncate a query string for safe logging. */
  private truncateQuery(query: string, maxLen = 256): string {
    if (query.length <= maxLen) return query;
    return query.slice(0, maxLen) + "...";
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const rlsOptimizer = new RLSOptimizer();
