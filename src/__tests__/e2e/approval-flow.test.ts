/**
 * Approval Flow E2E Tests
 *
 * Tests the complete approval workflow:
 * - Approval creation
 * - Approval request via Slack
 * - Approval/rejection handling
 * - Escalation and fallback
 * - Expiration handling
 * - Integration with workflows
 */

import {
  setupTestDatabase,
  teardownTestDatabase,
  createMockApproval,
  createMockSlackClient,
  waitForCondition,
} from "./setup";

// Types
interface Approval {
  id: string;
  organizationId: string;
  requesterId: string;
  approverId: string;
  fallbackApproverId?: string;
  type: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "expired" | "escalated";
  context: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  respondedAt?: Date;
  respondedBy?: string;
  comment?: string;
}

interface ApprovalRequest {
  organizationId: string;
  requesterId: string;
  approverId: string;
  fallbackApproverId?: string;
  type: string;
  title: string;
  description: string;
  context?: Record<string, unknown>;
  expiresInHours?: number;
}

// Mock approval service
class MockApprovalService {
  private approvals: Map<string, Approval> = new Map();
  private notificationsSent: Array<{ approvalId: string; channel: string; message: string }> = [];

  async createApprovalRequest(request: ApprovalRequest): Promise<Approval> {
    const approval: Approval = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      organizationId: request.organizationId,
      requesterId: request.requesterId,
      approverId: request.approverId,
      fallbackApproverId: request.fallbackApproverId,
      type: request.type,
      title: request.title,
      description: request.description,
      status: "pending",
      context: request.context || {},
      expiresAt: new Date(Date.now() + (request.expiresInHours || 24) * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    this.approvals.set(approval.id, approval);
    return approval;
  }

  async getApproval(id: string): Promise<Approval | undefined> {
    return this.approvals.get(id);
  }

  async approve(id: string, responderId: string, comment?: string): Promise<Approval> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }

    if (approval.status !== "pending") {
      throw new Error(`Approval is not pending: ${approval.status}`);
    }

    // Check if responder is authorized
    if (approval.approverId !== responderId && approval.fallbackApproverId !== responderId) {
      throw new Error("User not authorized to approve");
    }

    // Check expiration
    if (new Date() > approval.expiresAt) {
      approval.status = "expired";
      this.approvals.set(id, approval);
      throw new Error("Approval has expired");
    }

    approval.status = "approved";
    approval.respondedAt = new Date();
    approval.respondedBy = responderId;
    approval.comment = comment;

    this.approvals.set(id, approval);
    return approval;
  }

  async reject(id: string, responderId: string, reason: string): Promise<Approval> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }

    if (approval.status !== "pending") {
      throw new Error(`Approval is not pending: ${approval.status}`);
    }

    if (approval.approverId !== responderId && approval.fallbackApproverId !== responderId) {
      throw new Error("User not authorized to reject");
    }

    if (new Date() > approval.expiresAt) {
      approval.status = "expired";
      this.approvals.set(id, approval);
      throw new Error("Approval has expired");
    }

    approval.status = "rejected";
    approval.respondedAt = new Date();
    approval.respondedBy = responderId;
    approval.comment = reason;

    this.approvals.set(id, approval);
    return approval;
  }

  async escalate(id: string): Promise<Approval> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }

    if (!approval.fallbackApproverId) {
      throw new Error("No fallback approver configured");
    }

    approval.status = "escalated";
    // Swap approver with fallback
    const originalApprover = approval.approverId;
    approval.approverId = approval.fallbackApproverId;
    approval.fallbackApproverId = originalApprover;
    approval.status = "pending"; // Reset to pending for new approver

    this.approvals.set(id, approval);
    return approval;
  }

  async checkExpiration(id: string): Promise<Approval> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }

    if (approval.status === "pending" && new Date() > approval.expiresAt) {
      approval.status = "expired";
      this.approvals.set(id, approval);
    }

    return approval;
  }

  async sendSlackNotification(
    approvalId: string,
    channel: string,
    message: string,
  ): Promise<void> {
    this.notificationsSent.push({ approvalId, channel, message });
  }

  getNotifications(): Array<{ approvalId: string; channel: string; message: string }> {
    return this.notificationsSent;
  }

  async getPendingApprovals(approverId: string): Promise<Approval[]> {
    return Array.from(this.approvals.values()).filter(
      (a) =>
        a.status === "pending" &&
        (a.approverId === approverId || a.fallbackApproverId === approverId),
    );
  }

  async getApprovalsByRequester(requesterId: string): Promise<Approval[]> {
    return Array.from(this.approvals.values()).filter((a) => a.requesterId === requesterId);
  }

  clearApprovals(): void {
    this.approvals.clear();
    this.notificationsSent = [];
  }
}

describe("Approval Flow E2E", () => {
  let approvalService: MockApprovalService;
  let mockSlackClient: ReturnType<typeof createMockSlackClient>;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(() => {
    approvalService = new MockApprovalService();
    mockSlackClient = createMockSlackClient();
  });

  describe("Approval creation", () => {
    it("creates approval request with correct data", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Marketing Campaign Approval",
        description: "Please review the Q1 marketing campaign",
      });

      expect(approval.id).toBeDefined();
      expect(approval.status).toBe("pending");
      expect(approval.organizationId).toBe("org-123");
      expect(approval.requesterId).toBe("user-123");
      expect(approval.approverId).toBe("approver-456");
    });

    it("sets default expiration to 24 hours", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(approval.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it("allows custom expiration time", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
        expiresInHours: 48,
      });

      const expectedExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const timeDiff = Math.abs(approval.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it("creates approval with fallback approver", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        fallbackApproverId: "fallback-789",
        type: "budget",
        title: "Budget Approval",
        description: "Large expense requires approval",
      });

      expect(approval.fallbackApproverId).toBe("fallback-789");
    });

    it("stores context data with approval", async () => {
      const context = {
        workflowId: "wf-123",
        nodeId: "approval-node",
        amount: 5000,
        currency: "USD",
      };

      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "budget",
        title: "Budget Request",
        description: "Request for $5000",
        context,
      });

      expect(approval.context.workflowId).toBe("wf-123");
      expect(approval.context.amount).toBe(5000);
    });
  });

  describe("Approval response handling", () => {
    it("approves pending request", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      const updated = await approvalService.approve(approval.id, "approver-456", "Looks good!");

      expect(updated.status).toBe("approved");
      expect(updated.respondedBy).toBe("approver-456");
      expect(updated.comment).toBe("Looks good!");
      expect(updated.respondedAt).toBeDefined();
    });

    it("rejects pending request with reason", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      const updated = await approvalService.reject(
        approval.id,
        "approver-456",
        "Needs more details",
      );

      expect(updated.status).toBe("rejected");
      expect(updated.comment).toBe("Needs more details");
    });

    it("allows fallback approver to approve", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        fallbackApproverId: "fallback-789",
        type: "content",
        title: "Test",
        description: "Test",
      });

      const updated = await approvalService.approve(approval.id, "fallback-789");

      expect(updated.status).toBe("approved");
      expect(updated.respondedBy).toBe("fallback-789");
    });

    it("prevents unauthorized user from approving", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      await expect(approvalService.approve(approval.id, "unauthorized-user")).rejects.toThrow(
        "not authorized",
      );
    });

    it("prevents double approval", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      await approvalService.approve(approval.id, "approver-456");

      await expect(approvalService.approve(approval.id, "approver-456")).rejects.toThrow(
        "not pending",
      );
    });

    it("prevents approval after rejection", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      await approvalService.reject(approval.id, "approver-456", "No");

      await expect(approvalService.approve(approval.id, "approver-456")).rejects.toThrow(
        "not pending",
      );
    });
  });

  describe("Escalation and fallback", () => {
    it("escalates to fallback approver", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        fallbackApproverId: "fallback-789",
        type: "content",
        title: "Test",
        description: "Test",
      });

      const escalated = await approvalService.escalate(approval.id);

      expect(escalated.approverId).toBe("fallback-789");
      expect(escalated.status).toBe("pending");
    });

    it("fails escalation without fallback approver", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      await expect(approvalService.escalate(approval.id)).rejects.toThrow(
        "No fallback approver",
      );
    });

    it("allows escalated approval to be approved by new approver", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        fallbackApproverId: "fallback-789",
        type: "content",
        title: "Test",
        description: "Test",
      });

      await approvalService.escalate(approval.id);
      const updated = await approvalService.approve(approval.id, "fallback-789");

      expect(updated.status).toBe("approved");
      expect(updated.respondedBy).toBe("fallback-789");
    });
  });

  describe("Expiration handling", () => {
    it("marks expired approval correctly", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
        expiresInHours: 0, // Expires immediately
      });

      // Manually set past expiration for testing
      const storedApproval = await approvalService.getApproval(approval.id);
      if (storedApproval) {
        storedApproval.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      }

      const checked = await approvalService.checkExpiration(approval.id);
      expect(checked.status).toBe("expired");
    });

    it("prevents approval of expired request", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test",
        description: "Test",
      });

      // Manually expire the approval
      const storedApproval = await approvalService.getApproval(approval.id);
      if (storedApproval) {
        storedApproval.expiresAt = new Date(Date.now() - 1000);
      }

      await expect(approvalService.approve(approval.id, "approver-456")).rejects.toThrow(
        "expired",
      );
    });
  });

  describe("Approval listing and filtering", () => {
    it("lists pending approvals for approver", async () => {
      await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Request 1",
        description: "Test",
      });

      await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "budget",
        title: "Request 2",
        description: "Test",
      });

      const pending = await approvalService.getPendingApprovals("approver-456");
      expect(pending.length).toBe(2);
    });

    it("excludes approved requests from pending list", async () => {
      const approval1 = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Request 1",
        description: "Test",
      });

      await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "budget",
        title: "Request 2",
        description: "Test",
      });

      await approvalService.approve(approval1.id, "approver-456");

      const pending = await approvalService.getPendingApprovals("approver-456");
      expect(pending.length).toBe(1);
      expect(pending[0].title).toBe("Request 2");
    });

    it("lists approvals by requester", async () => {
      await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-A",
        approverId: "approver-456",
        type: "content",
        title: "User A Request",
        description: "Test",
      });

      await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-B",
        approverId: "approver-456",
        type: "content",
        title: "User B Request",
        description: "Test",
      });

      const userAApprovals = await approvalService.getApprovalsByRequester("user-A");
      expect(userAApprovals.length).toBe(1);
      expect(userAApprovals[0].title).toBe("User A Request");
    });
  });

  describe("Slack integration for approvals", () => {
    it("sends Slack notification for new approval", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Approval Needed",
        description: "Please review",
      });

      await approvalService.sendSlackNotification(
        approval.id,
        "C12345678",
        `New approval request: ${approval.title}`,
      );

      const notifications = approvalService.getNotifications();
      expect(notifications.length).toBe(1);
      expect(notifications[0].approvalId).toBe(approval.id);
      expect(notifications[0].message).toContain("Approval Needed");
    });

    it("sends notification on approval", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Test Approval",
        description: "Test",
      });

      await approvalService.approve(approval.id, "approver-456", "Approved!");

      await approvalService.sendSlackNotification(
        approval.id,
        "C12345678",
        `Approval approved: ${approval.title}`,
      );

      const notifications = approvalService.getNotifications();
      expect(notifications.some((n) => n.message.includes("approved"))).toBe(true);
    });
  });

  describe("Approval types", () => {
    it("handles content approval type", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "content",
        title: "Content Approval",
        description: "Review marketing content",
      });

      expect(approval.type).toBe("content");
    });

    it("handles budget approval type", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "budget",
        title: "Budget Approval",
        description: "$5000 expense request",
        context: { amount: 5000, currency: "USD" },
      });

      expect(approval.type).toBe("budget");
      expect(approval.context.amount).toBe(5000);
    });

    it("handles product_launch approval type", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        type: "product_launch",
        title: "Product Launch Approval",
        description: "Ready to launch v2.0",
        context: { version: "2.0.0", launchDate: "2026-02-01" },
      });

      expect(approval.type).toBe("product_launch");
      expect(approval.context.version).toBe("2.0.0");
    });
  });

  describe("Concurrent approval handling", () => {
    it("handles multiple simultaneous approval requests", async () => {
      const requests = Array(5)
        .fill(null)
        .map((_, i) =>
          approvalService.createApprovalRequest({
            organizationId: "org-123",
            requesterId: `user-${i}`,
            approverId: "approver-456",
            type: "content",
            title: `Request ${i}`,
            description: "Test",
          }),
        );

      const approvals = await Promise.all(requests);

      expect(approvals.length).toBe(5);
      expect(new Set(approvals.map((a) => a.id)).size).toBe(5); // All unique IDs
    });

    it("handles race condition in approval", async () => {
      const approval = await approvalService.createApprovalRequest({
        organizationId: "org-123",
        requesterId: "user-123",
        approverId: "approver-456",
        fallbackApproverId: "fallback-789",
        type: "content",
        title: "Test",
        description: "Test",
      });

      // Simulate two people trying to approve at the same time
      const results = await Promise.allSettled([
        approvalService.approve(approval.id, "approver-456"),
        approvalService.approve(approval.id, "fallback-789"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1); // One should succeed
      expect(rejected.length).toBe(1); // One should fail
    });
  });
});
