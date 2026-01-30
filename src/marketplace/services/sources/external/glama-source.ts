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
 * Glama API v1 server structure
 */
interface GlamaServer {
  id: string;
  name: string;
  namespace?: string;
  slug?: string;
  description?: string;
  repository?: {
    url?: string;
  };
  spdxLicense?: {
    name?: string;
    url?: string;
  };
  url?: string;
  attributes?: string[];
  environmentVariablesJsonSchema?: Record<string, unknown>;
  tools?: unknown[];
}

/**
 * Glama API v1 response structure
 */
interface GlamaApiResponse {
  servers: GlamaServer[];
  pageInfo?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
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
  private readonly apiEndpoint = `${this.baseUrl}/api/mcp/v1/servers`;
  private readonly requestTimeout = 10000; // 10 seconds

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
      const servers = data.servers || [];

      // Map Glama servers to ExternalSourceItem format
      const items = servers.map((server) => this.mapToExternalItem(server));

      return {
        items,
        total: items.length,
        hasMore: data.pageInfo?.hasNextPage ?? items.length >= limit,
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
   * Map a Glama server to ExternalSourceItem format
   */
  private mapToExternalItem(server: GlamaServer, overrideId?: string): ExternalSourceItem {
    const id = overrideId || server.id;

    return {
      id: `glama:${id}`,
      source: this.sourceId,
      type: "mcp_server",
      name: server.name,
      description: server.description || "MCP Server from Glama",
      author: server.namespace,
      repository: server.repository?.url,
      homepage: server.url,
      license: server.spdxLicense?.name,
      tags: server.attributes || [],
      installMethod: this.inferInstallMethod(server),
      installConfig: this.buildInstallConfig(server),
      rawData: server,
    };
  }

  /**
   * Infer the installation method from server metadata
   */
  private inferInstallMethod(server: GlamaServer): "npx" | "http" | "git" | "manual" {
    // Check if remote-capable
    const isRemoteCapable = server.attributes?.includes("hosting:remote-capable");

    // If there's a repository, prefer git install
    if (server.repository?.url) {
      return "git";
    }

    // If remote-capable, could use http
    if (isRemoteCapable) {
      return "http";
    }

    // Default to manual
    return "manual";
  }

  /**
   * Build installation configuration from server metadata
   */
  private buildInstallConfig(server: GlamaServer): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    if (server.repository?.url) {
      config.url = server.repository.url;
    }

    if (server.url) {
      config.homepage = server.url;
    }

    if (server.environmentVariablesJsonSchema) {
      config.envSchema = server.environmentVariablesJsonSchema;
    }

    return config;
  }
}
