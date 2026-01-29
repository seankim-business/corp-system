/**
 * Hybrid Router
 *
 * Provides fast-path routing using keyword matching to skip expensive AI calls
 * when the intent is clear from keywords alone.
 */

import { logger } from "../utils/logger";
import { Skill, Category } from "./types";

export interface HybridRoutingResult {
  useFastPath: boolean;
  confidence: number;
  category?: Category;
  skills?: Skill[];
  matchedKeywords: string[];
  reason: string;
}

// High-confidence keyword patterns for fast-path routing
const FAST_PATH_PATTERNS: Array<{
  patterns: RegExp[];
  category: Category;
  skills: Skill[];
  keywords: string[];
}> = [
  // Git operations - very clear intent
  {
    patterns: [
      /\b(commit|커밋)\s*(the|this|these|all|my|changes?)?/i,
      /\bgit\s+(push|pull|commit|merge|rebase|stash|checkout|branch)/i,
      /\b(push|pull)\s*(to|from)?\s*(origin|remote|main|master|branch)/i,
      /\b(merge|머지)\s+(branch|브랜치)/i,
      /\b(resolve|해결)\s+(conflict|충돌)/i,
    ],
    category: "quick",
    skills: ["git-master"],
    keywords: ["commit", "push", "pull", "merge", "git", "branch", "커밋", "머지"],
  },

  // MCP/Integration operations
  {
    patterns: [
      /\b(create|make|add|생성)\s+(a\s+)?(task|태스크|issue|이슈|ticket)/i,
      /\b(notion|노션)\s+(page|페이지|database|데이터베이스)/i,
      /\b(linear|리니어)\s+(issue|이슈|task|태스크)/i,
      /\b(sync|동기화)\s+(with|to|from)?\s*(notion|linear|jira)/i,
    ],
    category: "quick",
    skills: ["mcp-integration"],
    keywords: ["task", "notion", "linear", "sync", "create", "issue"],
  },

  // Screenshot/Browser automation
  {
    patterns: [
      /\b(take|capture|get)\s+(a\s+)?(screenshot|스크린샷|캡처)/i,
      /\b(screenshot|스크린샷)\s+(of|the|this)/i,
      /\b(scrape|스크래핑|crawl|크롤링)\s+(the|this|a)?\s*(page|site|website|웹)/i,
    ],
    category: "quick",
    skills: ["playwright"],
    keywords: ["screenshot", "scrape", "capture", "browser", "스크린샷", "크롤링"],
  },

  // UI/Frontend tasks
  {
    patterns: [
      /\b(design|디자인)\s+(a|the)?\s*(component|컴포넌트|ui|button|form)/i,
      /\b(style|스타일)\s+(the|this|a)?\s*(component|element|button|form)/i,
      /\b(create|make|build)\s+(a|the)?\s*(react|vue|svelte)?\s*(component|컴포넌트)/i,
      /\b(responsive|반응형)\s+(design|layout|레이아웃)/i,
    ],
    category: "visual-engineering",
    skills: ["frontend-ui-ux"],
    keywords: ["design", "component", "ui", "style", "frontend", "react"],
  },

  // Complex analysis requests (skip fast-path, use AI)
  {
    patterns: [
      /\b(analyze|분석|explain|설명|why|왜|how does|어떻게)\b/i,
      /\b(debug|디버그|investigate|조사|figure out|알아)/i,
      /\b(architecture|아키텍처|design pattern|디자인 패턴)/i,
    ],
    category: "ultrabrain",
    skills: [],
    keywords: ["analyze", "explain", "debug", "architecture"],
  },
];

// Keywords that indicate complex requests (should NOT use fast-path)
const COMPLEXITY_INDICATORS = [
  "and then",
  "after that",
  "also",
  "but",
  "however",
  "additionally",
  "multiple",
  "several",
  "various",
  "different",
  "compare",
  "evaluate",
  "decide",
  "choose",
  "best way",
  "optimal",
  "complex",
];

/**
 * Minimum confidence threshold for using fast-path
 * Below this, fall back to AI analysis
 */
const FAST_PATH_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Check if a request qualifies for fast-path routing
 */
export function checkFastPath(userRequest: string): HybridRoutingResult {
  const text = userRequest.toLowerCase().trim();

  // Check for complexity indicators that should skip fast-path
  const hasComplexityIndicators = COMPLEXITY_INDICATORS.some((indicator) =>
    text.includes(indicator.toLowerCase()),
  );

  if (hasComplexityIndicators) {
    return {
      useFastPath: false,
      confidence: 0,
      matchedKeywords: [],
      reason: "Request contains complexity indicators",
    };
  }

  // Check for very short requests (likely need clarification)
  if (text.length < 10) {
    return {
      useFastPath: false,
      confidence: 0,
      matchedKeywords: [],
      reason: "Request too short for confident routing",
    };
  }

  // Check for very long requests (likely complex)
  if (text.length > 500) {
    return {
      useFastPath: false,
      confidence: 0,
      matchedKeywords: [],
      reason: "Request too long, likely complex",
    };
  }

  let bestMatch: HybridRoutingResult | null = null;
  let bestScore = 0;

  for (const pattern of FAST_PATH_PATTERNS) {
    let patternMatches = 0;
    let keywordMatches: string[] = [];

    // Check regex patterns
    for (const regex of pattern.patterns) {
      if (regex.test(text)) {
        patternMatches++;
      }
    }

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        keywordMatches.push(keyword);
      }
    }

    // Calculate confidence score
    const patternScore = patternMatches > 0 ? 0.5 : 0;
    const keywordScore = Math.min(keywordMatches.length * 0.1, 0.4);
    const totalScore = patternScore + keywordScore;

    // Penalize if multiple patterns match (ambiguous)
    let finalScore = totalScore;
    if (bestMatch && bestMatch.confidence > 0.3 && totalScore > 0.3) {
      // Multiple strong matches = ambiguous, reduce confidence
      finalScore *= 0.7;
    }

    if (finalScore > bestScore && finalScore >= FAST_PATH_CONFIDENCE_THRESHOLD) {
      bestScore = finalScore;
      bestMatch = {
        useFastPath: true,
        confidence: finalScore,
        category: pattern.category,
        skills: pattern.skills,
        matchedKeywords: keywordMatches,
        reason: `Matched ${pattern.skills.join(", ")} pattern with ${keywordMatches.length} keywords`,
      };
    }
  }

  if (bestMatch) {
    logger.debug("Fast-path routing match", {
      confidence: bestMatch.confidence,
      category: bestMatch.category,
      skills: bestMatch.skills,
      matchedKeywords: bestMatch.matchedKeywords,
    });
    return bestMatch;
  }

  return {
    useFastPath: false,
    confidence: 0,
    matchedKeywords: [],
    reason: "No confident pattern match found",
  };
}

/**
 * Get routing statistics
 */
export interface RoutingStats {
  totalRequests: number;
  fastPathHits: number;
  fastPathMisses: number;
  averageFastPathConfidence: number;
  categoryDistribution: Record<string, number>;
}

let routingStats: RoutingStats = {
  totalRequests: 0,
  fastPathHits: 0,
  fastPathMisses: 0,
  averageFastPathConfidence: 0,
  categoryDistribution: {},
};

export function recordRoutingDecision(result: HybridRoutingResult): void {
  routingStats.totalRequests++;

  if (result.useFastPath) {
    routingStats.fastPathHits++;
    if (result.category) {
      routingStats.categoryDistribution[result.category] =
        (routingStats.categoryDistribution[result.category] || 0) + 1;
    }

    // Update rolling average
    const n = routingStats.fastPathHits;
    routingStats.averageFastPathConfidence =
      ((n - 1) * routingStats.averageFastPathConfidence + result.confidence) / n;
  } else {
    routingStats.fastPathMisses++;
  }
}

export function getRoutingStats(): RoutingStats {
  return { ...routingStats };
}

export function resetRoutingStats(): void {
  routingStats = {
    totalRequests: 0,
    fastPathHits: 0,
    fastPathMisses: 0,
    averageFastPathConfidence: 0,
    categoryDistribution: {},
  };
}
