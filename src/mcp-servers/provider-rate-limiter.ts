/**
 * MCP Provider Rate Limiter
 *
 * Per-provider, per-organization rate limiting using Redis sliding window
 * counters. Supports configurable limits for known providers and custom
 * overrides.
 */

import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  providerId: string;
  maxRequests: number;
  windowMs: number;
  burstLimit?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimitStatus {
  providerId: string;
  organizationId: string;
  currentCount: number;
  maxRequests: number;
  windowMs: number;
  remaining: number;
  burstLimit: number | null;
}

// ---------------------------------------------------------------------------
// Default configs for known providers
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_MS = 1000;

const DEFAULT_PROVIDER_CONFIGS: Record<string, RateLimitConfig> = {
  notion: {
    providerId: "notion",
    maxRequests: 3,
    windowMs: DEFAULT_WINDOW_MS,
  },
  linear: {
    providerId: "linear",
    maxRequests: 10,
    windowMs: DEFAULT_WINDOW_MS,
  },
  github: {
    providerId: "github",
    maxRequests: 30,
    windowMs: DEFAULT_WINDOW_MS,
  },
  google_drive: {
    providerId: "google_drive",
    maxRequests: 10,
    windowMs: DEFAULT_WINDOW_MS,
  },
  jira: {
    providerId: "jira",
    maxRequests: 10,
    windowMs: DEFAULT_WINDOW_MS,
  },
  slack: {
    providerId: "slack",
    maxRequests: 50,
    windowMs: DEFAULT_WINDOW_MS,
  },
};

// Custom overrides that can be registered at runtime
const customConfigs = new Map<string, RateLimitConfig>();

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Get the rate limit config for a provider, checking custom overrides first.
 */
function getConfig(providerId: string): RateLimitConfig {
  const custom = customConfigs.get(providerId);
  if (custom) {
    return custom;
  }

  const defaultConfig = DEFAULT_PROVIDER_CONFIGS[providerId];
  if (defaultConfig) {
    return defaultConfig;
  }

  // Fallback: 10 req/s for unknown providers
  return {
    providerId,
    maxRequests: 10,
    windowMs: DEFAULT_WINDOW_MS,
  };
}

/**
 * Register a custom rate limit config for a provider.
 */
export function registerRateLimitConfig(config: RateLimitConfig): void {
  customConfigs.set(config.providerId, config);
  logger.info("Custom rate limit config registered", {
    providerId: config.providerId,
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    burstLimit: config.burstLimit ?? null,
  });
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

/**
 * Build the Redis key for the sliding window counter.
 * Key format: ratelimit:{providerId}:{orgId}:{windowKey}
 *
 * The windowKey is computed by dividing the current timestamp by the
 * window size, which creates time-aligned buckets.
 */
function buildRedisKey(
  providerId: string,
  organizationId: string,
  windowMs: number,
): string {
  const windowKey = Math.floor(Date.now() / windowMs);
  return `ratelimit:${providerId}:${organizationId}:${windowKey}`;
}

/**
 * Compute the number of milliseconds until the current window resets.
 */
function getResetMs(windowMs: number): number {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  return windowEnd - now;
}

// ---------------------------------------------------------------------------
// Core rate limiting functions
// ---------------------------------------------------------------------------

/**
 * Check whether a request is allowed under the provider's rate limit
 * for the given organization.
 *
 * This is a read-only check. Call `recordRequest` after executing the
 * request to actually count it.
 */
export async function checkRateLimit(
  providerId: string,
  organizationId: string,
): Promise<RateLimitResult> {
  const config = getConfig(providerId);
  const key = buildRedisKey(providerId, organizationId, config.windowMs);
  const resetMs = getResetMs(config.windowMs);

  try {
    const currentValue = await redis.get(key);
    const currentCount = currentValue ? parseInt(currentValue, 10) : 0;
    const effectiveLimit = config.burstLimit ?? config.maxRequests;
    const remaining = Math.max(0, effectiveLimit - currentCount);

    return {
      allowed: currentCount < effectiveLimit,
      remaining,
      resetMs,
    };
  } catch (error) {
    // On Redis failure, allow the request (fail-open) but log the issue
    logger.error("Rate limit check failed, allowing request (fail-open)", {
      providerId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      allowed: true,
      remaining: config.maxRequests,
      resetMs,
    };
  }
}

/**
 * Record a request against the rate limit counter for the provider
 * and organization. Uses Redis INCR + EXPIRE for a fixed-window counter.
 */
export async function recordRequest(
  providerId: string,
  organizationId: string,
): Promise<void> {
  const config = getConfig(providerId);
  const key = buildRedisKey(providerId, organizationId, config.windowMs);
  const ttlSeconds = Math.ceil(config.windowMs / 1000) + 1;

  try {
    await redis.incr(key);
    await redis.expire(key, ttlSeconds);
  } catch (error) {
    logger.error("Rate limit record failed", {
      providerId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get the current rate limit usage status for a provider and organization.
 */
export async function getRateLimitStatus(
  providerId: string,
  organizationId: string,
): Promise<RateLimitStatus> {
  const config = getConfig(providerId);
  const key = buildRedisKey(providerId, organizationId, config.windowMs);

  let currentCount = 0;
  try {
    const currentValue = await redis.get(key);
    currentCount = currentValue ? parseInt(currentValue, 10) : 0;
  } catch (error) {
    logger.error("Rate limit status check failed", {
      providerId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const effectiveLimit = config.burstLimit ?? config.maxRequests;

  return {
    providerId,
    organizationId,
    currentCount,
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    remaining: Math.max(0, effectiveLimit - currentCount),
    burstLimit: config.burstLimit ?? null,
  };
}
