/**
 * MCP Installer Service
 *
 * Manages MCP server installations for organizations.
 * Stores configurations per organization and provides installation/management functions.
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";
import {
  getMCPRegistryClient,
  MCPServer,
  RECOMMENDED_SERVERS,
} from "../mcp-registry/index";

const prisma = new PrismaClient();

// Types
export interface InstalledMCPServer {
  id: string;
  organizationId: string;
  serverName: string;
  version: string;
  config: MCPServerConfig;
  enabled: boolean;
  installedAt: Date;
  updatedAt: Date;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: {
    type: "stdio" | "streamable-http" | "sse";
  };
  metadata?: {
    category?: string;
    description?: string;
    repository?: string;
  };
}

export interface InstallServerOptions {
  version?: string;
  config?: Partial<MCPServerConfig>;
  enabled?: boolean;
}

/**
 * Get all installed MCP servers for an organization
 */
export async function getInstalledServers(
  organizationId: string,
): Promise<InstalledMCPServer[]> {
  try {
    const connections = await prisma.mCPConnection.findMany({
      where: {
        organizationId,
        provider: "mcp-registry", // Mark registry-installed servers with this provider
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return connections.map((conn) => ({
      id: conn.id,
      organizationId: conn.organizationId,
      serverName: conn.namespace, // Use namespace to store server name
      version: (conn.config as any).version || "latest",
      config: (conn.config as any).serverConfig || {},
      enabled: conn.enabled,
      installedAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    }));
  } catch (error) {
    logger.error("Failed to get installed MCP servers", { organizationId }, error as Error);
    throw error;
  }
}

/**
 * Install an MCP server for an organization
 */
export async function installServer(
  organizationId: string,
  serverName: string,
  options: InstallServerOptions = {},
): Promise<InstalledMCPServer> {
  try {
    // Fetch server details from registry
    const registryClient = getMCPRegistryClient();
    const serverWithMeta = await registryClient.getServer(serverName, options.version || "latest");

    if (!serverWithMeta) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const server = serverWithMeta.server;

    // Generate configuration
    const config = generateServerConfig(server, options.config);

    // Check if already installed
    const existing = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    let connection;
    if (existing) {
      // Update existing installation
      connection = await prisma.mCPConnection.update({
        where: { id: existing.id },
        data: {
          config: {
            version: server.version,
            serverConfig: config as any,
            meta: serverWithMeta._meta as any,
          } as any,
          enabled: options.enabled ?? true,
          updatedAt: new Date(),
        },
      });
      logger.info("Updated MCP server installation", {
        organizationId,
        serverName,
        version: server.version,
      });
    } else {
      // Create new installation
      connection = await prisma.mCPConnection.create({
        data: {
          organizationId,
          provider: "mcp-registry",
          namespace: serverName,
          name: server.description || serverName,
          config: {
            version: server.version,
            serverConfig: config as any,
            meta: serverWithMeta._meta as any,
          } as any,
          enabled: options.enabled ?? true,
        },
      });
      logger.info("Installed MCP server", {
        organizationId,
        serverName,
        version: server.version,
      });
    }

    return {
      id: connection.id,
      organizationId: connection.organizationId,
      serverName,
      version: server.version,
      config,
      enabled: connection.enabled,
      installedAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  } catch (error) {
    logger.error("Failed to install MCP server", { organizationId, serverName }, error as Error);
    throw error;
  }
}

/**
 * Uninstall an MCP server from an organization
 */
export async function uninstallServer(
  organizationId: string,
  serverName: string,
): Promise<void> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    if (!connection) {
      throw new Error(`MCP server not installed: ${serverName}`);
    }

    await prisma.mCPConnection.delete({
      where: { id: connection.id },
    });

    logger.info("Uninstalled MCP server", { organizationId, serverName });
  } catch (error) {
    logger.error(
      "Failed to uninstall MCP server",
      { organizationId, serverName },
      error as Error,
    );
    throw error;
  }
}

/**
 * Get configuration for a specific installed server
 */
export async function getServerConfig(
  organizationId: string,
  serverName: string,
): Promise<MCPServerConfig | null> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    if (!connection) {
      return null;
    }

    return (connection.config as any).serverConfig || null;
  } catch (error) {
    logger.error(
      "Failed to get server config",
      { organizationId, serverName },
      error as Error,
    );
    throw error;
  }
}

/**
 * Update server configuration
 */
export async function updateServerConfig(
  organizationId: string,
  serverName: string,
  config: Partial<MCPServerConfig>,
): Promise<InstalledMCPServer> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    if (!connection) {
      throw new Error(`MCP server not installed: ${serverName}`);
    }

    const currentConfig = (connection.config as any).serverConfig || {};
    const updatedConfig = { ...currentConfig, ...config };

    const updated = await prisma.mCPConnection.update({
      where: { id: connection.id },
      data: {
        config: {
          ...(connection.config as any),
          serverConfig: updatedConfig,
        },
        updatedAt: new Date(),
      },
    });

    logger.info("Updated MCP server config", { organizationId, serverName });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      serverName,
      version: (updated.config as any).version || "latest",
      config: updatedConfig,
      enabled: updated.enabled,
      installedAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (error) {
    logger.error(
      "Failed to update server config",
      { organizationId, serverName },
      error as Error,
    );
    throw error;
  }
}

/**
 * Enable/disable a server
 */
export async function toggleServer(
  organizationId: string,
  serverName: string,
  enabled: boolean,
): Promise<void> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    if (!connection) {
      throw new Error(`MCP server not installed: ${serverName}`);
    }

    await prisma.mCPConnection.update({
      where: { id: connection.id },
      data: { enabled },
    });

    logger.info("Toggled MCP server", { organizationId, serverName, enabled });
  } catch (error) {
    logger.error(
      "Failed to toggle server",
      { organizationId, serverName, enabled },
      error as Error,
    );
    throw error;
  }
}

/**
 * Provision recommended default servers for an organization
 */
export async function provisionDefaultServers(
  organizationId: string,
): Promise<InstalledMCPServer[]> {
  try {
    logger.info("Provisioning default MCP servers", { organizationId });

    const installedServers: InstalledMCPServer[] = [];

    for (const recommended of RECOMMENDED_SERVERS) {
      try {
        const installed = await installServer(organizationId, recommended.name, {
          enabled: true,
          config: {
            metadata: {
              category: recommended.category,
              description: recommended.description,
            },
          },
        });
        installedServers.push(installed);
      } catch (error) {
        logger.warn(
          "Failed to install recommended server",
          { organizationId, serverName: recommended.name, error: (error as Error).message },
        );
        // Continue with other servers
      }
    }

    logger.info("Provisioned default MCP servers", {
      organizationId,
      count: installedServers.length,
    });

    return installedServers;
  } catch (error) {
    logger.error(
      "Failed to provision default servers",
      { organizationId },
      error as Error,
    );
    throw error;
  }
}

/**
 * Check if a server is installed
 */
export async function isServerInstalled(
  organizationId: string,
  serverName: string,
): Promise<boolean> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: {
        organizationId,
        provider: "mcp-registry",
        namespace: serverName,
      },
    });

    return !!connection;
  } catch (error) {
    logger.error(
      "Failed to check if server is installed",
      { organizationId, serverName },
      error as Error,
    );
    return false;
  }
}

/**
 * Get installation statistics for an organization
 */
export async function getInstallationStats(organizationId: string): Promise<{
  total: number;
  enabled: number;
  disabled: number;
  byCategory: Record<string, number>;
}> {
  try {
    const servers = await getInstalledServers(organizationId);

    const stats = {
      total: servers.length,
      enabled: servers.filter((s) => s.enabled).length,
      disabled: servers.filter((s) => !s.enabled).length,
      byCategory: {} as Record<string, number>,
    };

    for (const server of servers) {
      const category = server.config.metadata?.category || "uncategorized";
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }

    return stats;
  } catch (error) {
    logger.error(
      "Failed to get installation stats",
      { organizationId },
      error as Error,
    );
    throw error;
  }
}

// Helper Functions

/**
 * Generate server configuration from registry data
 */
function generateServerConfig(
  server: MCPServer,
  customConfig?: Partial<MCPServerConfig>,
): MCPServerConfig {
  const registryClient = getMCPRegistryClient();
  const generatedConfig = registryClient.generateClaudeConfig(server, {
    args: customConfig?.args,
    env: customConfig?.env,
  });

  return {
    command: generatedConfig.command || customConfig?.command,
    args: generatedConfig.args || customConfig?.args || [],
    env: generatedConfig.env || customConfig?.env || {},
    transport: customConfig?.transport || {
      type: server.packages[0]?.transport?.type || "stdio",
    },
    metadata: {
      category: customConfig?.metadata?.category,
      description: server.description || customConfig?.metadata?.description,
      repository: server.repository || customConfig?.metadata?.repository,
    },
  };
}

// Export types and utilities
export { RECOMMENDED_SERVERS } from "../mcp-registry/index";
