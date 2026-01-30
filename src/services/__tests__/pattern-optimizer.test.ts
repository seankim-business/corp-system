/**
 * Pattern Optimizer Tests
 *
 * Tests for E3-T3 pattern-based response optimization
 */

import {
  getRelevantPatterns,
  applyPatternContext,
  shouldApplyPattern,
  getPatternApplicationStats,
  clearPatternCache,
} from "../pattern-optimizer";
import { CorrectionPattern } from "../prompt-improvement.service";

describe("Pattern Optimizer", () => {
  describe("shouldApplyPattern", () => {
    it("should return true for patterns with confidence > 0.8", () => {
      const pattern: CorrectionPattern = {
        id: "test-1",
        organizationId: "org-1",
        agentType: "test",
        patternType: "missing_info",
        description: "Test pattern",
        examples: [],
        frequency: 5,
        confidence: 0.85,
        createdAt: new Date(),
      };

      expect(shouldApplyPattern(pattern)).toBe(true);
    });

    it("should return false for patterns with confidence <= 0.8", () => {
      const pattern: CorrectionPattern = {
        id: "test-2",
        organizationId: "org-1",
        agentType: "test",
        patternType: "missing_info",
        description: "Test pattern",
        examples: [],
        frequency: 5,
        confidence: 0.75,
        createdAt: new Date(),
      };

      expect(shouldApplyPattern(pattern)).toBe(false);
    });
  });

  describe("applyPatternContext", () => {
    it("should not modify prompt if no patterns are applicable", () => {
      const basePrompt = "Write a function to add two numbers";
      const patterns: CorrectionPattern[] = [
        {
          id: "test-1",
          organizationId: "org-1",
          agentType: "test",
          patternType: "missing_info",
          description: "Test pattern",
          examples: [],
          frequency: 5,
          confidence: 0.75, // Below threshold
          createdAt: new Date(),
        },
      ];

      const result = applyPatternContext(basePrompt, patterns);

      expect(result.enhancedPrompt).toBe(basePrompt);
      expect(result.appliedPatterns).toHaveLength(0);
      expect(result.patternCount).toBe(0);
    });

    it("should prepend pattern context for high-confidence patterns", () => {
      const basePrompt = "Write a function to add two numbers";
      const patterns: CorrectionPattern[] = [
        {
          id: "test-1",
          organizationId: "org-1",
          agentType: "test",
          patternType: "missing_info",
          description: "Always include input validation and error handling",
          examples: [],
          frequency: 5,
          confidence: 0.90,
          createdAt: new Date(),
        },
      ];

      const result = applyPatternContext(basePrompt, patterns);

      expect(result.enhancedPrompt).toContain("LEARNED PATTERNS");
      expect(result.enhancedPrompt).toContain("missing_info");
      expect(result.enhancedPrompt).toContain("Always include input validation");
      expect(result.enhancedPrompt).toContain(basePrompt);
      expect(result.appliedPatterns).toHaveLength(1);
      expect(result.patternCount).toBe(1);
    });

    it("should handle multiple patterns", () => {
      const basePrompt = "Write a function";
      const patterns: CorrectionPattern[] = [
        {
          id: "test-1",
          organizationId: "org-1",
          agentType: "test",
          patternType: "missing_info",
          description: "Include validation",
          examples: [],
          frequency: 5,
          confidence: 0.85,
          createdAt: new Date(),
        },
        {
          id: "test-2",
          organizationId: "org-1",
          agentType: "test",
          patternType: "wrong_format",
          description: "Use TypeScript",
          examples: [],
          frequency: 3,
          confidence: 0.90,
          createdAt: new Date(),
        },
      ];

      const result = applyPatternContext(basePrompt, patterns);

      expect(result.enhancedPrompt).toContain("missing_info");
      expect(result.enhancedPrompt).toContain("wrong_format");
      expect(result.appliedPatterns).toHaveLength(2);
      expect(result.patternCount).toBe(2);
    });
  });

  describe("getPatternApplicationStats", () => {
    it("should return zero stats for organization with no patterns", async () => {
      const stats = await getPatternApplicationStats("non-existent-org");

      expect(stats.totalPatterns).toBe(0);
      expect(stats.highConfidencePatterns).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(Object.keys(stats.patternsByType)).toHaveLength(0);
    });
  });

  describe("clearPatternCache", () => {
    it("should clear cache without errors", () => {
      expect(() => clearPatternCache("org-1")).not.toThrow();
      expect(() => clearPatternCache("org-1", "agent-1")).not.toThrow();
    });
  });
});
