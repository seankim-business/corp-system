/**
 * Route Resolution Cache
 *
 * Caches category and skill routing decisions for identical or near-identical
 * requests to avoid redundant LLM calls and keyword matching. Uses a two-tier
 * approach: exact match (hash-based) and normalized match (stemmed keywords).
 */
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { Category, Skill } from "./types";
import crypto from "crypto";

// =============================================================================
// Types
// =============================================================================

export interface CachedRoute {
  category: Category;
  skills: string[];
  confidence: number;
  method: string;
  cachedAt: string;
  hitCount: number;
}

interface RouteCacheConfig {
  /** TTL for cached routes in seconds (default: 300 = 5 min) */
  ttlSeconds: number;
  /** Maximum number of in-memory cache entries (default: 500) */
  maxMemoryEntries: number;
  /** Minimum confidence to cache a route (default: 0.6) */
  minConfidenceToCache: number;
  /** Whether to use Redis as L2 cache (default: true) */
  useRedis: boolean;
}

const DEFAULT_CONFIG: RouteCacheConfig = {
  ttlSeconds: 300,
  maxMemoryEntries: 500,
  minConfidenceToCache: 0.6,
  useRedis: true,
};

// =============================================================================
// In-Memory L1 Cache (LRU-like with Map insertion order)
// =============================================================================

const memoryCache = new Map<string, CachedRoute>();
const REDIS_PREFIX = "route_cache:";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute a deterministic hash key for a request within an org context.
 * We normalize whitespace and lowercase to improve hit rate.
 */
function computeCacheKey(organizationId: string, request: string): string {
  const normalized = request.toLowerCase().trim().replace(/\s+/g, " ");
  const hash = crypto.createHash("sha256").update(`${organizationId}:${normalized}`).digest("hex");
  return hash.substring(0, 16); // 16-char hex = 64 bits, enough for cache key
}

/**
 * Compute a "fuzzy" key based on sorted keywords for near-match caching.
 * Strips stop words and sorts remaining tokens alphabetically.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "either", "neither",
  "this", "that", "these", "those", "it", "its", "i", "me", "my",
  "we", "our", "you", "your", "he", "she", "they", "them", "their",
  "please", "just", "also", "very", "really", "좀", "그", "이", "저",
]);

function computeFuzzyKey(organizationId: string, request: string): string {
  const tokens = request
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .sort();
  const joined = `${organizationId}:${tokens.join(":")}`;
  const hash = crypto.createHash("sha256").update(joined).digest("hex");
  return `f:${hash.substring(0, 16)}`;
}

// =============================================================================
// Public API
// =============================================================================

let config = { ...DEFAULT_CONFIG };

/**
 * Configure route cache behavior.
 */
export function configureRouteCache(overrides: Partial<RouteCacheConfig>): void {
  config = { ...DEFAULT_CONFIG, ...overrides };
  logger.debug("Route cache configured", { config });
}

/**
 * Look up a cached route for a given request.
 * Checks L1 (memory) first, then L2 (Redis).
 * Returns null on miss.
 */
export async function getCachedRoute(
  organizationId: string,
  request: string,
): Promise<CachedRoute | null> {
  const exactKey = computeCacheKey(organizationId, request);
  const fuzzyKey = computeFuzzyKey(organizationId, request);

  // L1: memory (exact)
  const memExact = memoryCache.get(exactKey);
  if (memExact) {
    memExact.hitCount++;
    logger.debug("Route cache HIT (memory/exact)", { key: exactKey, category: memExact.category });
    return memExact;
  }

  // L1: memory (fuzzy)
  const memFuzzy = memoryCache.get(fuzzyKey);
  if (memFuzzy) {
    memFuzzy.hitCount++;
    logger.debug("Route cache HIT (memory/fuzzy)", { key: fuzzyKey, category: memFuzzy.category });
    return memFuzzy;
  }

  // L2: Redis
  if (!config.useRedis) return null;

  try {
    const redisExact = await redis.get(`${REDIS_PREFIX}${exactKey}`);
    if (redisExact) {
      const parsed = JSON.parse(redisExact) as CachedRoute;
      parsed.hitCount++;
      // Promote to L1
      evictIfNeeded();
      memoryCache.set(exactKey, parsed);
      logger.debug("Route cache HIT (redis/exact)", { key: exactKey, category: parsed.category });
      return parsed;
    }

    const redisFuzzy = await redis.get(`${REDIS_PREFIX}${fuzzyKey}`);
    if (redisFuzzy) {
      const parsed = JSON.parse(redisFuzzy) as CachedRoute;
      parsed.hitCount++;
      evictIfNeeded();
      memoryCache.set(fuzzyKey, parsed);
      logger.debug("Route cache HIT (redis/fuzzy)", { key: fuzzyKey, category: parsed.category });
      return parsed;
    }
  } catch (err) {
    logger.warn("Route cache Redis lookup failed", { error: String(err) });
  }

  return null;
}

/**
 * Store a routing decision in the cache.
 */
export async function cacheRoute(
  organizationId: string,
  request: string,
  category: Category,
  skills: Skill[] | string[],
  confidence: number,
  method: string,
): Promise<void> {
  if (confidence < config.minConfidenceToCache) {
    logger.debug("Route not cached (low confidence)", { confidence, threshold: config.minConfidenceToCache });
    return;
  }

  const exactKey = computeCacheKey(organizationId, request);
  const fuzzyKey = computeFuzzyKey(organizationId, request);

  const entry: CachedRoute = {
    category,
    skills: skills.map(String),
    confidence,
    method,
    cachedAt: new Date().toISOString(),
    hitCount: 0,
  };

  // L1
  evictIfNeeded();
  memoryCache.set(exactKey, entry);
  memoryCache.set(fuzzyKey, { ...entry });

  // L2
  if (config.useRedis) {
    try {
      const serialized = JSON.stringify(entry);
      await redis.set(`${REDIS_PREFIX}${exactKey}`, serialized, config.ttlSeconds);
      await redis.set(`${REDIS_PREFIX}${fuzzyKey}`, serialized, config.ttlSeconds);
    } catch (err) {
      logger.warn("Route cache Redis write failed", { error: String(err) });
    }
  }

  logger.debug("Route cached", { exactKey, fuzzyKey, category, skills: entry.skills });
}

/**
 * Invalidate all cached routes for an organization.
 * Called when routing config changes (e.g., new skills added).
 */
export async function invalidateOrgRoutes(organizationId: string): Promise<number> {
  let count = 0;

  // Clear memory entries (we can't easily filter by org, so clear all)
  const sizeBefore = memoryCache.size;
  memoryCache.clear();
  count += sizeBefore;

  // Clear Redis entries via scan
  if (config.useRedis) {
    try {
      // Use eval to scan and delete matching keys
      const script = `
        local cursor = "0"
        local count = 0
        repeat
          local result = redis.call("SCAN", cursor, "MATCH", ARGV[1], "COUNT", 100)
          cursor = result[1]
          for _, key in ipairs(result[2]) do
            redis.call("DEL", key)
            count = count + 1
          end
        until cursor == "0"
        return count
      `;
      const deleted = await redis.eval(script, 0, `${REDIS_PREFIX}*`);
      count += typeof deleted === "number" ? deleted : 0;
    } catch (err) {
      logger.warn("Route cache Redis invalidation failed", { error: String(err) });
    }
  }

  logger.info("Route cache invalidated", { organizationId, entriesCleared: count });
  return count;
}

/**
 * Get cache statistics.
 */
export function getRouteCacheStats(): {
  memoryEntries: number;
  maxMemoryEntries: number;
  ttlSeconds: number;
  topHits: Array<{ key: string; category: string; hitCount: number }>;
} {
  const entries = Array.from(memoryCache.entries());
  const topHits = entries
    .map(([key, val]) => ({ key, category: val.category, hitCount: val.hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 10);

  return {
    memoryEntries: memoryCache.size,
    maxMemoryEntries: config.maxMemoryEntries,
    ttlSeconds: config.ttlSeconds,
    topHits,
  };
}

// =============================================================================
// Internal
// =============================================================================

function evictIfNeeded(): void {
  if (memoryCache.size < config.maxMemoryEntries) return;

  // Evict oldest 20% (Map preserves insertion order)
  const toEvict = Math.ceil(config.maxMemoryEntries * 0.2);
  const keys = memoryCache.keys();
  for (let i = 0; i < toEvict; i++) {
    const next = keys.next();
    if (next.done) break;
    memoryCache.delete(next.value);
  }
}
