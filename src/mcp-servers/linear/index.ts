import { getIssuesTool } from "./tools/getIssues";
import { createIssueTool } from "./tools/createIssue";
import { updateIssueTool } from "./tools/updateIssue";
import { getTeamsTool } from "./tools/getTeams";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";

const legacyToolMap: Record<string, string> = {
  get_issues: "getIssues",
  create_issue: "createIssue",
  update_issue: "updateIssue",
  get_teams: "getTeams",
};

export function registerTools(): string[] {
  return ["linear__getIssues", "linear__createIssue", "linear__updateIssue", "linear__getTeams"];
}

export async function executeLinearTool(
  apiKey: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "linear", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  return executeTool({
    provider: "linear",
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
          return await getIssuesTool(apiKey, input, connection, userId);

        case "createIssue":
          return await createIssueTool(apiKey, input, connection, userId);

        case "updateIssue":
          return await updateIssueTool(apiKey, input, connection, userId);

        case "getTeams":
          return await getTeamsTool(apiKey, input, connection, userId);

        default:
          throw new Error(`Unknown Linear tool: ${toolName}`);
      }
    },
  });
}

export * from "./types";
export { LinearClient, getLinearClient } from "./client";
