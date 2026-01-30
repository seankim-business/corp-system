import type { ExtensionType } from "@prisma/client";
import {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
  SearchResult,
  type InstallConfig,
} from "./types";

/**
 * LangChain Hub API response for a repository
 */
interface LangChainHubRepo {
  owner: string;
  repo: string;
  description: string;
  tags: string[];
  updated_at: string;
  created_at: string;
  url: string;
  type: "prompt" | "chain" | "agent";
  num_views?: number;
  num_likes?: number;
}

/**
 * LangChain Hub API response for listing repositories
 */
interface LangChainHubListResponse {
  repos: LangChainHubRepo[];
  total: number;
}

/**
 * LangChain Hub API response for a specific commit/version
 */
interface LangChainHubCommit {
  ref: string;
  created_at: string;
  message?: string;
}

/**
 * LangChain Hub source connector
 *
 * Integrates with LangChain Hub (part of LangSmith platform) to provide
 * access to public prompts, chains, and agents.
 *
 * @class LangChainHubSource
 * @extends BaseExternalSource
 *
 * @example
 * const source = createLangChainHubSource({
 *   apiKey: process.env.LANGCHAIN_API_KEY
 * });
 *
 * const results = await source.search({
 *   query: "summarization",
 *   limit: 10
 * });
 *
 * const item = await source.getById("anthropic/summarization-prompt");
 */
export class LangChainHubSource extends BaseExternalSource {
  readonly sourceId = "langchain-hub";
  readonly displayName = "LangChain Hub";
  readonly supportedTypes: ExtensionType[] = ["skill", "extension"];

  private readonly baseUrl = "https://api.smith.langchain.com";
  private readonly apiKey?: string;
  private readonly logger = {
    info: (msg: string, data?: unknown) => console.log(`[LangChain Hub] ${msg}`, data || ""),
    warn: (msg: string, data?: unknown) => console.warn(`[LangChain Hub] ${msg}`, data || ""),
    error: (msg: string, err?: unknown) => console.error(`[LangChain Hub] ${msg}`, err || ""),
  };

  /**
   * Initialize LangChain Hub source
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.apiKey] - Optional LangChain API key from environment
   */
  constructor(options?: { apiKey?: string }) {
    super();
    this.apiKey = options?.apiKey || process.env.LANGCHAIN_API_KEY;

    if (!this.apiKey) {
      this.logger.warn("No LANGCHAIN_API_KEY provided. Search will return limited results.");
    } else {
      this.logger.info("LangChain Hub source initialized with API key");
    }
  }

  /**
   * Search for prompts and chains in LangChain Hub
   *
   * @param {SearchOptions} options - Search parameters
   * @returns {Promise<SearchResult>} Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    try {
      const { query = "", limit = 20, offset = 0 } = options;

      // If no API key, return empty result with warning
      if (!this.apiKey) {
        this.logger.warn("Search requires LANGCHAIN_API_KEY. Set it in environment variables.");
        return {
          items: [],
          total: 0,
          hasMore: false,
        };
      }

      // Build query parameters
      const params = new URLSearchParams();
      params.append("limit", Math.min(limit, 100).toString());
      params.append("offset", offset.toString());

      if (query) {
        params.append("q", query);
      }

      const url = `${this.baseUrl}/repos?${params.toString()}`;

      this.logger.info(`Searching prompts/chains: ${query || "all"}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logger.error("Invalid LANGCHAIN_API_KEY");
          return {
            items: [],
            total: 0,
            hasMore: false,
          };
        }
        throw new Error(`LangChain Hub API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as LangChainHubListResponse;

      const items = data.repos.map((repo) => this.mapToItem(repo));

      this.logger.info(`Found ${items.length} items (total: ${data.total})`);

      return {
        items,
        total: data.total,
        hasMore: offset + limit < data.total,
      };
    } catch (error) {
      this.logger.error("Search failed", error);
      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get a specific prompt or chain by ID
   *
   * Format: owner/repo or owner/repo:version
   *
   * @param {string} id - Repository ID (owner/repo or owner/repo:version)
   * @returns {Promise<ExternalSourceItem | null>} Item details or null if not found
   *
   * @example
   * const item = await source.getById("anthropic/summarization-prompt");
   * const versionedItem = await source.getById("anthropic/summarization-prompt:v1.0");
   */
  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      // Parse ID format: owner/repo or owner/repo:version
      const [repoPath, version] = id.split(":");
      const [owner, repo] = repoPath.split("/");

      if (!owner || !repo) {
        this.logger.error(`Invalid ID format: ${id}. Expected: owner/repo`);
        return null;
      }

      if (!this.apiKey) {
        this.logger.warn("getById requires LANGCHAIN_API_KEY. Set it in environment variables.");
        return null;
      }

      // Fetch repository metadata
      const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}`;

      this.logger.info(`Fetching repo: ${owner}/${repo}`);

      const repoResponse = await fetch(repoUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!repoResponse.ok) {
        if (repoResponse.status === 404) {
          this.logger.info(`Repo not found: ${owner}/${repo}`);
          return null;
        }
        throw new Error(
          `LangChain Hub API error: ${repoResponse.status} ${repoResponse.statusText}`,
        );
      }

      const repo_data = (await repoResponse.json()) as LangChainHubRepo;

      // If version specified, fetch specific commit
      let selectedVersion = version || "main";
      if (version) {
        const commitUrl = `${this.baseUrl}/commits/${owner}/${repo}/${version}`;
        const commitResponse = await fetch(commitUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        if (commitResponse.ok) {
          const commit = (await commitResponse.json()) as LangChainHubCommit;
          selectedVersion = commit.ref;
        }
      }

      return this.mapToItem(repo_data, selectedVersion);
    } catch (error) {
      this.logger.error(`Failed to fetch repo ${id}`, error);
      return null;
    }
  }

  /**
   * Map LangChain Hub repository to universal ExternalSourceItem format
   *
   * @private
   * @param {LangChainHubRepo} repo - LangChain Hub repository data
   * @param {string} [version] - Optional version/ref (defaults to "main")
   * @returns {ExternalSourceItem} Mapped item
   */
  private mapToItem(repo: LangChainHubRepo, version: string = "main"): ExternalSourceItem {
    const repoId = `${repo.owner}/${repo.repo}`;

    // Map LangChain Hub type to ExtensionType
    const extensionType: ExtensionType = repo.type === "prompt" ? "skill" : "extension";

    const installConfig: InstallConfig = {
      url: repo.url,
      command: `langchain hub pull ${repoId}:${version}`,
      args: ["--api-url", "https://api.smith.langchain.com"],
      env: {
        LANGCHAIN_API_KEY: this.apiKey || "",
      },
    };

    return {
      id: `langchain-hub:${repoId}`,
      source: this.sourceId,
      type: extensionType,
      name: repo.repo,
      description: repo.description || `${repo.type} from LangChain Hub by ${repo.owner}`,
      version: version,
      author: repo.owner,
      repository: repo.url,
      tags: repo.tags || [],
      downloads: repo.num_views || 0,
      rating: repo.num_likes ? repo.num_likes / Math.max(repo.num_views || 1, 1) : undefined,
      installMethod: "api",
      installConfig,
      rawData: {
        langchainHubType: repo.type,
        owner: repo.owner,
        repo: repo.repo,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        views: repo.num_views,
        likes: repo.num_likes,
      },
    };
  }
}

/**
 * Factory function to create a LangChain Hub source instance
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.apiKey] - Optional LangChain API key (defaults to LANGCHAIN_API_KEY env var)
 * @returns {LangChainHubSource} LangChain Hub source instance
 *
 * @example
 * const source = createLangChainHubSource({
 *   apiKey: process.env.LANGCHAIN_API_KEY
 * });
 *
 * const results = await source.search({ query: "summarization" });
 */
export function createLangChainHubSource(options?: { apiKey?: string }): LangChainHubSource {
  return new LangChainHubSource(options);
}
