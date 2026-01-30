/**
 * Search Marketplace Tool
 *
 * Search across external marketplace sources (Smithery, MCP Registry, Glama, ComfyUI, CivitAI, LangChain Hub)
 */

import { SearchMarketplaceInput, SearchMarketplaceOutput } from "../types";
import { createAllSources, BaseExternalSource } from "../../../marketplace/services/sources/external";
import { logger } from "../../../utils/logger";

let sourcesCache: Map<string, BaseExternalSource> | null = null;

function getSources(): Map<string, BaseExternalSource> {
  if (!sourcesCache) {
    sourcesCache = new Map();
    const allSources = createAllSources({
      smitheryApiKey: process.env.SMITHERY_API_KEY,
      civitaiApiKey: process.env.CIVITAI_API_KEY,
      langchainApiKey: process.env.LANGCHAIN_API_KEY,
    });
    for (const source of allSources) {
      sourcesCache.set(source.sourceId, source);
    }
  }
  return sourcesCache;
}

export async function searchMarketplaceTool(
  input: SearchMarketplaceInput,
  organizationId: string,
): Promise<SearchMarketplaceOutput> {
  const { query, sources: requestedSources, type, limit = 20 } = input;

  if (!query) {
    throw new Error("query is required");
  }

  const sourcesMap = getSources();
  const selectedSources: BaseExternalSource[] = [];

  if (!requestedSources || requestedSources.length === 0) {
    selectedSources.push(...Array.from(sourcesMap.values()));
  } else {
    for (const sourceId of requestedSources) {
      const source = sourcesMap.get(sourceId);
      if (source) {
        selectedSources.push(source);
      }
    }
  }

  if (selectedSources.length === 0) {
    throw new Error("No valid sources specified");
  }

  // Search all sources in parallel
  const searchPromises = selectedSources.map(async (source) => {
    try {
      const result = await source.search({ query, limit, type: type as any });
      return { sourceId: source.sourceId, items: result.items };
    } catch (error) {
      logger.error("Source search failed", { sourceId: source.sourceId, query }, error as Error);
      return { sourceId: source.sourceId, items: [] };
    }
  });

  const results = await Promise.all(searchPromises);

  const allItems = results.flatMap(r => r.items);
  const sourcesSearched = results.map(r => r.sourceId);

  logger.info("Marketplace search completed via MCP tool", {
    organizationId,
    query,
    sources: sourcesSearched,
    totalResults: allItems.length,
  });

  return {
    items: allItems,
    total: allItems.length,
    sources: sourcesSearched,
  };
}
