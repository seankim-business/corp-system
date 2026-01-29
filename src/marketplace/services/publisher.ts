// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import {
  Publisher,
  PublisherRegistration,
  ExtensionSubmission,
  PublisherAnalytics,
  PublisherPayout,
  MarketplaceExtension,
} from "../types";

// TODO: Will be used when marketplace tables are implemented
export function mapPublisherToDto(_pub: any): Publisher {
  // TODO: Implement once publisher table is created via Prisma migration
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function registerPublisher(
  userId: string,
  data: PublisherRegistration,
): Promise<Publisher> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("registerPublisher not implemented - tables not yet created", { userId, data });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function getPublisher(idOrSlug: string): Promise<Publisher | null> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("getPublisher returning null - tables not yet created", { idOrSlug });
  return null;
}

export async function getPublisherByUserId(userId: string): Promise<Publisher | null> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("getPublisherByUserId returning null - tables not yet created", { userId });
  return null;
}

export async function updatePublisher(
  publisherId: string,
  data: Partial<PublisherRegistration>,
): Promise<Publisher> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("updatePublisher not implemented - tables not yet created", { publisherId, data });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function submitExtension(
  publisherId: string,
  submission: ExtensionSubmission,
  packageUrl: string,
  manifest: any,
): Promise<{ extensionId: string; versionId: string }> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("submitExtension not implemented - tables not yet created", {
    publisherId,
    submission,
    packageUrl,
    manifest,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function publishExtension(
  extensionId: string,
  versionId: string,
): Promise<void> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("publishExtension not implemented - tables not yet created", { extensionId, versionId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function rejectExtension(
  extensionId: string,
  reason: string,
): Promise<void> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("rejectExtension not implemented - tables not yet created", { extensionId, reason });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function getPublisherExtensions(
  publisherId: string,
): Promise<MarketplaceExtension[]> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("getPublisherExtensions returning empty array - tables not yet created", { publisherId });
  return [];
}

export async function getPublisherAnalytics(
  publisherId: string,
  period: "7d" | "30d" | "90d" | "1y" = "30d",
): Promise<PublisherAnalytics> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("getPublisherAnalytics returning empty data - tables not yet created", { publisherId, period });
  return {
    totalDownloads: 0,
    totalRevenue: 0,
    totalInstalls: 0,
    extensionStats: [],
    downloadTrend: [],
    revenueTrend: [],
  };
}

// TODO: Will be used when marketplace tables are implemented
export function generateTrend(
  dates: Date[],
  days: number,
): { date: string; count: number }[] {
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

// TODO: Will be used when marketplace tables are implemented
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

export async function getPayoutHistory(
  publisherId: string,
): Promise<PublisherPayout[]> {
  // TODO: Implement once publisherPayout table is created via Prisma migration
  logger.warn("getPayoutHistory returning empty array - tables not yet created", { publisherId });
  return [];
}

export async function verifyPublisher(publisherId: string): Promise<void> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("verifyPublisher not implemented - tables not yet created", { publisherId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function setStripeAccount(
  publisherId: string,
  stripeAccountId: string,
): Promise<void> {
  // TODO: Implement once publisher table is created via Prisma migration
  logger.warn("setStripeAccount not implemented - tables not yet created", { publisherId, stripeAccountId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}
