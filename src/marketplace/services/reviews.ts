import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { Review, PaginatedResult, RatingSummary } from "../types";
import type { ExtensionReview } from "@prisma/client";

export function mapReviewToDto(review: any): Review {
  return {
    id: review.id,
    extensionId: review.extensionId,
    userId: review.userId,
    userName: review.user?.displayName || review.user?.email || "Anonymous",
    organizationId: review.organizationId || "",
    rating: review.rating,
    title: review.title || "",
    body: review.content || "",
    status: "approved", // No moderation in current schema
    helpfulCount: review.helpfulCount || 0,
    publisherResponse: review.publisherResponse
      ? {
          body: review.publisherResponse.body,
          respondedAt: new Date(review.publisherResponse.respondedAt),
        }
      : undefined,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export async function createReview(
  extensionId: string,
  userId: string,
  _userName: string,
  organizationId: string,
  data: { rating: number; title: string; body: string },
): Promise<Review> {
  logger.info("Creating review", { extensionId, userId, rating: data.rating });

  // Validate rating
  if (data.rating < 1 || data.rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const review = await db.extensionReview.create({
    data: {
      extensionId,
      userId,
      rating: data.rating,
      title: data.title,
      content: data.body,
      isVerified: false,
      helpfulCount: 0,
      unhelpfulCount: 0,
    },
  });

  // Update extension rating summary
  await updateExtensionRating(extensionId);

  return mapReviewToDto({ ...review, organizationId });
}

export async function listReviews(
  extensionId: string,
  options?: {
    sort?: "recent" | "helpful" | "rating_high" | "rating_low";
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedResult<Review>> {
  const { sort = "recent", page = 1, limit = 10 } = options || {};
  const skip = (page - 1) * limit;

  logger.info("Listing reviews", { extensionId, sort, page, limit });

  // Build orderBy clause
  let orderBy: any = {};
  switch (sort) {
    case "helpful":
      orderBy = { helpfulCount: "desc" };
      break;
    case "rating_high":
      orderBy = { rating: "desc" };
      break;
    case "rating_low":
      orderBy = { rating: "asc" };
      break;
    case "recent":
    default:
      orderBy = { createdAt: "desc" };
      break;
  }

  const [reviews, total] = await Promise.all([
    db.extensionReview.findMany({
      where: { extensionId },
      orderBy,
      skip,
      take: limit,
    }),
    db.extensionReview.count({ where: { extensionId } }),
  ]);

  return {
    items: reviews.map((r: ExtensionReview) => mapReviewToDto({ ...r, organizationId: "" })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function respondToReview(
  reviewId: string,
  publisherId: string,
  response: string,
): Promise<void> {
  logger.info("Responding to review", { reviewId, publisherId });

  // Note: Current schema doesn't have publisherResponse field
  // This would require a schema migration to add a JSON field or separate table
  // For now, we'll log a warning
  logger.warn("Publisher response feature requires schema migration - not yet implemented", {
    reviewId,
    publisherId,
    response,
  });

  // Verify review exists
  const review = await db.extensionReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new Error("Review not found");
  }

  // TODO: Add publisherResponse field to schema and implement storage
  throw new Error("Publisher response feature requires schema migration");
}

export async function voteHelpful(
  reviewId: string,
  userId: string,
): Promise<void> {
  logger.info("Voting review as helpful", { reviewId, userId });

  // Check if user already voted
  const existingVote = await db.reviewHelpfulVote.findUnique({
    where: {
      reviewId_userId: {
        reviewId,
        userId,
      },
    },
  });

  if (existingVote) {
    // Toggle vote or do nothing based on current state
    if (existingVote.isHelpful) {
      // Already marked as helpful, do nothing
      logger.info("User already voted this review as helpful");
      return;
    } else {
      // Change from unhelpful to helpful
      await db.reviewHelpfulVote.update({
        where: { id: existingVote.id },
        data: { isHelpful: true },
      });

      // Update counts: -1 unhelpful, +1 helpful
      await db.extensionReview.update({
        where: { id: reviewId },
        data: {
          unhelpfulCount: { decrement: 1 },
          helpfulCount: { increment: 1 },
        },
      });
    }
  } else {
    // Create new vote
    await db.reviewHelpfulVote.create({
      data: {
        reviewId,
        userId,
        isHelpful: true,
      },
    });

    // Increment helpful count
    await db.extensionReview.update({
      where: { id: reviewId },
      data: {
        helpfulCount: { increment: 1 },
      },
    });
  }

  logger.info("Vote recorded successfully");
}

export async function getRatingSummary(
  extensionId: string,
): Promise<RatingSummary> {
  logger.info("Getting rating summary", { extensionId });

  const reviews = await db.extensionReview.findMany({
    where: { extensionId },
    select: { rating: true },
  });

  if (reviews.length === 0) {
    return {
      average: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  // Calculate distribution
  const distribution: { [stars: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;

  for (const review of reviews) {
    distribution[review.rating]++;
    totalRating += review.rating;
  }

  const average = totalRating / reviews.length;

  return {
    average: Number(average.toFixed(2)),
    count: reviews.length,
    distribution,
  };
}

export async function updateExtensionRating(extensionId: string): Promise<void> {
  logger.info("Updating extension rating", { extensionId });

  const summary = await getRatingSummary(extensionId);

  // Update the extension's rating fields
  await db.marketplaceExtension.update({
    where: { id: extensionId },
    data: {
      rating: summary.average,
      ratingCount: summary.count,
    },
  });

  logger.info("Extension rating updated", { extensionId, summary });
}

export async function moderateReview(
  reviewId: string,
  status: "approved" | "rejected",
  moderatorId: string,
): Promise<void> {
  logger.info("Moderating review", { reviewId, status, moderatorId });

  // Note: Current schema doesn't have status or moderatedAt fields
  // This would require a schema migration
  logger.warn("Review moderation feature requires schema migration - not yet implemented", {
    reviewId,
    status,
    moderatorId,
  });

  // Verify review exists
  const review = await db.extensionReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new Error("Review not found");
  }

  // TODO: Add status and moderatedAt fields to schema and implement moderation
  throw new Error("Review moderation feature requires schema migration");
}

export async function getUserReview(
  extensionId: string,
  userId: string,
): Promise<Review | null> {
  logger.info("Getting user review", { extensionId, userId });

  const review = await db.extensionReview.findUnique({
    where: {
      extensionId_userId: {
        extensionId,
        userId,
      },
    },
  });

  if (!review) {
    return null;
  }

  // Get user name separately since there's no relation
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });

  return mapReviewToDto({
    ...review,
    organizationId: "",
    user: user || undefined,
  });
}

export async function updateReview(
  reviewId: string,
  userId: string,
  data: { rating?: number; title?: string; body?: string },
): Promise<Review> {
  logger.info("Updating review", { reviewId, userId });

  // Validate rating if provided
  if (data.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Verify review exists and belongs to user
  const existingReview = await db.extensionReview.findUnique({
    where: { id: reviewId },
  });

  if (!existingReview) {
    throw new Error("Review not found");
  }

  if (existingReview.userId !== userId) {
    throw new Error("Unauthorized: You can only update your own reviews");
  }

  // Build update data
  const updateData: any = {};
  if (data.rating !== undefined) updateData.rating = data.rating;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.body !== undefined) updateData.content = data.body;

  const review = await db.extensionReview.update({
    where: { id: reviewId },
    data: updateData,
  });

  // Update extension rating if rating changed
  if (data.rating !== undefined) {
    await updateExtensionRating(review.extensionId);
  }

  // Get user name separately
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });

  return mapReviewToDto({
    ...review,
    organizationId: "",
    user: user || undefined,
  });
}

export async function deleteReview(
  reviewId: string,
  userId: string,
): Promise<void> {
  logger.info("Deleting review", { reviewId, userId });

  // Verify review exists and belongs to user
  const review = await db.extensionReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new Error("Review not found");
  }

  if (review.userId !== userId) {
    throw new Error("Unauthorized: You can only delete your own reviews");
  }

  const extensionId = review.extensionId;

  // Delete review (cascades to helpfulVotes)
  await db.extensionReview.delete({
    where: { id: reviewId },
  });

  // Update extension rating
  await updateExtensionRating(extensionId);

  logger.info("Review deleted successfully");
}
