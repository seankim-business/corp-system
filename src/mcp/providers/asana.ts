import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASANA_API_BASE = "https://app.asana.com/api/1.0";
const PROVIDER_NAME = "asana";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) {
    throw new Error("ASANA_ACCESS_TOKEN environment variable is not set");
  }
  return token;
}

function getWorkspaceGid(): string {
  const gid = process.env.ASANA_WORKSPACE_GID;
  if (!gid) {
    throw new Error("ASANA_WORKSPACE_GID environment variable is not set");
  }
  return gid;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface AsanaErrorBody {
  errors?: Array<{ message: string; help?: string }>;
}

async function asanaFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${ASANA_API_BASE}${path}`;

  logger.debug("Asana API request", { method: options.method ?? "GET", path });

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as AsanaErrorBody;
      detail = body.errors?.map((e) => e.message).join("; ") ?? "";
    } catch {
      detail = response.statusText;
    }

    const message = `Asana API error ${response.status}: ${detail}`;
    logger.error("Asana API error", {
      status: response.status,
      detail,
      path,
    });
    throw new Error(message);
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

// ---------------------------------------------------------------------------
// Tool result builder
// ---------------------------------------------------------------------------

function successResult(data: unknown, startTime: number): ToolCallResult {
  return {
    success: true,
    data,
    metadata: {
      duration: Date.now() - startTime,
      cached: false,
    },
  };
}

function errorResult(
  code: string,
  message: string,
  startTime: number,
  details?: Record<string, unknown>,
): ToolCallResult {
  return {
    success: false,
    error: { code, message, details },
    metadata: {
      duration: Date.now() - startTime,
      cached: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const asanaListTasks: MCPTool = {
  name: "asana_list_tasks",
  provider: PROVIDER_NAME,
  description: "List tasks in an Asana project",
  inputSchema: {
    type: "object",
    properties: {
      project_gid: {
        type: "string",
        description: "The GID of the project whose tasks to list",
      },
      completed_since: {
        type: "string",
        description:
          "Only return tasks completed since this ISO 8601 datetime. Use 'now' to return only incomplete tasks.",
      },
      opt_fields: {
        type: "string",
        description:
          "Comma-separated list of optional fields to include (e.g. 'name,assignee,due_on,completed')",
      },
      limit: {
        type: "string",
        description: "Maximum number of results to return (1-100, default 20)",
      },
      offset: {
        type: "string",
        description: "Pagination offset token returned from a previous request",
      },
    },
    required: ["project_gid"],
  },
  outputSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gid: { type: "string" },
            name: { type: "string" },
            completed: { type: "string" },
            due_on: { type: "string" },
          },
        },
        description: "Array of task objects",
      },
      next_page: {
        type: "object",
        description: "Pagination info for the next page",
      },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaCreateTask: MCPTool = {
  name: "asana_create_task",
  provider: PROVIDER_NAME,
  description: "Create a new task in Asana",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name / title of the task",
      },
      project_gid: {
        type: "string",
        description:
          "The GID of the project to add the task to. If omitted the task is created in the default workspace.",
      },
      notes: {
        type: "string",
        description: "Plain-text description / notes for the task",
      },
      html_notes: {
        type: "string",
        description: "Rich-text (HTML) description for the task",
      },
      due_on: {
        type: "string",
        description: "Due date in YYYY-MM-DD format",
      },
      assignee: {
        type: "string",
        description:
          "Assignee — either an email address or a user GID, or 'me'",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Array of tag GIDs to attach",
      },
      parent: {
        type: "string",
        description: "GID of a parent task to make this a subtask of",
      },
    },
    required: ["name"],
  },
  outputSchema: {
    type: "object",
    properties: {
      gid: { type: "string", description: "The GID of the created task" },
      name: { type: "string" },
      permalink_url: { type: "string" },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaUpdateTask: MCPTool = {
  name: "asana_update_task",
  provider: PROVIDER_NAME,
  description: "Update an existing Asana task",
  inputSchema: {
    type: "object",
    properties: {
      task_gid: {
        type: "string",
        description: "The GID of the task to update",
      },
      name: {
        type: "string",
        description: "New name for the task",
      },
      notes: {
        type: "string",
        description: "Updated plain-text notes",
      },
      html_notes: {
        type: "string",
        description: "Updated rich-text (HTML) notes",
      },
      due_on: {
        type: "string",
        description: "New due date in YYYY-MM-DD format, or null to clear",
      },
      completed: {
        type: "string",
        description: "Set to 'true' to mark complete or 'false' to reopen",
      },
      assignee: {
        type: "string",
        description: "New assignee (email, user GID, or 'me')",
      },
    },
    required: ["task_gid"],
  },
  outputSchema: {
    type: "object",
    properties: {
      gid: { type: "string" },
      name: { type: "string" },
      completed: { type: "string" },
      permalink_url: { type: "string" },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaGetTask: MCPTool = {
  name: "asana_get_task",
  provider: PROVIDER_NAME,
  description: "Get details of an Asana task by its GID",
  inputSchema: {
    type: "object",
    properties: {
      task_gid: {
        type: "string",
        description: "The GID of the task to retrieve",
      },
      opt_fields: {
        type: "string",
        description:
          "Comma-separated list of optional fields (e.g. 'name,assignee,due_on,completed,notes,tags')",
      },
    },
    required: ["task_gid"],
  },
  outputSchema: {
    type: "object",
    properties: {
      gid: { type: "string" },
      name: { type: "string" },
      notes: { type: "string" },
      completed: { type: "string" },
      due_on: { type: "string" },
      assignee: { type: "object" },
      tags: { type: "array", items: { type: "object" } },
      permalink_url: { type: "string" },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaListProjects: MCPTool = {
  name: "asana_list_projects",
  provider: PROVIDER_NAME,
  description: "List projects in the configured Asana workspace",
  inputSchema: {
    type: "object",
    properties: {
      archived: {
        type: "string",
        description: "Filter by archived status: 'true' or 'false'",
      },
      opt_fields: {
        type: "string",
        description:
          "Comma-separated list of optional fields (e.g. 'name,owner,due_date,color')",
      },
      limit: {
        type: "string",
        description: "Maximum number of results (1-100, default 20)",
      },
      offset: {
        type: "string",
        description: "Pagination offset token",
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gid: { type: "string" },
            name: { type: "string" },
          },
        },
      },
      next_page: { type: "object" },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaSearchTasks: MCPTool = {
  name: "asana_search_tasks",
  provider: PROVIDER_NAME,
  description: "Search tasks in the configured Asana workspace by text",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to search for in task names and descriptions",
      },
      completed: {
        type: "string",
        description: "Filter by completion: 'true' or 'false'",
      },
      assignee: {
        type: "string",
        description: "Filter by assignee (user GID or 'me')",
      },
      project_gid: {
        type: "string",
        description: "Limit search to a specific project",
      },
      opt_fields: {
        type: "string",
        description: "Comma-separated optional fields to include",
      },
      limit: {
        type: "string",
        description: "Maximum results (1-100, default 20)",
      },
    },
    required: ["text"],
  },
  outputSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gid: { type: "string" },
            name: { type: "string" },
            completed: { type: "string" },
          },
        },
      },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

const asanaAddComment: MCPTool = {
  name: "asana_add_comment",
  provider: PROVIDER_NAME,
  description: "Add a comment (story) to an Asana task",
  inputSchema: {
    type: "object",
    properties: {
      task_gid: {
        type: "string",
        description: "The GID of the task to comment on",
      },
      text: {
        type: "string",
        description: "Plain-text body of the comment",
      },
      html_text: {
        type: "string",
        description: "Rich-text (HTML) body of the comment",
      },
    },
    required: ["task_gid", "text"],
  },
  outputSchema: {
    type: "object",
    properties: {
      gid: { type: "string", description: "The GID of the created story" },
      text: { type: "string" },
      created_at: { type: "string" },
    },
  },
  requiresAuth: true,
  permissions: {
    allowedAgents: ["all"],
  },
};

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function executeListTasks(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const projectGid = args.project_gid as string;
  const params = new URLSearchParams();

  if (args.completed_since) params.set("completed_since", String(args.completed_since));
  if (args.opt_fields) params.set("opt_fields", String(args.opt_fields));
  if (args.limit) params.set("limit", String(args.limit));
  if (args.offset) params.set("offset", String(args.offset));

  const qs = params.toString();
  const path = `/tasks?project=${encodeURIComponent(projectGid)}${qs ? `&${qs}` : ""}`;

  const tasks = await asanaFetch<unknown[]>(path);
  logger.info("Asana: listed tasks", { projectGid, count: tasks.length });
  return { tasks };
}

async function executeCreateTask(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const workspaceGid = getWorkspaceGid();

  const body: Record<string, unknown> = {
    workspace: workspaceGid,
    name: args.name,
  };

  if (args.project_gid) {
    body.projects = [args.project_gid];
  }
  if (args.notes !== undefined) body.notes = args.notes;
  if (args.html_notes !== undefined) body.html_notes = args.html_notes;
  if (args.due_on !== undefined) body.due_on = args.due_on;
  if (args.assignee !== undefined) body.assignee = args.assignee;
  if (args.tags !== undefined) body.tags = args.tags;
  if (args.parent !== undefined) body.parent = args.parent;

  const task = await asanaFetch<Record<string, unknown>>("/tasks", {
    method: "POST",
    body: JSON.stringify({ data: body }),
  });

  logger.info("Asana: created task", { gid: task.gid, name: task.name });
  return task;
}

async function executeUpdateTask(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const taskGid = args.task_gid as string;

  const body: Record<string, unknown> = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.notes !== undefined) body.notes = args.notes;
  if (args.html_notes !== undefined) body.html_notes = args.html_notes;
  if (args.due_on !== undefined) body.due_on = args.due_on;
  if (args.assignee !== undefined) body.assignee = args.assignee;
  if (args.completed !== undefined) body.completed = args.completed === "true";

  const task = await asanaFetch<Record<string, unknown>>(
    `/tasks/${encodeURIComponent(taskGid)}`,
    {
      method: "PUT",
      body: JSON.stringify({ data: body }),
    },
  );

  logger.info("Asana: updated task", { gid: task.gid });
  return task;
}

async function executeGetTask(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const taskGid = args.task_gid as string;
  const params = new URLSearchParams();

  if (args.opt_fields) params.set("opt_fields", String(args.opt_fields));

  const qs = params.toString();
  const path = `/tasks/${encodeURIComponent(taskGid)}${qs ? `?${qs}` : ""}`;

  const task = await asanaFetch<Record<string, unknown>>(path);
  logger.info("Asana: fetched task", { gid: task.gid });
  return task;
}

async function executeListProjects(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const workspaceGid = getWorkspaceGid();
  const params = new URLSearchParams();
  params.set("workspace", workspaceGid);

  if (args.archived !== undefined) params.set("archived", String(args.archived));
  if (args.opt_fields) params.set("opt_fields", String(args.opt_fields));
  if (args.limit) params.set("limit", String(args.limit));
  if (args.offset) params.set("offset", String(args.offset));

  const projects = await asanaFetch<unknown[]>(`/projects?${params.toString()}`);
  logger.info("Asana: listed projects", { count: projects.length });
  return { projects };
}

async function executeSearchTasks(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const workspaceGid = getWorkspaceGid();
  const params = new URLSearchParams();
  params.set("text", String(args.text));

  if (args.completed !== undefined) {
    params.set("completed", String(args.completed));
  }
  if (args.assignee) {
    params.set("assignee.any", String(args.assignee));
  }
  if (args.project_gid) {
    params.set("projects.any", String(args.project_gid));
  }
  if (args.opt_fields) params.set("opt_fields", String(args.opt_fields));
  if (args.limit) params.set("limit", String(args.limit));

  const tasks = await asanaFetch<unknown[]>(
    `/workspaces/${encodeURIComponent(workspaceGid)}/tasks/search?${params.toString()}`,
  );

  logger.info("Asana: searched tasks", { query: args.text, count: tasks.length });
  return { tasks };
}

async function executeAddComment(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<unknown> {
  const taskGid = args.task_gid as string;

  const body: Record<string, unknown> = {
    text: args.text,
  };
  if (args.html_text !== undefined) body.html_text = args.html_text;

  const story = await asanaFetch<Record<string, unknown>>(
    `/tasks/${encodeURIComponent(taskGid)}/stories`,
    {
      method: "POST",
      body: JSON.stringify({ data: body }),
    },
  );

  logger.info("Asana: added comment", { taskGid, storyGid: story.gid });
  return story;
}

// ---------------------------------------------------------------------------
// Executor dispatch map
// ---------------------------------------------------------------------------

type ToolExecutorFn = (
  args: Record<string, unknown>,
  context: CallContext,
) => Promise<unknown>;

const executors: Record<string, ToolExecutorFn> = {
  asana_list_tasks: executeListTasks,
  asana_create_task: executeCreateTask,
  asana_update_task: executeUpdateTask,
  asana_get_task: executeGetTask,
  asana_list_projects: executeListProjects,
  asana_search_tasks: executeSearchTasks,
  asana_add_comment: executeAddComment,
};

// ---------------------------------------------------------------------------
// Provider interface and factory
// ---------------------------------------------------------------------------

export interface AsanaMCPProvider {
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult>;
}

export function createAsanaProvider(): AsanaMCPProvider {
  const tools: MCPTool[] = [
    asanaListTasks,
    asanaCreateTask,
    asanaUpdateTask,
    asanaGetTask,
    asanaListProjects,
    asanaSearchTasks,
    asanaAddComment,
  ];

  const toolMap = new Map<string, MCPTool>(tools.map((t) => [t.name, t]));

  logger.info("Asana MCP provider created", {
    toolCount: tools.length,
    tools: tools.map((t) => t.name),
  });

  return {
    getTools(): MCPTool[] {
      return [...tools];
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      const tool = toolMap.get(toolName);
      if (!tool) {
        logger.warn("Asana: unknown tool requested", { toolName });
        return errorResult(
          "TOOL_NOT_FOUND",
          `Unknown Asana tool: ${toolName}`,
          startTime,
          { toolName },
        );
      }

      const executor = executors[toolName];
      if (!executor) {
        logger.error("Asana: no executor for tool", { toolName });
        return errorResult(
          "EXECUTOR_NOT_FOUND",
          `No executor registered for tool: ${toolName}`,
          startTime,
          { toolName },
        );
      }

      try {
        // Validate required env vars early so the error message is clear
        getAccessToken();

        const data = await executor(args, context);

        logger.debug("Asana: tool execution succeeded", {
          toolName,
          duration: Date.now() - startTime,
        });

        return successResult(data, startTime);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Asana: tool execution failed", {
          toolName,
          error: message,
          duration: Date.now() - startTime,
        });

        return errorResult("EXECUTION_ERROR", message, startTime, {
          toolName,
          originalError: message,
        });
      }
    },
  };
}
