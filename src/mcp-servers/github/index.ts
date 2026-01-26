import { getIssuesTool } from "./tools/getIssues";
import { createIssueTool } from "./tools/createIssue";
import { updateIssueTool } from "./tools/updateIssue";
import { getPullRequestsTool } from "./tools/getPullRequests";
import { createPullRequestTool } from "./tools/createPullRequest";
import { getRepositoriesTool } from "./tools/getRepositories";
import { validateToolAccess } from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";

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
): Promise<any> {
  const parsed = validateToolAccess(toolName, "github", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  switch (resolvedToolName) {
    case "getIssues":
      return await getIssuesTool(accessToken, input);

    case "createIssue":
      return await createIssueTool(accessToken, input);

    case "updateIssue":
      return await updateIssueTool(accessToken, input);

    case "getPullRequests":
      return await getPullRequestsTool(accessToken, input);

    case "createPullRequest":
      return await createPullRequestTool(accessToken, input);

    case "getRepositories":
      return await getRepositoriesTool(accessToken, input);

    default:
      throw new Error(`Unknown GitHub tool: ${toolName}`);
  }
}

export * from "./types";
export { GitHubClient } from "./client";
