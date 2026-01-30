import {
  orchestrateMultiAgent,
  shouldUseMultiAgent,
  getSuggestedAgents,
} from "../multi-agent-orchestrator";
import { decomposeTask } from "../task-decomposer";
import * as agentCoordinator from "../agent-coordinator";

jest.mock("../delegate-task", () => ({
  delegateTask: jest.fn().mockResolvedValue({
    output: "Mocked agent response",
    status: "success",
    metadata: {
      model: "claude-3-5-sonnet-20241022",
      duration: 1000,
    },
  }),
}));

jest.mock("../agent-coordinator", () => ({
  ...jest.requireActual("../agent-coordinator"),
  coordinateAgents: jest.fn(),
  coordinateParallel: jest.fn(),
  aggregateResults: jest.fn((results) => {
    const outputs = Array.from(results.values())
      .filter((r: any) => r.success)
      .map((r: any) => r.output)
      .join("\n\n");
    return outputs;
  }),
}));

jest.mock("../../db/client", () => ({
  db: {
    orchestratorExecution: {
      create: jest.fn().mockResolvedValue({ id: "mock-execution-id" }),
    },
  },
}));

describe("Multi-Agent Orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("shouldUseMultiAgent", () => {
    it("returns false for simple single-agent requests", () => {
      const result = shouldUseMultiAgent("find the latest sales report");
      expect(result).toBe(false);
    });

    it("returns true for complex multi-agent requests", () => {
      const result = shouldUseMultiAgent(
        "extract sales metrics from the database, create a formatted report, and send it to the team via Slack",
      );
      expect(result).toBe(true);
    });

    it("returns true for report generation with data extraction", () => {
      const result = shouldUseMultiAgent("create a weekly report using metrics from the database");
      expect(result).toBe(true);
    });
  });

  describe("getSuggestedAgents", () => {
    it("suggests data and report agents for report generation", () => {
      const agents = getSuggestedAgents("create a report with metrics from the database");
      expect(agents).toContain("data");
      expect(agents).toContain("report");
    });

    it("suggests data, report, and comms agents for distribution workflow", () => {
      const agents = getSuggestedAgents("send a weekly summary report to the team");
      expect(agents).toContain("data");
      expect(agents).toContain("report");
      expect(agents).toContain("comms");
    });

    it("suggests search and analytics agents for analysis tasks", () => {
      const agents = getSuggestedAgents("find and analyze performance trends");
      expect(agents).toContain("search");
      expect(agents).toContain("analytics");
    });
  });

  describe("decomposeTask", () => {
    it("decomposes report generation into data and report subtasks", () => {
      const result = decomposeTask("create a report with sales metrics");

      expect(result.requiresMultiAgent).toBe(true);
      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks[0].assignedAgent).toBe("data");
      expect(result.subtasks[1].assignedAgent).toBe("report");
      expect(result.subtasks[1].dependencies).toContain(result.subtasks[0].id);
    });

    it("identifies parallel execution opportunities", () => {
      const result = decomposeTask("update all project statuses");

      const firstGroup = result.suggestedParallelization[0];
      expect(firstGroup).toBeDefined();
      expect(firstGroup.length).toBeGreaterThan(0);
    });

    it("handles single-agent tasks correctly", () => {
      const result = decomposeTask("find the latest document");

      expect(result.requiresMultiAgent).toBe(false);
      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks[0].assignedAgent).toBe("search");
    });
  });

  describe("orchestrateMultiAgent", () => {
    it("executes single-agent for simple requests", async () => {
      const mockCoordinateAgents = jest
        .spyOn(agentCoordinator, "coordinateAgents")
        .mockResolvedValue(new Map());

      const result = await orchestrateMultiAgent({
        userRequest: "find a document",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
      });

      expect(result.status).toBe("success");
      expect(result.multiAgentMetadata?.executionMode).toBe("single");
      expect(mockCoordinateAgents).not.toHaveBeenCalled();
    });

    it("executes multi-agent coordination for complex requests", async () => {
      const mockResultsArray = [
        {
          agentId: "data" as const,
          success: true,
          output: "Extracted metrics: Revenue $1M",
          metadata: { duration: 500, model: "claude-3-5-sonnet-20241022" },
        },
        {
          agentId: "report" as const,
          success: true,
          output: "Report created successfully",
          metadata: { duration: 800, model: "claude-3-5-sonnet-20241022" },
        },
      ];

      const mockCoordinateParallel = jest
        .spyOn(agentCoordinator, "coordinateParallel")
        .mockResolvedValue(mockResultsArray);

      const result = await orchestrateMultiAgent({
        userRequest: "create a report with sales metrics from the database",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
      });

      expect(result.status).toBe("success");
      expect(result.multiAgentMetadata?.executionMode).toBe("parallel");
      expect(result.multiAgentMetadata?.agentsUsed).toContain("data");
      expect(result.multiAgentMetadata?.agentsUsed).toContain("report");
      expect(mockCoordinateParallel).toHaveBeenCalled();
    });

    it("executes parallel coordination when enabled", async () => {
      const mockResults = [
        {
          agentId: "data" as const,
          success: true,
          output: "Data extracted",
          metadata: { duration: 500, model: "claude-3-5-sonnet-20241022" },
        },
        {
          agentId: "task" as const,
          success: true,
          output: "Tasks updated",
          metadata: { duration: 500, model: "claude-3-5-sonnet-20241022" },
        },
      ];

      const mockCoordinateParallel = jest
        .spyOn(agentCoordinator, "coordinateParallel")
        .mockResolvedValue(mockResults);

      const result = await orchestrateMultiAgent({
        userRequest: "update all project metrics and task statuses",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
        enableParallel: true,
      });

      expect(result.status).toBe("success");
      expect(result.multiAgentMetadata?.executionMode).toBe("parallel");
      expect(mockCoordinateParallel).toHaveBeenCalled();
    });

    it("respects maxAgents limit", async () => {
      const mockCoordinateParallel = jest
        .spyOn(agentCoordinator, "coordinateParallel")
        .mockResolvedValue([]);

      await orchestrateMultiAgent({
        userRequest: "create weekly report and send notifications",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
        maxAgents: 2,
      });

      const call = mockCoordinateParallel.mock.calls[0];
      expect(call).toBeDefined();
      const tasks = call[0];
      expect(tasks.length).toBeLessThanOrEqual(2);
    });

    it("handles timeout correctly", async () => {
      const mockCoordinateParallel = jest
        .spyOn(agentCoordinator, "coordinateParallel")
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve([]), 10000),
            ),
        );

      const result = await orchestrateMultiAgent({
        userRequest: "create a complex multi-step report",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
        timeout: 100,
      });

      expect(result.status).toBe("failed");
      expect(result.output).toContain("timed out");
      mockCoordinateParallel.mockRestore();
    });
  });
});
