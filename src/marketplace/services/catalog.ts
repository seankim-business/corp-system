import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import {
  MarketplaceExtension,
  ExtensionVersion,
  ExtensionManifest,
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

// Type for raw extension data from database (matching Prisma schema)
interface RawExtensionData {
  id: string;
  organizationId: string | null;
  slug: string;
  name: string;
  description: string;
  version: string;
  extensionType: string;
  category: string;
  tags: string[];
  source: string | null;
  format: string | null;
  manifest: unknown;
  definition: unknown;
  runtimeType: string | null;
  runtimeConfig: unknown;
  triggers: string[];
  parameters: unknown;
  outputs: unknown;
  dependencies: string[];
  toolsRequired: string[];
  mcpProviders: string[];
  publisherId: string | null;
  publisher?: {
    name: string;
    verified: boolean;
  };
  isPublic: boolean;
  verified: boolean;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  status: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  versions?: Array<{
    id: string;
    extensionId: string;
    version: string;
    manifest: unknown;
    definition: unknown;
    changelog: string | null;
    createdAt: Date;
    createdBy: string | null;
  }>;
}

export function mapExtensionToDto(ext: RawExtensionData): MarketplaceExtension {
  // Extract metadata from manifest if available
  const manifest = (ext.manifest as any) || {};
  const metadata = manifest.metadata || {};

  return {
    id: ext.id,
    name: ext.name,
    slug: ext.slug,
    description: ext.description,
    longDescription: metadata.longDescription || ext.description,
    publisherId: ext.publisherId || "",
    publisherName: ext.publisher?.name || "Unknown",
    publisherVerified: ext.publisher?.verified || false,
    version: ext.versions?.[0]?.version || ext.version || "1.0.0",
    versions: (ext.versions || []).map(v => ({
      id: v.id,
      extensionId: v.extensionId,
      version: v.version,
      changelog: v.changelog,
      packageUrl: "",
      packageSize: null,
      manifest: v.manifest as unknown as ExtensionManifest,
      checksum: null,
      status: "published" as const,
      downloads: 0,
      publishedAt: null,
      createdAt: v.createdAt,
    })),
    category: ext.category,
    tags: ext.tags || [],
    pricing: (metadata.pricing || "free") as "free" | "paid" | "freemium",
    price: metadata.priceAmount
      ? {
          amount: metadata.priceAmount,
          currency: metadata.priceCurrency || "USD",
          interval: metadata.priceInterval as "month" | "year" | "once" | undefined,
        }
      : undefined,
    stats: {
      downloads: ext.downloads,
      activeInstalls: 0,
      rating: ext.rating || 0,
      reviewCount: ext.ratingCount,
    },
    icon: metadata.icon || null,
    screenshots: metadata.screenshots || [],
    demoUrl: metadata.demoUrl || undefined,
    repositoryUrl: metadata.repositoryUrl || undefined,
    documentationUrl: metadata.documentationUrl || undefined,
    requirements: {
      nubabelVersion: metadata.nubabelVersion || ">=1.0.0",
      permissions: ext.dependencies || [],
    },
    status: ext.status as "draft" | "review" | "published" | "rejected",
    featured: metadata.featured || false,
    publishedAt: metadata.publishedAt || null,
    createdAt: ext.createdAt,
    updatedAt: ext.updatedAt,
  };
}

export async function listExtensions(
  options: CatalogListOptions,
): Promise<PaginatedResult<MarketplaceExtension>> {
  const { category, tags, sort = "popular", status = "active", page = 1, limit = 20 } = options;

  const where: Record<string, unknown> = {
    status,
    isPublic: true,
  };

  if (category) {
    where.category = category;
  }

  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  let orderBy: Record<string, unknown> | Array<Record<string, unknown>> = {};
  switch (sort) {
    case "popular":
      orderBy = { downloads: "desc" };
      break;
    case "recent":
      orderBy = { createdAt: "desc" };
      break;
    case "rating":
      orderBy = { rating: "desc" };
      break;
    case "trending":
      orderBy = [{ downloads: "desc" }, { rating: "desc" }];
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
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    db.marketplaceExtension.count({ where }),
  ]);

  return {
    items: extensions.map((ext) => mapExtensionToDto(ext as any)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getExtension(idOrSlug: string): Promise<MarketplaceExtension | null> {
  const extension = await db.marketplaceExtension.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      publisher: {
        select: { id: true, name: true, slug: true, verified: true },
      },
      versions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!extension) return null;

  return mapExtensionToDto(extension as any);
}

export async function getExtensionVersions(extensionId: string): Promise<ExtensionVersion[]> {
  const versions = await db.extensionVersion.findMany({
    where: { extensionId },
    orderBy: { createdAt: "desc" },
  });

  return versions.map((v) => ({
    id: v.id,
    extensionId: v.extensionId,
    version: v.version,
    changelog: v.changelog,
    packageUrl: "",
    packageSize: null,
    manifest: v.manifest as unknown as ExtensionManifest,
    checksum: null,
    status: "published" as const,
    downloads: 0,
    publishedAt: null,
    createdAt: v.createdAt,
  }));
}

export async function getFeaturedExtensions(): Promise<MarketplaceExtension[]> {
  // Schema doesn't have featured flag - return top verified extensions
  const extensions = await db.marketplaceExtension.findMany({
    where: {
      status: "active",
      isPublic: true,
      verified: true,
    },
    orderBy: [{ rating: "desc" }, { downloads: "desc" }],
    take: 10,
    include: {
      publisher: {
        select: { name: true, verified: true },
      },
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return extensions.map((ext) => mapExtensionToDto(ext as any));
}

export async function getRecommendedExtensions(
  orgId: string,
): Promise<MarketplaceExtension[]> {
  // Get installed extensions for the org
  const installedExtensions = await db.extensionInstallation.findMany({
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
      status: "active",
      isPublic: true,
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
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return recommended.map((ext) => mapExtensionToDto(ext as any));
}

export async function getCategories(): Promise<MarketplaceCategory[]> {
  const categories = await db.marketplaceCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Get extension counts per category
  const counts = await db.marketplaceExtension.groupBy({
    by: ["category"],
    where: { status: "active", isPublic: true },
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
}

export async function incrementDownload(
  extensionId: string,
  versionId: string,
): Promise<void> {
  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: { downloads: { increment: 1 } },
  });

  logger.info("Extension download recorded", { extensionId, versionId });
}

export async function updateActiveInstalls(extensionId: string): Promise<void> {
  const activeInstalls = await db.extensionInstallation.count({
    where: { extensionId, status: "active" },
  });

  logger.info("Active installs count", { extensionId, activeInstalls });
}

export async function createCategory(data: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
}): Promise<MarketplaceCategory> {
  const category = await db.marketplaceCategory.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      parentId: data.parentId,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description || undefined,
    icon: category.icon || undefined,
    sortOrder: category.sortOrder,
    extensionCount: 0,
  };
}

export async function updateCategory(
  categoryId: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  },
): Promise<MarketplaceCategory> {
  const category = await db.marketplaceCategory.update({
    where: { id: categoryId },
    data: {
      name: data.name,
      description: data.description,
      icon: data.icon,
      sortOrder: data.sortOrder,
    },
  });

  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description || undefined,
    icon: category.icon || undefined,
    sortOrder: category.sortOrder,
  };
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await db.marketplaceCategory.delete({
    where: { id: categoryId },
  });
}
