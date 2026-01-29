import { logger } from "../../utils/logger";
import type { FeedbackCategory, RootCause } from "./processor";

interface FeedbackData {
  type: string;
  rating?: number | null;
  reaction?: string | null;
  correction?: unknown;
  comment?: string | null;
  originalRequest: string;
  agentResponse: string;
}

interface CategorizationResult {
  category: FeedbackCategory;
  rootCause?: RootCause;
  confidence: number;
}

export async function categorizeFeedback(feedback: FeedbackData): Promise<CategorizationResult> {
  const { originalRequest, agentResponse, correction, comment } = feedback;

  // Pattern-based categorization
  const patterns: Array<{
    category: FeedbackCategory;
    patterns: RegExp[];
    rootType: RootCause["type"];
  }> = [
    {
      category: "wrong_agent",
      patterns: [/wrong (agent|team|department)/i, /not (my|the right) (area|expertise)/i, /should (ask|go to|contact)/i],
      rootType: "routing",
    },
    {
      category: "incomplete_response",
      patterns: [/missing/i, /incomplete/i, /didn't (include|mention|cover)/i, /left out/i, /more (info|detail)/i],
      rootType: "knowledge",
    },
    {
      category: "incorrect_response",
      patterns: [/wrong/i, /incorrect/i, /not (right|correct|accurate)/i, /mistake/i, /error/i],
      rootType: "knowledge",
    },
    {
      category: "slow_response",
      patterns: [/slow/i, /took (too long|forever)/i, /waiting/i, /delayed/i],
      rootType: "tool",
    },
    {
      category: "format_issue",
      patterns: [/format/i, /layout/i, /structure/i, /hard to read/i, /confusing/i],
      rootType: "prompt",
    },
    {
      category: "permission_issue",
      patterns: [/access/i, /permission/i, /not allowed/i, /can't (see|view|access)/i, /unauthorized/i],
      rootType: "tool",
    },
    {
      category: "unclear_request",
      patterns: [/didn't understand/i, /misunderstood/i, /not what I (meant|asked)/i, /clarif/i],
      rootType: "unknown",
    },
  ];

  // Check correction text if available
  const correctionData = correction as { corrected?: string } | null;
  const textToAnalyze = [
    comment,
    correctionData?.corrected,
    feedback.reaction === "negative" ? agentResponse : null,
  ].filter(Boolean).join(" ");

  let bestMatch: CategorizationResult = {
    category: "other",
    confidence: 0.3,
  };

  for (const { category, patterns: regexPatterns, rootType } of patterns) {
    for (const pattern of regexPatterns) {
      if (pattern.test(textToAnalyze) || pattern.test(originalRequest)) {
        bestMatch = {
          category,
          rootCause: {
            type: rootType,
            description: `Detected pattern: ${pattern.source}`,
            confidence: 0.7,
          },
          confidence: 0.7,
        };
        break;
      }
    }
    if (bestMatch.confidence > 0.5) break;
  }

  logger.debug("Feedback categorized", { category: bestMatch.category, confidence: bestMatch.confidence });
  return bestMatch;
}

export interface CorrectionAnalysis {
  changeType: "factual" | "formatting" | "tone" | "completeness" | "other";
  significance: "minor" | "moderate" | "major";
  affectedField: string;
  suggestion: string;
}

export async function analyzeCorrection(
  original: string,
  corrected: string,
  _context: string
): Promise<CorrectionAnalysis> {
  // Simple heuristic analysis
  const originalWords = new Set(original.toLowerCase().split(/\s+/));
  const correctedWords = new Set(corrected.toLowerCase().split(/\s+/));

  // Calculate difference
  const addedWords = [...correctedWords].filter(w => !originalWords.has(w));
  const removedWords = [...originalWords].filter(w => !correctedWords.has(w));

  const totalChange = addedWords.length + removedWords.length;
  const significance: CorrectionAnalysis["significance"] =
    totalChange > 20 ? "major" : totalChange > 5 ? "moderate" : "minor";

  // Detect change type
  let changeType: CorrectionAnalysis["changeType"] = "other";

  // Check for factual corrections (numbers, dates, names)
  const hasNumberChange = /\d/.test(original) !== /\d/.test(corrected) ||
    original.match(/\d+/g)?.join() !== corrected.match(/\d+/g)?.join();
  if (hasNumberChange) {
    changeType = "factual";
  }

  // Check for formatting changes
  const originalFormatting = original.match(/[•\-\n\t*]/g)?.length || 0;
  const correctedFormatting = corrected.match(/[•\-\n\t*]/g)?.length || 0;
  if (Math.abs(originalFormatting - correctedFormatting) > 2) {
    changeType = "formatting";
  }

  // Check for completeness
  if (corrected.length > original.length * 1.5) {
    changeType = "completeness";
  }

  return {
    changeType,
    significance,
    affectedField: "response_content",
    suggestion: `Consider updating agent prompts to address ${changeType} issues`,
  };
}
