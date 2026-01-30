import { Category } from "./types";
import { logger } from "../utils/logger";

export interface ConfidenceInput {
  keywordScore: number;
  keywordCount: number;
  llmConfidence?: number;
  llmCategory?: Category;
  keywordCategory: Category;
  requestLength: number;
  complexity: "low" | "medium" | "high";
  isFollowUp: boolean;
  sessionDepth: number;
}

export interface ConfidenceResult {
  finalCategory: Category;
  confidence: number;
  method: "keyword" | "llm" | "hybrid" | "fallback";
  breakdown: {
    keywordContribution: number;
    llmContribution: number;
    contextBoost: number;
    lengthPenalty: number;
  };
}

export type ConfidenceLevel = "very_high" | "high" | "medium" | "low" | "very_low";

/**
 * Compute a unified confidence score combining keyword match scores,
 * LLM classification confidence, and contextual signals.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const {
    keywordScore,
    keywordCount,
    llmConfidence,
    llmCategory,
    keywordCategory,
    requestLength,
    isFollowUp,
    sessionDepth,
  } = input;

  const hasKeyword = keywordScore > 0 && keywordCount > 0;
  const hasLLM = llmConfidence !== undefined && llmCategory !== undefined;

  // Determine context boost
  const followUpBoost = isFollowUp ? 0.05 : 0;
  const depthBoost = Math.min(sessionDepth * 0.02, 0.1);
  const contextBoost = followUpBoost + depthBoost;

  // Determine length penalty
  let lengthPenalty = 0;
  if (requestLength < 10) {
    lengthPenalty = -0.1;
  } else if (requestLength < 20) {
    lengthPenalty = -0.05;
  }

  let finalCategory: Category;
  let confidence: number;
  let method: ConfidenceResult["method"];
  let keywordContribution = 0;
  let llmContribution = 0;

  if (hasKeyword && hasLLM) {
    // Hybrid path: weighted combination
    const categoriesAgree = keywordCategory === llmCategory;
    const agreementBonus = categoriesAgree ? 0.1 : 0;

    if (categoriesAgree) {
      // Categories agree: 60% keyword, 40% LLM + agreement bonus
      keywordContribution = keywordScore * 0.6;
      llmContribution = llmConfidence * 0.4;
      finalCategory = keywordCategory;
    } else {
      // Categories disagree: penalize by reducing weights
      keywordContribution = keywordScore * 0.6 * 0.8;
      llmContribution = llmConfidence * 0.4 * 0.8;
      // Pick the category with the higher raw score
      finalCategory = keywordScore >= llmConfidence ? keywordCategory : llmCategory;
    }

    confidence = keywordContribution + llmContribution + agreementBonus + contextBoost + lengthPenalty;
    method = "hybrid";

    logger.debug("Hybrid confidence scoring", {
      keywordScore,
      llmConfidence,
      categoriesAgree,
      agreementBonus,
      keywordContribution,
      llmContribution,
    });
  } else if (hasKeyword) {
    // Keyword-only path with length/complexity adjustments
    keywordContribution = keywordScore;
    finalCategory = keywordCategory;
    confidence = keywordContribution + contextBoost + lengthPenalty;
    method = "keyword";

    logger.debug("Keyword-only confidence scoring", {
      keywordScore,
      keywordCount,
      contextBoost,
      lengthPenalty,
    });
  } else if (hasLLM) {
    // LLM-only path
    llmContribution = llmConfidence;
    finalCategory = llmCategory;
    confidence = llmContribution + contextBoost + lengthPenalty;
    method = "llm";

    logger.debug("LLM-only confidence scoring", {
      llmConfidence,
      llmCategory,
      contextBoost,
      lengthPenalty,
    });
  } else {
    // Fallback: no signals available
    finalCategory = keywordCategory;
    confidence = 0.3 + contextBoost + lengthPenalty;
    method = "fallback";

    logger.debug("Fallback confidence scoring", {
      keywordCategory,
      contextBoost,
      lengthPenalty,
    });
  }

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  const result: ConfidenceResult = {
    finalCategory,
    confidence,
    method,
    breakdown: {
      keywordContribution,
      llmContribution,
      contextBoost,
      lengthPenalty,
    },
  };

  logger.debug("Confidence scoring complete", {
    finalCategory: result.finalCategory,
    confidence: result.confidence,
    method: result.method,
  });

  return result;
}

/**
 * Map a numeric confidence score to a human-readable level.
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return "very_high";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  if (score >= 0.3) return "low";
  return "very_low";
}

/**
 * Determine whether LLM classification should be invoked as a fallback
 * when keyword matching produces weak or absent results.
 */
export function shouldUseLLMFallback(keywordScore: number, keywordCount: number): boolean {
  return keywordScore < 0.7 || keywordCount === 0;
}
