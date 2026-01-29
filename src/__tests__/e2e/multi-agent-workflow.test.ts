/**
 * Multi-Agent Workflow E2E Tests
 *
 * Tests the complete multi-agent workflow execution:
 * - Sequential workflow execution
 * - Parallel execution
 * - Conditional branching
 * - Human approval flow
 * - Error handling
 * - Multi-agent detection and orchestration
 * - Performance characteristics
 */

import { WorkflowEngine } from "../../orchestrator/workflow-engine";
import { WorkflowExecutor, WorkflowExecutionResult } from "../../orchestrator/workflow-executor";
import {
  orchestrateMultiAgent,
  shouldUseMultiAgent,
  getSuggestedAgents,
} from "../../orchestrator/multi-agent-orchestrator";
import { WorkflowDefinition, WorkflowContext } from "../../orchestrator/workflow-types";
import {
  setupTestDatabase,
  teardownTestDatabase,
  createMockContext,
  createTestOrchestrationRequest,
  createMockWorkflow,
  waitForCondition,
} from "./setup";
import { delegateTask } from "../../orchestrator/delegate-task";

// Mock delegateTask for controlled testing
jest.mock("../../orchestrator/delegate-task");
const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;

describe("Multi-Agent Workflow E2E", () => {
  let engine: WorkflowEngine;
  let executor: WorkflowExecutor;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(() => {
    engine = new WorkflowEngine();
    executor = new WorkflowExecutor(engine);
    jest.clearAllMocks();

    // Default mock implementation
    mockDelegateTask.mockResolvedValue({
      status: "success",
      output: "Mock agent output",
      metadata: {
        duration: 100,
        model: "mock",
      },
    });
  });

  describe("Sequential workflow execution", () => {
    it("executes product-launch workflow in correct order", async () => {
      const request = createTestOrchestrationRequest({
        userRequest: "Launch new product",
      });

      // Setup mock to track call order
      const callOrder: string[] = [];
      mockDelegateTask.mockImplementation(async (params) => {
        const nodeId = (params.context?.workflowNodeId as string) || "unknown";
        callOrder.push(nodeId);
        return {
          status: "success",
          output: `Output from ${nodeId}`,
          metadata: {
            duration: 100,
            model: "mock",
          },
        };
      });

      // Mock approval checker to avoid actual approval
      jest.mock("../../services/approval-checker", () => ({
        createApprovalRequest: jest.fn().mockResolvedValue("test-approval-id"),
      }));

      // The workflow should execute nodes in order based on edges
      const result = await executor.execute("product-launch", request, {
        approverId: "test-approver-id",
      });

      // First step should be analyze (product-agent)
      expect(result.context.nodeResults["analyze"]).toBeDefined();
      expect(result.context.nodeResults["analyze"].status).toBe("success");
    });

    it("passes context between workflow steps", async () => {
      const outputs: Record<string, string> = {};

      mockDelegateTask.mockImplementation(async (params) => {
        const nodeId = (params.context?.workflowNodeId as string) || "unknown";
        outputs[nodeId] = `Output from ${nodeId}`;
        return {
          status: "success",
          output: outputs[nodeId],
          metadata: {
            duration: 100,
            model: "mock",
          },
        };
      });

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("product-launch", request, {
        approverId: "test-approver-id",
      });

      // Verify nodeResults are accumulated
      const nodeResults = result.context.nodeResults;
      expect(Object.keys(nodeResults).length).toBeGreaterThan(0);
    });

    it("respects step timeouts", async () => {
      // Create a workflow with a short timeout
      const shortTimeoutWorkflow: WorkflowDefinition = {
        name: "timeout-test",
        version: "1.0.0",
        defaultTimeout: 100, // 100ms timeout
        nodes: [
          {
            id: "slow-step",
            type: "agent",
            agentId: "product-agent",
            timeout: 50, // 50ms timeout
          },
        ],
        edges: [
          { from: "START", to: "slow-step" },
          { from: "slow-step", to: "END" },
        ],
      };

      // Mock a slow delegate task
      mockDelegateTask.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Takes 200ms
        return {
          status: "success",
          output: "Slow output",
          metadata: { duration: 200, model: "mock" },
        };
      });

      // Manually inject the workflow into the engine
      (engine as any).workflows = new Map([[shortTimeoutWorkflow.name, shortTimeoutWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("timeout-test", request);

      // Should fail due to timeout
      expect(result.status).toBe("failed");
    });
  });

  describe("Parallel execution", () => {
    it("executes parallel agents concurrently", async () => {
      const startTimes: Record<string, number> = {};
      const endTimes: Record<string, number> = {};

      mockDelegateTask.mockImplementation(async (params) => {
        const agentId = (params.context?.parallelAgentId as string) || "unknown";
        startTimes[agentId] = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 100)); // Each takes 100ms
        endTimes[agentId] = Date.now();
        return {
          status: "success",
          output: `Output from ${agentId}`,
          metadata: { duration: 100, model: "mock" },
        };
      });

      const parallelWorkflow: WorkflowDefinition = {
        name: "parallel-test",
        nodes: [
          {
            id: "parallel-step",
            type: "parallel",
            parallelAgents: ["brand-agent", "ops-agent"],
          },
        ],
        edges: [
          { from: "START", to: "parallel-step" },
          { from: "parallel-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[parallelWorkflow.name, parallelWorkflow]]);

      const start = Date.now();
      const request = createTestOrchestrationRequest();
      const result = await executor.execute("parallel-test", request);
      const duration = Date.now() - start;

      // Parallel should be faster than sequential (2x100ms = 200ms)
      // Allow some overhead, but should be much less than 200ms
      expect(duration).toBeLessThan(300);
      expect(result.context.nodeResults["parallel-step"]).toBeDefined();
      expect(result.context.nodeResults["parallel-step"].status).toBe("success");
    });

    it("waits for all parallel agents to complete", async () => {
      const completionFlags: Record<string, boolean> = {};

      mockDelegateTask.mockImplementation(async (params) => {
        const agentId = (params.context?.parallelAgentId as string) || "unknown";
        // Different agents take different times
        const delay = agentId === "brand-agent" ? 50 : 150;
        await new Promise((resolve) => setTimeout(resolve, delay));
        completionFlags[agentId] = true;
        return {
          status: "success",
          output: `Output from ${agentId}`,
          metadata: { duration: delay, model: "mock" },
        };
      });

      const parallelWorkflow: WorkflowDefinition = {
        name: "parallel-wait-test",
        nodes: [
          {
            id: "parallel-step",
            type: "parallel",
            parallelAgents: ["brand-agent", "ops-agent"],
          },
        ],
        edges: [
          { from: "START", to: "parallel-step" },
          { from: "parallel-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[parallelWorkflow.name, parallelWorkflow]]);

      const request = createTestOrchestrationRequest();
      await executor.execute("parallel-wait-test", request);

      // All agents should have completed
      expect(completionFlags["brand-agent"]).toBe(true);
      expect(completionFlags["ops-agent"]).toBe(true);
    });

    it("handles partial failure in parallel execution", async () => {
      mockDelegateTask.mockImplementation(async (params) => {
        const agentId = (params.context?.parallelAgentId as string) || "unknown";
        if (agentId === "ops-agent") {
          return {
            status: "failed",
            output: "Agent failed",
            metadata: { duration: 50, model: "mock", error: "Test error" },
          };
        }
        return {
          status: "success",
          output: `Output from ${agentId}`,
          metadata: { duration: 50, model: "mock" },
        };
      });

      const parallelWorkflow: WorkflowDefinition = {
        name: "parallel-failure-test",
        nodes: [
          {
            id: "parallel-step",
            type: "parallel",
            parallelAgents: ["brand-agent", "ops-agent"],
          },
        ],
        edges: [
          { from: "START", to: "parallel-step" },
          { from: "parallel-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[parallelWorkflow.name, parallelWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("parallel-failure-test", request);

      // Workflow should fail if any parallel agent fails
      expect(result.status).toBe("failed");
      expect(result.context.nodeResults["parallel-step"].error).toContain("ops-agent");
    });
  });

  describe("Conditional branching", () => {
    it("follows true branch when condition met", async () => {
      const conditionalWorkflow: WorkflowDefinition = {
        name: "conditional-true-test",
        nodes: [
          { id: "start-agent", type: "agent", agentId: "product-agent" },
          { id: "check-condition", type: "condition", condition: "true" },
          { id: "true-branch", type: "agent", agentId: "brand-agent" },
          { id: "false-branch", type: "agent", agentId: "ops-agent" },
        ],
        edges: [
          { from: "START", to: "start-agent" },
          { from: "start-agent", to: "check-condition" },
          { from: "check-condition", to: "true-branch", condition: "true" },
          { from: "check-condition", to: "false-branch", condition: "false" },
          { from: "true-branch", to: "END" },
          { from: "false-branch", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[conditionalWorkflow.name, conditionalWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("conditional-true-test", request);

      expect(result.context.nodeResults["check-condition"].output).toBe(true);
    });

    it("follows false branch when condition not met", async () => {
      const conditionalWorkflow: WorkflowDefinition = {
        name: "conditional-false-test",
        nodes: [
          { id: "start-agent", type: "agent", agentId: "product-agent" },
          { id: "check-condition", type: "condition", condition: "false" },
          { id: "true-branch", type: "agent", agentId: "brand-agent" },
          { id: "false-branch", type: "agent", agentId: "ops-agent" },
        ],
        edges: [
          { from: "START", to: "start-agent" },
          { from: "start-agent", to: "check-condition" },
          { from: "check-condition", to: "true-branch", condition: "true" },
          { from: "check-condition", to: "false-branch", condition: "false" },
          { from: "true-branch", to: "END" },
          { from: "false-branch", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[conditionalWorkflow.name, conditionalWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("conditional-false-test", request);

      expect(result.context.nodeResults["check-condition"].output).toBe(false);
    });

    it("evaluates complex JavaScript conditions", async () => {
      const conditionalWorkflow: WorkflowDefinition = {
        name: "conditional-complex-test",
        nodes: [
          { id: "check-condition", type: "condition", condition: "variables.amount > 100" },
        ],
        edges: [
          { from: "START", to: "check-condition" },
          { from: "check-condition", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[conditionalWorkflow.name, conditionalWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("conditional-complex-test", request, { amount: 150 });

      expect(result.context.nodeResults["check-condition"].output).toBe(true);
    });
  });

  describe("Human approval flow", () => {
    it("pauses workflow at approval step", async () => {
      const request = createTestOrchestrationRequest();

      const result = await executor.execute("product-launch", request, {
        approverId: "test-approver-id",
      });

      // Workflow should pause at approval step
      expect(result.status).toBe("waiting_approval");
      expect(result.approvalId).toBeDefined();
    });

    it("creates approval request with correct data", async () => {
      const { createApprovalRequest } = require("../../services/approval-checker");

      const request = createTestOrchestrationRequest({
        userRequest: "Launch product X",
      });

      await executor.execute("product-launch", request, {
        approverId: "test-approver-id",
      });

      expect(createApprovalRequest).toHaveBeenCalled();
    });

    it("handles missing approverId", async () => {
      const approvalOnlyWorkflow: WorkflowDefinition = {
        name: "approval-only-test",
        nodes: [{ id: "approval", type: "human_approval", approvalType: "content" }],
        edges: [
          { from: "START", to: "approval" },
          { from: "approval", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[approvalOnlyWorkflow.name, approvalOnlyWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("approval-only-test", request);

      // Should fail due to missing approverId
      expect(result.status).toBe("failed");
      expect(result.context.nodeResults["approval"].error).toContain("approverId");
    });
  });

  describe("Error handling", () => {
    it("marks workflow as failed on agent error", async () => {
      mockDelegateTask.mockRejectedValue(new Error("Agent execution error"));

      const simpleWorkflow: WorkflowDefinition = {
        name: "error-test",
        nodes: [{ id: "failing-step", type: "agent", agentId: "product-agent" }],
        edges: [
          { from: "START", to: "failing-step" },
          { from: "failing-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[simpleWorkflow.name, simpleWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("error-test", request);

      expect(result.status).toBe("failed");
    });

    it("records error details in context", async () => {
      mockDelegateTask.mockRejectedValue(new Error("Specific error message"));

      const simpleWorkflow: WorkflowDefinition = {
        name: "error-details-test",
        nodes: [{ id: "failing-step", type: "agent", agentId: "product-agent" }],
        edges: [
          { from: "START", to: "failing-step" },
          { from: "failing-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[simpleWorkflow.name, simpleWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("error-details-test", request);

      expect(result.context.nodeResults["failing-step"].error).toContain("Specific error message");
    });

    it("handles workflow not found error", async () => {
      const request = createTestOrchestrationRequest();

      await expect(executor.execute("non-existent-workflow", request)).rejects.toThrow(
        "Workflow not found: non-existent-workflow",
      );
    });
  });

  describe("Multi-agent detection", () => {
    it("correctly identifies multi-agent requests", () => {
      const result = shouldUseMultiAgent("캠페인 브리프 작성하고 예산도 확인해줘");
      expect(result).toBe(true);
    });

    it("returns false for single-agent requests", () => {
      const result = shouldUseMultiAgent("캠페인 브리프 작성해줘");
      expect(result).toBe(false);
    });

    it("suggests correct agents for multi-agent request", () => {
      const agents = getSuggestedAgents("캠페인 브리프 작성하고 예산도 확인해줘");
      expect(agents.length).toBeGreaterThanOrEqual(1);
    });

    it("orchestrates multiple agents for complex request", async () => {
      const request = {
        userRequest: "캠페인 브리프 작성하고 예산도 확인해줘",
        sessionId: "test-session",
        organizationId: "test-org",
        userId: "test-user",
        enableMultiAgent: true,
      };

      const result = await orchestrateMultiAgent(request);

      expect(result.multiAgentMetadata).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("completes simple workflow within 5 seconds", async () => {
      mockDelegateTask.mockResolvedValue({
        status: "success",
        output: "Quick output",
        metadata: { duration: 50, model: "mock" },
      });

      const simpleWorkflow: WorkflowDefinition = {
        name: "perf-test",
        nodes: [{ id: "quick-step", type: "agent", agentId: "product-agent" }],
        edges: [
          { from: "START", to: "quick-step" },
          { from: "quick-step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[simpleWorkflow.name, simpleWorkflow]]);

      const start = Date.now();
      const request = createTestOrchestrationRequest();
      await executor.execute("perf-test", request);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });

    it("parallel execution is faster than sequential", async () => {
      mockDelegateTask.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          status: "success",
          output: "Output",
          metadata: { duration: 100, model: "mock" },
        };
      });

      // Parallel workflow
      const parallelWorkflow: WorkflowDefinition = {
        name: "parallel-perf-test",
        nodes: [
          { id: "parallel-step", type: "parallel", parallelAgents: ["brand-agent", "ops-agent"] },
        ],
        edges: [
          { from: "START", to: "parallel-step" },
          { from: "parallel-step", to: "END" },
        ],
      };

      // Sequential workflow with same agents
      const sequentialWorkflow: WorkflowDefinition = {
        name: "sequential-perf-test",
        nodes: [
          { id: "step1", type: "agent", agentId: "brand-agent" },
          { id: "step2", type: "agent", agentId: "ops-agent" },
        ],
        edges: [
          { from: "START", to: "step1" },
          { from: "step1", to: "step2" },
          { from: "step2", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([
        [parallelWorkflow.name, parallelWorkflow],
        [sequentialWorkflow.name, sequentialWorkflow],
      ]);

      const request = createTestOrchestrationRequest();

      const parallelStart = Date.now();
      await executor.execute("parallel-perf-test", request);
      const parallelDuration = Date.now() - parallelStart;

      const sequentialStart = Date.now();
      await executor.execute("sequential-perf-test", request);
      const sequentialDuration = Date.now() - sequentialStart;

      // Parallel should be faster (or at least not slower)
      expect(parallelDuration).toBeLessThanOrEqual(sequentialDuration + 50); // 50ms tolerance
    });
  });

  describe("Workflow context management", () => {
    it("preserves variables throughout workflow", async () => {
      mockDelegateTask.mockResolvedValue({
        status: "success",
        output: "Output",
        metadata: { duration: 50, model: "mock" },
      });

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("product-launch", request, {
        customVar: "test-value",
        approverId: "test-approver",
      });

      expect(result.context.variables.customVar).toBe("test-value");
      expect(result.context.variables.userRequest).toBe(request.userRequest);
    });

    it("records completion timestamp", async () => {
      mockDelegateTask.mockResolvedValue({
        status: "success",
        output: "Output",
        metadata: { duration: 50, model: "mock" },
      });

      const simpleWorkflow: WorkflowDefinition = {
        name: "timestamp-test",
        nodes: [{ id: "step", type: "agent", agentId: "product-agent" }],
        edges: [
          { from: "START", to: "step" },
          { from: "step", to: "END" },
        ],
      };

      (engine as any).workflows = new Map([[simpleWorkflow.name, simpleWorkflow]]);

      const request = createTestOrchestrationRequest();
      const result = await executor.execute("timestamp-test", request);

      expect(result.context.completedAt).toBeDefined();
      expect(result.context.completedAt!.getTime()).toBeGreaterThanOrEqual(
        result.context.startedAt.getTime(),
      );
    });
  });
});
