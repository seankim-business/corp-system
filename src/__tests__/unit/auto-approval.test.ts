/**
 * Auto-Approval Service Unit Tests
 *
 * Tests the auto-approval decision logic and execution flow.
 */

import { processApprovalRequest, undoAutoApproval } from "../../services/auto-approval.service";
import type { ApprovalRequest } from "../../services/approval-risk-scorer";

// Mock dependencies
jest.mock("../../services/approval-risk-scorer");
jest.mock("../../services/audit-logger");
jest.mock("../../api/slack-integration");
jest.mock("ioredis");
jest.mock("@slack/web-api");

describe("Auto-Approval Service", () => {
  describe("processApprovalRequest", () => {
    it("should auto-approve low-risk requests", async () => {
      const mockRequest: ApprovalRequest = {
        id: "test-123",
        organizationId: "org-1",
        userId: "user-1",
        requestType: "task_creation",
        description: "Create routine task",
        createdAt: new Date(),
      };

      // Mock risk scorer to return low risk
      const { scoreApprovalRequest } = require("../../services/approval-risk-scorer");
      scoreApprovalRequest.mockResolvedValue({
        totalScore: 0.15,
        riskLevel: "LOW",
        confidence: 0.9,
        autoApprovalEligible: true,
        recommendation: "auto_approve",
        reasoning: "Low risk routine request",
        factors: [],
      });

      // Mock approval stats to show high historical approval rate
      const { getApprovalStats } = require("../../services/approval-risk-scorer");
      getApprovalStats.mockResolvedValue({
        task_creation: {
          total: 100,
          approved: 98,
          approvalRate: 0.98,
        },
      });

      const result = await processApprovalRequest(mockRequest);

      expect(result.autoApproved).toBe(true);
      expect(result.riskScore.totalScore).toBe(0.15);
      expect(result.approvalId).toBeDefined();
      expect(result.undoExpiresAt).toBeDefined();
    });

    it("should not auto-approve high-risk requests", async () => {
      const mockRequest: ApprovalRequest = {
        id: "test-456",
        organizationId: "org-1",
        userId: "user-1",
        requestType: "data_deletion",
        description: "Delete customer data",
        createdAt: new Date(),
      };

      const { scoreApprovalRequest } = require("../../services/approval-risk-scorer");
      scoreApprovalRequest.mockResolvedValue({
        totalScore: 0.75,
        riskLevel: "HIGH",
        confidence: 0.9,
        autoApprovalEligible: false,
        recommendation: "enhanced_approval",
        reasoning: "High risk operation",
        factors: [],
      });

      const result = await processApprovalRequest(mockRequest);

      expect(result.autoApproved).toBe(false);
      expect(result.reason).toContain("Risk score");
    });

    it("should never auto-approve blacklisted request types", async () => {
      const mockRequest: ApprovalRequest = {
        id: "test-789",
        organizationId: "org-1",
        userId: "user-1",
        requestType: "contract_signing",
        description: "Sign customer contract",
        createdAt: new Date(),
      };

      const { scoreApprovalRequest } = require("../../services/approval-risk-scorer");
      scoreApprovalRequest.mockResolvedValue({
        totalScore: 0.1, // Even with low risk score
        riskLevel: "LOW",
        confidence: 0.95,
        autoApprovalEligible: false,
        recommendation: "multi_approver",
        reasoning: "Contract signing requires manual approval",
        factors: [],
      });

      const result = await processApprovalRequest(mockRequest);

      expect(result.autoApproved).toBe(false);
      expect(result.reason).toContain("never auto-approved");
    });

    it("should not auto-approve when confidence is low", async () => {
      const mockRequest: ApprovalRequest = {
        id: "test-101",
        organizationId: "org-1",
        userId: "user-1",
        requestType: "task_modification",
        description: "Modify task",
        createdAt: new Date(),
      };

      const { scoreApprovalRequest } = require("../../services/approval-risk-scorer");
      scoreApprovalRequest.mockResolvedValue({
        totalScore: 0.2,
        riskLevel: "LOW",
        confidence: 0.5, // Low confidence
        autoApprovalEligible: false,
        recommendation: "standard_approval",
        reasoning: "Insufficient data for confident scoring",
        factors: [],
      });

      const result = await processApprovalRequest(mockRequest);

      expect(result.autoApproved).toBe(false);
      expect(result.reason).toContain("Confidence");
    });
  });

  describe("undoAutoApproval", () => {
    it("should successfully undo within undo window", async () => {
      const approvalId = "auto_test-123_1234567890";

      // Mock Redis to return undo data
      const Redis = require("ioredis");
      const mockRedis = new Redis();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          requestId: "test-123",
          organizationId: "org-1",
          userId: "user-1",
          requestType: "task_creation",
          riskScore: 0.15,
          timestamp: new Date().toISOString(),
        }),
      );

      const result = await undoAutoApproval(approvalId);

      expect(result.success).toBe(true);
      expect(result.reason).toContain("successfully undone");
    });

    it("should fail when undo window expired", async () => {
      const approvalId = "auto_test-456_9876543210";

      // Mock Redis to return null (expired)
      const Redis = require("ioredis");
      const mockRedis = new Redis();
      mockRedis.get.mockResolvedValue(null);

      const result = await undoAutoApproval(approvalId);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("expired");
    });
  });
});
