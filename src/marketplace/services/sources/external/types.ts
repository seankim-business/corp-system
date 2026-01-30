/**
 * External Marketplace Hub - Base Types and Interfaces
 *
 * Defines the universal format for items from external sources (Smithery, MCP Registry,
 * ComfyUI, CivitAI, LangChain Hub, etc.) and the base class for implementing new sources.
 *
 * @module marketplace/services/sources/external/types
 */

import type { ExtensionType } from "@prisma/client";

/**
 * Installation method for external items
 *
 * @typedef {string} InstallMethod
 * @example
 * - 'npx': npx -y @package/name
 * - 'uvx': uvx package-name
 * - 'docker': docker run ...
 * - 'http': Remote MCP server
 * - 'git': git clone + setup
 * - 'download': Direct file download
 * - 'api': Pull via API (LangChain Hub)
 * - 'manual': Manual installation required
 */
export type InstallMethod =
  | "npx"
  | "uvx"
  | "docker"
  | "http"
  | "git"
  | "download"
  | "api"
  | "manual";

/**
 * Installation configuration for an external item
 *
 * Contains all necessary information to install an item from an external source.
 * The structure varies based on the installation method.
 *
 * @interface InstallConfig
 * @property {string} [command] - Command to execute (e.g., package name for npx)
 * @property {string[]} [args] - Additional arguments for the command
 * @property {Record<string, string>} [env] - Environment variables to set
 * @property {string} [url] - URL for remote servers or downloads
 * @property {Record<string, unknown>} [configSchema] - JSON Schema for configuration options
 *
 * @example
 * // NPX installation
 * {
 *   command: "@anthropic/slack-mcp",
 *   args: ["--config", "/path/to/config.json"],
 *   env: { SLACK_BOT_TOKEN: "xoxb-..." }
 * }
 *
 * @example
 * // HTTP remote server
 * {
 *   url: "http://localhost:3000",
 *   configSchema: {
 *     type: "object",
 *     properties: { apiKey: { type: "string" } }
 *   }
 * }
 */
export interface InstallConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  configSchema?: Record<string, unknown>;
}

/**
 * Universal format for items from external sources
 *
 * Represents a single item (MCP server, workflow, prompt, skill) from any external
 * marketplace. This interface normalizes data from different sources into a common format.
 *
 * @interface ExternalSourceItem
 * @property {string} id - Unique identifier within the source (e.g., "smithery:@anthropic/slack-mcp")
 * @property {string} source - Source identifier (e.g., "smithery", "mcp-registry", "comfyui")
 * @property {ExtensionType} type - Type of extension (mcp_server, skill, extension)
 * @property {string} name - Display name
 * @property {string} description - Short description
 * @property {string} [version] - Current version
 * @property {string} [author] - Author/publisher name
 * @property {string} [repository] - Repository URL (GitHub, etc.)
 * @property {string} [homepage] - Official homepage
 * @property {string} [license] - License type (MIT, Apache-2.0, etc.)
 * @property {string[]} [tags] - Categorization tags
 * @property {number} [downloads] - Total download count
 * @property {number} [stars] - GitHub stars or equivalent
 * @property {number} [rating] - Average rating (0-5)
 * @property {InstallMethod} installMethod - How to install this item
 * @property {InstallConfig} installConfig - Installation configuration
 * @property {unknown} [rawData] - Original API response from source (for debugging)
 *
 * @example
 * {
 *   id: "smithery:@anthropic/slack-mcp",
 *   source: "smithery",
 *   type: "mcp_server",
 *   name: "Slack MCP Server",
 *   description: "Connect to Slack via MCP",
 *   version: "1.0.0",
 *   author: "Anthropic",
 *   repository: "https://github.com/anthropics/mcp-servers",
 *   license: "MIT",
 *   tags: ["slack", "communication", "mcp"],
 *   downloads: 5000,
 *   stars: 250,
 *   rating: 4.8,
 *   installMethod: "npx",
 *   installConfig: {
 *     command: "@anthropic/slack-mcp",
 *     env: { SLACK_BOT_TOKEN: "xoxb-..." }
 *   }
 * }
 */
export interface ExternalSourceItem {
  // Identification
  id: string;
  source: string;
  type: ExtensionType;

  // Basic metadata
  name: string;
  description: string;
  version?: string;

  // Publisher information
  author?: string;
  repository?: string;
  homepage?: string;
  license?: string;
  tags?: string[];

  // Statistics
  downloads?: number;
  stars?: number;
  rating?: number;

  // Installation
  installMethod: InstallMethod;
  installConfig: InstallConfig;

  // Raw data from source API
  rawData?: unknown;
}

/**
 * Search options for querying external sources
 *
 * @interface SearchOptions
 * @property {string} [query] - Search query string
 * @property {number} [limit] - Maximum results to return (default: 20)
 * @property {number} [offset] - Pagination offset (default: 0)
 * @property {ExtensionType} [type] - Filter by extension type
 * @property {string[]} [tags] - Filter by tags (AND logic)
 *
 * @example
 * {
 *   query: "slack",
 *   type: "mcp_server",
 *   limit: 10,
 *   tags: ["communication"]
 * }
 */
export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  type?: ExtensionType;
  tags?: string[];
}

/**
 * Search result from an external source
 *
 * @interface SearchResult
 * @property {ExternalSourceItem[]} items - Array of matching items
 * @property {number} total - Total number of matching items (may exceed items.length)
 * @property {boolean} hasMore - Whether more results are available
 *
 * @example
 * {
 *   items: [
 *     { id: "...", name: "Slack MCP", ... },
 *     { id: "...", name: "Slack Bot", ... }
 *   ],
 *   total: 42,
 *   hasMore: true
 * }
 */
export interface SearchResult {
  items: ExternalSourceItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Base class for implementing external source connectors
 *
 * All external source implementations (Smithery, MCP Registry, ComfyUI, etc.)
 * should extend this class and implement the abstract methods.
 *
 * @abstract
 * @class BaseExternalSource
 *
 * @example
 * export class SmitherySource extends BaseExternalSource {
 *   readonly sourceId = "smithery";
 *   readonly displayName = "Smithery";
 *   readonly supportedTypes = ["mcp_server"];
 *
 *   async search(options: SearchOptions): Promise<SearchResult> {
 *     // Implementation
 *   }
 *
 *   async getById(id: string): Promise<ExternalSourceItem | null> {
 *     // Implementation
 *   }
 * }
 */
export abstract class BaseExternalSource {
  /**
   * Unique identifier for this source
   *
   * @abstract
   * @readonly
   * @type {string}
   * @example "smithery", "mcp-registry", "comfyui"
   */
  abstract readonly sourceId: string;

  /**
   * Human-readable display name for this source
   *
   * @abstract
   * @readonly
   * @type {string}
   * @example "Smithery", "MCP Registry", "ComfyUI"
   */
  abstract readonly displayName: string;

  /**
   * Types of extensions this source supports
   *
   * @abstract
   * @readonly
   * @type {ExtensionType[]}
   * @example ["mcp_server"], ["extension", "workflow"]
   */
  abstract readonly supportedTypes: ExtensionType[];

  /**
   * Search for items in this source
   *
   * @abstract
   * @param {SearchOptions} options - Search parameters
   * @returns {Promise<SearchResult>} Search results
   *
   * @example
   * const result = await source.search({
   *   query: "slack",
   *   type: "mcp_server",
   *   limit: 10
   * });
   */
  abstract search(options: SearchOptions): Promise<SearchResult>;

  /**
   * Get a specific item by ID
   *
   * @abstract
   * @param {string} id - Item ID from this source
   * @returns {Promise<ExternalSourceItem | null>} Item details or null if not found
   *
   * @example
   * const item = await source.getById("@anthropic/slack-mcp");
   */
  abstract getById(id: string): Promise<ExternalSourceItem | null>;

  /**
   * Generate human-readable installation instructions for an item
   *
   * Default implementation provides basic instructions based on installMethod.
   * Override for source-specific instructions.
   *
   * @param {ExternalSourceItem} item - The item to generate instructions for
   * @returns {string} Installation instructions
   *
   * @example
   * const instructions = source.getInstallInstructions(item);
   * // Returns: "Run: npx -y @anthropic/slack-mcp"
   */
  getInstallInstructions(item: ExternalSourceItem): string {
    const { installMethod, installConfig, name } = item;

    switch (installMethod) {
      case "npx":
        return `Run: npx -y ${installConfig.command || name}${
          installConfig.args ? ` ${installConfig.args.join(" ")}` : ""
        }`;

      case "uvx":
        return `Run: uvx ${installConfig.command || name}${
          installConfig.args ? ` ${installConfig.args.join(" ")}` : ""
        }`;

      case "docker":
        return `Run: docker run ${installConfig.args?.join(" ") || name}`;

      case "http":
        return `Connect to: ${installConfig.url || "Remote server"}`;

      case "git":
        return `Clone: git clone ${installConfig.url || "repository"}\nThen follow setup instructions`;

      case "download":
        return `Download from: ${installConfig.url || "source"}\nThen extract and install`;

      case "api":
        return `Pull via API: ${installConfig.url || "API endpoint"}`;

      case "manual":
        return `Manual installation required. Visit: ${installConfig.url || "documentation"}`;

      default:
        return `Install: ${name}`;
    }
  }
}
