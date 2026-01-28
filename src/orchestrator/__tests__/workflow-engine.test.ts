import { WorkflowEngine } from "../workflow-engine";
import { WorkflowExecutor } from "../workflow-executor";
import { WorkflowDefinition, WorkflowContext, WorkflowDefinitionSchema } from "../workflow-types";

jest.mock("../delegate-task", () => ({
  delegateTask: jest.fn().mockResolvedValue({
    output: "Mock agent response",
    status: "success",
    metadata: {
      model: "mock-model",
      inputTokens: 100,
      outputTokens: 50,
    },
  }),
}));

jest.mock("../../services/approval-checker", () => ({
  createApprovalRequest: jest.fn().mockResolvedValue("mock-approval-id"),
  ApprovalType: {
    CONTENT: "content",
    PRODUCT_LAUNCH: "product_launch",
  },
}));

jest.mock("../agent-registry", () => ({
  agentRegistry: {
    getAgent: jest.fn().mockReturnValue({
      category: "quick",
      skills: ["mcp-integration"],
      systemPrompt: "Mock agent prompt",
    }),
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../utils/metrics", () => ({
  metrics: {
    increment: jest.fn(),
    timing: jest.fn(),
    histogram: jest.fn(),
  },
}));

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  describe("WorkflowDefinition Schema Validation", () => {
    it("should validate a valid workflow definition", () => {
      const validWorkflow = {
        name: "test-workflow",
        nodes: [{ id: "start", type: "agent" as const, agentId: "test-agent" }],
        edges: [
          { from: "START", to: "start" },
          { from: "start", to: "END" },
        ],
      };

      const result = WorkflowDefinitionSchema.safeParse(validWorkflow);
      expect(result.success).toBe(true);
    });

    it("should reject invalid workflow definition", () => {
      const invalidWorkflow = {
        nodes: [],
      };

      const result = WorkflowDefinitionSchema.safeParse(invalidWorkflow);
      expect(result.success).toBe(false);
    });

    it("should validate all node types", () => {
      const workflowWithAllTypes = {
        name: "all-types",
        nodes: [
          { id: "n1", type: "agent" as const, agentId: "agent-1" },
          { id: "n2", type: "parallel" as const, parallelAgents: ["a1", "a2"] },
          { id: "n3", type: "condition" as const, condition: "context.variables.flag" },
          { id: "n4", type: "human_approval" as const, approvalType: "content" },
        ],
        edges: [],
      };

      const result = WorkflowDefinitionSchema.safeParse(workflowWithAllTypes);
      expect(result.success).toBe(true);
    });
  });

  describe("createContext", () => {
    it("should create a valid workflow context", () => {
      const context = engine.createContext("test-workflow", {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        initialVariables: { key: "value" },
      });

      expect(context.organizationId).toBe("org-123");
      expect(context.userId).toBe("user-456");
      expect(context.sessionId).toBe("session-789");
      expect(context.variables).toEqual({ key: "value" });
      expect(context.currentNode).toBe("START");
      expect(context.status).toBe("pending");
      expect(context.startedAt).toBeInstanceOf(Date);
    });

    it("should default to empty variables", () => {
      const context = engine.createContext("test", {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
      });

      expect(context.variables).toEqual({});
    });
  });

  describe("evaluateCondition", () => {
    it("should evaluate simple boolean condition", () => {
      const context: WorkflowContext = {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        variables: { flag: true },
        nodeResults: {},
        currentNode: "test",
        status: "running",
        startedAt: new Date(),
      };

      expect(engine.evaluateCondition("context.variables.flag === true", context)).toBe(true);
      expect(engine.evaluateCondition("context.variables.flag === false", context)).toBe(false);
    });

    it("should evaluate comparison conditions", () => {
      const context: WorkflowContext = {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        variables: { count: 10 },
        nodeResults: {},
        currentNode: "test",
        status: "running",
        startedAt: new Date(),
      };

      expect(engine.evaluateCondition("context.variables.count > 5", context)).toBe(true);
      expect(engine.evaluateCondition("context.variables.count < 5", context)).toBe(false);
    });

    it("should handle invalid conditions gracefully", () => {
      const context: WorkflowContext = {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        variables: {},
        nodeResults: {},
        currentNode: "test",
        status: "running",
        startedAt: new Date(),
      };

      expect(engine.evaluateCondition("invalid syntax {{", context)).toBe(false);
    });
  });

  describe("getNextNodes", () => {
    const workflow: WorkflowDefinition = {
      name: "test",
      nodes: [
        { id: "node1", type: "agent", agentId: "agent-1" },
        { id: "node2", type: "agent", agentId: "agent-2" },
        { id: "node3", type: "agent", agentId: "agent-3" },
      ],
      edges: [
        { from: "START", to: "node1" },
        { from: "node1", to: "node2" },
        { from: "node1", to: "node3", condition: "context.variables.branch === true" },
        { from: "node2", to: "END" },
        { from: "node3", to: "END" },
      ],
    };

    it("should return first node from START", () => {
      const context = engine.createContext("test", {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
      });

      const nextNodes = engine.getNextNodes(workflow, "START", context);
      expect(nextNodes).toHaveLength(1);
      expect(nextNodes[0].id).toBe("node1");
    });

    it("should return empty array from END", () => {
      const context = engine.createContext("test", {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
      });

      const nextNodes = engine.getNextNodes(workflow, "END", context);
      expect(nextNodes).toHaveLength(0);
    });

    it("should filter by condition", () => {
      const context: WorkflowContext = {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        variables: { branch: false },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const nextNodes = engine.getNextNodes(workflow, "node1", context);
      expect(nextNodes).toHaveLength(1);
      expect(nextNodes[0].id).toBe("node2");
    });

    it("should include conditional edge when condition is true", () => {
      const context: WorkflowContext = {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        variables: { branch: true },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const nextNodes = engine.getNextNodes(workflow, "node1", context);
      expect(nextNodes).toHaveLength(2);
      expect(nextNodes.map((n) => n.id)).toContain("node2");
      expect(nextNodes.map((n) => n.id)).toContain("node3");
    });
  });
});

describe("WorkflowExecutor", () => {
  let engine: WorkflowEngine;
  let executor: WorkflowExecutor;

  const mockWorkflow: WorkflowDefinition = {
    name: "test-workflow",
    defaultTimeout: 5000,
    nodes: [
      { id: "step1", type: "agent", agentId: "agent-1" },
      { id: "step2", type: "agent", agentId: "agent-2" },
    ],
    edges: [
      { from: "START", to: "step1" },
      { from: "step1", to: "step2" },
      { from: "step2", to: "END" },
    ],
  };

  beforeEach(() => {
    engine = new WorkflowEngine();
    engine.loadWorkflows = jest.fn();
    engine.getWorkflow = jest.fn().mockReturnValue(mockWorkflow);
    executor = new WorkflowExecutor(engine);
  });

  describe("Sequential Execution", () => {
    it("should execute workflow steps sequentially", async () => {
      const result = await executor.execute("test-workflow", {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      });

      expect(result.status).toBe("completed");
      expect(result.workflowName).toBe("test-workflow");
      expect(result.context.nodeResults["step1"]).toBeDefined();
      expect(result.context.nodeResults["step2"]).toBeDefined();
    });
  });

  describe("Parallel Execution", () => {
    it("should execute parallel agents concurrently", async () => {
      const parallelWorkflow: WorkflowDefinition = {
        name: "parallel-test",
        nodes: [
          {
            id: "parallel-step",
            type: "parallel",
            parallelAgents: ["agent-1", "agent-2", "agent-3"],
          },
        ],
        edges: [
          { from: "START", to: "parallel-step" },
          { from: "parallel-step", to: "END" },
        ],
      };

      engine.getWorkflow = jest.fn().mockReturnValue(parallelWorkflow);

      const result = await executor.execute("parallel-test", {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        userRequest: "parallel test",
      });

      expect(result.status).toBe("completed");
      const parallelResult = result.context.nodeResults["parallel-step"];
      expect(parallelResult.status).toBe("success");
      expect(Array.isArray(parallelResult.output)).toBe(true);
      expect((parallelResult.output as unknown[]).length).toBe(3);
    });
  });

  describe("Conditional Execution", () => {
    it("should execute condition node and store result", async () => {
      const conditionWorkflow: WorkflowDefinition = {
        name: "condition-test",
        nodes: [
          { id: "check", type: "condition", condition: "context.variables.amount > 100" },
          { id: "high", type: "agent", agentId: "high-agent" },
          { id: "low", type: "agent", agentId: "low-agent" },
        ],
        edges: [
          { from: "START", to: "check" },
          { from: "check", to: "high", condition: "context.variables['condition:check'] === true" },
          { from: "check", to: "low", condition: "context.variables['condition:check'] === false" },
          { from: "high", to: "END" },
          { from: "low", to: "END" },
        ],
      };

      engine.getWorkflow = jest.fn().mockReturnValue(conditionWorkflow);

      const result = await executor.execute(
        "condition-test",
        {
          organizationId: "org",
          userId: "user",
          sessionId: "sess",
          userRequest: "condition test",
        },
        { amount: 150 },
      );

      expect(result.status).toBe("completed");
      expect(result.context.nodeResults["check"].output).toBe(true);
      expect(result.context.nodeResults["high"]).toBeDefined();
    });
  });

  describe("Human Approval", () => {
    it("should pause execution at human approval node", async () => {
      const approvalWorkflow: WorkflowDefinition = {
        name: "approval-test",
        nodes: [
          { id: "prepare", type: "agent", agentId: "prep-agent" },
          { id: "approve", type: "human_approval", approvalType: "content" },
          { id: "finalize", type: "agent", agentId: "final-agent" },
        ],
        edges: [
          { from: "START", to: "prepare" },
          { from: "prepare", to: "approve" },
          { from: "approve", to: "finalize" },
          { from: "finalize", to: "END" },
        ],
      };

      engine.getWorkflow = jest.fn().mockReturnValue(approvalWorkflow);

      const result = await executor.execute(
        "approval-test",
        {
          organizationId: "org",
          userId: "user",
          sessionId: "sess",
          userRequest: "approval test",
        },
        { approverId: "approver-123" },
      );

      expect(result.status).toBe("waiting_approval");
      expect(result.approvalId).toBe("mock-approval-id");
      expect(result.context.status).toBe("waiting_approval");
      expect(result.context.nodeResults["prepare"]).toBeDefined();
      expect(result.context.nodeResults["approve"]).toBeDefined();
      expect(result.context.nodeResults["finalize"]).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle workflow not found", async () => {
      engine.getWorkflow = jest.fn().mockReturnValue(undefined);

      await expect(
        executor.execute("non-existent", {
          organizationId: "org",
          userId: "user",
          sessionId: "sess",
          userRequest: "test",
        }),
      ).rejects.toThrow("Workflow not found: non-existent");
    });

    it("should mark workflow as failed on node error", async () => {
      const { delegateTask } = require("../delegate-task");
      delegateTask.mockRejectedValueOnce(new Error("Agent execution failed"));

      const result = await executor.execute("test-workflow", {
        organizationId: "org",
        userId: "user",
        sessionId: "sess",
        userRequest: "test",
      });

      expect(result.status).toBe("failed");
    });
  });
});
