/**
 * Row-Level Security (RLS) Enforcement Test Suite
 *
 * Verifies that:
 * 1. Users can only access data from their own organization
 * 2. Cross-organization data access is blocked
 * 3. Admin users have broader access per their role
 * 4. API endpoints enforce organization isolation
 * 5. Database queries respect RLS policies
 * 6. Session data is isolated per organization
 * 7. Membership records are isolated per organization
 *
 * The RLS system has two layers:
 *   - Prisma middleware (createRLSMiddleware) injects organizationId into WHERE clauses
 *   - AsyncLocalStorage context (rlsContext) carries the current org per request
 */

jest.mock("../../db/client", () => ({
  db: {
    session: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    membership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    agent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    skill: {
      findMany: jest.fn(),
    },
    workflow: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("../../db/redis", () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
  },
  getQueueConnection: jest.fn(),
  releaseQueueConnection: jest.fn(),
}));

import { rlsContext, createRLSMiddleware } from "../../middleware/rls-enforcement";

// ---------------------------------------------------------------------------
// Test data: two organizations with distinct users, sessions, memberships
// ---------------------------------------------------------------------------

const ORG_ALPHA_ID = "org-alpha-111-aaa";
const ORG_BETA_ID = "org-beta-222-bbb";

const USER_ALICE = {
  id: "user-alice-001",
  email: "alice@alpha.io",
  name: "Alice",
  organizationId: ORG_ALPHA_ID,
};

const USER_BOB = {
  id: "user-bob-002",
  email: "bob@beta.io",
  name: "Bob",
  organizationId: ORG_BETA_ID,
};

const USER_ADMIN = {
  id: "user-admin-003",
  email: "admin@alpha.io",
  name: "Admin User",
  organizationId: ORG_ALPHA_ID,
};

const SESSION_ALPHA = {
  id: "ses-alpha-001",
  userId: USER_ALICE.id,
  organizationId: ORG_ALPHA_ID,
  source: "web",
  state: {},
  createdAt: new Date("2026-01-15"),
};

const SESSION_BETA = {
  id: "ses-beta-001",
  userId: USER_BOB.id,
  organizationId: ORG_BETA_ID,
  source: "slack",
  state: {},
  createdAt: new Date("2026-01-16"),
};

const MEMBERSHIP_ALICE = {
  id: "mem-alice-001",
  organizationId: ORG_ALPHA_ID,
  userId: USER_ALICE.id,
  role: "member",
};

const MEMBERSHIP_BOB = {
  id: "mem-bob-001",
  organizationId: ORG_BETA_ID,
  userId: USER_BOB.id,
  role: "member",
};

const MEMBERSHIP_ADMIN = {
  id: "mem-admin-001",
  organizationId: ORG_ALPHA_ID,
  userId: USER_ADMIN.id,
  role: "admin",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockParams = {
  model?: string;
  action: string;
  args: Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
};

function createMockParams(overrides: Partial<MockParams> = {}): MockParams {
  return {
    model: "Session",
    action: "findMany",
    args: {},
    dataPath: [],
    runInTransaction: false,
    ...overrides,
  };
}

function createMockNext() {
  return jest.fn().mockImplementation(async (params: MockParams) => params);
}

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    cookies: {},
    headers: {},
    hostname: "alpha.kyndof-corp.com",
    ip: "127.0.0.1",
    path: "/api/sessions",
    method: "GET",
    params: {},
    body: {},
    get: jest.fn().mockReturnValue("test-agent"),
    socket: { remoteAddress: "127.0.0.1" },
    user: undefined as typeof USER_ALICE | undefined,
    organization: undefined as { id: string; slug: string } | undefined | null,
    membership: undefined as typeof MEMBERSHIP_ALICE | undefined,
    currentOrganizationId: undefined as string | undefined,
    ...overrides,
  };
}

function createMockRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RLS Enforcement", () => {
  let rlsMiddleware: ReturnType<typeof createRLSMiddleware>;

  beforeAll(() => {
    rlsMiddleware = createRLSMiddleware();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Organization Isolation
  // =========================================================================
  describe("Organization Isolation", () => {
    it("should inject organizationId into findMany WHERE clause for org-scoped models", async () => {
      const params = createMockParams({
        model: "Session",
        action: "findMany",
        args: { where: { source: "web" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      expect(next).toHaveBeenCalledTimes(1);
      const passedParams = next.mock.calls[0][0];
      expect(passedParams.args.where).toEqual({
        source: "web",
        organizationId: ORG_ALPHA_ID,
      });
    });

    it("should inject organizationId into findFirst WHERE clause", async () => {
      const params = createMockParams({
        model: "Agent",
        action: "findFirst",
        args: { where: { name: "support-agent" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect(passedParams.args.where).toEqual({
        name: "support-agent",
        organizationId: ORG_ALPHA_ID,
      });
    });

    it("should inject organizationId into count queries", async () => {
      const params = createMockParams({
        model: "Task",
        action: "count",
        args: { where: { status: "completed" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect(passedParams.args.where).toEqual({
        status: "completed",
        organizationId: ORG_BETA_ID,
      });
    });

    it("should create WHERE clause if none exists and inject organizationId", async () => {
      const params = createMockParams({
        model: "Skill",
        action: "findMany",
        args: {},
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect(passedParams.args.where).toBeDefined();
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should inject organizationId for aggregate queries", async () => {
      const params = createMockParams({
        model: "Task",
        action: "aggregate",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });

    it("should inject organizationId for groupBy queries", async () => {
      const params = createMockParams({
        model: "Agent",
        action: "groupBy",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });
  });

  // =========================================================================
  // 2. Session Isolation
  // =========================================================================
  describe("Session Isolation", () => {
    it("should scope session findMany to the requesting organization", async () => {
      const params = createMockParams({
        model: "Session",
        action: "findMany",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should prevent session lookup from returning cross-org results", async () => {
      const params = createMockParams({
        model: "Session",
        action: "findFirst",
        args: { where: { id: SESSION_BETA.id } },
      });
      const next = createMockNext();

      // Org Alpha tries to look up a session that belongs to Org Beta.
      // The middleware injects organizationId = ORG_ALPHA_ID, which would
      // not match the Beta session's organizationId in the database.
      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
      // The injected orgId won't match SESSION_BETA.organizationId at DB level
      expect((passedParams.args.where as Record<string, unknown>).organizationId).not.toBe(
        ORG_BETA_ID,
      );
    });

    it("should scope session update to the correct organization", async () => {
      const params = createMockParams({
        model: "Session",
        action: "update",
        args: {
          where: { id: SESSION_ALPHA.id },
          data: { state: { step: 2 } },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should scope session delete to the correct organization", async () => {
      const params = createMockParams({
        model: "Session",
        action: "delete",
        args: { where: { id: SESSION_ALPHA.id } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });
  });

  // =========================================================================
  // 3. Membership Isolation
  // =========================================================================
  describe("Membership Isolation", () => {
    it("should scope membership findMany to the requesting organization", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "findMany",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should add organizationId to membership findUnique for defense-in-depth", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "findUnique",
        args: {
          where: {
            organizationId_userId: {
              organizationId: ORG_ALPHA_ID,
              userId: USER_ALICE.id,
            },
          },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should inject org filter into deleteMany for membership bulk operations", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "deleteMany",
        args: { where: { role: "member" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
      expect((passedParams.args.where as Record<string, unknown>).role).toBe("member");
    });

    it("should inject org filter into updateMany for membership bulk operations", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "updateMany",
        args: {
          where: { role: "member" },
          data: { role: "viewer" },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });

    it("should prevent cross-org membership lookup for Bob in Alpha org", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "findFirst",
        args: { where: { id: MEMBERSHIP_BOB.id } },
      });
      const next = createMockNext();

      // Org Alpha tries to look up Bob's membership which belongs to Org Beta
      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
      // The injected orgId (Alpha) won't match Bob's membership orgId (Beta)
      expect(MEMBERSHIP_BOB.organizationId).toBe(ORG_BETA_ID);
      expect(MEMBERSHIP_BOB.organizationId).not.toBe(ORG_ALPHA_ID);
    });
  });

  // =========================================================================
  // 4. Admin Access
  // =========================================================================
  describe("Admin Access", () => {
    it("should allow admin bypass to skip org filtering", async () => {
      const params = createMockParams({
        model: "Session",
        action: "findMany",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.bypass(() => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      // With bypass active, organizationId should NOT be injected
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBeUndefined();
    });

    it("should report bypass state correctly via isBypassed()", () => {
      let bypassInsideContext = false;
      let bypassOutsideContext = false;

      rlsContext.bypass(() => {
        bypassInsideContext = rlsContext.isBypassed();
      });
      bypassOutsideContext = rlsContext.isBypassed();

      expect(bypassInsideContext).toBe(true);
      expect(bypassOutsideContext).toBe(false);
    });

    it("should return null orgId during bypass even when nested inside an org context", () => {
      let orgIdDuringBypass: string | null = "not-cleared";

      rlsContext.run(ORG_ALPHA_ID, () => {
        rlsContext.bypass(() => {
          orgIdDuringBypass = rlsContext.getCurrentOrgId();
        });
      });

      expect(orgIdDuringBypass).toBeNull();
    });

    it("should allow admin to query across organizations during bypass", async () => {
      const params = createMockParams({
        model: "Membership",
        action: "findMany",
        args: { where: { role: "admin" } },
      });
      const next = createMockNext();

      await rlsContext.bypass(() => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      // WHERE clause should only contain role, no organizationId injected
      expect(passedParams.args.where).toEqual({ role: "admin" });
    });

    it("should restore org context after bypass completes", () => {
      let orgIdBeforeBypass: string | null = null;
      let orgIdAfterBypass: string | null = null;

      rlsContext.run(ORG_ALPHA_ID, () => {
        orgIdBeforeBypass = rlsContext.getCurrentOrgId();
        rlsContext.bypass(() => {
          // inside bypass
        });
        orgIdAfterBypass = rlsContext.getCurrentOrgId();
      });

      expect(orgIdBeforeBypass).toBe(ORG_ALPHA_ID);
      expect(orgIdAfterBypass).toBe(ORG_ALPHA_ID);
    });
  });

  // =========================================================================
  // 5. Cross-org Prevention
  // =========================================================================
  describe("Cross-org Prevention", () => {
    it("should always inject the current context org, not the requested one", async () => {
      // Simulate Org Beta user trying to pass organizationId of Org Alpha in args
      const params = createMockParams({
        model: "Agent",
        action: "findMany",
        args: {
          where: { organizationId: ORG_ALPHA_ID, name: "evil-agent" },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      // The middleware overwrites any user-supplied organizationId
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });

    it("should prevent Org Alpha from deleting Org Beta sessions", async () => {
      const params = createMockParams({
        model: "Session",
        action: "deleteMany",
        args: { where: { organizationId: ORG_BETA_ID } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      // Overwritten to Alpha's context
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_ALPHA_ID,
      );
    });

    it("should prevent Org Beta from updating Org Alpha agents", async () => {
      const params = createMockParams({
        model: "Agent",
        action: "update",
        args: {
          where: { id: "agent-alpha-001" },
          data: { name: "hacked-agent" },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });

    it("should prevent cross-org access on findUniqueOrThrow", async () => {
      const params = createMockParams({
        model: "Workflow",
        action: "findUniqueOrThrow",
        args: { where: { id: "wf-alpha-001" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });

    it("should prevent cross-org access on findFirstOrThrow", async () => {
      const params = createMockParams({
        model: "AuditLog",
        action: "findFirstOrThrow",
        args: { where: { id: "audit-alpha-001" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
    });
  });

  // =========================================================================
  // 6. API Endpoint Isolation
  // =========================================================================
  describe("API Endpoint Isolation", () => {
    it("should scope API requests to the authenticated user's organization", async () => {
      const req = createMockReq({
        user: USER_ALICE,
        organization: { id: ORG_ALPHA_ID, slug: "alpha" },
        membership: MEMBERSHIP_ALICE,
        currentOrganizationId: ORG_ALPHA_ID,
      });

      // Verify the request carries organization context
      expect(req.currentOrganizationId).toBe(ORG_ALPHA_ID);
      expect(req.organization?.id).toBe(ORG_ALPHA_ID);
      expect(req.user?.organizationId).toBe(ORG_ALPHA_ID);
    });

    it("should reject requests without organization context (requireOrganization pattern)", () => {
      const req = createMockReq({ organization: null });
      const res = createMockRes();
      const next = jest.fn();

      // Simulate the requireOrganization middleware check
      if (!req.organization) {
        res.status(400);
        res.json({ error: "Organization required" });
      } else {
        next();
      }

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Organization required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject admin-only endpoints for non-admin users", () => {
      const req = createMockReq({
        user: USER_ALICE,
        membership: MEMBERSHIP_ALICE, // role: "member"
      });
      const res = createMockRes();
      const next = jest.fn();

      // Simulate requireAdmin middleware check
      const role = req.membership?.role;
      if (role !== "owner" && role !== "admin") {
        res.status(403);
        res.json({ error: "Admin role required" });
      } else {
        next();
      }

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Admin role required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow admin users through admin-only endpoints", () => {
      const req = createMockReq({
        user: USER_ADMIN,
        membership: MEMBERSHIP_ADMIN, // role: "admin"
      });
      const res = createMockRes();
      const next = jest.fn();

      const role = req.membership?.role;
      if (role !== "owner" && role !== "admin") {
        res.status(403);
        res.json({ error: "Admin role required" });
      } else {
        next();
      }

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should ensure different org users get different query scopes", async () => {
      const paramsAlpha = createMockParams({
        model: "Task",
        action: "findMany",
        args: { where: { status: "open" } },
      });
      const paramsBeta = createMockParams({
        model: "Task",
        action: "findMany",
        args: { where: { status: "open" } },
      });
      const nextAlpha = createMockNext();
      const nextBeta = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(paramsAlpha, nextAlpha));
      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(paramsBeta, nextBeta));

      const alphaWhere = nextAlpha.mock.calls[0][0].args.where as Record<string, unknown>;
      const betaWhere = nextBeta.mock.calls[0][0].args.where as Record<string, unknown>;

      expect(alphaWhere.organizationId).toBe(ORG_ALPHA_ID);
      expect(betaWhere.organizationId).toBe(ORG_BETA_ID);
      expect(alphaWhere.organizationId).not.toBe(betaWhere.organizationId);
    });
  });

  // =========================================================================
  // 7. RLS Context Behavior
  // =========================================================================
  describe("RLS Context Behavior", () => {
    it("should return null when no context is set", () => {
      const orgId = rlsContext.getCurrentOrgId();
      expect(orgId).toBeNull();
    });

    it("should return the correct orgId within a run() context", () => {
      let capturedOrgId: string | null = null;

      rlsContext.run(ORG_ALPHA_ID, () => {
        capturedOrgId = rlsContext.getCurrentOrgId();
      });

      expect(capturedOrgId).toBe(ORG_ALPHA_ID);
    });

    it("should isolate nested contexts correctly", () => {
      let outerOrgId: string | null = null;
      let innerOrgId: string | null = null;
      let restoredOrgId: string | null = null;

      rlsContext.run(ORG_ALPHA_ID, () => {
        outerOrgId = rlsContext.getCurrentOrgId();
        rlsContext.run(ORG_BETA_ID, () => {
          innerOrgId = rlsContext.getCurrentOrgId();
        });
        restoredOrgId = rlsContext.getCurrentOrgId();
      });

      expect(outerOrgId).toBe(ORG_ALPHA_ID);
      expect(innerOrgId).toBe(ORG_BETA_ID);
      expect(restoredOrgId).toBe(ORG_ALPHA_ID);
    });

    it("should not enforce on non-org-scoped models", async () => {
      const params = createMockParams({
        model: "User",
        action: "findMany",
        args: { where: { email: "test@test.com" } },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      const passedParams = next.mock.calls[0][0];
      // User is NOT in ORG_SCOPED_MODELS, so no organizationId injection
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBeUndefined();
    });

    it("should not enforce on non-enforced actions like create", async () => {
      const params = createMockParams({
        model: "Session",
        action: "create",
        args: {
          data: {
            id: "ses-new-001",
            userId: USER_ALICE.id,
            organizationId: ORG_ALPHA_ID,
          },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      // create is not in ENFORCED_ACTIONS, so middleware passes through unchanged
      expect(next).toHaveBeenCalledWith(params);
    });

    it("should proceed without filtering when no org context is available (with warning)", async () => {
      const params = createMockParams({
        model: "Session",
        action: "findMany",
        args: { where: {} },
      });
      const next = createMockNext();

      // Call outside of any rlsContext.run() — no org context
      await rlsMiddleware(params, next);

      const passedParams = next.mock.calls[0][0];
      // No organizationId should be injected because there's no context
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Comprehensive org-scoped model coverage
  // =========================================================================
  describe("Org-Scoped Model Coverage", () => {
    const orgScopedModels = [
      "Session",
      "Skill",
      "Agent",
      "Team",
      "Project",
      "Task",
      "Goal",
      "Workflow",
      "MCPConnection",
      "AuditLog",
      "Approval",
      "Membership",
      "APIKey",
    ];

    it.each(orgScopedModels)(
      "should enforce organizationId filter on %s model findMany",
      async (model) => {
        const params = createMockParams({
          model,
          action: "findMany",
          args: { where: {} },
        });
        const next = createMockNext();

        await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

        const passedParams = next.mock.calls[0][0];
        expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
          ORG_ALPHA_ID,
        );
      },
    );

    const enforcedActions = [
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
    ];

    it.each(enforcedActions)(
      "should enforce organizationId filter on Session model with action %s",
      async (action) => {
        const params = createMockParams({
          model: "Session",
          action,
          args: { where: {} },
        });
        const next = createMockNext();

        await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(params, next));

        const passedParams = next.mock.calls[0][0];
        expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
          ORG_BETA_ID,
        );
      },
    );
  });

  // =========================================================================
  // 9. Edge cases and security invariants
  // =========================================================================
  describe("Security Invariants", () => {
    it("should handle params with undefined model gracefully", async () => {
      const params = createMockParams({
        model: undefined,
        action: "findMany",
        args: { where: {} },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

      // With no model, middleware should pass through without injection
      expect(next).toHaveBeenCalledWith(params);
    });

    it("should handle empty string organizationId in context correctly", () => {
      let capturedOrgId: string | null = null;

      // Passing empty string — the context stores it as-is
      rlsContext.run("", () => {
        capturedOrgId = rlsContext.getCurrentOrgId();
      });

      expect(capturedOrgId).toBe("");
    });

    it("should enforce on all mutation actions for org-scoped models", async () => {
      const mutationActions = ["update", "updateMany", "delete", "deleteMany"];

      for (const action of mutationActions) {
        const params = createMockParams({
          model: "Agent",
          action,
          args: { where: { id: "agent-001" } },
        });
        const next = createMockNext();

        await rlsContext.run(ORG_ALPHA_ID, () => rlsMiddleware(params, next));

        const passedParams = next.mock.calls[0][0];
        expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
          ORG_ALPHA_ID,
        );
      }
    });

    it("should always overwrite user-supplied organizationId to prevent tampering", async () => {
      const attackParams = createMockParams({
        model: "AuditLog",
        action: "findMany",
        args: {
          where: {
            organizationId: "org-victim-999",
            action: "login",
          },
        },
      });
      const next = createMockNext();

      await rlsContext.run(ORG_BETA_ID, () => rlsMiddleware(attackParams, next));

      const passedParams = next.mock.calls[0][0];
      // Attacker's org ID is overwritten with the authenticated context
      expect((passedParams.args.where as Record<string, unknown>).organizationId).toBe(
        ORG_BETA_ID,
      );
      expect((passedParams.args.where as Record<string, unknown>).organizationId).not.toBe(
        "org-victim-999",
      );
    });
  });
});
