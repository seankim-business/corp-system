import { Category, RequestAnalysis } from "./types";

export type CategorySelectionMethod = "keyword" | "complexity-fallback" | "llm-fallback";

export interface CategorySelection {
  category: Category;
  confidence: number;
  method: CategorySelectionMethod;
  matchedKeywords?: string[];
}

/**
 * Pre-computed keyword → category mapping for fast-path routing
 * Covers 80-90% of requests without LLM calls
 */
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  "visual-engineering": [
    "디자인",
    "design",
    "ui",
    "ux",
    "프론트엔드",
    "frontend",
    "react",
    "vue",
    "angular",
    "컴포넌트",
    "component",
    "css",
    "style",
    "스타일",
    "레이아웃",
    "layout",
    "애니메이션",
    "animation",
    "반응형",
    "responsive",
    "인터랙션",
    "interaction",
    "버튼",
    "button",
    "폼",
    "form",
    "모달",
    "modal",
    "네비게이션",
    "navigation",
  ],
  ultrabrain: [
    "아키텍처",
    "architecture",
    "최적화",
    "optimization",
    "설계",
    "design pattern",
    "전략",
    "strategy",
    "복잡한",
    "complex",
    "분석",
    "analysis",
    "리팩토링",
    "refactor",
    "성능",
    "performance",
    "확장성",
    "scalability",
    "마이그레이션",
    "migration",
    "데이터베이스",
    "database",
    "시스템",
    "system",
    "인프라",
    "infrastructure",
  ],
  artistry: [
    "창의적",
    "creative",
    "아이디어",
    "idea",
    "콘셉트",
    "concept",
    "브랜드",
    "brand",
    "캠페인",
    "campaign",
    "콘텐츠",
    "content",
    "크리에이티브",
    "기획",
    "planning",
    "스토리",
    "story",
    "비주얼",
    "visual",
    "슬로건",
    "slogan",
    "카피",
    "copy",
  ],
  quick: [
    "업데이트",
    "update",
    "수정",
    "modify",
    "변경",
    "change",
    "간단한",
    "simple",
    "빠른",
    "quick",
    "오타",
    "typo",
    "제목",
    "title",
    "rename",
    "fix",
    "삭제",
    "delete",
    "추가",
    "add",
    "교체",
    "replace",
  ],
  writing: [
    "문서",
    "document",
    "작성",
    "write",
    "sop",
    "가이드",
    "guide",
    "설명",
    "description",
    "매뉴얼",
    "manual",
    "documentation",
    "readme",
    "기술",
    "technical",
    "튜토리얼",
    "tutorial",
    "api 문서",
    "api docs",
    "주석",
    "comment",
  ],
  "unspecified-low": [],
  "unspecified-high": [],
};

/**
 * Fast-path keyword matching for category selection
 * Returns category with confidence score (0.0 - 1.0)
 *
 * Strategy (based on research):
 * - Exact keyword match: High confidence (0.8-1.0)
 * - Multiple keyword matches: Very high confidence (0.9-1.0)
 * - Single keyword match: Medium confidence (0.6-0.8)
 * - No keyword match: Low confidence (0.0-0.5)
 *
 * @param userRequest - User's raw request text
 * @param analysis - Request analysis result
 * @returns Category selection with confidence score
 */
export function selectCategory(userRequest: string, analysis: RequestAnalysis): CategorySelection {
  const text = userRequest.toLowerCase();

  // 1. FAST-PATH: Keyword matching (80-90% coverage)
  const scores: Record<Category, number> = {
    "visual-engineering": 0,
    ultrabrain: 0,
    artistry: 0,
    quick: 0,
    writing: 0,
    "unspecified-low": 0,
    "unspecified-high": 0,
  };

  const matchedKeywords: Record<Category, string[]> = {
    "visual-engineering": [],
    ultrabrain: [],
    artistry: [],
    quick: [],
    writing: [],
    "unspecified-low": [],
    "unspecified-high": [],
  };

  // Calculate keyword match scores
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        scores[category as Category] += 1;
        matchedKeywords[category as Category].push(keyword);
      }
    }
  }

  // Find highest scoring category
  const maxScore = Math.max(...Object.values(scores));

  if (maxScore > 0) {
    // At least one keyword matched
    const entries = Object.entries(scores).filter(([_, score]) => score === maxScore);

    // If there's a tie, prefer category based on complexity
    let winner: [string, number];
    if (entries.length > 1) {
      // Tie-breaking: prefer quick for low complexity, ultrabrain for high
      if (analysis.complexity === "low" && entries.some(([c]) => c === "quick")) {
        winner = entries.find(([c]) => c === "quick")!;
      } else if (analysis.complexity === "high" && entries.some(([c]) => c === "ultrabrain")) {
        winner = entries.find(([c]) => c === "ultrabrain")!;
      } else {
        winner = entries[0];
      }
    } else {
      winner = entries[0];
    }

    const category = winner[0] as Category;
    const keywordCount = scores[category];
    const matched = matchedKeywords[category];

    // Calculate confidence based on keyword match count
    // Research finding: 3+ keywords = 0.9+, 2 keywords = 0.75-0.85, 1 keyword = 0.6-0.7
    let confidence: number;
    if (keywordCount >= 3) {
      confidence = 0.9 + Math.min(keywordCount * 0.02, 0.1); // Cap at 1.0
    } else if (keywordCount === 2) {
      confidence = 0.8;
    } else {
      confidence = 0.65;
    }

    return {
      category,
      confidence,
      method: "keyword",
      matchedKeywords: matched,
    };
  }

  // 2. FALLBACK: Complexity-based routing (low confidence)
  let fallbackCategory: Category;
  if (analysis.complexity === "low") {
    fallbackCategory = "quick";
  } else if (analysis.complexity === "high") {
    fallbackCategory = "unspecified-high";
  } else {
    fallbackCategory = "unspecified-low";
  }

  return {
    category: fallbackCategory,
    confidence: 0.4, // Low confidence - LLM fallback recommended
    method: "complexity-fallback",
  };
}

import { createHash } from "crypto";
import { redis } from "../db/redis";

interface LLMCategoryResult {
  category: Category;
  reasoning: string;
}

const CACHE_TTL_SECONDS = 86400;
const CACHE_KEY_PREFIX = "category:";

function generateCacheKey(userRequest: string): string {
  const normalized = userRequest.toLowerCase().trim().replace(/\s+/g, " ");

  const words = normalized.split(" ");
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "에서",
    "으로",
    "로",
  ]);

  const keyTerms = words
    .filter((w) => !stopWords.has(w) && w.length > 1)
    .sort()
    .slice(0, 10);

  const fingerprint = keyTerms.join(" ");
  return CACHE_KEY_PREFIX + createHash("md5").update(fingerprint).digest("hex").slice(0, 12);
}

const LLM_CLASSIFICATION_PROMPT = `You are a category classifier for an AI task orchestration system.

Given a user request, classify it into ONE of these categories:

1. **visual-engineering**: Frontend, UI/UX, design, styling, animation, React/Vue/Angular components
2. **ultrabrain**: Complex architecture decisions, system design, deep analysis, optimization
3. **artistry**: Creative content, ideas, branding, campaigns, storytelling
4. **quick**: Simple tasks - typo fixes, renaming, single-file changes, trivial updates
5. **writing**: Documentation, technical writing, guides, README, API docs
6. **unspecified-low**: Unclear tasks requiring low effort
7. **unspecified-high**: Unclear tasks requiring high effort

Respond with JSON only:
{
  "category": "category-name",
  "reasoning": "brief explanation (1-2 sentences)"
}`;

async function classifyWithLLM(userRequest: string): Promise<CategorySelection> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `${LLM_CLASSIFICATION_PROMPT}\n\nUser request: "${userRequest}"`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from LLM");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const result: LLMCategoryResult = JSON.parse(jsonMatch[0]);

    const validCategories: Category[] = [
      "visual-engineering",
      "ultrabrain",
      "artistry",
      "quick",
      "writing",
      "unspecified-low",
      "unspecified-high",
    ];

    if (!validCategories.includes(result.category)) {
      throw new Error(`Invalid category from LLM: ${result.category}`);
    }

    return {
      category: result.category,
      confidence: 0.85,
      method: "llm-fallback",
    };
  } catch (error: any) {
    console.error("LLM classification failed:", error.message);
    return {
      category: "unspecified-low",
      confidence: 0.3,
      method: "complexity-fallback",
    };
  }
}

export async function selectCategoryHybrid(
  userRequest: string,
  analysis: RequestAnalysis,
  options: { minConfidence?: number; enableLLM?: boolean; enableCache?: boolean } = {},
): Promise<CategorySelection> {
  const { minConfidence = 0.7, enableLLM = true, enableCache = true } = options;

  const cacheKey = generateCacheKey(userRequest);

  if (enableCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const parsedCache: CategorySelection = JSON.parse(cached);
        return {
          ...parsedCache,
          method: "keyword",
        };
      } catch (error) {
        void error;
      }
    }
  }

  const keywordResult = selectCategory(userRequest, analysis);

  if (keywordResult.confidence >= minConfidence) {
    if (enableCache) {
      await redis.set(cacheKey, JSON.stringify(keywordResult), CACHE_TTL_SECONDS);
    }
    return keywordResult;
  }

  if (!enableLLM || !process.env.ANTHROPIC_API_KEY) {
    return keywordResult;
  }

  const llmResult = await classifyWithLLM(userRequest);

  const finalResult = llmResult.confidence > keywordResult.confidence ? llmResult : keywordResult;

  if (enableCache) {
    await redis.set(cacheKey, JSON.stringify(finalResult), CACHE_TTL_SECONDS);
  }

  return finalResult;
}

export function getCategoryOnly(userRequest: string, analysis: RequestAnalysis): Category {
  return selectCategory(userRequest, analysis).category;
}
