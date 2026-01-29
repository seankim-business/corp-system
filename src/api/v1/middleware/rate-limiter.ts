/**
 * API Rate Limiter Middleware
 *
 * Implements tiered rate limiting for the v1 API based on API key tier.
 * Uses Redis for distributed rate limiting.
 */

import { Request, Response, NextFunction } from "express";
import { redis } from "../../../db/redis";
import { RATE_LIMITS, APIKey } from "../../../services/api-keys";
import { logger } from "../../../utils/logger";

const RATE_LIMIT_PREFIX = "ratelimit:v1";

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * API rate limiter middleware.
 * Must be used after apiKeyAuth middleware.
 */
export function apiRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      // No API key - should not happen if apiKeyAuth is used first
      return next();
    }

    const limits = RATE_LIMITS[apiKey.rateLimitTier];
    const redisKeyBase = `${RATE_LIMIT_PREFIX}:${apiKey.id}`;

    try {
      // Check minute limit
      const minuteKey = `${redisKeyBase}:minute`;
      const minuteCount = await redis.incr(minuteKey);

      if (minuteCount === 1) {
        await redis.expire(minuteKey, 60);
      }

      const minuteTTL = await redis.ttl(minuteKey);

      if (minuteCount > limits.perMinute) {
        logger.warn("Rate limit exceeded (minute)", {
          keyId: apiKey.id,
          keyPrefix: apiKey.keyPrefix,
          tier: apiKey.rateLimitTier,
          count: minuteCount,
          limit: limits.perMinute,
        });

        setRateLimitHeaders(res, limits.perMinute, 0, minuteTTL);

        return res.status(429).json({
          error: "rate_limit_exceeded",
          message: "Too many requests per minute",
          retry_after: minuteTTL,
          limit: limits.perMinute,
          window: "1 minute",
          tier: apiKey.rateLimitTier,
          upgrade_url: "https://nubabel.com/pricing",
        });
      }

      // Check daily limit
      const dayKey = `${redisKeyBase}:day`;
      const dayCount = await redis.incr(dayKey);

      if (dayCount === 1) {
        // Set expiry to end of day UTC
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const secondsUntilEndOfDay = Math.ceil(
          (endOfDay.getTime() - now.getTime()) / 1000,
        );
        await redis.expire(dayKey, secondsUntilEndOfDay);
      }

      if (dayCount > limits.perDay) {
        const dayTTL = await redis.ttl(dayKey);

        logger.warn("Rate limit exceeded (day)", {
          keyId: apiKey.id,
          keyPrefix: apiKey.keyPrefix,
          tier: apiKey.rateLimitTier,
          count: dayCount,
          limit: limits.perDay,
        });

        setRateLimitHeaders(res, limits.perDay, 0, dayTTL);

        return res.status(429).json({
          error: "daily_limit_exceeded",
          message: "Daily request limit exceeded",
          retry_after: dayTTL,
          limit: limits.perDay,
          window: "24 hours",
          tier: apiKey.rateLimitTier,
          upgrade_url: "https://nubabel.com/pricing",
        });
      }

      // Set rate limit headers for successful requests
      setRateLimitHeaders(
        res,
        limits.perMinute,
        Math.max(0, limits.perMinute - minuteCount),
        minuteTTL,
      );

      // Also set daily limit headers
      res.setHeader("X-RateLimit-Daily-Limit", limits.perDay);
      res.setHeader("X-RateLimit-Daily-Remaining", Math.max(0, limits.perDay - dayCount));

      next();
    } catch (error) {
      logger.error("Rate limiter error", { error, keyId: apiKey.id });
      // Don't block the request on rate limiter errors
      next();
    }
  };
}

/**
 * Set rate limit headers on response.
 */
function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  reset: number,
): void {
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", reset);
  res.setHeader("RateLimit-Limit", limit);
  res.setHeader("RateLimit-Remaining", remaining);
  res.setHeader("RateLimit-Reset", reset);
}

/**
 * Get current rate limit status for an API key.
 */
export async function getRateLimitStatus(apiKey: APIKey): Promise<{
  minute: RateLimitInfo;
  day: RateLimitInfo;
}> {
  const limits = RATE_LIMITS[apiKey.rateLimitTier];
  const redisKeyBase = `${RATE_LIMIT_PREFIX}:${apiKey.id}`;

  const [minuteCount, minuteTTL, dayCount, dayTTL] = await Promise.all([
    redis.get(`${redisKeyBase}:minute`).then((v) => parseInt(v || "0", 10)),
    redis.ttl(`${redisKeyBase}:minute`),
    redis.get(`${redisKeyBase}:day`).then((v) => parseInt(v || "0", 10)),
    redis.ttl(`${redisKeyBase}:day`),
  ]);

  return {
    minute: {
      limit: limits.perMinute,
      remaining: Math.max(0, limits.perMinute - minuteCount),
      reset: Math.max(0, minuteTTL),
    },
    day: {
      limit: limits.perDay,
      remaining: Math.max(0, limits.perDay - dayCount),
      reset: Math.max(0, dayTTL),
    },
  };
}
