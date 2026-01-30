/**
 * Tests for Approval Risk Scorer
 */

import {
  scoreApprovalRequest,
  recordApprovalDecision,
  getApprovalStats,
  getUserTrustScore,
  seedApprovalHistory,
  ApprovalRequest,
  RequestType,
  RiskLevel,
} from "../approval-risk-scorer";

describe("Approval Risk Scorer", () => {
  const testOrgId = "test-org-123";
  const testUserId = "test-user-456";

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = "test";
  });

  describe("scoreApprovalRequest", () => {
    it("should score a low-risk task creation request", async () => {
      const request: ApprovalRequest = {
        id: "req-1",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "task_creation",
        description: "Create a new task for project X",
        impactScope: "user",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      expect(score.totalScore).toBeLessThan(0.5);
      expect(score.riskLevel).toBe("LOW");
      expect(score.factors).toHaveLength(5);
      expect(score.confidence).toBeGreaterThan(0);
      expect(score.reasoning).toContain("Risk level");
    });

    it("should score a high-risk data deletion request", async () => {
      const request: ApprovalRequest = {
        id: "req-2",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "data_deletion",
        description: "Delete customer database",
        impactScope: "organization",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      expect(score.totalScore).toBeGreaterThan(0.5);
      expect(score.riskLevel).toBe("HIGH");
      expect(score.autoApprovalEligible).toBe(false);
    });

    it("should score a high-risk financial transfer", async () => {
      const request: ApprovalRequest = {
        id: "req-3",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "financial_transfer",
        description: "Transfer $50,000 to vendor",
        amount: 50000,
        impactScope: "external",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      expect(score.totalScore).toBeGreaterThan(0.7);
      expect(score.riskLevel).toBe("HIGH");
      expect(score.recommendation).toBe("multi_approver");
      expect(score.autoApprovalEligible).toBe(false);
    });

    it("should score a low-risk small financial spend", async () => {
      const request: ApprovalRequest = {
        id: "req-4",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "financial_spend",
        description: "Purchase office supplies",
        amount: 50,
        impactScope: "team",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      expect(score.totalScore).toBeLessThan(0.6);
      expect(score.riskLevel).not.toBe("HIGH");
    });

    it("should consider user trust in scoring", async () => {
      // Seed trusted user history
      await seedApprovalHistory(testOrgId, "trusted-user", "task_creation", 50, 2);

      const request: ApprovalRequest = {
        id: "req-5",
        organizationId: testOrgId,
        userId: "trusted-user",
        requestType: "task_creation",
        description: "Create task",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);
      const userTrustFactor = score.factors.find((f) => f.name === "user_trust");

      expect(userTrustFactor).toBeDefined();
      expect(userTrustFactor!.score).toBeLessThan(0.3); // Trusted user = low risk
    });

    it("should consider historical approval rates", async () => {
      // Seed high approval rate for task_modification
      const requestType: RequestType = "task_modification";
      await seedApprovalHistory(testOrgId, testUserId, requestType, 95, 5);

      const request: ApprovalRequest = {
        id: "req-6",
        organizationId: testOrgId,
        userId: testUserId,
        requestType,
        description: "Modify task",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);
      const historyFactor = score.factors.find((f) => f.name === "historical_approval_rate");

      expect(historyFactor).toBeDefined();
      expect(historyFactor!.score).toBeLessThan(0.2); // 95% approval = low risk
      expect(historyFactor!.description).toContain("95%");
    });

    it("should determine auto-approval eligibility correctly", async () => {
      // Create perfect conditions for auto-approval
      await seedApprovalHistory(testOrgId, "super-trusted-user", "task_creation", 100, 0);

      const request: ApprovalRequest = {
        id: "req-7",
        organizationId: testOrgId,
        userId: "super-trusted-user",
        requestType: "task_creation",
        description: "Create routine task",
        impactScope: "user",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      // With perfect history, should be eligible for auto-approval
      expect(score.totalScore).toBeLessThan(0.3);
      expect(score.confidence).toBeGreaterThan(0.7);
      expect(score.autoApprovalEligible).toBe(true);
      expect(score.recommendation).toBe("auto_approve");
    });

    it("should never auto-approve contract signing", async () => {
      const request: ApprovalRequest = {
        id: "req-8",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "contract_signing",
        description: "Sign vendor contract",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      expect(score.recommendation).toBe("multi_approver");
      expect(score.autoApprovalEligible).toBe(false);
    });

    it("should handle errors gracefully", async () => {
      // Create request that might cause errors
      const request: ApprovalRequest = {
        id: "req-error",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "other",
        description: "Unknown request",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      // Should return conservative fallback on error
      expect(score).toBeDefined();
      expect(score.riskLevel).toBeDefined();
      expect(score.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("recordApprovalDecision", () => {
    it("should record approval decision", async () => {
      await recordApprovalDecision(testOrgId, testUserId, "task_creation", "approved");

      const stats = await getApprovalStats(testOrgId);
      expect(stats.task_creation).toBeDefined();
      expect(stats.task_creation.approved).toBeGreaterThan(0);
    });

    it("should update user trust score", async () => {
      const userId = "new-user-789";

      // Record some approvals
      await recordApprovalDecision(testOrgId, userId, "task_creation", "approved");
      await recordApprovalDecision(testOrgId, userId, "task_creation", "approved");
      await recordApprovalDecision(testOrgId, userId, "task_creation", "rejected");

      const trustScore = await getUserTrustScore(testOrgId, userId);

      expect(trustScore.total).toBe(3);
      expect(trustScore.approved).toBe(2);
      expect(trustScore.approvalRate).toBeCloseTo(0.67, 2);
      expect(trustScore.trustLevel).toBeDefined();
    });

    it("should track request type statistics", async () => {
      const orgId = "stats-org";

      await recordApprovalDecision(orgId, testUserId, "deployment", "approved");
      await recordApprovalDecision(orgId, testUserId, "deployment", "approved");
      await recordApprovalDecision(orgId, testUserId, "deployment", "rejected");

      const stats = await getApprovalStats(orgId);

      expect(stats.deployment).toBeDefined();
      expect(stats.deployment.total).toBe(3);
      expect(stats.deployment.approved).toBe(2);
      expect(stats.deployment.approvalRate).toBeCloseTo(0.67, 2);
    });
  });

  describe("getUserTrustScore", () => {
    it("should return new user trust level", async () => {
      const trustScore = await getUserTrustScore(testOrgId, "brand-new-user");

      expect(trustScore.total).toBe(0);
      expect(trustScore.trustLevel).toBe("new");
    });

    it("should calculate trust levels correctly", async () => {
      // Low trust (60% approval, 10 requests)
      const lowTrustUser = "low-trust-user";
      await seedApprovalHistory(testOrgId, lowTrustUser, "task_creation", 6, 4);
      const lowTrust = await getUserTrustScore(testOrgId, lowTrustUser);
      expect(lowTrust.trustLevel).toBe("moderate");

      // High trust (90% approval, 20 requests)
      const highTrustUser = "high-trust-user";
      await seedApprovalHistory(testOrgId, highTrustUser, "task_creation", 18, 2);
      const highTrust = await getUserTrustScore(testOrgId, highTrustUser);
      expect(highTrust.trustLevel).toBe("high");
    });
  });

  describe("getApprovalStats", () => {
    it("should return stats for all request types", async () => {
      const orgId = "full-stats-org";

      await recordApprovalDecision(orgId, testUserId, "task_creation", "approved");
      await recordApprovalDecision(orgId, testUserId, "deployment", "approved");
      await recordApprovalDecision(orgId, testUserId, "deployment", "rejected");

      const stats = await getApprovalStats(orgId);

      expect(stats).toBeDefined();
      expect(stats.task_creation).toBeDefined();
      expect(stats.deployment).toBeDefined();
    });
  });

  describe("Risk Factor Weights", () => {
    it("should have correct factor weights summing to 1.0", async () => {
      const request: ApprovalRequest = {
        id: "req-weights",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "task_creation",
        description: "Test weights",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);
      const totalWeight = score.factors.reduce((sum, f) => sum + f.weight, 0);

      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it("should apply weights correctly", async () => {
      const request: ApprovalRequest = {
        id: "req-weight-calc",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "task_creation",
        description: "Test weight calculation",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);

      // Manually calculate weighted score
      const manualScore = score.factors.reduce((sum, f) => sum + f.score * f.weight, 0);

      expect(score.totalScore).toBeCloseTo(manualScore, 3);
    });
  });

  describe("Impact Scope Multipliers", () => {
    it("should apply impact scope multipliers", async () => {
      const baseRequest: ApprovalRequest = {
        id: "req-base",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "configuration_change",
        description: "Change config",
        createdAt: new Date(),
      };

      const userScopeRequest: ApprovalRequest = {
        ...baseRequest,
        id: "req-user-scope",
        impactScope: "user",
      };

      const orgScopeRequest: ApprovalRequest = {
        ...baseRequest,
        id: "req-org-scope",
        impactScope: "organization",
      };

      const externalScopeRequest: ApprovalRequest = {
        ...baseRequest,
        id: "req-external-scope",
        impactScope: "external",
      };

      const userScore = await scoreApprovalRequest(userScopeRequest);
      const orgScore = await scoreApprovalRequest(orgScopeRequest);
      const externalScore = await scoreApprovalRequest(externalScopeRequest);

      // User scope should have lowest risk, external highest
      expect(userScore.totalScore).toBeLessThan(orgScore.totalScore);
      expect(orgScore.totalScore).toBeLessThan(externalScore.totalScore);
    });
  });

  describe("Recency Risk Factor", () => {
    it("should lower risk for frequent similar requests", async () => {
      const frequentUser = "frequent-user";
      const requestType: RequestType = "task_creation";

      // Simulate frequent requests (multiple times in last day)
      for (let i = 0; i < 5; i++) {
        await recordApprovalDecision(testOrgId, frequentUser, requestType, "approved");
      }

      const request: ApprovalRequest = {
        id: "req-frequent",
        organizationId: testOrgId,
        userId: frequentUser,
        requestType,
        description: "Another routine task",
        createdAt: new Date(),
      };

      const score = await scoreApprovalRequest(request);
      const recencyFactor = score.factors.find((f) => f.name === "recency");

      expect(recencyFactor).toBeDefined();
      expect(recencyFactor!.score).toBeLessThan(0.3); // Frequent = low risk
    });
  });

  describe("Confidence Calculation", () => {
    it("should have higher confidence with complete data", async () => {
      const completeRequest: ApprovalRequest = {
        id: "req-complete",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "financial_spend",
        description: "Complete request with all data",
        amount: 500,
        impactScope: "team",
        metadata: {
          project: "Project X",
          department: "Engineering",
        },
        createdAt: new Date(),
      };

      const minimalRequest: ApprovalRequest = {
        id: "req-minimal",
        organizationId: testOrgId,
        userId: testUserId,
        requestType: "financial_spend",
        description: "Minimal request",
        createdAt: new Date(),
      };

      const completeScore = await scoreApprovalRequest(completeRequest);
      const minimalScore = await scoreApprovalRequest(minimalRequest);

      expect(completeScore.confidence).toBeGreaterThan(minimalScore.confidence);
    });
  });
});
