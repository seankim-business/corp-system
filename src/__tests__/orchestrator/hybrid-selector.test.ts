import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  selectHybridKeywordFast,
  selectHybrid,
  selectHybridWithBudget,
  _testing,
} from "../../orchestrator/hybrid-selector";
import { RequestAnalysis, Category, Skill } from "../../orchestrator/types";

// Mock dependencies
vi.mock("../../db/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

vi.mock("../../services/budget-enforcer", () => ({
  estimateCostForCategory: vi.fn().mockReturnValue(10),
  getBudgetRemaining: vi.fn().mockResolvedValue(1000),
}));

vi.mock("../../api/organization-settings", () => ({
  getOrganizationApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../utils/metrics", () => ({
  metrics: {
    increment: vi.fn(),
    timing: vi.fn(),
    histogram: vi.fn(),
  },
}));

describe("Hybrid Selector", () => {
  const mockAnalysis: RequestAnalysis = {
    intent: "general",
    entities: {},
    keywords: [],
    requiresMultiAgent: false,
    complexity: "medium",
  };

  describe("selectHybridKeywordFast", () => {
    it("should select visual-engineering category for UI request", () => {
      const result = selectHybridKeywordFast("Create a React component for the dashboard UI", mockAnalysis);

      expect(result.category).toBe("visual-engineering");
      expect(result.skills).toContain("frontend-ui-ux");
      expect(result.method).toBe("keyword-fast");
      expect(result.selectionTimeMs).toBeLessThan(100);
    });

    it("should select frontend-ui-ux skill for design keywords", () => {
      const result = selectHybridKeywordFast("디자인 컴포넌트 만들어줘", mockAnalysis);

      expect(result.category).toBe("visual-engineering");
      expect(result.skills).toContain("frontend-ui-ux");
    });

    it("should select git-master skill for git operations", () => {
      const result = selectHybridKeywordFast("커밋하고 푸시해줘", mockAnalysis);

      expect(result.skills).toContain("git-master");
    });

    it("should select mcp-integration skill for Notion requests", () => {
      const result = selectHybridKeywordFast("Create a task in Notion", mockAnalysis);

      expect(result.skills).toContain("mcp-integration");
    });

    it("should select playwright skill for screenshot requests", () => {
      const result = selectHybridKeywordFast("Take a screenshot of the webpage", mockAnalysis);

      expect(result.skills).toContain("playwright");
    });

    it("should detect visual-testing combination", () => {
      const result = selectHybridKeywordFast(
        "Create a React component and take a screenshot for testing",
        mockAnalysis,
      );

      expect(result.skills).toContain("frontend-ui-ux");
      expect(result.skills).toContain("playwright");
      expect(result.detectedCombinations.some((c) => c.label === "visual-testing")).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should return unspecified-low for vague requests", () => {
      const result = selectHybridKeywordFast("Help me with something", {
        ...mockAnalysis,
        complexity: "low",
      });

      expect(result.category).toBe("unspecified-low");
      expect(result.confidence).toBeLessThan(0.7);
    });

    it("should return unspecified-high for vague high-complexity requests", () => {
      const result = selectHybridKeywordFast("Help me with a complex task", {
        ...mockAnalysis,
        complexity: "high",
      });

      expect(result.category).toBe("unspecified-high");
    });

    it("should handle mixed Korean and English keywords", () => {
      const result = selectHybridKeywordFast("React 컴포넌트 디자인해줘", mockAnalysis);

      expect(result.category).toBe("visual-engineering");
      expect(result.skills).toContain("frontend-ui-ux");
    });
  });

  describe("Skill Combinations", () => {
    it("should detect frontend-ui-ux + playwright as visual-testing", () => {
      const { detectCombinations } = _testing;
      const skills: Skill[] = ["frontend-ui-ux", "playwright"];

      const combos = detectCombinations(skills);

      expect(combos).toHaveLength(1);
      expect(combos[0].label).toBe("visual-testing");
      expect(combos[0].confidenceBoost).toBe(0.15);
    });

    it("should detect mcp-integration + playwright as automated-workflow", () => {
      const { detectCombinations } = _testing;
      const skills: Skill[] = ["mcp-integration", "playwright"];

      const combos = detectCombinations(skills);

      expect(combos).toHaveLength(1);
      expect(combos[0].label).toBe("automated-workflow");
    });

    it("should return empty for non-combination skills", () => {
      const { detectCombinations } = _testing;
      const skills: Skill[] = ["git-master"];

      const combos = detectCombinations(skills);

      expect(combos).toHaveLength(0);
    });
  });

  describe("Conflict Detection", () => {
    it("should detect quick + frontend-ui-ux conflict", () => {
      const { detectAndResolveConflicts } = _testing;

      const result = detectAndResolveConflicts("quick", ["frontend-ui-ux"]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.category).toBe("visual-engineering"); // Upgraded from quick
    });

    it("should detect writing + playwright conflict", () => {
      const { detectAndResolveConflicts } = _testing;

      const result = detectAndResolveConflicts("writing", ["playwright"]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.skills).not.toContain("playwright"); // Removed
    });

    it("should not flag valid combinations", () => {
      const { detectAndResolveConflicts } = _testing;

      const result = detectAndResolveConflicts("visual-engineering", ["frontend-ui-ux", "playwright"]);

      expect(result.conflicts).toHaveLength(0);
      expect(result.skills).toContain("frontend-ui-ux");
      expect(result.skills).toContain("playwright");
    });
  });

  describe("Dependency Resolution", () => {
    it("should add suggested dependencies", () => {
      const { resolveDependencies } = _testing;

      const result = resolveDependencies(["frontend-ui-ux"]);

      expect(result.skills).toContain("frontend-ui-ux");
      expect(result.skills).toContain("playwright"); // Suggested dependency
      expect(result.fromDependency).toContain("playwright");
    });

    it("should not duplicate existing skills", () => {
      const { resolveDependencies } = _testing;

      const result = resolveDependencies(["frontend-ui-ux", "playwright"]);

      const playwrightCount = result.skills.filter((s) => s === "playwright").length;
      expect(playwrightCount).toBe(1);
      expect(result.fromDependency).not.toContain("playwright"); // Already present
    });
  });

  describe("Confidence Calculation", () => {
    it("should give high confidence for multiple keyword matches", () => {
      const { calculateCombinedConfidence } = _testing;

      const confidence = calculateCombinedConfidence(4, [2, 1.5], 0, "medium");

      expect(confidence).toBeGreaterThan(0.9);
    });

    it("should give low confidence for no matches", () => {
      const { calculateCombinedConfidence } = _testing;

      const confidence = calculateCombinedConfidence(0, [], 0, "low");

      expect(confidence).toBeLessThan(0.5);
    });

    it("should apply combination boost", () => {
      const { calculateCombinedConfidence } = _testing;

      const withoutBoost = calculateCombinedConfidence(2, [1], 0, "medium");
      const withBoost = calculateCombinedConfidence(2, [1], 0.15, "medium");

      expect(withBoost).toBeGreaterThan(withoutBoost);
    });
  });

  describe("Cache Key Generation", () => {
    it("should generate consistent keys for same input", () => {
      const { generateCacheKey } = _testing;

      const key1 = generateCacheKey("Create a React component");
      const key2 = generateCacheKey("Create a React component");

      expect(key1).toBe(key2);
    });

    it("should generate different keys for different input", () => {
      const { generateCacheKey } = _testing;

      const key1 = generateCacheKey("Create a React component");
      const key2 = generateCacheKey("Write documentation");

      expect(key1).not.toBe(key2);
    });

    it("should normalize whitespace", () => {
      const { generateCacheKey } = _testing;

      const key1 = generateCacheKey("Create React component");
      const key2 = generateCacheKey("  Create   React   component  ");

      expect(key1).toBe(key2);
    });
  });

  describe("selectHybrid", () => {
    it("should use keyword-fast method for high confidence", async () => {
      const result = await selectHybrid(
        "Create a React UI component with animations",
        mockAnalysis,
        { enableLLMFallback: false, enableCache: false },
      );

      expect(result.method).toBe("keyword-fast");
      expect(result.category).toBe("visual-engineering");
    });

    it("should return low confidence for vague requests", async () => {
      const result = await selectHybrid(
        "help me",
        { ...mockAnalysis, complexity: "low" },
        { enableLLMFallback: false, enableCache: false },
      );

      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe("selectHybridWithBudget", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should downgrade expensive category for low complexity", async () => {
      const result = await selectHybridWithBudget(
        "test-org",
        "architecture system", // Would normally be ultrabrain
        { ...mockAnalysis, complexity: "low" },
        { enableLLMFallback: false, enableCache: false },
      );

      expect(result.downgraded).toBe(true);
      expect(result.category).toBe("quick");
      expect(result.downgradeReason).toBe("low_complexity_override");
    });

    it("should preserve category for appropriate complexity", async () => {
      const result = await selectHybridWithBudget(
        "test-org",
        "Create a React UI component",
        { ...mockAnalysis, complexity: "medium" },
        { enableLLMFallback: false, enableCache: false },
      );

      expect(result.downgraded).toBe(false);
      expect(result.category).toBe("visual-engineering");
    });
  });

  describe("Performance", () => {
    it("should complete keyword-fast selection in under 10ms", () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        selectHybridKeywordFast("Create a React component for UI design", mockAnalysis);
      }

      const avgMs = (performance.now() - start) / iterations;
      expect(avgMs).toBeLessThan(10);
    });
  });
});
