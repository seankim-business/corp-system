import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface CacheOptions {
  ttl?: number; // seconds, default 300 (5 min)
  prefix?: string;
  serialize?: (value: unknown) => string;
  deserialize?: (raw: string) => unknown;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TTL = 300; // 5 minutes
const DEFAULT_PREFIX = "qcache:";
// Reserved for future Redis-backed stats aggregation
// const STATS_PREFIX = "qcache:stats:";
// const STATS_TTL = 3600;

// =============================================================================
// In-Memory Stats (per-process)
// =============================================================================

let hits = 0;
let misses = 0;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get a cached value or compute it using the provider function.
 * Implements cache-aside (lazy loading) pattern.
 */
export async function cacheQuery<T>(
  key: string,
  provider: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const fullKey = `${prefix}${key}`;
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? JSON.parse;

  // Try cache first
  try {
    const cached = await redis.get(fullKey);
    if (cached !== null) {
      hits++;
      return deserialize(cached) as T;
    }
  } catch (err) {
    logger.warn("Cache read error, falling through to provider", {
      key: fullKey,
      error: String(err),
    });
  }

  // Cache miss - compute
  misses++;
  const result = await provider();

  // Store in cache (fire-and-forget)
  try {
    const serialized = serialize(result);
    await redis.set(fullKey, serialized, ttl);
  } catch (err) {
    logger.warn("Cache write error", { key: fullKey, error: String(err) });
  }

  return result;
}

/**
 * Invalidate a specific cache entry.
 */
export async function invalidateCache(key: string, prefix?: string): Promise<void> {
  const fullKey = `${prefix ?? DEFAULT_PREFIX}${key}`;
  await redis.del(fullKey);
  logger.debug("Cache entry invalidated", { key: fullKey });
}

/**
 * Build a deterministic cache key from a query description.
 */
export function buildCacheKey(
  entity: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const sorted = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined)
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `${entity}:${sorted}`;
}

/**
 * Get in-process cache statistics.
 */
export function getCacheStats(): CacheStats {
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total > 0 ? Math.round((hits / total) * 1000) / 1000 : 0,
    totalRequests: total,
  };
}

/**
 * Reset in-process cache statistics.
 */
export function resetCacheStats(): void {
  hits = 0;
  misses = 0;
}

// =============================================================================
// Route Resolution Cache
// =============================================================================

const ROUTE_CACHE_PREFIX = "rcache:";
const ROUTE_CACHE_TTL = 600; // 10 minutes

/**
 * Cache the result of route/category resolution for a request pattern.
 * This avoids repeated LLM calls for similar request patterns.
 */
export async function cacheRouteResolution<T>(
  requestPattern: string,
  organizationId: string,
  provider: () => Promise<T>,
): Promise<T> {
  const key = `${organizationId}:${normalizeForCacheKey(requestPattern)}`;
  return cacheQuery<T>(key, provider, {
    prefix: ROUTE_CACHE_PREFIX,
    ttl: ROUTE_CACHE_TTL,
  });
}

/**
 * Invalidate route cache for an organization (e.g., after config changes).
 */
export async function invalidateRouteCache(
  organizationId: string,
  requestPattern?: string,
): Promise<void> {
  if (requestPattern) {
    const key = `${organizationId}:${normalizeForCacheKey(requestPattern)}`;
    await invalidateCache(key, ROUTE_CACHE_PREFIX);
  }
  // Note: Without redis.keys(), we can't bulk-invalidate.
  // Individual invalidation or TTL expiry handles cleanup.
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize a request string for use as a cache key.
 * Strips whitespace, lowercases, and limits length.
 */
function normalizeForCacheKey(request: string): string {
  return request
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-:가-힣]/g, "")
    .slice(0, 128);
}
