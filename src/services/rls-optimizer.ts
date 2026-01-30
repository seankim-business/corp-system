import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { db as prisma } from "../db/client";

// =============================================================================
// Types
// =============================================================================

export interface RLSPerformanceResult {
  table: string;
  withRLS: number;
  withoutRLS: number;
  overheadMs: number;
  overheadPercent: number;
}

export interface IndexRecommendation {
  table: string;
  column: string;
  currentlyIndexed: boolean;
  estimatedImprovement: string;
}

interface RLSPolicy {
  policyName: string;
  tableName: string;
  command: string;
  qualifier: string;
  roles: string[];
  usingExpression: string | null;
  checkExpression: string | null;
}

interface ExplainRow {
  "QUERY PLAN": string;
}

interface PolicyCatalogRow {
  polname: string;
  tablename: string;
  polcmd: string;
  polroles: string;
  polqual: string | null;
  polwithcheck: string | null;
}

interface IndexCatalogRow {
  indexname: string;
  indexdef: string;
}

interface RLSTableRow {
  tablename: string;
}

interface OptimizationReport {
  generatedAt: string;
  tables: RLSPerformanceResult[];
  indexRecommendations: IndexRecommendation[];
  policySimplifications: PolicySimplification[];
  cacheFriendlinessIssues: CacheFriendlinessIssue[];
  summary: ReportSummary;
}

interface PolicySimplification {
  table: string;
  policies: string[];
  reason: string;
  suggestion: string;
}

interface CacheFriendlinessIssue {
  table: string;
  policy: string;
  issue: string;
  recommendation: string;
}

interface ReportSummary {
  totalTablesAnalyzed: number;
  tablesWithHighOverhead: number;
  indexRecommendationsCount: number;
  simplifiablePolices: number;
  cacheFriendlinessIssueCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const CACHE_PREFIX = "rls:optimizer";
const POLICY_CACHE_TTL_SECONDS = 300; // 5 minutes
const OVERHEAD_THRESHOLD_PERCENT = 20;
const HIGH_OVERHEAD_THRESHOLD_MS = 50;

// Per-row function patterns that defeat caching
const PER_ROW_FUNCTION_PATTERNS = [
  /current_setting\s*\(/i,
  /set_config\s*\(/i,
  /nextval\s*\(/i,
  /random\s*\(/i,
  /clock_timestamp\s*\(/i,
  /txid_current\s*\(/i,
];

// Stable function patterns that are cache-friendly
const CACHE_FRIENDLY_PATTERNS = [
  /current_user/i,
  /session_user/i,
  /=\s*'\w+'/, // simple equality to constant
];

// =============================================================================
// RLS Optimizer
// =============================================================================

class RLSOptimizer {
  /**
   * Analyze query performance for a table with and without RLS policies.
   * Runs EXPLAIN ANALYZE on a representative SELECT query to measure
   * the overhead introduced by RLS filtering.
   */
  async analyzeTablePerformance(tableName: string): Promise<RLSPerformanceResult> {
    const sanitized = this.sanitizeIdentifier(tableName);

    logger.info("Analyzing RLS performance for table", { table: sanitized });

    // Measure with RLS enabled (default state)
    const withRLS = await this.measureQueryTime(
      `EXPLAIN ANALYZE SELECT * FROM "${sanitized}" LIMIT 100`
    );

    // Measure without RLS by temporarily disabling policies for this session
    const withoutRLS = await this.measureBypassedQueryTime(sanitized);

    const overheadMs = Math.max(0, withRLS - withoutRLS);
    const overheadPercent =
      withoutRLS > 0 ? Math.round((overheadMs / withoutRLS) * 10000) / 100 : 0;

    const result: RLSPerformanceResult = {
      table: sanitized,
      withRLS: Math.round(withRLS * 100) / 100,
      withoutRLS: Math.round(withoutRLS * 100) / 100,
      overheadMs: Math.round(overheadMs * 100) / 100,
      overheadPercent,
    };

    logger.info("RLS performance analysis complete", {
      table: sanitized,
      overheadMs: result.overheadMs,
      overheadPercent: result.overheadPercent,
    });

    return result;
  }

  /**
   * Suggest indexes for columns commonly used in RLS policy expressions.
   * Scans all RLS policies and checks whether the referenced columns
   * have supporting indexes.
   */
  async getIndexRecommendations(): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];
    const policies = await this.fetchAllPolicies();

    for (const policy of policies) {
      const columns = this.extractColumnsFromExpression(policy.usingExpression);
      const existingIndexes = await this.getTableIndexes(policy.tableName);

      for (const column of columns) {
        const isIndexed = existingIndexes.some(
          (idx) =>
            idx.indexdef.includes(`"${column}"`) ||
            idx.indexdef.includes(`(${column})`) ||
            idx.indexdef.includes(` ${column}`)
        );

        if (!isIndexed) {
          recommendations.push({
            table: policy.tableName,
            column,
            currentlyIndexed: false,
            estimatedImprovement: this.estimateIndexImprovement(policy),
          });
        } else {
          // Still report indexed columns for completeness, but mark as indexed
          const alreadyReported = recommendations.some(
            (r) => r.table === policy.tableName && r.column === column
          );
          if (!alreadyReported) {
            recommendations.push({
              table: policy.tableName,
              column,
              currentlyIndexed: true,
              estimatedImprovement: "already indexed",
            });
          }
        }
      }
    }

    // Deduplicate: keep first occurrence per table+column
    const seen = new Set<string>();
    return recommendations.filter((rec) => {
      const key = `${rec.table}:${rec.column}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Benchmark RLS overhead for a specific table by running multiple iterations.
   * Returns the average overhead in milliseconds.
   */
  async benchmarkRLSOverhead(tableName: string, iterations: number = 10): Promise<number> {
    const sanitized = this.sanitizeIdentifier(tableName);
    const results: number[] = [];

    logger.info("Starting RLS benchmark", {
      table: sanitized,
      iterations,
    });

    for (let i = 0; i < iterations; i++) {
      const result = await this.analyzeTablePerformance(sanitized);
      results.push(result.overheadMs);
    }

    // Remove outliers (top and bottom 10%) for more stable measurement
    const sorted = [...results].sort((a, b) => a - b);
    const trimCount = Math.max(1, Math.floor(sorted.length * 0.1));
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

    const avgOverhead =
      trimmed.length > 0
        ? Math.round((trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length) * 100) / 100
        : 0;

    logger.info("RLS benchmark complete", {
      table: sanitized,
      iterations,
      avgOverheadMs: avgOverhead,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
    });

    return avgOverhead;
  }

  /**
   * Retrieve RLS policy metadata for a table, using Redis cache for fast lookups.
   * Cache TTL is 5 minutes to balance freshness with performance.
   */
  async getCachedPolicyMetadata(tableName: string): Promise<RLSPolicy[]> {
    const sanitized = this.sanitizeIdentifier(tableName);
    const cacheKey = `${CACHE_PREFIX}:policies:${sanitized}`;

    // Try Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug("RLS policy cache hit", { table: sanitized });
      try {
        return JSON.parse(cached) as RLSPolicy[];
      } catch {
        logger.warn("Failed to parse cached RLS policies, fetching fresh", {
          table: sanitized,
        });
      }
    }

    // Cache miss: query PostgreSQL catalog
    logger.debug("RLS policy cache miss, fetching from catalog", { table: sanitized });
    const policies = await this.fetchPoliciesForTable(sanitized);

    // Store in Redis with TTL
    await redis.setex(
      cacheKey,
      POLICY_CACHE_TTL_SECONDS,
      JSON.stringify(policies)
    );

    return policies;
  }

  /**
   * Generate a comprehensive optimization report across all RLS-enabled tables.
   * Includes performance analysis, index recommendations, policy simplification
   * suggestions, and cache-friendliness assessments.
   */
  async generateOptimizationReport(): Promise<OptimizationReport> {
    logger.info("Generating RLS optimization report");

    const rlsTables = await this.getRLSEnabledTables();
    const tableResults: RLSPerformanceResult[] = [];
    const simplifications: PolicySimplification[] = [];
    const cacheIssues: CacheFriendlinessIssue[] = [];

    // Analyze each table
    for (const table of rlsTables) {
      try {
        const perf = await this.analyzeTablePerformance(table);
        tableResults.push(perf);
      } catch (err) {
        logger.warn("Failed to analyze table performance", {
          table,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Check for policy simplification opportunities
      const policies = await this.getCachedPolicyMetadata(table);
      const tableSimplifications = this.findSimplifiablePolicies(table, policies);
      simplifications.push(...tableSimplifications);

      // Check cache-friendliness
      const tableCacheIssues = this.assessCacheFriendliness(table, policies);
      cacheIssues.push(...tableCacheIssues);
    }

    const indexRecommendations = await this.getIndexRecommendations();

    const tablesWithHighOverhead = tableResults.filter(
      (t) => t.overheadPercent > OVERHEAD_THRESHOLD_PERCENT || t.overheadMs > HIGH_OVERHEAD_THRESHOLD_MS
    );

    const report: OptimizationReport = {
      generatedAt: new Date().toISOString(),
      tables: tableResults,
      indexRecommendations,
      policySimplifications: simplifications,
      cacheFriendlinessIssues: cacheIssues,
      summary: {
        totalTablesAnalyzed: rlsTables.length,
        tablesWithHighOverhead: tablesWithHighOverhead.length,
        indexRecommendationsCount: indexRecommendations.filter((r) => !r.currentlyIndexed).length,
        simplifiablePolices: simplifications.length,
        cacheFriendlinessIssueCount: cacheIssues.length,
      },
    };

    // Cache the full report
    await redis.setex(
      `${CACHE_PREFIX}:report:latest`,
      POLICY_CACHE_TTL_SECONDS,
      JSON.stringify(report)
    );

    logger.info("RLS optimization report generated", {
      tablesAnalyzed: report.summary.totalTablesAnalyzed,
      highOverheadTables: report.summary.tablesWithHighOverhead,
      indexRecommendations: report.summary.indexRecommendationsCount,
      simplifications: report.summary.simplifiablePolices,
      cacheIssues: report.summary.cacheFriendlinessIssueCount,
    });

    return report;
  }

  // ===========================================================================
  // Private: Query execution helpers
  // ===========================================================================

  /**
   * Execute EXPLAIN ANALYZE and extract the total execution time from the output.
   */
  private async measureQueryTime(explainQuery: string): Promise<number> {
    try {
      const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(explainQuery);
      return this.extractExecutionTime(rows);
    } catch (err) {
      logger.error("Failed to execute EXPLAIN ANALYZE", {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  /**
   * Measure query time with RLS bypassed using a superuser SET command.
   * Falls back to a regular measurement if the bypass fails (non-superuser).
   */
  private async measureBypassedQueryTime(tableName: string): Promise<number> {
    try {
      // Attempt to bypass RLS for this transaction block
      await prisma.$queryRawUnsafe("SET LOCAL row_security = off");
      const time = await this.measureQueryTime(
        `EXPLAIN ANALYZE SELECT * FROM "${tableName}" LIMIT 100`
      );
      // Restore default
      await prisma.$queryRawUnsafe("SET LOCAL row_security = on");
      return time;
    } catch {
      // If we lack superuser privileges, measure with a simple count instead
      // which typically has less RLS overhead as a baseline proxy
      logger.debug("Cannot bypass RLS (insufficient privileges), using fallback measurement", {
        table: tableName,
      });
      return this.measureQueryTime(
        `EXPLAIN ANALYZE SELECT count(*) FROM "${tableName}"`
      );
    }
  }

  /**
   * Parse the "Execution Time" line from EXPLAIN ANALYZE output.
   */
  private extractExecutionTime(rows: ExplainRow[]): number {
    for (const row of rows) {
      const plan = row["QUERY PLAN"];
      if (!plan) continue;

      // Match "Execution Time: 0.123 ms"
      const match = plan.match(/Execution Time:\s*([\d.]+)\s*ms/i);
      if (match) {
        return parseFloat(match[1]);
      }
    }
    return 0;
  }

  // ===========================================================================
  // Private: Policy catalog queries
  // ===========================================================================

  /**
   * Fetch all RLS policies from the pg_policies view.
   */
  private async fetchAllPolicies(): Promise<RLSPolicy[]> {
    try {
      const rows = await prisma.$queryRawUnsafe<PolicyCatalogRow[]>(`
        SELECT
          polname,
          tablename,
          CASE polcmd
            WHEN 'r' THEN 'SELECT'
            WHEN 'a' THEN 'INSERT'
            WHEN 'w' THEN 'UPDATE'
            WHEN 'd' THEN 'DELETE'
            ELSE '*'
          END AS polcmd,
          polroles::text,
          pg_get_expr(polqual, polrelid) AS polqual,
          pg_get_expr(polwithcheck, polrelid) AS polwithcheck
        FROM pg_policy
        JOIN pg_class ON pg_class.oid = polrelid
        WHERE pg_class.relnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = 'public'
        )
      `);

      return rows.map((row) => ({
        policyName: row.polname,
        tableName: row.tablename,
        command: row.polcmd,
        qualifier: row.polcmd,
        roles: row.polroles ? row.polroles.replace(/[{}]/g, "").split(",") : [],
        usingExpression: row.polqual || null,
        checkExpression: row.polwithcheck || null,
      }));
    } catch (err) {
      logger.error("Failed to fetch RLS policies from catalog", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch RLS policies for a specific table.
   */
  private async fetchPoliciesForTable(tableName: string): Promise<RLSPolicy[]> {
    try {
      const rows = await prisma.$queryRawUnsafe<PolicyCatalogRow[]>(
        `
        SELECT
          polname,
          tablename,
          CASE polcmd
            WHEN 'r' THEN 'SELECT'
            WHEN 'a' THEN 'INSERT'
            WHEN 'w' THEN 'UPDATE'
            WHEN 'd' THEN 'DELETE'
            ELSE '*'
          END AS polcmd,
          polroles::text,
          pg_get_expr(polqual, polrelid) AS polqual,
          pg_get_expr(polwithcheck, polrelid) AS polwithcheck
        FROM pg_policy
        JOIN pg_class ON pg_class.oid = polrelid
        WHERE pg_class.relnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = 'public'
        )
        AND pg_class.relname = $1
        `,
        tableName
      );

      return rows.map((row) => ({
        policyName: row.polname,
        tableName: row.tablename,
        command: row.polcmd,
        qualifier: row.polcmd,
        roles: row.polroles ? row.polroles.replace(/[{}]/g, "").split(",") : [],
        usingExpression: row.polqual || null,
        checkExpression: row.polwithcheck || null,
      }));
    } catch (err) {
      logger.error("Failed to fetch RLS policies for table", {
        table: tableName,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Get all tables that have RLS enabled.
   */
  private async getRLSEnabledTables(): Promise<string[]> {
    try {
      const rows = await prisma.$queryRawUnsafe<RLSTableRow[]>(`
        SELECT relname AS tablename
        FROM pg_class
        WHERE relrowsecurity = true
        AND relnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = 'public'
        )
        ORDER BY relname
      `);

      return rows.map((row) => row.tablename);
    } catch (err) {
      logger.error("Failed to fetch RLS-enabled tables", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Get existing indexes for a table.
   */
  private async getTableIndexes(tableName: string): Promise<IndexCatalogRow[]> {
    try {
      return await prisma.$queryRawUnsafe<IndexCatalogRow[]>(
        `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = $1
        `,
        tableName
      );
    } catch (err) {
      logger.error("Failed to fetch indexes for table", {
        table: tableName,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // ===========================================================================
  // Private: Policy analysis
  // ===========================================================================

  /**
   * Extract column names referenced in a policy expression.
   * Parses simple patterns like `column_name = value` or `column_name IN (...)`.
   */
  private extractColumnsFromExpression(expression: string | null): string[] {
    if (!expression) return [];

    const columns: string[] = [];

    // Match identifiers before comparison operators
    const comparisonPattern = /\b([a-z_][a-z0-9_]*)\s*(?:=|<>|!=|<|>|<=|>=|IN|ANY|IS)\b/gi;
    let match: RegExpExecArray | null;

    while ((match = comparisonPattern.exec(expression)) !== null) {
      const col = match[1].toLowerCase();
      // Filter out SQL keywords and common function names
      if (!SQL_KEYWORDS.has(col) && !columns.includes(col)) {
        columns.push(col);
      }
    }

    return columns;
  }

  /**
   * Identify policies on the same table that could be merged.
   */
  private findSimplifiablePolicies(
    table: string,
    policies: RLSPolicy[]
  ): PolicySimplification[] {
    const simplifications: PolicySimplification[] = [];

    // Group policies by command type
    const byCommand = new Map<string, RLSPolicy[]>();
    for (const policy of policies) {
      const existing = byCommand.get(policy.command) ?? [];
      existing.push(policy);
      byCommand.set(policy.command, existing);
    }

    for (const [command, commandPolicies] of byCommand) {
      if (commandPolicies.length < 2) continue;

      // Check for duplicate USING expressions
      const expressionGroups = new Map<string, RLSPolicy[]>();
      for (const policy of commandPolicies) {
        const expr = (policy.usingExpression ?? "").trim().toLowerCase();
        if (!expr) continue;
        const group = expressionGroups.get(expr) ?? [];
        group.push(policy);
        expressionGroups.set(expr, group);
      }

      for (const [expr, group] of expressionGroups) {
        if (group.length > 1) {
          simplifications.push({
            table,
            policies: group.map((p) => p.policyName),
            reason: `${group.length} policies for ${command} share identical USING expression`,
            suggestion: `Merge into a single policy with combined roles. Expression: ${expr}`,
          });
        }
      }

      // Check for overlapping role assignments
      if (commandPolicies.length >= 2) {
        const allRoles = commandPolicies.flatMap((p) => p.roles);
        const uniqueRoles = new Set(allRoles);
        if (allRoles.length !== uniqueRoles.size) {
          const duplicateRoles = allRoles.filter(
            (role, idx) => allRoles.indexOf(role) !== idx
          );
          const uniqueDuplicates = [...new Set(duplicateRoles)];
          simplifications.push({
            table,
            policies: commandPolicies.map((p) => p.policyName),
            reason: `Roles [${uniqueDuplicates.join(", ")}] appear in multiple ${command} policies`,
            suggestion:
              "Consolidate policies to avoid ambiguous role-policy overlap which can cause unexpected access patterns",
          });
        }
      }
    }

    return simplifications;
  }

  /**
   * Assess whether RLS policies use cache-friendly patterns.
   * Per-row function calls (e.g., current_setting()) defeat PostgreSQL's
   * plan caching and force re-evaluation for every row.
   */
  private assessCacheFriendliness(
    table: string,
    policies: RLSPolicy[]
  ): CacheFriendlinessIssue[] {
    const issues: CacheFriendlinessIssue[] = [];

    for (const policy of policies) {
      const expressions = [policy.usingExpression, policy.checkExpression].filter(
        Boolean
      ) as string[];

      for (const expr of expressions) {
        // Check for per-row function calls
        for (const pattern of PER_ROW_FUNCTION_PATTERNS) {
          if (pattern.test(expr)) {
            const isMitigated = CACHE_FRIENDLY_PATTERNS.some((p) => p.test(expr));

            if (!isMitigated) {
              issues.push({
                table,
                policy: policy.policyName,
                issue: `Per-row function call detected: ${expr.match(pattern)?.[0] ?? "unknown"}`,
                recommendation:
                  "Replace per-row function calls with session variables (SET LOCAL) " +
                  "or pre-computed join columns. Consider using current_setting() with " +
                  "a session variable set once per transaction rather than evaluated per row.",
              });
            }
          }
        }

        // Check for subqueries in policy expressions
        if (/\bSELECT\b/i.test(expr)) {
          issues.push({
            table,
            policy: policy.policyName,
            issue: "Subquery detected in RLS policy expression",
            recommendation:
              "Replace subqueries with JOIN-based approaches or materialized security " +
              "labels. Subqueries in RLS policies execute per-row and cannot be cached " +
              "effectively by the query planner.",
          });
        }

        // Check for volatile function usage
        if (/\b(now|timeofday|random|setseed)\s*\(/i.test(expr)) {
          issues.push({
            table,
            policy: policy.policyName,
            issue: "Volatile function in RLS expression prevents plan caching",
            recommendation:
              "Use STABLE or IMMUTABLE functions instead. If time-based filtering is " +
              "needed, set a session variable at transaction start.",
          });
        }
      }
    }

    return issues;
  }

  /**
   * Estimate the improvement that adding an index would bring.
   */
  private estimateIndexImprovement(policy: RLSPolicy): string {
    const expr = policy.usingExpression ?? "";

    // Simple equality check - high improvement
    if (/=\s*\$\d+|=\s*current_setting/i.test(expr)) {
      return "high - equality filter on RLS column, index enables index scan vs sequential scan";
    }

    // IN or ANY - medium improvement
    if (/\bIN\b|\bANY\b/i.test(expr)) {
      return "medium - set membership check benefits from index but depends on set size";
    }

    // Range comparison - medium improvement
    if (/<|>|<=|>=|BETWEEN/i.test(expr)) {
      return "medium - range filter benefits from B-tree index";
    }

    return "low-medium - general improvement from avoiding sequential scan on policy column";
  }

  // ===========================================================================
  // Private: Utilities
  // ===========================================================================

  /**
   * Sanitize a table name to prevent SQL injection.
   * Only allows alphanumeric characters and underscores.
   */
  private sanitizeIdentifier(identifier: string): string {
    return identifier.replace(/[^a-zA-Z0-9_]/g, "");
  }
}

// =============================================================================
// SQL Keywords Set (for filtering column extraction)
// =============================================================================

const SQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "and",
  "or",
  "not",
  "in",
  "is",
  "null",
  "true",
  "false",
  "any",
  "all",
  "exists",
  "between",
  "like",
  "ilike",
  "case",
  "when",
  "then",
  "else",
  "end",
  "cast",
  "as",
  "on",
  "join",
  "inner",
  "left",
  "right",
  "outer",
  "cross",
  "using",
  "with",
  "recursive",
  "union",
  "intersect",
  "except",
  "order",
  "by",
  "limit",
  "offset",
  "having",
  "group",
  "distinct",
  "current_setting",
  "current_user",
  "session_user",
]);

// =============================================================================
// Export
// =============================================================================

export const rlsOptimizer = new RLSOptimizer();
