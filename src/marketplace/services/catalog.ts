// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import {
  MarketplaceExtension,
  ExtensionVersion,
  PaginatedResult,
  MarketplaceCategory,
} from "../types";

export interface CatalogListOptions {
  category?: string;
  tags?: string[];
  pricing?: string;
  sort?: "popular" | "recent" | "rating" | "trending";
  status?: string;
  page?: number;
  limit?: number;
}

// Type for raw extension data from database
interface RawExtensionData {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  publisherId: string;
  publisher?: {
    name: string;
    verified: boolean;
  };
  versions?: ExtensionVersion[];
  category: string;
  tags: string[];
  pricing: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceInterval: string | null;
  downloads: number;
  activeInstalls: number;
  rating: number;
  reviewCount: number;
  icon: string | null;
  screenshots: string[];
  demoUrl: string | null;
  repositoryUrl: string | null;
  documentationUrl: string | null;
  nubabelVersion: string | null;
  permissions: string[];
  status: string;
  featured: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// TODO: Will be used when marketplace tables are implemented
export function mapExtensionToDto(ext: RawExtensionData): MarketplaceExtension {
  return {
    id: ext.id,
    name: ext.name,
    slug: ext.slug,
    description: ext.description,
    longDescription: ext.longDescription,
    publisherId: ext.publisherId,
    publisherName: ext.publisher?.name || "Unknown",
    publisherVerified: ext.publisher?.verified || false,
    version: ext.versions?.[0]?.version || "1.0.0",
    versions: ext.versions || [],
    category: ext.category,
    tags: ext.tags || [],
    pricing: ext.pricing as "free" | "paid" | "freemium",
    price: ext.priceAmount
      ? {
          amount: ext.priceAmount,
          currency: ext.priceCurrency || "USD",
          interval: ext.priceInterval as "month" | "year" | "once" | undefined,
        }
      : undefined,
    stats: {
      downloads: ext.downloads,
      activeInstalls: ext.activeInstalls,
      rating: ext.rating,
      reviewCount: ext.reviewCount,
    },
    icon: ext.icon,
    screenshots: ext.screenshots || [],
    demoUrl: ext.demoUrl || undefined,
    repositoryUrl: ext.repositoryUrl || undefined,
    documentationUrl: ext.documentationUrl || undefined,
    requirements: {
      nubabelVersion: ext.nubabelVersion || ">=1.0.0",
      permissions: ext.permissions || [],
    },
    status: ext.status as "draft" | "review" | "published" | "rejected",
    featured: ext.featured,
    publishedAt: ext.publishedAt,
    createdAt: ext.createdAt,
    updatedAt: ext.updatedAt,
  };
}

export async function listExtensions(
  options: CatalogListOptions,
): Promise<PaginatedResult<MarketplaceExtension>> {
  const { page = 1, limit = 20 } = options;

  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("listExtensions returning empty data - marketplaceExtension table not yet created");

  return {
    items: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  };

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const { category, tags, pricing, sort = "popular", status = "published", page = 1, limit = 20 } = options;

  const where: Record<string, unknown> = { status };

  if (category) {
    where.category = category;
  }

  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  if (pricing) {
    where.pricing = pricing;
  }

  let orderBy: Record<string, unknown> | Array<Record<string, unknown>> = {};
  switch (sort) {
    case "popular":
      orderBy = { downloads: "desc" };
      break;
    case "recent":
      orderBy = { publishedAt: "desc" };
      break;
    case "rating":
      orderBy = { rating: "desc" };
      break;
    case "trending":
      orderBy = [{ activeInstalls: "desc" }, { rating: "desc" }];
      break;
  }

  const [extensions, total] = await Promise.all([
    db.marketplaceExtension.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        publisher: {
          select: { name: true, verified: true },
        },
        versions: {
          where: { status: "published" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    db.marketplaceExtension.count({ where }),
  ]);

  return {
    items: extensions.map(mapExtensionToDto),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
  */
}

export async function getExtension(idOrSlug: string): Promise<MarketplaceExtension | null> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("getExtension returning null - marketplaceExtension table not yet created", { idOrSlug });
  return null;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const extension = await db.marketplaceExtension.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      publisher: {
        select: { id: true, name: true, slug: true, verified: true },
      },
      versions: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!extension) return null;

  return mapExtensionToDto(extension);
  */
}

export async function getExtensionVersions(extensionId: string): Promise<ExtensionVersion[]> {
  // TODO: Implement once extensionVersion table is created via Prisma migration
  logger.warn("getExtensionVersions returning empty array - extensionVersion table not yet created", { extensionId });
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const versions = await db.extensionVersion.findMany({
    where: { extensionId },
    orderBy: { createdAt: "desc" },
  });

  return versions.map((v) => ({
    id: v.id,
    extensionId: v.extensionId,
    version: v.version,
    changelog: v.changelog,
    packageUrl: v.packageUrl,
    packageSize: v.packageSize,
    manifest: v.manifest as Record<string, unknown>,
    checksum: v.checksum,
    status: v.status as "draft" | "review" | "published",
    downloads: v.downloads,
    publishedAt: v.publishedAt,
    createdAt: v.createdAt,
  }));
  */
}

export async function getFeaturedExtensions(): Promise<MarketplaceExtension[]> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("getFeaturedExtensions returning empty array - marketplaceExtension table not yet created");
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const extensions = await db.marketplaceExtension.findMany({
    where: {
      featured: true,
      status: "published",
    },
    orderBy: { featuredAt: "desc" },
    take: 10,
    include: {
      publisher: {
        select: { name: true, verified: true },
      },
      versions: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return extensions.map(mapExtensionToDto);
  */
}

export async function getRecommendedExtensions(
  orgId: string,
): Promise<MarketplaceExtension[]> {
  // TODO: Implement once extensionInstall and marketplaceExtension tables are created
  logger.warn("getRecommendedExtensions returning empty array - tables not yet created", { orgId });
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  // Get installed extensions for the org
  const installedExtensions = await db.extensionInstall.findMany({
    where: { organizationId: orgId, status: "active" },
    select: { extensionId: true },
  });

  const installedIds = installedExtensions.map((i) => i.extensionId);

  // Find extensions with similar tags or same category
  const installed = await db.marketplaceExtension.findMany({
    where: { id: { in: installedIds } },
    select: { category: true, tags: true },
  });

  const categories = [...new Set(installed.map((i) => i.category))];
  const allTags = installed.flatMap((i) => i.tags);
  const tagCounts = allTags.reduce(
    (acc: Record<string, number>, tag: string) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Find similar extensions not yet installed
  const recommended = await db.marketplaceExtension.findMany({
    where: {
      status: "published",
      id: { notIn: installedIds },
      OR: [{ category: { in: categories } }, { tags: { hasSome: topTags } }],
    },
    orderBy: [{ rating: "desc" }, { downloads: "desc" }],
    take: 10,
    include: {
      publisher: {
        select: { name: true, verified: true },
      },
      versions: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return recommended.map(mapExtensionToDto);
  */
}

export async function getCategories(): Promise<MarketplaceCategory[]> {
  // TODO: Implement once marketplaceCategory table is created via Prisma migration
  logger.warn("getCategories returning empty array - marketplaceCategory table not yet created");
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const categories = await db.marketplaceCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Get extension counts per category
  const counts = await db.marketplaceExtension.groupBy({
    by: ["category"],
    where: { status: "published" },
    _count: { id: true },
  });

  const countMap = counts.reduce(
    (acc: Record<string, number>, c: { category: string; _count: { id: number } }) => {
      acc[c.category] = c._count.id;
      return acc;
    },
    {} as Record<string, number>,
  );

  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description || undefined,
    icon: c.icon || undefined,
    sortOrder: c.sortOrder,
    extensionCount: countMap[c.slug] || 0,
  }));
  */
}

export async function incrementDownload(
  extensionId: string,
  versionId: string,
): Promise<void> {
  // TODO: Implement once marketplaceExtension and extensionVersion tables are created
  logger.warn("incrementDownload skipped - tables not yet created", { extensionId, versionId });
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  await Promise.all([
    db.marketplaceExtension.update({
      where: { id: extensionId },
      data: { downloads: { increment: 1 } },
    }),
    db.extensionVersion.update({
      where: { id: versionId },
      data: { downloads: { increment: 1 } },
    }),
  ]);

  logger.info("Extension download recorded", { extensionId, versionId });
  */
}

export async function updateActiveInstalls(extensionId: string): Promise<void> {
  // TODO: Implement once extensionInstall and marketplaceExtension tables are created
  logger.warn("updateActiveInstalls skipped - tables not yet created", { extensionId });
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const activeInstalls = await db.extensionInstall.count({
    where: { extensionId, status: "active" },
  });

  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: { activeInstalls },
  });
  */
}
