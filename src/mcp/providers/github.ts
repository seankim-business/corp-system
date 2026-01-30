import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  archived: boolean;
  topics: string[];
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ id: number; name: string; color: string }>;
  assignees: Array<{ login: string; id: number }>;
  milestone: { id: number; title: string; number: number } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string; id: number };
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  head: { ref: string; sha: string; label: string };
  base: { ref: string; sha: string; label: string };
  labels: Array<{ id: number; name: string; color: string }>;
  assignees: Array<{ login: string; id: number }>;
  requested_reviewers: Array<{ login: string; id: number }>;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string; id: number };
}

interface GitHubSearchCodeResult {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
    };
    score: number;
  }>;
}

interface GitHubPaginatedResponse<T> {
  data: T;
  nextPage: number | null;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface GitHubMCPProvider {
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

const GITHUB_API_URL = "https://api.github.com";
const PROVIDER_NAME = "github";
const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub token not configured. Set GITHUB_TOKEN or GITHUB_ACCESS_TOKEN environment variable.",
    );
  }
  return token;
}

function buildHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/**
 * Parse the RFC 5988 Link header returned by the GitHub API to extract
 * the next page number, if any.
 */
function parseNextPageFromLinkHeader(linkHeader: string | null): number | null {
  if (!linkHeader) return null;

  const nextMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
  if (nextMatch && nextMatch[1]) {
    return parseInt(nextMatch[1], 10);
  }
  return null;
}

async function githubRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<GitHubPaginatedResponse<T>> {
  const { method = "GET", body, query } = options;
  const url = new URL(`${GITHUB_API_URL}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage: string;
    try {
      const parsed = JSON.parse(errorBody) as { message?: string };
      errorMessage = parsed.message || errorBody;
    } catch {
      errorMessage = errorBody;
    }
    throw new Error(`GitHub API HTTP ${response.status}: ${errorMessage}`);
  }

  const linkHeader = response.headers.get("Link");
  const nextPage = parseNextPageFromLinkHeader(linkHeader);

  const data = (await response.json()) as T;

  return { data, nextPage };
}

/**
 * Fetch all pages of a paginated GitHub endpoint, up to the specified maximum
 * number of items.
 */
async function githubPaginatedRequest<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  maxItems: number = DEFAULT_PER_PAGE,
): Promise<T[]> {
  const perPage = Math.min(maxItems, MAX_PER_PAGE);
  const allItems: T[] = [];
  let page = 1;

  while (allItems.length < maxItems) {
    const result = await githubRequest<T[]>(path, {
      query: { ...query, per_page: perPage, page },
    });

    allItems.push(...result.data);

    if (!result.nextPage || result.data.length < perPage) {
      break;
    }

    page = result.nextPage;
  }

  return allItems.slice(0, maxItems);
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
      name: "github_list_repos",
      provider: PROVIDER_NAME,
      description:
        "List repositories for the authenticated user, or for a specified organization.",
      inputSchema: {
        type: "object",
        properties: {
          org: {
            type: "string",
            description:
              "Organization login name. If omitted, lists repositories for the authenticated user.",
          },
          type: {
            type: "string",
            description:
              "Type of repositories to list. For user: all, owner, public, private, member. For org: all, public, private, forks, sources, member.",
            enum: ["all", "owner", "public", "private", "member", "forks", "sources"],
          },
          sort: {
            type: "string",
            description: "Property to sort by.",
            enum: ["created", "updated", "pushed", "full_name"],
          },
          direction: {
            type: "string",
            description: "Sort direction.",
            enum: ["asc", "desc"],
          },
          per_page: {
            type: "string",
            description: "Number of results per page (default 30, max 100).",
            default: "30",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          repositories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                full_name: { type: "string" },
                description: { type: "string" },
                private: { type: "boolean" },
                html_url: { type: "string" },
                language: { type: "string" },
                default_branch: { type: "string" },
                stargazers_count: { type: "string" },
                forks_count: { type: "string" },
                open_issues_count: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_get_repo",
      provider: PROVIDER_NAME,
      description: "Get detailed information about a specific GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
        },
        required: ["owner", "repo"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          full_name: { type: "string" },
          description: { type: "string" },
          private: { type: "boolean" },
          html_url: { type: "string" },
          language: { type: "string" },
          default_branch: { type: "string" },
          stargazers_count: { type: "string" },
          forks_count: { type: "string" },
          open_issues_count: { type: "string" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
          pushed_at: { type: "string" },
          archived: { type: "boolean" },
          topics: { type: "array", items: { type: "string" } },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_list_issues",
      provider: PROVIDER_NAME,
      description:
        "List issues for a repository with optional filters for state, labels, assignee, and milestone.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
          state: {
            type: "string",
            description: "Filter by issue state.",
            enum: ["open", "closed", "all"],
            default: "open",
          },
          labels: {
            type: "string",
            description:
              "Comma-separated list of label names to filter by.",
          },
          assignee: {
            type: "string",
            description:
              "Filter by assignee login. Use '*' for any, 'none' for unassigned.",
          },
          milestone: {
            type: "string",
            description:
              "Milestone number to filter by. Use '*' for any, 'none' for no milestone.",
          },
          sort: {
            type: "string",
            description: "Property to sort by.",
            enum: ["created", "updated", "comments"],
          },
          direction: {
            type: "string",
            description: "Sort direction.",
            enum: ["asc", "desc"],
          },
          per_page: {
            type: "string",
            description: "Number of results per page (default 30, max 100).",
            default: "30",
          },
        },
        required: ["owner", "repo"],
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
                number: { type: "string" },
                title: { type: "string" },
                body: { type: "string" },
                state: { type: "string" },
                html_url: { type: "string" },
                labels: { type: "array" },
                assignees: { type: "array" },
                created_at: { type: "string" },
                updated_at: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_create_issue",
      provider: PROVIDER_NAME,
      description: "Create a new issue in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
          title: {
            type: "string",
            description: "Issue title.",
          },
          body: {
            type: "string",
            description: "Issue body (supports Markdown).",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Array of label names to apply.",
          },
          assignees: {
            type: "array",
            items: { type: "string" },
            description: "Array of user logins to assign.",
          },
          milestone: {
            type: "string",
            description: "Milestone number to associate with.",
          },
        },
        required: ["owner", "repo", "title"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          number: { type: "string" },
          title: { type: "string" },
          html_url: { type: "string" },
          state: { type: "string" },
          created_at: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_list_prs",
      provider: PROVIDER_NAME,
      description:
        "List pull requests for a repository with optional filters for state, head, and base branch.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
          state: {
            type: "string",
            description: "Filter by PR state.",
            enum: ["open", "closed", "all"],
            default: "open",
          },
          head: {
            type: "string",
            description:
              "Filter by head branch. Format: user:ref-name or org:ref-name.",
          },
          base: {
            type: "string",
            description: "Filter by base branch name.",
          },
          sort: {
            type: "string",
            description: "Property to sort by.",
            enum: ["created", "updated", "popularity", "long-running"],
          },
          direction: {
            type: "string",
            description: "Sort direction.",
            enum: ["asc", "desc"],
          },
          per_page: {
            type: "string",
            description: "Number of results per page (default 30, max 100).",
            default: "30",
          },
        },
        required: ["owner", "repo"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          pull_requests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                number: { type: "string" },
                title: { type: "string" },
                state: { type: "string" },
                html_url: { type: "string" },
                head: { type: "object" },
                base: { type: "object" },
                draft: { type: "boolean" },
                merged: { type: "boolean" },
                created_at: { type: "string" },
                updated_at: { type: "string" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_get_pr",
      provider: PROVIDER_NAME,
      description: "Get detailed information about a specific pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
          pull_number: {
            type: "string",
            description: "Pull request number.",
          },
        },
        required: ["owner", "repo", "pull_number"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          number: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          state: { type: "string" },
          html_url: { type: "string" },
          head: { type: "object" },
          base: { type: "object" },
          labels: { type: "array" },
          assignees: { type: "array" },
          requested_reviewers: { type: "array" },
          draft: { type: "boolean" },
          merged: { type: "boolean" },
          mergeable: { type: "boolean" },
          merged_at: { type: "string" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
          closed_at: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_create_pr_review",
      provider: PROVIDER_NAME,
      description:
        "Create a review comment on a pull request. Supports approve, request changes, or comment.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (user or organization login).",
          },
          repo: {
            type: "string",
            description: "Repository name.",
          },
          pull_number: {
            type: "string",
            description: "Pull request number.",
          },
          body: {
            type: "string",
            description: "Review comment body (supports Markdown).",
          },
          event: {
            type: "string",
            description: "The review action to perform.",
            enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"],
          },
        },
        required: ["owner", "repo", "pull_number", "event"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          state: { type: "string" },
          html_url: { type: "string" },
          body: { type: "string" },
          submitted_at: { type: "string" },
          user: { type: "object" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "github_search_code",
      provider: PROVIDER_NAME,
      description:
        "Search code across GitHub repositories. Supports qualifiers like language, repo, org, path, and filename.",
      inputSchema: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description:
              "Search query. Supports GitHub code search qualifiers (e.g., 'addClass in:file language:js repo:jquery/jquery').",
          },
          sort: {
            type: "string",
            description: "Sort field. Can only be 'indexed'.",
            enum: ["indexed"],
          },
          order: {
            type: "string",
            description: "Sort order.",
            enum: ["asc", "desc"],
          },
          per_page: {
            type: "string",
            description: "Number of results per page (default 30, max 100).",
            default: "30",
          },
          page: {
            type: "string",
            description: "Page number for pagination (default 1).",
            default: "1",
          },
        },
        required: ["q"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          total_count: { type: "string" },
          incomplete_results: { type: "boolean" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                path: { type: "string" },
                sha: { type: "string" },
                html_url: { type: "string" },
                repository: { type: "object" },
                score: { type: "string" },
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

function parseIntParam(value: unknown, defaultValue: number, max: number = MAX_PER_PAGE): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isNaN(parsed) ? defaultValue : Math.min(Math.max(parsed, 1), max);
}

async function executeListRepos(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const perPage = parseIntParam(args.per_page, DEFAULT_PER_PAGE);
    const org = args.org as string | undefined;

    const path = org ? `/orgs/${encodeURIComponent(org)}/repos` : "/user/repos";
    const query: Record<string, string | number | undefined> = {};

    if (args.type) query.type = String(args.type);
    if (args.sort) query.sort = String(args.sort);
    if (args.direction) query.direction = String(args.direction);

    const repositories = await githubPaginatedRequest<GitHubRepository>(
      path,
      query,
      perPage,
    );

    logger.info("GitHub: listed repositories", {
      count: repositories.length,
      org: org || "authenticated user",
    });

    return {
      success: true,
      data: { repositories },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to list repositories", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_LIST_REPOS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetRepo(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const owner = args.owner as string;
    const repo = args.repo as string;

    const result = await githubRequest<GitHubRepository>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );

    logger.info("GitHub: fetched repository", { full_name: result.data.full_name });

    return {
      success: true,
      data: result.data,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to get repository", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_GET_REPO_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListIssues(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const perPage = parseIntParam(args.per_page, DEFAULT_PER_PAGE);

    const query: Record<string, string | number | undefined> = {};
    if (args.state) query.state = String(args.state);
    if (args.labels) query.labels = String(args.labels);
    if (args.assignee) query.assignee = String(args.assignee);
    if (args.milestone) query.milestone = String(args.milestone);
    if (args.sort) query.sort = String(args.sort);
    if (args.direction) query.direction = String(args.direction);

    const issues = await githubPaginatedRequest<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      query,
      perPage,
    );

    logger.info("GitHub: listed issues", {
      count: issues.length,
      repo: `${owner}/${repo}`,
    });

    return {
      success: true,
      data: { issues },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to list issues", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_LIST_ISSUES_ERROR", message },
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
    const owner = args.owner as string;
    const repo = args.repo as string;

    const body: Record<string, unknown> = {
      title: args.title,
    };

    if (args.body !== undefined) body.body = args.body;
    if (args.labels !== undefined) body.labels = args.labels;
    if (args.assignees !== undefined) body.assignees = args.assignees;
    if (args.milestone !== undefined) body.milestone = Number(args.milestone);

    const result = await githubRequest<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      { method: "POST", body },
    );

    logger.info("GitHub: created issue", {
      number: result.data.number,
      repo: `${owner}/${repo}`,
    });

    return {
      success: true,
      data: result.data,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to create issue", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_CREATE_ISSUE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListPRs(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const perPage = parseIntParam(args.per_page, DEFAULT_PER_PAGE);

    const query: Record<string, string | number | undefined> = {};
    if (args.state) query.state = String(args.state);
    if (args.head) query.head = String(args.head);
    if (args.base) query.base = String(args.base);
    if (args.sort) query.sort = String(args.sort);
    if (args.direction) query.direction = String(args.direction);

    const pullRequests = await githubPaginatedRequest<GitHubPullRequest>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      query,
      perPage,
    );

    logger.info("GitHub: listed pull requests", {
      count: pullRequests.length,
      repo: `${owner}/${repo}`,
    });

    return {
      success: true,
      data: { pull_requests: pullRequests },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to list pull requests", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_LIST_PRS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetPR(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const pullNumber = parseIntParam(args.pull_number, 0, Number.MAX_SAFE_INTEGER);

    if (pullNumber === 0) {
      throw new Error("pull_number is required and must be a positive integer");
    }

    const result = await githubRequest<GitHubPullRequest>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
    );

    logger.info("GitHub: fetched pull request", {
      number: result.data.number,
      repo: `${owner}/${repo}`,
    });

    return {
      success: true,
      data: result.data,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to get pull request", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_GET_PR_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeCreatePRReview(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const pullNumber = parseIntParam(args.pull_number, 0, Number.MAX_SAFE_INTEGER);

    if (pullNumber === 0) {
      throw new Error("pull_number is required and must be a positive integer");
    }

    const body: Record<string, unknown> = {
      event: args.event,
    };

    if (args.body !== undefined) body.body = args.body;

    const result = await githubRequest<{
      id: number;
      state: string;
      html_url: string;
      body: string;
      submitted_at: string;
      user: { login: string; id: number };
    }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews`,
      { method: "POST", body },
    );

    logger.info("GitHub: created PR review", {
      pullNumber,
      event: args.event,
      repo: `${owner}/${repo}`,
    });

    return {
      success: true,
      data: result.data,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to create PR review", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_CREATE_PR_REVIEW_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeSearchCode(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const q = args.q as string;
    const perPage = parseIntParam(args.per_page, DEFAULT_PER_PAGE);
    const page = parseIntParam(args.page, 1, 100);

    const query: Record<string, string | number | undefined> = {
      q,
      per_page: perPage,
      page,
    };

    if (args.sort) query.sort = String(args.sort);
    if (args.order) query.order = String(args.order);

    const result = await githubRequest<GitHubSearchCodeResult>("/search/code", {
      query,
    });

    logger.info("GitHub: searched code", {
      query: q,
      total_count: result.data.total_count,
      returned: result.data.items.length,
    });

    return {
      success: true,
      data: {
        total_count: result.data.total_count,
        incomplete_results: result.data.incomplete_results,
        items: result.data.items,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("GitHub: failed to search code", { error: message });
    return {
      success: false,
      error: { code: "GITHUB_SEARCH_CODE_ERROR", message },
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
  github_list_repos: executeListRepos,
  github_get_repo: executeGetRepo,
  github_list_issues: executeListIssues,
  github_create_issue: executeCreateIssue,
  github_list_prs: executeListPRs,
  github_get_pr: executeGetPR,
  github_create_pr_review: executeCreatePRReview,
  github_search_code: executeSearchCode,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGitHubProvider(): GitHubMCPProvider {
  const tools = buildTools();

  logger.info("GitHub MCP provider created", {
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
        logger.warn("GitHub: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "GITHUB_UNKNOWN_TOOL",
            message: `Unknown GitHub tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("GitHub: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
