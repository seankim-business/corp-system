/**
 * Prompt Improvement Service
 *
 * Analyzes user corrections from FeedbackCapture to identify patterns
 * and generate prompt improvement suggestions for agents.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const anthropic = new Anthropic();

// ============================================================================
// TYPES
// ============================================================================

export interface CorrectionPattern {
  id: string;
  organizationId: string;
  agentType: string | null;
  patternType: string; // missing_info, wrong_format, incorrect_reasoning, etc.
  description: string;
  examples: Array<{
    original: string;
    correction: string;
    context?: Record<string, unknown>;
  }>;
  frequency: number;
  confidence: number;
  createdAt: Date;
}

export interface PromptSuggestion {
  id: string;
  organizationId: string;
  agentType: string | null;
  patternId: string;
  currentPrompt: string | null;
  suggestedPrompt: string;
  reason: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FeedbackWithCorrection {
  id: string;
  organizationId: string;
  executionId: string | null;
  originalMessage: string;
  correction: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// CORRECTION ANALYSIS
// ============================================================================

/**
 * Analyze corrections to detect common error patterns
 */
export async function analyzeCorrections(
  feedbacks: FeedbackWithCorrection[],
): Promise<CorrectionPattern[]> {
  if (feedbacks.length === 0) {
    return [];
  }

  const startTime = Date.now();

  // Group by organization and agent type
  const byOrgAndAgent = new Map<string, FeedbackWithCorrection[]>();

  for (const feedback of feedbacks) {
    const agentType = (feedback.metadata as { agentType?: string }).agentType || "unknown";
    const key = `${feedback.organizationId}:${agentType}`;

    if (!byOrgAndAgent.has(key)) {
      byOrgAndAgent.set(key, []);
    }
    byOrgAndAgent.get(key)!.push(feedback);
  }

  const allPatterns: CorrectionPattern[] = [];

  // Analyze each group
  for (const [key, group] of byOrgAndAgent) {
    if (group.length < 2) continue; // Need at least 2 corrections to detect a pattern

    const [organizationId, agentType] = key.split(":");

    try {
      const patterns = await detectPatternsWithLLM(organizationId, agentType, group);
      allPatterns.push(...patterns);
    } catch (error) {
      logger.error(
        "Failed to detect patterns for group",
        { organizationId, agentType, count: group.length },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  const duration = Date.now() - startTime;

  logger.info("Correction pattern analysis completed", {
    totalFeedbacks: feedbacks.length,
    patternsDetected: allPatterns.length,
    durationMs: duration,
  });

  metrics.increment("prompt_improvement.patterns_detected", { count: String(allPatterns.length) });

  return allPatterns;
}

/**
 * Use Claude to identify patterns in corrections
 */
async function detectPatternsWithLLM(
  organizationId: string,
  agentType: string,
  feedbacks: FeedbackWithCorrection[],
): Promise<CorrectionPattern[]> {
  const examples = feedbacks.map((f) => ({
    original: f.originalMessage,
    correction: f.correction,
    metadata: f.metadata,
  }));

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `You are an AI prompt engineering expert. Analyze these user corrections to identify common error patterns.

User corrections (original message → corrected message):
${examples.map((e, i) => `${i + 1}. Original: "${e.original.substring(0, 200)}${e.original.length > 200 ? "..." : ""}"\n   Correction: "${e.correction.substring(0, 200)}${e.correction.length > 200 ? "..." : ""}"`).join("\n\n")}

Identify recurring patterns of errors. For each pattern:
1. Classify the error type (missing_info, wrong_format, incorrect_reasoning, tone_mismatch, etc.)
2. Describe the pattern clearly
3. Estimate confidence (0-1) based on frequency and consistency
4. Provide 2-3 representative examples

Return ONLY a JSON array:
[
  {
    "patternType": "error_type",
    "description": "Clear description of what's consistently wrong",
    "confidence": 0.85,
    "exampleIndices": [0, 2, 5]
  }
]

If no clear patterns exist, return an empty array []`,
      },
    ],
  });

  try {
    const responseText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      logger.warn("No valid JSON found in LLM response for pattern detection");
      return [];
    }

    const detected = JSON.parse(jsonMatch[0]) as Array<{
      patternType: string;
      description: string;
      confidence: number;
      exampleIndices: number[];
    }>;

    return detected
      .filter((p) => p.confidence >= 0.6) // Minimum confidence threshold
      .map((p) => ({
        id: generatePatternId(),
        organizationId,
        agentType: agentType === "unknown" ? null : agentType,
        patternType: p.patternType,
        description: p.description,
        examples: p.exampleIndices
          .filter((idx) => idx < examples.length)
          .map((idx) => ({
            original: examples[idx].original,
            correction: examples[idx].correction,
            context: examples[idx].metadata as Record<string, unknown>,
          })),
        frequency: p.exampleIndices.length,
        confidence: p.confidence,
        createdAt: new Date(),
      }));
  } catch (error) {
    logger.error(
      "Failed to parse pattern detection response",
      { organizationId, agentType },
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

// ============================================================================
// PROMPT SUGGESTION GENERATION
// ============================================================================

/**
 * Generate a prompt improvement suggestion from a detected pattern
 */
export async function generatePromptSuggestion(
  pattern: CorrectionPattern,
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `You are a prompt engineering expert. Generate a prompt modification to fix this recurring error pattern.

Agent type: ${pattern.agentType || "General"}
Error pattern: ${pattern.patternType}
Description: ${pattern.description}

Examples of the error:
${pattern.examples.map((e, i) => `${i + 1}. User expected: "${e.correction.substring(0, 150)}${e.correction.length > 150 ? "..." : ""}"\n   But got: "${e.original.substring(0, 150)}${e.original.length > 150 ? "..." : ""}"`).join("\n\n")}

Generate a specific prompt instruction or modification that would prevent this error.
Be concise and actionable. Focus on what to add or change in the system prompt.

Return ONLY the prompt modification text, no explanations or markdown.`,
      },
    ],
  });

  const suggestion = message.content[0].type === "text" ? message.content[0].text.trim() : "";

  logger.debug("Generated prompt suggestion", {
    patternId: pattern.id,
    patternType: pattern.patternType,
    suggestionLength: suggestion.length,
  });

  return suggestion;
}

/**
 * Store a prompt suggestion for review
 */
export async function storePromptSuggestion(
  suggestion: Omit<PromptSuggestion, "id" | "createdAt" | "updatedAt">,
): Promise<PromptSuggestion> {
  const result = await prisma.$queryRaw<PromptSuggestion[]>`
    INSERT INTO prompt_suggestions (
      organization_id, agent_type, pattern_id, current_prompt,
      suggested_prompt, reason, confidence, status
    )
    VALUES (
      ${suggestion.organizationId}::uuid,
      ${suggestion.agentType},
      ${suggestion.patternId},
      ${suggestion.currentPrompt},
      ${suggestion.suggestedPrompt},
      ${suggestion.reason},
      ${suggestion.confidence},
      ${suggestion.status}
    )
    RETURNING
      id,
      organization_id as "organizationId",
      agent_type as "agentType",
      pattern_id as "patternId",
      current_prompt as "currentPrompt",
      suggested_prompt as "suggestedPrompt",
      reason,
      confidence,
      status,
      approved_by as "approvedBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  logger.info("Prompt suggestion stored", {
    suggestionId: result[0].id,
    organizationId: suggestion.organizationId,
    agentType: suggestion.agentType,
  });

  metrics.increment("prompt_improvement.suggestions_created");

  return result[0];
}

/**
 * Get pending suggestions for an organization
 */
export async function getPendingSuggestions(
  organizationId: string,
): Promise<PromptSuggestion[]> {
  return prisma.$queryRaw<PromptSuggestion[]>`
    SELECT
      id,
      organization_id as "organizationId",
      agent_type as "agentType",
      pattern_id as "patternId",
      current_prompt as "currentPrompt",
      suggested_prompt as "suggestedPrompt",
      reason,
      confidence,
      status,
      approved_by as "approvedBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM prompt_suggestions
    WHERE organization_id = ${organizationId}::uuid
      AND status = 'pending'
    ORDER BY confidence DESC, created_at DESC
  `;
}

/**
 * Approve a prompt suggestion
 */
export async function approveSuggestion(
  suggestionId: string,
  approvedBy: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE prompt_suggestions
    SET status = 'approved', approved_by = ${approvedBy}, updated_at = NOW()
    WHERE id = ${suggestionId}::uuid
  `;

  logger.info("Prompt suggestion approved", { suggestionId, approvedBy });
  metrics.increment("prompt_improvement.suggestions_approved");
}

/**
 * Reject a prompt suggestion
 */
export async function rejectSuggestion(suggestionId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE prompt_suggestions
    SET status = 'rejected', updated_at = NOW()
    WHERE id = ${suggestionId}::uuid
  `;

  logger.info("Prompt suggestion rejected", { suggestionId });
  metrics.increment("prompt_improvement.suggestions_rejected");
}

// ============================================================================
// HELPERS
// ============================================================================

function generatePatternId(): string {
  return `pattern_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
