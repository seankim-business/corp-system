import crypto from "crypto";
import { db as prisma } from "../db/client";
import { withQueueConnection } from "../db/redis";

type FlagReason =
  | "KILL_SWITCH"
  | "OVERRIDE"
  | "RULE_ALLOWLIST"
  | "RULE_BLOCKLIST"
  | "RULE_PERCENTAGE"
  | "DEFAULT";

function percentageBucket(key: string, organizationId: string): number {
  const hash = crypto.createHash("sha256").update(`${organizationId}:${key}`).digest("hex");
  const hashInt = parseInt(hash.slice(0, 8), 16);
  return hashInt % 100000;
}

function inRollout(key: string, organizationId: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const threshold = percentage * 1000;
  return percentageBucket(key, organizationId) < threshold;
}

async function audit(
  featureFlagId: string,
  action: string,
  params: { organizationId?: string; userId?: string; metadata?: unknown },
) {
  // Keep audit logging lightweight. If DB is unavailable, we don't block evaluation.
  try {
    await prisma.featureFlagAuditLog.create({
      data: {
        featureFlagId,
        action,
        organizationId: params.organizationId,
        userId: params.userId,
        metadata: params.metadata as any,
      },
    });
  } catch {
    // Intentionally ignore
  }
}

export async function evaluateFeatureFlag(params: {
  key: string;
  organizationId: string;
  userId?: string;
}): Promise<{ enabled: boolean; reason: FlagReason }> {
  const cacheKey = `ff:eval:${params.organizationId}:${params.key}`;

  const cached = await withQueueConnection((redis) => redis.get(cacheKey));
  if (cached) {
    return JSON.parse(cached) as { enabled: boolean; reason: FlagReason };
  }

  const flag = await prisma.featureFlag.findUnique({
    where: { key: params.key },
    include: {
      rules: true,
      overrides: {
        where: { organizationId: params.organizationId },
      },
    },
  });

  if (!flag || !flag.enabled) {
    if (flag) {
      await audit(flag.id, "EVALUATED", {
        organizationId: params.organizationId,
        userId: params.userId,
        metadata: { key: params.key, result: false, reason: "KILL_SWITCH" },
      });
    }
    const value = { enabled: false as const, reason: "KILL_SWITCH" as const };
    await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
    return value;
  }

  const override = flag.overrides[0];
  if (override && (!override.expiresAt || override.expiresAt > new Date())) {
    const value = { enabled: override.enabled, reason: "OVERRIDE" as const };
    await audit(flag.id, "EVALUATED", {
      organizationId: params.organizationId,
      userId: params.userId,
      metadata: { key: params.key, result: value.enabled, reason: value.reason },
    });
    await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
    return value;
  }

  const rules = [...flag.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === "ALLOWLIST") {
      if (rule.organizationIds.includes(params.organizationId)) {
        const value = { enabled: true as const, reason: "RULE_ALLOWLIST" as const };
        await audit(flag.id, "EVALUATED", {
          organizationId: params.organizationId,
          userId: params.userId,
          metadata: { key: params.key, result: true, reason: value.reason },
        });
        await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
        return value;
      }
      continue;
    }

    if (rule.type === "BLOCKLIST") {
      if (rule.organizationIds.includes(params.organizationId)) {
        const value = { enabled: false as const, reason: "RULE_BLOCKLIST" as const };
        await audit(flag.id, "EVALUATED", {
          organizationId: params.organizationId,
          userId: params.userId,
          metadata: { key: params.key, result: false, reason: value.reason },
        });
        await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
        return value;
      }
      continue;
    }

    if (rule.type === "PERCENTAGE") {
      const enabled = inRollout(flag.key, params.organizationId, rule.percentage);
      const value = { enabled, reason: "RULE_PERCENTAGE" as const };
      await audit(flag.id, "EVALUATED", {
        organizationId: params.organizationId,
        userId: params.userId,
        metadata: { key: params.key, result: enabled, reason: value.reason, pct: rule.percentage },
      });
      await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
      return value;
    }
  }

  const value = { enabled: false as const, reason: "DEFAULT" as const };
  await audit(flag.id, "EVALUATED", {
    organizationId: params.organizationId,
    userId: params.userId,
    metadata: { key: params.key, result: false, reason: value.reason },
  });
  await withQueueConnection((redis) => redis.set(cacheKey, JSON.stringify(value), "EX", 30));
  return value;
}

export async function invalidateFeatureFlagCache(key: string) {
  await withQueueConnection(async (redis) => {
    const keys = await redis.keys(`ff:eval:*:${key}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });
}
