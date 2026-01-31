import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { rlsContext } from "../middleware/rls-enforcement";
import { runWithoutRLS as asyncRunWithoutRLS } from "./async-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckResult {
  model: string;
  passed: boolean;
  details: string;
}

export interface IsolationReport {
  passed: boolean;
  checks: CheckResult[];
}

export interface PairwiseReport {
  overall: boolean;
  pairs: Array<{
    orgA: string;
    orgB: string;
    report: IsolationReport;
  }>;
  summary: string;
}

// ---------------------------------------------------------------------------
// Models to verify – each must have an `organizationId` column.
// ---------------------------------------------------------------------------

const CHECKED_MODELS = ["Session", "Membership", "SlackIntegration"] as const;

type CheckedModel = (typeof CHECKED_MODELS)[number];

// ---------------------------------------------------------------------------
// Count helpers
// ---------------------------------------------------------------------------

async function countForOrg(model: CheckedModel, orgId: string): Promise<number> {
  return rlsContext.bypass(async () => {
    switch (model) {
      case "Session":
        return prisma.session.count({ where: { organizationId: orgId } });
      case "Membership":
        return prisma.membership.count({ where: { organizationId: orgId } });
      case "SlackIntegration":
        return prisma.slackIntegration.count({ where: { organizationId: orgId } });
    }
  });
}

async function countBelongingTo(model: CheckedModel, targetOrgId: string): Promise<number> {
  return rlsContext.bypass(async () => {
    switch (model) {
      case "Session":
        return prisma.session.count({ where: { organizationId: targetOrgId } });
      case "Membership":
        return prisma.membership.count({ where: { organizationId: targetOrgId } });
      case "SlackIntegration":
        return prisma.slackIntegration.count({ where: { organizationId: targetOrgId } });
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a database query without RLS filtering.
 * Use this for system-level queries that need to bypass tenant isolation,
 * such as authentication lookups that need to establish the organization context.
 */
export async function runWithoutRLS<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
  // Use the async-context based bypass which is what db/client.ts actually uses
  return asyncRunWithoutRLS(fn);
}

/**
 * Verify that data belonging to orgIdA is fully isolated from orgIdB.
 */
export async function verifyDataIsolation(
  orgIdA: string,
  orgIdB: string,
): Promise<IsolationReport> {
  const checks: CheckResult[] = [];

  for (const model of CHECKED_MODELS) {
    try {
      const orgACount = await countForOrg(model, orgIdA);
      const orgBCount = await countForOrg(model, orgIdB);

      // Run within orgA's RLS context and check if orgB's records leak through
      const leakedFromB = await new Promise<number>((resolve) => {
        rlsContext.run(orgIdA, async () => {
          const leaked = await countBelongingTo(model, orgIdB);
          resolve(leaked);
        });
      });

      const passed = leakedFromB === 0;

      checks.push({
        model,
        passed,
        details: passed
          ? `OK – orgA has ${orgACount} record(s), orgB has ${orgBCount} record(s), 0 leaked.`
          : `FAIL – ${leakedFromB} record(s) from orgB visible in orgA context.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Data isolation check failed", { model, orgIdA, orgIdB });
      checks.push({
        model,
        passed: false,
        details: `ERROR – check could not complete: ${message}`,
      });
    }
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * Run pairwise isolation verification across all provided organization IDs.
 */
export async function createIsolationReport(orgIds: string[]): Promise<PairwiseReport> {
  const pairs: PairwiseReport["pairs"] = [];

  for (let i = 0; i < orgIds.length; i++) {
    for (let j = i + 1; j < orgIds.length; j++) {
      const orgA = orgIds[i];
      const orgB = orgIds[j];

      const reportAB = await verifyDataIsolation(orgA, orgB);
      pairs.push({ orgA, orgB, report: reportAB });

      const reportBA = await verifyDataIsolation(orgB, orgA);
      pairs.push({ orgA: orgB, orgB: orgA, report: reportBA });
    }
  }

  const totalChecks = pairs.reduce((sum, p) => sum + p.report.checks.length, 0);
  const failedChecks = pairs.reduce(
    (sum, p) => sum + p.report.checks.filter((c) => !c.passed).length,
    0,
  );
  const overall = failedChecks === 0;

  const summary = overall
    ? `All ${totalChecks} isolation checks passed across ${orgIds.length} organizations.`
    : `${failedChecks} of ${totalChecks} checks FAILED across ${orgIds.length} organizations.`;

  logger.info("Data isolation report complete", {
    organizationCount: orgIds.length,
    totalChecks,
    failedChecks,
    overall,
  });

  return { overall, pairs, summary };
}
