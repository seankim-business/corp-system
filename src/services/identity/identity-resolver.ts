/**
 * IdentityResolver - Main identity resolution service
 *
 * Resolution flow:
 * 1. Find or create external identity
 * 2. If already linked, return
 * 3. Attempt auto-link by exact email match (98% confidence)
 * 4. Attempt fuzzy name matching
 * 5. Create suggestions for moderate matches
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { FuzzyMatcher, fuzzyMatcher } from "./fuzzy-matcher";
import { IdentityLinker, identityLinker } from "./identity-linker";
import { SuggestionEngine, suggestionEngine } from "./suggestion-engine";
import { DEFAULT_IDENTITY_SETTINGS } from "./types";
import type {
  ExternalIdentityProfile,
  IdentityResolutionOptions,
  ResolutionResult,
  LinkCandidate,
  IdentityProvider,
  IdentitySettingsConfig,
} from "./types";

export class IdentityResolver {
  private matcher: FuzzyMatcher;
  private linker: IdentityLinker;
  private suggestions: SuggestionEngine;
  private userCache: Map<string, { users: any[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly BATCH_SIZE = 100;
  private readonly MAX_USERS_LIMIT = 1000;
  private readonly MIN_HIGH_CONFIDENCE = 0.8; // Early exit threshold
  private readonly TARGET_CANDIDATES = 10; // Stop when we have enough good matches

  constructor(matcher?: FuzzyMatcher, linker?: IdentityLinker, suggestions?: SuggestionEngine) {
    this.matcher = matcher ?? fuzzyMatcher;
    this.linker = linker ?? identityLinker;
    this.suggestions = suggestions ?? suggestionEngine;
  }

  /**
   * Main entry point: resolve or create an external identity
   */
  async resolveIdentity(
    profile: ExternalIdentityProfile,
    options: IdentityResolutionOptions,
  ): Promise<ResolutionResult> {
    const { organizationId, performedBy } = options;

    logger.info("Resolving external identity", {
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      organizationId,
    });

    // Load org settings
    const settings = await this.getOrgSettings(organizationId);
    const autoLinkThreshold = options.autoLinkThreshold ?? settings.autoLinkThreshold;
    const suggestionThreshold = options.suggestionThreshold ?? settings.suggestionThreshold;

    // Step 1: Find or create external identity
    const externalIdentity = await this.findOrCreateIdentity(profile, organizationId);

    // Step 2: If already linked, return early
    if (externalIdentity.userId && externalIdentity.linkStatus === "linked") {
      logger.debug("Identity already linked", {
        externalIdentityId: externalIdentity.id,
        userId: externalIdentity.userId,
      });
      return {
        action: "already_linked",
        externalIdentityId: externalIdentity.id,
        linkedUserId: externalIdentity.userId,
      };
    }

    // Skip auto-linking if bot account
    const isBot = this.isBotAccount(profile);
    if (isBot) {
      logger.debug("Skipping auto-link for bot account", {
        externalIdentityId: externalIdentity.id,
      });
      return {
        action: "no_match",
        externalIdentityId: externalIdentity.id,
      };
    }

    // Step 3: Attempt auto-link by exact email match
    if (profile.email && settings.autoLinkOnEmail && !options.skipAutoLink) {
      const emailMatch = await this.findUserByEmail(organizationId, profile.email);

      if (emailMatch) {
        logger.info("Auto-linking by email match", {
          externalIdentityId: externalIdentity.id,
          userId: emailMatch.id,
          email: profile.email,
        });

        await this.linker.linkIdentity({
          externalIdentityId: externalIdentity.id,
          userId: emailMatch.id,
          method: "auto_email",
          performedBy,
        });

        return {
          action: "auto_linked",
          externalIdentityId: externalIdentity.id,
          linkedUserId: emailMatch.id,
          confidence: 0.98,
          method: "auto_email",
        };
      }
    }

    // Step 4: Attempt fuzzy name matching
    const displayName = profile.displayName ?? profile.realName;
    const candidates = await this.findCandidatesByName(organizationId, displayName, profile.email);

    // Filter by thresholds
    const autoLinkCandidates = candidates.filter(
      (c) => c.matchResult.confidence >= autoLinkThreshold,
    );
    const suggestionCandidates = candidates.filter(
      (c) =>
        c.matchResult.confidence >= suggestionThreshold &&
        c.matchResult.confidence < autoLinkThreshold,
    );

    // Step 5: Auto-link if single high-confidence match
    if (autoLinkCandidates.length === 1 && !options.skipAutoLink) {
      const candidate = autoLinkCandidates[0];

      logger.info("Auto-linking by fuzzy name match", {
        externalIdentityId: externalIdentity.id,
        userId: candidate.userId,
        confidence: candidate.matchResult.confidence,
      });

      await this.linker.linkIdentity({
        externalIdentityId: externalIdentity.id,
        userId: candidate.userId,
        method: "auto_fuzzy",
        performedBy,
      });

      return {
        action: "auto_linked",
        externalIdentityId: externalIdentity.id,
        linkedUserId: candidate.userId,
        confidence: candidate.matchResult.confidence,
        method: "auto_fuzzy",
      };
    }

    // Step 6: Create suggestions for moderate matches
    if (suggestionCandidates.length > 0 || autoLinkCandidates.length > 1) {
      const allSuggestions = [...autoLinkCandidates, ...suggestionCandidates];
      const topSuggestions = allSuggestions.slice(0, 5); // Max 5 suggestions

      await this.suggestions.createSuggestions(externalIdentity.id, organizationId, topSuggestions);

      // Update identity status to 'suggested'
      await db.externalIdentity.update({
        where: { id: externalIdentity.id },
        data: { linkStatus: "suggested" },
      });

      return {
        action: "suggested",
        externalIdentityId: externalIdentity.id,
        suggestions: topSuggestions,
      };
    }

    // Step 7: No matches found
    logger.debug("No matches found for identity", {
      externalIdentityId: externalIdentity.id,
    });

    return {
      action: "no_match",
      externalIdentityId: externalIdentity.id,
    };
  }

  /**
   * Find or create an external identity record
   */
  private async findOrCreateIdentity(profile: ExternalIdentityProfile, organizationId: string) {
    const existing = await db.externalIdentity.findUnique({
      where: {
        organizationId_provider_providerUserId: {
          organizationId,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });

    if (existing) {
      // Update profile data if changed
      return db.externalIdentity.update({
        where: { id: existing.id },
        data: {
          email: profile.email ?? existing.email,
          displayName: profile.displayName ?? existing.displayName,
          realName: profile.realName ?? existing.realName,
          avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
          providerTeamId: profile.providerTeamId ?? existing.providerTeamId,
          metadata: (profile.metadata ?? existing.metadata) as any,
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    }

    return db.externalIdentity.create({
      data: {
        organizationId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        providerTeamId: profile.providerTeamId,
        email: profile.email,
        displayName: profile.displayName,
        realName: profile.realName,
        avatarUrl: profile.avatarUrl,
        metadata: (profile.metadata ?? {}) as any,
        linkStatus: "unlinked",
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Find user by exact email match within organization.
   * If user exists but is not a member, auto-create membership for Slack users.
   */
  private async findUserByEmail(organizationId: string, email: string) {
    // First try to find existing member
    const membership = await db.membership.findFirst({
      where: {
        organizationId,
        user: { email: email.toLowerCase() },
      },
      include: { user: true },
    });

    if (membership?.user) {
      return membership.user;
    }

    // User not a member - check if user exists globally
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      // Auto-create membership for the user (enables Slack access)
      logger.info("Auto-creating membership for Slack user", {
        userId: user.id,
        organizationId,
        email: email.toLowerCase(),
      });

      await db.membership.create({
        data: {
          userId: user.id,
          organizationId,
          role: "member", // Default role for auto-created members
        },
      });

      return user;
    }

    return null;
  }

  /**
   * Find candidate users by fuzzy name matching
   * Optimized for large organizations (1000+ users)
   *
   * Optimizations:
   * - Batch processing (100 users at a time)
   * - Database-level pre-filtering by email domain and name prefix
   * - Early exit when enough high-confidence matches found
   * - Short-term caching (5 min TTL) to avoid repeated queries
   * - Increased limit from 500 to 1000 with smarter filtering
   */
  private async findCandidatesByName(
    organizationId: string,
    name: string | undefined,
    email: string | undefined,
  ): Promise<LinkCandidate[]> {
    const startTime = Date.now();

    if (!name && !email) {
      logger.debug("No name or email provided for fuzzy matching", { organizationId });
      return [];
    }

    // Step 1: Get users from cache or database with pre-filtering
    const users = await this.getUsersForMatching(organizationId, name, email);

    const candidates: LinkCandidate[] = [];
    let processedUsers = 0;
    let highConfidenceCount = 0;

    // Step 2: Process in batches with early exit
    for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
      const batch = users.slice(i, i + this.BATCH_SIZE);

      for (const membership of batch) {
        const user = membership.user;
        processedUsers++;

        // Try email domain matching first (boost for corporate domains)
        if (email && user.email && this.matcher.isSameCorporateDomain(email, user.email)) {
          const nameMatch =
            name && user.displayName
              ? this.matcher.match(name, user.displayName)
              : { score: 0.5, method: "domain" as const, confidence: 0.5 };

          const confidence = Math.min(nameMatch.confidence + 0.1, 1.0);

          candidates.push({
            userId: user.id,
            email: user.email,
            displayName: user.displayName ?? undefined,
            matchResult: {
              ...nameMatch,
              confidence,
              details: { ...nameMatch.details, domainMatch: true },
            },
          });

          if (confidence >= this.MIN_HIGH_CONFIDENCE) {
            highConfidenceCount++;
          }

          continue;
        }

        // Fuzzy name matching
        if (name && user.displayName) {
          const matchResult = this.matcher.match(name, user.displayName);

          if (matchResult.confidence > 0) {
            candidates.push({
              userId: user.id,
              email: user.email,
              displayName: user.displayName,
              matchResult,
            });

            if (matchResult.confidence >= this.MIN_HIGH_CONFIDENCE) {
              highConfidenceCount++;
            }
          }
        }
      }

      // Early exit: Stop if we have enough high-confidence matches
      if (highConfidenceCount >= this.TARGET_CANDIDATES) {
        logger.debug("Early exit - enough high-confidence matches found", {
          organizationId,
          highConfidenceCount,
          processedUsers,
          totalUsers: users.length,
        });
        break;
      }
    }

    // Sort by confidence descending
    const sortedCandidates = candidates.sort(
      (a, b) => b.matchResult.confidence - a.matchResult.confidence,
    );

    // Performance logging
    logger.info("Fuzzy matching completed", {
      organizationId,
      totalUsers: users.length,
      processedUsers,
      candidatesFound: sortedCandidates.length,
      highConfidenceMatches: highConfidenceCount,
      durationMs: Date.now() - startTime,
    });

    return sortedCandidates;
  }

  /**
   * Get users for matching with caching and pre-filtering
   */
  private async getUsersForMatching(
    organizationId: string,
    name: string | undefined,
    email: string | undefined,
  ): Promise<any[]> {
    const cacheKey = organizationId;

    // Check cache first
    const cached = this.userCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      logger.debug("Using cached user list", {
        organizationId,
        cachedUsers: cached.users.length,
        ageMs: Date.now() - cached.timestamp,
      });
      return this.applyPreFiltering(cached.users, name, email);
    }

    // Build database query with pre-filtering
    const whereClause: any = { organizationId };
    const emailDomain = email ? this.extractDomain(email) : null;

    // Pre-filter by email domain if available
    if (emailDomain) {
      whereClause.user = {
        email: { contains: emailDomain },
      };
    }

    // Fetch users from database
    const memberships = await db.membership.findMany({
      where: whereClause,
      include: { user: true },
      take: this.MAX_USERS_LIMIT,
      orderBy: { createdAt: "desc" }, // Recent users first
    });

    // Cache the result
    this.userCache.set(cacheKey, {
      users: memberships,
      timestamp: Date.now(),
    });

    logger.debug("Fetched users from database", {
      organizationId,
      usersFound: memberships.length,
      preFiltered: !!emailDomain,
    });

    return this.applyPreFiltering(memberships, name, email);
  }

  /**
   * Apply client-side pre-filtering for better performance
   */
  private applyPreFiltering(
    memberships: any[],
    name: string | undefined,
    email: string | undefined,
  ): any[] {
    if (!name && !email) return memberships;

    const namePrefix = name ? name.substring(0, 2).toLowerCase() : null;

    return memberships.filter((m) => {
      const user = m.user;

      // Keep if name prefix matches
      if (namePrefix && user.displayName) {
        const userNamePrefix = user.displayName.substring(0, 2).toLowerCase();
        if (userNamePrefix === namePrefix) return true;
      }

      // Keep if email domain matches
      if (email && user.email) {
        const emailDomain = this.extractDomain(email);
        const userEmailDomain = this.extractDomain(user.email);
        if (emailDomain && userEmailDomain && emailDomain === userEmailDomain) return true;
      }

      // Keep users without strong filters (fallback)
      return !namePrefix || !email;
    });
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string | null {
    const match = email.match(/@(.+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Check if profile is a bot account
   */
  private isBotAccount(profile: ExternalIdentityProfile): boolean {
    const metadata = profile.metadata as Record<string, unknown> | undefined;
    return (
      metadata?.isBot === true ||
      metadata?.type === "bot" ||
      metadata?.isRestricted === true ||
      metadata?.isUltraRestricted === true
    );
  }

  /**
   * Get organization identity settings
   */
  private async getOrgSettings(organizationId: string): Promise<IdentitySettingsConfig> {
    const settings = await db.identitySettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      return DEFAULT_IDENTITY_SETTINGS;
    }

    return {
      autoLinkOnEmail: settings.autoLinkOnEmail,
      autoLinkThreshold: settings.autoLinkThreshold,
      suggestionThreshold: settings.suggestionThreshold,
      providerPriority: settings.providerPriority as IdentityProvider[],
      allowUserSelfLink: settings.allowUserSelfLink,
      allowUserSelfUnlink: settings.allowUserSelfUnlink,
      requireAdminApproval: settings.requireAdminApproval,
      suggestionExpiryDays: settings.suggestionExpiryDays,
      auditRetentionDays: settings.auditRetentionDays,
    };
  }

  /**
   * Resolve identity for a specific provider user ID
   */
  async resolveByProviderUserId(
    organizationId: string,
    provider: IdentityProvider,
    providerUserId: string,
  ) {
    return db.externalIdentity.findUnique({
      where: {
        organizationId_provider_providerUserId: {
          organizationId,
          provider,
          providerUserId,
        },
      },
      include: { user: true },
    });
  }

  /**
   * Get all identities for a user
   */
  async getIdentitiesForUser(organizationId: string, userId: string) {
    return db.externalIdentity.findMany({
      where: { organizationId, userId },
      orderBy: { provider: "asc" },
    });
  }

  /**
   * Get unlinked identities for organization
   */
  async getUnlinkedIdentities(organizationId: string, provider?: IdentityProvider) {
    return db.externalIdentity.findMany({
      where: {
        organizationId,
        linkStatus: { in: ["unlinked", "suggested"] },
        ...(provider && { provider }),
      },
      include: {
        suggestions: {
          where: { status: "pending" },
          include: {
            suggestedUser: {
              select: { id: true, email: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get identity stats for organization
   */
  async getStats(organizationId: string) {
    const [total, linked, unlinked, suggested] = await Promise.all([
      db.externalIdentity.count({ where: { organizationId } }),
      db.externalIdentity.count({ where: { organizationId, linkStatus: "linked" } }),
      db.externalIdentity.count({ where: { organizationId, linkStatus: "unlinked" } }),
      db.externalIdentity.count({ where: { organizationId, linkStatus: "suggested" } }),
    ]);

    // Count by provider
    const byProvider = await db.externalIdentity.groupBy({
      by: ["provider"],
      where: { organizationId },
      _count: { provider: true },
    });

    const pendingSuggestions = await db.identityLinkSuggestion.count({
      where: { organizationId, status: "pending" },
    });

    return {
      total,
      linked,
      unlinked,
      suggested,
      byProvider: Object.fromEntries(
        byProvider.map((p) => [p.provider, p._count.provider]),
      ) as Record<IdentityProvider, number>,
      pendingSuggestions,
    };
  }
}

// Singleton export
export const identityResolver = new IdentityResolver();
