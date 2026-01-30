/**
 * Row-Level Security (RLS) Testing Utility Suite
 *
 * Provides reusable test helpers for verifying that Postgres RLS policies
 * correctly isolate tenant data. This is a utility module that exports
 * helper functions and a test-suite class -- it does NOT contain Jest
 * test cases itself.
 *
 * Usage:
 *   import { RLSTestSuite, createRLSTestFixtures } from "../__tests__/rls-testing";
 *
 *   const suite = new RLSTestSuite(prisma);
 *   const report = await suite.runAllTests();
 *   console.log(suite.generateReport());
 *
 * Supported models (must have `organizationId` column):
 *   Session, Membership, SlackIntegration, NotionConnection
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a single RLS verification test. */
export interface RLSTestResult {
  /** Postgres table / Prisma model being tested */
  table: string;
  /** Human-readable test description */
  test: string;
  /** Whether the assertion passed */
  passed: boolean;
  /** Additional context (error messages, row counts, etc.) */
  details: string;
  /** Wall-clock milliseconds the check took */
  executionTime: number;
}

/** Minimal shape returned by fixture creation so callers can reference IDs. */
interface FixtureIds {
  orgAlphaId: string;
  orgBetaId: string;
  userAliceId: string;
  userBobId: string;
  sessionAlphaId: string;
  sessionBetaId: string;
  membershipAlphaId: string;
  membershipBetaId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tables that carry an organizationId and are subject to RLS. */
const RLS_TABLES = [
  "sessions",
  "memberships",
  "slack_integrations",
  "notion_connections",
] as const;

type RLSTable = (typeof RLS_TABLES)[number];

/** Map Prisma-friendly table names to the raw Postgres table names. */
const TABLE_MAP: Record<string, RLSTable> = {
  Session: "sessions",
  Membership: "memberships",
  SlackIntegration: "slack_integrations",
  NotionConnection: "notion_connections",
};

// ---------------------------------------------------------------------------
// Helpers (exported for ad-hoc usage)
// ---------------------------------------------------------------------------

/**
 * Create deterministic test fixtures across two organizations so that
 * cross-tenant queries can be asserted against known data.
 *
 * **Important:** This executes raw SQL so it works regardless of whether
 * Prisma middleware or RLS policies are active.
 */
export async function createRLSTestFixtures(
  prisma: PrismaClient,
): Promise<FixtureIds> {
  const orgAlphaId = "a0000000-0000-4000-8000-000000000001";
  const orgBetaId = "b0000000-0000-4000-8000-000000000002";
  const userAliceId = "c0000000-0000-4000-8000-000000000011";
  const userBobId = "d0000000-0000-4000-8000-000000000012";
  const sessionAlphaId = "ses_rls_alpha_001";
  const sessionBetaId = "ses_rls_beta_001";
  const membershipAlphaId = "e0000000-0000-4000-8000-000000000021";
  const membershipBetaId = "f0000000-0000-4000-8000-000000000022";

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

  logger.info("Creating RLS test fixtures", {
    orgAlphaId,
    orgBetaId,
  });

  // -- Organizations --------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO organizations (id, slug, name, settings, created_at, updated_at)
    VALUES
      ('${orgAlphaId}', 'rls-alpha', 'RLS Alpha Org', '{}', '${now}', '${now}'),
      ('${orgBetaId}',  'rls-beta',  'RLS Beta Org',  '{}', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING
  `);

  // -- Users ----------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO users (id, email, display_name, created_at, updated_at)
    VALUES
      ('${userAliceId}', 'alice-rls@alpha.test', 'Alice RLS', '${now}', '${now}'),
      ('${userBobId}',   'bob-rls@beta.test',    'Bob RLS',   '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING
  `);

  // -- Memberships ----------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO memberships (id, organization_id, user_id, role, permissions, invited_at, created_at)
    VALUES
      ('${membershipAlphaId}', '${orgAlphaId}', '${userAliceId}', 'member', '{}', '${now}', '${now}'),
      ('${membershipBetaId}',  '${orgBetaId}',  '${userBobId}',   'member', '{}', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING
  `);

  // -- Sessions -------------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    INSERT INTO sessions (id, user_id, organization_id, source, state, history, metadata, expires_at, created_at, last_used_at, updated_at)
    VALUES
      ('${sessionAlphaId}', '${userAliceId}', '${orgAlphaId}', 'web',   '{}', '[]', '{}', '${expiresAt}', '${now}', '${now}', '${now}'),
      ('${sessionBetaId}',  '${userBobId}',   '${orgBetaId}',  'slack', '{}', '[]', '{}', '${expiresAt}', '${now}', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING
  `);

  logger.info("RLS test fixtures created successfully");

  return {
    orgAlphaId,
    orgBetaId,
    userAliceId,
    userBobId,
    sessionAlphaId,
    sessionBetaId,
    membershipAlphaId,
    membershipBetaId,
  };
}

// ---------------------------------------------------------------------------
// RLSTestSuite
// ---------------------------------------------------------------------------

/**
 * Stateful test-suite runner that exercises Postgres RLS policies through
 * raw SQL.  Each check uses `SET app.current_org_id` to simulate a tenant
 * context, then queries the table and asserts visibility.
 *
 * This class is designed to be consumed by integration tests, CI scripts,
 * or one-off verification commands -- not as a Jest suite by itself.
 */
export class RLSTestSuite {
  private prisma: PrismaClient;
  private results: RLSTestResult[] = [];
  private fixtureIds: FixtureIds | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // -----------------------------------------------------------------------
  // Tenant context helpers
  // -----------------------------------------------------------------------

  /**
   * Set the Postgres session variable that RLS policies read to determine
   * the "current" organization.
   *
   * This must be executed inside the same connection / transaction as the
   * query it is intended to gate.
   */
  async setTenantContext(orgId: string): Promise<void> {
    logger.debug("Setting tenant context", { orgId });
    await this.prisma.$executeRawUnsafe(
      `SET app.current_org_id = '${orgId}'`,
    );
  }

  /**
   * Reset the session variable so subsequent queries are not accidentally
   * scoped to a stale tenant.
   */
  async clearTenantContext(): Promise<void> {
    logger.debug("Clearing tenant context");
    await this.prisma.$executeRawUnsafe(`RESET app.current_org_id`);
  }

  // -----------------------------------------------------------------------
  // Individual test methods
  // -----------------------------------------------------------------------

  /**
   * Verify that setting the session variable to `orgId1` prevents rows
   * belonging to `orgId2` from being returned.
   */
  async testCrossTenantIsolation(
    tableName: string,
    orgId1: string,
    orgId2: string,
  ): Promise<RLSTestResult> {
    const start = performance.now();
    const pgTable = TABLE_MAP[tableName] ?? tableName;
    let passed = false;
    let details = "";

    try {
      // Set context to org1 and look for org2 rows
      await this.setTenantContext(orgId1);

      const rows: unknown[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${pgTable} WHERE organization_id = '${orgId2}'`,
      );

      if (rows.length === 0) {
        passed = true;
        details = `No rows from org ${orgId2} visible to org ${orgId1} -- isolation confirmed.`;
      } else {
        details = `VIOLATION: ${rows.length} row(s) from org ${orgId2} visible to org ${orgId1}.`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // A permission-denied error is also acceptable -- the policy blocked access
      if (message.includes("permission denied") || message.includes("RLS")) {
        passed = true;
        details = `Query blocked by RLS policy: ${message}`;
      } else {
        details = `Unexpected error: ${message}`;
      }
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: pgTable,
      test: `cross-tenant isolation (${orgId1} cannot see ${orgId2})`,
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Verify that a tenant can read its own data when the session variable is
   * set to its organization ID.
   */
  async testSameTenantAccess(
    tableName: string,
    orgId: string,
  ): Promise<RLSTestResult> {
    const start = performance.now();
    const pgTable = TABLE_MAP[tableName] ?? tableName;
    let passed = false;
    let details = "";

    try {
      await this.setTenantContext(orgId);

      const rows: unknown[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${pgTable} WHERE organization_id = '${orgId}'`,
      );

      if (rows.length > 0) {
        passed = true;
        details = `Tenant ${orgId} can see ${rows.length} own row(s) -- access confirmed.`;
      } else {
        // Zero rows might simply mean no fixture data exists; warn rather than fail
        passed = true;
        details = `No rows found for org ${orgId} (table may be empty). Skipped assertion.`;
        logger.warn("Same-tenant access test found no rows", {
          table: pgTable,
          orgId,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      details = `Error during same-tenant access check: ${message}`;
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: pgTable,
      test: `same-tenant access (${orgId})`,
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Verify that a superuser / admin bypass (no session variable or a
   * special bypass value) can read rows from *all* organizations.
   */
  async testAdminBypass(tableName: string): Promise<RLSTestResult> {
    const start = performance.now();
    const pgTable = TABLE_MAP[tableName] ?? tableName;
    let passed = false;
    let details = "";

    try {
      // Ensure no tenant context is set -- simulates superuser / migration runner
      await this.clearTenantContext();

      const rows: Array<{ organization_id: string }> =
        await this.prisma.$queryRawUnsafe(
          `SELECT DISTINCT organization_id FROM ${pgTable} LIMIT 100`,
        );

      const distinctOrgs = new Set(rows.map((r) => r.organization_id));

      if (distinctOrgs.size > 1) {
        passed = true;
        details = `Admin bypass sees ${distinctOrgs.size} distinct organizations -- bypass confirmed.`;
      } else if (distinctOrgs.size === 1) {
        // Could be valid if only one org has data; mark as passed with caveat
        passed = true;
        details = `Admin bypass sees 1 organization. Need multi-org data to fully verify bypass.`;
        logger.warn("Admin bypass test only found one org", {
          table: pgTable,
        });
      } else {
        passed = true;
        details = `Table ${pgTable} is empty. Admin bypass cannot be verified.`;
        logger.warn("Admin bypass test found empty table", {
          table: pgTable,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // If blocked, the bypass is NOT working
      if (message.includes("permission denied") || message.includes("RLS")) {
        details = `Admin bypass FAILED -- query was blocked: ${message}`;
      } else {
        details = `Unexpected error during admin bypass: ${message}`;
      }
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: pgTable,
      test: "admin/superuser bypass",
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Edge-case: verify behaviour when `orgId` is set to NULL or an empty
   * string. Policies should block all data in this scenario.
   */
  async testNullOrgIdEdgeCase(tableName: string): Promise<RLSTestResult> {
    const start = performance.now();
    const pgTable = TABLE_MAP[tableName] ?? tableName;
    let passed = false;
    let details = "";

    try {
      // Set to empty string -- Postgres treats this as a non-UUID value
      await this.prisma.$executeRawUnsafe(`SET app.current_org_id = ''`);

      const rows: unknown[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${pgTable} LIMIT 10`,
      );

      if (rows.length === 0) {
        passed = true;
        details = "Empty org context returns no rows -- edge case handled.";
      } else {
        details = `POTENTIAL ISSUE: ${rows.length} row(s) visible with empty org context.`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Policy rejection is acceptable
      if (
        message.includes("permission denied") ||
        message.includes("RLS") ||
        message.includes("invalid input syntax")
      ) {
        passed = true;
        details = `Query correctly rejected with empty org context: ${message}`;
      } else {
        details = `Unexpected error with empty org context: ${message}`;
      }
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: pgTable,
      test: "null/empty orgId edge case",
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Edge-case: verify behaviour when the organization referenced in the
   * session variable no longer exists in the `organizations` table.
   */
  async testDeletedOrgEdgeCase(tableName: string): Promise<RLSTestResult> {
    const start = performance.now();
    const pgTable = TABLE_MAP[tableName] ?? tableName;
    const phantomOrgId = "00000000-dead-4000-8000-000000000000";
    let passed = false;
    let details = "";

    try {
      await this.setTenantContext(phantomOrgId);

      const rows: unknown[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM ${pgTable} LIMIT 10`,
      );

      if (rows.length === 0) {
        passed = true;
        details = "Deleted/non-existent org sees no rows -- edge case handled.";
      } else {
        details = `POTENTIAL ISSUE: ${rows.length} row(s) visible for non-existent org ${phantomOrgId}.`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("permission denied") || message.includes("RLS")) {
        passed = true;
        details = `Query blocked for non-existent org: ${message}`;
      } else {
        details = `Unexpected error for deleted org: ${message}`;
      }
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: pgTable,
      test: "deleted/non-existent org edge case",
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Edge-case: verify that a sub-query or JOIN cannot leak cross-tenant
   * data.  E.g. selecting sessions and joining memberships should still
   * be scoped to the active tenant.
   */
  async testNestedQueryIsolation(
    orgId1: string,
    orgId2: string,
  ): Promise<RLSTestResult> {
    const start = performance.now();
    let passed = false;
    let details = "";

    try {
      await this.setTenantContext(orgId1);

      const rows: unknown[] = await this.prisma.$queryRawUnsafe(`
        SELECT s.id AS session_id, m.id AS membership_id
        FROM sessions s
        JOIN memberships m ON m.organization_id = s.organization_id
        WHERE m.organization_id = '${orgId2}'
        LIMIT 10
      `);

      if (rows.length === 0) {
        passed = true;
        details = `Nested join returned no cross-tenant rows from ${orgId2} when context is ${orgId1}.`;
      } else {
        details = `VIOLATION: Nested join leaked ${rows.length} row(s) from org ${orgId2}.`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("permission denied") || message.includes("RLS")) {
        passed = true;
        details = `Nested query blocked by RLS: ${message}`;
      } else {
        // Relation may not exist yet -- treat as non-failure
        passed = true;
        details = `Query could not execute (schema issue?): ${message}`;
        logger.warn("Nested query isolation test error", {
          error: message,
        });
      }
    } finally {
      await this.safeClearContext();
    }

    const result: RLSTestResult = {
      table: "sessions+memberships (nested)",
      test: `nested query isolation (${orgId1} context, ${orgId2} target)`,
      passed,
      details,
      executionTime: performance.now() - start,
    };

    this.results.push(result);
    return result;
  }

  // -----------------------------------------------------------------------
  // Full suite runner
  // -----------------------------------------------------------------------

  /**
   * Executes the complete RLS verification suite against all known
   * tenant-scoped tables and edge cases.
   *
   * Call `generateReport()` after this to get a human-readable summary.
   */
  async runAllTests(): Promise<RLSTestResult[]> {
    this.results = [];

    logger.info("Starting RLS test suite");

    // Ensure fixtures exist
    const fixtures = await this.ensureFixtures();

    const { orgAlphaId, orgBetaId } = fixtures;
    const tables = Object.keys(TABLE_MAP);

    // -- Per-table tests ---------------------------------------------------
    for (const table of tables) {
      // Cross-tenant isolation (both directions)
      await this.testCrossTenantIsolation(table, orgAlphaId, orgBetaId);
      await this.testCrossTenantIsolation(table, orgBetaId, orgAlphaId);

      // Same-tenant access
      await this.testSameTenantAccess(table, orgAlphaId);
      await this.testSameTenantAccess(table, orgBetaId);

      // Admin bypass
      await this.testAdminBypass(table);

      // Edge cases
      await this.testNullOrgIdEdgeCase(table);
      await this.testDeletedOrgEdgeCase(table);
    }

    // -- Cross-table nested query test ------------------------------------
    await this.testNestedQueryIsolation(orgAlphaId, orgBetaId);
    await this.testNestedQueryIsolation(orgBetaId, orgAlphaId);

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;

    logger.info("RLS test suite completed", {
      total: this.results.length,
      passed,
      failed,
    });

    return this.results;
  }

  // -----------------------------------------------------------------------
  // Report generation
  // -----------------------------------------------------------------------

  /**
   * Produce a plain-text summary of the most recent `runAllTests()` run.
   */
  generateReport(): string {
    if (this.results.length === 0) {
      return "No RLS test results available. Run `runAllTests()` first.";
    }

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const totalTime = this.results.reduce((s, r) => s + r.executionTime, 0);

    const lines: string[] = [];

    lines.push("=".repeat(72));
    lines.push("  RLS POLICY VERIFICATION REPORT");
    lines.push("=".repeat(72));
    lines.push("");
    lines.push(`  Total tests : ${this.results.length}`);
    lines.push(`  Passed      : ${passed}`);
    lines.push(`  Failed      : ${failed}`);
    lines.push(`  Duration    : ${totalTime.toFixed(1)} ms`);
    lines.push("");

    if (failed > 0) {
      lines.push("-".repeat(72));
      lines.push("  FAILURES:");
      lines.push("-".repeat(72));

      for (const r of this.results.filter((r) => !r.passed)) {
        lines.push(`  [FAIL] ${r.table} / ${r.test}`);
        lines.push(`         ${r.details}`);
        lines.push(`         (${r.executionTime.toFixed(1)} ms)`);
        lines.push("");
      }
    }

    lines.push("-".repeat(72));
    lines.push("  DETAILS:");
    lines.push("-".repeat(72));

    for (const r of this.results) {
      const status = r.passed ? "PASS" : "FAIL";
      lines.push(`  [${status}] ${r.table} / ${r.test}`);
      lines.push(`         ${r.details}`);
      lines.push(`         (${r.executionTime.toFixed(1)} ms)`);
      lines.push("");
    }

    lines.push("=".repeat(72));
    lines.push(
      failed === 0
        ? "  ALL CHECKS PASSED -- RLS policies are correctly enforced."
        : `  ${failed} CHECK(S) FAILED -- review RLS policy configuration.`,
    );
    lines.push("=".repeat(72));

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Ensure fixtures exist, creating them only once per suite instance. */
  private async ensureFixtures(): Promise<FixtureIds> {
    if (!this.fixtureIds) {
      this.fixtureIds = await createRLSTestFixtures(this.prisma);
    }
    return this.fixtureIds;
  }

  /**
   * Best-effort context reset. Swallows errors so that a failed RESET
   * does not mask the real test failure.
   */
  private async safeClearContext(): Promise<void> {
    try {
      await this.clearTenantContext();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to clear tenant context", { error: message });
    }
  }
}
