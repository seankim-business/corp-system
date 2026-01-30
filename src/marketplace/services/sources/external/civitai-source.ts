import type { ExtensionType } from "@prisma/client";
import {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
  SearchResult,
  type InstallConfig,
} from "./types";

interface CivitAIModel {
  id: number;
  name: string;
  type: "LORA" | "Checkpoint" | "Workflows" | "TextualInversion" | "Upscaler";
  description: string;
  tags: string[];
  creator: {
    username: string;
  };
  stats: {
    downloadCount: number;
    rating: number;
    ratingCount?: number;
  };
  modelVersions: CivitAIModelVersion[];
  nsfw?: boolean;
}

interface CivitAIModelVersion {
  id: number;
  name: string;
  downloadUrl: string;
  files: Array<{
    sizeKb: number;
  }>;
}

interface CivitAIListResponse {
  items: CivitAIModel[];
  metadata: {
    totalItems: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };
}

export class CivitAISource extends BaseExternalSource {
  readonly sourceId = "civitai";
  readonly displayName = "CivitAI";
  readonly supportedTypes: ExtensionType[] = ["extension", "skill"];

  private readonly baseUrl = "https://civitai.com/api/v1";
  private readonly apiKey?: string;
  private readonly logger = {
    info: (msg: string, data?: unknown) => console.log(`[CivitAI] ${msg}`, data || ""),
    error: (msg: string, err?: unknown) => console.error(`[CivitAI] ${msg}`, err || ""),
  };

  constructor(options?: { apiKey?: string }) {
    super();
    this.apiKey = options?.apiKey;
    this.logger.info("CivitAI source initialized");
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    try {
      const { query = "", limit = 20, offset = 0 } = options;

      const params = new URLSearchParams();
      params.append("limit", Math.min(limit, 100).toString());
      params.append("page", Math.floor(offset / limit + 1).toString());

      if (query) {
        params.append("query", query);
      }

      params.append("types", "Workflows");

      const url = `${this.baseUrl}/models?${params.toString()}${
        this.apiKey ? `&token=${this.apiKey}` : ""
      }`;

      this.logger.info(`Searching models: ${query || "all"}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`CivitAI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as CivitAIListResponse;

      const items = data.items.map((model) => this.mapToItem(model));

      this.logger.info(`Found ${items.length} models (total: ${data.metadata.totalItems})`);

      return {
        items,
        total: data.metadata.totalItems,
        hasMore: data.metadata.currentPage < data.metadata.totalPages,
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

  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      const url = `${this.baseUrl}/models/${id}${this.apiKey ? `?token=${this.apiKey}` : ""}`;

      this.logger.info(`Fetching model: ${id}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info(`Model not found: ${id}`);
          return null;
        }
        throw new Error(`CivitAI API error: ${response.status} ${response.statusText}`);
      }

      const model = (await response.json()) as CivitAIModel;
      return this.mapToItem(model);
    } catch (error) {
      this.logger.error(`Failed to fetch model ${id}`, error);
      return null;
    }
  }

  private mapToItem(model: CivitAIModel): ExternalSourceItem {
    const latestVersion = model.modelVersions[0];
    const downloadUrl = latestVersion?.downloadUrl || "";
    const fileSize = latestVersion?.files[0]?.sizeKb || 0;

    const installConfig: InstallConfig = {
      url: downloadUrl,
    };

    return {
      id: `civitai:${model.id}`,
      source: this.sourceId,
      type: "extension" as ExtensionType,
      name: model.name,
      description: model.description || `${model.type} model from CivitAI`,
      version: latestVersion?.name || "1.0.0",
      author: model.creator.username,
      tags: model.tags || [],
      downloads: model.stats.downloadCount,
      rating: model.stats.rating,
      installMethod: "download",
      installConfig,
      rawData: {
        civitaiId: model.id,
        type: model.type,
        fileSize,
        nsfw: model.nsfw,
      },
    };
  }
}

export function createCivitAISource(options?: { apiKey?: string }): CivitAISource {
  return new CivitAISource(options);
}
