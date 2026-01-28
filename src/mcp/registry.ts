import {
  MCPTool,
  CallContext,
  ToolCallResult,
  MCPError,
  MCPErrorCodes,
  ToolPermissions,
  ToolPermissionsFile,
  ToolPermissionsFileSchema,
} from "./types";
import { checkToolPermission, evaluateApprovalCondition } from "./permission-checker";
import { logMCPToolCall } from "../middleware/mcp-audit";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

interface ToolExecutor {
  (args: unknown, context: CallContext): Promise<unknown>;
}

interface RegisteredTool extends MCPTool {
  executor?: ToolExecutor;
}

class MCPRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private permissionsLoaded = false;
  private permissionsFilePath: string;

  constructor(permissionsFilePath?: string) {
    this.permissionsFilePath =
      permissionsFilePath || path.resolve(__dirname, "../../config/mcp/tool-permissions.yaml");
  }

  registerTool(tool: MCPTool, executor?: ToolExecutor): void {
    const registeredTool: RegisteredTool = { ...tool, executor };
    this.tools.set(tool.name, registeredTool);
    logger.debug("MCP tool registered", { toolName: tool.name, provider: tool.provider });
  }

  unregisterTool(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      logger.debug("MCP tool unregistered", { toolName: name });
    }
    return deleted;
  }

  getTool(name: string): MCPTool | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;

    const { executor: _executor, ...toolWithoutExecutor } = tool;
    return toolWithoutExecutor;
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values()).map(({ executor: _executor, ...tool }) => tool);
  }

  getToolsForAgent(agentId: string): MCPTool[] {
    const allowedTools: MCPTool[] = [];

    for (const [_name, tool] of this.tools) {
      const { executor: _executor, ...toolWithoutExecutor } = tool;
      const { allowedAgents } = tool.permissions;

      if (allowedAgents.includes("all") || allowedAgents.includes(agentId)) {
        allowedTools.push(toolWithoutExecutor);
      }
    }

    return allowedTools;
  }

  getToolsByProvider(provider: string): MCPTool[] {
    const providerTools: MCPTool[] = [];

    for (const [_name, tool] of this.tools) {
      if (tool.provider === provider) {
        const { executor: _executor, ...toolWithoutExecutor } = tool;
        providerTools.push(toolWithoutExecutor);
      }
    }

    return providerTools;
  }

  async callTool(name: string, args: unknown, context: CallContext): Promise<ToolCallResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      const error = new MCPError(MCPErrorCodes.TOOL_NOT_FOUND, `Unknown tool: ${name}`, { name });
      await logMCPToolCall({
        toolName: name,
        agentId: context.agentId,
        userId: context.userId,
        organizationId: context.organizationId,
        args,
        success: false,
        errorCode: error.code,
        errorMessage: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }

    const permissionResult = checkToolPermission(tool, context.agentId);

    if (!permissionResult.allowed) {
      const error = new MCPError(
        MCPErrorCodes.PERMISSION_DENIED,
        permissionResult.reason || "Permission denied",
        {
          toolName: name,
          agentId: context.agentId,
        },
      );
      await logMCPToolCall({
        toolName: name,
        provider: tool.provider,
        agentId: context.agentId,
        userId: context.userId,
        organizationId: context.organizationId,
        args,
        success: false,
        errorCode: error.code,
        errorMessage: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }

    let approvalId: string | undefined;

    if (permissionResult.requiresApproval && permissionResult.approvalRequirement) {
      const { condition, approver } = permissionResult.approvalRequirement;
      const needsApproval = evaluateApprovalCondition(condition, args);

      if (needsApproval) {
        const error = new MCPError(
          MCPErrorCodes.APPROVAL_PENDING,
          `Tool requires approval: ${condition}`,
          {
            toolName: name,
            condition,
            approver,
          },
        );
        await logMCPToolCall({
          toolName: name,
          provider: tool.provider,
          agentId: context.agentId,
          userId: context.userId,
          organizationId: context.organizationId,
          args,
          success: false,
          errorCode: error.code,
          errorMessage: error.message,
          duration: Date.now() - startTime,
          requiresApproval: true,
          approvalCondition: condition,
          approver,
        });
        throw error;
      }
    }

    if (!tool.executor) {
      const error = new MCPError(
        MCPErrorCodes.TOOL_EXECUTION_ERROR,
        `No executor registered for tool: ${name}`,
        {
          toolName: name,
        },
      );
      await logMCPToolCall({
        toolName: name,
        provider: tool.provider,
        agentId: context.agentId,
        userId: context.userId,
        organizationId: context.organizationId,
        args,
        success: false,
        errorCode: error.code,
        errorMessage: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }

    try {
      const result = await tool.executor(args, context);
      const duration = Date.now() - startTime;

      await logMCPToolCall({
        toolName: name,
        provider: tool.provider,
        agentId: context.agentId,
        userId: context.userId,
        organizationId: context.organizationId,
        args,
        result,
        success: true,
        duration,
        approvalId,
      });

      return {
        success: true,
        data: result,
        metadata: {
          duration,
          cached: false,
          approvalId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const mcpError = new MCPError(MCPErrorCodes.TOOL_EXECUTION_ERROR, errorMessage, {
        toolName: name,
        originalError: errorMessage,
      });

      await logMCPToolCall({
        toolName: name,
        provider: tool.provider,
        agentId: context.agentId,
        userId: context.userId,
        organizationId: context.organizationId,
        args,
        success: false,
        errorCode: mcpError.code,
        errorMessage,
        duration,
      });

      throw mcpError;
    }
  }

  loadPermissionsFromYAML(): void {
    if (!fs.existsSync(this.permissionsFilePath)) {
      logger.warn("MCP tool permissions file not found", { path: this.permissionsFilePath });
      this.permissionsLoaded = true;
      return;
    }

    try {
      const fileContent = fs.readFileSync(this.permissionsFilePath, "utf8");
      const parsed = yaml.load(fileContent);
      const validated = ToolPermissionsFileSchema.parse(parsed);

      for (const [toolName, permission] of Object.entries(validated.tool_permissions)) {
        const tool = this.tools.get(toolName);
        if (tool) {
          tool.permissions = this.convertYAMLPermission(permission);
          logger.debug("Updated tool permissions from YAML", { toolName });
        } else {
          this.registerToolPermissionOnly(toolName, permission);
        }
      }

      this.permissionsLoaded = true;
      logger.info("MCP tool permissions loaded", {
        toolCount: Object.keys(validated.tool_permissions).length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to load MCP tool permissions", { error: message });
      throw new Error(`Failed to load MCP tool permissions: ${message}`);
    }
  }

  private convertYAMLPermission(
    yamlPermission: ToolPermissionsFile["tool_permissions"][string],
  ): ToolPermissions {
    return {
      allowedAgents: yamlPermission.allowed_agents,
      requiresApproval: yamlPermission.requires_approval
        ? {
            condition: yamlPermission.requires_approval.condition,
            approver: yamlPermission.requires_approval.approver,
          }
        : undefined,
    };
  }

  private registerToolPermissionOnly(
    toolName: string,
    yamlPermission: ToolPermissionsFile["tool_permissions"][string],
  ): void {
    const [provider, ..._rest] = toolName.split("__");
    const placeholderTool: RegisteredTool = {
      name: toolName,
      provider: provider || "unknown",
      description: `Tool ${toolName} (permissions loaded from YAML)`,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      requiresAuth: true,
      permissions: this.convertYAMLPermission(yamlPermission),
    };
    this.tools.set(toolName, placeholderTool);
    logger.debug("Registered tool permissions placeholder", { toolName });
  }

  isPermissionsLoaded(): boolean {
    return this.permissionsLoaded;
  }

  getStats(): { totalTools: number; toolsByProvider: Record<string, number> } {
    const toolsByProvider: Record<string, number> = {};

    for (const tool of this.tools.values()) {
      toolsByProvider[tool.provider] = (toolsByProvider[tool.provider] || 0) + 1;
    }

    return {
      totalTools: this.tools.size,
      toolsByProvider,
    };
  }

  clear(): void {
    this.tools.clear();
    this.permissionsLoaded = false;
    logger.debug("MCP registry cleared");
  }
}

export const mcpRegistry = new MCPRegistry();

export { MCPRegistry };
