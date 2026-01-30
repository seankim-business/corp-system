/**
 * SuggestionEngine - Manage identity link suggestions
 *
 * CRITICAL FIX: performedBy is nullable for system-initiated actions
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type { LinkCandidate } from "./types";

export class SuggestionEngine {
  private readonly DEFAULT_EXPIRY_DAYS = 30;

  /**
   * Create suggestions for an external identity
   */
  async createSuggestions(
    externalIdentityId: string,
    organizationId: string,
    candidates: LinkCandidate[],
  ): Promise<void> {
    if (candidates.length === 0) return;

    logger.info("Creating identity suggestions", {
      externalIdentityId,
      candidateCount: candidates.length,
    });

    // Get org settings for expiry
    const settings = await db.identitySettings.findUnique({
      where: { organizationId },
    });
    const expiryDays = settings?.suggestionExpiryDays ?? this.DEFAULT_EXPIRY_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Create suggestions, skipping duplicates
    for (const candidate of candidates) {
      try {
        await db.identityLinkSuggestion.upsert({
          where: {
            externalIdentityId_suggestedUserId: {
              externalIdentityId,
              suggestedUserId: candidate.userId,
            },
          },
          create: {
            organizationId,
            externalIdentityId,
            suggestedUserId: candidate.userId,
            matchMethod: candidate.matchResult.method,
            confidenceScore: candidate.matchResult.confidence,
            matchDetails: (candidate.matchResult.details ?? {}) as any,
            status: "pending",
            expiresAt,
          },
          update: {
            // Update match details if re-processing
            matchMethod: candidate.matchResult.method,
            confidenceScore: candidate.matchResult.confidence,
            matchDetails: (candidate.matchResult.details ?? {}) as any,
            expiresAt,
            // Don't update status if already processed
          },
        });
      } catch (error) {
        logger.warn("Failed to create suggestion", {
          externalIdentityId,
          userId: candidate.userId,
          error,
        });
      }
    }

    // Create audit log for suggestion creation
    // CRITICAL FIX: performedBy is null for system actions
    await db.identityLinkAudit.create({
      data: {
        organizationId,
        externalIdentityId,
        action: "suggestion_created",
        performedBy: null, // System action - no user
        metadata: {
          candidateCount: candidates.length,
          topConfidence: candidates[0]?.matchResult.confidence,
          topMethod: candidates[0]?.matchResult.method,
        },
      },
    });

    logger.info("Suggestions created", {
      externalIdentityId,
      count: candidates.length,
    });
  }

  /**
   * Get pending suggestions for a user
   */
  async getSuggestionsForUser(organizationId: string, userId: string) {
    return db.identityLinkSuggestion.findMany({
      where: {
        organizationId,
        suggestedUserId: userId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      include: {
        externalIdentity: true,
      },
      orderBy: { confidenceScore: "desc" },
    });
  }

  /**
   * Get all pending suggestions for organization (admin view)
   */
  async getPendingSuggestions(organizationId: string) {
    return db.identityLinkSuggestion.findMany({
      where: {
        organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      include: {
        externalIdentity: true,
        suggestedUser: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Get suggestion by ID
   */
  async getSuggestionById(suggestionId: string) {
    return db.identityLinkSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        externalIdentity: true,
        suggestedUser: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  /**
   * Expire old suggestions (run via cron job)
   */
  async expireSuggestions(): Promise<number> {
    const now = new Date();

    const expired = await db.$transaction(async (tx) => {
      // Find suggestions to expire
      const toExpire = await tx.identityLinkSuggestion.findMany({
        where: {
          status: "pending",
          expiresAt: { lte: now },
        },
        select: {
          id: true,
          organizationId: true,
          externalIdentityId: true,
        },
      });

      if (toExpire.length === 0) return 0;

      // Update status to expired
      await tx.identityLinkSuggestion.updateMany({
        where: {
          status: "pending",
          expiresAt: { lte: now },
        },
        data: {
          status: "expired",
        },
      });

      // Create audit logs for expiry (batch)
      // Note: performedBy is null for system actions
      await tx.identityLinkAudit.createMany({
        data: toExpire.map((s) => ({
          organizationId: s.organizationId,
          externalIdentityId: s.externalIdentityId,
          action: "suggestion_created" as const, // Using existing action type
          performedBy: null, // System action
          metadata: { expired: true, expiredAt: now.toISOString() },
        })),
      });

      return toExpire.length;
    });

    if (expired > 0) {
      logger.info("Expired identity suggestions", { count: expired });
    }

    return expired;
  }

  /**
   * Get suggestion stats for organization
   */
  async getStats(organizationId: string) {
    const [pending, accepted, rejected, expired] = await Promise.all([
      db.identityLinkSuggestion.count({
        where: { organizationId, status: "pending" },
      }),
      db.identityLinkSuggestion.count({
        where: { organizationId, status: "accepted" },
      }),
      db.identityLinkSuggestion.count({
        where: { organizationId, status: "rejected" },
      }),
      db.identityLinkSuggestion.count({
        where: { organizationId, status: "expired" },
      }),
    ]);

    return { pending, accepted, rejected, expired, total: pending + accepted + rejected + expired };
  }

  /**
   * Delete old processed suggestions (cleanup job)
   */
  async cleanupOldSuggestions(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await db.identityLinkSuggestion.deleteMany({
      where: {
        status: { in: ["accepted", "rejected", "expired", "superseded"] },
        updatedAt: { lt: cutoffDate },
      },
    });

    if (deleted.count > 0) {
      logger.info("Cleaned up old suggestions", { count: deleted.count });
    }

    return deleted.count;
  }
}

// Singleton export
export const suggestionEngine = new SuggestionEngine();
