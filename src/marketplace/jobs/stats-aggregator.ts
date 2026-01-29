// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";

let aggregatorTimer: NodeJS.Timeout | null = null;

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Stats Aggregator Job
 *
 * Runs hourly to:
 * - Recalculate active installs for all extensions
 * - Update rating averages
 * - Generate download trends
 */

export async function aggregateStats(): Promise<void> {
  logger.info("Starting stats aggregation");

  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  // Table needed: marketplaceExtension with fields: id, status, activeInstalls, rating, reviewCount, etc.
  logger.warn("Stats aggregation skipped - marketplaceExtension table not yet created");
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  try {
    // Get all published extensions
    const extensions = await db.marketplaceExtension.findMany({
      where: { status: "published" },
      select: { id: true },
    });

    for (const ext of extensions) {
      await aggregateExtensionStats(ext.id);
    }

    logger.info("Stats aggregation completed", {
      extensionCount: extensions.length,
    });
  } catch (error) {
    logger.error(
      "Stats aggregation failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  */
}

// TODO: Will be used when marketplace tables are implemented
export async function aggregateExtensionStats(_extensionId: string): Promise<void> {
  // TODO: Implement once tables are created via Prisma migration
  logger.warn("aggregateExtensionStats skipped - tables not yet created", { extensionId: _extensionId });
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  try {
    // Count active installs
    const activeInstalls = await db.extensionInstall.count({
      where: { extensionId, status: "active" },
    });

    // Calculate average rating
    const reviews = await db.extensionReview.findMany({
      where: { extensionId, status: "approved" },
      select: { rating: true },
    });

    const reviewCount = reviews.length;
    const rating =
      reviewCount > 0
        ? Math.round(
            (reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviewCount) * 10,
          ) / 10
        : 0;

    // Update extension
    await db.marketplaceExtension.update({
      where: { id: extensionId },
      data: {
        activeInstalls,
        rating,
        reviewCount,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to aggregate stats for extension",
      { extensionId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  */
}

export async function generateTrendingScore(): Promise<void> {
  logger.info("Calculating trending scores");

  // TODO: Implement once extensionInstall and marketplaceExtension tables are created
  logger.warn("Trending score generation skipped - tables not yet created");
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  try {
    // Get installs from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentInstalls = await db.extensionInstall.groupBy({
      by: ["extensionId"],
      where: {
        installedAt: { gte: weekAgo },
      },
      _count: { id: true },
    });

    // Update trending based on recent activity + rating
    for (const item of recentInstalls) {
      const extension = await db.marketplaceExtension.findUnique({
        where: { id: item.extensionId },
        select: { rating: true, downloads: true },
      });

      if (!extension) continue;

      // Trending score = recent_installs * 10 + rating * 100 + log(total_downloads)
      const trendingScore =
        item._count.id * 10 +
        extension.rating * 100 +
        Math.log(extension.downloads + 1) * 10;

      // We could store this in a separate table for trending sort
      // For now, featured flag is used manually
      // Unused variable fixed by commenting it out above
    }

    logger.info("Trending scores calculated", {
      extensionCount: recentInstalls.length,
    });
  } catch (error) {
    logger.error(
      "Trending calculation failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  */
}

export function startStatsAggregatorJob(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  // Run immediately on start
  aggregateStats();

  // Run every hour
  aggregatorTimer = setInterval(async () => {
    await aggregateStats();
    await generateTrendingScore();
  }, ONE_HOUR_MS);

  aggregatorTimer.unref?.();

  logger.info("Stats aggregator job started", { intervalMs: ONE_HOUR_MS });
}

export function stopStatsAggregatorJob(): void {
  if (aggregatorTimer) {
    clearInterval(aggregatorTimer);
    aggregatorTimer = null;
    logger.info("Stats aggregator job stopped");
  }
}
