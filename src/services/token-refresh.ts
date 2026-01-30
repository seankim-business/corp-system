import crypto from "crypto";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

/** Shape of token data stored in Redis for an OAuth connection. */
export interface TokenData {
  userId: string;
  organizationId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO-8601 – stored as string for JSON serialisation
  scopes?: string[];
}

/** Result returned after a successful token refresh. */
export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = "refresh_token";
const BUFFER_DAYS = 7;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redisKey(tokenId: string): string {
  return `${REDIS_KEY_PREFIX}:${tokenId}`;
}

/**
 * Compute a TTL (in seconds) from an expiry date plus a buffer period.
 * Returns at least 1 so the key is never stored without expiry.
 */
function computeTtl(expiresAt: Date): number {
  const bufferMs = BUFFER_DAYS * 24 * 60 * 60 * 1000;
  const ttlMs = expiresAt.getTime() + bufferMs - Date.now();
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure refresh token (64-byte hex string).
 */
export function generateRefreshToken(): string {
  const token = crypto.randomBytes(64).toString("hex");
  logger.debug("Generated new refresh token");
  return token;
}

/**
 * Store token data in Redis under `refresh_token:{tokenId}`.
 *
 * The TTL is calculated as the time until `expiresAt` **plus** a 7-day buffer
 * so the record outlives the access token long enough for a refresh to occur.
 */
export async function storeRefreshToken(
  tokenId: string,
  data: {
    userId: string;
    organizationId: string;
    provider: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scopes?: string[];
  },
): Promise<boolean> {
  try {
    const tokenData: TokenData = {
      userId: data.userId,
      organizationId: data.organizationId,
      provider: data.provider,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt.toISOString(),
      scopes: data.scopes,
    };

    const ttl = computeTtl(data.expiresAt);
    const key = redisKey(tokenId);
    const serialised = JSON.stringify(tokenData);

    const success = await redis.set(key, serialised, ttl);

    if (success) {
      logger.info("Stored refresh token", {
        tokenId,
        provider: data.provider,
        userId: data.userId,
        organizationId: data.organizationId,
        ttlSeconds: ttl,
      });
    } else {
      logger.error("Failed to store refresh token in Redis", {
        tokenId,
        provider: data.provider,
      });
    }

    return success;
  } catch (error) {
    logger.error(
      "Error storing refresh token",
      {
        tokenId,
        provider: data.provider,
      },
      error instanceof Error ? error : new Error(String(error)),
    );
    return false;
  }
}

/**
 * Retrieve stored token data from Redis. Returns `null` when the key does not
 * exist or cannot be parsed.
 */
export async function getTokenData(tokenId: string): Promise<TokenData | null> {
  try {
    const key = redisKey(tokenId);
    const raw = await redis.get(key);

    if (!raw) {
      logger.debug("Token data not found", { tokenId });
      return null;
    }

    const data = JSON.parse(raw) as TokenData;
    logger.debug("Retrieved token data", { tokenId, provider: data.provider });
    return data;
  } catch (error) {
    logger.error(
      "Error retrieving token data",
      { tokenId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Refresh an access token by calling the provider's token endpoint.
 *
 * On success the stored token data is updated in Redis with the new access
 * token (and optionally a rotated refresh token).
 */
export async function refreshAccessToken(
  tokenId: string,
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshResult> {
  logger.info("Refreshing access token", { tokenId, tokenEndpoint });

  const tokenData = await getTokenData(tokenId);
  if (!tokenData) {
    throw new Error(`No stored token data found for tokenId: ${tokenId}`);
  }

  try {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Token refresh request failed", {
        tokenId,
        status: response.status,
        body,
      });
      throw new Error(
        `Token refresh failed with status ${response.status}: ${body}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;

    const accessToken = payload.access_token as string | undefined;
    if (!accessToken) {
      throw new Error("Token refresh response missing access_token");
    }

    const expiresIn =
      typeof payload.expires_in === "number"
        ? payload.expires_in
        : parseInt(String(payload.expires_in ?? "3600"), 10);

    const newRefreshToken = payload.refresh_token as string | undefined;

    // Persist updated tokens
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await storeRefreshToken(tokenId, {
      userId: tokenData.userId,
      organizationId: tokenData.organizationId,
      provider: tokenData.provider,
      accessToken,
      refreshToken: newRefreshToken ?? tokenData.refreshToken,
      expiresAt: newExpiresAt,
      scopes: tokenData.scopes,
    });

    logger.info("Access token refreshed successfully", {
      tokenId,
      provider: tokenData.provider,
      expiresIn,
      refreshTokenRotated: !!newRefreshToken,
    });

    const result: RefreshResult = { accessToken, expiresIn };
    if (newRefreshToken) {
      result.refreshToken = newRefreshToken;
    }
    return result;
  } catch (error) {
    logger.error(
      "Error refreshing access token",
      { tokenId, tokenEndpoint },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Revoke (delete) a refresh token from Redis.
 */
export async function revokeRefreshToken(tokenId: string): Promise<boolean> {
  try {
    const key = redisKey(tokenId);
    const success = await redis.del(key);

    if (success) {
      logger.info("Revoked refresh token", { tokenId });
    } else {
      logger.warn("Failed to revoke refresh token (key may not exist)", {
        tokenId,
      });
    }

    return success;
  } catch (error) {
    logger.error(
      "Error revoking refresh token",
      { tokenId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return false;
  }
}

/**
 * Check whether the stored access token has expired (or will expire within
 * the next 5 minutes).
 *
 * Returns `true` when expired or when no token data exists.
 */
export async function isTokenExpired(tokenId: string): Promise<boolean> {
  try {
    const tokenData = await getTokenData(tokenId);

    if (!tokenData) {
      logger.debug("Token not found, treating as expired", { tokenId });
      return true;
    }

    const expiresAt = new Date(tokenData.expiresAt).getTime();
    const now = Date.now();
    const expired = now >= expiresAt - EXPIRY_BUFFER_MS;

    logger.debug("Token expiry check", {
      tokenId,
      expired,
      expiresAt: tokenData.expiresAt,
      bufferMs: EXPIRY_BUFFER_MS,
    });

    return expired;
  } catch (error) {
    logger.error(
      "Error checking token expiry",
      { tokenId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return true;
  }
}

/**
 * Convenience method: return the current access token when it is still valid,
 * or automatically refresh and return the new one when it has expired.
 */
export async function getOrRefreshToken(
  tokenId: string,
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  try {
    const expired = await isTokenExpired(tokenId);

    if (!expired) {
      const tokenData = await getTokenData(tokenId);
      if (tokenData) {
        logger.debug("Returning existing valid access token", { tokenId });
        return tokenData.accessToken;
      }
    }

    logger.info("Token expired or missing, refreshing", { tokenId });
    const result = await refreshAccessToken(
      tokenId,
      tokenEndpoint,
      clientId,
      clientSecret,
    );
    return result.accessToken;
  } catch (error) {
    logger.error(
      "Error in getOrRefreshToken",
      { tokenId, tokenEndpoint },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
