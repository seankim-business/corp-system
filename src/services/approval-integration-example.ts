/**
 * Example Integration: Approval Agent with Risk Scoring
 *
 * This file demonstrates how to integrate the risk scoring service
 * with the approval agent workflow.
 */

import {
  scoreApprovalRequest,
  recordApprovalDecision,
  getUserTrustScore,
  getApprovalStats,
  ApprovalRequest,
  RequestType,
  RiskScore,
} from "./approval-risk-scorer";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

// ============================================================================
// APPROVAL WORKFLOW INTEGRATION
// ============================================================================

/**
 * Process an approval request with risk scoring
 */
export async function processApprovalRequest(
  request: ApprovalRequest,
  autoApprovalEnabled: boolean = true,
): Promise<{
  approved: boolean;
  autoApproved: boolean;
  riskScore: RiskScore;
  requiresHumanReview: boolean;
  escalated: boolean;
  message: string;
}> {
  logger.info("Processing approval request", {
    requestId: request.id,
    requestType: request.requestType,
    userId: request.userId,
  });

  // Step 1: Calculate risk score
  const riskScore = await scoreApprovalRequest(request);

  logger.info("Risk score calculated", {
    requestId: request.id,
    totalScore: riskScore.totalScore.toFixed(3),
    riskLevel: riskScore.riskLevel,
    autoApprovalEligible: riskScore.autoApprovalEligible,
    recommendation: riskScore.recommendation,
  });

  // Step 2: Determine if auto-approval is possible
  if (autoApprovalEnabled && riskScore.autoApprovalEligible) {
    // Auto-approve the request
    await recordApprovalDecision(
      request.organizationId,
      request.userId,
      request.requestType,
      "approved",
      request.amount,
    );

    metrics.increment("approval.auto_approved", {
      requestType: request.requestType,
      riskLevel: riskScore.riskLevel,
    });

    logger.info("Request auto-approved", {
      requestId: request.id,
      riskScore: riskScore.totalScore.toFixed(3),
    });

    return {
      approved: true,
      autoApproved: true,
      riskScore,
      requiresHumanReview: false,
      escalated: false,
      message: `✓ Auto-approved (low risk: ${riskScore.totalScore.toFixed(2)})`,
    };
  }

  // Step 3: Route to appropriate approval workflow based on risk
  if (riskScore.recommendation === "multi_approver") {
    // High-risk request requiring multiple approvers
    logger.info("Request requires multiple approvers", {
      requestId: request.id,
      riskLevel: riskScore.riskLevel,
    });

    metrics.increment("approval.escalated", {
      requestType: request.requestType,
      riskLevel: riskScore.riskLevel,
    });

    return {
      approved: false,
      autoApproved: false,
      riskScore,
      requiresHumanReview: true,
      escalated: true,
      message: `⚠️ High-risk request requires multiple approvers (risk: ${riskScore.totalScore.toFixed(2)})`,
    };
  }

  if (riskScore.recommendation === "enhanced_approval") {
    // Medium-high risk requiring enhanced review
    logger.info("Request requires enhanced approval", {
      requestId: request.id,
      riskLevel: riskScore.riskLevel,
    });

    metrics.increment("approval.enhanced_review", {
      requestType: request.requestType,
      riskLevel: riskScore.riskLevel,
    });

    return {
      approved: false,
      autoApproved: false,
      riskScore,
      requiresHumanReview: true,
      escalated: false,
      message: `⚠️ Enhanced approval required (medium risk: ${riskScore.totalScore.toFixed(2)})`,
    };
  }

  // Step 4: Standard approval workflow
  logger.info("Request requires standard approval", {
    requestId: request.id,
    riskLevel: riskScore.riskLevel,
  });

  metrics.increment("approval.standard_review", {
    requestType: request.requestType,
    riskLevel: riskScore.riskLevel,
  });

  return {
    approved: false,
    autoApproved: false,
    riskScore,
    requiresHumanReview: true,
    escalated: false,
    message: `ℹ️ Standard approval required (risk: ${riskScore.totalScore.toFixed(2)})`,
  };
}

/**
 * Handle approval decision from human reviewer
 */
export async function handleApprovalDecision(
  request: ApprovalRequest,
  decision: "approved" | "rejected",
  reviewerNotes?: string,
): Promise<void> {
  logger.info("Recording approval decision", {
    requestId: request.id,
    decision,
    reviewerNotes,
  });

  // Record the decision for future risk scoring
  await recordApprovalDecision(
    request.organizationId,
    request.userId,
    request.requestType,
    decision,
    request.amount,
  );

  metrics.increment("approval.human_decision", {
    decision,
    requestType: request.requestType,
  });

  // Log for learning system
  logger.info("Approval decision recorded", {
    requestId: request.id,
    decision,
    requestType: request.requestType,
  });
}

/**
 * Get approval insights for a user
 */
export async function getUserApprovalInsights(
  organizationId: string,
  userId: string,
): Promise<{
  trustScore: {
    level: string;
    approvalRate: number;
    totalRequests: number;
  };
  autoApprovalEligible: boolean;
  recommendations: string[];
}> {
  const trustScore = await getUserTrustScore(organizationId, userId);

  const recommendations: string[] = [];

  if (trustScore.trustLevel === "new") {
    recommendations.push("New user - all requests will require manual approval");
  } else if (trustScore.trustLevel === "low") {
    recommendations.push(
      "User has low approval rate - consider additional training or review",
    );
  } else if (trustScore.trustLevel === "high") {
    recommendations.push("Trusted user - eligible for auto-approval on routine requests");
  }

  if (trustScore.total > 0 && trustScore.approvalRate < 0.5) {
    recommendations.push("High rejection rate - review user's request patterns");
  }

  return {
    trustScore: {
      level: trustScore.trustLevel,
      approvalRate: trustScore.approvalRate,
      totalRequests: trustScore.total,
    },
    autoApprovalEligible: trustScore.trustLevel === "high" && trustScore.total >= 10,
    recommendations,
  };
}

/**
 * Get organization-wide approval insights
 */
export async function getOrganizationApprovalInsights(
  organizationId: string,
): Promise<{
  stats: Record<
    RequestType,
    {
      total: number;
      approved: number;
      approvalRate: number;
      autoApprovalEligible: boolean;
    }
  >;
  recommendations: string[];
}> {
  const rawStats = await getApprovalStats(organizationId);
  const recommendations: string[] = [];

  // Enhance stats with auto-approval eligibility
  const stats: Record<
    string,
    {
      total: number;
      approved: number;
      approvalRate: number;
      autoApprovalEligible: boolean;
    }
  > = {};

  for (const [requestType, stat] of Object.entries(rawStats)) {
    const autoApprovalEligible = stat.approvalRate >= 0.95 && stat.total >= 10;

    stats[requestType] = {
      ...stat,
      autoApprovalEligible,
    };

    // Generate recommendations
    if (autoApprovalEligible) {
      recommendations.push(
        `Consider enabling auto-approval for "${requestType}" (${Math.round(stat.approvalRate * 100)}% approval rate, ${stat.total} requests)`,
      );
    } else if (stat.approvalRate < 0.3 && stat.total >= 5) {
      recommendations.push(
        `Review "${requestType}" workflow - high rejection rate (${Math.round(stat.approvalRate * 100)}%)`,
      );
    }
  }

  return {
    stats: stats as Record<
      RequestType,
      {
        total: number;
        approved: number;
        approvalRate: number;
        autoApprovalEligible: boolean;
      }
    >,
    recommendations,
  };
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example: Process a task creation request
 */
export async function exampleTaskCreation() {
  const request: ApprovalRequest = {
    id: "req-12345",
    organizationId: "org-abc",
    userId: "user-123",
    requestType: "task_creation",
    description: "Create task for updating documentation",
    impactScope: "user",
    metadata: {
      project: "Documentation",
      priority: "low",
    },
    createdAt: new Date(),
  };

  const result = await processApprovalRequest(request, true);

  console.log(`Approval Result: ${result.message}`);
  console.log(`Risk Score: ${result.riskScore.totalScore.toFixed(3)}`);
  console.log(`Risk Level: ${result.riskScore.riskLevel}`);
  console.log(`Auto-Approved: ${result.autoApproved}`);

  if (result.autoApproved) {
    // Proceed with task creation
    console.log("✓ Task creation auto-approved and executed");
  } else {
    // Send to approval queue
    console.log("→ Request sent to approval queue");
  }
}

/**
 * Example: Process a high-value financial request
 */
export async function exampleFinancialTransfer() {
  const request: ApprovalRequest = {
    id: "req-67890",
    organizationId: "org-abc",
    userId: "user-456",
    requestType: "financial_transfer",
    description: "Transfer payment to vendor XYZ",
    amount: 25000,
    impactScope: "external",
    metadata: {
      vendor: "XYZ Corp",
      invoiceNumber: "INV-2024-001",
    },
    createdAt: new Date(),
  };

  const result = await processApprovalRequest(request, true);

  console.log(`Approval Result: ${result.message}`);
  console.log(`Risk Score: ${result.riskScore.totalScore.toFixed(3)}`);
  console.log(`Risk Level: ${result.riskScore.riskLevel}`);
  console.log(`Escalated: ${result.escalated}`);

  if (result.escalated) {
    // Route to multiple approvers
    console.log("⚠️ Request requires approval from CFO and department head");
  }
}

/**
 * Example: Handle approval decision callback
 */
export async function exampleHandleDecision() {
  const request: ApprovalRequest = {
    id: "req-11111",
    organizationId: "org-abc",
    userId: "user-789",
    requestType: "deployment",
    description: "Deploy v2.1.0 to production",
    impactScope: "organization",
    createdAt: new Date(),
  };

  // Simulate approval
  await handleApprovalDecision(request, "approved", "Reviewed and tested - looks good");

  console.log("✓ Approval decision recorded and will improve future risk scoring");
}

/**
 * Example: Get user insights
 */
export async function exampleUserInsights() {
  const insights = await getUserApprovalInsights("org-abc", "user-123");

  console.log(`User Trust Level: ${insights.trustScore.level}`);
  console.log(`Approval Rate: ${Math.round(insights.trustScore.approvalRate * 100)}%`);
  console.log(`Total Requests: ${insights.trustScore.totalRequests}`);
  console.log(`Auto-Approval Eligible: ${insights.autoApprovalEligible}`);
  console.log("\nRecommendations:");
  insights.recommendations.forEach((rec) => console.log(`- ${rec}`));
}

/**
 * Example: Get organization insights
 */
export async function exampleOrgInsights() {
  const insights = await getOrganizationApprovalInsights("org-abc");

  console.log("Organization Approval Statistics:");
  for (const [requestType, stat] of Object.entries(insights.stats)) {
    console.log(
      `\n${requestType}: ${Math.round(stat.approvalRate * 100)}% approved (${stat.total} requests)`,
    );
    if (stat.autoApprovalEligible) {
      console.log("  ✓ Eligible for auto-approval");
    }
  }

  console.log("\nRecommendations:");
  insights.recommendations.forEach((rec) => console.log(`- ${rec}`));
}
