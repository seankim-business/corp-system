/**
 * MCP OAuth 2.1 Flow
 *
 * Implements OAuth 2.1 with PKCE (S256) for MCP provider authentication.
 * Tokens are encrypted at rest via the shared encryption utility and
 * stored in Redis with automatic TTL management.
 */

import crypto from "crypto";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { encrypt, decrypt } from "../utils/encryption";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPOAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // unix ms
  tokenType: string;
  scope: string;
}

export interface OAuthState {
  organizationId: string;
  providerId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// PKCE Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random code verifier (43-128 characters)
 * using the base64url alphabet (A-Z, a-z, 0-9, "-", ".", "_", "~").
 */
function generateCodeVerifier(): string {
  // 32 random bytes -> 43 base64url chars (minimum PKCE length)
  const buffer = crypto.randomBytes(32);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Derive a SHA-256 code challenge from a code verifier (base64url encoded).
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest("base64");
  return hash
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Redis Key Helpers
// ---------------------------------------------------------------------------

function stateKey(state: string): string {
  return `mcp:oauth:state:${state}`;
}

function tokensKey(orgId: string, providerId: string): string {
  return `mcp:tokens:${orgId}:${providerId}`;
}

// ---------------------------------------------------------------------------
// Token response shape returned by authorization servers
// ---------------------------------------------------------------------------

interface TokenEndpointResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// ---------------------------------------------------------------------------
// MCPOAuthManager
// ---------------------------------------------------------------------------

class MCPOAuthManager {
  // -------------------------------------------------------------------------
  // 1. Initiate OAuth flow
  // -------------------------------------------------------------------------

  async initOAuthFlow(
    orgId: string,
    providerId: string,
    config: MCPOAuthConfig,
  ): Promise<{ authorizeUrl: string; state: string }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(32).toString("hex");

    const oauthState: OAuthState = {
      organizationId: orgId,
      providerId,
      codeVerifier,
      redirectUri: config.redirectUri,
      createdAt: Date.now(),
    };

    // Store state in Redis with 10-minute TTL (600 seconds)
    await redis.set(stateKey(state), JSON.stringify(oauthState), 600);

    logger.info("MCP OAuth flow initiated", {
      organizationId: orgId,
      providerId,
      state,
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `${config.authorizeUrl}?${params.toString()}`;

    return { authorizeUrl, state };
  }

  // -------------------------------------------------------------------------
  // 2. Handle OAuth callback
  // -------------------------------------------------------------------------

  async handleCallback(
    code: string,
    state: string,
    config: MCPOAuthConfig,
  ): Promise<OAuthTokens> {
    // Retrieve and delete state atomically (get then del)
    const raw = await redis.get(stateKey(state));
    if (!raw) {
      throw new Error("Invalid or expired OAuth state parameter");
    }
    await redis.del(stateKey(state));

    const oauthState: OAuthState = JSON.parse(raw);

    logger.info("MCP OAuth callback received", {
      organizationId: oauthState.organizationId,
      providerId: oauthState.providerId,
    });

    // Exchange authorization code for tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthState.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: oauthState.codeVerifier,
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("MCP OAuth token exchange failed", {
        status: response.status,
        error: errorText,
        organizationId: oauthState.organizationId,
        providerId: oauthState.providerId,
      });
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as TokenEndpointResponse;
    const tokens = this.parseTokenResponse(data, config);

    // Store tokens encrypted in Redis
    await this.storeTokens(
      oauthState.organizationId,
      oauthState.providerId,
      tokens,
    );

    logger.info("MCP OAuth tokens acquired", {
      organizationId: oauthState.organizationId,
      providerId: oauthState.providerId,
      tokenType: tokens.tokenType,
      hasRefreshToken: !!tokens.refreshToken,
    });

    return tokens;
  }

  // -------------------------------------------------------------------------
  // 3. Refresh access token
  // -------------------------------------------------------------------------

  async refreshAccessToken(
    orgId: string,
    providerId: string,
    config: MCPOAuthConfig,
  ): Promise<OAuthTokens> {
    const existing = await this.loadTokens(orgId, providerId);
    if (!existing) {
      throw new Error(`No stored tokens for org ${orgId} provider ${providerId}`);
    }

    if (!existing.refreshToken) {
      throw new Error(
        `No refresh token available for org ${orgId} provider ${providerId}`,
      );
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("MCP OAuth token refresh failed", {
        status: response.status,
        error: errorText,
        organizationId: orgId,
        providerId,
      });
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as TokenEndpointResponse;
    const tokens = this.parseTokenResponse(data, config);

    // Preserve refresh token if the server didn't issue a new one
    if (!tokens.refreshToken && existing.refreshToken) {
      tokens.refreshToken = existing.refreshToken;
    }

    await this.storeTokens(orgId, providerId, tokens);

    logger.info("MCP OAuth tokens refreshed", {
      organizationId: orgId,
      providerId,
    });

    return tokens;
  }

  // -------------------------------------------------------------------------
  // 4. Get a valid access token (auto-refresh if needed)
  // -------------------------------------------------------------------------

  async getValidToken(
    orgId: string,
    providerId: string,
    config: MCPOAuthConfig,
  ): Promise<string> {
    const tokens = await this.loadTokens(orgId, providerId);
    if (!tokens) {
      throw new Error(`No stored tokens for org ${orgId} provider ${providerId}`);
    }

    // Refresh if expired or expiring within 5 minutes
    const fiveMinutesMs = 5 * 60 * 1000;
    if (Date.now() >= tokens.expiresAt - fiveMinutesMs) {
      logger.info("MCP OAuth token expiring soon, refreshing", {
        organizationId: orgId,
        providerId,
        expiresAt: tokens.expiresAt,
      });
      const refreshed = await this.refreshAccessToken(orgId, providerId, config);
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  // -------------------------------------------------------------------------
  // 5. Revoke / delete stored tokens
  // -------------------------------------------------------------------------

  async revokeTokens(orgId: string, providerId: string): Promise<void> {
    await redis.del(tokensKey(orgId, providerId));
    logger.info("MCP OAuth tokens revoked", {
      organizationId: orgId,
      providerId,
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private parseTokenResponse(
    data: TokenEndpointResponse,
    config: MCPOAuthConfig,
  ): OAuthTokens {
    const expiresInMs = (data.expires_in ?? 3600) * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + expiresInMs,
      tokenType: data.token_type ?? "Bearer",
      scope: data.scope ?? config.scopes.join(" "),
    };
  }

  private async storeTokens(
    orgId: string,
    providerId: string,
    tokens: OAuthTokens,
  ): Promise<void> {
    const serialized = JSON.stringify(tokens);
    const encrypted = encrypt(serialized);

    // TTL = time until token expiry, minimum 60 seconds
    const ttlMs = Math.max(tokens.expiresAt - Date.now(), 60_000);
    // If there is a refresh token, keep the entry longer (30 days)
    const ttlSeconds = tokens.refreshToken
      ? 30 * 24 * 60 * 60
      : Math.ceil(ttlMs / 1000);

    await redis.set(tokensKey(orgId, providerId), encrypted, ttlSeconds);
  }

  private async loadTokens(
    orgId: string,
    providerId: string,
  ): Promise<OAuthTokens | null> {
    const raw = await redis.get(tokensKey(orgId, providerId));
    if (!raw) {
      return null;
    }

    const decrypted = decrypt(raw);
    return JSON.parse(decrypted) as OAuthTokens;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const mcpOAuthManager = new MCPOAuthManager();
