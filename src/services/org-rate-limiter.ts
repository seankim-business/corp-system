import { Request, Response, NextFunction } from "express";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface OrganizationLimits {
  api: RateLimitConfig;
  workflow: RateLimitConfig;
  ai: RateLimitConfig;
}

const DEFAULT_LIMITS: OrganizationLimits = {
  api: { windowMs: 60000, maxRequests: 100 },
  workflow: { windowMs: 60000, maxRequests: 20 },
  ai: { windowMs: 60000, maxRequests: 10 },
};

const PLAN_LIMITS: Record<string, OrganizationLimits> = {
  free: {
    api: { windowMs: 60000, maxRequests: 50 },
    workflow: { windowMs: 60000, maxRequests: 10 },
    ai: { windowMs: 60000, maxRequests: 5 },
  },
  starter: {
    api: { windowMs: 60000, maxRequests: 200 },
    workflow: { windowMs: 60000, maxRequests: 50 },
    ai: { windowMs: 60000, maxRequests: 20 },
  },
  professional: {
    api: { windowMs: 60000, maxRequests: 500 },
    workflow: { windowMs: 60000, maxRequests: 100 },
    ai: { windowMs: 60000, maxRequests: 50 },
  },
  enterprise: {
    api: { windowMs: 60000, maxRequests: 2000 },
    workflow: { windowMs: 60000, maxRequests: 500 },
    ai: { windowMs: 60000, maxRequests: 200 },
  },
};

type LimitType = keyof OrganizationLimits;

function getLimits(plan?: string): OrganizationLimits {
  if (plan && PLAN_LIMITS[plan]) {
    return PLAN_LIMITS[plan];
  }
  return DEFAULT_LIMITS;
}

async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  current: number;
}> {
  const now = Date.now();
  const redisKey = `ratelimit:${key}`;
  const ttlSeconds = Math.ceil(config.windowMs / 1000);

  try {
    // ATOMIC increment - fixes TOCTOU race condition
    // INCR creates key with value 1 if it doesn't exist
    const newCount = await redis.incr(redisKey);

    // Set expiry only on first request (when count becomes 1)
    // This is atomic: if another request incremented first, we skip expiry
    if (newCount === 1) {
      await redis.expire(redisKey, ttlSeconds);
    }

    const allowed = newCount <= config.maxRequests;

    if (!allowed) {
      const ttl = await getTTL(redisKey);
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + (ttl > 0 ? ttl * 1000 : config.windowMs),
        current: newCount,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - newCount),
      resetAt: now + config.windowMs,
      current: newCount,
    };
  } catch (error) {
    logger.error("Rate limit check failed", { error, key });
    // Fail open: allow request if Redis is down
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
      current: 0,
    };
  }
}

async function getTTL(key: string): Promise<number> {
  return redis.ttl(key);
}

export function createOrgRateLimiter(limitType: LimitType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return next();
    }

    const plan = user?.organization?.plan || "free";
    const limits = getLimits(plan);
    const config = limits[limitType];

    const key = `${organizationId}:${limitType}`;
    const result = await checkRateLimit(key, config);

    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      logger.warn("Rate limit exceeded", {
        organizationId,
        limitType,
        plan,
        current: result.current,
        max: config.maxRequests,
      });

      return res.status(429).json({
        error: "Rate limit exceeded",
        message: `Too many ${limitType} requests. Please upgrade your plan or try again later.`,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        limit: config.maxRequests,
        remaining: 0,
        resetAt: new Date(result.resetAt).toISOString(),
      });
    }

    next();
  };
}

export const orgApiRateLimiter = createOrgRateLimiter("api");
export const orgWorkflowRateLimiter = createOrgRateLimiter("workflow");
export const orgAiRateLimiter = createOrgRateLimiter("ai");

export async function getRateLimitStatus(
  organizationId: string,
  plan?: string,
): Promise<Record<LimitType, { current: number; max: number; remaining: number }>> {
  const limits = getLimits(plan);
  const result: Record<string, { current: number; max: number; remaining: number }> = {};

  for (const type of Object.keys(limits) as LimitType[]) {
    const key = `ratelimit:${organizationId}:${type}`;
    const countStr = await redis.get(key);
    const current = countStr ? parseInt(countStr, 10) : 0;
    const max = limits[type].maxRequests;

    result[type] = {
      current,
      max,
      remaining: Math.max(0, max - current),
    };
  }

  return result as Record<LimitType, { current: number; max: number; remaining: number }>;
}

export async function resetRateLimit(organizationId: string, limitType?: LimitType): Promise<void> {
  if (limitType) {
    await redis.del(`ratelimit:${organizationId}:${limitType}`);
  } else {
    for (const type of ["api", "workflow", "ai"] as LimitType[]) {
      await redis.del(`ratelimit:${organizationId}:${type}`);
    }
  }
}
