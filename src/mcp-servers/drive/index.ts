// TODO: Re-enable when drive tools are restored
// import { listFilesTool } from "./tools/listFiles";
// import { readFileTool } from "./tools/readFile";
// import { readSheetTool } from "./tools/readSheet";
import { MCPConnection } from "../../orchestrator/types";

export function registerTools(): string[] {
  // Drive tools temporarily disabled - tools not implemented
  return [];
}

export async function executeDriveTool(
  _accessToken: string,
  toolName: string,
  _input: any,
  _organizationId: string,
  _connection: MCPConnection,
  _userId?: string,
): Promise<any> {
  throw new Error(`Drive tool ${toolName} is not currently available`);
}

export { DriveClient, getDriveClient } from "./client";
