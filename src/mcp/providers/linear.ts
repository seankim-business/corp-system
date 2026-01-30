import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinearGraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  state: { id: string; name: string };
  assignee?: { id: string; name: string; email: string };
  project?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface LinearProjectNode {
  id: string;
  name: string;
  description?: string;
  state: string;
  startDate?: string;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface LinearMCPProvider {
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

const LINEAR_API_URL = "https://api.linear.app/graphql";
const PROVIDER_NAME = "linear";

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------

async function linearGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable is not set");
  }

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Linear API HTTP ${response.status}: ${body}`);
  }

  const json = (await response.json()) as LinearGraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`Linear GraphQL error: ${messages}`);
  }

  if (json.data === undefined) {
    throw new Error("Linear API returned no data");
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// GraphQL queries & mutations
// ---------------------------------------------------------------------------

const QUERIES = {
  listIssues: `
    query ListIssues($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { id name }
          assignee { id name email }
          project { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `,

  getIssue: `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        priority
        state { id name }
        assignee { id name email }
        project { id name }
        createdAt
        updatedAt
        url
      }
    }
  `,

  searchIssues: `
    query SearchIssues($query: String!, $first: Int) {
      searchIssues(query: $query, first: $first) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { id name }
          assignee { id name email }
          project { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `,

  listProjects: `
    query ListProjects($first: Int) {
      projects(first: $first) {
        nodes {
          id
          name
          description
          state
          startDate
          targetDate
          createdAt
          updatedAt
          url
        }
      }
    }
  `,

  createIssue: `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          state { id name }
          assignee { id name email }
          project { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `,

  updateIssue: `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          state { id name }
          assignee { id name email }
          project { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `,
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const DEFAULT_PERMISSIONS = {
  allowedAgents: ["all"],
};

function buildTools(): MCPTool[] {
  return [
    {
      name: "linear_list_issues",
      provider: PROVIDER_NAME,
      description:
        "List Linear issues with optional filters for project, state, and assignee.",
      inputSchema: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "Filter by project ID",
          },
          stateId: {
            type: "string",
            description: "Filter by workflow state ID",
          },
          assigneeId: {
            type: "string",
            description: "Filter by assignee user ID",
          },
          first: {
            type: "string",
            description:
              "Maximum number of issues to return (default 50, max 250)",
            default: "50",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                identifier: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string" },
                state: { type: "object" },
                assignee: { type: "object" },
                project: { type: "object" },
                createdAt: { type: "string" },
                updatedAt: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "linear_create_issue",
      provider: PROVIDER_NAME,
      description: "Create a new issue in Linear.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Issue title",
          },
          description: {
            type: "string",
            description: "Issue description (supports Markdown)",
          },
          teamId: {
            type: "string",
            description: "Team ID the issue belongs to",
          },
          projectId: {
            type: "string",
            description: "Project ID to associate the issue with",
          },
          assigneeId: {
            type: "string",
            description: "User ID to assign the issue to",
          },
          stateId: {
            type: "string",
            description: "Workflow state ID for the issue",
          },
          priority: {
            type: "string",
            description:
              "Priority level: 0 (none), 1 (urgent), 2 (high), 3 (medium), 4 (low)",
            enum: ["0", "1", "2", "3", "4"],
          },
          labelIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of label IDs to attach",
          },
        },
        required: ["title", "teamId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          issue: {
            type: "object",
            properties: {
              id: { type: "string" },
              identifier: { type: "string" },
              title: { type: "string" },
              url: { type: "string" },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "linear_update_issue",
      provider: PROVIDER_NAME,
      description: "Update an existing Linear issue.",
      inputSchema: {
        type: "object",
        properties: {
          issueId: {
            type: "string",
            description: "The ID of the issue to update",
          },
          title: {
            type: "string",
            description: "New issue title",
          },
          description: {
            type: "string",
            description: "New issue description (supports Markdown)",
          },
          stateId: {
            type: "string",
            description: "New workflow state ID",
          },
          assigneeId: {
            type: "string",
            description: "New assignee user ID",
          },
          priority: {
            type: "string",
            description:
              "New priority level: 0 (none), 1 (urgent), 2 (high), 3 (medium), 4 (low)",
            enum: ["0", "1", "2", "3", "4"],
          },
          projectId: {
            type: "string",
            description: "New project ID",
          },
          labelIds: {
            type: "array",
            items: { type: "string" },
            description: "New set of label IDs",
          },
        },
        required: ["issueId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          issue: {
            type: "object",
            properties: {
              id: { type: "string" },
              identifier: { type: "string" },
              title: { type: "string" },
              url: { type: "string" },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "linear_get_issue",
      provider: PROVIDER_NAME,
      description: "Get details of a specific Linear issue by ID.",
      inputSchema: {
        type: "object",
        properties: {
          issueId: {
            type: "string",
            description:
              "The issue ID (UUID) or identifier (e.g. ENG-123) to look up",
          },
        },
        required: ["issueId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          identifier: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string" },
          state: { type: "object" },
          assignee: { type: "object" },
          project: { type: "object" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
          url: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "linear_list_projects",
      provider: PROVIDER_NAME,
      description: "List projects in the Linear workspace.",
      inputSchema: {
        type: "object",
        properties: {
          first: {
            type: "string",
            description:
              "Maximum number of projects to return (default 50, max 250)",
            default: "50",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          projects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                state: { type: "string" },
                startDate: { type: "string" },
                targetDate: { type: "string" },
                createdAt: { type: "string" },
                updatedAt: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "linear_search_issues",
      provider: PROVIDER_NAME,
      description: "Search Linear issues by text query.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text query to search issues",
          },
          first: {
            type: "string",
            description:
              "Maximum number of results to return (default 50, max 250)",
            default: "50",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                identifier: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string" },
                state: { type: "object" },
                assignee: { type: "object" },
                project: { type: "object" },
                createdAt: { type: "string" },
                updatedAt: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

function parseIntParam(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isNaN(parsed) ? defaultValue : Math.min(Math.max(parsed, 1), 250);
}

async function executeListIssues(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const filter: Record<string, unknown> = {};

    if (args.projectId) {
      filter.project = { id: { eq: args.projectId } };
    }
    if (args.stateId) {
      filter.state = { id: { eq: args.stateId } };
    }
    if (args.assigneeId) {
      filter.assignee = { id: { eq: args.assigneeId } };
    }

    const first = parseIntParam(args.first, 50);

    const variables: Record<string, unknown> = { first };
    if (Object.keys(filter).length > 0) {
      variables.filter = filter;
    }

    const data = await linearGraphQL<{
      issues: { nodes: LinearIssueNode[] };
    }>(QUERIES.listIssues, variables);

    logger.info("Linear: listed issues", { count: data.issues.nodes.length });

    return {
      success: true,
      data: { issues: data.issues.nodes },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to list issues", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_LIST_ISSUES_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeCreateIssue(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const input: Record<string, unknown> = {
      title: args.title,
      teamId: args.teamId,
    };

    if (args.description !== undefined) input.description = args.description;
    if (args.projectId !== undefined) input.projectId = args.projectId;
    if (args.assigneeId !== undefined) input.assigneeId = args.assigneeId;
    if (args.stateId !== undefined) input.stateId = args.stateId;
    if (args.priority !== undefined) input.priority = Number(args.priority);
    if (args.labelIds !== undefined) input.labelIds = args.labelIds;

    const data = await linearGraphQL<{
      issueCreate: { success: boolean; issue: LinearIssueNode };
    }>(QUERIES.createIssue, { input });

    logger.info("Linear: created issue", {
      identifier: data.issueCreate.issue.identifier,
    });

    return {
      success: true,
      data: {
        success: data.issueCreate.success,
        issue: data.issueCreate.issue,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to create issue", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_CREATE_ISSUE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeUpdateIssue(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const { issueId, ...rest } = args;
    const input: Record<string, unknown> = {};

    if (rest.title !== undefined) input.title = rest.title;
    if (rest.description !== undefined) input.description = rest.description;
    if (rest.stateId !== undefined) input.stateId = rest.stateId;
    if (rest.assigneeId !== undefined) input.assigneeId = rest.assigneeId;
    if (rest.priority !== undefined) input.priority = Number(rest.priority);
    if (rest.projectId !== undefined) input.projectId = rest.projectId;
    if (rest.labelIds !== undefined) input.labelIds = rest.labelIds;

    const data = await linearGraphQL<{
      issueUpdate: { success: boolean; issue: LinearIssueNode };
    }>(QUERIES.updateIssue, { id: issueId, input });

    logger.info("Linear: updated issue", {
      identifier: data.issueUpdate.issue.identifier,
    });

    return {
      success: true,
      data: {
        success: data.issueUpdate.success,
        issue: data.issueUpdate.issue,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to update issue", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_UPDATE_ISSUE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetIssue(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const data = await linearGraphQL<{
      issue: LinearIssueNode;
    }>(QUERIES.getIssue, { id: args.issueId });

    logger.info("Linear: fetched issue", {
      identifier: data.issue.identifier,
    });

    return {
      success: true,
      data: data.issue,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to get issue", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_GET_ISSUE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListProjects(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const first = parseIntParam(args.first, 50);

    const data = await linearGraphQL<{
      projects: { nodes: LinearProjectNode[] };
    }>(QUERIES.listProjects, { first });

    logger.info("Linear: listed projects", {
      count: data.projects.nodes.length,
    });

    return {
      success: true,
      data: { projects: data.projects.nodes },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to list projects", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_LIST_PROJECTS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeSearchIssues(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const first = parseIntParam(args.first, 50);

    const data = await linearGraphQL<{
      searchIssues: { nodes: LinearIssueNode[] };
    }>(QUERIES.searchIssues, { query: args.query, first });

    logger.info("Linear: searched issues", {
      query: args.query,
      count: data.searchIssues.nodes.length,
    });

    return {
      success: true,
      data: { issues: data.searchIssues.nodes },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Linear: failed to search issues", { error: message });
    return {
      success: false,
      error: { code: "LINEAR_SEARCH_ISSUES_ERROR", message },
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
  linear_list_issues: executeListIssues,
  linear_create_issue: executeCreateIssue,
  linear_update_issue: executeUpdateIssue,
  linear_get_issue: executeGetIssue,
  linear_list_projects: executeListProjects,
  linear_search_issues: executeSearchIssues,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLinearProvider(): LinearMCPProvider {
  const tools = buildTools();

  logger.info("Linear MCP provider created", {
    toolCount: tools.length,
    tools: tools.map((t) => t.name),
  });

  return {
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
        logger.warn("Linear: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "LINEAR_UNKNOWN_TOOL",
            message: `Unknown Linear tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("Linear: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
