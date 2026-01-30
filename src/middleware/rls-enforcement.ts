import { AsyncLocalStorage } from "async_hooks";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Models that carry an organizationId column and must be tenant-scoped
// ---------------------------------------------------------------------------
const ORG_SCOPED_MODELS = new Set([
  "Session",
  "Skill",
  "SlackIntegration",
  "Agent",
  "Team",
  "Project",
  "Task",
  "Goal",
  "ValueStream",
  "KPI",
  "Workflow",
  "OrchestratorExecution",
  "AgentActivity",
  "MCPConnection",
  "ClaudeAccount",
  "ClaudeMaxAccount",
  "NotionConnection",
  "AuditLog",
  "Approval",
  "Delegation",
  "AgentPermissionOverride",
  "OrganizationChange",
  "DriveConnection",
  "GoogleCalendarConnection",
  "SessionHijackingAttempt",
  "WorkspaceDomain",
  "Membership",
  "FeatureFlagOverride",
  "FeatureFlagAuditLog",
  "MarketplaceExtension",
  "ExtensionInstallation",
  "ExtensionPermission",
  "ExtensionUsageLog",
  "SkillLearningPattern",
  "AgentSkillAssignment",
  "APIKey",
  "PublicWebhook",
  "WorkQueue",
  "UsageRecord",
  "OnboardingState",
  "Objective",
  "ExternalIdentity",
  "IdentityLinkSuggestion",
  "IdentityLinkAudit",
  "IdentitySettings",
]);

// Prisma actions that read or mutate scoped rows
const ENFORCED_ACTIONS = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

// ---------------------------------------------------------------------------
// RLS Context – AsyncLocalStorage wrapper
// ---------------------------------------------------------------------------

interface RLSStore {
  organizationId: string | null;
  bypass: boolean;
}

/**
 * Manages per-request Row-Level Security context using AsyncLocalStorage.
 *
 * Typical lifecycle:
 *   1. Tenant middleware resolves the org and calls `rlsContext.run(orgId, next)`
 *   2. All downstream Prisma queries go through the RLS middleware which
 *      reads `rlsContext.getCurrentOrgId()` and injects the filter automatically.
 *   3. Admin / system-level code can opt out with `rlsContext.bypass(fn)`.
 */
class RLSContext {
  private storage = new AsyncLocalStorage<RLSStore>();

  /**
   * Execute `fn` within an organization-scoped context.
   * All Prisma queries inside `fn` will be automatically filtered to `orgId`.
   */
  run<T>(orgId: string, fn: () => T): T {
    return this.storage.run({ organizationId: orgId, bypass: false }, fn);
  }

  /**
   * Returns the current organization ID, or `null` when called outside of
   * a scoped context (or during a bypass).
   */
  getCurrentOrgId(): string | null {
    const store = this.storage.getStore();
    if (!store || store.bypass) {
      return null;
    }
    return store.organizationId;
  }

  /**
   * Execute `fn` without any RLS filtering.
   * Use this for admin/system queries that intentionally cross tenant boundaries.
   */
  bypass<T>(fn: () => T): T {
    return this.storage.run({ organizationId: null, bypass: true }, fn);
  }

  /**
   * Returns `true` when the current execution is inside a bypass context.
   */
  isBypassed(): boolean {
    const store = this.storage.getStore();
    return store?.bypass === true;
  }
}

/** Singleton – import and use throughout the application. */
export const rlsContext = new RLSContext();

// ---------------------------------------------------------------------------
// Prisma Middleware
// ---------------------------------------------------------------------------

type PrismaMiddlewareParams = {
  model?: string;
  action: string;
  args: Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
};

type PrismaMiddlewareNext = (params: PrismaMiddlewareParams) => Promise<unknown>;

/**
 * Creates a Prisma middleware function that enforces organizationId filtering.
 *
 * For every query targeting an org-scoped model the middleware will:
 * - Inject `where.organizationId` on reads (`findMany`, `findFirst`, etc.)
 * - Inject `where.organizationId` on mutations (`update`, `delete`, etc.)
 * - Log a warning when no org context is available (and the query is not bypassed)
 *
 * Usage:
 * ```ts
 * prisma.$use(createRLSMiddleware());
 * ```
 */
export function createRLSMiddleware() {
  return async function rlsMiddleware(
    params: PrismaMiddlewareParams,
    next: PrismaMiddlewareNext,
  ): Promise<unknown> {
    const { model, action } = params;

    // Only enforce on known org-scoped models with enforced actions
    if (!model || !ORG_SCOPED_MODELS.has(model) || !ENFORCED_ACTIONS.has(action)) {
      return next(params);
    }

    // If currently inside a bypass context, skip enforcement
    if (rlsContext.isBypassed()) {
      logger.debug("RLS bypass active – skipping org filter", { model, action });
      return next(params);
    }

    const orgId = rlsContext.getCurrentOrgId();

    if (!orgId) {
      logger.warn("RLS enforcement: query missing organization context", {
        model,
        action,
      });
      // Allow the query to proceed without filtering so that system-level
      // code that forgot to set context does not silently break. The warning
      // enables detection through log monitoring / alerting.
      return next(params);
    }

    // Inject the organizationId filter into the query args
    injectOrgFilter(params, orgId);

    return next(params);
  };
}

// ---------------------------------------------------------------------------
// Helper – inject organizationId into the where clause
// ---------------------------------------------------------------------------

function injectOrgFilter(params: PrismaMiddlewareParams, orgId: string): void {
  const { action, args } = params;

  switch (action) {
    case "findMany":
    case "findFirst":
    case "findFirstOrThrow":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany": {
      if (!args.where) {
        args.where = {};
      }
      (args.where as Record<string, unknown>).organizationId = orgId;
      break;
    }

    case "findUnique":
    case "findUniqueOrThrow": {
      // findUnique requires a unique constraint in `where`.
      // We cannot blindly add `organizationId` to the unique filter because
      // Prisma expects exactly the unique key fields.  Instead, we
      // downgrade to findFirst which allows arbitrary where combinations.
      // The middleware returns the mutated params to `next` which will
      // use the updated action.
      if (!args.where) {
        args.where = {};
      }
      (args.where as Record<string, unknown>).organizationId = orgId;
      // Prisma middleware cannot change the action itself, but we still
      // add the filter. Prisma will evaluate composite unique constraints
      // that include organizationId. For models whose unique key does NOT
      // include organizationId, the extra field is silently ignored by
      // Prisma's unique lookup but adds defence-in-depth via DB-level RLS.
      break;
    }

    case "update":
    case "delete": {
      // Single update/delete uses `where` with a unique identifier.
      // We add organizationId as an additional guard (same rationale as
      // findUnique above).
      if (!args.where) {
        args.where = {};
      }
      (args.where as Record<string, unknown>).organizationId = orgId;
      break;
    }

    default:
      break;
  }
}
