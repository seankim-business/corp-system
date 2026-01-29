// @ts-nocheck
import { ProviderName } from "../providers/ai-provider";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  tokensPerMinute: number;
  tokensPerDay: number;
}

interface RateLimitState {
  isLimited: boolean;
  retryAfterMs: number;
  reason?: string;
  currentUsage: {
    requestsThisMinute: number;
    requestsThisHour: number;
    tokensThisMinute: number;
    tokensThisDay: number;
  };
}

const PROVIDER_RATE_LIMITS: Record<ProviderName, RateLimitConfig> = {
  anthropic: {
    requestsPerMinute: 50,
    requestsPerHour: 1000,
    tokensPerMinute: 40000,
    tokensPerDay: 1000000,
  },
  openai: {
    requestsPerMinute: 60,
    requestsPerHour: 3500,
    tokensPerMinute: 90000,
    tokensPerDay: 2000000,
  },
  "google-ai": {
    requestsPerMinute: 60,
    requestsPerHour: 1500,
    tokensPerMinute: 32000,
    tokensPerDay: 1500000,
  },
  "github-models": {
    requestsPerMinute: 15,
    requestsPerHour: 150,
    tokensPerMinute: 8000,
    tokensPerDay: 150000,
  },
  openrouter: {
    requestsPerMinute: 100,
    requestsPerHour: 5000,
    tokensPerMinute: 100000,
    tokensPerDay: 5000000,
  },
};

const BACKOFF_BASE_MS = 1000;
const MAX_BACKOFF_MS = 60000;

function getRateLimitKey(
  organizationId: string,
  provider: ProviderName,
  type: "rpm" | "rph" | "tpm" | "tpd",
): string {
  return `ratelimit:${organizationId}:${provider}:${type}`;
}

function getBackoffKey(organizationId: string, provider: ProviderName): string {
  return `ratelimit:backoff:${organizationId}:${provider}`;
}

export async function checkRateLimit(
  organizationId: string,
  provider: ProviderName,
): Promise<RateLimitState> {
  const limits = PROVIDER_RATE_LIMITS[provider];
  if (!limits) {
    return {
      isLimited: false,
      retryAfterMs: 0,
      currentUsage: {
        requestsThisMinute: 0,
        requestsThisHour: 0,
        tokensThisMinute: 0,
        tokensThisDay: 0,
      },
    };
  }

  const backoffKey = getBackoffKey(organizationId, provider);
  const backoffUntil = await redis.get(backoffKey);

  if (backoffUntil) {
    const backoffMs = parseInt(backoffUntil, 10) - Date.now();
    if (backoffMs > 0) {
      return {
        isLimited: true,
        retryAfterMs: backoffMs,
        reason: "Provider rate limit backoff active",
        currentUsage: {
          requestsThisMinute: 0,
          requestsThisHour: 0,
          tokensThisMinute: 0,
          tokensThisDay: 0,
        },
      };
    }
  }

  const [rpm, rph, tpm, tpd] = await Promise.all([
    redis.get(getRateLimitKey(organizationId, provider, "rpm")),
    redis.get(getRateLimitKey(organizationId, provider, "rph")),
    redis.get(getRateLimitKey(organizationId, provider, "tpm")),
    redis.get(getRateLimitKey(organizationId, provider, "tpd")),
  ]);

  const currentUsage = {
    requestsThisMinute: parseInt(rpm || "0", 10),
    requestsThisHour: parseInt(rph || "0", 10),
    tokensThisMinute: parseInt(tpm || "0", 10),
    tokensThisDay: parseInt(tpd || "0", 10),
  };

  if (currentUsage.requestsThisMinute >= limits.requestsPerMinute) {
    return {
      isLimited: true,
      retryAfterMs: 60000,
      reason: "Requests per minute limit reached",
      currentUsage,
    };
  }

  if (currentUsage.requestsThisHour >= limits.requestsPerHour) {
    return {
      isLimited: true,
      retryAfterMs: 3600000,
      reason: "Requests per hour limit reached",
      currentUsage,
    };
  }

  if (currentUsage.tokensThisMinute >= limits.tokensPerMinute) {
    return {
      isLimited: true,
      retryAfterMs: 60000,
      reason: "Tokens per minute limit reached",
      currentUsage,
    };
  }

  if (currentUsage.tokensThisDay >= limits.tokensPerDay) {
    return {
      isLimited: true,
      retryAfterMs: 86400000,
      reason: "Tokens per day limit reached",
      currentUsage,
    };
  }

  return {
    isLimited: false,
    retryAfterMs: 0,
    currentUsage,
  };
}

export async function recordRequest(
  organizationId: string,
  provider: ProviderName,
  tokens: number = 0,
): Promise<void> {
  const minuteKey = getRateLimitKey(organizationId, provider, "rpm");
  const hourKey = getRateLimitKey(organizationId, provider, "rph");

  await Promise.all([
    redis.incr(minuteKey).then(() => redis.expire(minuteKey, 60)),
    redis.incr(hourKey).then(() => redis.expire(hourKey, 3600)),
  ]);

  if (tokens > 0) {
    const tpmKey = getRateLimitKey(organizationId, provider, "tpm");
    const tpdKey = getRateLimitKey(organizationId, provider, "tpd");

    const currentTpm = await redis.get(tpmKey);
    const currentTpd = await redis.get(tpdKey);

    await Promise.all([
      redis.set(tpmKey, String(parseInt(currentTpm || "0", 10) + tokens), 60),
      redis.set(tpdKey, String(parseInt(currentTpd || "0", 10) + tokens), 86400),
    ]);
  }

  logger.debug("Recorded rate limit usage", {
    organizationId,
    provider,
    tokens,
  });
}

export async function recordRateLimitError(
  organizationId: string,
  provider: ProviderName,
  retryAfterMs?: number,
): Promise<void> {
  const backoffKey = getBackoffKey(organizationId, provider);

  const currentBackoff = await redis.get(backoffKey);
  let backoffMs: number;

  if (currentBackoff) {
    const previousBackoff = parseInt(currentBackoff, 10) - Date.now();
    backoffMs = Math.min(previousBackoff * 2, MAX_BACKOFF_MS);
  } else {
    backoffMs = retryAfterMs || BACKOFF_BASE_MS;
  }

  const backoffUntil = Date.now() + backoffMs;
  const ttlSeconds = Math.ceil(backoffMs / 1000);
  await redis.set(backoffKey, backoffUntil.toString(), ttlSeconds);

  logger.warn("Rate limit hit, applying backoff", {
    organizationId,
    provider,
    backoffMs,
    backoffUntil: new Date(backoffUntil).toISOString(),
  });
}

export async function clearBackoff(organizationId: string, provider: ProviderName): Promise<void> {
  const backoffKey = getBackoffKey(organizationId, provider);
  await redis.del(backoffKey);
}

export async function getRateLimitStatus(
  organizationId: string,
  provider: ProviderName,
): Promise<{
  limits: RateLimitConfig;
  usage: RateLimitState["currentUsage"];
  percentUsed: {
    requestsPerMinute: number;
    requestsPerHour: number;
    tokensPerMinute: number;
    tokensPerDay: number;
  };
}> {
  const limits = PROVIDER_RATE_LIMITS[provider];
  const state = await checkRateLimit(organizationId, provider);

  return {
    limits,
    usage: state.currentUsage,
    percentUsed: {
      requestsPerMinute: (state.currentUsage.requestsThisMinute / limits.requestsPerMinute) * 100,
      requestsPerHour: (state.currentUsage.requestsThisHour / limits.requestsPerHour) * 100,
      tokensPerMinute: (state.currentUsage.tokensThisMinute / limits.tokensPerMinute) * 100,
      tokensPerDay: (state.currentUsage.tokensThisDay / limits.tokensPerDay) * 100,
    },
  };
}

export async function withRateLimit<T>(
  organizationId: string,
  provider: ProviderName,
  fn: () => Promise<T>,
  options: { estimatedTokens?: number; maxRetries?: number } = {},
): Promise<T> {
  const { estimatedTokens = 0, maxRetries = 3 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const state = await checkRateLimit(organizationId, provider);

    if (state.isLimited) {
      logger.info("Rate limited, waiting before retry", {
        organizationId,
        provider,
        attempt,
        retryAfterMs: state.retryAfterMs,
        reason: state.reason,
      });

      if (attempt < maxRetries - 1) {
        const waitMs = Math.min(state.retryAfterMs, 30000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw new Error(`Rate limit exceeded for ${provider}: ${state.reason}`);
    }

    try {
      const result = await fn();
      await recordRequest(organizationId, provider, estimatedTokens);
      await clearBackoff(organizationId, provider);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRateLimitError =
        lastError.message.includes("429") ||
        lastError.message.toLowerCase().includes("rate limit") ||
        lastError.message.toLowerCase().includes("too many requests");

      if (isRateLimitError) {
        const retryAfterMatch = lastError.message.match(/retry.after[:\s]*(\d+)/i);
        const retryAfterMs = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : undefined;

        await recordRateLimitError(organizationId, provider, retryAfterMs);

        if (attempt < maxRetries - 1) {
          const backoff = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Rate limit retry exhausted");
}

export { PROVIDER_RATE_LIMITS };
