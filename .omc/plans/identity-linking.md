# Work Plan: Multi-Ecosystem User Identity Linking

> **Plan ID**: `identity-linking`
> **Created**: 2026-01-30
> **Status**: Ready for Execution
> **Estimated Duration**: 2-3 weeks (Core: Slack + Google + Notion)

---

## Table of Contents

1. [Context & Requirements](#1-context--requirements)
2. [Database Schema Design](#2-database-schema-design)
3. [Service Architecture](#3-service-architecture)
4. [API Endpoints](#4-api-endpoints)
5. [Frontend Components](#5-frontend-components)
6. [Slack Bot Commands](#6-slack-bot-commands)
7. [Migration Strategy](#7-migration-strategy)
8. [Phased Roadmap](#8-phased-roadmap)
9. [Testing Strategy](#9-testing-strategy)
10. [Success Criteria](#10-success-criteria)

---

## 1. Context & Requirements

### 1.1 Original Request

Build a unified identity linking system that:

- Auto-links user identities across Slack, Google, and Notion
- Suggests matches for unlinked accounts using fuzzy name matching
- Allows manual correction via Admin UI, User Settings, and Slack bot
- Handles username changes gracefully
- Aggregates information from multiple sources
- Respects access control per user/group

### 1.2 User Decisions

| Decision         | Choice                                             |
| ---------------- | -------------------------------------------------- |
| Primary Identity | Email-based matching                               |
| Auto-linking     | Balanced (email match OR name ≥0.95)               |
| UI Scope         | Full management (Admin + Self-service + Slack bot) |
| Migration        | Replace entirely with deprecation period           |
| Provider Scope   | Slack + Google + Notion                            |

### 1.3 Existing Architecture

- **User Model**: `id, email, googleId, displayName, avatarUrl`
- **SlackUser Model**: `slackUserId → userId` with email-based auto-linking
- **Connections**: Org-level (NotionConnection, DriveConnection, etc.)
- **Permission System**: RLS + RBAC (4 roles, 27+ permissions) + Delegation

### 1.4 Definition of Done

- [ ] All existing SlackUser records migrated to ExternalIdentity
- [ ] Auto-linking works for email matches across all 3 providers
- [ ] Fuzzy name matching suggests candidates at ≥0.85 confidence
- [ ] Admin can view/manage all identities in organization
- [ ] Users can manage their own linked identities
- [ ] Slack bot responds to `/identity` commands
- [ ] All tests pass, no TypeScript errors
- [ ] Documentation updated

---

## 2. Database Schema Design

### 2.1 New Prisma Models

**File**: `prisma/schema.prisma`

```prisma
// =============================================================================
// EXTERNAL IDENTITY SYSTEM
// =============================================================================

/// Unified external identity storage for all providers (Slack, Google, Notion, etc.)
/// This model contains row level security and requires additional setup for migrations.
model external_identities {
  id                String    @id @default(uuid()) @db.Uuid
  organization_id   String    @db.Uuid
  user_id           String?   @db.Uuid  // Nullable until linked

  // Provider identification
  provider          String    @db.VarChar(50)  // 'slack', 'google', 'notion'
  provider_user_id  String    @db.VarChar(255) // External ID from provider
  provider_team_id  String?   @db.VarChar(255) // Workspace/team ID (for Slack, Notion)

  // Profile data (synced from provider)
  email             String?   @db.VarChar(255)
  display_name      String?   @db.VarChar(255)
  real_name         String?   @db.VarChar(255)
  avatar_url        String?

  // Provider-specific metadata
  metadata          Json      @default("{}")   // { isBot, isAdmin, locale, etc. }

  // Linking information
  link_status       String    @default("unlinked") @db.VarChar(20)  // 'unlinked', 'linked', 'suggested'
  link_method       String?   @db.VarChar(50)  // 'auto_email', 'auto_fuzzy', 'manual', 'admin'
  link_confidence   Decimal?  @db.Decimal(3, 2) // 0.00 to 1.00
  linked_at         DateTime? @db.Timestamptz(6)
  linked_by         String?   @db.Uuid  // User who created the link

  // Sync tracking
  last_synced_at    DateTime? @db.Timestamptz(6)
  sync_error        String?

  // Audit
  created_at        DateTime  @default(now()) @db.Timestamptz(6)
  updated_at        DateTime  @updatedAt @db.Timestamptz(6)

  // Relations
  organizations     organizations @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  users             users?        @relation(fields: [user_id], references: [id], onDelete: SetNull)
  linked_by_user    users?        @relation("LinkedByUser", fields: [linked_by], references: [id])
  suggestions       identity_link_suggestions[] @relation("SourceIdentity")
  audit_logs        identity_link_audit[]

  // Constraints
  @@unique([organization_id, provider, provider_user_id])
  @@index([organization_id])
  @@index([organization_id, user_id])
  @@index([organization_id, provider])
  @@index([organization_id, link_status])
  @@index([organization_id, email])
  @@index([provider_user_id])
}

/// Suggested identity links awaiting user/admin confirmation
model identity_link_suggestions {
  id                    String    @id @default(uuid()) @db.Uuid
  organization_id       String    @db.Uuid

  // Source (external identity to be linked)
  external_identity_id  String    @db.Uuid

  // Suggested target user
  suggested_user_id     String    @db.Uuid

  // Match details
  match_method          String    @db.VarChar(50)  // 'email', 'fuzzy_name', 'domain'
  confidence_score      Decimal   @db.Decimal(3, 2)
  match_details         Json      @default("{}")   // { algorithm, scores, etc. }

  // Workflow state
  status                String    @default("pending") @db.VarChar(20)  // 'pending', 'accepted', 'rejected', 'expired'
  reviewed_by           String?   @db.Uuid
  reviewed_at           DateTime? @db.Timestamptz(6)
  rejection_reason      String?

  // Expiry
  expires_at            DateTime  @db.Timestamptz(6)
  created_at            DateTime  @default(now()) @db.Timestamptz(6)
  updated_at            DateTime  @updatedAt @db.Timestamptz(6)

  // Relations
  organizations         organizations       @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  external_identity     external_identities @relation("SourceIdentity", fields: [external_identity_id], references: [id], onDelete: Cascade)
  suggested_user        users               @relation("SuggestedUser", fields: [suggested_user_id], references: [id], onDelete: Cascade)
  reviewer              users?              @relation("SuggestionReviewer", fields: [reviewed_by], references: [id])

  // Constraints
  @@unique([external_identity_id, suggested_user_id])
  @@index([organization_id, status])
  @@index([organization_id, suggested_user_id])
  @@index([expires_at])
}

/// Audit trail for all identity linking decisions
model identity_link_audit {
  id                    String    @id @default(uuid()) @db.Uuid
  organization_id       String    @db.Uuid
  external_identity_id  String    @db.Uuid

  // Action details
  action                String    @db.VarChar(20)  // 'linked', 'unlinked', 'rejected', 'suggestion_created'
  user_id               String?   @db.Uuid         // Target user (if applicable)
  previous_user_id      String?   @db.Uuid         // For unlink/re-link

  // Context
  link_method           String?   @db.VarChar(50)
  confidence_score      Decimal?  @db.Decimal(3, 2)
  performed_by          String    @db.Uuid
  reason                String?
  metadata              Json      @default("{}")

  // Audit
  created_at            DateTime  @default(now()) @db.Timestamptz(6)
  ip_address            String?   @db.VarChar(45)
  user_agent            String?

  // Relations
  organizations         organizations       @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  external_identity     external_identities @relation(fields: [external_identity_id], references: [id], onDelete: Cascade)
  performer             users               @relation("AuditPerformer", fields: [performed_by], references: [id])

  @@index([organization_id, created_at(sort: Desc)])
  @@index([external_identity_id])
  @@index([user_id])
}

/// Organization-level identity settings
model identity_settings {
  id                        String    @id @default(uuid()) @db.Uuid
  organization_id           String    @unique @db.Uuid

  // Auto-linking configuration
  auto_link_on_email        Boolean   @default(true)
  auto_link_threshold       Decimal   @default(0.95) @db.Decimal(3, 2)
  suggestion_threshold      Decimal   @default(0.85) @db.Decimal(3, 2)

  // Provider priorities (JSON array of provider names, first = highest priority)
  provider_priority         Json      @default("[\"google\", \"slack\", \"notion\"]")

  // Self-service settings
  allow_user_self_link      Boolean   @default(true)
  allow_user_self_unlink    Boolean   @default(true)
  require_admin_approval    Boolean   @default(false)

  // Retention
  suggestion_expiry_days    Int       @default(30)
  audit_retention_days      Int       @default(2555)  // ~7 years for compliance

  // Timestamps
  created_at                DateTime  @default(now()) @db.Timestamptz(6)
  updated_at                DateTime  @updatedAt @db.Timestamptz(6)

  // Relations
  organizations             organizations @relation(fields: [organization_id], references: [id], onDelete: Cascade)
}
```

### 2.2 User Model Updates

**Add to existing `users` model:**

```prisma
model users {
  // ... existing fields ...

  // New relations for identity linking
  external_identities       external_identities[]
  linked_identities         external_identities[] @relation("LinkedByUser")
  suggested_links           identity_link_suggestions[] @relation("SuggestedUser")
  reviewed_suggestions      identity_link_suggestions[] @relation("SuggestionReviewer")
  identity_audit_performer  identity_link_audit[] @relation("AuditPerformer")
}
```

### 2.3 Organizations Model Updates

**Add to existing `organizations` model:**

```prisma
model organizations {
  // ... existing fields ...

  // New relations
  external_identities       external_identities[]
  identity_suggestions      identity_link_suggestions[]
  identity_audit_logs       identity_link_audit[]
  identity_settings         identity_settings?
}
```

### 2.4 RLS Configuration

**File**: `src/middleware/rls-enforcement.ts`

Add to `ORG_SCOPED_MODELS`:

```typescript
const ORG_SCOPED_MODELS = new Set([
  // ... existing models ...
  "ExternalIdentity",
  "IdentityLinkSuggestion",
  "IdentityLinkAudit",
  "IdentitySettings",
]);
```

### 2.5 Database Indexes (for performance)

Included in schema above. Key indexes:

- `(organization_id, provider, provider_user_id)` - Unique lookup
- `(organization_id, email)` - Email-based resolution
- `(organization_id, link_status)` - Filter unlinked identities
- `(organization_id, user_id)` - Find identities for a user

---

## 3. Service Architecture

### 3.1 Service Overview

```
src/services/identity/
├── index.ts                    # Re-exports
├── types.ts                    # TypeScript interfaces
├── identity-resolver.ts        # Main resolution logic
├── fuzzy-matcher.ts            # Name matching algorithms
├── identity-linker.ts          # Link/unlink operations
├── identity-sync.ts            # Provider sync handlers
├── suggestion-engine.ts        # Generate & manage suggestions
├── migration-service.ts        # SlackUser → ExternalIdentity
└── providers/
    ├── index.ts
    ├── base-provider.ts        # Abstract base class
    ├── slack-provider.ts       # Slack-specific resolution
    ├── google-provider.ts      # Google-specific resolution
    └── notion-provider.ts      # Notion-specific resolution
```

### 3.2 Type Definitions

**File**: `src/services/identity/types.ts`

```typescript
import { Decimal } from "@prisma/client/runtime/library";

// =============================================================================
// ENUMS
// =============================================================================

export type IdentityProvider = "slack" | "google" | "notion";

export type LinkStatus = "unlinked" | "linked" | "suggested";

export type LinkMethod = "auto_email" | "auto_fuzzy" | "manual" | "admin" | "migration";

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "expired";

export type AuditAction =
  | "linked"
  | "unlinked"
  | "rejected"
  | "suggestion_created"
  | "suggestion_expired";

// =============================================================================
// INTERFACES
// =============================================================================

export interface ExternalIdentityProfile {
  provider: IdentityProvider;
  providerUserId: string;
  providerTeamId?: string;
  email?: string;
  displayName?: string;
  realName?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface MatchResult {
  score: number;
  method: "exact" | "normalized" | "jaro_winkler" | "token" | "domain";
  confidence: number;
  details?: Record<string, unknown>;
}

export interface LinkCandidate {
  userId: string;
  email: string;
  displayName?: string;
  matchResult: MatchResult;
}

export interface ResolutionResult {
  action: "auto_linked" | "suggested" | "no_match" | "already_linked";
  externalIdentityId: string;
  linkedUserId?: string;
  suggestions?: LinkCandidate[];
  confidence?: number;
  method?: LinkMethod;
}

export interface IdentityResolutionOptions {
  organizationId: string;
  autoLinkThreshold?: number; // Default: 0.95
  suggestionThreshold?: number; // Default: 0.85
  skipAutoLink?: boolean;
  performedBy: string; // User ID performing the operation
}

export interface LinkOperationInput {
  externalIdentityId: string;
  userId: string;
  method: LinkMethod;
  performedBy: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UnlinkOperationInput {
  externalIdentityId: string;
  performedBy: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SuggestionDecision {
  suggestionId: string;
  accepted: boolean;
  reviewedBy: string;
  reason?: string;
}

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

export interface IdentityProviderAdapter {
  provider: IdentityProvider;

  /**
   * Extract profile from provider-specific data
   */
  extractProfile(rawData: unknown): ExternalIdentityProfile;

  /**
   * Fetch user data from provider API (if needed)
   */
  fetchUserProfile?(
    organizationId: string,
    providerUserId: string,
  ): Promise<ExternalIdentityProfile | null>;

  /**
   * Get email from provider (some providers need extra API calls)
   */
  resolveEmail?(organizationId: string, providerUserId: string): Promise<string | null>;
}
```

### 3.3 Identity Resolver Service

**File**: `src/services/identity/identity-resolver.ts`

```typescript
import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { FuzzyMatcher } from "./fuzzy-matcher";
import { IdentityLinker } from "./identity-linker";
import { SuggestionEngine } from "./suggestion-engine";
import type {
  ExternalIdentityProfile,
  IdentityResolutionOptions,
  ResolutionResult,
  LinkCandidate,
  IdentityProvider,
} from "./types";

export class IdentityResolver {
  private fuzzyMatcher: FuzzyMatcher;
  private linker: IdentityLinker;
  private suggestionEngine: SuggestionEngine;

  constructor() {
    this.fuzzyMatcher = new FuzzyMatcher();
    this.linker = new IdentityLinker();
    this.suggestionEngine = new SuggestionEngine();
  }

  /**
   * Main entry point: resolve or create an external identity
   *
   * 1. Check if identity already exists
   * 2. If linked, return existing link
   * 3. If unlinked, attempt auto-link by email
   * 4. If no email match, attempt fuzzy name matching
   * 5. Create suggestions for close matches
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

    // Load org settings for thresholds
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
    const candidates = await this.findCandidatesByName(
      organizationId,
      profile.displayName ?? profile.realName,
      profile.email,
    );

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

      await this.suggestionEngine.createSuggestions(
        externalIdentity.id,
        organizationId,
        allSuggestions.slice(0, 5), // Max 5 suggestions
      );

      // Update identity status
      await db.externalIdentity.update({
        where: { id: externalIdentity.id },
        data: { linkStatus: "suggested" },
      });

      return {
        action: "suggested",
        externalIdentityId: externalIdentity.id,
        suggestions: allSuggestions.slice(0, 5),
      };
    }

    // Step 7: No matches found
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
          metadata: profile.metadata ?? existing.metadata,
          lastSyncedAt: new Date(),
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
        metadata: profile.metadata ?? {},
        linkStatus: "unlinked",
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Find user by exact email match within organization
   */
  private async findUserByEmail(organizationId: string, email: string) {
    const membership = await db.membership.findFirst({
      where: {
        organizationId,
        user: { email: email.toLowerCase() },
      },
      include: { user: true },
    });
    return membership?.user ?? null;
  }

  /**
   * Find candidate users by fuzzy name matching
   */
  private async findCandidatesByName(
    organizationId: string,
    name: string | undefined,
    email: string | undefined,
  ): Promise<LinkCandidate[]> {
    if (!name && !email) return [];

    // Get all users in organization
    const memberships = await db.membership.findMany({
      where: { organizationId },
      include: { user: true },
    });

    const candidates: LinkCandidate[] = [];

    for (const membership of memberships) {
      const user = membership.user;

      // Try email domain matching first
      if (email && user.email) {
        const emailDomain = email.split("@")[1];
        const userDomain = user.email.split("@")[1];

        if (emailDomain === userDomain && emailDomain !== "gmail.com") {
          // Same corporate domain, boost confidence
          const nameMatch =
            name && user.displayName
              ? this.fuzzyMatcher.match(name, user.displayName)
              : { score: 0.5, method: "domain" as const, confidence: 0.5 };

          candidates.push({
            userId: user.id,
            email: user.email,
            displayName: user.displayName ?? undefined,
            matchResult: {
              ...nameMatch,
              confidence: Math.min(nameMatch.confidence + 0.1, 1.0),
              details: { domainMatch: true },
            },
          });
          continue;
        }
      }

      // Fuzzy name matching
      if (name && user.displayName) {
        const matchResult = this.fuzzyMatcher.match(name, user.displayName);

        if (matchResult.confidence > 0) {
          candidates.push({
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
            matchResult,
          });
        }
      }
    }

    // Sort by confidence descending
    return candidates.sort((a, b) => b.matchResult.confidence - a.matchResult.confidence);
  }

  /**
   * Get organization identity settings
   */
  private async getOrgSettings(organizationId: string) {
    const settings = await db.identitySettings.findUnique({
      where: { organizationId },
    });

    return {
      autoLinkOnEmail: settings?.autoLinkOnEmail ?? true,
      autoLinkThreshold: settings?.autoLinkThreshold?.toNumber() ?? 0.95,
      suggestionThreshold: settings?.suggestionThreshold?.toNumber() ?? 0.85,
      allowUserSelfLink: settings?.allowUserSelfLink ?? true,
      allowUserSelfUnlink: settings?.allowUserSelfUnlink ?? true,
      requireAdminApproval: settings?.requireAdminApproval ?? false,
      suggestionExpiryDays: settings?.suggestionExpiryDays ?? 30,
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
    const identity = await db.externalIdentity.findUnique({
      where: {
        organizationId_provider_providerUserId: {
          organizationId,
          provider,
          providerUserId,
        },
      },
      include: { users: true },
    });

    return identity;
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
          include: { suggestedUser: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const identityResolver = new IdentityResolver();
```

### 3.4 Fuzzy Matcher Service

**File**: `src/services/identity/fuzzy-matcher.ts`

```typescript
import { compareTwoStrings } from "string-similarity";
import { logger } from "../../utils/logger";
import type { MatchResult } from "./types";

/**
 * Multi-stage fuzzy name matching using:
 * 1. Exact match
 * 2. Normalized match (lowercase, trim, remove punctuation)
 * 3. Jaro-Winkler similarity (via string-similarity library)
 * 4. Token-based Jaccard similarity
 */
export class FuzzyMatcher {
  private readonly JARO_WINKLER_THRESHOLD = 0.85;
  private readonly TOKEN_THRESHOLD = 0.8;

  /**
   * Match two names and return confidence score
   */
  match(name1: string, name2: string): MatchResult {
    if (!name1 || !name2) {
      return { score: 0, method: "exact", confidence: 0 };
    }

    // Stage 1: Exact match
    if (name1 === name2) {
      return { score: 1.0, method: "exact", confidence: 1.0 };
    }

    // Stage 2: Normalized match
    const norm1 = this.normalize(name1);
    const norm2 = this.normalize(name2);

    if (norm1 === norm2) {
      return { score: 0.98, method: "normalized", confidence: 0.98 };
    }

    // Stage 3: Jaro-Winkler (Dice coefficient from string-similarity)
    // Note: string-similarity uses Dice coefficient which is similar to Jaro-Winkler
    const jaroScore = compareTwoStrings(norm1, norm2);

    if (jaroScore >= this.JARO_WINKLER_THRESHOLD) {
      return {
        score: jaroScore,
        method: "jaro_winkler",
        confidence: jaroScore,
        details: { rawScore: jaroScore },
      };
    }

    // Stage 4: Token-based matching (handles word order differences)
    const tokenScore = this.tokenMatch(norm1, norm2);

    if (tokenScore >= this.TOKEN_THRESHOLD) {
      return {
        score: tokenScore,
        method: "token",
        confidence: tokenScore * 0.95, // Slightly lower confidence for token matching
        details: { rawScore: tokenScore },
      };
    }

    // No good match
    return {
      score: Math.max(jaroScore, tokenScore),
      method: jaroScore > tokenScore ? "jaro_winkler" : "token",
      confidence: 0,
    };
  }

  /**
   * Normalize a name for comparison
   */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " "); // Normalize whitespace
  }

  /**
   * Token-based Jaccard similarity
   * Handles "John Smith" vs "Smith, John"
   */
  private tokenMatch(s1: string, s2: string): number {
    const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
    const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Batch match a name against multiple candidates
   */
  matchBatch(
    sourceName: string,
    candidates: Array<{ id: string; name: string }>,
  ): Array<{ id: string; matchResult: MatchResult }> {
    return candidates
      .map((candidate) => ({
        id: candidate.id,
        matchResult: this.match(sourceName, candidate.name),
      }))
      .filter((result) => result.matchResult.confidence > 0)
      .sort((a, b) => b.matchResult.confidence - a.matchResult.confidence);
  }
}

export const fuzzyMatcher = new FuzzyMatcher();
```

### 3.5 Identity Linker Service

**File**: `src/services/identity/identity-linker.ts`

```typescript
import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type { LinkOperationInput, UnlinkOperationInput, SuggestionDecision } from "./types";

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

      // Mark any pending suggestions as accepted/rejected
      await tx.identityLinkSuggestion.updateMany({
        where: {
          externalIdentityId,
          status: "pending",
        },
        data: {
          status: "accepted",
          reviewedBy: performedBy,
          reviewedAt: new Date(),
        },
      });
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
      // Link the identity
      await this.linkIdentity({
        externalIdentityId: suggestion.externalIdentityId,
        userId: suggestion.suggestedUserId,
        method: "manual",
        performedBy: reviewedBy,
        reason: reason ?? "Accepted suggestion",
      });

      // Suggestion status updated in linkIdentity transaction
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
   * Manually link identity to a different user (admin override)
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

  private getConfidenceForMethod(method: string): number {
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

export const identityLinker = new IdentityLinker();
```

### 3.6 Suggestion Engine

**File**: `src/services/identity/suggestion-engine.ts`

```typescript
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
            matchDetails: candidate.matchResult.details ?? {},
            status: "pending",
            expiresAt,
          },
          update: {
            matchMethod: candidate.matchResult.method,
            confidenceScore: candidate.matchResult.confidence,
            matchDetails: candidate.matchResult.details ?? {},
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
    await db.identityLinkAudit.create({
      data: {
        organizationId,
        externalIdentityId,
        action: "suggestion_created",
        performedBy: "system",
        metadata: {
          candidateCount: candidates.length,
          topConfidence: candidates[0]?.matchResult.confidence,
        },
      },
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
   * Expire old suggestions (run via cron job)
   */
  async expireSuggestions(): Promise<number> {
    const now = new Date();

    const expired = await db.identityLinkSuggestion.updateMany({
      where: {
        status: "pending",
        expiresAt: { lte: now },
      },
      data: {
        status: "expired",
      },
    });

    if (expired.count > 0) {
      logger.info("Expired identity suggestions", { count: expired.count });
    }

    return expired.count;
  }
}

export const suggestionEngine = new SuggestionEngine();
```

### 3.7 Provider Adapters

**File**: `src/services/identity/providers/slack-provider.ts`

```typescript
import type { IdentityProviderAdapter, ExternalIdentityProfile } from "../types";

interface SlackUserData {
  id: string;
  team_id: string;
  name?: string;
  real_name?: string;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
    image_192?: string;
  };
  is_bot?: boolean;
  is_admin?: boolean;
  locale?: string;
}

export class SlackProvider implements IdentityProviderAdapter {
  provider = "slack" as const;

  extractProfile(rawData: unknown): ExternalIdentityProfile {
    const data = rawData as SlackUserData;

    return {
      provider: "slack",
      providerUserId: data.id,
      providerTeamId: data.team_id,
      email: data.profile?.email,
      displayName: data.profile?.display_name || data.name,
      realName: data.profile?.real_name || data.real_name,
      avatarUrl: data.profile?.image_192,
      metadata: {
        isBot: data.is_bot ?? false,
        isAdmin: data.is_admin ?? false,
        locale: data.locale,
      },
    };
  }
}

export const slackProvider = new SlackProvider();
```

**File**: `src/services/identity/providers/google-provider.ts`

```typescript
import type { IdentityProviderAdapter, ExternalIdentityProfile } from "../types";

interface GoogleUserData {
  sub: string; // Google user ID
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string; // Hosted domain (Google Workspace)
  locale?: string;
}

export class GoogleProvider implements IdentityProviderAdapter {
  provider = "google" as const;

  extractProfile(rawData: unknown): ExternalIdentityProfile {
    const data = rawData as GoogleUserData;

    return {
      provider: "google",
      providerUserId: data.sub,
      providerTeamId: data.hd, // Use hosted domain as team ID
      email: data.email,
      displayName: data.name,
      realName: data.name,
      avatarUrl: data.picture,
      metadata: {
        emailVerified: data.email_verified ?? false,
        givenName: data.given_name,
        familyName: data.family_name,
        hostedDomain: data.hd,
        locale: data.locale,
      },
    };
  }
}

export const googleProvider = new GoogleProvider();
```

**File**: `src/services/identity/providers/notion-provider.ts`

```typescript
import type { IdentityProviderAdapter, ExternalIdentityProfile } from "../types";

interface NotionUserData {
  object: "user";
  id: string;
  type: "person" | "bot";
  name?: string;
  avatar_url?: string;
  person?: {
    email?: string;
  };
}

export class NotionProvider implements IdentityProviderAdapter {
  provider = "notion" as const;

  extractProfile(rawData: unknown): ExternalIdentityProfile {
    const data = rawData as NotionUserData;

    return {
      provider: "notion",
      providerUserId: data.id,
      // Notion doesn't have workspace ID in user object
      providerTeamId: undefined,
      email: data.person?.email,
      displayName: data.name,
      realName: data.name,
      avatarUrl: data.avatar_url ?? undefined,
      metadata: {
        type: data.type,
        isBot: data.type === "bot",
      },
    };
  }
}

export const notionProvider = new NotionProvider();
```

**File**: `src/services/identity/providers/index.ts`

```typescript
import { slackProvider } from "./slack-provider";
import { googleProvider } from "./google-provider";
import { notionProvider } from "./notion-provider";
import type { IdentityProviderAdapter, IdentityProvider } from "../types";

const providers: Record<IdentityProvider, IdentityProviderAdapter> = {
  slack: slackProvider,
  google: googleProvider,
  notion: notionProvider,
};

export function getProvider(provider: IdentityProvider): IdentityProviderAdapter {
  const adapter = providers[provider];
  if (!adapter) {
    throw new Error(`Unknown identity provider: ${provider}`);
  }
  return adapter;
}

export { slackProvider, googleProvider, notionProvider };
```

---

## 4. API Endpoints

### 4.1 Routes Overview

**File**: `src/api/identity.ts`

| Method | Path                                     | Description                      | Auth       |
| ------ | ---------------------------------------- | -------------------------------- | ---------- |
| GET    | `/api/identities`                        | List identities for current user | User       |
| GET    | `/api/identities/unlinked`               | List unlinked identities (admin) | Admin      |
| POST   | `/api/identities/:id/link`               | Link identity to user            | User/Admin |
| POST   | `/api/identities/:id/unlink`             | Unlink identity                  | User/Admin |
| GET    | `/api/identities/suggestions`            | Get pending suggestions          | User       |
| POST   | `/api/identities/suggestions/:id/accept` | Accept suggestion                | User       |
| POST   | `/api/identities/suggestions/:id/reject` | Reject suggestion                | User       |
| GET    | `/api/admin/identities`                  | List all identities (admin)      | Admin      |
| GET    | `/api/admin/identities/stats`            | Identity stats (admin)           | Admin      |
| PUT    | `/api/admin/identities/settings`         | Update org settings              | Admin      |
| POST   | `/api/admin/identities/:id/relink`       | Admin override link              | Admin      |

### 4.2 Full API Implementation

```typescript
import { Router, Request, Response } from "express";
import { z } from "zod";
import { identityResolver } from "../services/identity/identity-resolver";
import { identityLinker } from "../services/identity/identity-linker";
import { suggestionEngine } from "../services/identity/suggestion-engine";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import { db } from "../db/client";

const router = Router();

// =============================================================================
// USER ENDPOINTS
// =============================================================================

/**
 * GET /api/identities
 * List all external identities for the current user
 */
router.get("/identities", async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user!;

    const identities = await identityResolver.getIdentitiesForUser(organizationId, userId);

    return res.json({
      identities: identities.map(formatIdentityResponse),
    });
  } catch (error) {
    logger.error("Failed to fetch user identities", { error });
    return res.status(500).json({ error: "Failed to fetch identities" });
  }
});

/**
 * POST /api/identities/:id/link
 * Link an external identity to current user (self-service)
 */
const linkIdentitySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

router.post(
  "/identities/:id/link",
  validate(linkIdentitySchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = req.user!;
      const { id } = req.params;
      const { reason } = req.body;

      // Check org settings
      const settings = await db.identitySettings.findUnique({
        where: { organizationId },
      });

      if (settings && !settings.allowUserSelfLink) {
        return res.status(403).json({ error: "Self-linking is disabled for this organization" });
      }

      // Verify identity belongs to this org and is unlinked
      const identity = await db.externalIdentity.findFirst({
        where: { id, organizationId, linkStatus: { not: "linked" } },
      });

      if (!identity) {
        return res.status(404).json({ error: "Identity not found or already linked" });
      }

      await identityLinker.linkIdentity({
        externalIdentityId: id,
        userId,
        method: "manual",
        performedBy: userId,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.json({ success: true, message: "Identity linked successfully" });
    } catch (error) {
      logger.error("Failed to link identity", { error });
      return res.status(500).json({ error: "Failed to link identity" });
    }
  },
);

/**
 * POST /api/identities/:id/unlink
 * Unlink an external identity from current user
 */
const unlinkIdentitySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

router.post(
  "/identities/:id/unlink",
  validate(unlinkIdentitySchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = req.user!;
      const { id } = req.params;
      const { reason } = req.body;

      // Check org settings
      const settings = await db.identitySettings.findUnique({
        where: { organizationId },
      });

      if (settings && !settings.allowUserSelfUnlink) {
        return res.status(403).json({ error: "Self-unlinking is disabled" });
      }

      // Verify identity belongs to current user
      const identity = await db.externalIdentity.findFirst({
        where: { id, organizationId, userId },
      });

      if (!identity) {
        return res.status(404).json({ error: "Identity not found or not owned by you" });
      }

      await identityLinker.unlinkIdentity({
        externalIdentityId: id,
        performedBy: userId,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.json({ success: true, message: "Identity unlinked successfully" });
    } catch (error) {
      logger.error("Failed to unlink identity", { error });
      return res.status(500).json({ error: "Failed to unlink identity" });
    }
  },
);

/**
 * GET /api/identities/suggestions
 * Get pending suggestions for current user
 */
router.get("/identities/suggestions", async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = req.user!;

    const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);

    return res.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        externalIdentity: formatIdentityResponse(s.externalIdentity),
        confidenceScore: s.confidenceScore,
        matchMethod: s.matchMethod,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch suggestions", { error });
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

/**
 * POST /api/identities/suggestions/:id/accept
 * Accept a suggestion
 */
router.post("/identities/suggestions/:id/accept", async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const { id } = req.params;

    await identityLinker.processSuggestionDecision({
      suggestionId: id,
      accepted: true,
      reviewedBy: userId,
    });

    return res.json({ success: true, message: "Suggestion accepted" });
  } catch (error) {
    logger.error("Failed to accept suggestion", { error });
    return res.status(500).json({ error: "Failed to accept suggestion" });
  }
});

/**
 * POST /api/identities/suggestions/:id/reject
 * Reject a suggestion
 */
const rejectSuggestionSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

router.post(
  "/identities/suggestions/:id/reject",
  validate(rejectSuggestionSchema),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.user!;
      const { id } = req.params;
      const { reason } = req.body;

      await identityLinker.processSuggestionDecision({
        suggestionId: id,
        accepted: false,
        reviewedBy: userId,
        reason,
      });

      return res.json({ success: true, message: "Suggestion rejected" });
    } catch (error) {
      logger.error("Failed to reject suggestion", { error });
      return res.status(500).json({ error: "Failed to reject suggestion" });
    }
  },
);

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/identities
 * List all identities in organization (admin view)
 */
router.get(
  "/admin/identities",
  requirePermission("member:read"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { provider, status, page = "1", limit = "50" } = req.query;

      const where = {
        organizationId,
        ...(provider && { provider: provider as string }),
        ...(status && { linkStatus: status as string }),
      };

      const [identities, total] = await Promise.all([
        db.externalIdentity.findMany({
          where,
          include: {
            users: {
              select: { id: true, email: true, displayName: true, avatarUrl: true },
            },
            suggestions: {
              where: { status: "pending" },
              select: { id: true, confidenceScore: true },
            },
          },
          skip: (parseInt(page as string) - 1) * parseInt(limit as string),
          take: parseInt(limit as string),
          orderBy: { createdAt: "desc" },
        }),
        db.externalIdentity.count({ where }),
      ]);

      return res.json({
        identities: identities.map((i) => ({
          ...formatIdentityResponse(i),
          linkedUser: i.users,
          pendingSuggestions: i.suggestions.length,
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch admin identities", { error });
      return res.status(500).json({ error: "Failed to fetch identities" });
    }
  },
);

/**
 * GET /api/admin/identities/stats
 * Get identity statistics for organization
 */
router.get(
  "/admin/identities/stats",
  requirePermission("settings:read"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const [byStatus, byProvider, recentActivity] = await Promise.all([
        // Count by status
        db.externalIdentity.groupBy({
          by: ["linkStatus"],
          where: { organizationId },
          _count: { id: true },
        }),
        // Count by provider
        db.externalIdentity.groupBy({
          by: ["provider"],
          where: { organizationId },
          _count: { id: true },
        }),
        // Recent linking activity
        db.identityLinkAudit.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            externalIdentity: {
              select: { provider: true, displayName: true },
            },
          },
        }),
      ]);

      return res.json({
        byStatus: Object.fromEntries(byStatus.map((s) => [s.linkStatus, s._count.id])),
        byProvider: Object.fromEntries(byProvider.map((p) => [p.provider, p._count.id])),
        recentActivity: recentActivity.map((a) => ({
          action: a.action,
          provider: a.externalIdentity.provider,
          displayName: a.externalIdentity.displayName,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      logger.error("Failed to fetch identity stats", { error });
      return res.status(500).json({ error: "Failed to fetch stats" });
    }
  },
);

/**
 * GET /api/admin/identities/unlinked
 * Get unlinked identities with suggestions
 */
router.get(
  "/admin/identities/unlinked",
  requirePermission("member:read"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { provider } = req.query;

      const identities = await identityResolver.getUnlinkedIdentities(
        organizationId,
        provider as any,
      );

      return res.json({
        identities: identities.map((i) => ({
          ...formatIdentityResponse(i),
          suggestions: i.suggestions.map((s) => ({
            id: s.id,
            user: s.suggestedUser,
            confidenceScore: s.confidenceScore,
            matchMethod: s.matchMethod,
          })),
        })),
      });
    } catch (error) {
      logger.error("Failed to fetch unlinked identities", { error });
      return res.status(500).json({ error: "Failed to fetch unlinked identities" });
    }
  },
);

/**
 * PUT /api/admin/identities/settings
 * Update organization identity settings
 */
const updateSettingsSchema = z.object({
  body: z.object({
    autoLinkOnEmail: z.boolean().optional(),
    autoLinkThreshold: z.number().min(0).max(1).optional(),
    suggestionThreshold: z.number().min(0).max(1).optional(),
    allowUserSelfLink: z.boolean().optional(),
    allowUserSelfUnlink: z.boolean().optional(),
    requireAdminApproval: z.boolean().optional(),
    suggestionExpiryDays: z.number().min(1).max(365).optional(),
  }),
});

router.put(
  "/admin/identities/settings",
  requirePermission("settings:write"),
  validate(updateSettingsSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const settings = await db.identitySettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...req.body,
        },
        update: req.body,
      });

      return res.json({ settings });
    } catch (error) {
      logger.error("Failed to update identity settings", { error });
      return res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

/**
 * POST /api/admin/identities/:id/relink
 * Admin override: relink identity to different user
 */
const relinkSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    userId: z.string().uuid(),
    reason: z.string().min(1, "Reason is required for admin override"),
  }),
});

router.post(
  "/admin/identities/:id/relink",
  requirePermission("member:write"),
  validate(relinkSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId: adminId } = req.user!;
      const { id } = req.params;
      const { userId, reason } = req.body;

      // Verify identity and target user belong to org
      const [identity, targetUser] = await Promise.all([
        db.externalIdentity.findFirst({ where: { id, organizationId } }),
        db.membership.findFirst({ where: { organizationId, userId } }),
      ]);

      if (!identity) {
        return res.status(404).json({ error: "Identity not found" });
      }
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found in organization" });
      }

      await identityLinker.relinkIdentity(id, userId, adminId, reason);

      return res.json({ success: true, message: "Identity relinked successfully" });
    } catch (error) {
      logger.error("Failed to relink identity", { error });
      return res.status(500).json({ error: "Failed to relink identity" });
    }
  },
);

// =============================================================================
// HELPERS
// =============================================================================

function formatIdentityResponse(identity: any) {
  return {
    id: identity.id,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
    displayName: identity.displayName,
    realName: identity.realName,
    avatarUrl: identity.avatarUrl,
    linkStatus: identity.linkStatus,
    linkMethod: identity.linkMethod,
    linkConfidence: identity.linkConfidence,
    linkedAt: identity.linkedAt,
    lastSyncedAt: identity.lastSyncedAt,
    createdAt: identity.createdAt,
  };
}

export default router;
```

### 4.3 Register Routes

**File**: `src/index.ts` (addition)

```typescript
import identityRoutes from "./api/identity";

// ... existing route registrations ...

app.use("/api", identityRoutes);
```

---

## 5. Frontend Components

### 5.1 Component Structure

```
frontend/src/
├── pages/
│   └── settings/
│       └── identities/
│           ├── IdentitiesPage.tsx         # Main user settings page
│           └── components/
│               ├── LinkedIdentityCard.tsx
│               ├── SuggestionCard.tsx
│               └── LinkIdentityModal.tsx
├── pages/
│   └── admin/
│       └── identities/
│           ├── AdminIdentitiesPage.tsx    # Admin overview
│           └── components/
│               ├── IdentityTable.tsx
│               ├── UnlinkedIdentitiesTab.tsx
│               ├── IdentityStatsCard.tsx
│               └── RelinkModal.tsx
├── hooks/
│   └── useIdentities.ts                   # React Query hooks
└── api/
    └── identity.ts                        # API client functions
```

### 5.2 Key Components

**File**: `frontend/src/pages/settings/identities/IdentitiesPage.tsx`

```tsx
import React from "react";
import { useIdentities, useIdentitySuggestions } from "../../../hooks/useIdentities";
import { LinkedIdentityCard } from "./components/LinkedIdentityCard";
import { SuggestionCard } from "./components/SuggestionCard";
import { Loader2, Link2, AlertCircle } from "lucide-react";

export function IdentitiesPage() {
  const { data: identities, isLoading: loadingIdentities } = useIdentities();
  const { data: suggestions, isLoading: loadingSuggestions } = useIdentitySuggestions();

  if (loadingIdentities || loadingSuggestions) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Connected Identities</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage how your accounts across different services are linked together.
        </p>
      </div>

      {/* Pending Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-medium text-gray-900 mb-4">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Suggested Links
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {suggestions.length}
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}

      {/* Linked Identities */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-medium text-gray-900 mb-4">
          <Link2 className="h-5 w-5 text-gray-400" />
          Linked Identities
        </h2>
        {identities && identities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {identities.map((identity) => (
              <LinkedIdentityCard key={identity.id} identity={identity} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Link2 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No linked identities</h3>
            <p className="mt-1 text-sm text-gray-500">
              Your identities from Slack, Google, and Notion will appear here when linked.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
```

**File**: `frontend/src/pages/settings/identities/components/SuggestionCard.tsx`

```tsx
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { acceptSuggestion, rejectSuggestion } from "../../../../api/identity";
import { Check, X, Loader2 } from "lucide-react";
import { ProviderIcon } from "../../../../components/ProviderIcon";

interface SuggestionCardProps {
  suggestion: {
    id: string;
    externalIdentity: {
      provider: string;
      displayName?: string;
      email?: string;
      avatarUrl?: string;
    };
    confidenceScore: number;
    matchMethod: string;
  };
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => acceptSuggestion(suggestion.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities"] });
      queryClient.invalidateQueries({ queryKey: ["identity-suggestions"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectSuggestion(suggestion.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identity-suggestions"] });
    },
  });

  const identity = suggestion.externalIdentity;
  const confidencePercent = Math.round(suggestion.confidenceScore * 100);

  return (
    <div className="relative bg-white rounded-lg border border-amber-200 shadow-sm p-4">
      {/* Confidence Badge */}
      <div className="absolute top-2 right-2">
        <span
          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
            confidencePercent >= 95 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {confidencePercent}% match
        </span>
      </div>

      {/* Provider & User Info */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {identity.avatarUrl ? (
            <img
              src={identity.avatarUrl}
              alt={identity.displayName}
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <ProviderIcon provider={identity.provider} className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProviderIcon provider={identity.provider} className="h-4 w-4" />
            <span className="text-xs font-medium text-gray-500 uppercase">{identity.provider}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900 truncate">
            {identity.displayName || "Unknown"}
          </p>
          {identity.email && <p className="text-xs text-gray-500 truncate">{identity.email}</p>}
        </div>
      </div>

      {/* Match Method */}
      <p className="mt-3 text-xs text-gray-500">
        Matched by: {formatMatchMethod(suggestion.matchMethod)}
      </p>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending || rejectMutation.isPending}
          className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          {acceptMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Accept
            </>
          )}
        </button>
        <button
          onClick={() => rejectMutation.mutate()}
          disabled={acceptMutation.isPending || rejectMutation.isPending}
          className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {rejectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <X className="h-4 w-4 mr-1" />
              Reject
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function formatMatchMethod(method: string): string {
  switch (method) {
    case "email":
      return "Email address";
    case "jaro_winkler":
    case "fuzzy_name":
      return "Name similarity";
    case "token":
      return "Name tokens";
    case "domain":
      return "Email domain";
    default:
      return method;
  }
}
```

### 5.3 React Query Hooks

**File**: `frontend/src/hooks/useIdentities.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as identityApi from "../api/identity";

export function useIdentities() {
  return useQuery({
    queryKey: ["identities"],
    queryFn: identityApi.getIdentities,
  });
}

export function useIdentitySuggestions() {
  return useQuery({
    queryKey: ["identity-suggestions"],
    queryFn: identityApi.getSuggestions,
  });
}

export function useUnlinkIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      identityApi.unlinkIdentity(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities"] });
    },
  });
}

// Admin hooks
export function useAdminIdentities(filters?: {
  provider?: string;
  status?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: ["admin-identities", filters],
    queryFn: () => identityApi.getAdminIdentities(filters),
  });
}

export function useIdentityStats() {
  return useQuery({
    queryKey: ["identity-stats"],
    queryFn: identityApi.getIdentityStats,
  });
}

export function useUnlinkedIdentities(provider?: string) {
  return useQuery({
    queryKey: ["unlinked-identities", provider],
    queryFn: () => identityApi.getUnlinkedIdentities(provider),
  });
}
```

### 5.4 API Client

**File**: `frontend/src/api/identity.ts`

```typescript
import { apiClient } from "./client";

export interface ExternalIdentity {
  id: string;
  provider: string;
  providerUserId: string;
  email?: string;
  displayName?: string;
  realName?: string;
  avatarUrl?: string;
  linkStatus: string;
  linkMethod?: string;
  linkConfidence?: number;
  linkedAt?: string;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface IdentitySuggestion {
  id: string;
  externalIdentity: ExternalIdentity;
  confidenceScore: number;
  matchMethod: string;
  expiresAt: string;
  createdAt: string;
}

// User endpoints
export async function getIdentities(): Promise<ExternalIdentity[]> {
  const response = await apiClient.get("/identities");
  return response.data.identities;
}

export async function getSuggestions(): Promise<IdentitySuggestion[]> {
  const response = await apiClient.get("/identities/suggestions");
  return response.data.suggestions;
}

export async function linkIdentity(id: string, reason?: string): Promise<void> {
  await apiClient.post(`/identities/${id}/link`, { reason });
}

export async function unlinkIdentity(id: string, reason?: string): Promise<void> {
  await apiClient.post(`/identities/${id}/unlink`, { reason });
}

export async function acceptSuggestion(id: string): Promise<void> {
  await apiClient.post(`/identities/suggestions/${id}/accept`);
}

export async function rejectSuggestion(id: string, reason?: string): Promise<void> {
  await apiClient.post(`/identities/suggestions/${id}/reject`, { reason });
}

// Admin endpoints
export async function getAdminIdentities(filters?: {
  provider?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.provider) params.set("provider", filters.provider);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));

  const response = await apiClient.get(`/admin/identities?${params}`);
  return response.data;
}

export async function getIdentityStats() {
  const response = await apiClient.get("/admin/identities/stats");
  return response.data;
}

export async function getUnlinkedIdentities(provider?: string) {
  const params = provider ? `?provider=${provider}` : "";
  const response = await apiClient.get(`/admin/identities/unlinked${params}`);
  return response.data.identities;
}

export async function updateIdentitySettings(
  settings: Partial<{
    autoLinkOnEmail: boolean;
    autoLinkThreshold: number;
    suggestionThreshold: number;
    allowUserSelfLink: boolean;
    allowUserSelfUnlink: boolean;
    requireAdminApproval: boolean;
    suggestionExpiryDays: number;
  }>,
) {
  const response = await apiClient.put("/admin/identities/settings", settings);
  return response.data.settings;
}

export async function relinkIdentity(id: string, userId: string, reason: string) {
  await apiClient.post(`/admin/identities/${id}/relink`, { userId, reason });
}
```

---

## 6. Slack Bot Commands

### 6.1 Commands Overview

| Command                 | Description              | User Type |
| ----------------------- | ------------------------ | --------- |
| `/identity`             | Show linked identities   | All       |
| `/identity link`        | Show pending suggestions | All       |
| `/identity accept <id>` | Accept a suggestion      | All       |
| `/identity reject <id>` | Reject a suggestion      | All       |
| `/identity status`      | Show identity stats      | Admin     |

### 6.2 Implementation

**File**: `src/api/slack-commands.ts` (additions)

```typescript
import { identityResolver } from "../services/identity/identity-resolver";
import { identityLinker } from "../services/identity/identity-linker";
import { suggestionEngine } from "../services/identity/suggestion-engine";

// Add to existing command router
async function handleIdentityCommand(
  command: string,
  args: string[],
  slackUserId: string,
  organizationId: string,
): Promise<SlackResponse> {
  // Resolve Slack user to internal user
  const externalIdentity = await identityResolver.resolveByProviderUserId(
    organizationId,
    "slack",
    slackUserId,
  );

  if (!externalIdentity?.userId) {
    return {
      response_type: "ephemeral",
      text: "Your Slack identity is not linked to a Nubabel account. Please contact your admin.",
    };
  }

  const userId = externalIdentity.userId;
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case undefined:
    case "list":
      return handleIdentityList(organizationId, userId);

    case "link":
    case "suggestions":
      return handleIdentitySuggestions(organizationId, userId);

    case "accept":
      return handleIdentityAccept(args[1], userId);

    case "reject":
      return handleIdentityReject(args[1], userId, args.slice(2).join(" "));

    case "status":
      return handleIdentityStatus(organizationId);

    default:
      return {
        response_type: "ephemeral",
        text: "Unknown command. Try `/identity`, `/identity link`, `/identity accept <id>`, or `/identity reject <id>`",
      };
  }
}

async function handleIdentityList(organizationId: string, userId: string): Promise<SlackResponse> {
  const identities = await identityResolver.getIdentitiesForUser(organizationId, userId);

  if (identities.length === 0) {
    return {
      response_type: "ephemeral",
      text: "You have no linked identities.",
    };
  }

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Your Linked Identities*",
      },
    },
    { type: "divider" },
    ...identities.map((identity) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${getProviderEmoji(identity.provider)} ${identity.provider.toUpperCase()}*\n${identity.displayName || identity.email || identity.providerUserId}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Unlink" },
        action_id: `identity_unlink_${identity.id}`,
        style: "danger",
        confirm: {
          title: { type: "plain_text", text: "Unlink Identity?" },
          text: {
            type: "plain_text",
            text: `This will unlink your ${identity.provider} identity.`,
          },
          confirm: { type: "plain_text", text: "Unlink" },
          deny: { type: "plain_text", text: "Cancel" },
        },
      },
    })),
  ];

  return { response_type: "ephemeral", blocks };
}

async function handleIdentitySuggestions(
  organizationId: string,
  userId: string,
): Promise<SlackResponse> {
  const suggestions = await suggestionEngine.getSuggestionsForUser(organizationId, userId);

  if (suggestions.length === 0) {
    return {
      response_type: "ephemeral",
      text: "You have no pending identity suggestions.",
    };
  }

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Pending Identity Suggestions* (${suggestions.length})`,
      },
    },
    { type: "divider" },
    ...suggestions.flatMap((s) => [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `${getProviderEmoji(s.externalIdentity.provider)} *${s.externalIdentity.displayName || "Unknown"}*\n` +
            `Provider: ${s.externalIdentity.provider.toUpperCase()}\n` +
            `Email: ${s.externalIdentity.email || "N/A"}\n` +
            `Confidence: ${Math.round(Number(s.confidenceScore) * 100)}%`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Accept" },
            action_id: `identity_accept_${s.id}`,
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject" },
            action_id: `identity_reject_${s.id}`,
          },
        ],
      },
      { type: "divider" },
    ]),
  ];

  return { response_type: "ephemeral", blocks };
}

async function handleIdentityAccept(
  suggestionId: string | undefined,
  userId: string,
): Promise<SlackResponse> {
  if (!suggestionId) {
    return {
      response_type: "ephemeral",
      text: "Please provide a suggestion ID. Use `/identity link` to see pending suggestions.",
    };
  }

  try {
    await identityLinker.processSuggestionDecision({
      suggestionId,
      accepted: true,
      reviewedBy: userId,
    });

    return {
      response_type: "ephemeral",
      text: "Identity linked successfully! :white_check_mark:",
    };
  } catch (error) {
    return {
      response_type: "ephemeral",
      text: `Failed to accept suggestion: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function handleIdentityReject(
  suggestionId: string | undefined,
  userId: string,
  reason?: string,
): Promise<SlackResponse> {
  if (!suggestionId) {
    return {
      response_type: "ephemeral",
      text: "Please provide a suggestion ID. Use `/identity link` to see pending suggestions.",
    };
  }

  try {
    await identityLinker.processSuggestionDecision({
      suggestionId,
      accepted: false,
      reviewedBy: userId,
      reason,
    });

    return {
      response_type: "ephemeral",
      text: "Suggestion rejected. :x:",
    };
  } catch (error) {
    return {
      response_type: "ephemeral",
      text: `Failed to reject suggestion: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function handleIdentityStatus(organizationId: string): Promise<SlackResponse> {
  const [linked, unlinked, suggestions] = await Promise.all([
    db.externalIdentity.count({ where: { organizationId, linkStatus: "linked" } }),
    db.externalIdentity.count({ where: { organizationId, linkStatus: "unlinked" } }),
    db.identityLinkSuggestion.count({ where: { organizationId, status: "pending" } }),
  ]);

  return {
    response_type: "ephemeral",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Identity Status*",
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Linked:* ${linked}` },
          { type: "mrkdwn", text: `*Unlinked:* ${unlinked}` },
          { type: "mrkdwn", text: `*Pending Suggestions:* ${suggestions}` },
        ],
      },
    ],
  };
}

function getProviderEmoji(provider: string): string {
  switch (provider) {
    case "slack":
      return ":slack:";
    case "google":
      return ":google:";
    case "notion":
      return ":notion:";
    default:
      return ":link:";
  }
}
```

### 6.3 Interactive Actions Handler

**File**: `src/api/slack-interactions.ts` (additions)

```typescript
// Add to existing interaction handler
async function handleIdentityInteraction(
  actionId: string,
  userId: string,
  organizationId: string,
): Promise<SlackResponse | void> {
  const [_, action, id] = actionId.split("_"); // e.g., "identity_accept_uuid"

  // Resolve internal user ID from Slack user
  const externalIdentity = await identityResolver.resolveByProviderUserId(
    organizationId,
    "slack",
    userId,
  );

  if (!externalIdentity?.userId) {
    return { text: "Your Slack identity is not linked." };
  }

  const internalUserId = externalIdentity.userId;

  switch (action) {
    case "accept":
      await identityLinker.processSuggestionDecision({
        suggestionId: id,
        accepted: true,
        reviewedBy: internalUserId,
      });
      return { text: "Identity linked successfully! :white_check_mark:" };

    case "reject":
      await identityLinker.processSuggestionDecision({
        suggestionId: id,
        accepted: false,
        reviewedBy: internalUserId,
      });
      return { text: "Suggestion rejected. :x:" };

    case "unlink":
      await identityLinker.unlinkIdentity({
        externalIdentityId: id,
        performedBy: internalUserId,
        reason: "Unlinked via Slack",
      });
      return { text: "Identity unlinked successfully." };
  }
}
```

---

## 7. Migration Strategy

### 7.1 Migration Overview

| Phase   | Duration  | Description                               |
| ------- | --------- | ----------------------------------------- |
| Phase 1 | Day 1-2   | Deploy new schema, run migration script   |
| Phase 2 | Week 1-4  | Backward compatibility layer (dual-write) |
| Phase 3 | Week 5-8  | Deprecation warnings, code migration      |
| Phase 4 | Week 9-12 | Remove SlackUser model, cleanup           |

### 7.2 Migration Script

**File**: `src/scripts/migrate-slack-users.ts`

```typescript
import { db } from "../db/client";
import { logger } from "../utils/logger";

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

/**
 * Migrate SlackUser records to ExternalIdentity
 *
 * Run with: npx ts-node src/scripts/migrate-slack-users.ts
 */
async function migrateSlackUsers(): Promise<MigrationStats> {
  const stats: MigrationStats = { total: 0, migrated: 0, skipped: 0, errors: 0 };

  logger.info("Starting SlackUser → ExternalIdentity migration");

  // Get all SlackUser records
  const slackUsers = await db.slackUser.findMany({
    include: { user: true },
  });

  stats.total = slackUsers.length;
  logger.info(`Found ${stats.total} SlackUser records to migrate`);

  for (const slackUser of slackUsers) {
    try {
      // Check if already migrated
      const existing = await db.externalIdentity.findUnique({
        where: {
          organizationId_provider_providerUserId: {
            organizationId: slackUser.organizationId,
            provider: "slack",
            providerUserId: slackUser.slackUserId,
          },
        },
      });

      if (existing) {
        logger.debug("SlackUser already migrated, skipping", {
          slackUserId: slackUser.slackUserId,
        });
        stats.skipped++;
        continue;
      }

      // Create ExternalIdentity record
      await db.externalIdentity.create({
        data: {
          organizationId: slackUser.organizationId,
          userId: slackUser.userId,
          provider: "slack",
          providerUserId: slackUser.slackUserId,
          providerTeamId: slackUser.slackTeamId,
          email: slackUser.email,
          displayName: slackUser.displayName,
          realName: slackUser.realName,
          avatarUrl: slackUser.avatarUrl,
          metadata: {
            isBot: slackUser.isBot,
            isAdmin: slackUser.isAdmin,
            migratedFrom: "slack_users",
            migratedAt: new Date().toISOString(),
          },
          linkStatus: "linked",
          linkMethod: "migration",
          linkConfidence: 0.95,
          linkedAt: slackUser.createdAt,
          lastSyncedAt: slackUser.lastSyncedAt,
          createdAt: slackUser.createdAt,
        },
      });

      logger.debug("Migrated SlackUser", { slackUserId: slackUser.slackUserId });
      stats.migrated++;
    } catch (error) {
      logger.error("Failed to migrate SlackUser", {
        slackUserId: slackUser.slackUserId,
        error,
      });
      stats.errors++;
    }
  }

  logger.info("Migration complete", stats);
  return stats;
}

/**
 * Migrate existing Google identities from User.googleId
 */
async function migrateGoogleIdentities(): Promise<MigrationStats> {
  const stats: MigrationStats = { total: 0, migrated: 0, skipped: 0, errors: 0 };

  logger.info("Starting User.googleId → ExternalIdentity migration");

  // Get all users with googleId
  const users = await db.user.findMany({
    where: { googleId: { not: null } },
    include: { memberships: true },
  });

  stats.total = users.length;
  logger.info(`Found ${stats.total} users with Google IDs to migrate`);

  for (const user of users) {
    if (!user.googleId) continue;

    // Create identity for each organization the user belongs to
    for (const membership of user.memberships) {
      try {
        const existing = await db.externalIdentity.findUnique({
          where: {
            organizationId_provider_providerUserId: {
              organizationId: membership.organizationId,
              provider: "google",
              providerUserId: user.googleId,
            },
          },
        });

        if (existing) {
          stats.skipped++;
          continue;
        }

        await db.externalIdentity.create({
          data: {
            organizationId: membership.organizationId,
            userId: user.id,
            provider: "google",
            providerUserId: user.googleId,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            metadata: {
              migratedFrom: "users.googleId",
              migratedAt: new Date().toISOString(),
            },
            linkStatus: "linked",
            linkMethod: "migration",
            linkConfidence: 0.98,
            linkedAt: user.createdAt,
            lastSyncedAt: new Date(),
            createdAt: user.createdAt,
          },
        });

        stats.migrated++;
      } catch (error) {
        logger.error("Failed to migrate Google identity", {
          userId: user.id,
          googleId: user.googleId,
          error,
        });
        stats.errors++;
      }
    }
  }

  logger.info("Google migration complete", stats);
  return stats;
}

// Main execution
async function main() {
  console.log("=== Identity Migration Script ===\n");

  const slackStats = await migrateSlackUsers();
  console.log("\nSlack Migration Results:");
  console.log(`  Total:    ${slackStats.total}`);
  console.log(`  Migrated: ${slackStats.migrated}`);
  console.log(`  Skipped:  ${slackStats.skipped}`);
  console.log(`  Errors:   ${slackStats.errors}`);

  const googleStats = await migrateGoogleIdentities();
  console.log("\nGoogle Migration Results:");
  console.log(`  Total:    ${googleStats.total}`);
  console.log(`  Migrated: ${googleStats.migrated}`);
  console.log(`  Skipped:  ${googleStats.skipped}`);
  console.log(`  Errors:   ${googleStats.errors}`);

  console.log("\n=== Migration Complete ===");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

### 7.3 Backward Compatibility Layer

**File**: `src/services/slack-user-provisioner.ts` (updated)

```typescript
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { identityResolver } from "./identity/identity-resolver";
import { getProvider } from "./identity/providers";

// =============================================================================
// BACKWARD COMPATIBILITY LAYER
// During migration period, this file writes to BOTH slack_users AND external_identities
// After migration period, remove slack_users writes entirely
// =============================================================================

const ENABLE_DUAL_WRITE = true; // Set to false after migration period

interface SlackUserProfile {
  email?: string;
  displayName?: string;
  realName?: string;
  avatarUrl?: string;
  isBot?: boolean;
  isAdmin?: boolean;
}

/**
 * Provision a Slack user (UPDATED for migration)
 *
 * - Writes to external_identities (new system)
 * - Also writes to slack_users (backward compatibility)
 */
export async function provisionSlackUser(
  slackUserId: string,
  slackTeamId: string,
  organizationId: string,
  profile: SlackUserProfile,
) {
  logger.info("Provisioning Slack user", { slackUserId, organizationId });

  // PRIMARY: Use new identity resolution system
  const provider = getProvider("slack");
  const identityProfile = provider.extractProfile({
    id: slackUserId,
    team_id: slackTeamId,
    profile: {
      email: profile.email,
      display_name: profile.displayName,
      real_name: profile.realName,
      image_192: profile.avatarUrl,
    },
    is_bot: profile.isBot,
    is_admin: profile.isAdmin,
  });

  const result = await identityResolver.resolveIdentity(identityProfile, {
    organizationId,
    performedBy: "system",
  });

  // Get the created/updated identity
  const externalIdentity = await db.externalIdentity.findUnique({
    where: { id: result.externalIdentityId },
    include: { users: true },
  });

  // BACKWARD COMPAT: Also write to slack_users during migration period
  if (ENABLE_DUAL_WRITE && externalIdentity?.userId) {
    await db.slackUser.upsert({
      where: { slackUserId },
      create: {
        slackUserId,
        slackTeamId,
        userId: externalIdentity.userId,
        organizationId,
        displayName: profile.displayName,
        realName: profile.realName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        isBot: profile.isBot ?? false,
        isAdmin: profile.isAdmin ?? false,
        lastSyncedAt: new Date(),
      },
      update: {
        displayName: profile.displayName,
        realName: profile.realName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        isBot: profile.isBot ?? false,
        isAdmin: profile.isAdmin ?? false,
        lastSyncedAt: new Date(),
      },
    });
  }

  return {
    ...externalIdentity,
    // Map to old format for backward compatibility
    slackUserId,
    slackTeamId,
    user: externalIdentity?.users,
  };
}

/**
 * @deprecated Use identityResolver.resolveByProviderUserId instead
 */
export async function getSlackUser(slackUserId: string) {
  logger.warn("DEPRECATED: getSlackUser called, use identityResolver instead", {
    slackUserId,
  });

  // Try new system first
  const identities = await db.externalIdentity.findMany({
    where: { provider: "slack", providerUserId: slackUserId },
    include: { users: true },
  });

  if (identities.length > 0) {
    const identity = identities[0];
    return {
      id: identity.id,
      slackUserId: identity.providerUserId,
      slackTeamId: identity.providerTeamId,
      userId: identity.userId,
      organizationId: identity.organizationId,
      displayName: identity.displayName,
      realName: identity.realName,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
      isBot: identity.metadata?.isBot ?? false,
      isAdmin: identity.metadata?.isAdmin ?? false,
      lastSyncedAt: identity.lastSyncedAt,
      user: identity.users,
    };
  }

  // Fallback to old table
  return db.slackUser.findUnique({
    where: { slackUserId },
    include: { user: true },
  });
}
```

---

## 8. Phased Roadmap

### Phase 1: Foundation (Week 1)

| Day | Tasks                                | Owner    | Status |
| --- | ------------------------------------ | -------- | ------ |
| 1-2 | Create Prisma schema for new models  | Executor |        |
| 2   | Run migration, verify tables created | Executor |        |
| 2   | Add models to RLS middleware         | Executor |        |
| 3-4 | Implement FuzzyMatcher service       | Executor |        |
| 3-4 | Implement IdentityResolver service   | Executor |        |
| 4-5 | Implement IdentityLinker service     | Executor |        |
| 5   | Implement SuggestionEngine service   | Executor |        |
| 5   | Add `string-similarity` package      | Executor |        |

**Deliverables:**

- [ ] Database schema deployed
- [ ] Core services implemented
- [ ] Unit tests for FuzzyMatcher

### Phase 2: API & Integration (Week 2)

| Day | Tasks                                               | Owner    | Status |
| --- | --------------------------------------------------- | -------- | ------ |
| 1-2 | Implement user API endpoints                        | Executor |        |
| 2-3 | Implement admin API endpoints                       | Executor |        |
| 3   | Update slack-user-provisioner for dual-write        | Executor |        |
| 4   | Integrate with Google OAuth flow                    | Executor |        |
| 4-5 | Run migration script (SlackUser → ExternalIdentity) | Executor |        |
| 5   | Verify backward compatibility                       | QA       |        |

**Deliverables:**

- [ ] All API endpoints working
- [ ] SlackUser records migrated
- [ ] Google identities migrated
- [ ] Integration tests passing

### Phase 3: Frontend & Slack Bot (Week 3)

| Day | Tasks                                   | Owner    | Status |
| --- | --------------------------------------- | -------- | ------ |
| 1-2 | Implement user Settings/Identities page | Designer |        |
| 2-3 | Implement Admin identities page         | Designer |        |
| 3-4 | Implement Slack `/identity` commands    | Executor |        |
| 4   | Implement Slack interactive actions     | Executor |        |
| 5   | E2E testing                             | QA       |        |
| 5   | Documentation updates                   | Writer   |        |

**Deliverables:**

- [ ] User identity management UI
- [ ] Admin identity management UI
- [ ] Slack bot commands working
- [ ] User documentation

### Phase 4: Deprecation Period (Weeks 4-12)

| Week  | Tasks                                       |
| ----- | ------------------------------------------- |
| 4-5   | Monitor dual-write, fix issues              |
| 6     | Add deprecation warnings to SlackUser usage |
| 7-8   | Update all code to use new identity system  |
| 9-10  | Disable dual-write (new system only)        |
| 11-12 | Remove SlackUser model from schema          |

**Deliverables:**

- [ ] All code migrated to new system
- [ ] SlackUser model removed
- [ ] Migration complete

---

## 9. Testing Strategy

### 9.1 Unit Tests

**File**: `src/services/identity/__tests__/fuzzy-matcher.test.ts`

```typescript
import { FuzzyMatcher } from "../fuzzy-matcher";

describe("FuzzyMatcher", () => {
  const matcher = new FuzzyMatcher();

  describe("match", () => {
    it("returns exact match for identical strings", () => {
      const result = matcher.match("John Smith", "John Smith");
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe("exact");
    });

    it("returns normalized match for case differences", () => {
      const result = matcher.match("John Smith", "john smith");
      expect(result.confidence).toBe(0.98);
      expect(result.method).toBe("normalized");
    });

    it("returns high confidence for similar names", () => {
      const result = matcher.match("John Smith", "John Smyth");
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it("returns token match for reordered names", () => {
      const result = matcher.match("John Smith", "Smith John");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("returns low confidence for dissimilar names", () => {
      const result = matcher.match("John Smith", "Alice Johnson");
      expect(result.confidence).toBe(0);
    });
  });
});
```

### 9.2 Integration Tests

**File**: `src/__tests__/integration/identity-resolution.test.ts`

```typescript
import { identityResolver } from "../../services/identity/identity-resolver";
import { db } from "../../db/client";

describe("Identity Resolution", () => {
  beforeEach(async () => {
    // Setup test data
  });

  it("auto-links identity when email matches", async () => {
    const result = await identityResolver.resolveIdentity(
      {
        provider: "slack",
        providerUserId: "U123456",
        email: "test@example.com",
        displayName: "Test User",
      },
      {
        organizationId: testOrg.id,
        performedBy: "system",
      },
    );

    expect(result.action).toBe("auto_linked");
    expect(result.method).toBe("auto_email");
  });

  it("creates suggestions for fuzzy name matches", async () => {
    const result = await identityResolver.resolveIdentity(
      {
        provider: "slack",
        providerUserId: "U123456",
        displayName: "John Smyth", // Similar to existing "John Smith"
      },
      {
        organizationId: testOrg.id,
        performedBy: "system",
      },
    );

    expect(result.action).toBe("suggested");
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });
});
```

### 9.3 E2E Tests

**File**: `src/__tests__/e2e/identity-ui.test.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Identity Management UI", () => {
  test("user can view linked identities", async ({ page }) => {
    await page.goto("/settings/identities");
    await expect(page.getByText("Connected Identities")).toBeVisible();
  });

  test("user can accept suggestion", async ({ page }) => {
    await page.goto("/settings/identities");
    await page.getByRole("button", { name: "Accept" }).first().click();
    await expect(page.getByText("linked successfully")).toBeVisible();
  });

  test("admin can view all identities", async ({ page }) => {
    await page.goto("/admin/identities");
    await expect(page.getByText("Identity Management")).toBeVisible();
  });
});
```

---

## 10. Success Criteria

### 10.1 Functional Criteria

- [ ] Auto-linking by email works for Slack, Google, Notion
- [ ] Fuzzy name matching suggests candidates with ≥85% confidence
- [ ] Users can link/unlink their own identities
- [ ] Users can accept/reject suggestions
- [ ] Admins can view all identities and override links
- [ ] Slack `/identity` command responds correctly
- [ ] All existing SlackUser records migrated

### 10.2 Non-Functional Criteria

- [ ] Identity resolution <100ms p95 latency
- [ ] No data loss during migration
- [ ] RLS properly isolates organization data
- [ ] Audit trail captures all linking decisions
- [ ] Backward compatibility maintained during deprecation

### 10.3 Quality Criteria

- [ ] > 80% test coverage for identity services
- [ ] Zero TypeScript errors
- [ ] All E2E tests passing
- [ ] Documentation complete

---

## Appendix A: Package Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "string-similarity": "^4.0.4"
  },
  "devDependencies": {
    "@types/string-similarity": "^4.0.2"
  }
}
```

---

## Appendix B: Permissions

Add to `src/auth/rbac.ts`:

```typescript
// Identity management permissions
"identity:read",     // View identities
"identity:write",    // Link/unlink own identities
"identity:manage",   // Admin override, view all

// Add to role permissions
OWNER: [...existing, "identity:read", "identity:write", "identity:manage"],
ADMIN: [...existing, "identity:read", "identity:write", "identity:manage"],
MEMBER: [...existing, "identity:read", "identity:write"],
VIEWER: [...existing, "identity:read"],
```

---

## Appendix C: Cron Jobs

Add to cron scheduler:

```typescript
// Expire old suggestions (run daily at 3 AM)
cron.schedule("0 3 * * *", async () => {
  const { suggestionEngine } = await import("./services/identity/suggestion-engine");
  await suggestionEngine.expireSuggestions();
});
```

---

**End of Work Plan**

To begin implementation, run:

```
/oh-my-claudecode:start-work identity-linking
```
