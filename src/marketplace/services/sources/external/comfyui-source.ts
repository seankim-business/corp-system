/**
 * ComfyUI Registry Source
 *
 * Integrates with the ComfyUI Registry API (https://api.comfy.org) to fetch
 * nodes, custom nodes, and workflows for the Marketplace Hub.
 *
 * @module marketplace/services/sources/external/comfyui-source
 */

import type { ExtensionType } from "@prisma/client";
import { logger } from "../../../../utils/logger";
import {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
  SearchResult,
  InstallMethod,
  InstallConfig,
} from "./types";

/**
 * ComfyUI Registry API response for a node
 *
 * @interface ComfyUINode
 */
interface ComfyUINode {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  github_stars: number;
  rating: number;
  repository: string;
  latest_version: {
    version: string;
    [key: string]: unknown;
  };
  tags: string[];
  [key: string]: unknown;
}

/**
 * ComfyUI Registry API response for nodes list
 *
 * @interface ComfyUINodesResponse
 */
interface ComfyUINodesResponse {
  nodes: ComfyUINode[];
  total: number;
  page: number;
  limit: number;
  [key: string]: unknown;
}

/**
 * ComfyUI Registry source implementation
 *
 * Fetches nodes and workflows from the ComfyUI Registry API.
 * No authentication required.
 *
 * @class ComfyUISource
 * @extends BaseExternalSource
 *
 * @example
 * const source = new ComfyUISource();
 * const results = await source.search({
 *   query: "upscale",
 *   type: "extension",
 *   limit: 10
 * });
 */
export class ComfyUISource extends BaseExternalSource {
  readonly sourceId = "comfyui";
  readonly displayName = "ComfyUI Registry";
  readonly supportedTypes: ExtensionType[] = ["extension" as ExtensionType];

  private readonly baseUrl = "https://api.comfy.org";
  private readonly timeout = 10000; // 10 seconds

  /**
   * Search for nodes in the ComfyUI Registry
   *
   * @param {SearchOptions} options - Search parameters
   * @returns {Promise<SearchResult>} Search results
   *
   * @throws {Error} If API request fails
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = "", limit = 20, offset = 0 } = options;

    try {
      logger.debug("ComfyUI search", { query, limit, offset });

      const params = new URLSearchParams();
      if (query) {
        params.append("search", query);
      }
      params.append("page", String(Math.floor(offset / limit) + 1));
      params.append("limit", String(limit));

      const url = `${this.baseUrl}/nodes?${params.toString()}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`ComfyUI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ComfyUINodesResponse;

      const items = data.nodes.map((node) => this.mapToItem(node));

      logger.info("ComfyUI search completed", {
        query,
        found: items.length,
        total: data.total,
      });

      return {
        items,
        total: data.total,
        hasMore: offset + limit < data.total,
      };
    } catch (error) {
      logger.error("ComfyUI search failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty results on error instead of throwing
      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get a specific node by ID
   *
   * @param {string} id - Node ID from ComfyUI Registry
   * @returns {Promise<ExternalSourceItem | null>} Node details or null if not found
   *
   * @throws {Error} If API request fails
   */
  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      logger.debug("ComfyUI getById", { id });

      const url = `${this.baseUrl}/nodes/${encodeURIComponent(id)}/install`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        logger.warn("ComfyUI node not found", { id });
        return null;
      }

      if (!response.ok) {
        throw new Error(`ComfyUI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ComfyUINode;
      const item = this.mapToItem(data);

      logger.info("ComfyUI getById completed", { id, name: item.name });

      return item;
    } catch (error) {
      logger.error("ComfyUI getById failed", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  /**
   * Map ComfyUI node to universal ExternalSourceItem format
   *
   * @private
   * @param {ComfyUINode} node - Raw node data from ComfyUI API
   * @returns {ExternalSourceItem} Mapped item
   */
  private mapToItem(node: ComfyUINode): ExternalSourceItem {
    const installMethod: InstallMethod = "git";
    const installConfig: InstallConfig = {
      url: node.repository,
    };

    return {
      id: `${this.sourceId}:${node.id}`,
      source: this.sourceId,
      type: "extension",
      name: node.name,
      description: node.description,
      version: node.latest_version?.version,
      author: node.author,
      repository: node.repository,
      tags: node.tags || [],
      downloads: node.downloads || 0,
      stars: node.github_stars || 0,
      rating: node.rating || 0,
      installMethod,
      installConfig,
      rawData: node,
    };
  }

  /**
   * Fetch with timeout
   *
   * @private
   * @param {string} url - URL to fetch
   * @returns {Promise<Response>} Fetch response
   *
   * @throws {Error} If request times out
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Nubabel/1.0 (+https://nubabel.com)",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Singleton instance of ComfyUISource
 *
 * @type {ComfyUISource}
 */
export const comfyuiSource = new ComfyUISource();
