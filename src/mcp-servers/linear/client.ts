/**
 * Linear API Client
 *
 * 기획:
 * - Linear GraphQL API와 통신
 * - Circuit breaker 패턴으로 장애 격리
 *
 * 구조:
 * - graphql(): GraphQL 쿼리 실행
 * - getIssues(): Issue 목록 조회
 * - createIssue(): Issue 생성
 * - updateIssue(): Issue 수정
 * - getTeams(): Team 목록 조회
 */

import { getCircuitBreaker } from "../../utils/circuit-breaker";
import {
  LinearIssue,
  LinearTeam,
  GetIssuesInput,
  CreateIssueInput,
  UpdateIssueInput,
} from "./types";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export class LinearClient {
  private apiKey: string;
  private circuitBreaker = getCircuitBreaker("linear-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Linear API error: ${response.status} ${text}`);
    }

    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object") {
      throw new Error("Linear GraphQL response is not an object");
    }

    const json = raw as { data?: T; errors?: unknown[] };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    if (!json.data) {
      throw new Error("Linear GraphQL response missing data");
    }

    return json.data;
  }

  async getIssues(
    input: GetIssuesInput,
  ): Promise<{ issues: LinearIssue[]; hasMore: boolean; endCursor?: string }> {
    return this.circuitBreaker.execute(async () => {
      const { teamId, projectId, assigneeId, state, priority, limit = 50 } = input;

      // Build filter object
      const filter: Record<string, any> = {};
      if (teamId) filter.team = { id: { eq: teamId } };
      if (projectId) filter.project = { id: { eq: projectId } };
      if (assigneeId) filter.assignee = { id: { eq: assigneeId } };
      if (state) filter.state = { name: { eq: state } };
      if (priority !== undefined) filter.priority = { eq: priority };

      const query = `
        query GetIssues($filter: IssueFilter, $first: Int) {
          issues(filter: $filter, first: $first) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              identifier
              title
              description
              priority
              priorityLabel
              dueDate
              estimate
              createdAt
              updatedAt
              url
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                email
              }
              team {
                id
                name
                key
              }
              project {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `;

      const data = await this.graphql<{
        issues: {
          pageInfo: { hasNextPage: boolean; endCursor?: string };
          nodes: any[];
        };
      }>(query, {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: limit,
      });

      const issues: LinearIssue[] = data.issues.nodes.map((node) => ({
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description,
        priority: node.priority,
        priorityLabel: node.priorityLabel,
        dueDate: node.dueDate,
        estimate: node.estimate,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        url: node.url,
        state: node.state,
        assignee: node.assignee,
        team: node.team,
        project: node.project,
        labels: node.labels?.nodes || [],
      }));

      return {
        issues,
        hasMore: data.issues.pageInfo.hasNextPage,
        endCursor: data.issues.pageInfo.endCursor,
      };
    });
  }

  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    return this.circuitBreaker.execute(async () => {
      const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              priority
              priorityLabel
              dueDate
              estimate
              createdAt
              updatedAt
              url
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                email
              }
              team {
                id
                name
                key
              }
              project {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `;

      const data = await this.graphql<{
        issueCreate: {
          success: boolean;
          issue: any;
        };
      }>(mutation, {
        input: {
          teamId: input.teamId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          assigneeId: input.assigneeId,
          stateId: input.stateId,
          projectId: input.projectId,
          labelIds: input.labelIds,
          dueDate: input.dueDate,
          estimate: input.estimate,
        },
      });

      if (!data.issueCreate.success) {
        throw new Error("Failed to create issue");
      }

      const node = data.issueCreate.issue;
      return {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description,
        priority: node.priority,
        priorityLabel: node.priorityLabel,
        dueDate: node.dueDate,
        estimate: node.estimate,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        url: node.url,
        state: node.state,
        assignee: node.assignee,
        team: node.team,
        project: node.project,
        labels: node.labels?.nodes || [],
      };
    });
  }

  async updateIssue(input: UpdateIssueInput): Promise<LinearIssue> {
    return this.circuitBreaker.execute(async () => {
      const { issueId, ...updates } = input;

      const mutation = `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              priority
              priorityLabel
              dueDate
              estimate
              createdAt
              updatedAt
              url
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                email
              }
              team {
                id
                name
                key
              }
              project {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `;

      const updateInput: Record<string, any> = {};
      if (updates.title) updateInput.title = updates.title;
      if (updates.description !== undefined) updateInput.description = updates.description;
      if (updates.priority !== undefined) updateInput.priority = updates.priority;
      if (updates.assigneeId) updateInput.assigneeId = updates.assigneeId;
      if (updates.stateId) updateInput.stateId = updates.stateId;
      if (updates.projectId) updateInput.projectId = updates.projectId;
      if (updates.labelIds) updateInput.labelIds = updates.labelIds;
      if (updates.dueDate) updateInput.dueDate = updates.dueDate;
      if (updates.estimate !== undefined) updateInput.estimate = updates.estimate;

      const data = await this.graphql<{
        issueUpdate: {
          success: boolean;
          issue: any;
        };
      }>(mutation, {
        id: issueId,
        input: updateInput,
      });

      if (!data.issueUpdate.success) {
        throw new Error("Failed to update issue");
      }

      const node = data.issueUpdate.issue;
      return {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description,
        priority: node.priority,
        priorityLabel: node.priorityLabel,
        dueDate: node.dueDate,
        estimate: node.estimate,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        url: node.url,
        state: node.state,
        assignee: node.assignee,
        team: node.team,
        project: node.project,
        labels: node.labels?.nodes || [],
      };
    });
  }

  async getTeams(limit = 50): Promise<LinearTeam[]> {
    return this.circuitBreaker.execute(async () => {
      const query = `
        query GetTeams($first: Int) {
          teams(first: $first) {
            nodes {
              id
              name
              key
              description
              states {
                nodes {
                  id
                  name
                  type
                }
              }
            }
          }
        }
      `;

      const data = await this.graphql<{
        teams: {
          nodes: any[];
        };
      }>(query, { first: limit });

      return data.teams.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        key: node.key,
        description: node.description,
        states: node.states?.nodes || [],
      }));
    });
  }
}
