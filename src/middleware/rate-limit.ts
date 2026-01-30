/**
 * Rate Limiting Middleware
 * Redis-backed sliding window rate limiting with multiple strategies
 */

import { Request, Response, NextFunction } from "express";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  handler?: (req: Request, res: Response) => void;
  skip?: (req: Request) => boolean;
  headers?: boolean; // Send rate limit headers
}

interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

const defaultKeyGenerator = (req: Request): string => {
  // Use organization ID if authenticated, otherwise IP
  const orgId = (req as any).organization?.id;
  if (orgId) {
    return `org:${orgId}`;
  }

  // Get IP from various headers
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0] || req.ip || "unknown";

  return `ip:${ip}`;
};

const defaultHandler = (_req: Request, res: Response): void => {
  res.status(429).json({
    error: "Too many requests",
    message: "You have exceeded the rate limit. Please try again later.",
    retryAfter: res.getHeader("Retry-After"),
  });
};

/**
 * Sliding window rate limiter using Redis sorted sets
 */
async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitInfo> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const windowKey = `ratelimit:${key}`;

  // Lua script for atomic sliding window check
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowStart = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])
    local windowMs = tonumber(ARGV[4])

    -- Remove old entries outside the window
    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

    -- Count current requests in window
    local current = redis.call('ZCARD', key)

    -- Check if under limit
    if current < maxRequests then
      -- Add this request
      redis.call('ZADD', key, now, now .. ':' .. math.random())
      current = current + 1
    end

    -- Set expiry on the key
    redis.call('PEXPIRE', key, windowMs)

    return current
  `;

  const current = (await redis.eval(
    script,
    1,
    windowKey,
    now.toString(),
    windowStart.toString(),
    maxRequests.toString(),
    windowMs.toString()
  )) as number;

  const resetTime = new Date(now + windowMs);
  const remaining = Math.max(0, maxRequests - current);

  return {
    limit: maxRequests,
    current,
    remaining,
    resetTime,
  };
}

export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
    handler = defaultHandler,
    skip,
    headers = true,
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip if configured
      if (skip && skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const info = await checkRateLimit(key, windowMs, maxRequests);

      // Set headers
      if (headers) {
        res.setHeader("X-RateLimit-Limit", info.limit);
        res.setHeader("X-RateLimit-Remaining", info.remaining);
        res.setHeader("X-RateLimit-Reset", Math.ceil(info.resetTime.getTime() / 1000));
      }

      // Store info on request for later use
      (req as any).rateLimit = info;

      // Check if rate limited
      if (info.current > info.limit) {
        const retryAfter = Math.ceil(windowMs / 1000);
        res.setHeader("Retry-After", retryAfter);

        logger.warn("Rate limit exceeded", {
          key,
          current: info.current,
          limit: info.limit,
          path: req.path,
        });

        return handler(req, res);
      }

      // Handle skip on response status
      if (skipFailedRequests || skipSuccessfulRequests) {
        const originalEnd = res.end.bind(res);
        res.end = function (chunk?: any, encoding?: BufferEncoding | (() => void), callback?: () => void) {
          const shouldSkip =
            (skipFailedRequests && res.statusCode >= 400) ||
            (skipSuccessfulRequests && res.statusCode < 400);

          if (shouldSkip) {
            // Decrement the count since we're skipping this request
            const windowKey = `ratelimit:${key}`;
            redis
              .zremrangebyscore(windowKey, Date.now().toString(), Date.now().toString())
              .catch((err) => logger.error("Failed to adjust rate limit", { error: err }));
          }

          return originalEnd(chunk, encoding as BufferEncoding, callback);
        };
      }

      next();
    } catch (error) {
      // On error, allow the request through but log the error
      logger.error("Rate limit check failed", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });
      next();
    }
  };
}

// Preset configurations
export const rateLimitPresets = {
  // API default: 100 requests per minute
  api: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 100,
    headers: true,
  }),

  // Authentication: 5 attempts per minute
  auth: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 5,
    headers: true,
    skipSuccessfulRequests: true,
  }),

  // Webhook: 1000 requests per minute
  webhook: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 1000,
    keyGenerator: (req) => {
      const orgId = (req as any).organization?.id || "anonymous";
      return `webhook:${orgId}`;
    },
  }),

  // Orchestration: 20 requests per minute
  orchestration: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyGenerator: (req) => {
      const orgId = (req as any).organization?.id || "anonymous";
      return `orchestration:${orgId}`;
    },
    headers: true,
  }),

  // Heavy operations: 5 per hour
  heavy: rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    headers: true,
  }),

  // SSE connections: 10 concurrent per organization
  sse: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (req) => {
      const orgId = (req as any).organization?.id || "anonymous";
      return `sse:${orgId}`;
    },
  }),
};

// Dynamic rate limit based on organization tier
export function tierBasedRateLimit(baseLimits: {
  free: number;
  pro: number;
  enterprise: number;
}) {
  return rateLimit({
    windowMs: 60 * 1000,
    maxRequests: baseLimits.enterprise, // Will be adjusted in keyGenerator
    keyGenerator: (req) => {
      const org = (req as any).organization;
      const tier = org?.tier || "free";
      const limit = baseLimits[tier as keyof typeof baseLimits] || baseLimits.free;

      // Store the actual limit for this request
      (req as any)._dynamicRateLimit = limit;

      return `tier:${org?.id || "anonymous"}:${tier}`;
    },
    skip: (req) => {
      // Admin users bypass rate limits
      return (req as any).user?.role === "admin";
    },
  });
}

export async function getRateLimitStatus(key: string): Promise<RateLimitInfo | null> {
  const windowKey = `ratelimit:${key}`;
  const windowMs = 60 * 1000; // Default window
  const now = Date.now();
  const windowStart = now - windowMs;

  await redis.zremrangebyscore(windowKey, "-inf", windowStart.toString());
  const current = (await redis.zcard(windowKey)) ?? 0;

  return {
    limit: 100, // Default limit
    current,
    remaining: Math.max(0, 100 - current),
    resetTime: new Date(now + windowMs),
  };
}
