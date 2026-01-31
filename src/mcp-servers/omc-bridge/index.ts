/**
 * OMC Bridge MCP Server
 *
 * Main entry point for the OMC Bridge MCP server integration.
 * Follows the pattern established by the GitHub MCP server.
 *
 * Provides access to OMC tools:
 * - LSP tools (12): hover, goto_definition, find_references, etc.
 * - AST tools (2): ast_grep_search, ast_grep_replace
 * - Python REPL (1): python_repl
 */

import { MCPConnection } from "../../orchestrator/types";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { recordMcpToolCall } from "../../services/metrics";
import { getOmcBridgeClient, createOmcBridgeClient } from "./client";
import {
  getAllToolNames,
  getToolDefinition,
  ToolDefinition,
  validateToolInput,
} from "./tools/registry";
import { forwardToolCall, normalizeResponse, NormalizedToolResult } from "./tools/proxy";
import { loadOmcBridgeConfig, isToolEnabled } from "./config";
import { OmcHealthStatus, OmcToolName, OmcBridgeConfig } from "./types";
import { logger } from "../../utils/logger";

/**
 * Legacy tool name mapping (snake_case to camelCase if needed)
 */
const legacyToolMap: Record<string, string> = {
  // No legacy mappings needed since OMC tools use snake_case consistently
};

/**
 * Register all OMC tools with the MCP system
 *
 * @returns Array of tool names in the format "omc__{toolName}"
 */
export function registerTools(): string[] {
  const config = loadOmcBridgeConfig();
  const allTools = getAllToolNames();

  const enabledTools = allTools.filter((toolName) => isToolEnabled(toolName, config));

  return enabledTools.map((toolName) => `omc__${toolName}`);
}

/**
 * Get tool definitions for MCP tool listing
 */
export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const config = loadOmcBridgeConfig();
  const allTools = getAllToolNames();

  return allTools
    .filter((toolName) => isToolEnabled(toolName, config))
    .map((toolName) => {
      const def = getToolDefinition(toolName);
      if (!def) {
        return null;
      }
      return {
        name: `omc__${toolName}`,
        description: def.description,
        inputSchema: def.jsonSchema,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

/**
 * Execute an OMC tool
 *
 * @param toolName Tool name (with or without omc__ prefix)
 * @param input Tool input arguments
 * @param organizationId Organization ID for multi-tenancy
 * @param connection MCP connection context
 * @param userId Optional user ID for audit
 * @param options Optional execution options
 */
export async function executeOmcTool(
  toolName: string,
  input: unknown,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<unknown> {
  // Validate tool access
  const parsed = validateToolAccess(toolName, "omc", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "omc",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        // Get the client
        const client = getOmcBridgeClient();

        // Forward the call
        const response = await forwardToolCall(resolvedToolName, input, {
          client,
          organizationId,
          userId,
          sessionId: connection.id,
        });

        // Check for errors
        if (response.status !== "success") {
          throw new Error(response.error?.message ?? "Tool execution failed");
        }

        return response.result;
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "omc",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

/**
 * Execute an OMC tool with normalized response format
 */
export async function executeOmcToolNormalized(
  toolName: OmcToolName,
  input: unknown,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
): Promise<NormalizedToolResult> {
  const client = getOmcBridgeClient();

  const response = await forwardToolCall(toolName, input, {
    client,
    organizationId,
    userId,
    sessionId: connection.id,
  });

  return normalizeResponse(toolName, response);
}

/**
 * Get health status for the OMC bridge
 */
export async function getOmcHealth(): Promise<OmcHealthStatus> {
  const client = getOmcBridgeClient();
  return client.getHealth();
}

/**
 * Check if the OMC bridge is healthy
 */
export async function isOmcHealthy(): Promise<boolean> {
  try {
    const health = await getOmcHealth();
    return health.healthy;
  } catch {
    return false;
  }
}

/**
 * Initialize the OMC bridge connection
 */
export async function initializeOmcBridge(config?: Partial<OmcBridgeConfig>): Promise<void> {
  const client = config ? createOmcBridgeClient(config) : getOmcBridgeClient();

  try {
    await client.connect();
    logger.info("OMC Bridge initialized successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to initialize OMC Bridge", { error: message });
    throw error;
  }
}

/**
 * Shutdown the OMC bridge connection
 */
export async function shutdownOmcBridge(): Promise<void> {
  const client = getOmcBridgeClient();
  await client.disconnect();
  logger.info("OMC Bridge shut down");
}

/**
 * Validate tool input
 */
export function validateOmcToolInput(
  toolName: string,
  input: unknown,
): { valid: true; data: unknown } | { valid: false; error: string } {
  return validateToolInput(toolName, input);
}

/**
 * Get tool definition by name
 */
export function getOmcToolDefinition(toolName: string): ToolDefinition | undefined {
  // Strip omc__ prefix if present
  const cleanName = toolName.startsWith("omc__") ? toolName.slice(5) : toolName;
  return getToolDefinition(cleanName);
}

/**
 * List all available OMC tools
 */
export function listOmcTools(): OmcToolName[] {
  const config = loadOmcBridgeConfig();
  return getAllToolNames().filter((toolName) => isToolEnabled(toolName, config));
}

/**
 * Check if a specific tool is available
 */
export function isOmcToolAvailable(toolName: string): boolean {
  const cleanName = toolName.startsWith("omc__") ? toolName.slice(5) : toolName;
  const definition = getToolDefinition(cleanName);
  if (!definition) {
    return false;
  }

  const config = loadOmcBridgeConfig();
  return isToolEnabled(cleanName, config);
}

// ============================================
// RE-EXPORTS
// ============================================

export * from "./types";
export { OmcBridgeClient, getOmcBridgeClient, createOmcBridgeClient } from "./client";
export { loadOmcBridgeConfig, reloadOmcBridgeConfig, getOmcBridgeConfigSafe } from "./config";
export {
  OMC_TOOL_REGISTRY,
  getAllToolNames,
  getToolsByCategory,
  getToolsRequiringApproval,
  toToolConfig,
} from "./tools/registry";
export {
  forwardToolCall,
  normalizeResponse,
  executeOmcToolProxy,
  batchExecuteTools,
  requiresApproval,
  estimateTokenCost,
} from "./tools/proxy";
