import { getCircuitBreaker } from "../../utils/circuit-breaker";
import {
  acquireMcpClient,
  getAccessTokenFromConfig,
  isTokenExpired,
  refreshOAuthToken,
} from "../../services/mcp-registry";
import { recordMcpToolCall } from "../../services/metrics";
import {
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubFileContent,
  GitHubReference,
  GetIssuesInput,
  CreateIssueInput,
  UpdateIssueInput,
  GetPullRequestsInput,
  CreatePullRequestInput,
  GetFileInput,
  GetReferenceInput,
  CreateBranchInput,
  CreateBranchOutput,
  CreateOrUpdateFileInput,
  CreateOrUpdateFileOutput,
  AddLabelsInput,
} from "./types";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { MCPConnection } from "../../orchestrator/types";
import { decrypt } from "../../utils/encryption";

const GITHUB_API_URL = "https://api.github.com";

const tracer = trace.getTracer("mcp-github");

const formatToolSpanName = (toolName: string): string =>
  toolName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

export class GitHubClient {
  private accessToken: string;
  private connectionId?: string;
  private expiresAt?: Date | null;
  private organizationId?: string;
  private userId?: string;
  private circuitBreaker = getCircuitBreaker("github-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(
    accessToken: string,
    options?: {
      connectionId?: string;
      expiresAt?: Date | null;
      organizationId?: string;
      userId?: string;
    },
  ) {
    this.accessToken = accessToken;
    this.connectionId = options?.connectionId;
    this.expiresAt = options?.expiresAt ?? null;
    this.organizationId = options?.organizationId;
    this.userId = options?.userId;
  }

  setContext(options: {
    connectionId?: string;
    expiresAt?: Date | null;
    organizationId?: string;
    userId?: string;
  }): void {
    this.connectionId = options.connectionId;
    this.expiresAt = options.expiresAt ?? null;
    this.organizationId = options.organizationId;
    this.userId = options.userId;
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.connectionId || !isTokenExpired(this.expiresAt ?? null)) {
      return;
    }

    const refreshed = await refreshOAuthToken(this.connectionId);
    const nextToken = getAccessTokenFromConfig(refreshed.config);

    if (!nextToken) {
      throw new Error("Refreshed GitHub token missing access token");
    }

    this.accessToken = nextToken;
    this.expiresAt = refreshed.expiresAt ?? null;
  }

  private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      await this.ensureFreshToken();
      return operation();
    });
  }

  private async executeWithMetrics<T>(
    toolName: string,
    spanAttributes: Record<string, string | number | boolean> = {},
    operation: () => Promise<T>,
    onSuccess?: (result: T, span: Span) => void,
  ): Promise<T> {
    const start = Date.now();
    const spanName = `mcp.github.${formatToolSpanName(toolName)}`;
    const environment = process.env.NODE_ENV || "development";

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        span.setAttribute("mcp.provider", "github");
        span.setAttribute("mcp.tool", toolName);
        span.setAttribute("environment", environment);

        if (this.connectionId) {
          span.setAttribute("mcp.connection_id", this.connectionId);
        }

        if (this.organizationId) {
          span.setAttribute("organization.id", this.organizationId);
        }

        if (this.userId) {
          span.setAttribute("user.id", this.userId);
        }

        Object.entries(spanAttributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });

        const result = await this.executeWithAuth(operation);
        recordMcpToolCall({
          provider: "github",
          toolName,
          success: true,
          duration: Date.now() - start,
        });
        if (onSuccess) {
          onSuccess(result, span);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        recordMcpToolCall({
          provider: "github",
          toolName,
          success: false,
          duration: Date.now() - start,
        });
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API_URL}${endpoint}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  async getIssues(input: GetIssuesInput): Promise<GitHubIssue[]> {
    return this.executeWithMetrics(
      "getIssues",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        ...(input.state ? { "github.state": input.state } : {}),
        ...(input.labels ? { "github.labels": input.labels } : {}),
        ...(input.assignee ? { "github.assignee": input.assignee } : {}),
        "github.limit": input.limit ?? 30,
      },
      async () => {
        const { owner, repo, state = "open", labels, assignee, limit = 30 } = input;

        const params = new URLSearchParams();
        params.set("state", state);
        params.set("per_page", String(limit));
        if (labels) params.set("labels", labels);
        if (assignee) params.set("assignee", assignee);

        const issues = await this.request<any[]>(
          "GET",
          `/repos/${owner}/${repo}/issues?${params.toString()}`,
        );

        const results = issues
          .filter((item) => !item.pull_request)
          .map((issue) => this.mapIssue(issue));
        return results;
      },
      (result, span) => {
        span.setAttribute("result.count", result.length);
      },
    );
  }

  async createIssue(input: CreateIssueInput): Promise<GitHubIssue> {
    return this.executeWithMetrics(
      "createIssue",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
      },
      async () => {
        const { owner, repo, ...body } = input;

        const issue = await this.request<any>("POST", `/repos/${owner}/${repo}/issues`, body);

        return this.mapIssue(issue);
      },
      (issue, span) => {
        span.setAttribute("github.issue_number", issue.number);
      },
    );
  }

  async updateIssue(input: UpdateIssueInput): Promise<GitHubIssue> {
    return this.executeWithMetrics(
      "updateIssue",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.issue_number": input.issueNumber,
      },
      async () => {
        const { owner, repo, issueNumber, ...updates } = input;

        const body: Record<string, any> = {};
        if (updates.title !== undefined) body.title = updates.title;
        if (updates.body !== undefined) body.body = updates.body;
        if (updates.state !== undefined) body.state = updates.state;
        if (updates.labels !== undefined) body.labels = updates.labels;
        if (updates.assignees !== undefined) body.assignees = updates.assignees;
        if (updates.milestone !== undefined) body.milestone = updates.milestone;

        const issue = await this.request<any>(
          "PATCH",
          `/repos/${owner}/${repo}/issues/${issueNumber}`,
          body,
        );

        return this.mapIssue(issue);
      },
      (issue, span) => {
        span.setAttribute("github.updated_issue_number", issue.number);
      },
    );
  }

  async getPullRequests(input: GetPullRequestsInput): Promise<GitHubPullRequest[]> {
    return this.executeWithMetrics(
      "getPullRequests",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        ...(input.state ? { "github.state": input.state } : {}),
        ...(input.head ? { "github.head": input.head } : {}),
        ...(input.base ? { "github.base": input.base } : {}),
        "github.limit": input.limit ?? 30,
      },
      async () => {
        const { owner, repo, state = "open", head, base, limit = 30 } = input;

        const params = new URLSearchParams();
        params.set("state", state);
        params.set("per_page", String(limit));
        if (head) params.set("head", head);
        if (base) params.set("base", base);

        const prs = await this.request<any[]>(
          "GET",
          `/repos/${owner}/${repo}/pulls?${params.toString()}`,
        );

        const results = prs.map((pr) => this.mapPullRequest(pr));
        return results;
      },
      (result, span) => {
        span.setAttribute("result.count", result.length);
      },
    );
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<GitHubPullRequest> {
    return this.executeWithMetrics(
      "createPullRequest",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
      },
      async () => {
        const { owner, repo, ...body } = input;

        const pr = await this.request<any>("POST", `/repos/${owner}/${repo}/pulls`, body);

        return this.mapPullRequest(pr);
      },
      (pr, span) => {
        span.setAttribute("github.pull_request_number", pr.number);
      },
    );
  }

  async getRepositories(
    type: "all" | "owner" | "public" | "private" | "member" = "all",
    limit = 30,
  ): Promise<GitHubRepository[]> {
    return this.executeWithMetrics(
      "getRepositories",
      {
        "github.type": type,
        "github.limit": limit,
      },
      async () => {
        const params = new URLSearchParams();
        params.set("type", type);
        params.set("per_page", String(limit));
        params.set("sort", "updated");
        params.set("direction", "desc");

        const repos = await this.request<any[]>("GET", `/user/repos?${params.toString()}`);

        const results = repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
        }));
        return results;
      },
      (result, span) => {
        span.setAttribute("result.count", result.length);
      },
    );
  }

  async getFile(input: GetFileInput): Promise<GitHubFileContent> {
    return this.executeWithMetrics(
      "getFile",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.path": input.path,
        ...(input.ref ? { "github.ref": input.ref } : {}),
      },
      async () => {
        const { owner, repo, path, ref } = input;
        const params = new URLSearchParams();
        if (ref) params.set("ref", ref);

        const queryString = params.toString();
        const endpoint = `/repos/${owner}/${repo}/contents/${path}${queryString ? `?${queryString}` : ""}`;

        const response = await this.request<any>("GET", endpoint);

        if (Array.isArray(response)) {
          throw new Error(`Path "${path}" is a directory, not a file`);
        }

        if (response.type !== "file") {
          throw new Error(`Path "${path}" is not a file (type: ${response.type})`);
        }

        const content =
          response.encoding === "base64"
            ? Buffer.from(response.content, "base64").toString("utf-8")
            : response.content;

        return {
          name: response.name,
          path: response.path,
          sha: response.sha,
          size: response.size,
          content,
          encoding: "utf-8",
          htmlUrl: response.html_url,
          downloadUrl: response.download_url,
        };
      },
      (file, span) => {
        span.setAttribute("github.file_size", file.size);
      },
    );
  }

  async getReference(input: GetReferenceInput): Promise<GitHubReference> {
    return this.executeWithMetrics(
      "getReference",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.ref": input.ref,
      },
      async () => {
        const { owner, repo, ref } = input;
        const response = await this.request<any>("GET", `/repos/${owner}/${repo}/git/ref/${ref}`);

        return {
          ref: response.ref,
          sha: response.object.sha,
          url: response.url,
        };
      },
      (result, span) => {
        span.setAttribute("github.ref_sha", result.sha);
      },
    );
  }

  async createBranch(input: CreateBranchInput): Promise<CreateBranchOutput> {
    return this.executeWithMetrics(
      "createBranch",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.branch": input.branchName,
      },
      async () => {
        const { owner, repo, branchName, fromRef = "heads/main" } = input;

        const sourceRef = await this.getReference({ owner, repo, ref: fromRef });

        const response = await this.request<any>("POST", `/repos/${owner}/${repo}/git/refs`, {
          ref: `refs/heads/${branchName}`,
          sha: sourceRef.sha,
        });

        return {
          ref: response.ref,
          sha: response.object.sha,
        };
      },
      (result, span) => {
        span.setAttribute("github.created_branch_sha", result.sha);
      },
    );
  }

  async createOrUpdateFile(input: CreateOrUpdateFileInput): Promise<CreateOrUpdateFileOutput> {
    return this.executeWithMetrics(
      "createOrUpdateFile",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.path": input.path,
        ...(input.branch ? { "github.branch": input.branch } : {}),
      },
      async () => {
        const { owner, repo, path, message, content, branch, sha } = input;

        const encodedContent = Buffer.from(content, "utf-8").toString("base64");

        const body: Record<string, any> = {
          message,
          content: encodedContent,
        };

        if (branch) body.branch = branch;
        if (sha) body.sha = sha;

        const response = await this.request<any>(
          "PUT",
          `/repos/${owner}/${repo}/contents/${path}`,
          body,
        );

        return {
          path: response.content.path,
          sha: response.content.sha,
          htmlUrl: response.content.html_url,
        };
      },
      (result, span) => {
        span.setAttribute("github.file_sha", result.sha);
      },
    );
  }

  async addLabels(input: AddLabelsInput): Promise<void> {
    return this.executeWithMetrics(
      "addLabels",
      {
        "github.owner": input.owner,
        "github.repo": input.repo,
        "github.issue_number": input.issueNumber,
      },
      async () => {
        const { owner, repo, issueNumber, labels } = input;

        await this.request<any>("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
          labels,
        });
      },
    );
  }

  async getFileSha(input: GetFileInput): Promise<string | null> {
    try {
      const file = await this.getFile(input);
      return file.sha;
    } catch {
      return null;
    }
  }

  private mapIssue(issue: any): GitHubIssue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      assignee: issue.assignee
        ? {
            id: issue.assignee.id,
            login: issue.assignee.login,
            avatarUrl: issue.assignee.avatar_url,
          }
        : undefined,
      assignees: (issue.assignees || []).map((a: any) => ({
        id: a.id,
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
      milestone: issue.milestone
        ? {
            id: issue.milestone.id,
            number: issue.milestone.number,
            title: issue.milestone.title,
          }
        : undefined,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      htmlUrl: issue.html_url,
    };
  }

  private mapPullRequest(pr: any): GitHubPullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.merged_at ? "merged" : pr.state,
      draft: pr.draft,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      user: {
        id: pr.user.id,
        login: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      labels: pr.labels.map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      assignees: (pr.assignees || []).map((a: any) => ({
        id: a.id,
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
      reviewers: (pr.requested_reviewers || []).map((r: any) => ({
        id: r.id,
        login: r.login,
        avatarUrl: r.avatar_url,
      })),
      mergedAt: pr.merged_at,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      htmlUrl: pr.html_url,
    };
  }
}

type GitHubClientFactoryOptions = {
  accessToken: string;
  connection?: MCPConnection;
  organizationId?: string;
  userId?: string;
};

const resolveGitHubToken = (accessToken: string, connection?: MCPConnection): string => {
  const fromConfig = connection ? getAccessTokenFromConfig(connection.config) : null;
  return fromConfig || decrypt(accessToken);
};

export async function getGitHubClient(
  options: GitHubClientFactoryOptions,
): Promise<{ client: GitHubClient; release: () => void }> {
  const organizationId = options.connection?.organizationId ?? options.organizationId;
  const token = resolveGitHubToken(options.accessToken, options.connection);
  if (!organizationId) {
    return {
      client: new GitHubClient(token, {
        connectionId: options.connection?.id,
        expiresAt: options.connection?.expiresAt ?? null,
        organizationId: options.organizationId,
        userId: options.userId,
      }),
      release: () => undefined,
    };
  }

  const credentials = {
    accessToken: token,
    refreshToken: options.connection?.refreshToken ?? null,
  };

  const { client, release } = await acquireMcpClient({
    provider: "github",
    organizationId,
    credentials,
    createClient: () =>
      new GitHubClient(token, {
        connectionId: options.connection?.id,
        expiresAt: options.connection?.expiresAt ?? null,
        organizationId,
        userId: options.userId,
      }),
  });

  client.setContext({
    connectionId: options.connection?.id,
    expiresAt: options.connection?.expiresAt ?? null,
    organizationId,
    userId: options.userId,
  });

  return { client, release };
}
