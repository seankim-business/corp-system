/**
 * Slack Identity Provider Adapter
 */

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
    real_name_normalized?: string;
    image_192?: string;
    image_512?: string;
  };
  is_bot?: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  is_restricted?: boolean; // Guest user
  is_ultra_restricted?: boolean; // Single-channel guest
  locale?: string;
  tz?: string;
  deleted?: boolean;
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
      avatarUrl: data.profile?.image_512 || data.profile?.image_192,
      metadata: {
        isBot: data.is_bot ?? false,
        isAdmin: data.is_admin ?? false,
        isOwner: data.is_owner ?? false,
        isRestricted: data.is_restricted ?? false,
        isUltraRestricted: data.is_ultra_restricted ?? false,
        locale: data.locale,
        timezone: data.tz,
        deleted: data.deleted ?? false,
      },
    };
  }

  /**
   * Check if this is a bot or guest account
   */
  isBotOrGuest(profile: ExternalIdentityProfile): boolean {
    const metadata = profile.metadata as Record<string, unknown> | undefined;
    return (
      metadata?.isBot === true ||
      metadata?.isRestricted === true ||
      metadata?.isUltraRestricted === true
    );
  }
}

export const slackProvider = new SlackProvider();
