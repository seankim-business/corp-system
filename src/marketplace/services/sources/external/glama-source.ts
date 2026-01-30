/**
 * Glama AI External Source
 *
 * Integrates with Glama.ai to search and retrieve MCP servers from their
 * indexed collection of 17,400+ servers.
 *
 * @module marketplace/services/sources/external/glama-source
 */

import type { ExtensionType } from "@prisma/client";
import { BaseExternalSource, ExternalSourceItem, SearchOptions, SearchResult } from "./types";

/**
 * Glama API response for server listing
 *
 * @interface GlamaServer
 */
interface GlamaServer {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  repository?: string;
  homepage?: string;
  license?: string;
  tags?: string[];
  downloads?: number;
  stars?: number;
  rating?: number;
  installUrl?: string;
  installCommand?: string;
  [key: string]: unknown;
}

/**
 * Glama API response structure
 *
 * @interface GlamaApiResponse
 */
interface GlamaApiResponse {
  servers?: GlamaServer[];
  items?: GlamaServer[];
  results?: GlamaServer[];
  data?: GlamaServer[];
  [key: string]: unknown;
}

/**
 * Glama AI Source - Connects to Glama.ai MCP server registry
 *
 * Glama indexes 17,400+ MCP servers. This source provides search and
 * retrieval capabilities with graceful degradation if the API is unavailable.
 *
 * @class GlamaSource
 * @extends BaseExternalSource
 *
 * @example
 * const source = new GlamaSource();
 * const results = await source.search({
 *   query: "slack",
 *   type: "mcp_server",
 *   limit: 10
 * });
 */
export class GlamaSource extends BaseExternalSource {
  readonly sourceId = "glama";
  readonly displayName = "Glama";
  readonly supportedTypes: ExtensionType[] = ["mcp_server"];

  private readonly baseUrl = "https://glama.ai";
  private readonly apiEndpoint = `${this.baseUrl}/api/mcp/servers`;
  private readonly requestTimeout = 5000; // 5 seconds

  /**
   * Search for MCP servers in Glama
   *
   * Attempts to use the Glama API first. If the API is unavailable or fails,
   * returns empty results with a warning log. This graceful degradation ensures
   * the marketplace continues to function even if Glama is temporarily down.
   *
   * @param {SearchOptions} options - Search parameters
   * @returns {Promise<SearchResult>} Search results (empty if API unavailable)
   *
   * @example
   * const result = await source.search({
   *   query: "slack",
   *   limit: 10
   * });
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = "", limit = 20, offset = 0 } = options;

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (query) {
        params.append("query", query);
      }
      params.append("limit", String(limit));
      params.append("offset", String(offset));

      // Attempt API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(`${this.apiEndpoint}?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Nubabel-Marketplace/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Glama] API returned status ${response.status}. Returning empty results.`);
        return {
          items: [],
          total: 0,
          hasMore: false,
        };
      }

      const data = (await response.json()) as GlamaApiResponse;
      const servers = this.extractServers(data);

      // Map Glama servers to ExternalSourceItem format
      const items = servers.map((server) => this.mapToExternalItem(server));

      return {
        items,
        total: items.length,
        hasMore: items.length >= limit,
      };
    } catch (error) {
      // Log error but don't throw - graceful degradation
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Glama] Search failed (${errorMessage}). Returning empty results.`);

      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get a specific MCP server by ID from Glama
   *
   * Attempts to fetch server details from the Glama API. If the API is
   * unavailable, returns null with a warning log.
   *
   * @param {string} id - Server ID (e.g., "slack-mcp")
   * @returns {Promise<ExternalSourceItem | null>} Server details or null
   *
   * @example
   * const item = await source.getById("slack-mcp");
   */
  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      // Attempt API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(`${this.apiEndpoint}/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Nubabel-Marketplace/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.debug(`[Glama] Server not found: ${id}`);
          return null;
        }
        console.warn(`[Glama] API returned status ${response.status} for ID ${id}`);
        return null;
      }

      const data = (await response.json()) as GlamaServer;
      return this.mapToExternalItem(data, id);
    } catch (error) {
      // Log error but don't throw - graceful degradation
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Glama] getById failed for ${id} (${errorMessage}). Returning null.`);

      return null;
    }
  }

  /**
   * Extract servers array from various possible API response formats
   *
   * Glama API response structure may vary, so we check multiple possible
   * locations for the servers array.
   *
   * @private
   * @param {GlamaApiResponse} data - API response data
   * @returns {GlamaServer[]} Array of servers
   */
  private extractServers(data: GlamaApiResponse): GlamaServer[] {
    // Try multiple possible response structures
    if (Array.isArray(data.servers)) {
      return data.servers;
    }
    if (Array.isArray(data.items)) {
      return data.items;
    }
    if (Array.isArray(data.results)) {
      return data.results;
    }
    if (Array.isArray(data.data)) {
      return data.data;
    }
    if (Array.isArray(data)) {
      return data as GlamaServer[];
    }

    return [];
  }

  /**
   * Map a Glama server to ExternalSourceItem format
   *
   * Converts Glama API response to the universal ExternalSourceItem format
   * used by the Marketplace Hub.
   *
   * @private
   * @param {GlamaServer} server - Glama server data
   * @param {string} [overrideId] - Optional ID override
   * @returns {ExternalSourceItem} Mapped item
   */
  private mapToExternalItem(server: GlamaServer, overrideId?: string): ExternalSourceItem {
    const id = overrideId || server.id || server.name.toLowerCase().replace(/\s+/g, "-");

    return {
      id: `glama:${id}`,
      source: this.sourceId,
      type: "mcp_server",
      name: server.name,
      description: server.description || "MCP Server from Glama",
      version: server.version,
      author: server.author,
      repository: server.repository,
      homepage: server.homepage,
      license: server.license,
      tags: server.tags || [],
      downloads: server.downloads,
      stars: server.stars,
      rating: server.rating,
      installMethod: this.inferInstallMethod(server),
      installConfig: this.buildInstallConfig(server),
      rawData: server,
    };
  }

  /**
   * Infer the installation method from server metadata
   *
   * Determines the most appropriate installation method based on available
   * server information.
   *
   * @private
   * @param {GlamaServer} server - Server data
   * @returns {InstallMethod} Installation method
   */
  private inferInstallMethod(server: GlamaServer): "npx" | "http" | "git" | "manual" {
    // If there's an install command, assume npx
    if (server.installCommand) {
      return "npx";
    }

    // If there's a repository, assume git
    if (server.repository) {
      return "git";
    }

    // If there's an install URL, assume http (remote server)
    if (server.installUrl) {
      return "http";
    }

    // Default to manual
    return "manual";
  }

  /**
   * Build installation configuration from server metadata
   *
   * Creates the InstallConfig object with appropriate command, URL, or
   * other installation details.
   *
   * @private
   * @param {GlamaServer} server - Server data
   * @returns {InstallConfig} Installation configuration
   */
  private buildInstallConfig(server: GlamaServer) {
    const config: Record<string, unknown> = {};

    if (server.installCommand) {
      config.command = server.installCommand;
    }

    if (server.repository) {
      config.url = server.repository;
    }

    if (server.installUrl) {
      config.url = server.installUrl;
    }

    if (server.homepage) {
      config.url = config.url || server.homepage;
    }

    return config;
  }
}
