/**
 * Execution MCP Provider
 *
 * Provides MCP tools for managing and monitoring workflow executions.
 * Agents can list, get, cancel, and retry executions.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "execution__list",
    description: "List workflow executions with optional filters (status, workflowId, limit)",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "Filter by workflow ID (optional)",
        },
        status: {
          type: "string",
          description: "Filter by status: pending, running, success, failed (optional)",
          enum: ["pending", "running", "success", "failed"],
        },
        limit: {
          type: "number",
          description: "Maximum number of executions to return (default 50)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        executions: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "execution",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "execution__get",
    description: "Get single execution by ID with full details including workflow info",
    inputSchema: {
      type: "object",
      properties: {
        executionId: {
          type: "string",
          description: "The execution ID to retrieve",
        },
      },
      required: ["executionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        execution: { type: "object" },
      },
    },
    provider: "execution",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "execution__cancel",
    description: "Cancel a pending or running execution (marks as failed)",
    inputSchema: {
      type: "object",
      properties: {
        executionId: {
          type: "string",
          description: "The execution ID to cancel",
        },
        reason: {
          type: "string",
          description: "Optional reason for cancellation",
        },
      },
      required: ["executionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        execution: { type: "object" },
      },
    },
    provider: "execution",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "execution__retry",
    description: "Retry a failed execution (creates new execution with same inputs)",
    inputSchema: {
      type: "object",
      properties: {
        executionId: {
          type: "string",
          description: "The failed execution ID to retry",
        },
      },
      required: ["executionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        execution: { type: "object" },
        originalExecution: { type: "object" },
      },
    },
    provider: "execution",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
];

interface ListArgs {
  workflowId?: string;
  status?: "pending" | "running" | "success" | "failed";
  limit?: number;
}

interface GetArgs {
  executionId: string;
}

interface CancelArgs {
  executionId: string;
  reason?: string;
}

interface RetryArgs {
  executionId: string;
}

export function createExecutionProvider() {
  return {
    name: "execution",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;
        const actualToolName = toolName.replace("execution__", "");

        switch (actualToolName) {
          case "list":
            result = await listExecutions(args as any, context.organizationId);
            break;
          case "get":
            result = await getExecution(args as any, context.organizationId);
            break;
          case "cancel":
            result = await cancelExecution(args as any, context.organizationId);
            break;
          case "retry":
            result = await retryExecution(args as any, context.organizationId);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Execution tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

async function listExecutions(
  args: ListArgs,
  organizationId: string,
): Promise<{ executions: unknown[] }> {
  const { workflowId, status, limit = 50 } = args;

  const executions = await prisma.workflowExecution.findMany({
    where: {
      workflow: {
        organizationId,
        ...(workflowId && { id: workflowId }),
      },
      ...(status && { status }),
    },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          enabled: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  return { executions };
}

async function getExecution(
  args: GetArgs,
  organizationId: string,
): Promise<{ execution: unknown }> {
  const { executionId } = args;

  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId },
    include: {
      workflow: true,
    },
  });

  if (!execution || execution.workflow.organizationId !== organizationId) {
    throw new Error("Execution not found");
  }

  return { execution };
}

async function cancelExecution(
  args: CancelArgs,
  organizationId: string,
): Promise<{ success: boolean; execution: unknown }> {
  const { executionId, reason } = args;

  // First check if execution exists and belongs to organization
  const existing = await prisma.workflowExecution.findFirst({
    where: { id: executionId },
    include: {
      workflow: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!existing || existing.workflow.organizationId !== organizationId) {
    throw new Error("Execution not found");
  }

  // Only allow canceling pending or running executions
  if (existing.status !== "pending" && existing.status !== "running") {
    throw new Error(
      `Cannot cancel execution with status: ${existing.status}. Only pending or running executions can be cancelled.`,
    );
  }

  // Update status to failed with cancellation message
  const execution = await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: "failed",
      errorMessage: reason
        ? `Cancelled by agent: ${reason}`
        : "Cancelled by agent",
      completedAt: new Date(),
    },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  logger.info("Workflow execution cancelled via MCP", {
    executionId,
    organizationId,
    reason,
  });

  return { success: true, execution };
}

async function retryExecution(
  args: RetryArgs,
  organizationId: string,
): Promise<{ execution: unknown; originalExecution: unknown }> {
  const { executionId } = args;

  // First check if execution exists and belongs to organization
  const originalExecution = await prisma.workflowExecution.findFirst({
    where: { id: executionId },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          enabled: true,
        },
      },
    },
  });

  if (
    !originalExecution ||
    originalExecution.workflow.organizationId !== organizationId
  ) {
    throw new Error("Execution not found");
  }

  // Only allow retrying failed executions
  if (originalExecution.status !== "failed") {
    throw new Error(
      `Cannot retry execution with status: ${originalExecution.status}. Only failed executions can be retried.`,
    );
  }

  // Check if workflow is still enabled
  if (!originalExecution.workflow.enabled) {
    throw new Error("Cannot retry execution: workflow is disabled");
  }

  // Create new execution with same inputs
  const newExecution = await prisma.workflowExecution.create({
    data: {
      workflowId: originalExecution.workflowId,
      status: "pending",
      inputData: originalExecution.inputData ?? undefined,
      startedAt: new Date(),
    },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  logger.info("Workflow execution retried via MCP", {
    executionId,
    newExecutionId: newExecution.id,
    workflowId: originalExecution.workflowId,
    organizationId,
  });

  return {
    execution: {
      ...newExecution,
      message:
        "New execution created. Use execution__get to check status.",
    },
    originalExecution: {
      id: originalExecution.id,
      status: originalExecution.status,
      errorMessage: originalExecution.errorMessage,
    },
  };
}
