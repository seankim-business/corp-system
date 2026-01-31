import { describe, it, expect } from "@jest/globals";
import {
  estimateToolCost,
  recordToolUsage,
  checkBudgetLimit,
  TOOL_COST_ESTIMATES,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../cost";

describe("OMC Bridge Cost Tracking", () => {
  describe("estimateToolCost", () => {
    it("should use fixed estimates for known tools", () => {
      const estimate = estimateToolCost("lsp_hover");

      expect(estimate.strategy).toBe("fixed");
      expect(estimate.inputTokens).toBe(TOOL_COST_ESTIMATES.lsp_hover.input);
      expect(estimate.outputTokens).toBe(TOOL_COST_ESTIMATES.lsp_hover.output);
      expect(estimate.totalTokens).toBe(250);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });

    it("should estimate from response length for unknown tools", () => {
      const estimate = estimateToolCost("unknown_tool", {}, 1000);

      expect(estimate.strategy).toBe("response_length");
      expect(estimate.outputTokens).toBe(250); // 1000 chars / 4
      expect(estimate.inputTokens).toBe(50);
    });

    it("should use default estimates when no info available", () => {
      const estimate = estimateToolCost("unknown_tool");

      expect(estimate.strategy).toBe("fixed");
      expect(estimate.inputTokens).toBe(100);
      expect(estimate.outputTokens).toBe(500);
    });

    it("should calculate costs correctly for expensive tools", () => {
      const estimate = estimateToolCost("lsp_diagnostics_directory");

      expect(estimate.inputTokens).toBe(30);
      expect(estimate.outputTokens).toBe(2000);
      // Cost calculation: (30/1000 * 0.003) + (2000/1000 * 0.015) = 0.00009 + 0.03 = 0.03009
      expect(estimate.estimatedCost).toBeCloseTo(0.03009, 4);
    });
  });

  describe("recordToolUsage", () => {
    const mockContext: ToolExecutionContext = {
      organizationId: "org-123",
      userId: "user-456",
      sessionId: "session-789",
      toolName: "lsp_hover",
    };

    it("should use explicit token count when provided", () => {
      const estimate = estimateToolCost("lsp_hover");
      const result: ToolExecutionResult = {
        success: true,
        tokensUsed: 300,
      };

      const usage = recordToolUsage(mockContext, result, estimate);

      expect(usage.actualOutputTokens).toBe(300);
      expect(usage.actualInputTokens).toBe(estimate.inputTokens);
    });

    it("should estimate from response length when no explicit count", () => {
      const estimate = estimateToolCost("lsp_hover");
      const result: ToolExecutionResult = {
        success: true,
        response: "a".repeat(800), // 800 chars = ~200 tokens
      };

      const usage = recordToolUsage(mockContext, result, estimate);

      expect(usage.actualOutputTokens).toBe(200);
    });

    it("should fall back to estimate when no data available", () => {
      const estimate = estimateToolCost("lsp_hover");
      const result: ToolExecutionResult = {
        success: true,
      };

      const usage = recordToolUsage(mockContext, result, estimate);

      expect(usage.actualOutputTokens).toBe(estimate.outputTokens);
    });
  });

  describe("checkBudgetLimit", () => {
    it("should allow execution when no budget limit set", async () => {
      const result = await checkBudgetLimit("org-123", 0.05, 10.0, null);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should allow execution when within budget", async () => {
      const result = await checkBudgetLimit("org-123", 0.05, 10.0, 50.0);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should block execution when over budget", async () => {
      const result = await checkBudgetLimit("org-123", 0.05, 49.99, 50.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceed monthly budget limit");
    });

    it("should block execution when exactly at budget", async () => {
      const result = await checkBudgetLimit("org-123", 0.01, 50.0, 50.0);

      expect(result.allowed).toBe(false);
    });
  });

  describe("tool cost estimates", () => {
    it("should have reasonable estimates for all tools", () => {
      const tools = Object.entries(TOOL_COST_ESTIMATES);

      for (const [toolName, estimate] of tools) {
        expect(estimate.input).toBeGreaterThan(0);
        expect(estimate.output).toBeGreaterThan(0);
        expect(estimate.input).toBeLessThan(1000);

        // Diagnostics directory is the only tool allowed > 1000 output tokens
        if (toolName !== "lsp_diagnostics_directory") {
          expect(estimate.output).toBeLessThan(2000);
        }
      }
    });
  });
});
