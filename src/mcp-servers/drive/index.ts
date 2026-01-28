import { listFilesTool } from "./tools/listFiles";
import { readFileTool } from "./tools/readFile";
import { readSheetTool } from "./tools/readSheet";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { recordMcpToolCall } from "../../services/metrics";

const legacyToolMap: Record<string, string> = {
  list_files: "listFiles",
  read_file: "readFile",
  read_sheet: "readSheet",
};

export function registerTools(): string[] {
  return ["drive__listFiles", "drive__readFile", "drive__readSheet"];
}

export async function executeDriveTool(
  accessToken: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "drive", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "drive",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        switch (resolvedToolName) {
          case "listFiles":
            return await listFilesTool(accessToken, input, connection, userId);

          case "readFile":
            return await readFileTool(accessToken, input, connection, userId);

          case "readSheet":
            return await readSheetTool(accessToken, input, connection, userId);

          default:
            throw new Error(`Unknown Drive tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "drive",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

export { DriveClient, getDriveClient } from "./client";
