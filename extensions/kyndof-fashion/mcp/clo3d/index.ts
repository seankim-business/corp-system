/**
 * CLO3D MCP Server Entry Point
 *
 * Provides MCP interface for CLO3D 3D garment design integration.
 * Supports design management, pattern export, and 3D rendering.
 */

import { getDesignsTool } from "./tools/getDesigns";
import { exportPatternTool } from "./tools/exportPattern";
import { render3DTool } from "./tools/render3D";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../../../src/services/mcp-registry";
import { MCPConnection } from "../../../../src/orchestrator/types";
import { recordMcpToolCall } from "../../../../src/services/metrics";
import { logger } from "../../../../src/utils/logger";

// Legacy tool name mapping for backward compatibility
const legacyToolMap: Record<string, string> = {
  get_designs: "getDesigns",
  export_pattern: "exportPattern",
  render_3d: "render3D",
};

/**
 * Register CLO3D MCP tools
 * Returns list of tool names available in this MCP server
 */
export function registerTools(): string[] {
  return [
    "clo3d__getDesigns",
    "clo3d__exportPattern",
    "clo3d__render3D",
  ];
}

/**
 * Execute CLO3D MCP tool
 *
 * @param apiKey - CLO3D API key
 * @param toolName - Tool name (with or without clo3d__ prefix)
 * @param input - Tool input parameters
 * @param organizationId - Organization ID for access control
 * @param connection - MCP connection context
 * @param userId - Optional user ID for audit logging
 * @param options - Optional execution options (cache, TTL, etc.)
 * @returns Tool execution result
 */
export async function executeCLO3DTool(
  apiKey: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions
): Promise<any> {
  // Validate and parse tool name
  const parsed = validateToolAccess(toolName, "clo3d", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    logger.info("Executing CLO3D tool", {
      toolName: resolvedToolName,
      organizationId,
      userId,
      connectionId: connection.id,
    });

    // Execute tool with caching and metrics
    const result = await executeTool({
      provider: "clo3d",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        switch (resolvedToolName) {
          case "getDesigns":
            return await getDesignsTool(apiKey, input, connection, userId);

          case "exportPattern":
            return await exportPatternTool(apiKey, input, connection, userId);

          case "render3D":
            return await render3DTool(apiKey, input, connection, userId);

          default:
            throw new Error(`Unknown CLO3D tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } catch (error) {
    logger.error("CLO3D tool execution failed", {
      toolName: resolvedToolName,
      error: error instanceof Error ? error.message : String(error),
      organizationId,
    });
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "clo3d",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

// Re-export client for direct usage
export { CLO3DClient, CLO3DError } from "./client";
export type {
  CLO3DConfig,
  Design,
  Collection,
  PatternExportResult,
  RenderResult,
  ListDesignsParams,
  ExportPatternParams,
  Render3DParams,
} from "./client";
