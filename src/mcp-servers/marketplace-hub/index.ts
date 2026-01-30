/**
 * Marketplace Hub MCP Server Entry Point
 *
 * 기획:
 * - Workflow에서 호출 가능한 MCP 인터페이스
 * - Tool 라우팅 및 실행
 *
 * 구조:
 * - executeMarketplaceHubTool: tool name으로 분기하여 실행
 */

import { searchMarketplaceTool } from "./tools/searchMarketplace";
import { installExtensionTool } from "./tools/installExtension";
import { recommendToolsTool } from "./tools/recommendTools";
import { getInstalledExtensionsTool } from "./tools/getInstalledExtensions";
import { uninstallExtensionTool } from "./tools/uninstallExtension";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { recordMcpToolCall } from "../../services/metrics";

export function registerTools(): string[] {
  return [
    "marketplace-hub__searchMarketplace",
    "marketplace-hub__installExtension",
    "marketplace-hub__recommendTools",
    "marketplace-hub__getInstalledExtensions",
    "marketplace-hub__uninstallExtension",
  ];
}

export async function executeMarketplaceHubTool(
  toolName: string,
  input: any,
  organizationId: string,
  userId: string,
  connection?: MCPConnection,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(
    toolName,
    "marketplace-hub",
    organizationId,
    connection,
  );
  const resolvedToolName = parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "marketplace-hub",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        switch (resolvedToolName) {
          case "searchMarketplace":
            return await searchMarketplaceTool(input, organizationId);

          case "installExtension":
            return await installExtensionTool(input, organizationId, userId);

          case "recommendTools":
            return await recommendToolsTool(input, organizationId);

          case "getInstalledExtensions":
            return await getInstalledExtensionsTool(organizationId);

          case "uninstallExtension":
            return await uninstallExtensionTool(input, organizationId);

          default:
            throw new Error(`Unknown Marketplace Hub tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "marketplace-hub",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}
