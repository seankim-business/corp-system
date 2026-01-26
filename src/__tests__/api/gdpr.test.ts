import request from "supertest";
import express from "express";
import gdprRoutes from "../../api/gdpr.routes";

jest.mock("../../db/client", () => ({
  db: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workflow: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workflowExecution: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    mCPConnection: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("../../services/audit-logger", () => ({
  auditLogger: {
    log: jest.fn(),
    query: jest.fn(),
  },
}));

const { db } = require("../../db/client");
const { auditLogger } = require("../../services/audit-logger");

function createTestApp(options?: { authenticated?: boolean; role?: string }) {
  const { authenticated = true, role = "member" } = options || {};
  const app = express();
  app.use(express.json());

  if (authenticated) {
    app.use((req: any, _res, next) => {
      req.user = {
        id: "user-1",
        email: "user@example.com",
        passwordHash: null,
        googleId: null,
        displayName: "Test User",
        avatarUrl: null,
        emailVerified: true,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
        organizationId: "org-1",
      };
      req.membership = {
        id: "membership-1",
        organizationId: "org-1",
        userId: "user-1",
        role,
        permissions: {},
        invitedBy: null,
        invitedAt: new Date("2024-01-01T00:00:00Z"),
        joinedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };
      next();
    });
  }

  app.use("/api", gdprRoutes);
  return app;
}

describe("GDPR API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(db));
  });

  it("requires authentication", async () => {
    const app = createTestApp({ authenticated: false });
    const response = await request(app).get("/api/audit-logs");
    expect(response.status).toBe(401);
  });

  it("exports user data", async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({ id: "org-1", name: "Org" });
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash: null,
      googleId: null,
      displayName: "Test User",
      avatarUrl: null,
      emailVerified: true,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    });
    (db.membership.findMany as jest.Mock).mockResolvedValue([
      { id: "membership-1", organizationId: "org-1", userId: "user-1", role: "member" },
    ]);
    (db.session.findMany as jest.Mock).mockResolvedValue([
      {
        id: "session-1",
        userId: "user-1",
        organizationId: "org-1",
        tokenHash: null,
        source: "web",
        state: {},
        history: [],
        metadata: {},
        expiresAt: new Date("2024-12-31T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
        lastUsedAt: new Date("2024-01-02T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ]);
    (db.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "audit-1",
          action: "workflow.create",
          organizationId: "org-1",
          userId: "user-1",
          resourceType: "workflow",
          resourceId: "workflow-1",
          details: { note: "created" },
          ipAddress: "127.0.0.1",
          userAgent: "jest",
          success: true,
          errorMessage: null,
          createdAt: new Date("2024-01-01T00:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "override-1",
          featureFlagId: "flag-1",
          organizationId: "org-1",
          enabled: true,
          reason: "test",
          expiresAt: null,
          createdAt: new Date("2024-01-01T00:00:00Z"),
          updatedAt: new Date("2024-01-01T00:00:00Z"),
        },
      ]);
    (db.workflow.findMany as jest.Mock).mockResolvedValue([
      {
        id: "workflow-1",
        organizationId: "org-1",
        name: "Workflow",
        description: null,
        config: {},
        enabled: true,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ]);
    (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([
      {
        id: "execution-1",
        workflowId: "workflow-1",
        status: "success",
        inputData: {},
        outputData: {},
        errorMessage: null,
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    (db.mCPConnection.findMany as jest.Mock).mockResolvedValue([
      {
        id: "mcp-1",
        organizationId: "org-1",
        provider: "notion",
        name: "Notion",
        config: { token: "secret" },
        enabled: true,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ]);

    const app = createTestApp();
    const response = await request(app).get("/api/user/data-export");

    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");

    const body = JSON.parse(response.text);
    expect(body.user.email).toBe("user@example.com");
    expect(body.workflows).toHaveLength(1);
    expect(body.workflowExecutions).toHaveLength(1);
    expect(body.auditLogs).toHaveLength(1);
  });

  it("requires confirmation for account deletion", async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({ id: "org-1" });
    const app = createTestApp();
    const response = await request(app).delete("/api/user/account").send({ confirm: false });
    expect(response.status).toBe(400);
  });

  it("prevents last admin deletion", async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.membership.findUnique as jest.Mock).mockResolvedValue({
      id: "membership-1",
      organizationId: "org-1",
      userId: "user-1",
      role: "admin",
    });
    (db.membership.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const app = createTestApp({ role: "admin" });
    const response = await request(app)
      .delete("/api/user/account")
      .send({ confirm: true, reason: "cleanup" });

    expect(response.status).toBe(403);
  });

  it("deletes account with cascading cleanup", async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({ id: "org-1" });
    (db.membership.findUnique as jest.Mock).mockResolvedValue({
      id: "membership-1",
      organizationId: "org-1",
      userId: "user-1",
      role: "member",
    });
    (db.membership.count as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    (db.$queryRaw as jest.Mock).mockResolvedValue([
      { action: "workflow.create", resourceType: "workflow", resourceId: "workflow-1" },
      { action: "mcp.connect", resourceType: "mcp_connection", resourceId: "mcp-1" },
    ]);

    const app = createTestApp();
    const response = await request(app)
      .delete("/api/user/account")
      .send({ confirm: true, reason: "gdpr" });

    expect(response.status).toBe(200);
    expect(db.workflowExecution.deleteMany).toHaveBeenCalled();
    expect(db.workflow.deleteMany).toHaveBeenCalled();
    expect(db.session.deleteMany).toHaveBeenCalled();
    expect(db.mCPConnection.deleteMany).toHaveBeenCalled();
    expect(db.membership.deleteMany).toHaveBeenCalled();
    expect(db.user.delete).toHaveBeenCalled();
    expect(auditLogger.log).toHaveBeenCalled();
  });

  it("queries audit logs with filters", async () => {
    (auditLogger.query as jest.Mock).mockResolvedValue({
      total: 1,
      logs: [
        {
          id: "log-1",
          timestamp: Date.now(),
          action: "user.login",
          organizationId: "org-1",
          userId: "user-1",
          resourceType: null,
          resourceId: null,
          details: { ip: "127.0.0.1" },
          ipAddress: "127.0.0.1",
          userAgent: "jest",
          success: true,
          errorMessage: null,
        },
      ],
    });

    const app = createTestApp();
    const response = await request(app).get(
      "/api/audit-logs?limit=10&offset=0&action=user.login&startDate=2024-01-01&endDate=2024-12-31",
    );

    expect(response.status).toBe(200);
    expect(auditLogger.query).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      action: "user.login",
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2024-12-31T00:00:00.000Z"),
      limit: 10,
      offset: 0,
    });
  });
});
