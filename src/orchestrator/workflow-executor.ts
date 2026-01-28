import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { createApprovalRequest, ApprovalType } from "../services/approval-checker";
import { delegateTask } from "./delegate-task";
import { agentRegistry } from "./agent-registry";
import { OrchestrationRequest } from "./types";
import { WorkflowEngine } from "./workflow-engine";
import { NodeResult, WorkflowContext, WorkflowDefinition, WorkflowNode } from "./workflow-types";

/**
 * WorkflowExecutor - Executes workflow definitions
 *
 * Responsibilities:
 * - Execute nodes sequentially following edges
 * - Handle parallel execution (Promise.all)
 * - Handle conditional branching
 * - Handle human approval (pause execution, create approval request)
 * - Record metrics and log execution
 */
export class WorkflowExecutor {
  constructor(private engine: WorkflowEngine) {}

  async execute(
    workflowName: string,
    request: OrchestrationRequest,
    initialVariables?: Record<string, unknown>,
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    this.engine.loadWorkflows();
    const workflow = this.engine.getWorkflow(workflowName);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    metrics.increment("workflow.execution.started", {
      workflow: workflowName,
      organizationId: request.organizationId,
    });

    const context = this.engine.createContext(workflowName, {
      organizationId: request.organizationId,
      userId: request.userId,
      sessionId: request.sessionId,
      initialVariables: {
        userRequest: request.userRequest,
        ...initialVariables,
      },
    });

    context.status = "running";

    let lastResult: NodeResult | undefined;
    const queue: WorkflowNode[] = this.engine.getNextNodes(workflow, "START", context);

    try {
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node) break;

        context.currentNode = node.id;

        const result = await this.executeNode(node, context, workflow);
        context.nodeResults.set(node.id, result as any);
        lastResult = result;

        if (result.status === "failed") {
          context.status = "failed";
          break;
        }

        if (node.type === "human_approval" && result.status === "success") {
          context.status = "waiting_approval";
          const duration = Date.now() - startTime;
          metrics.increment("workflow.execution.waiting_approval", {
            workflow: workflowName,
            organizationId: request.organizationId,
          });
          metrics.timing("workflow.execution", duration, {
            workflow: workflowName,
            status: "waiting_approval",
          });
          return {
            workflowName,
            status: "waiting_approval",
            context,
            output: result.output ?? null,
            duration,
            approvalId: String(result.output ?? ""),
          };
        }

        const nextNodes = this.engine.getNextNodes(workflow, node.id, context);
        queue.push(...nextNodes);
      }

      if (context.status !== "failed") {
        context.status = "completed";
      }
    } catch (error) {
      context.status = "failed";
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Workflow execution failed",
        { workflow: workflowName, node: context.currentNode },
        error instanceof Error ? error : new Error(errorMessage),
      );
    } finally {
      context.completedAt = new Date();
    }

    const duration = Date.now() - startTime;
    const status = context.status === "completed" ? "completed" : "failed";

    metrics.increment("workflow.execution.completed", {
      workflow: workflowName,
      organizationId: request.organizationId,
      status,
    });
    metrics.timing("workflow.execution", duration, {
      workflow: workflowName,
      status,
    });

    logger.info("Workflow execution finished", {
      workflow: workflowName,
      status,
      duration,
    });

    return {
      workflowName,
      status,
      context,
      output: lastResult?.output ?? null,
      duration,
    };
  }

  private async executeNode(
    node: WorkflowNode,
    context: WorkflowContext,
    workflow: WorkflowDefinition,
  ): Promise<NodeResult> {
    const timeout = node.timeout ?? workflow.defaultTimeout ?? 120000;
    const startedAt = Date.now();

    const run = async (): Promise<NodeResult> => {
      switch (node.type) {
        case "agent":
          return this.executeAgentNode(node, context);
        case "parallel":
          return this.executeParallelNode(node, context, timeout);
        case "condition":
          return this.executeConditionNode(node, context);
        case "human_approval":
          return this.executeHumanApprovalNode(node, context);
        default:
          return {
            nodeId: node.id,
            status: "failed",
            error: `Unsupported node type: ${node.type}`,
          };
      }
    };

    try {
      const result = await this.executeWithTimeout(run, timeout, node.id);
      result.duration = Date.now() - startedAt;
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        nodeId: node.id,
        status: "failed",
        error: errorMessage,
        duration: Date.now() - startedAt,
      };
    }
  }

  private async executeAgentNode(
    node: WorkflowNode,
    context: WorkflowContext,
  ): Promise<NodeResult> {
    if (!node.agentId) {
      return { nodeId: node.id, status: "failed", error: "agentId is required" };
    }

    const agent = agentRegistry.getAgent(node.agentId as any);
    const category = agent?.category ?? "unspecified-high";
    const skills = agent?.skills ?? [];
    const basePrompt =
      typeof context.variables.userRequest === "string"
        ? context.variables.userRequest
        : `Execute workflow node ${node.id}`;
    const prompt = agent ? `${agent.systemPrompt}\n\n---\n\n${basePrompt}` : basePrompt;

    logger.info("Executing agent node", { nodeId: node.id, agentId: node.agentId });

    const result = await delegateTask({
      category,
      load_skills: skills,
      prompt,
      session_id: context.sessionId,
      organizationId: context.organizationId,
      userId: context.userId,
      context: {
        workflowNodeId: node.id,
        workflowStatus: context.status,
      },
    });

    if (result.status === "failed") {
      return {
        nodeId: node.id,
        status: "failed",
        output: result.output,
        error: result.metadata.error || "Agent execution failed",
      };
    }

    return {
      nodeId: node.id,
      status: "success",
      output: result.output,
    };
  }

  private async executeParallelNode(
    node: WorkflowNode,
    context: WorkflowContext,
    timeout: number,
  ): Promise<NodeResult> {
    if (!node.parallelAgents || node.parallelAgents.length === 0) {
      return { nodeId: node.id, status: "failed", error: "parallelAgents is required" };
    }

    const basePrompt =
      typeof context.variables.userRequest === "string"
        ? context.variables.userRequest
        : `Execute workflow node ${node.id}`;

    const tasks = node.parallelAgents.map((agentId) => async () => {
      const agent = agentRegistry.getAgent(agentId as any);
      const category = agent?.category ?? "unspecified-high";
      const skills = agent?.skills ?? [];
      const prompt = agent ? `${agent.systemPrompt}\n\n---\n\n${basePrompt}` : basePrompt;

      const result = await delegateTask({
        category,
        load_skills: skills,
        prompt,
        session_id: context.sessionId,
        organizationId: context.organizationId,
        userId: context.userId,
        context: {
          workflowNodeId: node.id,
          parallelAgentId: agentId,
        },
      });

      return {
        agentId,
        status: result.status,
        output: result.output,
        error: result.metadata.error,
      };
    });

    const results = await this.executeWithTimeout(
      () => Promise.all(tasks.map((task) => task())),
      timeout,
      node.id,
    );

    const failedAgents = results.filter((r) => r.status === "failed");

    if (failedAgents.length > 0) {
      return {
        nodeId: node.id,
        status: "failed",
        output: results,
        error: `Parallel agents failed: ${failedAgents.map((r) => r.agentId).join(", ")}`,
      };
    }

    return {
      nodeId: node.id,
      status: "success",
      output: results,
    };
  }

  private async executeConditionNode(
    node: WorkflowNode,
    context: WorkflowContext,
  ): Promise<NodeResult> {
    if (!node.condition) {
      return { nodeId: node.id, status: "failed", error: "condition is required" };
    }

    const result = this.engine.evaluateCondition(node.condition, context);
    context.variables[`condition:${node.id}`] = result;

    return {
      nodeId: node.id,
      status: "success",
      output: result,
    };
  }

  private async executeHumanApprovalNode(
    node: WorkflowNode,
    context: WorkflowContext,
  ): Promise<NodeResult> {
    const approvalType = (node.approvalType || "content") as ApprovalType;
    const approverId = context.variables.approverId as string | undefined;

    if (!approverId) {
      return {
        nodeId: node.id,
        status: "failed",
        error: "approverId is required in context variables",
      };
    }

    const requestText =
      typeof context.variables.userRequest === "string"
        ? context.variables.userRequest
        : "Workflow approval request";

    logger.info("Creating approval request", { nodeId: node.id, approvalType });

    const approvalId = await createApprovalRequest(
      context.organizationId,
      context.userId,
      approverId,
      approvalType,
      `Approval required: ${node.approvalType || node.id}`,
      requestText,
      {
        workflowNodeId: node.id,
        workflowStatus: context.status,
      },
    );

    context.status = "waiting_approval";
    context.variables.approvalId = approvalId;

    return {
      nodeId: node.id,
      status: "success",
      output: approvalId,
    };
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    nodeId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        logger.error("Workflow node timed out", { nodeId, timeoutMs });
        reject(new Error(`Node ${nodeId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

export interface WorkflowExecutionResult {
  workflowName: string;
  status: "completed" | "failed" | "waiting_approval";
  context: WorkflowContext;
  output: unknown;
  duration: number;
  approvalId?: string;
}
