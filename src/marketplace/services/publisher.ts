import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { mapExtensionToDto } from "./catalog";
import {
  Publisher,
  PublisherRegistration,
  ExtensionSubmission,
  PublisherAnalytics,
  PublisherPayout,
  MarketplaceExtension,
} from "../types";

// Map Prisma model to DTO
// Note: ExtensionPublisher schema has: id, organizationId, name, slug, description, website, verified, createdAt, updatedAt
export function mapPublisherToDto(pub: {
  id: string;
  organizationId: string | null;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Publisher {
  return {
    id: pub.id,
    userId: pub.organizationId || "",
    name: pub.name,
    slug: pub.slug,
    email: "", // Not in schema - would need to join with Organization or User
    website: pub.website ?? undefined,
    description: pub.description ?? undefined,
    logoUrl: undefined, // Not in schema
    verified: pub.verified,
    verifiedAt: undefined, // Not in schema
    stripeAccountId: undefined, // Not in schema
    payoutEnabled: false, // Not in schema - would need to check if payouts exist
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
  };
}

export async function registerPublisher(
  userId: string,
  data: PublisherRegistration,
): Promise<Publisher> {
  // Note: email, stripeAccountId, payoutEnabled are not in the schema
  // They would need to be tracked separately or schema needs migration
  const publisher = await db.extensionPublisher.create({
    data: {
      organizationId: userId,
      name: data.name,
      slug: data.slug,
      website: data.website ?? null,
      description: data.description ?? null,
      verified: false,
    },
  });

  logger.info("Publisher registered", { publisherId: publisher.id, userId });
  return mapPublisherToDto(publisher);
}

export async function getPublisher(idOrSlug: string): Promise<Publisher | null> {
  const publisher = await db.extensionPublisher.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  });

  return publisher ? mapPublisherToDto(publisher) : null;
}

export async function getPublisherByUserId(userId: string): Promise<Publisher | null> {
  const publisher = await db.extensionPublisher.findFirst({
    where: {
      organizationId: userId,
    },
  });

  return publisher ? mapPublisherToDto(publisher) : null;
}

export async function updatePublisher(
  publisherId: string,
  data: Partial<PublisherRegistration>,
): Promise<Publisher> {
  const publisher = await db.extensionPublisher.update({
    where: { id: publisherId },
    data: {
      name: data.name,
      website: data.website ?? undefined,
      description: data.description ?? undefined,
    },
  });

  logger.info("Publisher updated", { publisherId });
  return mapPublisherToDto(publisher);
}

export async function submitExtension(
  publisherId: string,
  submission: ExtensionSubmission,
  _packageUrl: string,
  manifest: Record<string, unknown>,
): Promise<{ extensionId: string; versionId: string }> {
  // Create extension with "draft" status for review
  const extension = await db.marketplaceExtension.create({
    data: {
      publisherId,
      name: submission.name,
      slug: submission.slug,
      description: submission.description,
      version: (manifest.version as string) || "1.0.0",
      category: submission.category,
      tags: submission.tags,
      manifest: {
        ...manifest,
        metadata: {
          longDescription: submission.longDescription,
          pricing: submission.pricing,
          priceAmount: submission.priceAmount,
          priceCurrency: submission.priceCurrency,
          priceInterval: submission.priceInterval,
          icon: submission.icon,
          screenshots: submission.screenshots,
          demoUrl: submission.demoUrl,
          repositoryUrl: submission.repositoryUrl,
          documentationUrl: submission.documentationUrl,
        },
      },
      isPublic: false, // Not public until reviewed
      status: "draft",
      enabled: false,
    },
  });

  // Create initial version
  const version = await db.extensionVersion.create({
    data: {
      extensionId: extension.id,
      version: (manifest.version as string) || "1.0.0",
      manifest: manifest as any,
      changelog: "Initial release",
    },
  });

  logger.info("Extension submitted for review", {
    publisherId,
    extensionId: extension.id,
    versionId: version.id,
  });

  return { extensionId: extension.id, versionId: version.id };
}

export async function publishExtension(extensionId: string, _versionId: string): Promise<void> {
  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: {
      status: "active",
      isPublic: true,
      enabled: true,
    },
  });

  logger.info("Extension published", { extensionId });
}

export async function rejectExtension(extensionId: string, reason: string): Promise<void> {
  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: {
      status: "rejected",
      manifest: {
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
      },
    },
  });

  logger.info("Extension rejected", { extensionId, reason });
}

export async function getPublisherExtensions(publisherId: string): Promise<MarketplaceExtension[]> {
  const extensions = await db.marketplaceExtension.findMany({
    where: { publisherId },
    include: {
      publisher: {
        select: { name: true, verified: true },
      },
      versions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return extensions.map((ext) => mapExtensionToDto(ext as any));
}

export async function getPublisherAnalytics(
  publisherId: string,
  period: "7d" | "30d" | "90d" | "1y" = "30d",
): Promise<PublisherAnalytics> {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all extensions for this publisher
  const extensions = await db.marketplaceExtension.findMany({
    where: { publisherId },
    include: {
      installations: {
        where: {
          installedAt: { gte: startDate },
        },
      },
    },
  });

  // Calculate totals
  let totalDownloads = 0;
  let totalInstalls = 0;
  const extensionStats = extensions.map((ext) => {
    totalDownloads += ext.downloads;
    totalInstalls += ext.installations.length;
    return {
      extensionId: ext.id,
      name: ext.name,
      downloads: ext.downloads,
      installs: ext.installations.length,
      revenue: 0, // No purchase tracking in current schema
      rating: ext.rating || 0,
    };
  });

  // Generate download trend (using installation dates as proxy)
  const allInstallDates = extensions.flatMap((ext) =>
    ext.installations.map((i) => i.installedAt),
  );
  const downloadTrend = generateTrend(allInstallDates, days);

  return {
    totalDownloads,
    totalRevenue: 0, // No purchase tracking
    totalInstalls,
    extensionStats,
    downloadTrend,
    revenueTrend: [], // No revenue tracking
  };
}

export function generateTrend(dates: Date[], days: number): { date: string; count: number }[] {
  const byDate: Record<string, number> = {};
  for (const date of dates) {
    const dateStr = date.toISOString().split("T")[0];
    byDate[dateStr] = (byDate[dateStr] || 0) + 1;
  }

  const result: { date: string; count: number }[] = [];
  const current = new Date();
  current.setDate(current.getDate() - days);

  while (current <= new Date()) {
    const dateStr = current.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: byDate[dateStr] || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

export function generateRevenueTrend(
  data: { date: Date; amount: number }[],
  days: number,
): { date: string; amount: number }[] {
  const byDate: Record<string, number> = {};
  for (const item of data) {
    const dateStr = item.date.toISOString().split("T")[0];
    byDate[dateStr] = (byDate[dateStr] || 0) + item.amount;
  }

  const result: { date: string; amount: number }[] = [];
  const current = new Date();
  current.setDate(current.getDate() - days);

  while (current <= new Date()) {
    const dateStr = current.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      amount: byDate[dateStr] || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

export async function getPayoutHistory(publisherId: string): Promise<PublisherPayout[]> {
  const payouts = await db.publisherPayout.findMany({
    where: { publisherId },
    orderBy: { createdAt: "desc" },
  });

  return payouts.map((payout) => ({
    id: payout.id,
    publisherId: payout.publisherId,
    amount: payout.amount,
    currency: payout.currency,
    periodStart: payout.periodStart || payout.createdAt,
    periodEnd: payout.periodEnd || payout.createdAt,
    stripeTransferId: payout.transactionId ?? undefined,
    status: payout.status as "pending" | "processing" | "completed" | "failed",
    paidAt: payout.processedAt ?? undefined,
    createdAt: payout.createdAt,
  }));
}

export async function verifyPublisher(publisherId: string): Promise<void> {
  await db.extensionPublisher.update({
    where: { id: publisherId },
    data: {
      verified: true,
      // verifiedAt not in schema
    },
  });

  logger.info("Publisher verified", { publisherId });
}

export async function setStripeAccount(
  _publisherId: string,
  _stripeAccountId: string,
): Promise<void> {
  // Note: stripeAccountId and payoutEnabled are not in the ExtensionPublisher schema
  // This would require a schema migration to add these fields
  logger.warn("setStripeAccount: stripeAccountId field not in schema - requires migration");
  throw new Error("Stripe account linking requires schema migration");
}
