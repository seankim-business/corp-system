import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { getPoolStats } from "../db/redis";
import { getCacheStats } from "../services/query-cache";
import { queryMonitor } from "../services/query-monitor";
import { getDatabaseCircuitBreakerStats } from "../db/client";
import { getAllCircuitBreakers } from "../utils/circuit-breaker";

const router = Router();

// =============================================================================
// Types
// =============================================================================

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface ComponentHealth {
  status: HealthStatus;
  details: Record<string, unknown>;
  lastChecked: string;
}

interface DashboardResponse {
  overall: HealthStatus;
  uptime: number;
  timestamp: string;
  components: {
    api: ComponentHealth;
    memory: ComponentHealth;
    redis: ComponentHealth;
    cache: ComponentHealth;
    queries: ComponentHealth;
    circuitBreakers: ComponentHealth;
  };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/health
 * Quick health check - no auth required.
 */
router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/dashboard
 * Comprehensive health dashboard with component-level status.
 */
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const components = {
      api: checkApiHealth(),
      memory: checkMemoryHealth(),
      redis: checkRedisHealth(),
      cache: checkCacheHealth(),
      queries: checkQueryHealth(),
      circuitBreakers: checkCircuitBreakerHealth(),
    };

    const statuses = Object.values(components).map((c) => c.status);
    let overall: HealthStatus = "healthy";
    if (statuses.some((s) => s === "unhealthy")) {
      overall = "unhealthy";
    } else if (statuses.some((s) => s === "degraded")) {
      overall = "degraded";
    }

    const dashboard: DashboardResponse = {
      overall,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      components,
    };

    const statusCode = overall === "healthy" ? 200 : overall === "degraded" ? 200 : 503;
    res.status(statusCode).json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Health dashboard error", { error: message });
    res.status(500).json({
      overall: "unhealthy",
      error: "Failed to collect health data",
    });
  }
});

/**
 * GET /api/health/ready
 * Readiness probe for Kubernetes/Railway.
 */
router.get("/ready", async (_req: Request, res: Response) => {
  try {
    const redisHealth = checkRedisHealth();
    if (redisHealth.status === "unhealthy") {
      res.status(503).json({ ready: false, reason: "Redis unhealthy" });
      return;
    }
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false, reason: "Health check failed" });
  }
});

/**
 * GET /api/health/live
 * Liveness probe.
 */
router.get("/live", (_req: Request, res: Response) => {
  res.json({ alive: true, pid: process.pid });
});

// =============================================================================
// Component Health Checks
// =============================================================================

function checkApiHealth(): ComponentHealth {
  const uptime = process.uptime();
  return {
    status: "healthy",
    details: {
      uptime: Math.round(uptime),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
    lastChecked: new Date().toISOString(),
  };
}

function checkMemoryHealth(): ComponentHealth {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapUsagePercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  let status: HealthStatus = "healthy";
  if (heapUsagePercent > 95) {
    status = "unhealthy";
  } else if (heapUsagePercent > 85) {
    status = "degraded";
  }

  return {
    status,
    details: {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      heapUsagePercent,
      externalMB: Math.round(mem.external / 1024 / 1024),
    },
    lastChecked: new Date().toISOString(),
  };
}

function checkRedisHealth(): ComponentHealth {
  try {
    const stats = getPoolStats();

    const queueUtilization = stats.queue.total > 0
      ? Math.round((stats.queue.inUse / stats.queue.total) * 100)
      : 0;
    const workerUtilization = stats.worker.total > 0
      ? Math.round((stats.worker.inUse / stats.worker.total) * 100)
      : 0;

    let status: HealthStatus = "healthy";
    if (stats.queue.available === 0 || stats.worker.available === 0) {
      status = "degraded";
    }
    if (stats.queue.ready === 0 && stats.worker.ready === 0) {
      status = "unhealthy";
    }

    return {
      status,
      details: {
        queuePool: {
          total: stats.queue.total,
          available: stats.queue.available,
          inUse: stats.queue.inUse,
          ready: stats.queue.ready,
          utilization: `${queueUtilization}%`,
        },
        workerPool: {
          total: stats.worker.total,
          available: stats.worker.available,
          inUse: stats.worker.inUse,
          ready: stats.worker.ready,
          utilization: `${workerUtilization}%`,
        },
      },
      lastChecked: new Date().toISOString(),
    };
  } catch {
    return {
      status: "unhealthy",
      details: { error: "Cannot connect to Redis" },
      lastChecked: new Date().toISOString(),
    };
  }
}

function checkCacheHealth(): ComponentHealth {
  const stats = getCacheStats();

  let status: HealthStatus = "healthy";
  if (stats.totalRequests > 100 && stats.hitRate < 0.1) {
    status = "degraded"; // Very low hit rate
  }

  return {
    status,
    details: {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
      totalRequests: stats.totalRequests,
    },
    lastChecked: new Date().toISOString(),
  };
}

function checkQueryHealth(): ComponentHealth {
  const summary = queryMonitor.getSummary();

  let status: HealthStatus = "healthy";
  if (summary.slowQueryRate > 0.1) {
    status = "unhealthy"; // >10% slow queries
  } else if (summary.slowQueryRate > 0.05) {
    status = "degraded"; // >5% slow queries
  }

  return {
    status,
    details: {
      totalQueries: summary.totalQueries,
      slowQueries: summary.totalSlowQueries,
      slowQueryRate: `${(summary.slowQueryRate * 100).toFixed(2)}%`,
      uniqueOperations: summary.uniqueModelOperations,
      topSlowest: summary.topSlowest.slice(0, 5),
    },
    lastChecked: new Date().toISOString(),
  };
}

function checkCircuitBreakerHealth(): ComponentHealth {
  try {
    const dbStats = getDatabaseCircuitBreakerStats();
    const allBreakers = getAllCircuitBreakers();

    const breakerStates: Record<string, { state: string; failureCount: number; successCount: number }> = {};
    let hasOpenBreaker = false;

    for (const [name, breaker] of allBreakers) {
      const stats = breaker.getStats();
      breakerStates[name] = stats;
      if (stats.state === "OPEN") {
        hasOpenBreaker = true;
      }
    }

    // Also add the DB circuit breaker specifically
    breakerStates["postgresql"] = dbStats;
    if (dbStats.state === "OPEN") {
      hasOpenBreaker = true;
    }

    let status: HealthStatus = "healthy";
    if (hasOpenBreaker) {
      status = "unhealthy";
    } else if (Object.values(breakerStates).some(s => s.state === "HALF_OPEN")) {
      status = "degraded";
    }

    return {
      status,
      details: {
        breakers: breakerStates,
        totalBreakers: Object.keys(breakerStates).length,
        openBreakers: Object.values(breakerStates).filter(s => s.state === "OPEN").length,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      details: { error: error instanceof Error ? error.message : "Unknown error" },
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * GET /api/health/circuit-breakers
 * Get circuit breaker status for all breakers.
 */
router.get("/circuit-breakers", (_req: Request, res: Response) => {
  try {
    const dbStats = getDatabaseCircuitBreakerStats();
    const allBreakers = getAllCircuitBreakers();

    const breakers: Record<string, { state: string; failureCount: number; successCount: number }> = {};
    for (const [name, breaker] of allBreakers) {
      breakers[name] = breaker.getStats();
    }
    breakers["postgresql"] = dbStats;

    res.json({
      breakers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get circuit breaker status", { error });
    res.status(500).json({ error: "Failed to get circuit breaker status" });
  }
});

/**
 * POST /api/health/circuit-breakers/reset
 * Reset all circuit breakers (admin action).
 */
router.post("/circuit-breakers/reset", (req: Request, res: Response) => {
  try {
    const allBreakers = getAllCircuitBreakers();
    const resetBreakers: string[] = [];

    for (const [name, breaker] of allBreakers) {
      breaker.reset();
      resetBreakers.push(name);
      logger.info(`Circuit breaker ${name} reset via admin API`);
    }

    res.json({
      success: true,
      resetBreakers,
      message: `Reset ${resetBreakers.length} circuit breakers`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to reset circuit breakers", { error });
    res.status(500).json({ error: "Failed to reset circuit breakers" });
  }
});

export default router;
