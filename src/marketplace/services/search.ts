// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import { MarketplaceExtension, SearchResult } from "../types";

interface SearchFilters {
  category?: string;
  tags?: string[];
  pricing?: string;
  minRating?: number;
  publisherVerified?: boolean;
}

interface SearchOptions {
  page?: number;
  limit?: number;
}

// TODO: Will be used when marketplace tables are implemented
export function mapExtensionToDto(_ext: any): MarketplaceExtension {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function searchExtensions(
  query: string,
  filters?: SearchFilters,
  options?: SearchOptions,
): Promise<SearchResult> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("searchExtensions returning empty data - tables not yet created", { query, filters, options });

  return {
    extensions: [],
    total: 0,
    facets: {
      categories: [],
      tags: [],
      pricing: [],
    },
  };
}

export async function suggestExtensions(prefix: string): Promise<string[]> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("suggestExtensions returning empty array - tables not yet created", { prefix });
  return [];
}

export async function findSimilarExtensions(
  extensionId: string,
): Promise<MarketplaceExtension[]> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("findSimilarExtensions returning empty array - tables not yet created", { extensionId });
  return [];
}

export async function getPopularSearches(): Promise<string[]> {
  // TODO: Implement once marketplaceCategory and marketplaceExtension tables are created
  logger.warn("getPopularSearches returning empty array - tables not yet created");
  return [];
}
