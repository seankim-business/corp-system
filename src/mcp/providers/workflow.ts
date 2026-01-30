/**
 * Workflow MCP Provider
 *
 * Provides MCP tools for managing and executing workflows.
 * Agents can create, list, update, delete, and execute workflows.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "workflow__list",
    description: "List all workflows in the organization",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "Filter by enabled status (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of workflows to return (default 50)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        workflows: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "workflow",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "workflow__get",
    description: "Get a specific workflow by ID with recent execution history",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID to retrieve",
        },
      },
      required: ["workflowId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        workflow: { type: "object" },
      },
    },
    provider: "workflow",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "workflow__create",
    description: "Create a new workflow",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Workflow name",
        },
        description: {
          type: "string",
          description: "Workflow description (optional)",
        },
        config: {
          type: "object",
          description: "Workflow configuration with steps array",
        },
        enabled: {
          type: "boolean",
          description: "Whether the workflow is enabled (default true)",
        },
      },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: {
        workflow: { type: "object" },
      },
    },
    provider: "workflow",
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
    name: "workflow__update",
    description: "Update an existing workflow",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID to update",
        },
        name: {
          type: "string",
          description: "New workflow name (optional)",
        },
        description: {
          type: "string",
          description: "New workflow description (optional)",
        },
        config: {
          type: "object",
          description: "New workflow configuration (optional)",
        },
        enabled: {
          type: "boolean",
          description: "Enable/disable the workflow (optional)",
        },
      },
      required: ["workflowId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        workflow: { type: "object" },
      },
    },
    provider: "workflow",
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
    name: "workflow__delete",
    description: "Delete a workflow",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID to delete",
        },
      },
      required: ["workflowId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "workflow",
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
    name: "workflow__execute",
    description: "Execute a workflow with optional input data",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID to execute",
        },
        inputData: {
          type: "object",
          description: "Input data to pass to the workflow (optional)",
        },
      },
      required: ["workflowId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        execution: { type: "object" },
      },
    },
    provider: "workflow",
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
    name: "workflow__executions",
    description: "List executions for a workflow or all executions in the organization",
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
    provider: "workflow",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "workflow__execution_get",
    description: "Get details of a specific workflow execution",
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
    provider: "workflow",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
];

interface ListArgs {
  enabled?: boolean;
  limit?: number;
}

interface GetArgs {
  workflowId: string;
}

interface CreateArgs {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

interface UpdateArgs {
  workflowId: string;
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

interface DeleteArgs {
  workflowId: string;
}

interface ExecuteArgs {
  workflowId: string;
  inputData?: Record<string, unknown>;
}

interface ExecutionsArgs {
  workflowId?: string;
  status?: "pending" | "running" | "success" | "failed";
  limit?: number;
}

interface ExecutionGetArgs {
  executionId: string;
}

export function createWorkflowProvider() {
  return {
    name: "workflow",

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
        const actualToolName = toolName.replace("workflow__", "");

        switch (actualToolName) {
          case "list":
            result = await listWorkflows(args as any, context.organizationId);
            break;
          case "get":
            result = await getWorkflow(args as any, context.organizationId);
            break;
          case "create":
            result = await createWorkflow(args as any, context.organizationId);
            break;
          case "update":
            result = await updateWorkflow(args as any, context.organizationId);
            break;
          case "delete":
            result = await deleteWorkflow(args as any, context.organizationId);
            break;
          case "execute":
            result = await executeWorkflow(args as any, context.organizationId);
            break;
          case "executions":
            result = await listExecutions(args as any, context.organizationId);
            break;
          case "execution_get":
            result = await getExecution(args as any, context.organizationId);
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
          "Workflow tool execution failed",
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

async function listWorkflows(
  args: ListArgs,
  organizationId: string,
): Promise<{ workflows: unknown[] }> {
  const { enabled, limit = 50 } = args;

  const workflows = await prisma.workflow.findMany({
    where: {
      organizationId,
      ...(enabled !== undefined && { enabled }),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  return { workflows };
}

async function getWorkflow(
  args: GetArgs,
  organizationId: string,
): Promise<{ workflow: unknown }> {
  const { workflowId } = args;

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, organizationId },
    include: {
      executions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  return { workflow };
}

async function createWorkflow(
  args: CreateArgs,
  organizationId: string,
): Promise<{ workflow: unknown }> {
  const { name, description, config, enabled = true } = args;

  const workflow = await prisma.workflow.create({
    data: {
      organizationId,
      name,
      description: description || null,
      config: (config || {}) as object,
      enabled,
    },
  });

  logger.info("Workflow created via MCP", {
    workflowId: workflow.id,
    organizationId,
    name,
  });

  return { workflow };
}

async function updateWorkflow(
  args: UpdateArgs,
  organizationId: string,
): Promise<{ workflow: unknown }> {
  const { workflowId, name, description, config, enabled } = args;

  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, organizationId },
  });

  if (!existing) {
    throw new Error("Workflow not found");
  }

  const workflow = await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(config !== undefined && { config: config as object }),
      ...(enabled !== undefined && { enabled }),
    },
  });

  logger.info("Workflow updated via MCP", {
    workflowId,
    organizationId,
  });

  return { workflow };
}

async function deleteWorkflow(
  args: DeleteArgs,
  organizationId: string,
): Promise<{ success: boolean }> {
  const { workflowId } = args;

  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, organizationId },
  });

  if (!existing) {
    throw new Error("Workflow not found");
  }

  await prisma.workflow.delete({
    where: { id: workflowId },
  });

  logger.info("Workflow deleted via MCP", {
    workflowId,
    organizationId,
  });

  return { success: true };
}

async function executeWorkflow(
  args: ExecuteArgs,
  organizationId: string,
): Promise<{ execution: unknown }> {
  const { workflowId, inputData } = args;

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, organizationId, enabled: true },
  });

  if (!workflow) {
    throw new Error("Workflow not found or disabled");
  }

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      status: "pending",
      inputData: inputData ? (inputData as object) : undefined,
      startedAt: new Date(),
    },
  });

  // Note: The actual execution is handled asynchronously by the workflow system
  // This mimics the behavior in src/api/workflows.ts
  logger.info("Workflow execution initiated via MCP", {
    executionId: execution.id,
    workflowId,
    organizationId,
  });

  return {
    execution: {
      ...execution,
      message: "Workflow execution started. Use workflow__execution_get to check status.",
    },
  };
}

async function listExecutions(
  args: ExecutionsArgs,
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
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  return { executions };
}

async function getExecution(
  args: ExecutionGetArgs,
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
