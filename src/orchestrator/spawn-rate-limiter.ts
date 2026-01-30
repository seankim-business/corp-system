/**
 * Spawn Rate Limiter
 *
 * Prevents runaway sub-agent spawning with sliding window rate limits.
 * Enforces per-user and per-organization limits using Redis.
 */

import { redis } from "../db/redis";
import { logger } from "../utils/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  reason?: string;
}

export interface RateLimitConfig {
  perUserLimit: number;
  perOrgLimit: number;
  windowSeconds: number;
}

export interface SpawnRateLimiter {
  checkLimit(userId: string, organizationId: string): Promise<RateLimitResult>;
  recordSpawn(userId: string, organizationId: string): Promise<void>;
  resetLimits(userId: string, organizationId: string): Promise<void>;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perUserLimit: 10, // 10 spawns per minute per user
  perOrgLimit: 50, // 50 spawns per minute per organization
  windowSeconds: 60, // 1 minute sliding window
};

/**
 * Redis-based spawn rate limiter with sliding window algorithm
 */
class RedisSpawnRateLimiter implements SpawnRateLimiter {
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a spawn is allowed under rate limits
   */
  async checkLimit(userId: string, organizationId: string): Promise<RateLimitResult> {
    try {
      // Check user limit
      const userResult = await this.checkSingleLimit(
        "user",
        userId,
        this.config.perUserLimit,
      );

      if (!userResult.allowed) {
        logger.warn("User spawn rate limit exceeded", {
          userId,
          limit: this.config.perUserLimit,
          remaining: userResult.remaining,
          resetAt: userResult.resetAt,
        });
        return userResult;
      }

      // Check organization limit
      const orgResult = await this.checkSingleLimit(
        "org",
        organizationId,
        this.config.perOrgLimit,
      );

      if (!orgResult.allowed) {
        logger.warn("Organization spawn rate limit exceeded", {
          organizationId,
          limit: this.config.perOrgLimit,
          remaining: orgResult.remaining,
          resetAt: orgResult.resetAt,
        });
        return orgResult;
      }

      // Both limits passed - return the more restrictive remaining count
      return {
        allowed: true,
        remaining: Math.min(userResult.remaining, orgResult.remaining),
        resetAt: new Date(
          Math.min(userResult.resetAt.getTime(), orgResult.resetAt.getTime()),
        ),
      };
    } catch (error) {
      logger.error(
        "Rate limit check failed",
        { userId, organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );

      // Fail open: allow the request if Redis is down
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date(Date.now() + this.config.windowSeconds * 1000),
        reason: "Rate limit check failed, allowing request",
      };
    }
  }

  /**
   * Record a spawn after successful execution
   */
  async recordSpawn(userId: string, organizationId: string): Promise<void> {
    try {
      await Promise.all([
        this.incrementCounter("user", userId),
        this.incrementCounter("org", organizationId),
      ]);

      logger.debug("Spawn recorded", {
        userId,
        organizationId,
      });
    } catch (error) {
      logger.error(
        "Failed to record spawn",
        { userId, organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      // Don't throw - recording failure shouldn't break spawning
    }
  }

  /**
   * Reset rate limits for a user and organization (for testing/admin)
   */
  async resetLimits(userId: string, organizationId: string): Promise<void> {
    try {
      const now = Date.now();
      const windowStart = now - this.config.windowSeconds * 1000;
      const userKey = this.getKey("user", userId, windowStart);
      const orgKey = this.getKey("org", organizationId, windowStart);

      await Promise.all([redis.del(userKey), redis.del(orgKey)]);

      logger.info("Rate limits reset", {
        userId,
        organizationId,
      });
    } catch (error) {
      logger.error(
        "Failed to reset rate limits",
        { userId, organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Check a single rate limit (user or org)
   */
  private async checkSingleLimit(
    type: "user" | "org",
    id: string,
    limit: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowSeconds * 1000;
    const key = this.getKey(type, id, windowStart);

    // Get current count from Redis
    const currentCount = await this.getCount(key);

    const allowed = currentCount < limit;
    const remaining = Math.max(0, limit - currentCount);
    const resetAt = new Date(windowStart + this.config.windowSeconds * 1000);

    return {
      allowed,
      remaining,
      resetAt,
      reason: allowed ? undefined : `${type} rate limit exceeded (${limit}/${this.config.windowSeconds}s)`,
    };
  }

  /**
   * Increment counter for a spawn
   */
  private async incrementCounter(type: "user" | "org", id: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.windowSeconds * 1000;
    const key = this.getKey(type, id, windowStart);

    // Use Lua script for atomic increment + expire
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;

    await redis.eval(script, 1, key, this.config.windowSeconds);
  }

  /**
   * Get current count from Redis
   */
  private async getCount(key: string): Promise<number> {
    const value = await redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Generate Redis key for rate limiting
   * Format: spawn_limit:{type}:{id}:{window}
   */
  private getKey(type: "user" | "org", id: string, windowStart: number): string {
    // Round to window boundary for sliding window
    const windowBoundary = Math.floor(windowStart / (this.config.windowSeconds * 1000));
    return `spawn_limit:${type}:${id}:${windowBoundary}`;
  }
}

/**
 * Singleton instance
 */
let rateLimiterInstance: SpawnRateLimiter | null = null;

/**
 * Get or create the rate limiter instance
 */
export function getSpawnRateLimiter(config?: Partial<RateLimitConfig>): SpawnRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RedisSpawnRateLimiter(config);
  }
  return rateLimiterInstance;
}

/**
 * Reset the rate limiter instance (for testing)
 */
export function resetRateLimiterInstance(): void {
  rateLimiterInstance = null;
}
