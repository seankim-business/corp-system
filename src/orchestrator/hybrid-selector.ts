import {
  Category,
  Skill,
  RequestAnalysis,
  HybridSelection,
  HybridSelectionOptions,
  UnifiedKeyword,
  SkillCombination,
  CategorySkillConflict,
  HybridSkillScore,
  ResolvedConflict,
} from "./types";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";
import { createHash } from "crypto";
import { getBudgetRemaining } from "../services/budget-enforcer";
import { getOrganizationApiKey } from "../api/organization-settings";
import { metrics } from "../utils/metrics";

// ============================================
// UNIFIED KEYWORDS REGISTRY
// ============================================

/**
 * Unified keyword registry combining category and skill matching.
 * Each keyword maps to categories and/or skills with a weight.
 */
const UNIFIED_KEYWORDS: UnifiedKeyword[] = [
  // Frontend/UI keywords
  { term: "디자인", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "design", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "ui", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.5, language: "both" },
  { term: "ux", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.5, language: "both" },
  { term: "프론트엔드", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "frontend", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "react", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "both" },
  { term: "리액트", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "vue", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "both" },
  { term: "angular", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "both" },
  { term: "컴포넌트", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "component", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "css", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "both" },
  { term: "style", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "스타일", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "layout", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "레이아웃", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "animation", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "애니메이션", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },
  { term: "responsive", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "en" },
  { term: "반응형", categories: ["visual-engineering"], skills: ["frontend-ui-ux"], weight: 1.0, language: "ko" },

  // Git keywords
  { term: "커밋", categories: [], skills: ["git-master"], weight: 1.5, language: "ko" },
  { term: "commit", categories: [], skills: ["git-master"], weight: 1.5, language: "en" },
  { term: "git", categories: [], skills: ["git-master"], weight: 1.5, language: "both" },
  { term: "push", categories: [], skills: ["git-master"], weight: 1.0, language: "both" },
  { term: "pull", categories: [], skills: ["git-master"], weight: 1.0, language: "both" },
  { term: "리베이스", categories: [], skills: ["git-master"], weight: 1.0, language: "ko" },
  { term: "rebase", categories: [], skills: ["git-master"], weight: 1.0, language: "en" },
  { term: "merge", categories: [], skills: ["git-master"], weight: 1.0, language: "both" },
  { term: "머지", categories: [], skills: ["git-master"], weight: 1.0, language: "ko" },
  { term: "branch", categories: [], skills: ["git-master"], weight: 1.0, language: "en" },
  { term: "브랜치", categories: [], skills: ["git-master"], weight: 1.0, language: "ko" },
  { term: "conflict", categories: [], skills: ["git-master"], weight: 1.0, language: "en" },
  { term: "충돌", categories: [], skills: ["git-master"], weight: 1.0, language: "ko" },

  // MCP integration keywords
  { term: "task", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "en" },
  { term: "태스크", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "ko" },
  { term: "workflow", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "en" },
  { term: "워크플로우", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "ko" },
  { term: "notion", categories: [], skills: ["mcp-integration"], weight: 1.5, language: "both" },
  { term: "노션", categories: [], skills: ["mcp-integration"], weight: 1.5, language: "ko" },
  { term: "linear", categories: [], skills: ["mcp-integration"], weight: 1.5, language: "both" },
  { term: "jira", categories: [], skills: ["mcp-integration"], weight: 1.5, language: "both" },
  { term: "지라", categories: [], skills: ["mcp-integration"], weight: 1.5, language: "ko" },
  { term: "integration", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "en" },
  { term: "연동", categories: [], skills: ["mcp-integration"], weight: 1.0, language: "ko" },

  // Playwright keywords
  { term: "스크린샷", categories: [], skills: ["playwright"], weight: 1.5, language: "ko" },
  { term: "screenshot", categories: [], skills: ["playwright"], weight: 1.5, language: "en" },
  { term: "브라우저", categories: [], skills: ["playwright"], weight: 1.0, language: "ko" },
  { term: "browser", categories: [], skills: ["playwright"], weight: 1.0, language: "en" },
  { term: "웹페이지", categories: [], skills: ["playwright"], weight: 1.0, language: "ko" },
  { term: "webpage", categories: [], skills: ["playwright"], weight: 1.0, language: "en" },
  { term: "캡처", categories: [], skills: ["playwright"], weight: 1.0, language: "ko" },
  { term: "capture", categories: [], skills: ["playwright"], weight: 1.0, language: "en" },
  { term: "automation", categories: [], skills: ["playwright"], weight: 1.0, language: "en" },
  { term: "자동화", categories: [], skills: ["playwright"], weight: 1.0, language: "ko" },
  { term: "e2e", categories: [], skills: ["playwright"], weight: 1.5, language: "both" },
  { term: "end-to-end", categories: [], skills: ["playwright"], weight: 1.5, language: "en" },
  { term: "scrape", categories: [], skills: ["playwright"], weight: 1.0, language: "en" },
  { term: "크롤링", categories: [], skills: ["playwright"], weight: 1.0, language: "ko" },

  // Writing keywords
  { term: "문서", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "document", categories: ["writing"], skills: [], weight: 1.0, language: "en" },
  { term: "작성", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "write", categories: ["writing"], skills: [], weight: 1.0, language: "en" },
  { term: "sop", categories: ["writing"], skills: [], weight: 1.5, language: "both" },
  { term: "가이드", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "guide", categories: ["writing"], skills: [], weight: 1.0, language: "en" },
  { term: "매뉴얼", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "manual", categories: ["writing"], skills: [], weight: 1.0, language: "en" },
  { term: "documentation", categories: ["writing"], skills: [], weight: 1.5, language: "en" },
  { term: "readme", categories: ["writing"], skills: [], weight: 1.5, language: "both" },
  { term: "튜토리얼", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "tutorial", categories: ["writing"], skills: [], weight: 1.0, language: "en" },
  { term: "주석", categories: ["writing"], skills: [], weight: 1.0, language: "ko" },
  { term: "comment", categories: ["writing"], skills: [], weight: 1.0, language: "en" },

  // Architecture/ultrabrain keywords
  { term: "아키텍처", categories: ["ultrabrain"], skills: [], weight: 1.5, language: "ko" },
  { term: "architecture", categories: ["ultrabrain"], skills: [], weight: 1.5, language: "en" },
  { term: "최적화", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "optimization", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },
  { term: "설계", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "design pattern", categories: ["ultrabrain"], skills: [], weight: 1.5, language: "en" },
  { term: "리팩토링", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "refactor", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },
  { term: "성능", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "performance", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },
  { term: "확장성", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "scalability", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },
  { term: "마이그레이션", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "migration", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },
  { term: "시스템", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "ko" },
  { term: "system", categories: ["ultrabrain"], skills: [], weight: 1.0, language: "en" },

  // Quick task keywords
  { term: "업데이트", categories: ["quick"], skills: [], weight: 1.0, language: "ko" },
  { term: "update", categories: ["quick"], skills: [], weight: 1.0, language: "en" },
  { term: "수정", categories: ["quick"], skills: [], weight: 1.0, language: "ko" },
  { term: "modify", categories: ["quick"], skills: [], weight: 1.0, language: "en" },
  { term: "간단한", categories: ["quick"], skills: [], weight: 1.5, language: "ko" },
  { term: "simple", categories: ["quick"], skills: [], weight: 1.5, language: "en" },
  { term: "빠른", categories: ["quick"], skills: [], weight: 1.0, language: "ko" },
  { term: "quick", categories: ["quick"], skills: [], weight: 1.0, language: "en" },
  { term: "오타", categories: ["quick"], skills: [], weight: 1.5, language: "ko" },
  { term: "typo", categories: ["quick"], skills: [], weight: 1.5, language: "en" },
  { term: "rename", categories: ["quick"], skills: [], weight: 1.0, language: "en" },
  { term: "fix", categories: ["quick"], skills: [], weight: 1.0, language: "en" },

  // Artistry keywords
  { term: "창의적", categories: ["artistry"], skills: [], weight: 1.0, language: "ko" },
  { term: "creative", categories: ["artistry"], skills: [], weight: 1.0, language: "en" },
  { term: "아이디어", categories: ["artistry"], skills: [], weight: 1.0, language: "ko" },
  { term: "idea", categories: ["artistry"], skills: [], weight: 1.0, language: "en" },
  { term: "브랜드", categories: ["artistry"], skills: [], weight: 1.0, language: "ko" },
  { term: "brand", categories: ["artistry"], skills: [], weight: 1.0, language: "en" },
  { term: "콘텐츠", categories: ["artistry"], skills: [], weight: 1.0, language: "ko" },
  { term: "content", categories: ["artistry"], skills: [], weight: 1.0, language: "en" },
  { term: "스토리", categories: ["artistry"], skills: [], weight: 1.0, language: "ko" },
  { term: "story", categories: ["artistry"], skills: [], weight: 1.0, language: "en" },
];

// ============================================
// SKILL COMBINATIONS
// ============================================

/**
 * Synergistic skill pairs that create emergent behaviors
 */
const SKILL_COMBINATIONS: SkillCombination[] = [
  {
    skills: ["frontend-ui-ux", "playwright"],
    score: 1.5,
    label: "visual-testing",
    confidenceBoost: 0.15,
    emergentCategory: "visual-engineering",
  },
  {
    skills: ["mcp-integration", "playwright"],
    score: 1.3,
    label: "automated-workflow",
    confidenceBoost: 0.1,
  },
  {
    skills: ["git-master", "mcp-integration"],
    score: 1.2,
    label: "integrated-vcs",
    confidenceBoost: 0.05,
  },
];

// ============================================
// CATEGORY-SKILL CONFLICTS
// ============================================

/**
 * Incompatible category-skill combinations
 */
const CATEGORY_SKILL_CONFLICTS: CategorySkillConflict[] = [
  {
    category: "quick",
    skill: "frontend-ui-ux",
    skills: ["frontend-ui-ux", "playwright"],
    severity: "warn",
    resolution: "downgrade-category",
    reason: "Quick tasks should not involve complex UI or browser automation",
  },
  {
    category: "writing",
    skill: "playwright",
    skills: ["playwright"],
    severity: "warn",
    resolution: "remove-skills",
    reason: "Documentation tasks rarely need browser automation",
  },
];

// ============================================
// ENHANCED SKILL DEPENDENCIES
// ============================================

/**
 * Enhanced skill dependencies with 'requires' and 'suggests'
 */
const ENHANCED_SKILL_DEPENDENCIES: Record<Skill, { requires: Skill[]; suggests: Skill[] }> = {
  "frontend-ui-ux": {
    requires: [],
    suggests: ["playwright"],
  },
  playwright: {
    requires: [],
    suggests: [],
  },
  "git-master": {
    requires: [],
    suggests: [],
  },
  "mcp-integration": {
    requires: [],
    suggests: [],
  },
};

// ============================================
// SKILL PRIORITY (for sorting)
// ============================================

const SKILL_PRIORITY: Record<string, number> = {
  "git-master": 100,
  "mcp-integration": 80,
  "frontend-ui-ux": 60,
  playwright: 40,
};

// ============================================
// CACHING
// ============================================

const CACHE_TTL_SECONDS = 86400; // 24 hours
const CACHE_KEY_PREFIX = "hybrid:";

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

// ============================================
// HELPER FUNCTIONS
// ============================================

interface ScanResult {
  categoryScores: Map<Category, number>;
  skillScores: Map<Skill, number>;
  matchedKeywords: Map<string, string[]>;
}

/**
 * Single-pass keyword scan - optimized for speed
 * Target: <5ms execution time
 */
function scanKeywords(text: string): ScanResult {
  const lowerText = text.toLowerCase();

  const categoryScores = new Map<Category, number>();
  const skillScores = new Map<Skill, number>();
  const matchedKeywords = new Map<string, string[]>();

  // Initialize maps
  const allCategories: Category[] = [
    "visual-engineering",
    "ultrabrain",
    "artistry",
    "quick",
    "writing",
    "unspecified-low",
    "unspecified-high",
  ];
  const allSkills: Skill[] = ["playwright", "git-master", "frontend-ui-ux", "mcp-integration"];

  for (const cat of allCategories) {
    categoryScores.set(cat, 0);
    matchedKeywords.set(`category:${cat}`, []);
  }
  for (const skill of allSkills) {
    skillScores.set(skill, 0);
    matchedKeywords.set(`skill:${skill}`, []);
  }

  // Single pass through all keywords
  for (const kw of UNIFIED_KEYWORDS) {
    if (lowerText.includes(kw.term)) {
      // Update category scores
      if (kw.categories) {
        for (const cat of kw.categories) {
          const current = categoryScores.get(cat) || 0;
          categoryScores.set(cat, current + kw.weight);
          const catKeywords = matchedKeywords.get(`category:${cat}`) || [];
          catKeywords.push(kw.term);
          matchedKeywords.set(`category:${cat}`, catKeywords);
        }
      }

      // Update skill scores
      if (kw.skills) {
        for (const skill of kw.skills) {
            const current = skillScores.get(skill) || 0;
          skillScores.set(skill, current + kw.weight);
          const skillKeywords = matchedKeywords.get(`skill:${skill}`) || [];
          skillKeywords.push(kw.term);
          matchedKeywords.set(`skill:${skill}`, skillKeywords);
        }
      }
    }
  }

  return { categoryScores, skillScores, matchedKeywords };
}

/**
 * Calculate combined confidence score
 */
function calculateCombinedConfidence(
  categoryScore: number,
  skillScores: number[],
  combinationBoost: number,
  complexity: "low" | "medium" | "high",
): number {
  // Base confidence from category score
  let confidence: number;
  if (categoryScore >= 4) {
    confidence = 0.95;
  } else if (categoryScore >= 3) {
    confidence = 0.9;
  } else if (categoryScore >= 2) {
    confidence = 0.8;
  } else if (categoryScore >= 1) {
    confidence = 0.65;
  } else {
    confidence = 0.4;
  }

  // Boost from skill matches
  const avgSkillScore = skillScores.length > 0 ? skillScores.reduce((a, b) => a + b, 0) / skillScores.length : 0;

  if (avgSkillScore >= 2) {
    confidence = Math.min(confidence + 0.1, 1.0);
  } else if (avgSkillScore >= 1) {
    confidence = Math.min(confidence + 0.05, 1.0);
  }

  // Combination boost
  confidence = Math.min(confidence + combinationBoost, 1.0);

  // Complexity adjustment
  if (complexity === "high" && confidence > 0.5) {
    // High complexity tasks get slight confidence boost for ultrabrain detection
    confidence = Math.min(confidence + 0.05, 1.0);
  }

  return confidence;
}

/**
 * Detect skill combinations from selected skills
 */
function detectCombinations(skills: Skill[]): SkillCombination[] {
  const detected: SkillCombination[] = [];
  const skillSet = new Set(skills);

  for (const combo of SKILL_COMBINATIONS) {
    if (combo.skills.every((s) => skillSet.has(s))) {
      detected.push(combo);
    }
  }

  return detected;
}

/**
 * Detect and resolve conflicts between category and skills
 */
function detectAndResolveConflicts(
  category: Category,
  skills: Skill[],
): { skills: Skill[]; category: Category; conflicts: ResolvedConflict[] } {
  const conflicts: ResolvedConflict[] = [];
  let resolvedSkills = [...skills];
  let resolvedCategory = category;

  for (const conflict of CATEGORY_SKILL_CONFLICTS) {
    if (conflict.category !== category) continue;

    const conflictingSkills = skills.filter((s) => conflict.skills?.includes(s) ?? false);
    if (conflictingSkills.length === 0) continue;

    // We have a conflict
    let action = "";

    switch (conflict.resolution) {
      case "downgrade-category":
        // Change category to allow the skills
        if (category === "quick") {
          resolvedCategory = "visual-engineering";
          action = `Upgraded category from 'quick' to 'visual-engineering' to accommodate ${conflictingSkills.join(", ")}`;
        }
        break;

      case "remove-skills":
        resolvedSkills = resolvedSkills.filter((s) => !conflict.skills?.includes(s));
        action = `Removed conflicting skills: ${conflictingSkills.join(", ")}`;
        break;

      case "reject":
        // Log warning but don't change anything
        action = `Conflict detected but not resolved: ${conflict.reason}`;
        break;
    }

    conflicts.push({
      conflict,
      resolution: conflict.resolution || "category",
      reason: action,
    });

    if (conflict.severity === "warn") {
      logger.warn("Category-skill conflict detected", {
        category,
        conflictingSkills,
        resolution: conflict.resolution,
        action,
      });
    }
  }

  return { skills: resolvedSkills, category: resolvedCategory, conflicts };
}

/**
 * Resolve skill dependencies
 */
function resolveDependencies(skills: Skill[]): { skills: Skill[]; fromDependency: Skill[] } {
  const resolved = new Set<Skill>(skills);
  const fromDependency: Skill[] = [];

  for (const skill of skills) {
    const deps = ENHANCED_SKILL_DEPENDENCIES[skill];
    if (!deps) continue;

    // Add required dependencies
    for (const required of deps.requires) {
      if (!resolved.has(required)) {
        resolved.add(required);
        fromDependency.push(required);
      }
    }

    // Add suggested dependencies (only if not already present)
    for (const suggested of deps.suggests) {
      if (!resolved.has(suggested)) {
        resolved.add(suggested);
        fromDependency.push(suggested);
      }
    }
  }

  return { skills: Array.from(resolved), fromDependency };
}

/**
 * Sort skills by priority
 */
function sortByPriority(skills: Skill[]): Skill[] {
  return skills.sort((a, b) => {
    const priorityA = SKILL_PRIORITY[a] || 0;
    const priorityB = SKILL_PRIORITY[b] || 0;
    return priorityB - priorityA;
  });
}

// ============================================
// LLM FALLBACK
// ============================================

interface LLMHybridResult {
  category: Category;
  skills: Skill[];
  reasoning: string;
}

const LLM_HYBRID_CLASSIFICATION_PROMPT = `You are a classifier for an AI task orchestration system.

Given a user request, classify BOTH the category AND relevant skills.

## Categories (choose ONE):
1. **visual-engineering**: Frontend, UI/UX, design, styling, animation, React/Vue/Angular
2. **ultrabrain**: Complex architecture, system design, deep analysis, optimization
3. **artistry**: Creative content, ideas, branding, campaigns, storytelling
4. **quick**: Simple tasks - typo fixes, renaming, single-file changes
5. **writing**: Documentation, technical writing, guides, README
6. **unspecified-low**: Unclear tasks requiring low effort
7. **unspecified-high**: Unclear tasks requiring high effort

## Skills (choose ZERO or MORE):
- **playwright**: Browser automation, screenshots, e2e testing, web scraping
- **git-master**: Git operations, commits, branches, merges, rebasing
- **frontend-ui-ux**: UI components, styling, responsive design, animations
- **mcp-integration**: Task management tools (Notion, Linear, Jira), workflow automation

Respond with JSON only:
{
  "category": "category-name",
  "skills": ["skill1", "skill2"],
  "reasoning": "brief explanation (1-2 sentences)"
}`;

async function classifyWithLLM(userRequest: string, organizationId?: string): Promise<LLMHybridResult | null> {
  try {
    let apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey && organizationId) {
      apiKey = (await getOrganizationApiKey(organizationId, "anthropicApiKey")) || undefined;
    }

    if (!apiKey) {
      logger.debug("No API key available for LLM hybrid classification");
      return null;
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `${LLM_HYBRID_CLASSIFICATION_PROMPT}\n\nUser request: "${userRequest}"`,
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

    const result = JSON.parse(jsonMatch[0]) as LLMHybridResult;

    // Validate category
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

    // Validate skills
    const validSkills: Skill[] = [
      "playwright",
      "git-master",
      "frontend-ui-ux",
      "mcp-integration",
    ];
    result.skills = result.skills.filter((s: Skill) => validSkills.includes(s));

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("LLM hybrid classification failed", { error: message });
    return null;
  }
}

// ============================================
// MAIN SELECTION FUNCTIONS
// ============================================

/**
 * Fast-path keyword matching (synchronous, target <5ms)
 */
export function selectHybridKeywordFast(
  userRequest: string,
  analysis: RequestAnalysis,
  options?: Omit<HybridSelectionOptions, "enableLLMFallback">,
): HybridSelection {
  const startTime = performance.now();

  const {
    minSkillScore = 1,
    enableCombinationDetection = true,
    enableConflictDetection = true,
  } = options || {};

  // Single-pass keyword scan
  const { categoryScores, skillScores, matchedKeywords } = scanKeywords(userRequest);

  // Find winning category
  let maxCategoryScore = 0;
  let winningCategory: Category = "unspecified-low";
  const categoryKeywords: string[] = [];

  for (const [cat, score] of Array.from(categoryScores.entries())) {
    if (score > maxCategoryScore) {
      maxCategoryScore = score;
      winningCategory = cat;
    }
  }

  if (maxCategoryScore > 0) {
    categoryKeywords.push(...(matchedKeywords.get(`category:${winningCategory}`) || []));
  } else {
    // Fallback to complexity-based category
    if (analysis.complexity === "high") {
      winningCategory = "unspecified-high";
    } else {
      winningCategory = "unspecified-low";
    }
  }

  // Collect skills meeting threshold
  const selectedSkills: Skill[] = [];
  const skillScoreDetails: HybridSkillScore[] = [];

  for (const [skill, score] of Array.from(skillScores.entries())) {
    if (score >= minSkillScore) {
      selectedSkills.push(skill);
      skillScoreDetails.push({
        skill,
        score,
        reasons: [`Matched keywords: ${matchedKeywords.get(`skill:${skill}`)?.join(", ") || "none"}`],
        matchedKeywords: matchedKeywords.get(`skill:${skill}`) || [],
        fromDependency: false,
      });
    }
  }

  // Resolve dependencies
  const { skills: withDeps, fromDependency } = resolveDependencies(selectedSkills);
  for (const depSkill of fromDependency) {
    skillScoreDetails.push({
      skill: depSkill,
      score: 0,
      reasons: ["Added as dependency"],
      matchedKeywords: [],
      fromDependency: true,
    });
  }

  // Detect combinations
  let detectedCombinations: SkillCombination[] = [];
  let combinationBoost = 0;

  if (enableCombinationDetection) {
    detectedCombinations = detectCombinations(withDeps);
    combinationBoost = detectedCombinations.reduce((sum, c) => sum + (c.confidenceBoost ?? 0), 0);

    // Apply emergent category if applicable
    for (const combo of detectedCombinations) {
      if (combo.emergentCategory && maxCategoryScore < 2) {
        winningCategory = combo.emergentCategory;
        break;
      }
    }
  }

  // Detect and resolve conflicts
  let resolvedSkills = withDeps;
  let resolvedCategory = winningCategory;

  if (enableConflictDetection) {
    const conflictResult = detectAndResolveConflicts(winningCategory, withDeps);
    resolvedSkills = conflictResult.skills;
    resolvedCategory = conflictResult.category;
  }

  // Sort by priority
  resolvedSkills = sortByPriority(resolvedSkills);

  // Calculate confidence
  const skillScoreValues = skillScoreDetails.filter((s) => !s.fromDependency).map((s) => s.score);
  const confidence = calculateCombinedConfidence(
    maxCategoryScore,
    skillScoreValues,
    combinationBoost,
    analysis.complexity,
  );

  const selectionTimeMs = performance.now() - startTime;

  // Record metrics
  metrics.increment("hybrid_selection_total", { method: "keyword-fast" });
  metrics.timing("hybrid_selection_duration_ms", selectionTimeMs, { method: "keyword-fast" });

  return {
    category: resolvedCategory,
    skills: resolvedSkills,
    confidence,
    reasoning: `Keyword-based selection with ${resolvedSkills.length} skills`,
    method: "keyword-fast",
    selectionTimeMs,
  };
}

/**
 * LLM fallback for ambiguous cases
 */
export async function selectHybridWithLLM(
  userRequest: string,
  _analysis: RequestAnalysis,
  keywordResult: HybridSelection,
  organizationId?: string,
): Promise<HybridSelection> {
  const startTime = performance.now();

  const llmResult = await classifyWithLLM(userRequest, organizationId);

  if (!llmResult) {
    // LLM failed, return keyword result
    return {
      ...keywordResult,
      method: "keyword-fast",
    };
  }

  // Merge LLM result with keyword result
  let category = llmResult.category;
  let skills = llmResult.skills;

  // Resolve dependencies for LLM-selected skills
  const { skills: withDeps } = resolveDependencies(skills);
  skills = sortByPriority(withDeps);

  // Build skill scores (not used but kept for consistency)
  // const skillScores: HybridSkillScore[] = skills.map((skill) => ({
  //   skill,
  //   score: fromDependency.includes(skill) ? 0 : 1,
  //   reasons: fromDependency.includes(skill) ? ["Added as dependency"] : ["LLM-selected"],
  //   matchedKeywords: [],
  //   fromDependency: fromDependency.includes(skill),
  // }));

  // Detect combinations
  const detectedCombinations = detectCombinations(skills);
  const combinationBoost = detectedCombinations.reduce((sum, c) => sum + (c.confidenceBoost ?? 0), 0);

  // Apply emergent category
  for (const combo of detectedCombinations) {
    if (combo.emergentCategory) {
      category = combo.emergentCategory;
      break;
    }
  }

  // Detect and resolve conflicts
  const { skills: resolvedSkills, category: resolvedCategory } = detectAndResolveConflicts(category, skills);

  // LLM has higher base confidence
  const confidence = Math.min(0.85 + combinationBoost, 1.0);

  const totalTimeMs = performance.now() - startTime + (keywordResult.selectionTimeMs ?? 0);

  // Record metrics
  metrics.increment("hybrid_selection_total", { method: "keyword-llm-hybrid" });
  metrics.timing("hybrid_selection_duration_ms", totalTimeMs, { method: "keyword-llm-hybrid" });

  return {
    category: resolvedCategory,
    skills: sortByPriority(resolvedSkills),
    confidence,
    reasoning: `LLM-based classification with ${detectedCombinations.length} skill combinations`,
    method: "keyword-llm-hybrid",
    selectionTimeMs: totalTimeMs,
  };
}

/**
 * Main entry point for hybrid selection
 */
export async function selectHybrid(
  userRequest: string,
  analysis: RequestAnalysis,
  options?: HybridSelectionOptions,
): Promise<HybridSelection> {
  const {
    minKeywordConfidence = 0.7,
    enableLLMFallback = true,
    enableCache = true,
    organizationId,
    maxSelectionTimeMs = 5000,
  } = options || {};

  const cacheKey = generateCacheKey(userRequest);

  // Check cache
  if (enableCache) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsedCache: HybridSelection = JSON.parse(cached);
        metrics.increment("hybrid_selection_cache_hits");
        return parsedCache;
      }
      metrics.increment("hybrid_selection_cache_misses");
    } catch (error) {
      // Cache error, continue without cache
      logger.debug("Hybrid selection cache error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fast-path keyword matching
  const keywordResult = selectHybridKeywordFast(userRequest, analysis, options);

  // Check if we have high enough confidence
  if (keywordResult.confidence >= minKeywordConfidence) {
    // High confidence - cache and return
    if (enableCache) {
      await redis.set(cacheKey, JSON.stringify(keywordResult), CACHE_TTL_SECONDS);
    }
    return keywordResult;
  }

  // Low confidence - check if we should use LLM fallback
  let hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasApiKey && organizationId) {
    const dbKey = await getOrganizationApiKey(organizationId, "anthropicApiKey");
    hasApiKey = !!dbKey;
  }

  if (!enableLLMFallback || !hasApiKey) {
    // No LLM fallback available
    if (enableCache) {
      await redis.set(cacheKey, JSON.stringify(keywordResult), CACHE_TTL_SECONDS);
    }
    return keywordResult;
  }

  // Check if we have time for LLM fallback
  if ((keywordResult.selectionTimeMs ?? 0) > maxSelectionTimeMs * 0.8) {
    // Already spent 80% of time budget
    logger.debug("Skipping LLM fallback due to time budget", {
      elapsedMs: keywordResult.selectionTimeMs ?? 0,
      maxMs: maxSelectionTimeMs,
    });
    if (enableCache) {
      await redis.set(cacheKey, JSON.stringify(keywordResult), CACHE_TTL_SECONDS);
    }
    return keywordResult;
  }

  // Use LLM fallback
  const llmResult = await selectHybridWithLLM(userRequest, analysis, keywordResult, organizationId);

  // Cache the result
  if (enableCache) {
    await redis.set(cacheKey, JSON.stringify(llmResult), CACHE_TTL_SECONDS);
  }

  return llmResult;
}

/**
 * Budget-aware wrapper for hybrid selection
 */
export async function selectHybridWithBudget(
  organizationId: string,
  userRequest: string,
  analysis: RequestAnalysis,
  options?: HybridSelectionOptions,
): Promise<HybridSelection> {
  const baseSelection = await selectHybrid(userRequest, analysis, {
    ...options,
    organizationId,
  });

  // const estimatedCost = estimateCostForCategory(baseSelection.category);
  const budgetRemaining = await getBudgetRemaining(organizationId);

  const OPUS_THRESHOLD = 100; // cents ($1.00)
  const SONNET_THRESHOLD = 20; // cents ($0.20)
  const EXPENSIVE_CATEGORIES: Category[] = ["ultrabrain", "artistry", "visual-engineering"];

  let category = baseSelection.category;
  let downgraded = false;

  // COMPLEXITY OVERRIDE: Downgrade expensive categories for low-complexity tasks
  if (analysis.complexity === "low" && EXPENSIVE_CATEGORIES.includes(baseSelection.category)) {
    category = "quick";
    downgraded = true;
  }

  // BUDGET ENFORCEMENT: Downgrade based on remaining budget
  if (Number.isFinite(budgetRemaining) && !downgraded) {
    if (budgetRemaining < OPUS_THRESHOLD && baseSelection.category === "ultrabrain") {
      category = "quick";
      downgraded = true;
    }

    if (
      budgetRemaining < SONNET_THRESHOLD &&
      ["visual-engineering", "writing", "artistry"].includes(baseSelection.category)
    ) {
      category = "quick";
      downgraded = true;
    }
  }

  return {
    ...baseSelection,
    category,
    baseCategory: baseSelection.category,
    downgraded,
  };
}

// ============================================
// EXPORTS FOR TESTING
// ============================================

export const _testing = {
  UNIFIED_KEYWORDS,
  SKILL_COMBINATIONS,
  CATEGORY_SKILL_CONFLICTS,
  ENHANCED_SKILL_DEPENDENCIES,
  scanKeywords,
  calculateCombinedConfidence,
  detectCombinations,
  detectAndResolveConflicts,
  resolveDependencies,
  generateCacheKey,
};
