import { WorkflowEngine } from "../workflow-engine";
import { WorkflowExecutor, WorkflowExecutionResult } from "../workflow-executor";
import { delegateTask, DelegateTaskResult } from "../delegate-task";
import { agentRegistry, AgentDefinition } from "../agent-registry";
import { createApprovalRequest } from "../../services/approval-checker";
import { WorkflowDefinition, WorkflowContext, WorkflowNode } from "../workflow-types";
import { OrchestrationRequest } from "../types";

// Mock dependencies
jest.mock("../delegate-task");
jest.mock("../agent-registry");
jest.mock("../../services/approval-checker");
jest.mock("fs");
jest.mock("js-yaml");

const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;
const mockAgentRegistry = agentRegistry as jest.Mocked<typeof agentRegistry>;
const mockCreateApprovalRequest = createApprovalRequest as jest.MockedFunction<
  typeof createApprovalRequest
>;

// Helper to create valid DelegateTaskResult
function createMockDelegateTaskResult(
  status: "success" | "failed" = "success",
  output: string = "Success",
  error?: string,
): DelegateTaskResult {
  return {
    status,
    output,
    metadata: {
      model: "claude-3-sonnet",
      duration: 100,
      inputTokens: 50,
      outputTokens: 50,
      cost: 0.001,
      error,
    },
  };
}

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
    jest.clearAllMocks();
  });

  describe("loadWorkflows", () => {
    it("should load valid YAML workflow definitions", () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["test-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: test-workflow\nversion: 1.0");

      const mockWorkflow: WorkflowDefinition = {
        name: "test-workflow",
        version: "1.0",
        nodes: [
          { id: "node1", type: "agent", agentId: "agent1" },
          { id: "node2", type: "agent", agentId: "agent2" },
        ],
        edges: [{ from: "START", to: "node1" }],
      };

      yaml.load.mockReturnValue(mockWorkflow);

      engine.loadWorkflows();

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.readdirSync).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(yaml.load).toHaveBeenCalled();
    });

    it("should handle missing workflows directory gracefully", () => {
      const fs = require("fs");
      fs.existsSync.mockReturnValue(false);

      expect(() => engine.loadWorkflows()).not.toThrow();
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it("should throw error on invalid YAML", () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["invalid.yaml"]);
      fs.readFileSync.mockReturnValue("invalid: yaml: content:");

      yaml.load.mockImplementation(() => {
        throw new Error("Invalid YAML");
      });

      expect(() => engine.loadWorkflows()).toThrow("Invalid workflow configuration");
    });
  });

  describe("getWorkflow", () => {
    it("should return workflow by name", () => {
      const mockWorkflow: WorkflowDefinition = {
        name: "test-workflow",
        version: "1.0",
        nodes: [{ id: "node1", type: "agent", agentId: "agent1" }],
        edges: [],
      };

      const fs = require("fs");
      const yaml = require("js-yaml");

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["test-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: test-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      engine.loadWorkflows();
      const result = engine.getWorkflow("test-workflow");

      expect(result).toEqual(mockWorkflow);
    });

    it("should return undefined for non-existent workflow", () => {
      const result = engine.getWorkflow("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("createContext", () => {
    it("should create workflow context with initial variables", () => {
      const request = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        initialVariables: { key: "value" },
      };

      const context = engine.createContext("test-workflow", request);

      expect(context.organizationId).toBe("org-123");
      expect(context.userId).toBe("user-456");
      expect(context.sessionId).toBe("session-789");
      expect(context.variables).toEqual({ key: "value" });
      expect(context.currentNode).toBe("START");
      expect(context.status).toBe("pending");
      expect(context.nodeResults).toEqual({});
      expect(context.startedAt).toBeInstanceOf(Date);
    });

    it("should create context without initial variables", () => {
      const request = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
      };

      const context = engine.createContext("test-workflow", request);

      expect(context.variables).toEqual({});
    });
  });

  describe("getNextNodes", () => {
    it("should return empty array for END node", () => {
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [],
        edges: [],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "END",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "END", context);

      expect(result).toEqual([]);
    });

    it("should return next nodes from START", () => {
      const node1: WorkflowNode = { id: "node1", type: "agent", agentId: "agent1" };
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [node1],
        edges: [{ from: "START", to: "node1" }],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "START",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "START", context);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(node1);
    });

    it("should return next nodes from middle node", () => {
      const node2: WorkflowNode = { id: "node2", type: "agent", agentId: "agent2" };
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [node2],
        edges: [{ from: "node1", to: "node2" }],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "node1", context);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(node2);
    });

    it("should skip edges with false conditions", () => {
      const node2: WorkflowNode = { id: "node2", type: "agent", agentId: "agent2" };
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [node2],
        edges: [{ from: "node1", to: "node2", condition: "context.variables.skip === true" }],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { skip: false },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "node1", context);

      expect(result).toHaveLength(0);
    });

    it("should include edges with true conditions", () => {
      const node2: WorkflowNode = { id: "node2", type: "agent", agentId: "agent2" };
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [node2],
        edges: [{ from: "node1", to: "node2", condition: "context.variables.proceed === true" }],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { proceed: true },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "node1", context);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(node2);
    });

    it("should skip edges pointing to END", () => {
      const workflow: WorkflowDefinition = {
        name: "test",
        nodes: [],
        edges: [{ from: "node1", to: "END" }],
      };

      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.getNextNodes(workflow, "node1", context);

      expect(result).toHaveLength(0);
    });
  });

  describe("evaluateCondition", () => {
    it("should evaluate true condition", () => {
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { value: 10 },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.evaluateCondition("context.variables.value > 5", context);

      expect(result).toBe(true);
    });

    it("should evaluate false condition", () => {
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { value: 3 },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.evaluateCondition("context.variables.value > 5", context);

      expect(result).toBe(false);
    });

    it("should return false for invalid condition", () => {
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.evaluateCondition("invalid syntax !!!", context);

      expect(result).toBe(false);
    });

    it("should evaluate complex conditions", () => {
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { status: "approved", priority: "high" },
        nodeResults: {},
        currentNode: "node1",
        status: "running",
        startedAt: new Date(),
      };

      const result = engine.evaluateCondition(
        "context.variables.status === 'approved' && context.variables.priority === 'high'",
        context,
      );

      expect(result).toBe(true);
    });
  });
});

describe("WorkflowExecutor", () => {
  let executor: WorkflowExecutor;
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
    executor = new WorkflowExecutor(engine);
    jest.clearAllMocks();

    // Setup default mocks
    mockAgentRegistry.getAgent.mockReturnValue({
      id: "task",
      name: "Task Agent",
      description: "Task management agent",
      emoji: "✅",
      category: "quick",
      skills: [],
      capabilities: [],
      systemPrompt: "You are a helpful assistant",
      canDelegateTo: [],
      maxConcurrentTasks: 5,
      timeoutMs: 30000,
    });
  });

  describe("execute", () => {
    it("should throw error when workflow not found", async () => {
      const fs = require("fs");
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      await expect(executor.execute("non-existent", request)).rejects.toThrow("Workflow not found");
    });

    it("should execute simple workflow with single agent node", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "simple-workflow",
        nodes: [{ id: "agent-node", type: "agent", agentId: "agent1" }],
        edges: [
          { from: "START", to: "agent-node" },
          { from: "agent-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["simple-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: simple-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask.mockResolvedValue(
        createMockDelegateTaskResult("success", "Agent executed successfully"),
      );

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("simple-workflow", request);

      expect(result.status).toBe("completed");
      expect(result.workflowName).toBe("simple-workflow");
      expect(result.context.status).toBe("completed");
      expect(result.duration).toBeGreaterThan(0);
      expect(mockDelegateTask).toHaveBeenCalled();
    });

    it("should handle workflow execution failure", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "failing-workflow",
        nodes: [{ id: "agent-node", type: "agent", agentId: "agent1" }],
        edges: [
          { from: "START", to: "agent-node" },
          { from: "agent-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["failing-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: failing-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask.mockResolvedValue(
        createMockDelegateTaskResult("failed", "", "Agent failed"),
      );

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("failing-workflow", request);

      expect(result.status).toBe("failed");
      expect(result.context.status).toBe("failed");
    });

    it("should pause workflow at human approval node", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "approval-workflow",
        nodes: [{ id: "approval-node", type: "human_approval", approvalType: "content" }],
        edges: [
          { from: "START", to: "approval-node" },
          { from: "approval-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["approval-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: approval-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockCreateApprovalRequest.mockResolvedValue("approval-123");

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("approval-workflow", request, {
        approverId: "approver-789",
      });

      expect(result.status).toBe("waiting_approval");
      expect(result.context.status).toBe("waiting_approval");
      expect(result.approvalId).toBe("approval-123");
      expect(mockCreateApprovalRequest).toHaveBeenCalled();
    });

    it("should pass initial variables to context", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "var-workflow",
        nodes: [{ id: "agent-node", type: "agent", agentId: "agent1" }],
        edges: [
          { from: "START", to: "agent-node" },
          { from: "agent-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["var-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: var-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask.mockResolvedValue(createMockDelegateTaskResult("success", "Success"));

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("var-workflow", request, {
        customVar: "custom-value",
      });

      expect(result.context.variables.customVar).toBe("custom-value");
      expect(result.context.variables.userRequest).toBe("test request");
    });
  });

  describe("executeAgentNode", () => {
    it("should call delegateTask with correct parameters", async () => {
      const node: WorkflowNode = { id: "agent-node", type: "agent", agentId: "agent1" };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request" },
        nodeResults: {},
        currentNode: "agent-node",
        status: "running",
        startedAt: new Date(),
      };

      mockDelegateTask.mockResolvedValue(createMockDelegateTaskResult("success", "Agent result"));

      mockAgentRegistry.getAgent.mockReturnValue({
        id: "task",
        name: "Task Agent",
        description: "Task management agent",
        emoji: "✅",
        category: "quick",
        skills: ["mcp-integration"],
        capabilities: [],
        systemPrompt: "System prompt",
        canDelegateTo: [],
        maxConcurrentTasks: 5,
        timeoutMs: 30000,
      });

      const result = await (executor as any).executeAgentNode(node, context);

      expect(result.nodeId).toBe("agent-node");
      expect(result.status).toBe("success");
      expect(result.output).toBe("Agent result");
      expect(mockDelegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "quick",
          load_skills: ["skill1"],
          prompt: expect.stringContaining("System prompt"),
          session_id: "session-789",
          organizationId: "org-123",
          userId: "user-456",
        }),
      );
    });

    it("should return error when agentId is missing", async () => {
      const node: WorkflowNode = { id: "agent-node", type: "agent" };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "agent-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeAgentNode(node, context);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("agentId is required");
    });

    it("should handle agent execution failure", async () => {
      const node: WorkflowNode = { id: "agent-node", type: "agent", agentId: "agent1" };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request" },
        nodeResults: {},
        currentNode: "agent-node",
        status: "running",
        startedAt: new Date(),
      };

      mockDelegateTask.mockResolvedValue(
        createMockDelegateTaskResult("failed", "", "Agent failed"),
      );

      const result = await (executor as any).executeAgentNode(node, context);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Agent failed");
    });
  });

  describe("executeParallelNode", () => {
    it("should execute multiple agents in parallel", async () => {
      const node: WorkflowNode = {
        id: "parallel-node",
        type: "parallel",
        parallelAgents: ["agent1", "agent2"],
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request" },
        nodeResults: {},
        currentNode: "parallel-node",
        status: "running",
        startedAt: new Date(),
      };

      mockDelegateTask
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent1 result"))
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent2 result"));

      const result = await (executor as any).executeParallelNode(node, context, 120000);

      expect(result.nodeId).toBe("parallel-node");
      expect(result.status).toBe("success");
      expect(Array.isArray(result.output)).toBe(true);
      expect(result.output).toHaveLength(2);
      expect(mockDelegateTask).toHaveBeenCalledTimes(2);
    });

    it("should fail if any parallel agent fails", async () => {
      const node: WorkflowNode = {
        id: "parallel-node",
        type: "parallel",
        parallelAgents: ["agent1", "agent2"],
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request" },
        nodeResults: {},
        currentNode: "parallel-node",
        status: "running",
        startedAt: new Date(),
      };

      mockDelegateTask
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent1 result"))
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent2 result"));

      const result = await (executor as any).executeParallelNode(node, context, 120000);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Parallel agents failed");
    });

    it("should return error when parallelAgents is missing", async () => {
      const node: WorkflowNode = { id: "parallel-node", type: "parallel" };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "parallel-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeParallelNode(node, context, 120000);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("parallelAgents is required");
    });
  });

  describe("executeConditionNode", () => {
    it("should evaluate condition and store result in context", async () => {
      const node: WorkflowNode = {
        id: "condition-node",
        type: "condition",
        condition: "context.variables.value > 5",
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { value: 10 },
        nodeResults: {},
        currentNode: "condition-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeConditionNode(node, context);

      expect(result.nodeId).toBe("condition-node");
      expect(result.status).toBe("success");
      expect(result.output).toBe(true);
      expect(context.variables["condition:condition-node"]).toBe(true);
    });

    it("should store false condition result", async () => {
      const node: WorkflowNode = {
        id: "condition-node",
        type: "condition",
        condition: "context.variables.value > 5",
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { value: 3 },
        nodeResults: {},
        currentNode: "condition-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeConditionNode(node, context);

      expect(result.output).toBe(false);
      expect(context.variables["condition:condition-node"]).toBe(false);
    });

    it("should return error when condition is missing", async () => {
      const node: WorkflowNode = { id: "condition-node", type: "condition" };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: {},
        nodeResults: {},
        currentNode: "condition-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeConditionNode(node, context);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("condition is required");
    });
  });

  describe("executeHumanApprovalNode", () => {
    it("should create approval request and return approval ID", async () => {
      const node: WorkflowNode = {
        id: "approval-node",
        type: "human_approval",
        approvalType: "content",
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request", approverId: "approver-789" },
        nodeResults: {},
        currentNode: "approval-node",
        status: "running",
        startedAt: new Date(),
      };

      mockCreateApprovalRequest.mockResolvedValue("approval-123");

      const result = await (executor as any).executeHumanApprovalNode(node, context);

      expect(result.nodeId).toBe("approval-node");
      expect(result.status).toBe("success");
      expect(result.output).toBe("approval-123");
      expect(context.variables.approvalId).toBe("approval-123");
      expect(context.status).toBe("waiting_approval");
      expect(mockCreateApprovalRequest).toHaveBeenCalledWith(
        "org-123",
        "user-456",
        "approver-789",
        "content",
        expect.any(String),
        "test request",
        expect.any(Object),
      );
    });

    it("should return error when approverId is missing", async () => {
      const node: WorkflowNode = {
        id: "approval-node",
        type: "human_approval",
        approvalType: "content",
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request" },
        nodeResults: {},
        currentNode: "approval-node",
        status: "running",
        startedAt: new Date(),
      };

      const result = await (executor as any).executeHumanApprovalNode(node, context);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("approverId is required in context variables");
    });

    it("should use default approval type", async () => {
      const node: WorkflowNode = {
        id: "approval-node",
        type: "human_approval",
      };
      const context: WorkflowContext = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        variables: { userRequest: "test request", approverId: "approver-789" },
        nodeResults: {},
        currentNode: "approval-node",
        status: "running",
        startedAt: new Date(),
      };

      mockCreateApprovalRequest.mockResolvedValue("approval-123");

      const result = await (executor as any).executeHumanApprovalNode(node, context);

      expect(result.status).toBe("success");
      expect(mockCreateApprovalRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "content",
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe("executeWithTimeout", () => {
    it("should resolve before timeout", async () => {
      const fn = jest.fn().mockResolvedValue("result");

      const result = await (executor as any).executeWithTimeout(fn, 5000, "test-node");

      expect(result).toBe("result");
      expect(fn).toHaveBeenCalled();
    });

    it("should reject on timeout", async () => {
      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("result"), 10000);
          }),
      );

      await expect((executor as any).executeWithTimeout(fn, 100, "test-node")).rejects.toThrow(
        "timed out",
      );
    });

    it("should propagate function errors", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("Function error"));

      await expect((executor as any).executeWithTimeout(fn, 5000, "test-node")).rejects.toThrow(
        "Function error",
      );
    });
  });

  describe("Complex Workflow Scenarios", () => {
    it("should execute workflow with conditional branching", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "conditional-workflow",
        nodes: [
          { id: "condition-node", type: "condition", condition: "context.variables.proceed" },
          { id: "agent-node", type: "agent", agentId: "agent1" },
        ],
        edges: [
          { from: "START", to: "condition-node" },
          {
            from: "condition-node",
            to: "agent-node",
            condition: "context.variables['condition:condition-node']",
          },
          { from: "agent-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["conditional-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: conditional-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask.mockResolvedValue(createMockDelegateTaskResult("success", "Agent executed"));

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("conditional-workflow", request, {
        proceed: true,
      });

      expect(result.status).toBe("completed");
      expect(result.context.variables["condition:condition-node"]).toBe(true);
      expect(mockDelegateTask).toHaveBeenCalled();
    });

    it("should execute workflow with parallel nodes", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "parallel-workflow",
        nodes: [
          {
            id: "parallel-node",
            type: "parallel",
            parallelAgents: ["agent1", "agent2"],
          },
        ],
        edges: [
          { from: "START", to: "parallel-node" },
          { from: "parallel-node", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["parallel-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: parallel-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent1 result"))
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Agent2 result"));

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("parallel-workflow", request);

      expect(result.status).toBe("completed");
      expect(mockDelegateTask).toHaveBeenCalledTimes(2);
    });

    it("should record node results in context", async () => {
      const fs = require("fs");
      const yaml = require("js-yaml");

      const mockWorkflow: WorkflowDefinition = {
        name: "tracking-workflow",
        nodes: [
          { id: "node1", type: "agent", agentId: "agent1" },
          { id: "node2", type: "agent", agentId: "agent2" },
        ],
        edges: [
          { from: "START", to: "node1" },
          { from: "node1", to: "node2" },
          { from: "node2", to: "END" },
        ],
      };

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(["tracking-workflow.yaml"]);
      fs.readFileSync.mockReturnValue("name: tracking-workflow");
      yaml.load.mockReturnValue(mockWorkflow);

      mockDelegateTask
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Node1 result"))
        .mockResolvedValueOnce(createMockDelegateTaskResult("success", "Node2 result"));

      const request: OrchestrationRequest = {
        organizationId: "org-123",
        userId: "user-456",
        sessionId: "session-789",
        userRequest: "test request",
      };

      const result = await executor.execute("tracking-workflow", request);

      expect(result.context.nodeResults.node1).toBeDefined();
      expect(result.context.nodeResults.node1.status).toBe("success");
      expect(result.context.nodeResults.node1.output).toBe("Node1 result");
      expect(result.context.nodeResults.node2).toBeDefined();
      expect(result.context.nodeResults.node2.status).toBe("success");
      expect(result.context.nodeResults.node2.output).toBe("Node2 result");
    });
  });
});
