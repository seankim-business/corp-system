/**
 * Smithery External Source
 *
 * Integrates with Smithery.ai MCP server registry to search and retrieve
 * MCP servers from their marketplace.
 *
 * @module marketplace/services/sources/external/smithery-source
 */

import type { ExtensionType } from "@prisma/client";
import {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
  SearchResult,
  type InstallConfig,
  type InstallMethod,
} from "./types";

/**
 * Smithery server data structure from API
 */
interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  tags?: string[];
  connections?: Array<{
    type: "stdio" | "http" | "sse";
    command?: string;
    url?: string;
  }>;
  tools?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Smithery search response structure
 */
interface SmitherySearchResponse {
  servers?: SmitheryServer[];
  total?: number;
  page?: number;
  pageSize?: number;
}

/**
 * Smithery single server response structure
 */
interface SmitheryServerResponse {
  server?: SmitheryServer;
}

/**
 * Smithery Source - Connects to Smithery.ai MCP server registry
 *
 * Smithery is a marketplace for MCP servers. This source provides search and
 * retrieval capabilities with authentication support for premium servers.
 *
 * @class SmitherySource
 * @extends BaseExternalSource
 *
 * @example
 * const source = new SmitherySource();
 * const results = await source.search({
 *   query: "slack",
 *   type: "mcp_server",
 *   limit: 10
 * });
 */
export class SmitherySource extends BaseExternalSource {
  readonly sourceId = "smithery";
  readonly displayName = "Smithery";
  readonly supportedTypes: ExtensionType[] = ["mcp_server"];

  private readonly baseUrl = "https://registry.smithery.ai";
  private readonly apiKey?: string;
  private readonly requestTimeout = 10000; // 10 seconds

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey || process.env.SMITHERY_API_KEY;
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Nubabel-Marketplace/1.0",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Search for MCP servers in Smithery
   *
   * @param {SearchOptions} options - Search parameters
   * @returns {Promise<SearchResult>} Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = "", limit = 20, offset = 0 } = options;
    const page = Math.floor(offset / limit) + 1;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const searchUrl = `${this.baseUrl}/servers?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}`;

      const response = await fetch(searchUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Smithery] API returned status ${response.status}. Returning empty results.`);
        return {
          items: [],
          total: 0,
          hasMore: false,
        };
      }

      const data = (await response.json()) as SmitherySearchResponse;
      const servers = data.servers || [];

      const items = servers.map((server) => this.mapToExternalItem(server));

      return {
        items,
        total: data.total || items.length,
        hasMore: items.length >= limit,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Smithery] Search failed (${errorMessage}). Returning empty results.`);

      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get a specific MCP server by ID from Smithery
   *
   * @param {string} id - Server qualified name (e.g., "@anthropic/slack-mcp")
   * @returns {Promise<ExternalSourceItem | null>} Server details or null
   */
  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const serverUrl = `${this.baseUrl}/servers/${encodeURIComponent(id)}`;

      const response = await fetch(serverUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.debug(`[Smithery] Server not found: ${id}`);
          return null;
        }
        console.warn(`[Smithery] API returned status ${response.status} for ID ${id}`);
        return null;
      }

      const data = (await response.json()) as SmitheryServerResponse;
      const server = data.server;

      if (!server) {
        console.warn(`[Smithery] No server data returned for: ${id}`);
        return null;
      }

      return this.mapToExternalItem(server);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Smithery] getById failed for ${id} (${errorMessage}). Returning null.`);

      return null;
    }
  }

  /**
   * Map a Smithery server to ExternalSourceItem format
   *
   * @private
   * @param {SmitheryServer} server - Smithery server data
   * @returns {ExternalSourceItem} Mapped item
   */
  private mapToExternalItem(server: SmitheryServer): ExternalSourceItem {
    const { installMethod, installConfig } = this.inferInstallation(server);

    return {
      id: `smithery:${server.qualifiedName}`,
      source: this.sourceId,
      type: "mcp_server",
      name: server.displayName,
      description: server.description || "MCP Server from Smithery",
      version: server.version,
      author: server.author,
      license: server.license,
      tags: server.tags || [],
      homepage: `https://smithery.ai/servers/${server.qualifiedName}`,
      installMethod,
      installConfig,
      rawData: server,
    };
  }

  /**
   * Infer installation method and config from server connections
   *
   * @private
   * @param {SmitheryServer} server - Server data
   * @returns {{ installMethod: InstallMethod; installConfig: InstallConfig }}
   */
  private inferInstallation(server: SmitheryServer): {
    installMethod: InstallMethod;
    installConfig: InstallConfig;
  } {
    // Default fallback
    let installMethod: InstallMethod = "npx";
    let installConfig: InstallConfig = {
      command: server.qualifiedName,
    };

    if (server.connections && server.connections.length > 0) {
      const connection = server.connections[0];

      if (connection.type === "http" && connection.url) {
        installMethod = "http";
        installConfig = {
          url: connection.url,
        };
      } else if (connection.type === "stdio" && connection.command) {
        // Parse command to determine if npx or uvx
        const cmd = connection.command.toLowerCase();
        if (cmd.startsWith("uvx") || cmd.includes("python") || cmd.includes("pip")) {
          installMethod = "uvx";
          installConfig = {
            command: connection.command.replace(/^uvx\s+/, ""),
          };
        } else {
          installMethod = "npx";
          installConfig = {
            command: connection.command.replace(/^npx\s+(-y\s+)?/, ""),
          };
        }
      } else if (connection.type === "sse" && connection.url) {
        installMethod = "http";
        installConfig = {
          url: connection.url,
        };
      }
    }

    return { installMethod, installConfig };
  }
}
