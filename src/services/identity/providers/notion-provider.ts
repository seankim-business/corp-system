/**
 * Notion Identity Provider Adapter
 */

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
  bot?: {
    owner: {
      type: "workspace" | "user";
      workspace?: boolean;
      user?: {
        object: "user";
        id: string;
      };
    };
    workspace_name?: string;
  };
}

export class NotionProvider implements IdentityProviderAdapter {
  provider = "notion" as const;

  extractProfile(rawData: unknown): ExternalIdentityProfile {
    const data = rawData as NotionUserData;

    return {
      provider: "notion",
      providerUserId: data.id,
      // Notion doesn't have workspace ID in user object directly
      providerTeamId: data.bot?.workspace_name,
      email: data.person?.email,
      displayName: data.name,
      realName: data.name,
      avatarUrl: data.avatar_url ?? undefined,
      metadata: {
        type: data.type,
        isBot: data.type === "bot",
        botOwnerType: data.bot?.owner?.type,
      },
    };
  }

  /**
   * Check if this is a bot account
   */
  isBot(profile: ExternalIdentityProfile): boolean {
    const metadata = profile.metadata as Record<string, unknown> | undefined;
    return metadata?.isBot === true || metadata?.type === "bot";
  }
}

export const notionProvider = new NotionProvider();
