// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";

let moderatorTimer: NodeJS.Timeout | null = null;

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Simple profanity filter (extend as needed)
const BLOCKED_WORDS = [
  "spam",
  "scam",
  "fake",
  // Add more blocked words as needed
];

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /http[s]?:\/\/(?!nubabel)/i, // External links (except nubabel)
  /\b\d{10,}\b/, // Long numbers (phone numbers, etc.)
  /(.)\1{4,}/, // Repeated characters (aaaaaaa)
];

/**
 * Review Moderator Job
 *
 * Runs every 5 minutes to:
 * - Auto-approve clean reviews
 * - Flag suspicious reviews for manual review
 * - Reject obvious spam
 */

export async function moderateReviews(): Promise<void> {
  logger.info("Starting review moderation");

  // TODO: Implement once extensionReview table is created via Prisma migration
  // Table needed: extensionReview with fields: id, extensionId, status, createdAt, moderatedAt, etc.
  logger.warn("Review moderation skipped - extensionReview table not yet created");
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  try {
    // Get pending reviews
    const pendingReviews = await db.extensionReview.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 100, // Process in batches
    });

    let approved = 0;
    let rejected = 0;
    let flagged = 0;

    for (const review of pendingReviews) {
      const result = analyzeReview(review);

      if (result.action === "approve") {
        await db.extensionReview.update({
          where: { id: review.id },
          data: {
            status: "approved",
            moderatedAt: new Date(),
          },
        });
        approved++;

        // Update extension rating
        await updateExtensionRating(review.extensionId);
      } else if (result.action === "reject") {
        await db.extensionReview.update({
          where: { id: review.id },
          data: {
            status: "rejected",
            moderatedAt: new Date(),
          },
        });
        rejected++;

        logger.info("Review auto-rejected", {
          reviewId: review.id,
          reason: result.reason,
        });
      } else {
        // Flag for manual review - keep as pending
        flagged++;

        logger.info("Review flagged for manual review", {
          reviewId: review.id,
          reason: result.reason,
        });
      }
    }

    logger.info("Review moderation completed", {
      total: pendingReviews.length,
      approved,
      rejected,
      flagged,
    });
  } catch (error) {
    logger.error(
      "Review moderation failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  */
}

interface ModerationResult {
  action: "approve" | "reject" | "flag";
  reason?: string;
}

// TODO: Will be used when extensionReview table is implemented
export function analyzeReview(review: {
  title: string;
  body: string;
  rating: number;
}): ModerationResult {
  const text = `${review.title} ${review.body}`.toLowerCase();

  // Check for blocked words
  for (const word of BLOCKED_WORDS) {
    if (text.includes(word)) {
      return { action: "flag", reason: `Contains blocked word: ${word}` };
    }
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return { action: "flag", reason: `Matches suspicious pattern` };
    }
  }

  // Check for very short reviews (potential spam)
  if (review.body.length < 20) {
    return { action: "flag", reason: "Review too short" };
  }

  // Check for all caps (potential angry spam)
  const upperRatio =
    (review.body.match(/[A-Z]/g)?.length || 0) / review.body.length;
  if (upperRatio > 0.7 && review.body.length > 50) {
    return { action: "flag", reason: "Excessive caps" };
  }

  // Check for extreme ratings with short reviews (potential manipulation)
  if ((review.rating === 1 || review.rating === 5) && review.body.length < 50) {
    return { action: "flag", reason: "Extreme rating with short review" };
  }

  // All checks passed - auto-approve
  return { action: "approve" };
}

// TODO: Will be used when marketplace tables are implemented
export async function updateExtensionRating(extensionId: string): Promise<void> {
  // TODO: Implement once extensionReview and marketplaceExtension tables are created
  logger.warn("updateExtensionRating skipped - tables not yet created", { extensionId });
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const reviews = await db.extensionReview.findMany({
    where: { extensionId, status: "approved" },
    select: { rating: true },
  });

  if (reviews.length === 0) return;

  const average =
    Math.round(
      (reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length) * 10,
    ) / 10;

  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: {
      rating: average,
      reviewCount: reviews.length,
    },
  });
  */
}

export async function detectReviewManipulation(): Promise<void> {
  logger.info("Checking for review manipulation");

  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("Review manipulation detection skipped - extensionReview table not yet created");
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  try {
    // Find extensions with suspicious review patterns
    const recentReviews = await db.extensionReview.groupBy({
      by: ["extensionId"],
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
      },
      _count: { id: true },
      _avg: { rating: true },
    });

    for (const group of recentReviews) {
      // Flag if too many reviews in short time
      if (group._count.id > 10) {
        logger.warn("Suspicious review activity detected", {
          extensionId: group.extensionId,
          reviewCount: group._count.id,
          averageRating: group._avg.rating,
        });
      }

      // Flag if all reviews are 5 stars
      if (group._count.id > 5 && group._avg.rating === 5) {
        logger.warn("Possible review manipulation - all 5 stars", {
          extensionId: group.extensionId,
          reviewCount: group._count.id,
        });
      }
    }
  } catch (error) {
    logger.error(
      "Review manipulation check failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  */
}

export function startReviewModeratorJob(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  // Run immediately on start
  moderateReviews();

  // Run every 5 minutes
  moderatorTimer = setInterval(async () => {
    await moderateReviews();

    // Check for manipulation once per hour
    const minute = new Date().getMinutes();
    if (minute < 5) {
      await detectReviewManipulation();
    }
  }, FIVE_MINUTES_MS);

  moderatorTimer.unref?.();

  logger.info("Review moderator job started", { intervalMs: FIVE_MINUTES_MS });
}

export function stopReviewModeratorJob(): void {
  if (moderatorTimer) {
    clearInterval(moderatorTimer);
    moderatorTimer = null;
    logger.info("Review moderator job stopped");
  }
}
