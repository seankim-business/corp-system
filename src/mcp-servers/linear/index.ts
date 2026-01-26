import { getIssuesTool } from "./tools/getIssues";
import { createIssueTool } from "./tools/createIssue";
import { updateIssueTool } from "./tools/updateIssue";
import { getTeamsTool } from "./tools/getTeams";

export async function executeLinearTool(
  apiKey: string,
  toolName: string,
  input: any,
): Promise<any> {
  switch (toolName) {
    case "linear_get_issues":
      return await getIssuesTool(apiKey, input);

    case "linear_create_issue":
      return await createIssueTool(apiKey, input);

    case "linear_update_issue":
      return await updateIssueTool(apiKey, input);

    case "linear_get_teams":
      return await getTeamsTool(apiKey, input);

    default:
      throw new Error(`Unknown Linear tool: ${toolName}`);
  }
}

export * from "./types";
export { LinearClient } from "./client";
