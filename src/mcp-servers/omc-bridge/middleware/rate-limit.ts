import { Request, Response, NextFunction } from "express";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: {
    minute: number;
    hour: number;
  };
  resetAt: {
    minute: Date;
    hour: Date;
  };
}

// Default rate limits per organization
const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  requestsPerMinute: 60,
  requestsPerHour: 500,
};

/**
 * Get rate limit configuration for an organization
 */
async function getRateLimitConfig(organizationId: string): Promise<RateLimitConfig> {
  try {
    // Try to get custom rate limits from Redis
    const customLimits = await redis.get(`rate_limit_config:${organizationId}`);
    if (customLimits) {
      return JSON.parse(customLimits);
    }
  } catch (error) {
    logger.warn("Failed to get custom rate limits, using defaults", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return DEFAULT_RATE_LIMITS;
}

/**
 * Check if request is within rate limits
 */
export async function checkRateLimit(
  organizationId: string
): Promise<RateLimitStatus> {
  const config = await getRateLimitConfig(organizationId);
  const now = Date.now();

  // Keys for minute and hour windows
  const minuteKey = `rate_limit:minute:${organizationId}:${Math.floor(now / 60000)}`;
  const hourKey = `rate_limit:hour:${organizationId}:${Math.floor(now / 3600000)}`;

  try {
    // Get current counts
    const [minuteCount, hourCount] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
    ]);

    const currentMinuteCount = parseInt(minuteCount || "0", 10);
    const currentHourCount = parseInt(hourCount || "0", 10);

    // Calculate remaining
    const remainingMinute = Math.max(0, config.requestsPerMinute - currentMinuteCount);
    const remainingHour = Math.max(0, config.requestsPerHour - currentHourCount);

    // Calculate reset times
    const minuteResetAt = new Date(Math.ceil(now / 60000) * 60000);
    const hourResetAt = new Date(Math.ceil(now / 3600000) * 3600000);

    // Check if limits exceeded
    const allowed =
      currentMinuteCount < config.requestsPerMinute &&
      currentHourCount < config.requestsPerHour;

    return {
      allowed,
      remaining: {
        minute: remainingMinute,
        hour: remainingHour,
      },
      resetAt: {
        minute: minuteResetAt,
        hour: hourResetAt,
      },
    };
  } catch (error) {
    logger.error(
      "Rate limit check failed",
      { organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
    // On error, allow the request but log it
    return {
      allowed: true,
      remaining: { minute: 0, hour: 0 },
      resetAt: { minute: new Date(), hour: new Date() },
    };
  }
}

/**
 * Increment usage counters after a successful request
 */
export async function incrementUsage(organizationId: string): Promise<void> {
  const now = Date.now();
  const minuteKey = `rate_limit:minute:${organizationId}:${Math.floor(now / 60000)}`;
  const hourKey = `rate_limit:hour:${organizationId}:${Math.floor(now / 3600000)}`;

  try {
    await Promise.all([
      // Increment minute counter
      redis.incr(minuteKey),
      // Set expiry for minute counter
      redis.expire(minuteKey, 120), // Keep for 2 minutes
      // Increment hour counter
      redis.incr(hourKey),
      // Set expiry for hour counter
      redis.expire(hourKey, 7200), // Keep for 2 hours
    ]);

    logger.debug("Usage incremented", {
      organizationId,
      minuteKey,
      hourKey,
    });
  } catch (error) {
    logger.error(
      "Failed to increment usage",
      { organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Get remaining quota for an organization
 */
export async function getRemainingQuota(organizationId: string): Promise<{
  minute: number;
  hour: number;
}> {
  const status = await checkRateLimit(organizationId);
  return status.remaining;
}

/**
 * Express middleware for rate limiting
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Auth middleware should run first and attach omcBridgeAuth
  const organizationId = req.omcBridgeAuth?.organizationId;

  if (!organizationId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const status = await checkRateLimit(organizationId);

    // Add rate limit headers
    res.setHeader("X-RateLimit-Limit-Minute", status.remaining.minute.toString());
    res.setHeader("X-RateLimit-Limit-Hour", status.remaining.hour.toString());
    res.setHeader("X-RateLimit-Remaining-Minute", status.remaining.minute.toString());
    res.setHeader("X-RateLimit-Remaining-Hour", status.remaining.hour.toString());
    res.setHeader("X-RateLimit-Reset-Minute", status.resetAt.minute.toISOString());
    res.setHeader("X-RateLimit-Reset-Hour", status.resetAt.hour.toISOString());

    if (!status.allowed) {
      logger.warn("Rate limit exceeded", {
        organizationId,
        remaining: status.remaining,
      });

      res.status(429).json({
        error: "Rate limit exceeded",
        remaining: status.remaining,
        resetAt: status.resetAt,
      });
      return;
    }

    // Increment usage after successful check
    await incrementUsage(organizationId);

    next();
  } catch (error) {
    logger.error(
      "Rate limit middleware error",
      { organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
    // On error, allow the request to proceed
    next();
  }
}

/**
 * Set custom rate limits for an organization
 */
export async function setRateLimitConfig(
  organizationId: string,
  config: RateLimitConfig
): Promise<void> {
  try {
    await redis.set(
      `rate_limit_config:${organizationId}`,
      JSON.stringify(config),
      86400 * 30 // Keep for 30 days (TTL in seconds)
    );

    logger.info("Custom rate limits set", { organizationId, config });
  } catch (error) {
    logger.error(
      "Failed to set rate limit config",
      { organizationId, config },
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

/**
 * Clear rate limit data for an organization (useful for testing or resets)
 */
export async function clearRateLimitData(organizationId: string): Promise<void> {
  try {
    const now = Date.now();
    const minuteKey = `rate_limit:minute:${organizationId}:${Math.floor(now / 60000)}`;
    const hourKey = `rate_limit:hour:${organizationId}:${Math.floor(now / 3600000)}`;

    await Promise.all([redis.del(minuteKey), redis.del(hourKey)]);

    logger.info("Rate limit data cleared", { organizationId });
  } catch (error) {
    logger.error(
      "Failed to clear rate limit data",
      { organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}
