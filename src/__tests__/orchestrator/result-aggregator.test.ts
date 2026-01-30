import {
  aggregateResults,
  generateSummary,
  AgentResult,
} from "../../orchestrator/result-aggregator";

describe("result-aggregator", () => {
  describe("weighted_merge strategy", () => {
    it("should apply weighted average to numeric fields", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { score: 100, count: 10 },
          durationMs: 100,
          confidence: 0.8,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: true,
          data: { score: 50, count: 20 },
          durationMs: 150,
          confidence: 0.2,
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("weighted_merge");
      expect(result.sourceCount).toBe(2);

      const data = result.data as Record<string, number>;
      // Weights: 0.8/1.0 = 0.8, 0.2/1.0 = 0.2
      // score: 100 * 0.8 + 50 * 0.2 = 80 + 10 = 90
      expect(data.score).toBeCloseTo(90);
      // count: 10 * 0.8 + 20 * 0.2 = 8 + 4 = 12
      expect(data.count).toBeCloseTo(12);
    });

    it("should use highest confidence value for text fields", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { message: "High confidence message", priority: 1 },
          durationMs: 100,
          confidence: 0.9,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: true,
          data: { message: "Low confidence message", priority: 2 },
          durationMs: 150,
          confidence: 0.1,
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // Text field should use highest confidence value (agent1)
      expect(data.message).toBe("High confidence message");
      // Numeric field should be weighted average
      // 1 * 0.9 + 2 * 0.1 = 0.9 + 0.2 = 1.1
      expect(data.priority).toBeCloseTo(1.1);
    });

    it("should handle mixed numeric and text fields correctly", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { name: "Alice", age: 30, score: 85.5 },
          durationMs: 100,
          confidence: 0.6,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: true,
          data: { name: "Bob", age: 25, score: 90.0 },
          durationMs: 150,
          confidence: 0.4,
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      const data = result.data as Record<string, unknown>;
      // Text field uses highest confidence (agent1 with 0.6)
      expect(data.name).toBe("Alice");
      // Numeric fields: weighted average
      // age: 30 * 0.6 + 25 * 0.4 = 18 + 10 = 28
      expect(data.age).toBeCloseTo(28);
      // score: 85.5 * 0.6 + 90.0 * 0.4 = 51.3 + 36 = 87.3
      expect(data.score).toBeCloseTo(87.3);
    });

    it("should normalize confidence scores to sum to 1", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { value: 100 },
          durationMs: 100,
          confidence: 0.3,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: true,
          data: { value: 200 },
          durationMs: 150,
          confidence: 0.7,
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      const data = result.data as Record<string, number>;
      // Total confidence = 1.0, so weights are already normalized
      // value: 100 * 0.3 + 200 * 0.7 = 30 + 140 = 170
      expect(data.value).toBeCloseTo(170);
    });

    it("should handle single successful result", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { message: "Only result", value: 42 },
          durationMs: 100,
          confidence: 0.7,
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.message).toBe("Only result");
      expect(data.value).toBe(42);
      expect(result.confidence).toBe(0.7);
    });

    it("should return failure when no successful results", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: false,
          data: null,
          durationMs: 100,
          confidence: 0.1,
          error: "Failed",
        },
      ];

      const result = aggregateResults(results, "weighted_merge");

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("should handle empty results gracefully", () => {
      const results: AgentResult[] = [];

      const result = aggregateResults(results, "weighted_merge");

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.sourceCount).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe("generateSummary", () => {
    it("should generate readable summary for successful results", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { field1: "value1", field2: "value2", field3: "value3" },
          durationMs: 100,
          confidence: 0.9,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: true,
          data: { field1: "value1" },
          durationMs: 150,
          confidence: 0.8,
        },
      ];

      const summary = generateSummary(results);

      expect(summary).toContain("2 agents");
      expect(summary).toContain("All agents completed successfully");
      expect(summary).toContain("high confidence");
      expect(summary).toContain("85%");
      expect(summary).toContain("3 key findings");
    });

    it("should generate summary for mixed success/failure", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: { result: "success" },
          durationMs: 100,
          confidence: 0.7,
        },
        {
          agentId: "agent2",
          skillId: "skill2",
          success: false,
          data: null,
          durationMs: 150,
          confidence: 0.3,
          error: "Failed",
        },
      ];

      const summary = generateSummary(results);

      expect(summary).toContain("2 agents");
      expect(summary).toContain("1 succeeded, 1 failed");
      expect(summary).toContain("moderate");
      expect(summary).toContain("50%");
    });

    it("should generate summary for all failures", () => {
      const results: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: false,
          data: null,
          durationMs: 100,
          confidence: 0.2,
          error: "Failed",
        },
      ];

      const summary = generateSummary(results);

      expect(summary).toContain("1 agent");
      expect(summary).toContain("All agents failed");
      expect(summary).toContain("low confidence");
      expect(summary).toContain("20%");
    });

    it("should handle empty results", () => {
      const results: AgentResult[] = [];

      const summary = generateSummary(results);

      expect(summary).toBe("No agent results to summarize.");
    });

    it("should classify confidence levels correctly", () => {
      const highConfidence: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: {},
          durationMs: 100,
          confidence: 0.85,
        },
      ];

      const moderateConfidence: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: {},
          durationMs: 100,
          confidence: 0.65,
        },
      ];

      const lowConfidence: AgentResult[] = [
        {
          agentId: "agent1",
          skillId: "skill1",
          success: true,
          data: {},
          durationMs: 100,
          confidence: 0.3,
        },
      ];

      expect(generateSummary(highConfidence)).toContain("high confidence");
      expect(generateSummary(moderateConfidence)).toContain("moderate confidence");
      expect(generateSummary(lowConfidence)).toContain("low confidence");
    });
  });
});
