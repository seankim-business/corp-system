import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { getRedisConnection, releaseRedisConnection } from "../db/redis";
import { logger } from "../utils/logger";

const router = Router();

const CACHE_TTL_SECONDS = 60;
const LOCK_TTL_MS = 10000;
const LOCK_RETRY_INTERVAL_MS = 50;
const MAX_LOCK_WAIT_MS = 5000;
const IN_MEMORY_CACHE_TTL_MS = 30000; // 30 seconds

interface DashboardStats {
  totalWorkflows: number;
  recentExecutions: number;
  successRate: number;
  activeIntegrations: string[];
  pendingApprovals: number;
}

interface CachedStats {
  data: DashboardStats;
  timestamp: number;
}

const inMemoryCache = new Map<string, CachedStats>();

async function getWithStampedeProtection(
  redis: any,
  cacheKey: string,
  computeFn: () => Promise<DashboardStats>,
): Promise<DashboardStats> {
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const lockKey = `${cacheKey}:lock`;
  const lockValue = `${process.pid}-${Date.now()}`;
  const acquired = await redis.set(lockKey, lockValue, "PX", LOCK_TTL_MS, "NX");

  if (acquired === "OK") {
    try {
      const stats = await computeFn();
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(stats));
      return stats;
    } finally {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, lockKey, lockValue);
    }
  }

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
    const cachedResult = await redis.get(cacheKey);
    if (cachedResult) {
      return JSON.parse(cachedResult);
    }
  }

  logger.warn("Stampede protection timeout, computing stats directly", { cacheKey });
  return computeFn();
}

router.get("/stats", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const cacheKey = `dashboard:stats:${organizationId}`;

    // Check in-memory cache first
    const cached = inMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < IN_MEMORY_CACHE_TTL_MS) {
      logger.debug("Dashboard stats served from in-memory cache", { organizationId });
      res.json(cached.data);
      return;
    }

    let redis = null;
    try {
      redis = await getRedisConnection();
      const stats = await getWithStampedeProtection(redis, cacheKey, () =>
        calculateDashboardStats(organizationId),
      );
      // Update in-memory cache
      inMemoryCache.set(cacheKey, { data: stats, timestamp: Date.now() });
      logger.debug("Dashboard stats served from Redis", { organizationId });
      res.json(stats);
      return;
    } catch (cacheError) {
      logger.warn("Redis cache operation failed, checking in-memory cache", {
        organizationId,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });

      // Fallback to in-memory cache even if expired
      if (cached) {
        logger.info("Serving stale in-memory cache due to Redis failure", {
          organizationId,
          age: Date.now() - cached.timestamp
        });
        res.json(cached.data);
        return;
      }
    }

    const stats = await calculateDashboardStats(organizationId);
    // Update in-memory cache
    inMemoryCache.set(cacheKey, { data: stats, timestamp: Date.now() });
    res.json(stats);
  } catch (error) {
    logger.error(
      "Dashboard stats endpoint error",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to fetch dashboard statistics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (res.locals.redis) {
      try {
        await releaseRedisConnection(res.locals.redis);
      } catch (e) {
        logger.warn("Failed to release Redis connection", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
});

async function calculateDashboardStats(organizationId: string): Promise<DashboardStats> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalWorkflows, recentExecutions, allExecutions, activeIntegrations, pendingApprovals] =
    await Promise.all([
      prisma.workflow.count({
        where: {
          organizationId,
        },
      }),

      prisma.workflowExecution.count({
        where: {
          workflow: {
            organizationId,
          },
          createdAt: {
            gte: twentyFourHoursAgo,
          },
        },
      }),

      prisma.workflowExecution.findMany({
        where: {
          workflow: {
            organizationId,
          },
          createdAt: {
            gte: twentyFourHoursAgo,
          },
        },
        select: {
          status: true,
        },
      }),

      prisma.mCPConnection.findMany({
        where: {
          organizationId,
          enabled: true,
        },
        select: {
          provider: true,
        },
        distinct: ["provider"],
      }),

      prisma.orchestratorExecution.count({
        where: {
          organizationId,
          status: "pending",
        },
      }),
    ]);

  let successRate = 0;
  if (allExecutions.length > 0) {
    const successCount = allExecutions.filter(
      (e: { status: string }) => e.status === "success",
    ).length;
    successRate = Math.round((successCount / allExecutions.length) * 100);
  }

  const integrationProviders = activeIntegrations.map(
    (conn: { provider: string }) => conn.provider,
  );

  return {
    totalWorkflows,
    recentExecutions,
    successRate,
    activeIntegrations: integrationProviders,
    pendingApprovals,
  };
}

export default router;
