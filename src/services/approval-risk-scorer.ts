/**
 * Approval Risk Scorer - E5-T1 Phase 3 Intelligence Layer
 *
 * Evaluates approval requests to determine risk levels and auto-approval eligibility.
 * Reduces approval fatigue by identifying low-risk routine requests.
 *
 * Risk Factors:
 * - Request type (task creation=low, data deletion=high, financial=high)
 * - Historical approval rate for similar requests (>95% = low risk)
 * - User's approval history (trusted users = lower risk)
 * - Amount/impact if applicable (small changes = low risk)
 * - Time since last similar request (frequent = lower risk)
 *
 * Risk Thresholds:
 * - LOW: 0.0-0.3 (candidate for auto-approval)
 * - MEDIUM: 0.3-0.7 (standard approval)
 * - HIGH: 0.7-1.0 (escalate to additional approver)
 */

import Redis from "ioredis";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// ============================================================================
// TYPES
// ============================================================================

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  userId: string;
  requestType: RequestType;
  description: string;
  amount?: number;
  impactScope?: ImpactScope;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type RequestType =
  | "task_creation"
  | "task_modification"
  | "task_deletion"
  | "data_creation"
  | "data_modification"
  | "data_deletion"
  | "financial_spend"
  | "financial_transfer"
  | "deployment"
  | "configuration_change"
  | "user_permission"
  | "content_publication"
  | "contract_signing"
  | "other";

export type ImpactScope = "user" | "team" | "organization" | "external";

export interface RiskScore {
  totalScore: number; // 0.0 - 1.0
  riskLevel: RiskLevel;
  factors: RiskFactor[];
  recommendation: ApprovalRecommendation;
  confidence: number; // 0.0 - 1.0, how confident we are in the score
  reasoning: string;
  autoApprovalEligible: boolean;
}

export interface RiskFactor {
  name: string;
  score: number; // 0.0 - 1.0
  weight: number; // 0.0 - 1.0
  description: string;
}

export type ApprovalRecommendation =
  | "auto_approve"
  | "standard_approval"
  | "enhanced_approval"
  | "multi_approver";

interface ApprovalHistory {
  requestType: RequestType;
  decision: "approved" | "rejected";
  timestamp: Date;
  userId: string;
  amount?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const RISK_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.7,
  HIGH: 1.0,
} as const;

const AUTO_APPROVAL_THRESHOLD = 0.25; // Must be below this to auto-approve
const AUTO_APPROVAL_MIN_CONFIDENCE = 0.8; // Minimum confidence for auto-approval

// Base risk scores by request type (0.0 = no risk, 1.0 = maximum risk)
const REQUEST_TYPE_BASE_RISK: Record<RequestType, number> = {
  task_creation: 0.1,
  task_modification: 0.15,
  task_deletion: 0.3,
  data_creation: 0.2,
  data_modification: 0.25,
  data_deletion: 0.7,
  financial_spend: 0.6,
  financial_transfer: 0.8,
  deployment: 0.5,
  configuration_change: 0.4,
  user_permission: 0.5,
  content_publication: 0.35,
  contract_signing: 0.9,
  other: 0.5,
};

// Impact scope risk multipliers
const IMPACT_SCOPE_MULTIPLIER: Record<ImpactScope, number> = {
  user: 0.7,
  team: 0.85,
  organization: 1.0,
  external: 1.2,
};

// Redis keys
const APPROVAL_HISTORY_PREFIX = "approval:history:";
const USER_TRUST_SCORE_PREFIX = "approval:trust:";
const REQUEST_TYPE_STATS_PREFIX = "approval:stats:";

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Calculate risk score for an approval request
 */
export async function scoreApprovalRequest(request: ApprovalRequest): Promise<RiskScore> {
  const startTime = Date.now();

  try {
    logger.debug("Scoring approval request", {
      requestId: request.id,
      requestType: request.requestType,
      userId: request.userId,
    });

    // Calculate individual risk factors
    const factors: RiskFactor[] = [];

    // Factor 1: Request Type Risk (weight: 0.3)
    const typeRiskFactor = await calculateTypeRisk(request);
    factors.push(typeRiskFactor);

    // Factor 2: Historical Approval Rate (weight: 0.25)
    const historyRiskFactor = await calculateHistoricalRisk(request);
    factors.push(historyRiskFactor);

    // Factor 3: User Trust Score (weight: 0.2)
    const userTrustFactor = await calculateUserTrustRisk(request);
    factors.push(userTrustFactor);

    // Factor 4: Amount/Impact Risk (weight: 0.15)
    const impactRiskFactor = await calculateImpactRisk(request);
    factors.push(impactRiskFactor);

    // Factor 5: Recency/Frequency Risk (weight: 0.1)
    const recencyRiskFactor = await calculateRecencyRisk(request);
    factors.push(recencyRiskFactor);

    // Calculate weighted total score
    const totalScore = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);

    // Calculate confidence based on available data
    const confidence = calculateConfidence(factors, request);

    // Determine risk level
    const riskLevel = determineRiskLevel(totalScore);

    // Generate recommendation
    const recommendation = generateRecommendation(totalScore, confidence, request);

    // Check auto-approval eligibility
    const autoApprovalEligible =
      totalScore <= AUTO_APPROVAL_THRESHOLD && confidence >= AUTO_APPROVAL_MIN_CONFIDENCE;

    // Generate reasoning
    const reasoning = generateReasoning(factors, totalScore, riskLevel, autoApprovalEligible);

    const riskScore: RiskScore = {
      totalScore,
      riskLevel,
      factors,
      recommendation,
      confidence,
      reasoning,
      autoApprovalEligible,
    };

    // Record metrics
    const duration = Date.now() - startTime;
    metrics.histogram("approval.risk_score.duration", duration);
    metrics.increment("approval.risk_score.calculated", {
      riskLevel,
      requestType: request.requestType,
    });

    if (autoApprovalEligible) {
      metrics.increment("approval.risk_score.auto_approval_eligible", {
        requestType: request.requestType,
      });
    }

    logger.info("Risk score calculated", {
      requestId: request.id,
      totalScore: totalScore.toFixed(3),
      riskLevel,
      autoApprovalEligible,
      durationMs: duration,
    });

    return riskScore;
  } catch (error) {
    logger.error(
      "Failed to calculate risk score",
      { requestId: request.id },
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("approval.risk_score.errors");

    // Return conservative fallback score on error
    return {
      totalScore: 0.8,
      riskLevel: "HIGH",
      factors: [],
      recommendation: "enhanced_approval",
      confidence: 0.0,
      reasoning: "Unable to calculate risk score due to error. Defaulting to high risk.",
      autoApprovalEligible: false,
    };
  }
}

// ============================================================================
// RISK FACTOR CALCULATIONS
// ============================================================================

/**
 * Calculate risk based on request type
 */
async function calculateTypeRisk(request: ApprovalRequest): Promise<RiskFactor> {
  const baseRisk = REQUEST_TYPE_BASE_RISK[request.requestType] || 0.5;

  // Apply impact scope multiplier if available
  let adjustedRisk = baseRisk;
  if (request.impactScope) {
    const multiplier = IMPACT_SCOPE_MULTIPLIER[request.impactScope];
    adjustedRisk = Math.min(baseRisk * multiplier, 1.0);
  }

  return {
    name: "request_type",
    score: adjustedRisk,
    weight: 0.3,
    description: `${request.requestType} requests have ${getRiskLevelDescription(adjustedRisk)} base risk`,
  };
}

/**
 * Calculate risk based on historical approval rates for similar requests
 */
async function calculateHistoricalRisk(request: ApprovalRequest): Promise<RiskFactor> {
  try {
    const statsKey = `${REQUEST_TYPE_STATS_PREFIX}${request.organizationId}:${request.requestType}`;
    const stats = await redis.hgetall(statsKey);

    if (!stats || !stats.total) {
      // No history available - neutral risk
      return {
        name: "historical_approval_rate",
        score: 0.5,
        weight: 0.25,
        description: "No historical data available for this request type",
      };
    }

    const total = parseInt(stats.total, 10);
    const approved = parseInt(stats.approved || "0", 10);
    const approvalRate = total > 0 ? approved / total : 0;

    // High approval rate = low risk
    // >95% approval = 0.1 risk
    // 50% approval = 0.5 risk
    // <5% approval = 0.9 risk
    let riskScore: number;
    if (approvalRate >= 0.95) {
      riskScore = 0.1;
    } else if (approvalRate >= 0.8) {
      riskScore = 0.2;
    } else if (approvalRate >= 0.6) {
      riskScore = 0.35;
    } else if (approvalRate >= 0.4) {
      riskScore = 0.5;
    } else if (approvalRate >= 0.2) {
      riskScore = 0.7;
    } else {
      riskScore = 0.9;
    }

    return {
      name: "historical_approval_rate",
      score: riskScore,
      weight: 0.25,
      description: `${Math.round(approvalRate * 100)}% historical approval rate (${approved}/${total})`,
    };
  } catch (error) {
    logger.warn("Failed to fetch historical approval rate", { error });
    return {
      name: "historical_approval_rate",
      score: 0.5,
      weight: 0.25,
      description: "Unable to fetch historical data",
    };
  }
}

/**
 * Calculate risk based on user's approval history (trust score)
 */
async function calculateUserTrustRisk(request: ApprovalRequest): Promise<RiskFactor> {
  try {
    const trustKey = `${USER_TRUST_SCORE_PREFIX}${request.organizationId}:${request.userId}`;
    const trustData = await redis.hgetall(trustKey);

    if (!trustData || !trustData.total) {
      // New user - neutral risk
      return {
        name: "user_trust",
        score: 0.5,
        weight: 0.2,
        description: "No approval history for this user",
      };
    }

    const total = parseInt(trustData.total, 10);
    const approved = parseInt(trustData.approved || "0", 10);
    const approvalRate = total > 0 ? approved / total : 0;

    // High approval rate for user = trusted user = low risk
    let riskScore: number;
    if (approvalRate >= 0.9 && total >= 10) {
      riskScore = 0.1; // Highly trusted user
    } else if (approvalRate >= 0.8 && total >= 5) {
      riskScore = 0.2; // Trusted user
    } else if (approvalRate >= 0.6) {
      riskScore = 0.4; // Moderately trusted
    } else {
      riskScore = 0.6; // Low trust
    }

    return {
      name: "user_trust",
      score: riskScore,
      weight: 0.2,
      description: `User has ${Math.round(approvalRate * 100)}% approval rate (${total} requests)`,
    };
  } catch (error) {
    logger.warn("Failed to fetch user trust score", { error });
    return {
      name: "user_trust",
      score: 0.5,
      weight: 0.2,
      description: "Unable to fetch user history",
    };
  }
}

/**
 * Calculate risk based on amount/impact
 */
async function calculateImpactRisk(request: ApprovalRequest): Promise<RiskFactor> {
  // If no amount specified, use moderate risk
  if (!request.amount) {
    return {
      name: "impact",
      score: 0.3,
      weight: 0.15,
      description: "No specific amount/impact specified",
    };
  }

  // Financial amounts - threshold-based risk
  if (
    request.requestType === "financial_spend" ||
    request.requestType === "financial_transfer"
  ) {
    let riskScore: number;
    if (request.amount < 100) {
      riskScore = 0.1; // Very low amount
    } else if (request.amount < 500) {
      riskScore = 0.2;
    } else if (request.amount < 1000) {
      riskScore = 0.3;
    } else if (request.amount < 5000) {
      riskScore = 0.5;
    } else if (request.amount < 10000) {
      riskScore = 0.7;
    } else {
      riskScore = 0.9; // High amount
    }

    return {
      name: "impact",
      score: riskScore,
      weight: 0.15,
      description: `Amount: $${request.amount}`,
    };
  }

  // For non-financial requests, use amount as impact scale (0-100)
  const normalizedAmount = Math.min(request.amount / 100, 1.0);

  return {
    name: "impact",
    score: normalizedAmount * 0.6, // Max 0.6 for non-financial
    weight: 0.15,
    description: `Impact scale: ${request.amount}/100`,
  };
}

/**
 * Calculate risk based on recency/frequency of similar requests
 */
async function calculateRecencyRisk(request: ApprovalRequest): Promise<RiskFactor> {
  try {
    const historyKey = `${APPROVAL_HISTORY_PREFIX}${request.organizationId}:${request.userId}:${request.requestType}`;
    const recentHistory = await redis.lrange(historyKey, 0, 4); // Last 5 requests

    if (recentHistory.length === 0) {
      // No recent history - moderate risk
      return {
        name: "recency",
        score: 0.5,
        weight: 0.1,
        description: "No recent similar requests",
      };
    }

    const now = Date.now();
    const histories: ApprovalHistory[] = recentHistory.map((h) => JSON.parse(h));

    // Calculate time since last similar request
    const mostRecent = histories[0];
    const timeSinceLastMs = now - new Date(mostRecent.timestamp).getTime();
    const daysSinceLast = timeSinceLastMs / (1000 * 60 * 60 * 24);

    // More frequent = lower risk (assuming it's a routine action)
    let riskScore: number;
    if (daysSinceLast < 1 && histories.length >= 3) {
      riskScore = 0.1; // Very frequent, routine action
    } else if (daysSinceLast < 7 && histories.length >= 2) {
      riskScore = 0.2; // Weekly routine
    } else if (daysSinceLast < 30) {
      riskScore = 0.3; // Monthly routine
    } else if (daysSinceLast < 90) {
      riskScore = 0.4; // Quarterly
    } else {
      riskScore = 0.5; // Rare request
    }

    return {
      name: "recency",
      score: riskScore,
      weight: 0.1,
      description: `Last similar request ${Math.round(daysSinceLast)} days ago (${histories.length} recent)`,
    };
  } catch (error) {
    logger.warn("Failed to fetch recency data", { error });
    return {
      name: "recency",
      score: 0.5,
      weight: 0.1,
      description: "Unable to fetch recency data",
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate confidence in the risk score based on available data
 */
function calculateConfidence(factors: RiskFactor[], request: ApprovalRequest): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence for each factor with real data
  for (const factor of factors) {
    if (!factor.description.includes("Unable to fetch") && !factor.description.includes("No ")) {
      confidence += 0.1;
    }
  }

  // Increase confidence if we have complete request metadata
  if (request.impactScope) confidence += 0.05;
  if (request.amount !== undefined) confidence += 0.05;
  if (request.metadata && Object.keys(request.metadata).length > 0) confidence += 0.05;

  return Math.min(confidence, 1.0);
}

/**
 * Determine risk level from total score
 */
function determineRiskLevel(totalScore: number): RiskLevel {
  if (totalScore < RISK_THRESHOLDS.LOW) return "LOW";
  if (totalScore < RISK_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "HIGH";
}

/**
 * Generate approval recommendation
 */
function generateRecommendation(
  totalScore: number,
  confidence: number,
  request: ApprovalRequest,
): ApprovalRecommendation {
  // Auto-approve if score is very low and confidence is high
  if (totalScore <= AUTO_APPROVAL_THRESHOLD && confidence >= AUTO_APPROVAL_MIN_CONFIDENCE) {
    return "auto_approve";
  }

  // Enhanced approval for high-risk types
  if (
    request.requestType === "contract_signing" ||
    request.requestType === "financial_transfer" ||
    totalScore >= 0.8
  ) {
    return "multi_approver";
  }

  // Enhanced approval for high risk
  if (totalScore >= RISK_THRESHOLDS.MEDIUM) {
    return "enhanced_approval";
  }

  // Standard approval for everything else
  return "standard_approval";
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  factors: RiskFactor[],
  totalScore: number,
  riskLevel: RiskLevel,
  autoApprovalEligible: boolean,
): string {
  const parts: string[] = [];

  parts.push(`Risk level: ${riskLevel} (score: ${totalScore.toFixed(2)})`);

  if (autoApprovalEligible) {
    parts.push("✓ Eligible for auto-approval");
  }

  parts.push("\nRisk factors:");
  for (const factor of factors.sort((a, b) => b.score - a.score)) {
    const contribution = (factor.score * factor.weight * 100).toFixed(0);
    parts.push(
      `- ${factor.name}: ${(factor.score * 100).toFixed(0)}% risk (${contribution}% contribution) - ${factor.description}`,
    );
  }

  return parts.join("\n");
}

/**
 * Get risk level description
 */
function getRiskLevelDescription(score: number): string {
  if (score < 0.3) return "low";
  if (score < 0.6) return "moderate";
  return "high";
}

// ============================================================================
// HISTORY TRACKING
// ============================================================================

/**
 * Record an approval decision for future risk scoring
 */
export async function recordApprovalDecision(
  organizationId: string,
  userId: string,
  requestType: RequestType,
  decision: "approved" | "rejected",
  amount?: number,
): Promise<void> {
  const history: ApprovalHistory = {
    requestType,
    decision,
    timestamp: new Date(),
    userId,
    amount,
  };

  try {
    // Store in user's history
    const historyKey = `${APPROVAL_HISTORY_PREFIX}${organizationId}:${userId}:${requestType}`;
    await redis.lpush(historyKey, JSON.stringify(history));
    await redis.ltrim(historyKey, 0, 99); // Keep last 100
    await redis.expire(historyKey, 90 * 24 * 60 * 60); // 90 days

    // Update request type stats
    const statsKey = `${REQUEST_TYPE_STATS_PREFIX}${organizationId}:${requestType}`;
    await redis.hincrby(statsKey, "total", 1);
    if (decision === "approved") {
      await redis.hincrby(statsKey, "approved", 1);
    }
    await redis.expire(statsKey, 90 * 24 * 60 * 60);

    // Update user trust score
    const trustKey = `${USER_TRUST_SCORE_PREFIX}${organizationId}:${userId}`;
    await redis.hincrby(trustKey, "total", 1);
    if (decision === "approved") {
      await redis.hincrby(trustKey, "approved", 1);
    }
    await redis.expire(trustKey, 90 * 24 * 60 * 60);

    metrics.increment("approval.decision_recorded", { decision, requestType });
  } catch (error) {
    logger.error(
      "Failed to record approval decision",
      { organizationId, userId, requestType },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Get approval statistics for an organization
 */
export async function getApprovalStats(
  organizationId: string,
): Promise<Record<RequestType, { total: number; approved: number; approvalRate: number }>> {
  const stats: Record<string, { total: number; approved: number; approvalRate: number }> = {};

  for (const requestType of Object.keys(REQUEST_TYPE_BASE_RISK) as RequestType[]) {
    const statsKey = `${REQUEST_TYPE_STATS_PREFIX}${organizationId}:${requestType}`;
    const data = await redis.hgetall(statsKey);

    if (data && data.total) {
      const total = parseInt(data.total, 10);
      const approved = parseInt(data.approved || "0", 10);
      stats[requestType] = {
        total,
        approved,
        approvalRate: total > 0 ? approved / total : 0,
      };
    }
  }

  return stats as Record<RequestType, { total: number; approved: number; approvalRate: number }>;
}

/**
 * Get user trust score
 */
export async function getUserTrustScore(
  organizationId: string,
  userId: string,
): Promise<{
  total: number;
  approved: number;
  approvalRate: number;
  trustLevel: "new" | "low" | "moderate" | "high";
}> {
  const trustKey = `${USER_TRUST_SCORE_PREFIX}${organizationId}:${userId}`;
  const data = await redis.hgetall(trustKey);

  if (!data || !data.total) {
    return { total: 0, approved: 0, approvalRate: 0, trustLevel: "new" };
  }

  const total = parseInt(data.total, 10);
  const approved = parseInt(data.approved || "0", 10);
  const approvalRate = total > 0 ? approved / total : 0;

  let trustLevel: "new" | "low" | "moderate" | "high";
  if (total < 5) {
    trustLevel = "new";
  } else if (approvalRate < 0.6) {
    trustLevel = "low";
  } else if (approvalRate < 0.8) {
    trustLevel = "moderate";
  } else {
    trustLevel = "high";
  }

  return { total, approved, approvalRate, trustLevel };
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Seed historical data for testing (dev/staging only)
 */
export async function seedApprovalHistory(
  organizationId: string,
  userId: string,
  requestType: RequestType,
  approvedCount: number,
  rejectedCount: number,
): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot seed data in production");
  }

  logger.info("Seeding approval history", {
    organizationId,
    userId,
    requestType,
    approvedCount,
    rejectedCount,
  });

  for (let i = 0; i < approvedCount; i++) {
    await recordApprovalDecision(organizationId, userId, requestType, "approved");
  }

  for (let i = 0; i < rejectedCount; i++) {
    await recordApprovalDecision(organizationId, userId, requestType, "rejected");
  }
}
