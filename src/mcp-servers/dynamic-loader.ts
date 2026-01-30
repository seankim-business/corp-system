/**
 * Dynamic MCP Server Loading and Tool Aggregation
 *
 * Provides runtime registration of MCP servers with namespaced tool
 * aggregation. Each tool is addressed as "providerId:toolName" so that
 * identically-named tools from different providers never collide.
 *
 * Usage:
 *   mcpLoader.registerServer({ providerId: "notion", displayName: "Notion", enabled: true });
 *   const tools = mcpLoader.aggregateTools();
 *   const result = await mcpLoader.dispatchTool("notion:getTasks", input, context);
 */

import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerConfig {
  /** Unique identifier for the provider (e.g. "notion", "github"). */
  providerId: string;
  /** Human-readable name shown in UIs. */
  displayName: string;
  /** Whether the server is currently active. */
  enabled: boolean;
  /** Optional path to the module that implements the server. */
  modulePath?: string;
  /** Optional prefix applied to tool names in the namespace. */
  toolPrefix?: string;
}

export interface NamespacedTool {
  /** Provider that owns this tool. */
  providerId: string;
  /** Tool name within its provider (e.g. "getTasks"). */
  toolName: string;
  /** Fully-qualified name: "providerId:toolName". */
  fullName: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** JSON-Schema-style input definition. */
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  /** Whether the tool executed without error. */
  success: boolean;
  /** Payload returned by the tool. */
  data: unknown;
  /** Error message when `success` is false. */
  error?: string;
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the fully-qualified namespaced name for a tool.
 */
function buildFullName(providerId: string, toolName: string, toolPrefix?: string): string {
  const effectiveName = toolPrefix ? `${toolPrefix}${toolName}` : toolName;
  return `${providerId}:${effectiveName}`;
}

/**
 * Parse a fully-qualified tool name into its provider and tool parts.
 * Returns `null` when the name does not contain a colon separator.
 */
function parseFullName(fullName: string): { providerId: string; toolName: string } | null {
  const colonIndex = fullName.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }
  return {
    providerId: fullName.slice(0, colonIndex),
    toolName: fullName.slice(colonIndex + 1),
  };
}

// ---------------------------------------------------------------------------
// DynamicMCPLoader
// ---------------------------------------------------------------------------

export class DynamicMCPLoader {
  private servers: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, NamespacedTool> = new Map();

  // -------------------------------------------------------------------------
  // Server registration
  // -------------------------------------------------------------------------

  /**
   * Register an MCP server configuration.
   * If a server with the same `providerId` already exists it will be replaced.
   */
  registerServer(config: MCPServerConfig): void {
    if (this.servers.has(config.providerId)) {
      logger.warn("Replacing existing MCP server registration", {
        providerId: config.providerId,
      });
    }

    this.servers.set(config.providerId, config);

    logger.info("MCP server registered", {
      providerId: config.providerId,
      displayName: config.displayName,
      enabled: config.enabled,
    });
  }

  /**
   * Remove a server (and all its tools) from the registry.
   */
  unregisterServer(providerId: string): void {
    const existed = this.servers.delete(providerId);

    if (!existed) {
      logger.warn("Attempted to unregister unknown MCP server", { providerId });
      return;
    }

    // Evict tools belonging to this provider
    for (const [fullName, tool] of this.tools) {
      if (tool.providerId === providerId) {
        this.tools.delete(fullName);
      }
    }

    logger.info("MCP server unregistered", { providerId });
  }

  /**
   * Return a snapshot of all registered server configurations.
   */
  getRegisteredServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  // -------------------------------------------------------------------------
  // Tool aggregation
  // -------------------------------------------------------------------------

  /**
   * Walk every *enabled* server, collect its tools, and namespace them as
   * `providerId:toolName`. The internal tools map is rebuilt from scratch on
   * each call so it always reflects the latest server state.
   *
   * In the current implementation each server exposes its tools via the
   * `BaseMCPServer.registerTools()` convention. Servers that are not yet
   * loaded (no `modulePath`) contribute zero tools without error.
   */
  aggregateTools(): NamespacedTool[] {
    this.tools.clear();

    for (const config of this.servers.values()) {
      if (!config.enabled) {
        logger.debug("Skipping disabled MCP server during aggregation", {
          providerId: config.providerId,
        });
        continue;
      }

      // If no modulePath is set we cannot discover tools dynamically.
      // The server may register tools later via other mechanisms.
      if (!config.modulePath) {
        logger.debug("MCP server has no modulePath; skipping tool discovery", {
          providerId: config.providerId,
        });
        continue;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(config.modulePath) as {
          registerTools?: () => Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
        };

        if (typeof mod.registerTools !== "function") {
          logger.warn("MCP server module does not export registerTools()", {
            providerId: config.providerId,
            modulePath: config.modulePath,
          });
          continue;
        }

        const rawTools = mod.registerTools();

        for (const raw of rawTools) {
          // raw.name may already be prefixed (e.g. "notion__getTasks").
          // Strip any existing double-underscore provider prefix.
          const bareName = raw.name.includes("__")
            ? raw.name.split("__").slice(1).join("__")
            : raw.name;

          const fullName = buildFullName(config.providerId, bareName, config.toolPrefix);

          const namespacedTool: NamespacedTool = {
            providerId: config.providerId,
            toolName: bareName,
            fullName,
            description: raw.description ?? "",
            inputSchema: raw.inputSchema ?? {},
          };

          this.tools.set(fullName, namespacedTool);
        }

        logger.info("Aggregated tools from MCP server", {
          providerId: config.providerId,
          toolCount: rawTools.length,
        });
      } catch (err) {
        logger.error(
          "Failed to aggregate tools from MCP server",
          {
            providerId: config.providerId,
            modulePath: config.modulePath,
          },
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    return Array.from(this.tools.values());
  }

  // -------------------------------------------------------------------------
  // Tool dispatch
  // -------------------------------------------------------------------------

  /**
   * Route a tool invocation to the correct server, execute it, and return a
   * typed result with timing information.
   */
  async dispatchTool(
    fullName: string,
    input: Record<string, unknown>,
    context: { organizationId: string; userId: string },
  ): Promise<ToolExecutionResult> {
    const startMs = Date.now();

    const parsed = parseFullName(fullName);
    if (!parsed) {
      return {
        success: false,
        data: null,
        error: `Invalid namespaced tool name "${fullName}". Expected format: "providerId:toolName".`,
        durationMs: Date.now() - startMs,
      };
    }

    const config = this.servers.get(parsed.providerId);
    if (!config) {
      return {
        success: false,
        data: null,
        error: `No MCP server registered for provider "${parsed.providerId}".`,
        durationMs: Date.now() - startMs,
      };
    }

    if (!config.enabled) {
      return {
        success: false,
        data: null,
        error: `MCP server "${parsed.providerId}" is currently disabled.`,
        durationMs: Date.now() - startMs,
      };
    }

    logger.info("Dispatching MCP tool", {
      fullName,
      providerId: parsed.providerId,
      toolName: parsed.toolName,
      organizationId: context.organizationId,
      userId: context.userId,
    });

    try {
      // Attempt to load the server module and execute
      if (!config.modulePath) {
        return {
          success: false,
          data: null,
          error: `MCP server "${parsed.providerId}" has no modulePath configured.`,
          durationMs: Date.now() - startMs,
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(config.modulePath) as {
        executeTool?: (toolName: string, input: unknown, context: unknown) => Promise<unknown>;
      };

      if (typeof mod.executeTool !== "function") {
        return {
          success: false,
          data: null,
          error: `MCP server module for "${parsed.providerId}" does not export executeTool().`,
          durationMs: Date.now() - startMs,
        };
      }

      const data = await mod.executeTool(parsed.toolName, input, context);

      const durationMs = Date.now() - startMs;

      logger.info("MCP tool executed successfully", {
        fullName,
        durationMs,
      });

      return { success: true, data, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error(
        "MCP tool execution failed",
        { fullName, durationMs },
        err instanceof Error ? err : new Error(errorMessage),
      );

      return {
        success: false,
        data: null,
        error: errorMessage,
        durationMs,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  /**
   * List all available namespaced tools. If `organizationId` is provided it
   * is logged for auditing; filtering by organisation is not yet implemented.
   */
  listAvailableTools(organizationId?: string): NamespacedTool[] {
    if (organizationId) {
      logger.debug("Listing available tools", { organizationId });
    }

    // Ensure tools are up-to-date
    return this.aggregateTools();
  }

  /**
   * Retrieve the server configuration that owns a given namespaced tool.
   * Returns `undefined` if the tool or server is not found.
   */
  getServerForTool(fullName: string): MCPServerConfig | undefined {
    const parsed = parseFullName(fullName);
    if (!parsed) {
      return undefined;
    }
    return this.servers.get(parsed.providerId);
  }

  /**
   * Check whether a namespaced tool is currently registered and its server
   * is enabled.
   */
  isToolAvailable(fullName: string): boolean {
    // Refresh tools so the check is always fresh
    this.aggregateTools();

    const tool = this.tools.get(fullName);
    if (!tool) {
      return false;
    }

    const config = this.servers.get(tool.providerId);
    return config?.enabled === true;
  }

  /**
   * Return all tools belonging to a specific provider.
   */
  getToolsByProvider(providerId: string): NamespacedTool[] {
    // Refresh tools
    this.aggregateTools();

    return Array.from(this.tools.values()).filter(
      (tool) => tool.providerId === providerId,
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const mcpLoader = new DynamicMCPLoader();
