import { db } from "../../db/client";
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

export function mapExtensionToDto(ext: any): MarketplaceExtension {
  return {
    id: ext.id,
    name: ext.name,
    slug: ext.slug,
    description: ext.description,
    longDescription: ext.description, // Using description as longDescription since schema doesn't have separate field

    // Publisher
    publisherId: ext.publisherId || "",
    publisherName: ext.publisher?.name || "Unknown",
    publisherVerified: ext.publisher?.verified || false,

    // Versioning
    version: ext.version,
    versions: ext.versions || [],

    // Categorization
    category: ext.category,
    tags: ext.tags || [],

    // Pricing (defaulting to free since schema doesn't have pricing fields)
    pricing: "free",

    // Stats
    stats: {
      downloads: ext.downloads || 0,
      activeInstalls: 0, // Not in schema
      rating: ext.rating || 0,
      reviewCount: ext.ratingCount || 0,
    },

    // Media
    icon: null, // Not in schema
    screenshots: [], // Not in schema
    demoUrl: undefined,
    repositoryUrl: undefined,
    documentationUrl: undefined,

    // Metadata
    requirements: {
      nubabelVersion: "1.0.0", // Default
      permissions: [],
    },

    // Status
    status: ext.status === "active" ? "published" : "draft",
    featured: false, // Not in schema

    publishedAt: ext.status === "active" ? ext.createdAt : null,
    createdAt: ext.createdAt,
    updatedAt: ext.updatedAt,
  };
}

export async function searchExtensions(
  query: string,
  filters?: SearchFilters,
  options?: SearchOptions,
): Promise<SearchResult> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

  try {
    // Build where clause
    const where: any = {
      isPublic: true,
      status: "active",
      OR: query
        ? [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { tags: { has: query } },
          ]
        : undefined,
    };

    // Apply filters
    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    if (filters?.minRating !== undefined) {
      where.rating = { gte: filters.minRating };
    }

    if (filters?.publisherVerified) {
      where.publisher = { verified: true };
    }

    // Execute search query
    const [extensions, total] = await Promise.all([
      db.marketplaceExtension.findMany({
        where,
        include: {
          publisher: true,
          versions: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        skip,
        take: limit,
        orderBy: [
          { downloads: "desc" },
          { rating: "desc" },
        ],
      }),
      db.marketplaceExtension.count({ where }),
    ]);

    // Generate facets by querying aggregates
    const [categoryFacets, tagFacets] = await Promise.all([
      db.marketplaceExtension.groupBy({
        by: ["category"],
        where: { isPublic: true, status: "active" },
        _count: { category: true },
        orderBy: { _count: { category: "desc" } },
        take: 20,
      }),
      // For tags, we need to get all tags and count manually since Prisma doesn't support grouping on array fields
      db.marketplaceExtension.findMany({
        where: { isPublic: true, status: "active" },
        select: { tags: true },
      }),
    ]);

    // Process tag facets
    const tagCounts = new Map<string, number>();
    tagFacets.forEach((ext) => {
      ext.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const topTags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      extensions: extensions.map(mapExtensionToDto),
      total,
      facets: {
        categories: categoryFacets.map((f) => ({
          name: f.category,
          count: f._count.category,
        })),
        tags: topTags,
        pricing: [
          { type: "free", count: total }, // All are free for now
        ],
      },
    };
  } catch (error) {
    logger.error("Error searching extensions", { error, query, filters, options });
    throw error;
  }
}

export async function suggestExtensions(prefix: string): Promise<string[]> {
  try {
    const extensions = await db.marketplaceExtension.findMany({
      where: {
        isPublic: true,
        status: "active",
        OR: [
          { name: { startsWith: prefix, mode: "insensitive" } },
          { name: { contains: prefix, mode: "insensitive" } },
        ],
      },
      select: { name: true },
      take: 10,
      orderBy: [
        { downloads: "desc" },
        { rating: "desc" },
      ],
    });

    return extensions.map((ext) => ext.name);
  } catch (error) {
    logger.error("Error suggesting extensions", { error, prefix });
    return [];
  }
}

export async function findSimilarExtensions(
  extensionId: string,
): Promise<MarketplaceExtension[]> {
  try {
    // First, get the source extension to compare against
    const sourceExtension = await db.marketplaceExtension.findUnique({
      where: { id: extensionId },
      select: { category: true, tags: true },
    });

    if (!sourceExtension) {
      return [];
    }

    // Find similar extensions based on category and overlapping tags
    const similarExtensions = await db.marketplaceExtension.findMany({
      where: {
        id: { not: extensionId },
        isPublic: true,
        status: "active",
        OR: [
          { category: sourceExtension.category },
          { tags: { hasSome: sourceExtension.tags } },
        ],
      },
      include: {
        publisher: true,
        versions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      take: 10,
      orderBy: [
        { rating: "desc" },
        { downloads: "desc" },
      ],
    });

    return similarExtensions.map(mapExtensionToDto);
  } catch (error) {
    logger.error("Error finding similar extensions", { error, extensionId });
    return [];
  }
}

export async function getPopularSearches(): Promise<string[]> {
  try {
    // Get popular categories
    const categories = await db.marketplaceCategory.findMany({
      select: { name: true },
      orderBy: { sortOrder: "asc" },
      take: 5,
    });

    // Get most popular tags from extensions
    const extensions = await db.marketplaceExtension.findMany({
      where: { isPublic: true, status: "active" },
      select: { tags: true },
      take: 100,
      orderBy: { downloads: "desc" },
    });

    // Count tag frequencies
    const tagCounts = new Map<string, number>();
    extensions.forEach((ext) => {
      ext.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const popularTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Combine categories and popular tags
    const searches = [
      ...categories.map((c) => c.name),
      ...popularTags,
    ];

    return searches.slice(0, 10);
  } catch (error) {
    logger.error("Error getting popular searches", { error });
    return [];
  }
}
