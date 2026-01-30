import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface FeatureFlagEvaluation {
  enabled: boolean;
  source: "override" | "rule" | "global" | "default";
  flagKey: string;
}

interface CachedFlag {
  enabled: boolean;
  rules: CachedRule[];
}

interface CachedRule {
  type: string;
  organizationIds: string[];
  percentage: number;
  priority: number;
  enabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const CACHE_PREFIX = "ff:";
const OVERRIDE_PREFIX = "ff:override:";
const CACHE_TTL = 300; // 5 minutes

// =============================================================================
// Core Evaluation
// =============================================================================

/**
 * Check if a feature flag is enabled for a given organization.
 *
 * Evaluation order:
 * 1. Organization-specific override (Redis/DB)
 * 2. Rules (ALLOWLIST > BLOCKLIST > PERCENTAGE, by priority)
 * 3. Global enabled/disabled
 * 4. Default value (false)
 */
export async function isFeatureEnabled(
  flagKey: string,
  organizationId: string,
): Promise<boolean> {
  const result = await evaluateFlag(flagKey, organizationId);
  return result.enabled;
}

export async function evaluateFlag(
  flagKey: string,
  organizationId: string,
): Promise<FeatureFlagEvaluation> {
  // 1. Check organization override first (fastest path)
  const override = await getOverride(flagKey, organizationId);
  if (override !== null) {
    return { enabled: override, source: "override", flagKey };
  }

  // 2. Load flag with rules
  const flag = await getCachedFlag(flagKey);
  if (!flag) {
    return { enabled: false, source: "default", flagKey };
  }

  // 3. Global kill switch
  if (!flag.enabled) {
    return { enabled: false, source: "global", flagKey };
  }

  // 4. Evaluate rules by priority (lower number = higher priority)
  const sortedRules = [...flag.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const result = evaluateRule(rule, organizationId);
    if (result !== null) {
      return { enabled: result, source: "rule", flagKey };
    }
  }

  // 5. No rule matched, use global state
  return { enabled: flag.enabled, source: "global", flagKey };
}

function evaluateRule(rule: CachedRule, organizationId: string): boolean | null {
  switch (rule.type) {
    case "ALLOWLIST":
      if (rule.organizationIds.includes(organizationId)) {
        return true;
      }
      return null; // Not in list, continue

    case "BLOCKLIST":
      if (rule.organizationIds.includes(organizationId)) {
        return false;
      }
      return null;

    case "PERCENTAGE": {
      // Deterministic hash for consistent evaluation
      const hash = simpleHash(`${organizationId}:${rule.priority}`);
      const bucket = hash % 100;
      return bucket < rule.percentage;
    }

    default:
      logger.warn("Unknown feature flag rule type", { type: rule.type });
      return null;
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// =============================================================================
// Cache Layer
// =============================================================================

async function getCachedFlag(flagKey: string): Promise<CachedFlag | null> {
  const cacheKey = CACHE_PREFIX + flagKey;

  // Try Redis cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Cache corrupted, fall through to DB
    }
  }

  // Load from database
  const flag = await prisma.featureFlag.findUnique({
    where: { key: flagKey },
    include: {
      rules: {
        where: { enabled: true },
        orderBy: { priority: "asc" },
      },
    },
  });

  if (!flag) {
    return null;
  }

  const cachedFlag: CachedFlag = {
    enabled: flag.enabled,
    rules: flag.rules.map((r) => ({
      type: r.type,
      organizationIds: r.organizationIds,
      percentage: r.percentage,
      priority: r.priority,
      enabled: r.enabled,
    })),
  };

  // Cache in Redis
  await redis.set(cacheKey, JSON.stringify(cachedFlag), CACHE_TTL).catch((err) => {
    logger.warn("Failed to cache feature flag", { flagKey, error: String(err) });
  });

  return cachedFlag;
}

async function getOverride(flagKey: string, organizationId: string): Promise<boolean | null> {
  const cacheKey = `${OVERRIDE_PREFIX}${flagKey}:${organizationId}`;

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    if (cached === "null") return null; // Negative cache
    return cached === "1";
  }

  // Check DB for override
  const override = await prisma.featureFlagOverride.findFirst({
    where: {
      featureFlag: { key: flagKey },
      organizationId,
    },
  });

  if (!override) {
    // Cache null result too (negative cache)
    await redis.set(cacheKey, "null", CACHE_TTL).catch(() => {});
    return null;
  }

  const value = override.enabled;
  await redis.set(cacheKey, value ? "1" : "0", CACHE_TTL).catch(() => {});
  return value;
}

// =============================================================================
// Management Functions
// =============================================================================

export async function setOverride(
  flagKey: string,
  organizationId: string,
  enabled: boolean,
  userId: string,
): Promise<void> {
  const flag = await prisma.featureFlag.findUnique({ where: { key: flagKey } });
  if (!flag) {
    throw new Error(`Feature flag not found: ${flagKey}`);
  }

  await prisma.featureFlagOverride.upsert({
    where: {
      featureFlagId_organizationId: {
        featureFlagId: flag.id,
        organizationId,
      },
    },
    create: {
      featureFlagId: flag.id,
      organizationId,
      enabled,
    },
    update: { enabled },
  });

  // Log audit
  await prisma.featureFlagAuditLog.create({
    data: {
      featureFlagId: flag.id,
      userId,
      organizationId,
      action: "override_set",
      metadata: { enabled, flagKey },
    },
  });

  // Invalidate cache
  const cacheKey = `${OVERRIDE_PREFIX}${flagKey}:${organizationId}`;
  await redis.del(cacheKey);

  logger.info("Feature flag override set", { flagKey, organizationId, enabled, userId });
}

export async function clearOverride(
  flagKey: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  const flag = await prisma.featureFlag.findUnique({ where: { key: flagKey } });
  if (!flag) return;

  await prisma.featureFlagOverride.deleteMany({
    where: { featureFlagId: flag.id, organizationId },
  });

  await prisma.featureFlagAuditLog.create({
    data: {
      featureFlagId: flag.id,
      userId,
      organizationId,
      action: "override_cleared",
      metadata: { flagKey },
    },
  });

  const cacheKey = `${OVERRIDE_PREFIX}${flagKey}:${organizationId}`;
  await redis.del(cacheKey);

  logger.info("Feature flag override cleared", { flagKey, organizationId, userId });
}

export async function invalidateCache(flagKey: string): Promise<void> {
  const cacheKey = CACHE_PREFIX + flagKey;
  await redis.del(cacheKey);

  logger.debug("Feature flag cache invalidated", { flagKey });
}

export async function getAllFlags(): Promise<
  Array<{
    key: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ruleCount: number;
  }>
> {
  const flags = await prisma.featureFlag.findMany({
    include: { _count: { select: { rules: true } } },
    orderBy: { key: "asc" },
  });

  return flags.map((f) => ({
    key: f.key,
    name: f.name,
    description: f.description,
    enabled: f.enabled,
    ruleCount: f._count.rules,
  }));
}
