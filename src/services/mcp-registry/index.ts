/**
 * MCP Registry Service
 *
 * Enables discovery, search, and installation of MCP servers from the official registry.
 * Registry: https://registry.modelcontextprotocol.io
 */

import { logger } from "../../utils/logger";

const REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io";

// Types
export interface MCPServerPackage {
  type: "npm" | "oci" | "remote";
  identifier: string;
  version?: string;
  transport: {
    type: "stdio" | "streamable-http" | "sse";
  };
  arguments?: string[];
  environment_variables?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPServer {
  name: string;
  description?: string;
  repository?: string;
  version: string;
  packages: MCPServerPackage[];
}

export interface MCPServerWithMeta {
  server: MCPServer;
  _meta: {
    status: "active" | "deprecated" | "archived";
    publishedAt: string;
    updatedAt: string;
    isLatest: boolean;
  };
}

export interface SearchFilters {
  version?: "latest" | string;
  limit?: number;
  cursor?: string;
  updated_since?: string;
}

export interface SearchResult {
  servers: MCPServerWithMeta[];
  metadata: {
    count: number;
    nextCursor?: string;
  };
}

// Popular/Recommended MCP Servers (OpenClaw-style defaults)
export const RECOMMENDED_SERVERS = [
  {
    name: "@modelcontextprotocol/server-filesystem",
    description: "File system operations with configurable access",
    category: "filesystem",
  },
  {
    name: "@modelcontextprotocol/server-memory",
    description: "Knowledge graph-based persistent memory",
    category: "memory",
  },
  {
    name: "@anthropic/mcp-server-git",
    description: "Git repository operations",
    category: "git",
  },
  {
    name: "@anthropic/mcp-server-fetch",
    description: "Web content fetching and processing",
    category: "web",
  },
  {
    name: "@anthropic/mcp-server-puppeteer",
    description: "Browser automation with Puppeteer",
    category: "browser",
  },
  {
    name: "@anthropic/mcp-server-sequential-thinking",
    description: "Dynamic problem-solving through reflective thought",
    category: "reasoning",
  },
  {
    name: "@anthropic/mcp-server-postgres",
    description: "PostgreSQL database operations",
    category: "database",
  },
  {
    name: "@anthropic/mcp-server-sqlite",
    description: "SQLite database operations",
    category: "database",
  },
  {
    name: "@anthropic/mcp-server-brave-search",
    description: "Web search via Brave Search API",
    category: "search",
  },
  {
    name: "@anthropic/mcp-server-github",
    description: "GitHub API operations",
    category: "github",
  },
];

// Registry API Client
export class MCPRegistryClient {
  private baseUrl: string;

  constructor(baseUrl: string = REGISTRY_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Search for MCP servers
   */
  async searchServers(query?: string, filters?: SearchFilters): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    if (filters?.version) params.set("version", filters.version);
    if (filters?.limit) params.set("limit", String(filters.limit));
    if (filters?.cursor) params.set("cursor", filters.cursor);
    if (filters?.updated_since) params.set("updated_since", filters.updated_since);

    const url = `${this.baseUrl}/v0/servers?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status}`);
      }
      return (await response.json()) as SearchResult;
    } catch (error) {
      logger.error("Failed to search MCP servers", {}, error as Error);
      throw error;
    }
  }

  /**
   * Get all servers with pagination
   */
  async getAllServers(limit: number = 100): Promise<MCPServerWithMeta[]> {
    const allServers: MCPServerWithMeta[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.searchServers(undefined, {
        limit,
        cursor,
        version: "latest",
      });
      allServers.push(...result.servers);
      cursor = result.metadata.nextCursor;
    } while (cursor);

    return allServers;
  }

  /**
   * Get server by name
   */
  async getServer(name: string, version: string = "latest"): Promise<MCPServerWithMeta | null> {
    const result = await this.searchServers(name, { version, limit: 10 });
    return result.servers.find((s) => s.server.name === name) || null;
  }

  /**
   * Get recommended servers
   */
  getRecommendedServers(): typeof RECOMMENDED_SERVERS {
    return RECOMMENDED_SERVERS;
  }

  /**
   * Generate installation command for a server
   */
  generateInstallCommand(server: MCPServer): string {
    const npmPackage = server.packages.find((p) => p.type === "npm");
    if (npmPackage) {
      return `npx -y ${npmPackage.identifier}`;
    }

    const ociPackage = server.packages.find((p) => p.type === "oci");
    if (ociPackage) {
      return `docker run -i ${ociPackage.identifier}`;
    }

    return `# Manual installation required for ${server.name}`;
  }

  /**
   * Generate Claude Desktop config for a server
   */
  generateClaudeConfig(
    server: MCPServer,
    options?: {
      args?: string[];
      env?: Record<string, string>;
    },
  ): Record<string, any> {
    const npmPackage = server.packages.find((p) => p.type === "npm");
    if (npmPackage) {
      const config: Record<string, any> = {
        command: "npx",
        args: ["-y", npmPackage.identifier, ...(options?.args || [])],
      };
      if (options?.env && Object.keys(options.env).length > 0) {
        config.env = options.env;
      }
      return config;
    }

    const ociPackage = server.packages.find((p) => p.type === "oci");
    if (ociPackage) {
      return {
        command: "docker",
        args: ["run", "-i", ociPackage.identifier, ...(options?.args || [])],
        env: options?.env,
      };
    }

    return {};
  }
}

// Singleton instance
let registryClient: MCPRegistryClient | null = null;

export function getMCPRegistryClient(): MCPRegistryClient {
  if (!registryClient) {
    registryClient = new MCPRegistryClient();
  }
  return registryClient;
}

// Convenience functions
export async function searchMCPServers(
  query?: string,
  filters?: SearchFilters,
): Promise<SearchResult> {
  return getMCPRegistryClient().searchServers(query, filters);
}

export async function getMCPServer(
  name: string,
  version?: string,
): Promise<MCPServerWithMeta | null> {
  return getMCPRegistryClient().getServer(name, version);
}

export function getRecommendedMCPServers(): typeof RECOMMENDED_SERVERS {
  return getMCPRegistryClient().getRecommendedServers();
}
