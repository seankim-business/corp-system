/**
 * MCP Provider Template
 *
 * Abstract base template for creating new MCP provider integrations.
 * Provides standardized config, tool definition, auth validation,
 * error handling, and provider info for all provider implementations.
 */

import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPProviderConfig {
  providerId: string;
  displayName: string;
  version: string;
  authType: "oauth" | "api_key" | "none";
  baseUrl?: string;
  rateLimitPerSecond: number;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Method name on the provider class that handles this tool. */
  handler: string;
}

export interface ProviderContext {
  organizationId: string;
  userId: string;
  authToken?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  version: string;
  toolCount: number;
}

export interface ProviderErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    providerId: string;
    toolName: string;
  };
}

// ---------------------------------------------------------------------------
// BaseMCPProvider
// ---------------------------------------------------------------------------

export abstract class BaseMCPProvider {
  protected readonly config: Readonly<MCPProviderConfig>;

  constructor(config: MCPProviderConfig) {
    this.config = Object.freeze({ ...config });
    logger.info("MCP provider initialized", {
      providerId: config.providerId,
      displayName: config.displayName,
      version: config.version,
      authType: config.authType,
    });
  }

  // -----------------------------------------------------------------------
  // Abstract methods – implemented by provider subclasses
  // -----------------------------------------------------------------------

  /** Return the list of tools this provider exposes. */
  abstract getTools(): MCPToolDefinition[];

  /** Execute a specific tool by name. */
  abstract executeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: ProviderContext,
  ): Promise<unknown>;

  // -----------------------------------------------------------------------
  // Auth validation
  // -----------------------------------------------------------------------

  /**
   * Validate that the context contains a valid auth token.
   * Returns true if auth is not required or if a token is present.
   */
  validateAuth(context: ProviderContext): boolean {
    if (this.config.authType === "none") {
      return true;
    }

    if (!context.authToken) {
      logger.warn("Auth validation failed: missing token", {
        providerId: this.config.providerId,
        organizationId: context.organizationId,
        authType: this.config.authType,
      });
      return false;
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  /**
   * Produce a standardized error response for tool execution failures.
   */
  handleError(error: unknown, toolName: string): ProviderErrorResponse {
    const message =
      error instanceof Error ? error.message : String(error);

    logger.error("MCP provider tool execution failed", {
      providerId: this.config.providerId,
      toolName,
      error: message,
    });

    return {
      success: false,
      error: {
        message,
        code: "PROVIDER_TOOL_ERROR",
        providerId: this.config.providerId,
        toolName,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Info
  // -----------------------------------------------------------------------

  /**
   * Return summary information about this provider.
   */
  getProviderInfo(): ProviderInfo {
    return {
      id: this.config.providerId,
      name: this.config.displayName,
      version: this.config.version,
      toolCount: this.getTools().length,
    };
  }
}
