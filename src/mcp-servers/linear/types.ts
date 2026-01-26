/**
 * Linear MCP Types
 *
 * 기획:
 * - Linear API와 통신하기 위한 타입 정의
 * - Issue, Team, Project, User 타입
 *
 * 구조:
 * - LinearIssue: Linear Issue 데이터
 * - LinearTeam: Linear Team 정보
 * - MCP Tool 입출력 타입
 */

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    type: string; // backlog, unstarted, started, completed, canceled
  };
  priority: number; // 0=none, 1=urgent, 2=high, 3=normal, 4=low
  priorityLabel: string;
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  project?: {
    id: string;
    name: string;
  };
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  dueDate?: string;
  estimate?: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
  states: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  teamIds: string[];
}

// Tool Input/Output Types

export interface GetIssuesInput {
  teamId?: string;
  projectId?: string;
  assigneeId?: string;
  state?: string; // state name like "In Progress", "Done"
  priority?: number;
  limit?: number;
}

export interface GetIssuesOutput {
  issues: LinearIssue[];
  hasMore: boolean;
  endCursor?: string;
}

export interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
  priority?: number;
  assigneeId?: string;
  stateId?: string;
  projectId?: string;
  labelIds?: string[];
  dueDate?: string;
  estimate?: number;
}

export interface CreateIssueOutput {
  issue: LinearIssue;
}

export interface UpdateIssueInput {
  issueId: string;
  title?: string;
  description?: string;
  priority?: number;
  assigneeId?: string;
  stateId?: string;
  projectId?: string;
  labelIds?: string[];
  dueDate?: string;
  estimate?: number;
}

export interface UpdateIssueOutput {
  issue: LinearIssue;
}

export interface GetTeamsInput {
  limit?: number;
}

export interface GetTeamsOutput {
  teams: LinearTeam[];
}

export interface LinearConnection {
  id: string;
  organizationId: string;
  apiKey: string;
  defaultTeamId?: string;
  createdAt: Date;
  updatedAt: Date;
}
