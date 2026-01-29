// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import { Review, PaginatedResult, RatingSummary } from "../types";

// TODO: Will be used when marketplace tables are implemented
export function mapReviewToDto(_review: any): Review {
  // TODO: Implement once extensionReview table is created via Prisma migration
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function createReview(
  extensionId: string,
  userId: string,
  userName: string,
  organizationId: string,
  data: { rating: number; title: string; body: string },
): Promise<Review> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("createReview not implemented - tables not yet created", {
    extensionId,
    userId,
    userName,
    organizationId,
    data,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
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
  const { page = 1, limit = 10 } = options || {};

  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("listReviews returning empty data - tables not yet created", { extensionId, options });

  return {
    items: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  };
}

export async function respondToReview(
  reviewId: string,
  publisherId: string,
  response: string,
): Promise<void> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("respondToReview not implemented - tables not yet created", {
    reviewId,
    publisherId,
    response,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function voteHelpful(
  reviewId: string,
  userId: string,
): Promise<void> {
  // TODO: Implement once reviewHelpfulVote table is created via Prisma migration
  logger.warn("voteHelpful not implemented - tables not yet created", { reviewId, userId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function getRatingSummary(
  extensionId: string,
): Promise<RatingSummary> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("getRatingSummary returning empty data - tables not yet created", { extensionId });

  return {
    average: 0,
    count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}

export async function updateExtensionRating(
  extensionId: string,
): Promise<void> {
  // TODO: Implement once marketplaceExtension table is created via Prisma migration
  logger.warn("updateExtensionRating not implemented - tables not yet created", { extensionId });
  return;
}

export async function moderateReview(
  reviewId: string,
  status: "approved" | "rejected",
  moderatorId: string,
): Promise<void> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("moderateReview not implemented - tables not yet created", { reviewId, status, moderatorId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function getUserReview(
  extensionId: string,
  userId: string,
): Promise<Review | null> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("getUserReview returning null - tables not yet created", { extensionId, userId });
  return null;
}

export async function updateReview(
  reviewId: string,
  userId: string,
  data: { rating?: number; title?: string; body?: string },
): Promise<Review> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("updateReview not implemented - tables not yet created", { reviewId, userId, data });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function deleteReview(
  reviewId: string,
  userId: string,
): Promise<void> {
  // TODO: Implement once extensionReview table is created via Prisma migration
  logger.warn("deleteReview not implemented - tables not yet created", { reviewId, userId });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}
