/**
 * IdentityLinker - Link/unlink operations with audit trail
 *
 * CRITICAL FIX: When linking, only the matched suggestion is marked 'accepted',
 * other pending suggestions are marked 'superseded'.
 *
 * MIGRATION FEATURE: During the transition from SlackUser to ExternalIdentity,
 * the ENABLE_IDENTITY_DUAL_WRITE environment variable allows writing to both
 * tables simultaneously for backward compatibility. Set to 'true' during migration
 * period, then remove after all systems have transitioned to ExternalIdentity.
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type {
  LinkOperationInput,
  UnlinkOperationInput,
  SuggestionDecision,
  LinkMethod,
} from "./types";

/**
 * Dual-write feature flag for backward compatibility during migration
 * Set via environment variable: ENABLE_IDENTITY_DUAL_WRITE=true|false
 * Default: true (enabled) to ensure data consistency during transition period
 */
const ENABLE_IDENTITY_DUAL_WRITE = process.env.ENABLE_IDENTITY_DUAL_WRITE === 'true';

export class IdentityLinker {
  /**
   * Link an external identity to a user
   */
  async linkIdentity(input: LinkOperationInput): Promise<void> {
    const { externalIdentityId, userId, method, performedBy, reason, ipAddress, userAgent } = input;

    logger.info("Linking identity", { externalIdentityId, userId, method });

    await db.$transaction(async (tx) => {
      // Get current state for audit
      const current = await tx.externalIdentity.findUnique({
        where: { id: externalIdentityId },
      });

      if (!current) {
        throw new Error(`External identity not found: ${externalIdentityId}`);
      }

      // Update external identity
      await tx.externalIdentity.update({
        where: { id: externalIdentityId },
        data: {
          userId,
          linkStatus: "linked",
          linkMethod: method,
          linkConfidence: this.getConfidenceForMethod(method),
          linkedAt: new Date(),
          linkedBy: performedBy,
        },
      });

      // Create audit log
      await tx.identityLinkAudit.create({
        data: {
          organizationId: current.organizationId,
          externalIdentityId,
          action: "linked",
          userId,
          previousUserId: current.userId,
          linkMethod: method,
          confidenceScore: this.getConfidenceForMethod(method),
          performedBy,
          reason,
          ipAddress,
          userAgent,
        },
      });

      // CRITICAL FIX: Handle suggestion status correctly
      // Mark the MATCHED suggestion as 'accepted'
      await tx.identityLinkSuggestion.updateMany({
        where: {
          externalIdentityId,
          suggestedUserId: userId,
          status: "pending",
        },
        data: {
          status: "accepted",
          reviewedBy: performedBy,
          reviewedAt: new Date(),
        },
      });

      // Mark OTHER pending suggestions as 'superseded' (not accepted!)
      await tx.identityLinkSuggestion.updateMany({
        where: {
          externalIdentityId,
          status: "pending",
          suggestedUserId: { not: userId },
        },
        data: {
          status: "superseded",
          reviewedBy: performedBy,
          reviewedAt: new Date(),
          rejectionReason: "Identity linked to different user",
        },
      });

      // MIGRATION FEATURE: Dual-write to slack_users for backward compatibility
      // This ensures legacy systems can still access the identity information
      // during the transition period from SlackUser to ExternalIdentity
      if (ENABLE_IDENTITY_DUAL_WRITE && current.provider === "slack") {
        try {
          // Extract slack IDs from metadata
          const slackUserId = current.providerUserId;
          const slackTeamId = current.providerTeamId;

          if (slackUserId && slackTeamId) {
            await tx.slackUser.upsert({
              where: { slackUserId },
              create: {
                slackUserId,
                slackTeamId,
                userId,
                organizationId: current.organizationId,
                displayName: current.displayName || "",
                realName: current.realName || "",
                email: current.email,
                avatarUrl: current.avatarUrl,
                isBot: (current.metadata as any)?.isBot ?? false,
                isAdmin: (current.metadata as any)?.isAdmin ?? false,
              },
              update: {
                userId,
                displayName: current.displayName || "",
                realName: current.realName || "",
                email: current.email,
                avatarUrl: current.avatarUrl,
                isBot: (current.metadata as any)?.isBot ?? false,
                isAdmin: (current.metadata as any)?.isAdmin ?? false,
              },
            });

            logger.info("Dual-write to slack_users completed", {
              slackUserId,
              userId,
              externalIdentityId,
            });
          }
        } catch (dualWriteError) {
          // Log but don't fail the main operation - backward compatibility should not break primary flow
          logger.warn("Dual-write to slack_users failed (non-fatal)", {
            externalIdentityId,
            userId,
            error: dualWriteError instanceof Error ? dualWriteError.message : String(dualWriteError),
          });
        }
      }
    });

    logger.info("Identity linked successfully", { externalIdentityId, userId });
  }

  /**
   * Unlink an external identity from a user
   */
  async unlinkIdentity(input: UnlinkOperationInput): Promise<void> {
    const { externalIdentityId, performedBy, reason, ipAddress, userAgent } = input;

    logger.info("Unlinking identity", { externalIdentityId });

    await db.$transaction(async (tx) => {
      const current = await tx.externalIdentity.findUnique({
        where: { id: externalIdentityId },
      });

      if (!current) {
        throw new Error(`External identity not found: ${externalIdentityId}`);
      }

      if (!current.userId) {
        throw new Error("Identity is not linked");
      }

      const previousUserId = current.userId;

      // Update external identity
      await tx.externalIdentity.update({
        where: { id: externalIdentityId },
        data: {
          userId: null,
          linkStatus: "unlinked",
          linkMethod: null,
          linkConfidence: null,
          linkedAt: null,
          linkedBy: null,
        },
      });

      // Create audit log
      await tx.identityLinkAudit.create({
        data: {
          organizationId: current.organizationId,
          externalIdentityId,
          action: "unlinked",
          userId: null,
          previousUserId,
          performedBy,
          reason,
          ipAddress,
          userAgent,
        },
      });

      // MIGRATION FEATURE: Dual-write to slack_users for backward compatibility
      // Clear the user link in legacy table during unlink operation
      if (ENABLE_IDENTITY_DUAL_WRITE && current.provider === "slack") {
        try {
          const slackUserId = current.providerUserId;

          if (slackUserId) {
            // Check if slack user exists before attempting to update
            const slackUserExists = await tx.slackUser.findUnique({
              where: { slackUserId },
            });

            if (slackUserExists) {
              await tx.slackUser.update({
                where: { slackUserId },
                data: { userId: undefined }, // Use undefined to clear the field
              });

              logger.info("Dual-write unlink to slack_users completed", {
                slackUserId,
                externalIdentityId,
              });
            }
          }
        } catch (dualWriteError) {
          // Log but don't fail the main operation
          logger.warn("Dual-write unlink to slack_users failed (non-fatal)", {
            externalIdentityId,
            error: dualWriteError instanceof Error ? dualWriteError.message : String(dualWriteError),
          });
        }
      }
    });

    logger.info("Identity unlinked successfully", { externalIdentityId });
  }

  /**
   * Process a suggestion decision (accept/reject)
   */
  async processSuggestionDecision(decision: SuggestionDecision): Promise<void> {
    const { suggestionId, accepted, reviewedBy, reason } = decision;

    logger.info("Processing suggestion decision", { suggestionId, accepted });

    const suggestion = await db.identityLinkSuggestion.findUnique({
      where: { id: suggestionId },
      include: { externalIdentity: true },
    });

    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion already processed: ${suggestion.status}`);
    }

    if (accepted) {
      // Link the identity (this will handle suggestion status updates)
      await this.linkIdentity({
        externalIdentityId: suggestion.externalIdentityId,
        userId: suggestion.suggestedUserId,
        method: "manual",
        performedBy: reviewedBy,
        reason: reason ?? "Accepted suggestion",
      });
    } else {
      // Reject the suggestion
      await db.$transaction(async (tx) => {
        await tx.identityLinkSuggestion.update({
          where: { id: suggestionId },
          data: {
            status: "rejected",
            reviewedBy,
            reviewedAt: new Date(),
            rejectionReason: reason,
          },
        });

        await tx.identityLinkAudit.create({
          data: {
            organizationId: suggestion.organizationId,
            externalIdentityId: suggestion.externalIdentityId,
            action: "rejected",
            userId: suggestion.suggestedUserId,
            performedBy: reviewedBy,
            reason,
          },
        });
      });
    }

    logger.info("Suggestion decision processed", { suggestionId, accepted });
  }

  /**
   * Manually re-link identity to a different user (admin override)
   */
  async relinkIdentity(
    externalIdentityId: string,
    newUserId: string,
    performedBy: string,
    reason: string,
  ): Promise<void> {
    const current = await db.externalIdentity.findUnique({
      where: { id: externalIdentityId },
    });

    if (!current) {
      throw new Error(`External identity not found: ${externalIdentityId}`);
    }

    // Unlink first if already linked
    if (current.userId) {
      await this.unlinkIdentity({
        externalIdentityId,
        performedBy,
        reason: `Re-linking to different user: ${reason}`,
      });
    }

    // Link to new user
    await this.linkIdentity({
      externalIdentityId,
      userId: newUserId,
      method: "admin",
      performedBy,
      reason,
    });
  }

  /**
   * Get confidence score based on link method
   */
  private getConfidenceForMethod(method: LinkMethod): number {
    switch (method) {
      case "auto_email":
        return 0.98;
      case "auto_fuzzy":
        return 0.9;
      case "manual":
        return 1.0;
      case "admin":
        return 1.0;
      case "migration":
        return 0.95;
      default:
        return 0.85;
    }
  }
}

// Singleton export
export const identityLinker = new IdentityLinker();
