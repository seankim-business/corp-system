import { getIssuesTool } from "./tools/getIssues";
import { createIssueTool } from "./tools/createIssue";
import { updateIssueTool } from "./tools/updateIssue";
import { getPullRequestsTool } from "./tools/getPullRequests";
import { createPullRequestTool } from "./tools/createPullRequest";
import { getRepositoriesTool } from "./tools/getRepositories";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { recordMcpToolCall } from "../../services/metrics";

const legacyToolMap: Record<string, string> = {
  get_issues: "getIssues",
  create_issue: "createIssue",
  update_issue: "updateIssue",
  get_pull_requests: "getPullRequests",
  create_pull_request: "createPullRequest",
  get_repositories: "getRepositories",
};

export function registerTools(): string[] {
  return [
    "github__getIssues",
    "github__createIssue",
    "github__updateIssue",
    "github__getPullRequests",
    "github__createPullRequest",
    "github__getRepositories",
  ];
}

export async function executeGitHubTool(
  accessToken: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "github", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "github",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        switch (resolvedToolName) {
          case "getIssues":
            return await getIssuesTool(accessToken, input, connection, userId);

          case "createIssue":
            return await createIssueTool(accessToken, input, connection, userId);

          case "updateIssue":
            return await updateIssueTool(accessToken, input, connection, userId);

          case "getPullRequests":
            return await getPullRequestsTool(accessToken, input, connection, userId);

          case "createPullRequest":
            return await createPullRequestTool(accessToken, input, connection, userId);

          case "getRepositories":
            return await getRepositoriesTool(accessToken, input, connection, userId);

          default:
            throw new Error(`Unknown GitHub tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "github",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

export * from "./types";
export { GitHubClient, getGitHubClient } from "./client";
