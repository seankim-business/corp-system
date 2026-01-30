/**
 * Identity Linking System Types
 *
 * Type definitions for cross-platform user identity linking.
 */

// =============================================================================
// ENUMS
// =============================================================================

export type IdentityProvider = "slack" | "google" | "notion";

export type LinkStatus = "unlinked" | "linked" | "suggested";

export type LinkMethod = "auto_email" | "auto_fuzzy" | "manual" | "admin" | "migration";

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "expired" | "superseded";

export type AuditAction = "linked" | "unlinked" | "rejected" | "suggestion_created" | "superseded";

export type MatchMethod = "exact" | "normalized" | "jaro_winkler" | "token" | "domain";

// =============================================================================
// PROFILE & MATCHING INTERFACES
// =============================================================================

/**
 * External identity profile data from a provider
 */
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

/**
 * Result of a fuzzy name match
 */
export interface MatchResult {
  score: number;
  method: MatchMethod;
  confidence: number;
  details?: Record<string, unknown>;
}

/**
 * A potential user match for linking
 */
export interface LinkCandidate {
  userId: string;
  email: string;
  displayName?: string;
  matchResult: MatchResult;
}

// =============================================================================
// RESOLUTION INTERFACES
// =============================================================================

/**
 * Result of identity resolution attempt
 */
export interface ResolutionResult {
  action: "auto_linked" | "suggested" | "no_match" | "already_linked";
  externalIdentityId: string;
  linkedUserId?: string;
  suggestions?: LinkCandidate[];
  confidence?: number;
  method?: LinkMethod;
}

/**
 * Options for identity resolution
 */
export interface IdentityResolutionOptions {
  organizationId: string;
  autoLinkThreshold?: number; // Default: 0.95
  suggestionThreshold?: number; // Default: 0.85
  skipAutoLink?: boolean;
  performedBy: string; // User ID performing the operation
}

// =============================================================================
// LINK OPERATION INTERFACES
// =============================================================================

/**
 * Input for linking an identity to a user
 */
export interface LinkOperationInput {
  externalIdentityId: string;
  userId: string;
  method: LinkMethod;
  performedBy: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Input for unlinking an identity
 */
export interface UnlinkOperationInput {
  externalIdentityId: string;
  performedBy: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Decision on a link suggestion
 */
export interface SuggestionDecision {
  suggestionId: string;
  accepted: boolean;
  reviewedBy: string;
  reason?: string;
}

// =============================================================================
// SETTINGS INTERFACE
// =============================================================================

/**
 * Organization identity settings
 */
export interface IdentitySettingsConfig {
  autoLinkOnEmail: boolean;
  autoLinkThreshold: number;
  suggestionThreshold: number;
  providerPriority: IdentityProvider[];
  allowUserSelfLink: boolean;
  allowUserSelfUnlink: boolean;
  requireAdminApproval: boolean;
  suggestionExpiryDays: number;
  auditRetentionDays: number;
}

/**
 * Default settings values
 */
export const DEFAULT_IDENTITY_SETTINGS: IdentitySettingsConfig = {
  autoLinkOnEmail: true,
  autoLinkThreshold: 0.95,
  suggestionThreshold: 0.85,
  providerPriority: ["google", "slack", "notion"],
  allowUserSelfLink: true,
  allowUserSelfUnlink: true,
  requireAdminApproval: false,
  suggestionExpiryDays: 30,
  auditRetentionDays: 2555, // ~7 years
};

// =============================================================================
// PROVIDER ADAPTER INTERFACE
// =============================================================================

/**
 * Interface for identity provider adapters
 */
export interface IdentityProviderAdapter {
  provider: IdentityProvider;

  /**
   * Extract profile from provider-specific data
   */
  extractProfile(rawData: unknown): ExternalIdentityProfile;

  /**
   * Fetch user data from provider API (optional)
   */
  fetchUserProfile?(
    organizationId: string,
    providerUserId: string,
  ): Promise<ExternalIdentityProfile | null>;

  /**
   * Get email from provider (optional, some providers need extra API calls)
   */
  resolveEmail?(organizationId: string, providerUserId: string): Promise<string | null>;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * External identity response for API
 */
export interface ExternalIdentityResponse {
  id: string;
  provider: IdentityProvider;
  providerUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  linkStatus: LinkStatus;
  linkMethod?: LinkMethod;
  linkedAt?: string;
  lastSyncedAt?: string;
}

/**
 * Suggestion response for API
 */
export interface SuggestionResponse {
  id: string;
  externalIdentity: ExternalIdentityResponse;
  confidenceScore: number;
  matchMethod: MatchMethod;
  expiresAt: string;
  createdAt: string;
}

/**
 * Identity stats for admin dashboard
 */
export interface IdentityStats {
  total: number;
  linked: number;
  unlinked: number;
  suggested: number;
  byProvider: Record<IdentityProvider, number>;
  pendingSuggestions: number;
}
