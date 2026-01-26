export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignee?: {
    id: number;
    login: string;
    avatarUrl: string;
  };
  assignees: Array<{
    id: number;
    login: string;
    avatarUrl: string;
  }>;
  milestone?: {
    id: number;
    number: number;
    title: string;
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  htmlUrl: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: {
    id: number;
    login: string;
    avatarUrl: string;
  };
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    id: number;
    login: string;
    avatarUrl: string;
  }>;
  reviewers: Array<{
    id: number;
    login: string;
    avatarUrl: string;
  }>;
  mergedAt?: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export interface GetIssuesInput {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  labels?: string;
  assignee?: string;
  limit?: number;
}

export interface GetIssuesOutput {
  issues: GitHubIssue[];
}

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface CreateIssueOutput {
  issue: GitHubIssue;
}

export interface UpdateIssueInput {
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
}

export interface UpdateIssueOutput {
  issue: GitHubIssue;
}

export interface GetPullRequestsInput {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  head?: string;
  base?: string;
  limit?: number;
}

export interface GetPullRequestsOutput {
  pullRequests: GitHubPullRequest[];
}

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface CreatePullRequestOutput {
  pullRequest: GitHubPullRequest;
}

export interface GetRepositoriesInput {
  type?: "all" | "owner" | "public" | "private" | "member";
  limit?: number;
}

export interface GetRepositoriesOutput {
  repositories: GitHubRepository[];
}

export interface GitHubConnection {
  id: string;
  organizationId: string;
  accessToken: string;
  defaultOwner?: string;
  createdAt: Date;
  updatedAt: Date;
}
