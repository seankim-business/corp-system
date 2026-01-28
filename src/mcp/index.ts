export {
  MCPTool,
  CallContext,
  ToolCallResult,
  PermissionCheckResult,
  ApprovalRequirement,
  ToolPermissions,
  ToolApprovalRequest,
  JSONSchema,
  MCPError,
  MCPErrorCode,
  MCPErrorCodes,
  ToolPermissionsFile,
  ToolPermissionsFileSchema,
  ToolPermissionYAML,
  ToolPermissionYAMLSchema,
} from "./types";

export { MCPRegistry, mcpRegistry } from "./registry";

export {
  checkToolPermission,
  evaluateApprovalCondition,
  resolveApprover,
  getApprovalRequirementForArgs,
} from "./permission-checker";

import { mcpRegistry } from "./registry";
import { logger } from "../utils/logger";

let initialized = false;

export function initializeMCPRegistry(): void {
  if (initialized) {
    logger.debug("MCP registry already initialized");
    return;
  }

  try {
    mcpRegistry.loadPermissionsFromYAML();
    initialized = true;
    const stats = mcpRegistry.getStats();
    logger.info("MCP registry initialized", {
      totalTools: stats.totalTools,
      providers: Object.keys(stats.toolsByProvider),
    });
  } catch (error) {
    logger.error("Failed to initialize MCP registry", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerMCPTool(
  tool: Parameters<typeof mcpRegistry.registerTool>[0],
  executor?: Parameters<typeof mcpRegistry.registerTool>[1],
): void {
  mcpRegistry.registerTool(tool, executor);
}

export async function callMCPTool(
  name: string,
  args: unknown,
  context: Parameters<typeof mcpRegistry.callTool>[2],
): ReturnType<typeof mcpRegistry.callTool> {
  if (!initialized && !mcpRegistry.isPermissionsLoaded()) {
    initializeMCPRegistry();
  }
  return mcpRegistry.callTool(name, args, context);
}

export function getToolsForAgent(agentId: string): ReturnType<typeof mcpRegistry.getToolsForAgent> {
  if (!initialized && !mcpRegistry.isPermissionsLoaded()) {
    initializeMCPRegistry();
  }
  return mcpRegistry.getToolsForAgent(agentId);
}

export function getMCPTool(name: string): ReturnType<typeof mcpRegistry.getTool> {
  return mcpRegistry.getTool(name);
}

export function getAllMCPTools(): ReturnType<typeof mcpRegistry.getAllTools> {
  return mcpRegistry.getAllTools();
}

export function getMCPStats(): ReturnType<typeof mcpRegistry.getStats> {
  return mcpRegistry.getStats();
}
