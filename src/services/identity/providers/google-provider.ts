/**
 * Google Identity Provider Adapter
 */

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

  /**
   * Check if this is a Google Workspace account
   */
  isWorkspaceAccount(profile: ExternalIdentityProfile): boolean {
    const metadata = profile.metadata as Record<string, unknown> | undefined;
    return !!metadata?.hostedDomain;
  }

  /**
   * Check if email is verified
   */
  isEmailVerified(profile: ExternalIdentityProfile): boolean {
    const metadata = profile.metadata as Record<string, unknown> | undefined;
    return metadata?.emailVerified === true;
  }
}

export const googleProvider = new GoogleProvider();
