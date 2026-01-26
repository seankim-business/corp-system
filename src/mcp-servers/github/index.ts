import { getIssuesTool } from "./tools/getIssues";
import { createIssueTool } from "./tools/createIssue";
import { updateIssueTool } from "./tools/updateIssue";
import { getPullRequestsTool } from "./tools/getPullRequests";
import { createPullRequestTool } from "./tools/createPullRequest";
import { getRepositoriesTool } from "./tools/getRepositories";

export async function executeGitHubTool(
  accessToken: string,
  toolName: string,
  input: any,
): Promise<any> {
  switch (toolName) {
    case "github_get_issues":
      return await getIssuesTool(accessToken, input);

    case "github_create_issue":
      return await createIssueTool(accessToken, input);

    case "github_update_issue":
      return await updateIssueTool(accessToken, input);

    case "github_get_pull_requests":
      return await getPullRequestsTool(accessToken, input);

    case "github_create_pull_request":
      return await createPullRequestTool(accessToken, input);

    case "github_get_repositories":
      return await getRepositoriesTool(accessToken, input);

    default:
      throw new Error(`Unknown GitHub tool: ${toolName}`);
  }
}

export * from "./types";
export { GitHubClient } from "./client";
