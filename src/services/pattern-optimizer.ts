/**
 * Pattern Optimizer Service
 *
 * Applies learned patterns from feedback corrections to improve agent responses.
 * This is the core of E3-T3 (Pattern-based response optimization) for Phase 3 Intelligence Layer.
 *
 * Key Features:
 * - Retrieve relevant patterns based on organization, agent type, and query similarity
 * - Filter patterns by confidence threshold (>80%)
 * - Apply pattern context to agent prompts
 * - Track pattern application for analytics
 */

import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { CorrectionPattern } from "./prompt-improvement.service";

// ============================================================================
// TYPES
// ============================================================================

export interface AppliedPattern {
  id: string;
  patternType: string;
  description: string;
  confidence: number;
  appliedAt: Date;
}

export interface PatternApplicationResult {
  enhancedPrompt: string;
  appliedPatterns: AppliedPattern[];
  patternCount: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIDENCE_THRESHOLD = 0.8; // Only apply patterns with >80% confidence
const MAX_PATTERNS_PER_REQUEST = 5; // Limit number of patterns to prevent prompt bloat
const PATTERN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for patterns

// Simple in-memory cache for patterns
interface CacheEntry {
  patterns: CorrectionPattern[];
  timestamp: number;
}
const patternCache = new Map<string, CacheEntry>();

// ============================================================================
// PATTERN RETRIEVAL
// ============================================================================

/**
 * Get relevant patterns for a given organization, agent type, and query.
 * Patterns are filtered by confidence and sorted by relevance.
 */
export async function getRelevantPatterns(
  organizationId: string,
  agentType: string,
  query: string,
): Promise<CorrectionPattern[]> {
  const cacheKey = `${organizationId}:${agentType}`;
  const now = Date.now();

  // Check cache first
  const cached = patternCache.get(cacheKey);
  if (cached && now - cached.timestamp < PATTERN_CACHE_TTL_MS) {
    logger.debug("Retrieved patterns from cache", {
      organizationId,
      agentType,
      patternCount: cached.patterns.length,
    });
    return filterPatternsByQuery(cached.patterns, query);
  }

  try {
    // Query patterns from prompt_suggestions table with high confidence
    const suggestions = await prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        agent_type: string | null;
        pattern_id: string;
        suggested_prompt: string;
        reason: string;
        confidence: number;
        status: string;
        created_at: Date;
      }>
    >`
      SELECT
        id,
        organization_id,
        agent_type,
        pattern_id,
        suggested_prompt,
        reason,
        confidence,
        status,
        created_at
      FROM prompt_suggestions
      WHERE organization_id = ${organizationId}::uuid
        AND (agent_type = ${agentType} OR agent_type IS NULL)
        AND confidence >= ${CONFIDENCE_THRESHOLD}
        AND status = 'approved'
      ORDER BY confidence DESC, created_at DESC
      LIMIT ${MAX_PATTERNS_PER_REQUEST * 2}
    `;

    // Convert to CorrectionPattern format
    const patterns: CorrectionPattern[] = suggestions.map((s: {
      id: string;
      organization_id: string;
      agent_type: string | null;
      pattern_id: string;
      suggested_prompt: string;
      reason: string;
      confidence: number;
      status: string;
      created_at: Date;
    }) => ({
      id: s.pattern_id,
      organizationId: s.organization_id,
      agentType: s.agent_type,
      patternType: extractPatternType(s.reason),
      description: s.reason,
      examples: [], // Not needed for application
      frequency: 1,
      confidence: s.confidence,
      createdAt: s.created_at,
    }));

    // Update cache
    patternCache.set(cacheKey, {
      patterns,
      timestamp: now,
    });

    logger.info("Retrieved patterns from database", {
      organizationId,
      agentType,
      patternCount: patterns.length,
      highConfidenceCount: patterns.filter((p) => p.confidence > 0.9).length,
    });

    metrics.increment("pattern_optimizer.patterns_retrieved", {
      organizationId,
      count: String(patterns.length),
    });

    return filterPatternsByQuery(patterns, query);
  } catch (error) {
    logger.error(
      "Failed to retrieve patterns",
      { organizationId, agentType },
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/**
 * Filter patterns by query relevance using simple keyword matching.
 * More sophisticated approaches (embeddings, semantic search) could be added later.
 */
function filterPatternsByQuery(
  patterns: CorrectionPattern[],
  query: string,
): CorrectionPattern[] {
  if (patterns.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryTokens = queryLower
    .split(/\s+/)
    .filter((t) => t.length > 3); // Filter out short words

  // If query is too short or generic, return all patterns
  if (queryTokens.length === 0) {
    return patterns.slice(0, MAX_PATTERNS_PER_REQUEST);
  }

  // Score patterns by keyword overlap
  const scoredPatterns = patterns.map((pattern) => {
    const descriptionLower = pattern.description.toLowerCase();
    const matchCount = queryTokens.filter((token) => descriptionLower.includes(token)).length;
    const score = matchCount / queryTokens.length;

    return { pattern, score };
  });

  // Return patterns with >0 relevance score, or top patterns if none match
  const relevant = scoredPatterns.filter((sp) => sp.score > 0);

  if (relevant.length === 0) {
    // No matches - return top confident patterns anyway
    return patterns.slice(0, MAX_PATTERNS_PER_REQUEST);
  }

  // Sort by score (relevance) then confidence
  relevant.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.1) {
      return b.score - a.score; // Higher score first
    }
    return b.pattern.confidence - a.pattern.confidence; // Higher confidence first
  });

  return relevant.slice(0, MAX_PATTERNS_PER_REQUEST).map((sp) => sp.pattern);
}

/**
 * Extract pattern type from reason string (heuristic-based)
 */
function extractPatternType(reason: string): string {
  const lower = reason.toLowerCase();

  if (lower.includes("missing") || lower.includes("incomplete")) {
    return "missing_info";
  }
  if (lower.includes("format") || lower.includes("structure")) {
    return "wrong_format";
  }
  if (lower.includes("reasoning") || lower.includes("logic")) {
    return "incorrect_reasoning";
  }
  if (lower.includes("tone") || lower.includes("style")) {
    return "tone_mismatch";
  }
  if (lower.includes("accuracy") || lower.includes("incorrect")) {
    return "accuracy_issue";
  }

  return "general_improvement";
}

// ============================================================================
// PATTERN APPLICATION
// ============================================================================

/**
 * Determine if a pattern should be applied based on confidence threshold.
 */
export function shouldApplyPattern(pattern: CorrectionPattern): boolean {
  return pattern.confidence > CONFIDENCE_THRESHOLD;
}

/**
 * Apply pattern context to a base prompt by adding learned guidance.
 *
 * Patterns are inserted as a system prompt section with clear formatting:
 * - Prefix with [LEARNED PATTERN - {type}]
 * - Include pattern description and recommendation
 * - Add patterns before the main prompt (as guidance context)
 */
export function applyPatternContext(
  basePrompt: string,
  patterns: CorrectionPattern[],
): PatternApplicationResult {
  const applicablePatterns = patterns.filter(shouldApplyPattern);

  if (applicablePatterns.length === 0) {
    logger.debug("No patterns to apply", { totalPatterns: patterns.length });
    return {
      enhancedPrompt: basePrompt,
      appliedPatterns: [],
      patternCount: 0,
    };
  }

  // Build pattern context sections
  const patternSections = applicablePatterns.map((pattern) => {
    return `[LEARNED PATTERN - ${pattern.patternType}]
Based on previous corrections: ${pattern.description}
Confidence: ${Math.round(pattern.confidence * 100)}%
Recommendation: Apply this learning to avoid similar errors.`;
  });

  // Combine patterns into a single guidance block
  const patternGuidance = `
=== LEARNED PATTERNS (from user feedback) ===

The following patterns have been learned from previous user corrections.
Please incorporate these learnings into your response:

${patternSections.join("\n\n---\n\n")}

=== END LEARNED PATTERNS ===

`;

  // Prepend pattern guidance to the base prompt
  const enhancedPrompt = `${patternGuidance}\n${basePrompt}`;

  const appliedPatternRecords: AppliedPattern[] = applicablePatterns.map((p) => ({
    id: p.id,
    patternType: p.patternType,
    description: p.description,
    confidence: p.confidence,
    appliedAt: new Date(),
  }));

  logger.info("Applied patterns to prompt", {
    patternCount: appliedPatternRecords.length,
    types: appliedPatternRecords.map((p) => p.patternType),
    avgConfidence: (
      appliedPatternRecords.reduce((sum, p) => sum + p.confidence, 0) /
      appliedPatternRecords.length
    ).toFixed(2),
  });

  metrics.increment("pattern_optimizer.patterns_applied", {
    count: String(appliedPatternRecords.length),
  });

  return {
    enhancedPrompt,
    appliedPatterns: appliedPatternRecords,
    patternCount: appliedPatternRecords.length,
  };
}

// ============================================================================
// TRACKING & ANALYTICS
// ============================================================================

/**
 * Track pattern application for analytics.
 * This data can be used to measure pattern effectiveness over time.
 */
export async function trackPatternApplication(
  executionId: string,
  organizationId: string,
  agentType: string,
  appliedPatterns: AppliedPattern[],
): Promise<void> {
  if (appliedPatterns.length === 0) {
    return;
  }

  try {
    // Store pattern application metadata
    await prisma.orchestratorExecution.update({
      where: { id: executionId },
      data: {
        metadata: {
          appliedPatterns: appliedPatterns.map((p) => ({
            id: p.id,
            type: p.patternType,
            confidence: p.confidence,
          })),
          patternCount: appliedPatterns.length,
        },
      },
    });

    logger.debug("Tracked pattern application", {
      executionId,
      organizationId,
      agentType,
      patternCount: appliedPatterns.length,
    });

    // Record metrics for monitoring
    for (const pattern of appliedPatterns) {
      metrics.increment("pattern_optimizer.pattern_used", {
        patternType: pattern.patternType,
        organizationId,
      });

      metrics.histogram("pattern_optimizer.confidence_level", pattern.confidence, {
        patternType: pattern.patternType,
      });
    }
  } catch (error) {
    logger.warn("Failed to track pattern application", {
      executionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear pattern cache for an organization (useful after pattern updates)
 */
export function clearPatternCache(organizationId: string, agentType?: string): void {
  if (agentType) {
    const key = `${organizationId}:${agentType}`;
    patternCache.delete(key);
    logger.debug("Cleared pattern cache for specific agent", { organizationId, agentType });
  } else {
    // Clear all entries for this organization
    for (const key of patternCache.keys()) {
      if (key.startsWith(`${organizationId}:`)) {
        patternCache.delete(key);
      }
    }
    logger.debug("Cleared all pattern cache for organization", { organizationId });
  }
}

/**
 * Clear all pattern cache (useful for testing or full refresh)
 */
export function clearAllPatternCache(): void {
  patternCache.clear();
  logger.debug("Cleared all pattern cache");
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Get pattern application statistics for an organization
 */
export async function getPatternApplicationStats(
  organizationId: string,
): Promise<{
  totalPatterns: number;
  highConfidencePatterns: number;
  patternsByType: Record<string, number>;
  avgConfidence: number;
}> {
  try {
    const suggestions = await prisma.$queryRaw<
      Array<{
        pattern_id: string;
        reason: string;
        confidence: number;
      }>
    >`
      SELECT pattern_id, reason, confidence
      FROM prompt_suggestions
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'approved'
    `;

    const highConfidence = suggestions.filter((s: { confidence: number }) => s.confidence >= CONFIDENCE_THRESHOLD);

    const patternsByType: Record<string, number> = {};
    for (const s of suggestions) {
      const type = extractPatternType(s.reason);
      patternsByType[type] = (patternsByType[type] || 0) + 1;
    }

    const avgConfidence =
      suggestions.length > 0
        ? suggestions.reduce((sum: number, s: { confidence: number }) => sum + s.confidence, 0) / suggestions.length
        : 0;

    return {
      totalPatterns: suggestions.length,
      highConfidencePatterns: highConfidence.length,
      patternsByType,
      avgConfidence,
    };
  } catch (error) {
    logger.error(
      "Failed to get pattern stats",
      { organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      totalPatterns: 0,
      highConfidencePatterns: 0,
      patternsByType: {},
      avgConfidence: 0,
    };
  }
}
