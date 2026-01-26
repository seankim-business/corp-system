import { getCircuitBreaker } from "../../utils/circuit-breaker";
import {
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GetIssuesInput,
  CreateIssueInput,
  UpdateIssueInput,
  GetPullRequestsInput,
  CreatePullRequestInput,
} from "./types";

const GITHUB_API_URL = "https://api.github.com";

export class GitHubClient {
  private accessToken: string;
  private circuitBreaker = getCircuitBreaker("github-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(accessToken: string) {
    this.accessToken = accessToken;
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
    return this.circuitBreaker.execute(async () => {
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

      return issues.filter((item) => !item.pull_request).map((issue) => this.mapIssue(issue));
    });
  }

  async createIssue(input: CreateIssueInput): Promise<GitHubIssue> {
    return this.circuitBreaker.execute(async () => {
      const { owner, repo, ...body } = input;

      const issue = await this.request<any>("POST", `/repos/${owner}/${repo}/issues`, body);

      return this.mapIssue(issue);
    });
  }

  async updateIssue(input: UpdateIssueInput): Promise<GitHubIssue> {
    return this.circuitBreaker.execute(async () => {
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
    });
  }

  async getPullRequests(input: GetPullRequestsInput): Promise<GitHubPullRequest[]> {
    return this.circuitBreaker.execute(async () => {
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

      return prs.map((pr) => this.mapPullRequest(pr));
    });
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<GitHubPullRequest> {
    return this.circuitBreaker.execute(async () => {
      const { owner, repo, ...body } = input;

      const pr = await this.request<any>("POST", `/repos/${owner}/${repo}/pulls`, body);

      return this.mapPullRequest(pr);
    });
  }

  async getRepositories(
    type: "all" | "owner" | "public" | "private" | "member" = "all",
    limit = 30,
  ): Promise<GitHubRepository[]> {
    return this.circuitBreaker.execute(async () => {
      const params = new URLSearchParams();
      params.set("type", type);
      params.set("per_page", String(limit));
      params.set("sort", "updated");
      params.set("direction", "desc");

      const repos = await this.request<any[]>("GET", `/user/repos?${params.toString()}`);

      return repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
      }));
    });
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
