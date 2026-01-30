import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSOConfig {
  providerId: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  attributeMapping: Record<string, string>;
}

export interface SSOUserProfile {
  externalId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  rawAttributes: Record<string, unknown>;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

// ---------------------------------------------------------------------------
// PKCE Helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  const randomBytes = crypto.randomBytes(32);
  return base64UrlEncode(randomBytes);
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// OAuthSSOProvider
// ---------------------------------------------------------------------------

export class OAuthSSOProvider {
  private config: SSOConfig;

  constructor(config: SSOConfig) {
    this.config = config;
  }

  /**
   * Initiate an OAuth 2.0 login flow with PKCE.
   *
   * Generates a cryptographic `state` parameter, a PKCE code verifier /
   * challenge pair, and stores the verifier in Redis with a 10-minute TTL.
   *
   * @returns The fully-formed authorize URL and the state token.
   */
  async initiateLogin(
    organizationId: string,
    redirectUri: string,
  ): Promise<{ authorizeUrl: string; state: string }> {
    const state = crypto.randomBytes(32).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const statePayload = JSON.stringify({
      codeVerifier,
      organizationId,
      providerId: this.config.providerId,
    });

    const TTL_SECONDS = 600; // 10 minutes
    await redis.set(`sso:state:${state}`, statePayload, TTL_SECONDS);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `${this.config.authorizeUrl}?${params.toString()}`;

    logger.info("SSO login initiated", {
      providerId: this.config.providerId,
      organizationId,
    });

    return { authorizeUrl, state };
  }

  /**
   * Handle the OAuth callback after the user authorises.
   *
   * Validates the `state` parameter against Redis, exchanges the
   * authorisation code (with PKCE verifier) for tokens, then fetches the
   * user profile from the identity provider.
   */
  async handleCallback(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<SSOUserProfile> {
    // Retrieve and validate state
    const statePayload = await redis.get(`sso:state:${state}`);
    if (!statePayload) {
      throw new Error("Invalid or expired SSO state");
    }

    // Clean up the state immediately to prevent replay
    await redis.del(`sso:state:${state}`);

    const { codeVerifier } = JSON.parse(statePayload) as {
      codeVerifier: string;
      organizationId: string;
      providerId: string;
    };

    // Exchange authorisation code for tokens
    const tokenResponse = await this.exchangeCode(code, redirectUri, codeVerifier);

    // Fetch user profile from the identity provider
    const rawProfile = await this.fetchUserInfo(tokenResponse.access_token);

    const userProfile = this.mapAttributes(rawProfile);

    logger.info("SSO callback handled successfully", {
      providerId: this.config.providerId,
      externalId: userProfile.externalId,
      email: userProfile.email,
    });

    return userProfile;
  }

  /**
   * Refresh an access token using a refresh token grant.
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("SSO token refresh failed", {
        providerId: this.config.providerId,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const tokens = (await response.json()) as TokenResponse;

    logger.debug("SSO token refreshed", {
      providerId: this.config.providerId,
    });

    return tokens;
  }

  /**
   * Map raw identity-provider attributes to the standard SSOUserProfile
   * shape using the configured attribute mapping.
   *
   * The `attributeMapping` in `SSOConfig` maps standard field names to the
   * provider-specific JSON paths (dot-notation supported).
   */
  mapAttributes(rawProfile: Record<string, unknown>): SSOUserProfile {
    const resolve = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split(".").reduce<unknown>((current, segment) => {
        if (current !== null && current !== undefined && typeof current === "object") {
          return (current as Record<string, unknown>)[segment];
        }
        return undefined;
      }, obj);
    };

    const mapping = this.config.attributeMapping;

    const externalId = mapping["externalId"]
      ? String(resolve(rawProfile, mapping["externalId"]) ?? "")
      : String(rawProfile["sub"] ?? rawProfile["id"] ?? "");

    const email = mapping["email"]
      ? String(resolve(rawProfile, mapping["email"]) ?? "")
      : String(rawProfile["email"] ?? "");

    const displayNameRaw = mapping["displayName"]
      ? resolve(rawProfile, mapping["displayName"])
      : rawProfile["name"];

    const avatarUrlRaw = mapping["avatarUrl"]
      ? resolve(rawProfile, mapping["avatarUrl"])
      : rawProfile["picture"] ?? rawProfile["avatar_url"];

    if (!externalId) {
      throw new Error("SSO attribute mapping: externalId resolved to empty value");
    }

    if (!email) {
      throw new Error("SSO attribute mapping: email resolved to empty value");
    }

    return {
      externalId,
      email,
      displayName: displayNameRaw ? String(displayNameRaw) : undefined,
      avatarUrl: avatarUrlRaw ? String(avatarUrlRaw) : undefined,
      rawAttributes: rawProfile,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: codeVerifier,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("SSO token exchange failed", {
        providerId: this.config.providerId,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return (await response.json()) as TokenResponse;
  }

  private async fetchUserInfo(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(this.config.userInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("SSO user info fetch failed", {
        providerId: this.config.providerId,
        status: response.status,
        error: errorText,
      });
      throw new Error(`User info fetch failed: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// SSOProviderRegistry
// ---------------------------------------------------------------------------

export class SSOProviderRegistry {
  private providers: Map<string, OAuthSSOProvider> = new Map();
  private configs: Map<string, SSOConfig> = new Map();

  /**
   * Register (or replace) an SSO provider configuration for an organisation.
   */
  registerProvider(orgId: string, config: SSOConfig): void {
    const provider = new OAuthSSOProvider(config);
    this.providers.set(orgId, provider);
    this.configs.set(orgId, config);

    logger.info("SSO provider registered", {
      orgId,
      providerId: config.providerId,
      displayName: config.displayName,
    });
  }

  /**
   * Retrieve the SSO provider for a given organisation.
   * Returns `undefined` if no provider is configured.
   */
  getProvider(orgId: string): OAuthSSOProvider | undefined {
    return this.providers.get(orgId);
  }

  /**
   * Remove the SSO provider configuration for an organisation.
   */
  removeProvider(orgId: string): boolean {
    const existed = this.providers.delete(orgId);
    this.configs.delete(orgId);

    if (existed) {
      logger.info("SSO provider removed", { orgId });
    }

    return existed;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const ssoProviderRegistry = new SSOProviderRegistry();
