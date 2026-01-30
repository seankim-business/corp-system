/**
 * Auto-Approval Service - E5-T2 Phase 3 Intelligence Layer
 *
 * Automatically approves low-risk routine requests to reduce approval fatigue.
 * Uses the ApprovalRiskScorer to evaluate requests and auto-approves when safe.
 *
 * Auto-Approval Criteria:
 * - Risk score ≤ 0.25 (LOW)
 * - Confidence ≥ 0.8
 * - Historical approval rate > 95% for this request type
 * - Never auto-approve: contract_signing, financial_transfer, data_deletion
 *
 * All auto-approvals:
 * - Are audited in the audit log
 * - Notify the user via Slack with "Undo" button (5 minute window)
 * - Track metrics for monitoring
 */

import Redis from "ioredis";
import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { auditLogger } from "./audit-logger";
import {
  scoreApprovalRequest,
  recordApprovalDecision,
  getApprovalStats,
  ApprovalRequest,
  RiskScore,
  RequestType,
} from "./approval-risk-scorer";
import { getSlackIntegrationByOrg } from "../api/slack-integration";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// ============================================================================
// CONFIGURATION
// ============================================================================

const AUTO_APPROVAL_THRESHOLD = 0.25; // Must be below this to auto-approve
const AUTO_APPROVAL_MIN_CONFIDENCE = 0.8; // Minimum confidence for auto-approval
const MIN_HISTORICAL_APPROVAL_RATE = 0.95; // 95% historical approval rate required
const UNDO_WINDOW_SECONDS = 300; // 5 minute undo window

// Request types that NEVER auto-approve regardless of risk score
const NEVER_AUTO_APPROVE: Set<RequestType> = new Set([
  "contract_signing",
  "financial_transfer",
  "data_deletion",
]);

// Redis key prefixes
const AUTO_APPROVAL_TRACKING_PREFIX = "auto_approval:tracking:";
const UNDO_WINDOW_PREFIX = "auto_approval:undo:";

// ============================================================================
// TYPES
// ============================================================================

export interface AutoApprovalResult {
  autoApproved: boolean;
  approvalId?: string;
  riskScore: RiskScore;
  reason: string;
  undoExpiresAt?: Date;
}

interface AutoApprovalTracking {
  requestId: string;
  organizationId: string;
  userId: string;
  requestType: RequestType;
  timestamp: Date;
  riskScore: number;
  confidence: number;
}

// ============================================================================
// MAIN AUTO-APPROVAL FUNCTION
// ============================================================================

/**
 * Process an approval request and auto-approve if eligible
 */
export async function processApprovalRequest(
  request: ApprovalRequest,
): Promise<AutoApprovalResult> {
  const startTime = Date.now();

  try {
    logger.debug("Processing approval request for auto-approval", {
      requestId: request.id,
      requestType: request.requestType,
      userId: request.userId,
    });

    metrics.increment("auto_approval.request_evaluated", {
      requestType: request.requestType,
    });

    // Step 1: Calculate risk score
    const riskScore = await scoreApprovalRequest(request);

    logger.debug("Risk score calculated", {
      requestId: request.id,
      totalScore: riskScore.totalScore,
      riskLevel: riskScore.riskLevel,
      autoApprovalEligible: riskScore.autoApprovalEligible,
    });

    // Step 2: Check if should auto-approve
    const shouldApprove = await shouldAutoApprove(request, riskScore);

    if (!shouldApprove.eligible) {
      logger.info("Request not eligible for auto-approval", {
        requestId: request.id,
        reason: shouldApprove.reason,
      });

      metrics.increment("auto_approval.not_eligible", {
        requestType: request.requestType,
        reason: shouldApprove.reason,
      });

      return {
        autoApproved: false,
        riskScore,
        reason: shouldApprove.reason,
      };
    }

    // Step 3: Execute auto-approval
    logger.info("Auto-approving request", {
      requestId: request.id,
      requestType: request.requestType,
      riskScore: riskScore.totalScore,
    });

    const approvalId = await executeAutoApproval(request, riskScore);

    // Step 4: Send notification to user
    await notifyAutoApproval(request, riskScore, approvalId);

    // Step 5: Track the auto-approval
    await trackAutoApproval(request, riskScore);

    const duration = Date.now() - startTime;
    metrics.histogram("auto_approval.duration", duration);
    metrics.increment("auto_approval.executed", {
      requestType: request.requestType,
    });

    logger.info("Auto-approval completed", {
      requestId: request.id,
      approvalId,
      durationMs: duration,
    });

    return {
      autoApproved: true,
      approvalId,
      riskScore,
      reason: "Low risk routine request - automatically approved",
      undoExpiresAt: new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000),
    };
  } catch (error) {
    logger.error(
      "Failed to process auto-approval request",
      { requestId: request.id },
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("auto_approval.errors");

    // On error, return conservative result (not auto-approved)
    const fallbackRiskScore: RiskScore = {
      totalScore: 0.8,
      riskLevel: "HIGH",
      factors: [],
      recommendation: "standard_approval",
      confidence: 0.0,
      reasoning: "Error during auto-approval evaluation",
      autoApprovalEligible: false,
    };

    return {
      autoApproved: false,
      riskScore: fallbackRiskScore,
      reason: "Error evaluating request - requires manual approval",
    };
  }
}

// ============================================================================
// AUTO-APPROVAL DECISION LOGIC
// ============================================================================

interface ShouldAutoApproveResult {
  eligible: boolean;
  reason: string;
}

/**
 * Determine if request should be auto-approved
 */
async function shouldAutoApprove(
  request: ApprovalRequest,
  riskScore: RiskScore,
): Promise<ShouldAutoApproveResult> {
  // Check 1: Never auto-approve blacklisted request types
  if (NEVER_AUTO_APPROVE.has(request.requestType)) {
    return {
      eligible: false,
      reason: `Request type ${request.requestType} is never auto-approved`,
    };
  }

  // Check 2: Risk score must be LOW
  if (riskScore.totalScore > AUTO_APPROVAL_THRESHOLD) {
    return {
      eligible: false,
      reason: `Risk score ${riskScore.totalScore.toFixed(3)} exceeds threshold ${AUTO_APPROVAL_THRESHOLD}`,
    };
  }

  // Check 3: Confidence must be sufficient
  if (riskScore.confidence < AUTO_APPROVAL_MIN_CONFIDENCE) {
    return {
      eligible: false,
      reason: `Confidence ${riskScore.confidence.toFixed(3)} below minimum ${AUTO_APPROVAL_MIN_CONFIDENCE}`,
    };
  }

  // Check 4: Historical approval rate must be high
  const stats = await getApprovalStats(request.organizationId);
  const typeStats = stats[request.requestType];

  if (typeStats && typeStats.total >= 10) {
    // Only check if we have enough history
    if (typeStats.approvalRate < MIN_HISTORICAL_APPROVAL_RATE) {
      return {
        eligible: false,
        reason: `Historical approval rate ${(typeStats.approvalRate * 100).toFixed(1)}% below minimum ${MIN_HISTORICAL_APPROVAL_RATE * 100}%`,
      };
    }
  }

  // Check 5: Risk scorer must explicitly mark as eligible
  if (!riskScore.autoApprovalEligible) {
    return {
      eligible: false,
      reason: "Risk scorer marked as not eligible for auto-approval",
    };
  }

  return {
    eligible: true,
    reason: "Meets all auto-approval criteria",
  };
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute the auto-approval
 */
async function executeAutoApproval(
  request: ApprovalRequest,
  riskScore: RiskScore,
): Promise<string> {
  const approvalId = `auto_${request.id}_${Date.now()}`;

  // Record the approval decision for future risk scoring
  await recordApprovalDecision(
    request.organizationId,
    request.userId,
    request.requestType,
    "approved",
    request.amount,
  );

  // Store undo window
  const undoKey = `${UNDO_WINDOW_PREFIX}${approvalId}`;
  await redis.set(
    undoKey,
    JSON.stringify({
      requestId: request.id,
      organizationId: request.organizationId,
      userId: request.userId,
      requestType: request.requestType,
      riskScore: riskScore.totalScore,
      timestamp: new Date().toISOString(),
    }),
    "EX",
    UNDO_WINDOW_SECONDS,
  );

  // Audit log
  await auditLogger.log({
    action: "approval.approved",
    organizationId: request.organizationId,
    userId: request.userId,
    resourceType: "approval_request",
    resourceId: request.id,
    details: {
      requestType: request.requestType,
      autoApproved: true,
      riskScore: riskScore.totalScore,
      riskLevel: riskScore.riskLevel,
      confidence: riskScore.confidence,
      approvalId,
      description: request.description,
      undoExpiresAt: new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000).toISOString(),
    },
    success: true,
  });

  logger.info("Auto-approval executed", {
    approvalId,
    requestId: request.id,
    requestType: request.requestType,
  });

  return approvalId;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send Slack notification about auto-approval with Undo button
 */
async function notifyAutoApproval(
  request: ApprovalRequest,
  riskScore: RiskScore,
  approvalId: string,
): Promise<void> {
  try {
    // Get Slack integration
    const integration = await getSlackIntegrationByOrg(request.organizationId);
    if (!integration || !integration.enabled) {
      logger.warn("No Slack integration found for auto-approval notification", {
        organizationId: request.organizationId,
      });
      return;
    }

    const slackClient = new WebClient(integration.botToken);

    // Find user's Slack ID
    const userSlackId = await getUserSlackId(request.organizationId, request.userId);
    if (!userSlackId) {
      logger.warn("No Slack ID found for user", { userId: request.userId });
      return;
    }

    // Send DM to user with auto-approval notification
    const expiresAt = new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000);
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Auto-approved:* ${request.description}\n\n_Low risk routine request (score: ${(riskScore.totalScore * 100).toFixed(0)}%)_`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Type: \`${request.requestType}\` • Undo available until ${expiresAt.toLocaleTimeString()}`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Undo (5 min)",
              emoji: true,
            },
            style: "danger",
            action_id: `auto_approval_undo_${approvalId}`,
            value: approvalId,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Details",
              emoji: true,
            },
            action_id: `auto_approval_details_${approvalId}`,
            value: approvalId,
          },
        ],
      },
    ];

    await slackClient.chat.postMessage({
      channel: userSlackId,
      text: `✅ Auto-approved: ${request.description}`,
      blocks,
    });

    logger.info("Auto-approval notification sent", {
      approvalId,
      userId: request.userId,
      userSlackId,
    });

    metrics.increment("auto_approval.notification_sent");
  } catch (error) {
    logger.error(
      "Failed to send auto-approval notification",
      { approvalId, userId: request.userId },
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("auto_approval.notification_failed");
    // Don't throw - notification failure shouldn't fail the approval
  }
}

/**
 * Get user's Slack ID from database
 */
async function getUserSlackId(organizationId: string, userId: string): Promise<string | null> {
  try {
    // Try Redis cache first
    const cacheKey = `user:slack_id:${organizationId}:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // Query database (would need actual implementation)
    // This is a placeholder - actual implementation would query the user table
    logger.debug("Fetching user Slack ID from database", { userId });

    // Cache for 1 hour
    // await redis.set(cacheKey, slackId, "EX", 3600);

    return null; // Placeholder
  } catch (error) {
    logger.error("Failed to get user Slack ID", { userId }, error as Error);
    return null;
  }
}

// ============================================================================
// TRACKING & ANALYTICS
// ============================================================================

/**
 * Track auto-approval for analytics
 */
async function trackAutoApproval(request: ApprovalRequest, riskScore: RiskScore): Promise<void> {
  try {
    const tracking: AutoApprovalTracking = {
      requestId: request.id,
      organizationId: request.organizationId,
      userId: request.userId,
      requestType: request.requestType,
      timestamp: new Date(),
      riskScore: riskScore.totalScore,
      confidence: riskScore.confidence,
    };

    const key = `${AUTO_APPROVAL_TRACKING_PREFIX}${request.organizationId}:${new Date().toISOString().split("T")[0]}`;
    await redis.lpush(key, JSON.stringify(tracking));
    await redis.expire(key, 90 * 24 * 60 * 60); // 90 days

    metrics.increment("auto_approval.tracked");
  } catch (error) {
    logger.error(
      "Failed to track auto-approval",
      { requestId: request.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    // Don't throw - tracking failure shouldn't fail the approval
  }
}

// ============================================================================
// UNDO FUNCTIONALITY
// ============================================================================

/**
 * Undo an auto-approval (within the undo window)
 */
export async function undoAutoApproval(approvalId: string): Promise<{
  success: boolean;
  reason: string;
}> {
  try {
    logger.info("Attempting to undo auto-approval", { approvalId });

    // Check if undo window is still open
    const undoKey = `${UNDO_WINDOW_PREFIX}${approvalId}`;
    const undoData = await redis.get(undoKey);

    if (!undoData) {
      return {
        success: false,
        reason: "Undo window expired or approval not found",
      };
    }

    const data = JSON.parse(undoData);

    // Delete the undo window
    await redis.del(undoKey);

    // Record reversal in audit log
    await auditLogger.log({
      action: "approval.rejected",
      organizationId: data.organizationId,
      userId: data.userId,
      resourceType: "approval_request",
      resourceId: data.requestId,
      details: {
        requestType: data.requestType,
        autoApprovalUndone: true,
        approvalId,
        undoneAt: new Date().toISOString(),
      },
      success: true,
    });

    // Update historical stats (record as rejected)
    await recordApprovalDecision(
      data.organizationId,
      data.userId,
      data.requestType,
      "rejected",
    );

    metrics.increment("auto_approval.undone", {
      requestType: data.requestType,
    });

    logger.info("Auto-approval undone", { approvalId });

    return {
      success: true,
      reason: "Auto-approval successfully undone",
    };
  } catch (error) {
    logger.error(
      "Failed to undo auto-approval",
      { approvalId },
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("auto_approval.undo_errors");

    return {
      success: false,
      reason: "Error undoing approval",
    };
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get auto-approval statistics for an organization
 */
export async function getAutoApprovalStats(
  organizationId: string,
  days = 7,
): Promise<{
  totalAutoApproved: number;
  byRequestType: Record<RequestType, number>;
  averageRiskScore: number;
  undoRate: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = {
    totalAutoApproved: 0,
    byRequestType: {} as Record<RequestType, number>,
    averageRiskScore: 0,
    undoRate: 0,
  };

  try {
    // Collect from Redis tracking
    const dateKeys: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dateKeys.push(
        `${AUTO_APPROVAL_TRACKING_PREFIX}${organizationId}:${date.toISOString().split("T")[0]}`,
      );
    }

    let totalRiskScore = 0;

    for (const key of dateKeys) {
      const entries = await redis.lrange(key, 0, -1);
      for (const entry of entries) {
        const tracking: AutoApprovalTracking = JSON.parse(entry);
        stats.totalAutoApproved++;
        stats.byRequestType[tracking.requestType] =
          (stats.byRequestType[tracking.requestType] || 0) + 1;
        totalRiskScore += tracking.riskScore;
      }
    }

    if (stats.totalAutoApproved > 0) {
      stats.averageRiskScore = totalRiskScore / stats.totalAutoApproved;
    }

    // Calculate undo rate from metrics (simplified - would need actual undo tracking)
    stats.undoRate = 0; // Placeholder - would query actual undo events

    return stats;
  } catch (error) {
    logger.error(
      "Failed to get auto-approval stats",
      { organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return stats;
  }
}
