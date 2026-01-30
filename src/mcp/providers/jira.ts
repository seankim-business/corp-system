import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

function getJiraConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Jira configuration incomplete. Required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN",
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function buildAuthHeader(email: string, apiToken: string): string {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${credentials}`;
}

interface JiraRequestOptions {
  method: string;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
}

async function jiraRequest<T = unknown>(options: JiraRequestOptions): Promise<T> {
  const config = getJiraConfig();
  const url = new URL(`${config.baseUrl}/rest/api/3/${options.path}`);

  if (options.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(config.email, config.apiToken),
    Accept: "application/json",
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError: unknown;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = errorBody;
    }
    throw new Error(
      `Jira API error ${response.status}: ${JSON.stringify(parsedError)}`,
    );
  }

  // Some Jira endpoints return 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const PROVIDER_NAME = "jira";

function buildTools(): MCPTool[] {
  return [
    // 1. jira_list_issues
    {
      name: "jira_list_issues",
      provider: PROVIDER_NAME,
      description: "Search for Jira issues using JQL (Jira Query Language). Returns paginated results.",
      inputSchema: {
        type: "object",
        properties: {
          jql: {
            type: "string",
            description:
              "JQL query string (e.g. 'project = MY_PROJECT AND status = \"In Progress\"')",
          },
          maxResults: {
            type: "string",
            description: "Maximum number of results to return (default: 50, max: 100)",
            default: "50",
          },
          startAt: {
            type: "string",
            description: "Index of the first result to return (default: 0)",
            default: "0",
          },
          fields: {
            type: "string",
            description:
              "Comma-separated list of fields to include (e.g. 'summary,status,assignee'). Defaults to key fields.",
          },
        },
        required: ["jql"],
      },
      outputSchema: {
        type: "object",
        properties: {
          total: { type: "string", description: "Total number of matching issues" },
          startAt: { type: "string", description: "Index of the first returned result" },
          maxResults: { type: "string", description: "Maximum results per page" },
          issues: {
            type: "object",
            description: "Array of issue objects",
            additionalProperties: true,
          },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },

    // 2. jira_create_issue
    {
      name: "jira_create_issue",
      provider: PROVIDER_NAME,
      description: "Create a new Jira issue in a specified project.",
      inputSchema: {
        type: "object",
        properties: {
          projectKey: {
            type: "string",
            description: "Project key (e.g. 'PROJ')",
          },
          summary: {
            type: "string",
            description: "Issue summary / title",
          },
          issueType: {
            type: "string",
            description: "Issue type name (e.g. 'Task', 'Bug', 'Story')",
          },
          description: {
            type: "string",
            description:
              "Issue description in plain text. Will be converted to Atlassian Document Format.",
          },
          assigneeAccountId: {
            type: "string",
            description: "Atlassian account ID of the assignee (optional)",
          },
          priority: {
            type: "string",
            description: "Priority name (e.g. 'High', 'Medium', 'Low')",
          },
          labels: {
            type: "string",
            description: "Comma-separated list of labels",
          },
          parentKey: {
            type: "string",
            description: "Parent issue key for subtasks (e.g. 'PROJ-123')",
          },
        },
        required: ["projectKey", "summary", "issueType"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Newly created issue ID" },
          key: { type: "string", description: "Newly created issue key" },
          self: { type: "string", description: "API URL of the new issue" },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
        requiresApproval: {
          condition: "issueType == 'Epic'",
          approver: "tech_lead",
        },
      },
    },

    // 3. jira_update_issue
    {
      name: "jira_update_issue",
      provider: PROVIDER_NAME,
      description: "Update fields on an existing Jira issue.",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "Issue key (e.g. 'PROJ-123')",
          },
          summary: {
            type: "string",
            description: "Updated summary / title",
          },
          description: {
            type: "string",
            description: "Updated description in plain text",
          },
          assigneeAccountId: {
            type: "string",
            description: "Atlassian account ID of the new assignee",
          },
          priority: {
            type: "string",
            description: "Updated priority name",
          },
          labels: {
            type: "string",
            description: "Comma-separated list of labels to set",
          },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "string", description: "Whether the update succeeded" },
          issueKey: { type: "string", description: "The updated issue key" },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },

    // 4. jira_get_issue
    {
      name: "jira_get_issue",
      provider: PROVIDER_NAME,
      description: "Get detailed information about a specific Jira issue by key.",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "Issue key (e.g. 'PROJ-123')",
          },
          fields: {
            type: "string",
            description:
              "Comma-separated list of fields to include. Defaults to all navigable fields.",
          },
          expand: {
            type: "string",
            description:
              "Comma-separated list of entities to expand (e.g. 'renderedFields,transitions,changelog')",
          },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Issue ID" },
          key: { type: "string", description: "Issue key" },
          fields: {
            type: "object",
            description: "Issue field values",
            additionalProperties: true,
          },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },

    // 5. jira_transition_issue
    {
      name: "jira_transition_issue",
      provider: PROVIDER_NAME,
      description:
        "Transition a Jira issue to a new status (e.g. 'In Progress', 'Done'). If transitionId is not provided, attempts to find the transition by name.",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "Issue key (e.g. 'PROJ-123')",
          },
          transitionId: {
            type: "string",
            description: "Numeric transition ID. Takes precedence over transitionName.",
          },
          transitionName: {
            type: "string",
            description:
              "Transition name to match (case-insensitive). Used when transitionId is not provided.",
          },
          comment: {
            type: "string",
            description: "Optional comment to add during the transition",
          },
        },
        required: ["issueKey"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "string", description: "Whether the transition succeeded" },
          issueKey: { type: "string", description: "The transitioned issue key" },
          transitionId: { type: "string", description: "The transition ID used" },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },

    // 6. jira_add_comment
    {
      name: "jira_add_comment",
      provider: PROVIDER_NAME,
      description: "Add a comment to an existing Jira issue.",
      inputSchema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "Issue key (e.g. 'PROJ-123')",
          },
          body: {
            type: "string",
            description: "Comment body in plain text",
          },
          visibility: {
            type: "string",
            description:
              "Visibility restriction type. Either 'role' or 'group'. If set, visibilityValue is required.",
            enum: ["role", "group"],
          },
          visibilityValue: {
            type: "string",
            description: "The role name or group name for visibility restriction",
          },
        },
        required: ["issueKey", "body"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Comment ID" },
          self: { type: "string", description: "API URL of the comment" },
          created: { type: "string", description: "Creation timestamp" },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },

    // 7. jira_list_projects
    {
      name: "jira_list_projects",
      provider: PROVIDER_NAME,
      description: "List all accessible Jira projects, optionally filtered by query.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Filter projects by name or key (optional)",
          },
          maxResults: {
            type: "string",
            description: "Maximum number of results (default: 50)",
            default: "50",
          },
          startAt: {
            type: "string",
            description: "Index of first result (default: 0)",
            default: "0",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          total: { type: "string", description: "Total matching projects" },
          projects: {
            type: "object",
            description: "Array of project objects",
            additionalProperties: true,
          },
        },
      },
      requiresAuth: true,
      permissions: {
        allowedAgents: ["all"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

interface ListIssuesArgs {
  jql: string;
  maxResults?: string;
  startAt?: string;
  fields?: string;
}

async function executeListIssues(args: ListIssuesArgs, _context: CallContext): Promise<unknown> {
  const queryParams: Record<string, string> = {
    jql: args.jql,
    maxResults: args.maxResults ?? "50",
    startAt: args.startAt ?? "0",
  };

  if (args.fields) {
    queryParams.fields = args.fields;
  }

  logger.info("Jira: searching issues", { jql: args.jql });

  const result = await jiraRequest({
    method: "GET",
    path: "search",
    queryParams,
  });

  return result;
}

interface CreateIssueArgs {
  projectKey: string;
  summary: string;
  issueType: string;
  description?: string;
  assigneeAccountId?: string;
  priority?: string;
  labels?: string;
  parentKey?: string;
}

async function executeCreateIssue(args: CreateIssueArgs, _context: CallContext): Promise<unknown> {
  const fields: Record<string, unknown> = {
    project: { key: args.projectKey },
    summary: args.summary,
    issuetype: { name: args.issueType },
  };

  if (args.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: args.description,
            },
          ],
        },
      ],
    };
  }

  if (args.assigneeAccountId) {
    fields.assignee = { accountId: args.assigneeAccountId };
  }

  if (args.priority) {
    fields.priority = { name: args.priority };
  }

  if (args.labels) {
    fields.labels = args.labels.split(",").map((l) => l.trim());
  }

  if (args.parentKey) {
    fields.parent = { key: args.parentKey };
  }

  logger.info("Jira: creating issue", {
    project: args.projectKey,
    type: args.issueType,
    summary: args.summary,
  });

  const result = await jiraRequest({
    method: "POST",
    path: "issue",
    body: { fields },
  });

  return result;
}

interface UpdateIssueArgs {
  issueKey: string;
  summary?: string;
  description?: string;
  assigneeAccountId?: string;
  priority?: string;
  labels?: string;
}

async function executeUpdateIssue(args: UpdateIssueArgs, _context: CallContext): Promise<unknown> {
  const fields: Record<string, unknown> = {};

  if (args.summary) {
    fields.summary = args.summary;
  }

  if (args.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: args.description,
            },
          ],
        },
      ],
    };
  }

  if (args.assigneeAccountId) {
    fields.assignee = { accountId: args.assigneeAccountId };
  }

  if (args.priority) {
    fields.priority = { name: args.priority };
  }

  if (args.labels) {
    fields.labels = args.labels.split(",").map((l) => l.trim());
  }

  if (Object.keys(fields).length === 0) {
    return { success: true, issueKey: args.issueKey, message: "No fields to update" };
  }

  logger.info("Jira: updating issue", {
    issueKey: args.issueKey,
    fieldsUpdated: Object.keys(fields),
  });

  await jiraRequest({
    method: "PUT",
    path: `issue/${encodeURIComponent(args.issueKey)}`,
    body: { fields },
  });

  return { success: true, issueKey: args.issueKey };
}

interface GetIssueArgs {
  issueKey: string;
  fields?: string;
  expand?: string;
}

async function executeGetIssue(args: GetIssueArgs, _context: CallContext): Promise<unknown> {
  const queryParams: Record<string, string> = {};

  if (args.fields) {
    queryParams.fields = args.fields;
  }

  if (args.expand) {
    queryParams.expand = args.expand;
  }

  logger.debug("Jira: fetching issue", { issueKey: args.issueKey });

  const result = await jiraRequest({
    method: "GET",
    path: `issue/${encodeURIComponent(args.issueKey)}`,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  });

  return result;
}

interface TransitionIssueArgs {
  issueKey: string;
  transitionId?: string;
  transitionName?: string;
  comment?: string;
}

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

async function executeTransitionIssue(
  args: TransitionIssueArgs,
  _context: CallContext,
): Promise<unknown> {
  let resolvedTransitionId = args.transitionId;

  if (!resolvedTransitionId && !args.transitionName) {
    throw new Error("Either transitionId or transitionName must be provided");
  }

  // Look up transition by name if no ID given
  if (!resolvedTransitionId && args.transitionName) {
    const transitionsResponse = await jiraRequest<JiraTransitionsResponse>({
      method: "GET",
      path: `issue/${encodeURIComponent(args.issueKey)}/transitions`,
    });

    const match = transitionsResponse.transitions.find(
      (t) => t.name.toLowerCase() === args.transitionName!.toLowerCase(),
    );

    if (!match) {
      const available = transitionsResponse.transitions.map((t) => `${t.name} (${t.id})`);
      throw new Error(
        `Transition "${args.transitionName}" not found. Available transitions: ${available.join(", ")}`,
      );
    }

    resolvedTransitionId = match.id;
  }

  const body: Record<string, unknown> = {
    transition: { id: resolvedTransitionId },
  };

  if (args.comment) {
    body.update = {
      comment: [
        {
          add: {
            body: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: args.comment,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
  }

  logger.info("Jira: transitioning issue", {
    issueKey: args.issueKey,
    transitionId: resolvedTransitionId,
  });

  await jiraRequest({
    method: "POST",
    path: `issue/${encodeURIComponent(args.issueKey)}/transitions`,
    body,
  });

  return { success: true, issueKey: args.issueKey, transitionId: resolvedTransitionId };
}

interface AddCommentArgs {
  issueKey: string;
  body: string;
  visibility?: "role" | "group";
  visibilityValue?: string;
}

async function executeAddComment(args: AddCommentArgs, _context: CallContext): Promise<unknown> {
  const requestBody: Record<string, unknown> = {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: args.body,
            },
          ],
        },
      ],
    },
  };

  if (args.visibility && args.visibilityValue) {
    requestBody.visibility = {
      type: args.visibility,
      value: args.visibilityValue,
    };
  }

  logger.info("Jira: adding comment", { issueKey: args.issueKey });

  const result = await jiraRequest({
    method: "POST",
    path: `issue/${encodeURIComponent(args.issueKey)}/comment`,
    body: requestBody,
  });

  return result;
}

interface ListProjectsArgs {
  query?: string;
  maxResults?: string;
  startAt?: string;
}

async function executeListProjects(
  args: ListProjectsArgs,
  _context: CallContext,
): Promise<unknown> {
  const queryParams: Record<string, string> = {
    maxResults: args.maxResults ?? "50",
    startAt: args.startAt ?? "0",
  };

  if (args.query) {
    queryParams.query = args.query;
  }

  logger.info("Jira: listing projects", { query: args.query });

  const result = await jiraRequest({
    method: "GET",
    path: "project/search",
    queryParams,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Tool router
// ---------------------------------------------------------------------------

type ToolExecutorFn = (args: Record<string, unknown>, context: CallContext) => Promise<unknown>;

function buildExecutorMap(): Record<string, ToolExecutorFn> {
  return {
    jira_list_issues: (args, ctx) => executeListIssues(args as unknown as ListIssuesArgs, ctx),
    jira_create_issue: (args, ctx) => executeCreateIssue(args as unknown as CreateIssueArgs, ctx),
    jira_update_issue: (args, ctx) => executeUpdateIssue(args as unknown as UpdateIssueArgs, ctx),
    jira_get_issue: (args, ctx) => executeGetIssue(args as unknown as GetIssueArgs, ctx),
    jira_transition_issue: (args, ctx) =>
      executeTransitionIssue(args as unknown as TransitionIssueArgs, ctx),
    jira_add_comment: (args, ctx) => executeAddComment(args as unknown as AddCommentArgs, ctx),
    jira_list_projects: (args, ctx) =>
      executeListProjects(args as unknown as ListProjectsArgs, ctx),
  };
}

// ---------------------------------------------------------------------------
// Provider interface & factory
// ---------------------------------------------------------------------------

export interface JiraMCPProvider {
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult>;
}

export function createJiraProvider(): JiraMCPProvider {
  const tools = buildTools();
  const executors = buildExecutorMap();

  return {
    getTools(): MCPTool[] {
      return tools;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      const executor = executors[toolName];
      if (!executor) {
        logger.warn("Jira provider: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Unknown Jira tool: ${toolName}`,
            details: { toolName, availableTools: Object.keys(executors) },
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }

      try {
        const data = await executor(args, context);
        const duration = Date.now() - startTime;

        logger.debug("Jira tool executed successfully", { toolName, duration });

        return {
          success: true,
          data,
          metadata: {
            duration,
            cached: false,
          },
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Jira tool execution failed", {
          toolName,
          error: message,
          duration,
        });

        return {
          success: false,
          error: {
            code: "TOOL_EXECUTION_ERROR",
            message,
            details: { toolName, args },
          },
          metadata: {
            duration,
            cached: false,
          },
        };
      }
    },
  };
}
