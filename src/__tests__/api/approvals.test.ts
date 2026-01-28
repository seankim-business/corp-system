import request from "supertest";
import express from "express";
import approvalsRouter from "../../api/approvals";

jest.mock("../../db/client", () => ({
  db: {
    membership: {
      findUnique: jest.fn(),
    },
    approval: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../services/approval-slack", () => ({
  sendApprovalNotification: jest.fn(),
  updateApprovalMessage: jest.fn(),
}));

jest.mock("../../services/audit-logger", () => ({
  createAuditLog: jest.fn(),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const { db } = require("../../db/client");
const {
  sendApprovalNotification,
  updateApprovalMessage,
} = require("../../services/approval-slack");
const { createAuditLog } = require("../../services/audit-logger");
const { logger } = require("../../utils/logger");

function createTestApp(options?: { authenticated?: boolean; userId?: string; orgId?: string }) {
  const { authenticated = true, userId = "user-1", orgId = "org-1" } = options || {};
  const app = express();
  app.use(express.json());

  if (authenticated) {
    app.use((req: any, _res, next) => {
      req.user = {
        id: userId,
        email: "user@example.com",
        organizationId: orgId,
      };
      next();
    });
  }

  app.use("/api", approvalsRouter);
  return app;
}

describe("Approvals API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // POST /approvals - Create Approval
  // ============================================================================

  describe("POST /approvals - Create Approval", () => {
    it("should create approval with valid input", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);
      (db.approval.create as jest.Mock).mockResolvedValue({
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: null,
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        context: { amount: 50000 },
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: null,
        slackMessageTs: null,
        responseNote: null,
        respondedAt: null,
        createdAt: new Date(),
      });

      const app = createTestApp();
      const response = await request(app)
        .post("/api/approvals")
        .send({
          approverId: "approver-1",
          type: "budget_request",
          title: "Q1 Budget",
          description: "Budget for Q1 2026",
          context: { amount: 50000 },
          expiresInHours: 24,
          notifyViaSlack: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.approval.id).toBe("approval-1");
      expect(response.body.approval.status).toBe("pending");
      expect(db.approval.create).toHaveBeenCalled();
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          action: "approval.created",
          userId: "user-1",
          resourceType: "Approval",
        }),
      );
    });

    it("should reject self-approval", async () => {
      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "user-1", // Same as requester
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Self-approval is not allowed");
      expect(db.approval.create).not.toHaveBeenCalled();
    });

    it("should reject if approver is not org member", async () => {
      (db.membership.findUnique as jest.Mock).mockResolvedValue(null);

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "unknown-user",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Approver is not a member of this organization");
      expect(db.approval.create).not.toHaveBeenCalled();
    });

    it("should reject if fallback approver is requester", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        fallbackApproverId: "user-1", // Same as requester
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Fallback approver cannot be the requester");
      expect(db.approval.create).not.toHaveBeenCalled();
    });

    it("should reject if fallback approver is not org member", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock)
        .mockResolvedValueOnce(approverMembership) // Primary approver exists
        .mockResolvedValueOnce(null); // Fallback approver doesn't exist

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        fallbackApproverId: "unknown-fallback",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Fallback approver is not a member of this organization");
      expect(db.approval.create).not.toHaveBeenCalled();
    });

    it("should calculate expiration correctly", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);

      const beforeTime = Date.now();
      (db.approval.create as jest.Mock).mockImplementation((args) => {
        const expiresAt = args.data.expiresAt;
        const expectedExpiry = beforeTime + 48 * 60 * 60 * 1000; // 48 hours
        expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000); // Within 1 second
        return Promise.resolve({
          id: "approval-1",
          ...args.data,
          createdAt: new Date(),
        });
      });

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 48,
      });

      expect(response.status).toBe(201);
    });

    it("should send Slack notification when requested", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com", displayName: "Approver" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);
      (sendApprovalNotification as jest.Mock).mockResolvedValue({
        channelId: "C123456",
        messageTs: "1234567890.123456",
      });
      (db.approval.create as jest.Mock).mockResolvedValue({
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: null,
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        context: null,
        status: "pending",
        expiresAt: new Date(),
        slackChannelId: null,
        slackMessageTs: null,
        responseNote: null,
        respondedAt: null,
        createdAt: new Date(),
      });
      (db.approval.update as jest.Mock).mockResolvedValue({
        id: "approval-1",
        slackChannelId: "C123456",
        slackMessageTs: "1234567890.123456",
      });

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
        notifyViaSlack: true,
      });

      expect(response.status).toBe(201);
      expect(sendApprovalNotification).toHaveBeenCalled();
      expect(db.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "approval-1" },
          data: expect.objectContaining({
            slackChannelId: "C123456",
            slackMessageTs: "1234567890.123456",
          }),
        }),
      );
    });

    it("should handle Slack notification failure gracefully", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);
      (sendApprovalNotification as jest.Mock).mockRejectedValue(new Error("Slack API error"));
      (db.approval.create as jest.Mock).mockResolvedValue({
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: null,
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        context: null,
        status: "pending",
        expiresAt: new Date(),
        slackChannelId: null,
        slackMessageTs: null,
        responseNote: null,
        respondedAt: null,
        createdAt: new Date(),
      });

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
        notifyViaSlack: true,
      });

      expect(response.status).toBe(201);
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to send Slack notification for approval",
        expect.any(Object),
      );
    });

    it("should handle database errors", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      (db.membership.findUnique as jest.Mock).mockResolvedValue(approverMembership);
      (db.approval.create as jest.Mock).mockRejectedValue(new Error("Database error"));

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to create approval request");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should support fallback approver", async () => {
      const approverMembership = {
        id: "membership-approver",
        organizationId: "org-1",
        userId: "approver-1",
        user: { id: "approver-1", email: "approver@example.com" },
      };

      const fallbackMembership = {
        id: "membership-fallback",
        organizationId: "org-1",
        userId: "fallback-1",
      };

      (db.membership.findUnique as jest.Mock)
        .mockResolvedValueOnce(approverMembership)
        .mockResolvedValueOnce(fallbackMembership);

      (db.approval.create as jest.Mock).mockResolvedValue({
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: "fallback-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        context: null,
        status: "pending",
        expiresAt: new Date(),
        slackChannelId: null,
        slackMessageTs: null,
        responseNote: null,
        respondedAt: null,
        createdAt: new Date(),
      });

      const app = createTestApp();
      const response = await request(app).post("/api/approvals").send({
        approverId: "approver-1",
        fallbackApproverId: "fallback-1",
        type: "budget_request",
        title: "Q1 Budget",
        description: "Budget for Q1 2026",
        expiresInHours: 24,
      });

      expect(response.status).toBe(201);
      expect(response.body.approval.fallbackApproverId).toBe("fallback-1");
      expect(db.approval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fallbackApproverId: "fallback-1",
          }),
        }),
      );
    });
  });

  // ============================================================================
  // GET /approvals - List Approvals
  // ============================================================================

  describe("GET /approvals - List Approvals", () => {
    it("should list approvals for current user", async () => {
      const approvals = [
        {
          id: "approval-1",
          organizationId: "org-1",
          requesterId: "user-1",
          approverId: "approver-1",
          fallbackApproverId: null,
          type: "budget_request",
          title: "Q1 Budget",
          status: "pending",
          createdAt: new Date(),
        },
        {
          id: "approval-2",
          organizationId: "org-1",
          requesterId: "other-user",
          approverId: "user-1",
          fallbackApproverId: null,
          type: "leave_request",
          title: "Vacation",
          status: "approved",
          createdAt: new Date(),
        },
      ];

      (db.approval.findMany as jest.Mock).mockResolvedValue(approvals);
      (db.approval.count as jest.Mock).mockResolvedValue(2);

      const app = createTestApp();
      const response = await request(app).get("/api/approvals?page=1&limit=10&status=all&type=all");

      expect(response.status).toBe(200);
      expect(response.body.approvals).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(db.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-1",
            OR: expect.arrayContaining([
              { approverId: "user-1" },
              { requesterId: "user-1" },
              { fallbackApproverId: "user-1" },
            ]),
          }),
        }),
      );
    });

    it("should filter by status", async () => {
      (db.approval.findMany as jest.Mock).mockResolvedValue([]);
      (db.approval.count as jest.Mock).mockResolvedValue(0);

      const app = createTestApp();
      const response = await request(app).get(
        "/api/approvals?page=1&limit=10&status=pending&type=all",
      );

      expect(response.status).toBe(200);
      expect(db.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "pending",
          }),
        }),
      );
    });

    it("should filter by type", async () => {
      (db.approval.findMany as jest.Mock).mockResolvedValue([]);
      (db.approval.count as jest.Mock).mockResolvedValue(0);

      const app = createTestApp();
      const response = await request(app).get(
        "/api/approvals?page=1&limit=10&status=all&type=budget_request",
      );

      expect(response.status).toBe(200);
      expect(db.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: "budget_request",
          }),
        }),
      );
    });

    it("should support pagination", async () => {
      (db.approval.findMany as jest.Mock).mockResolvedValue([]);
      (db.approval.count as jest.Mock).mockResolvedValue(50);

      const app = createTestApp();
      const response = await request(app).get("/api/approvals?page=3&limit=10&status=all&type=all");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 50,
        totalPages: 5,
      });
      expect(db.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        }),
      );
    });

    it("should handle database errors", async () => {
      (db.approval.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));

      const app = createTestApp();
      const response = await request(app).get("/api/approvals?page=1&limit=10&status=all&type=all");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to fetch approvals");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should include user as requester, approver, or fallback approver", async () => {
      const approvals = [
        {
          id: "approval-1",
          requesterId: "user-1",
          approverId: "approver-1",
          fallbackApproverId: null,
        },
        {
          id: "approval-2",
          requesterId: "other-user",
          approverId: "user-1",
          fallbackApproverId: null,
        },
        {
          id: "approval-3",
          requesterId: "other-user",
          approverId: "approver-1",
          fallbackApproverId: "user-1",
        },
      ];

      (db.approval.findMany as jest.Mock).mockResolvedValue(approvals);
      (db.approval.count as jest.Mock).mockResolvedValue(3);

      const app = createTestApp();
      const response = await request(app).get("/api/approvals?page=1&limit=10&status=all&type=all");

      expect(response.status).toBe(200);
      expect(response.body.approvals).toHaveLength(3);
    });
  });

  // ============================================================================
  // GET /approvals/:id - Get Single Approval
  // ============================================================================

  describe("GET /approvals/:id - Get Single Approval", () => {
    it("should get approval by id", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: null,
        type: "budget_request",
        title: "Q1 Budget",
        status: "pending",
        expiresAt: new Date(),
        createdAt: new Date(),
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp();
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(200);
      expect(response.body.approval.id).toBe("approval-1");
      expect(db.approval.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "approval-1",
            organizationId: "org-1",
          }),
        }),
      );
    });

    it("should enforce authorization - requester can view", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "user-1",
        approverId: "approver-1",
        fallbackApproverId: null,
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(200);
    });

    it("should enforce authorization - approver can view", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "other-user",
        approverId: "user-1",
        fallbackApproverId: null,
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(200);
    });

    it("should enforce authorization - fallback approver can view", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "other-user",
        approverId: "approver-1",
        fallbackApproverId: "user-1",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(200);
    });

    it("should return 404 if approval not found", async () => {
      (db.approval.findFirst as jest.Mock).mockResolvedValue(null);

      const app = createTestApp();
      const response = await request(app).get("/api/approvals/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Approval not found");
    });

    it("should return 404 if user not authorized", async () => {
      (db.approval.findFirst as jest.Mock).mockResolvedValue(null);

      const app = createTestApp({ userId: "unauthorized-user" });
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Approval not found");
    });

    it("should handle database errors", async () => {
      (db.approval.findFirst as jest.Mock).mockRejectedValue(new Error("Database error"));

      const app = createTestApp();
      const response = await request(app).get("/api/approvals/approval-1");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to fetch approval");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PUT /approvals/:id/respond - Respond to Approval
  // ============================================================================

  describe("PUT /approvals/:id/respond - Respond to Approval", () => {
    it("should approve when approver responds", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: null,
        slackMessageTs: null,
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "approved",
        responseNote: "Approved",
        respondedAt: new Date(),
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
        responseNote: "Approved",
      });

      expect(response.status).toBe(200);
      expect(response.body.approval.status).toBe("approved");
      expect(db.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "approval-1" },
          data: expect.objectContaining({
            status: "approved",
            responseNote: "Approved",
          }),
        }),
      );
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approval.approved",
          userId: "user-1",
        }),
      );
    });

    it("should reject when approver responds", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: null,
        slackMessageTs: null,
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "rejected",
        responseNote: "Not approved",
        respondedAt: new Date(),
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "rejected",
        responseNote: "Not approved",
      });

      expect(response.status).toBe(200);
      expect(response.body.approval.status).toBe("rejected");
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approval.rejected",
        }),
      );
    });

    it("should allow fallback approver to respond", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "approver-1",
        fallbackApproverId: "user-1",
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: null,
        slackMessageTs: null,
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "approved",
        responseNote: "Approved by fallback",
        respondedAt: new Date(),
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
        responseNote: "Approved by fallback",
      });

      expect(response.status).toBe(200);
      expect(response.body.approval.status).toBe("approved");
    });

    it("should reject if user is not approver or fallback approver", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "approver-1",
        fallbackApproverId: "fallback-1",
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "unauthorized-user" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not authorized to respond to this approval");
      expect(db.approval.update).not.toHaveBeenCalled();
    });

    it("should reject if approval already approved", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "approved",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Approval has already been approved");
      expect(db.approval.update).not.toHaveBeenCalled();
    });

    it("should reject if approval already rejected", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "rejected",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Approval has already been rejected");
      expect(db.approval.update).not.toHaveBeenCalled();
    });

    it("should handle expired approvals", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "expired",
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Approval has expired");
      expect(db.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "expired" },
        }),
      );
    });

    it("should update Slack message when approval has Slack metadata", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: "C123456",
        slackMessageTs: "1234567890.123456",
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "approved",
        responseNote: "Approved",
        respondedAt: new Date(),
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
        responseNote: "Approved",
      });

      expect(response.status).toBe(200);
      expect(updateApprovalMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          approval: expect.objectContaining({
            id: "approval-1",
            status: "approved",
          }),
          responderId: "user-1",
          organizationId: "org-1",
        }),
      );
    });

    it("should handle Slack update failure gracefully", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: "C123456",
        slackMessageTs: "1234567890.123456",
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "approved",
        responseNote: "Approved",
        respondedAt: new Date(),
      });
      (updateApprovalMessage as jest.Mock).mockRejectedValue(new Error("Slack API error"));

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
        responseNote: "Approved",
      });

      expect(response.status).toBe(200);
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to update Slack approval message",
        expect.any(Object),
      );
    });

    it("should return 404 if approval not found", async () => {
      (db.approval.findFirst as jest.Mock).mockResolvedValue(null);

      const app = createTestApp();
      const response = await request(app).put("/api/approvals/nonexistent/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Approval not found");
    });

    it("should handle database errors", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockRejectedValue(new Error("Database error"));

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to respond to approval");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should allow response without note", async () => {
      const approval = {
        id: "approval-1",
        organizationId: "org-1",
        requesterId: "requester-1",
        approverId: "user-1",
        fallbackApproverId: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slackChannelId: null,
        slackMessageTs: null,
        type: "budget_request",
        title: "Q1 Budget",
      };

      (db.approval.findFirst as jest.Mock).mockResolvedValue(approval);
      (db.approval.update as jest.Mock).mockResolvedValue({
        ...approval,
        status: "approved",
        responseNote: null,
        respondedAt: new Date(),
      });

      const app = createTestApp({ userId: "user-1" });
      const response = await request(app).put("/api/approvals/approval-1/respond").send({
        action: "approved",
      });

      expect(response.status).toBe(200);
      expect(db.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responseNote: null,
          }),
        }),
      );
    });
  });
});
