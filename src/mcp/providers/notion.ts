import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface NotionMCPProvider {
  name: string;
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_NAME = "notion";

// ---------------------------------------------------------------------------
// Notion API helper
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY environment variable is not set");
  }
  return token;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const DEFAULT_PERMISSIONS = {
  allowedAgents: ["all"],
};

function buildTools(): MCPTool[] {
  return [
    {
      name: "notion_get_tasks",
      provider: PROVIDER_NAME,
      description:
        "Get tasks from a Notion database. Supports filtering by status, assignee, and pagination.",
      inputSchema: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "ID of the Notion database to query",
          },
          filter: {
            type: "object",
            description: "Optional filter criteria",
            properties: {
              status: {
                type: "string",
                description: "Filter by task status",
              },
              assignee: {
                type: "string",
                description: "Filter by assignee ID or name",
              },
            },
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return (default: 50)",
          },
        },
        required: ["databaseId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: { type: "object" },
          },
          hasMore: { type: "boolean" },
          nextCursor: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "notion_create_task",
      provider: PROVIDER_NAME,
      description:
        "Create a new task in a Notion database. Returns the created task object.",
      inputSchema: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "ID of the Notion database to create task in",
          },
          title: {
            type: "string",
            description: "Task title",
          },
          status: {
            type: "string",
            description: "Task status (optional)",
          },
          assignee: {
            type: "string",
            description: "Assignee ID or name (optional)",
          },
          dueDate: {
            type: "string",
            description: "Due date in ISO 8601 format (optional)",
          },
          properties: {
            type: "object",
            description: "Additional Notion properties (optional)",
          },
        },
        required: ["databaseId", "title"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          task: { type: "object" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "notion_update_task",
      provider: PROVIDER_NAME,
      description:
        "Update an existing task in Notion. Returns the updated task object.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to update",
          },
          title: {
            type: "string",
            description: "New task title (optional)",
          },
          status: {
            type: "string",
            description: "New task status (optional)",
          },
          assignee: {
            type: "string",
            description: "New assignee ID or name (optional)",
          },
          dueDate: {
            type: "string",
            description: "New due date in ISO 8601 format (optional)",
          },
          properties: {
            type: "object",
            description: "Additional Notion properties to update (optional)",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          task: { type: "object" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "notion_delete_task",
      provider: PROVIDER_NAME,
      description:
        "Delete (archive) a task in Notion. Returns success status and task ID.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to delete",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          taskId: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool executors (delegate to existing implementation)
// ---------------------------------------------------------------------------

async function executeGetTasks(
  args: Record<string, unknown>,
  context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    // Import the existing implementation dynamically
    const { executeNotionTool } = await import("../../mcp-servers/notion");

    const apiKey = getToken();
    const result = await executeNotionTool(
      apiKey,
      "getTasks",
      args,
      context.organizationId,
      {} as any, // MCPConnection - not used in our simple case
      context.userId,
    );

    logger.info("Notion: fetched tasks", {
      databaseId: args.databaseId,
      count: result.tasks?.length ?? 0,
    });

    return {
      success: true,
      data: result,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion: failed to get tasks", { error: message });
    return {
      success: false,
      error: { code: "NOTION_GET_TASKS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeCreateTask(
  args: Record<string, unknown>,
  context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const { executeNotionTool } = await import("../../mcp-servers/notion");

    const apiKey = getToken();
    const result = await executeNotionTool(
      apiKey,
      "createTask",
      args,
      context.organizationId,
      {} as any,
      context.userId,
    );

    logger.info("Notion: created task", {
      databaseId: args.databaseId,
      title: args.title,
      taskId: result.task?.id,
    });

    return {
      success: true,
      data: result,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion: failed to create task", { error: message });
    return {
      success: false,
      error: { code: "NOTION_CREATE_TASK_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeUpdateTask(
  args: Record<string, unknown>,
  context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const { executeNotionTool } = await import("../../mcp-servers/notion");

    const apiKey = getToken();
    const result = await executeNotionTool(
      apiKey,
      "updateTask",
      args,
      context.organizationId,
      {} as any,
      context.userId,
    );

    logger.info("Notion: updated task", {
      taskId: args.taskId,
    });

    return {
      success: true,
      data: result,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion: failed to update task", { error: message });
    return {
      success: false,
      error: { code: "NOTION_UPDATE_TASK_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeDeleteTask(
  args: Record<string, unknown>,
  context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const { executeNotionTool } = await import("../../mcp-servers/notion");

    const apiKey = getToken();
    const result = await executeNotionTool(
      apiKey,
      "deleteTask",
      args,
      context.organizationId,
      {} as any,
      context.userId,
    );

    logger.info("Notion: deleted task", {
      taskId: args.taskId,
    });

    return {
      success: true,
      data: result,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion: failed to delete task", { error: message });
    return {
      success: false,
      error: { code: "NOTION_DELETE_TASK_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

// ---------------------------------------------------------------------------
// Executor dispatch
// ---------------------------------------------------------------------------

type ToolExecutor = (
  args: Record<string, unknown>,
  context: CallContext,
) => Promise<ToolCallResult>;

const EXECUTORS: Record<string, ToolExecutor> = {
  notion_get_tasks: executeGetTasks,
  notion_create_task: executeCreateTask,
  notion_update_task: executeUpdateTask,
  notion_delete_task: executeDeleteTask,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNotionProvider(): NotionMCPProvider {
  const tools = buildTools();

  logger.info("Notion MCP provider created", {
    toolCount: tools.length,
    tools: tools.map((t) => t.name),
  });

  return {
    name: PROVIDER_NAME,

    getTools(): MCPTool[] {
      return tools;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const executor = EXECUTORS[toolName];

      if (!executor) {
        logger.warn("Notion: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "NOTION_UNKNOWN_TOOL",
            message: `Unknown Notion tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("Notion: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
