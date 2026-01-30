import { logger } from "../utils/logger";
import { redis } from "../db/redis";

export interface SkillRecommendation {
  skillId: string;
  score: number;
  reasons: string[];
}

interface SkillMetrics {
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  executionCount: number;
  lastUsedAt: number;
}

/** In-memory keyword registry: skillId -> keywords */
const skillKeywords = new Map<string, string[]>();

/** Scoring weights */
const WEIGHT_KEYWORD = 0.4;
const WEIGHT_PERFORMANCE = 0.3;
const WEIGHT_RECENCY = 0.2;
const WEIGHT_LATENCY = 0.1;

/** Recency decay half-life in milliseconds (7 days) */
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Register keywords for a skill used in keyword matching.
 */
export function registerSkillKeywords(skillId: string, keywords: string[]): void {
  skillKeywords.set(skillId, keywords.map((k) => k.toLowerCase()));
  logger.debug("Registered skill keywords", { skillId, keywordCount: keywords.length });
}

/**
 * Tokenize a request string into lowercase tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Calculate keyword match score for a skill against a request string.
 * Returns a value between 0 and 1.
 */
export function calculateKeywordScore(request: string, skillId: string): number {
  const keywords = skillKeywords.get(skillId);
  if (!keywords || keywords.length === 0) {
    return 0;
  }

  const tokens = tokenize(request);
  if (tokens.length === 0) {
    return 0;
  }

  let matchCount = 0;
  for (const keyword of keywords) {
    // Support multi-word keywords by checking substring match on lowered request
    if (keyword.includes(" ")) {
      if (request.toLowerCase().includes(keyword)) {
        matchCount++;
      }
    } else {
      if (tokens.includes(keyword)) {
        matchCount++;
      }
    }
  }

  // Normalize: ratio of matched keywords to total keywords, capped at 1
  return Math.min(matchCount / keywords.length, 1);
}

/**
 * Fetch stored performance metrics from Redis for a skill and organization.
 * Redis key format: skill:metrics:{orgId}:{skillId}
 * Expected hash fields: successCount, failureCount, totalLatencyMs, executionCount, lastUsedAt
 */
async function fetchSkillMetrics(
  skillId: string,
  orgId: string,
): Promise<SkillMetrics | null> {
  const key = `skill:metrics:${orgId}:${skillId}`;
  try {
    const data = await redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      successCount: parseInt(data.successCount || "0", 10),
      failureCount: parseInt(data.failureCount || "0", 10),
      totalLatencyMs: parseInt(data.totalLatencyMs || "0", 10),
      executionCount: parseInt(data.executionCount || "0", 10),
      lastUsedAt: parseInt(data.lastUsedAt || "0", 10),
    };
  } catch (err) {
    logger.error("Failed to fetch skill metrics from Redis", {
      skillId,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Calculate performance score based on historical success rate.
 * Returns a value between 0 and 1.
 */
export async function calculatePerformanceScore(
  skillId: string,
  orgId: string,
): Promise<{ score: number; recencyScore: number; latencyBonus: number; reasons: string[] }> {
  const metrics = await fetchSkillMetrics(skillId, orgId);
  const reasons: string[] = [];

  if (!metrics || metrics.executionCount === 0) {
    return { score: 0, recencyScore: 0, latencyBonus: 0, reasons: ["No execution history"] };
  }

  // Success rate: successCount / executionCount
  const successRate = metrics.successCount / metrics.executionCount;
  reasons.push(`Success rate: ${(successRate * 100).toFixed(1)}% (${metrics.executionCount} executions)`);

  // Recency: exponential decay based on time since last use
  const timeSinceLastUse = Date.now() - metrics.lastUsedAt;
  const recencyScore = Math.exp((-Math.LN2 * timeSinceLastUse) / RECENCY_HALF_LIFE_MS);
  if (recencyScore > 0.5) {
    reasons.push("Recently used");
  }

  // Latency bonus: faster average latency = higher bonus
  // Normalize: 0-1 where 1s or less = 1.0, 10s+ = 0.0
  const avgLatencyMs =
    metrics.executionCount > 0 ? metrics.totalLatencyMs / metrics.executionCount : 10000;
  const latencyBonus = Math.max(0, Math.min(1, 1 - (avgLatencyMs - 1000) / 9000));
  if (latencyBonus > 0.7) {
    reasons.push("Low average latency");
  }

  return { score: successRate, recencyScore, latencyBonus, reasons };
}

/**
 * Get recommended skills for a request, ranked by composite score.
 *
 * Score composition:
 *  - Keyword match:           0.4 weight
 *  - Historical success rate: 0.3 weight
 *  - Recency of use:          0.2 weight
 *  - Avg latency bonus:       0.1 weight
 *
 * @param request - The user's natural language request
 * @param organizationId - Organization ID for performance lookup
 * @param topN - Number of top recommendations to return (default 5)
 */
export async function getRecommendedSkills(
  request: string,
  organizationId: string,
  topN: number = 5,
): Promise<SkillRecommendation[]> {
  const allSkillIds = Array.from(skillKeywords.keys());

  if (allSkillIds.length === 0) {
    logger.warn("No skills registered for recommendation");
    return [];
  }

  const recommendations: SkillRecommendation[] = [];

  // Score all registered skills in parallel
  const scoringPromises = allSkillIds.map(async (skillId) => {
    const reasons: string[] = [];

    // Keyword score
    const keywordScore = calculateKeywordScore(request, skillId);
    if (keywordScore > 0) {
      reasons.push(`Keyword match: ${(keywordScore * 100).toFixed(0)}%`);
    }

    // Performance metrics from Redis
    const perfResult = await calculatePerformanceScore(skillId, organizationId);
    reasons.push(...perfResult.reasons);

    // Composite score
    const compositeScore =
      WEIGHT_KEYWORD * keywordScore +
      WEIGHT_PERFORMANCE * perfResult.score +
      WEIGHT_RECENCY * perfResult.recencyScore +
      WEIGHT_LATENCY * perfResult.latencyBonus;

    return {
      skillId,
      score: Math.round(compositeScore * 1000) / 1000,
      reasons,
    };
  });

  const results = await Promise.all(scoringPromises);

  // Filter out zero-score skills and sort descending
  for (const result of results) {
    if (result.score > 0) {
      recommendations.push(result);
    }
  }

  recommendations.sort((a, b) => b.score - a.score);

  const topResults = recommendations.slice(0, topN);

  logger.info("Skill recommendations generated", {
    request: request.substring(0, 100),
    organizationId,
    totalEvaluated: allSkillIds.length,
    recommended: topResults.length,
  });

  return topResults;
}
