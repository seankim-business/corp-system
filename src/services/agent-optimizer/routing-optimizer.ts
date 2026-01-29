/**
 * Routing Optimizer Service
 *
 * Analyzes and optimizes agent routing rules based on performance data.
 * Suggests keyword additions/removals and pattern improvements.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import Anthropic from "@anthropic-ai/sdk";

// Types
export interface RoutingRule {
  id: string;
  organizationId: string;
  agentId: string;
  keywords: string[];
  patterns: string[];
  confidence: number;
  enabled: boolean;
  matchCount: number;
  correctCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingFeedback {
  id: string;
  organizationId: string;
  ruleId: string | null;
  inputText: string;
  matchedAgentId: string | null;
  correctAgentId: string | null;
  wasCorrect: boolean;
  userId: string | null;
  createdAt: Date;
}

export interface MisrouteAnalysis {
  agentId: string;
  totalMatches: number;
  correctMatches: number;
  incorrectMatches: number;
  correctRate: number;
  commonMisroutes: {
    intendedAgent: string;
    count: number;
    examples: string[];
  }[];
  problematicKeywords: string[];
  suggestedRemovals: string[];
}

export interface KeywordSuggestion {
  keyword: string;
  score: number;
  source: "successful_routing" | "semantic_expansion" | "frequency_analysis";
  reason: string;
}

const anthropic = new Anthropic();

/**
 * Create or update a routing rule
 */
export async function upsertRoutingRule(
  organizationId: string,
  agentId: string,
  keywords: string[],
  patterns: string[] = [],
  confidence: number = 0.8,
): Promise<RoutingRule> {
  const result = await prisma.$queryRaw<RoutingRule[]>`
    INSERT INTO routing_rules (organization_id, agent_id, keywords, patterns, confidence)
    VALUES (${organizationId}::uuid, ${agentId}, ${keywords}::text[], ${patterns}::text[], ${confidence})
    ON CONFLICT (organization_id, agent_id)
    DO UPDATE SET
      keywords = ${keywords}::text[],
      patterns = ${patterns}::text[],
      confidence = ${confidence},
      updated_at = NOW()
    RETURNING id, organization_id as "organizationId", agent_id as "agentId",
              keywords, patterns, confidence, enabled,
              match_count as "matchCount", correct_count as "correctCount",
              created_at as "createdAt", updated_at as "updatedAt"
  `;

  return result[0];
}

/**
 * Get routing rule for an agent
 */
export async function getRoutingRule(
  organizationId: string,
  agentId: string,
): Promise<RoutingRule | null> {
  const rules = await prisma.$queryRaw<RoutingRule[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId",
           keywords, patterns, confidence, enabled,
           match_count as "matchCount", correct_count as "correctCount",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM routing_rules
    WHERE organization_id = ${organizationId}::uuid AND agent_id = ${agentId}
  `;

  return rules[0] || null;
}

/**
 * Get all routing rules for an organization
 */
export async function getRoutingRules(organizationId: string): Promise<RoutingRule[]> {
  return prisma.$queryRaw<RoutingRule[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId",
           keywords, patterns, confidence, enabled,
           match_count as "matchCount", correct_count as "correctCount",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM routing_rules
    WHERE organization_id = ${organizationId}::uuid AND enabled = true
    ORDER BY agent_id
  `;
}

/**
 * Record routing feedback
 */
export async function recordRoutingFeedback(
  organizationId: string,
  inputText: string,
  matchedAgentId: string | null,
  correctAgentId: string | null,
  wasCorrect: boolean,
  userId?: string,
): Promise<void> {
  // Find the rule that matched (if any)
  let ruleId: string | null = null;
  if (matchedAgentId) {
    const rules = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM routing_rules
      WHERE organization_id = ${organizationId}::uuid AND agent_id = ${matchedAgentId}
      LIMIT 1
    `;
    ruleId = rules[0]?.id || null;
  }

  await prisma.$executeRaw`
    INSERT INTO routing_feedback (organization_id, rule_id, input_text, matched_agent_id, correct_agent_id, was_correct, user_id)
    VALUES (
      ${organizationId}::uuid,
      ${ruleId}::uuid,
      ${inputText},
      ${matchedAgentId},
      ${correctAgentId},
      ${wasCorrect},
      ${userId ? `${userId}::uuid` : null}::uuid
    )
  `;

  // Update rule statistics if we have a rule
  if (ruleId) {
    await prisma.$executeRaw`
      UPDATE routing_rules
      SET
        match_count = match_count + 1,
        correct_count = correct_count + ${wasCorrect ? 1 : 0},
        updated_at = NOW()
      WHERE id = ${ruleId}::uuid
    `;
  }
}

/**
 * Analyze misrouted requests
 */
export async function analyzeMisroutes(
  organizationId: string,
  agentId: string,
  days: number = 30,
): Promise<MisrouteAnalysis> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all feedback for this agent
  const feedback = await prisma.$queryRaw<RoutingFeedback[]>`
    SELECT id, organization_id as "organizationId", rule_id as "ruleId",
           input_text as "inputText", matched_agent_id as "matchedAgentId",
           correct_agent_id as "correctAgentId", was_correct as "wasCorrect",
           user_id as "userId", created_at as "createdAt"
    FROM routing_feedback
    WHERE organization_id = ${organizationId}::uuid
      AND matched_agent_id = ${agentId}
      AND created_at >= ${startDate}
  `;

  const totalMatches = feedback.length;
  const correctMatches = feedback.filter((f) => f.wasCorrect).length;
  const incorrectMatches = totalMatches - correctMatches;
  const correctRate = totalMatches > 0 ? correctMatches / totalMatches : 0;

  // Analyze misroutes to find patterns
  const misroutes = feedback.filter((f) => !f.wasCorrect && f.correctAgentId);
  const misrouteByAgent: Record<string, { count: number; examples: string[] }> = {};

  for (const m of misroutes) {
    const intended = m.correctAgentId!;
    if (!misrouteByAgent[intended]) {
      misrouteByAgent[intended] = { count: 0, examples: [] };
    }
    misrouteByAgent[intended].count++;
    if (misrouteByAgent[intended].examples.length < 5) {
      misrouteByAgent[intended].examples.push(m.inputText);
    }
  }

  const commonMisroutes = Object.entries(misrouteByAgent)
    .map(([intendedAgent, data]) => ({
      intendedAgent,
      count: data.count,
      examples: data.examples,
    }))
    .sort((a, b) => b.count - a.count);

  // Get current keywords to identify problematic ones
  const rule = await getRoutingRule(organizationId, agentId);
  const keywords = rule?.keywords || [];

  // Find keywords that frequently appear in misrouted requests
  const problematicKeywords: string[] = [];
  const suggestedRemovals: string[] = [];

  if (keywords.length > 0 && incorrectMatches > 5) {
    const keywordMisrouteCount: Record<string, number> = {};

    for (const m of misroutes) {
      const inputLower = m.inputText.toLowerCase();
      for (const keyword of keywords) {
        if (inputLower.includes(keyword.toLowerCase())) {
          keywordMisrouteCount[keyword] = (keywordMisrouteCount[keyword] || 0) + 1;
        }
      }
    }

    // Keywords that appear in >50% of misroutes are problematic
    for (const [keyword, count] of Object.entries(keywordMisrouteCount)) {
      const misrouteRate = count / incorrectMatches;
      if (misrouteRate > 0.5) {
        problematicKeywords.push(keyword);
      }
      if (misrouteRate > 0.7) {
        suggestedRemovals.push(keyword);
      }
    }
  }

  return {
    agentId,
    totalMatches,
    correctMatches,
    incorrectMatches,
    correctRate,
    commonMisroutes,
    problematicKeywords,
    suggestedRemovals,
  };
}

/**
 * Suggest new keywords from successful routings
 */
export async function suggestKeywords(
  organizationId: string,
  agentId: string,
): Promise<KeywordSuggestion[]> {
  const suggestions: KeywordSuggestion[] = [];

  // Get successful routing examples
  const successfulRoutings = await prisma.$queryRaw<{ inputText: string }[]>`
    SELECT input_text as "inputText"
    FROM routing_feedback
    WHERE organization_id = ${organizationId}::uuid
      AND matched_agent_id = ${agentId}
      AND was_correct = true
    ORDER BY created_at DESC
    LIMIT 100
  `;

  if (successfulRoutings.length < 5) {
    return suggestions;
  }

  // Get current keywords
  const rule = await getRoutingRule(organizationId, agentId);
  const existingKeywords = new Set((rule?.keywords || []).map((k) => k.toLowerCase()));

  // Extract frequent words/phrases from successful routings
  const wordFrequency: Record<string, number> = {};

  for (const routing of successfulRoutings) {
    // Simple word extraction (could be enhanced with NLP)
    const words = routing.inputText
      .toLowerCase()
      .split(/[\s.,!?;:]+/)
      .filter((w) => w.length > 2 && !existingKeywords.has(w));

    for (const word of words) {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  }

  // Convert to suggestions
  const totalRoutings = successfulRoutings.length;
  for (const [word, count] of Object.entries(wordFrequency)) {
    const frequency = count / totalRoutings;
    if (frequency > 0.1 && count >= 3) {
      // Appears in >10% of routings
      suggestions.push({
        keyword: word,
        score: frequency,
        source: "frequency_analysis",
        reason: `Appears in ${(frequency * 100).toFixed(0)}% of successful routings`,
      });
    }
  }

  // Sort by score
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions.slice(0, 20);
}

/**
 * Suggest keywords for removal based on misroutings
 */
export async function suggestRemovals(
  organizationId: string,
  agentId: string,
): Promise<string[]> {
  const analysis = await analyzeMisroutes(organizationId, agentId, 30);
  return analysis.suggestedRemovals;
}

/**
 * Expand keywords using semantic similarity (via LLM)
 */
export async function expandKeywords(
  keywords: string[],
  similarityThreshold: number = 0.7,
): Promise<string[]> {
  if (keywords.length === 0) return [];

  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Given these keywords: ${keywords.join(", ")}

Generate semantically similar words and phrases that users might use when referring to similar concepts.
Focus on synonyms, related terms, and common alternative phrasings.
Similarity threshold: ${similarityThreshold} (higher = more similar)

Return ONLY a JSON array of strings with the suggested keywords.
Do not include the original keywords.
Limit to 20 suggestions maximum.

Example format: ["keyword1", "keyword2", "keyword3"]`,
      },
    ],
  });

  try {
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const expanded: string[] = JSON.parse(jsonMatch[0]);
    return expanded.filter(
      (k) => typeof k === "string" && k.length > 1 && !keywords.includes(k),
    );
  } catch (error) {
    logger.warn("Failed to expand keywords", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Apply routing improvements
 */
export async function applyImprovements(
  organizationId: string,
  agentId: string,
  addKeywords: string[],
  removeKeywords: string[],
): Promise<RoutingRule> {
  const rule = await getRoutingRule(organizationId, agentId);
  const currentKeywords = rule?.keywords || [];

  // Remove specified keywords
  const removeSet = new Set(removeKeywords.map((k) => k.toLowerCase()));
  let newKeywords = currentKeywords.filter((k) => !removeSet.has(k.toLowerCase()));

  // Add new keywords (deduplicated)
  const existingSet = new Set(newKeywords.map((k) => k.toLowerCase()));
  for (const keyword of addKeywords) {
    if (!existingSet.has(keyword.toLowerCase())) {
      newKeywords.push(keyword);
      existingSet.add(keyword.toLowerCase());
    }
  }

  // Update the rule
  const updated = await upsertRoutingRule(
    organizationId,
    agentId,
    newKeywords,
    rule?.patterns || [],
    rule?.confidence || 0.8,
  );

  logger.info("Routing improvements applied", {
    organizationId,
    agentId,
    added: addKeywords.length,
    removed: removeKeywords.length,
    totalKeywords: newKeywords.length,
  });

  return updated;
}

/**
 * Get routing analysis summary for all agents
 */
export async function getRoutingAnalysisSummary(
  organizationId: string,
  days: number = 30,
): Promise<{
  agentId: string;
  matchCount: number;
  correctCount: number;
  correctRate: number;
}[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await prisma.$queryRaw<
    { agentId: string; matchCount: bigint; correctCount: bigint }[]
  >`
    SELECT
      matched_agent_id as "agentId",
      COUNT(*) as "matchCount",
      SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) as "correctCount"
    FROM routing_feedback
    WHERE organization_id = ${organizationId}::uuid
      AND created_at >= ${startDate}
      AND matched_agent_id IS NOT NULL
    GROUP BY matched_agent_id
    ORDER BY COUNT(*) DESC
  `;

  return results.map((r) => ({
    agentId: r.agentId,
    matchCount: Number(r.matchCount),
    correctCount: Number(r.correctCount),
    correctRate: Number(r.matchCount) > 0 ? Number(r.correctCount) / Number(r.matchCount) : 0,
  }));
}
