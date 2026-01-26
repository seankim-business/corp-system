import "dotenv/config";
import * as Sentry from "@sentry/node";
import { initSentry } from "./services/sentry";

// Initialize Sentry FIRST
initSentry();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authenticate } from "./middleware/auth.middleware";
import { correlationIdMiddleware } from "./middleware/correlation-id.middleware";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import {
  sentryErrorHandler,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryUserContext,
} from "./middleware/sentry.middleware";
import {
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
} from "./middleware/rate-limiter.middleware";
import { getAllCircuitBreakers } from "./utils/circuit-breaker";
import { getEnv } from "./utils/env";
import {
  getPoolStats,
  getQueueConnection,
  getWorkerConnection,
  releaseQueueConnection,
  releaseWorkerConnection,
  withQueueConnection,
} from "./db/redis";
import authRoutes from "./auth/auth.routes";
import workflowRoutes from "./api/workflows";
import notionRoutes from "./api/notion";
import { slackOAuthRouter, slackIntegrationRouter } from "./api/slack-integration";
import { featureFlagsAdminRouter, featureFlagsRouter } from "./api/feature-flags";
import { webhooksRouter } from "./api/webhooks";
import gdprRoutes from "./api/gdpr.routes";
import { serverAdapter as bullBoardAdapter } from "./queue/bull-board";
import { sseRouter, shutdownSSE } from "./api/sse";
import { startWorkers, gracefulShutdown as gracefulWorkerShutdown } from "./workers";
import { startSlackBot, stopSlackBot } from "./api/slack";
import { disconnectRedis } from "./db/redis";
import { db } from "./db/client";
import { shutdownOpenTelemetry } from "./instrumentation";
import { logger } from "./utils/logger";
import { calculateSLI, createMetricsRouter, getMcpCacheStats } from "./services/metrics";
import { errorHandler } from "./middleware/error-handler";

logger.info("Initializing Nubabel Platform", {
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || "development",
  port: process.env.PORT || "3000",
});

try {
  getEnv();
  logger.info("✅ Environment variables validated successfully");
} catch (error) {
  logger.error(
    "⚠️  Environment validation failed - server will start with limited functionality",
    {},
    error instanceof Error ? error : new Error(String(error)),
  );
  logger.warn("Server starting anyway to allow health checks and debugging");
}

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);

let activeRequests = 0;
let isShuttingDown = false;

app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

app.use(helmet());
app.use(
  cors({
    origin: process.env.BASE_URL || "http://localhost:3000",
    credentials: true,
  }),
);

// Correlation ID middleware - must be early to capture all requests
app.use(correlationIdMiddleware);

app.use((_req, res, next) => {
  if (isShuttingDown) {
    res.set("Connection", "close");
    return res.status(503).json({ error: "Server is shutting down" });
  }
  activeRequests++;
  res.on("finish", () => {
    activeRequests--;
  });
  return next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      const r = req as unknown as { rawBody?: Buffer };
      r.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(metricsMiddleware);
app.use(createMetricsRouter());

setInterval(() => {
  calculateSLI();
}, 60000);

// Health check endpoints (no auth required)
app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "live", timestamp: new Date().toISOString() });
});

app.get("/health/ready", async (_req, res) => {
  const queueRedis = await getQueueConnection();
  const workerRedis = await getWorkerConnection();

  try {
    await db.$queryRaw`SELECT 1`;
    await withQueueConnection((client) => client.ping() as Promise<any>);
    await Promise.all([queueRedis.ping(), workerRedis.ping()]);

    res.json({
      status: "ok",
      service: "ready",
      checks: { database: true, redis: true, queueRedis: true, workerRedis: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "ready",
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  } finally {
    releaseQueueConnection(queueRedis);
    releaseWorkerConnection(workerRedis);
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
      REDIS_URL: process.env.REDIS_URL ? "SET" : "MISSING",
      BASE_URL: process.env.BASE_URL || "NOT_SET",
    },
  });
});

if (process.env.NODE_ENV === "development") {
  app.get("/debug/sentry-test", (_req, _res) => {
    throw new Error("Sentry test error");
  });
}

app.get("/health/db", async (_req, res) => {
  try {
    const { db } = await import("./db/client");
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "database" });
  } catch (error) {
    res.status(503).json({ status: "error", service: "database", error: String(error) });
  }
});

app.get("/health/redis", async (_req, res) => {
  const redis = await getQueueConnection();

  try {
    const pingResult = await redis.ping();
    const info = await redis.info("server");
    const memoryInfo = await redis.info("memory");

    const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
    const memoryUsedMatch = memoryInfo.match(/used_memory_human:(.+)/);

    res.json({
      status: "ok",
      service: "redis",
      ping: pingResult,
      uptime: uptimeMatch ? parseInt(uptimeMatch[1]) : null,
      memoryUsed: memoryUsedMatch ? memoryUsedMatch[1].trim() : null,
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "redis",
      error: String(error),
    });
  } finally {
    releaseQueueConnection(redis);
  }
});

// Temporarily disabled - requires budget migration to be deployed
// app.get("/health/budget", async (_req, res) => {
//   try {
//     const organizations = await db.organization.findMany({
//       select: {
//         id: true,
//         name: true,
//         monthlyBudgetCents: true,
//         currentMonthSpendCents: true,
//         budgetResetAt: true,
//       },
//     });

//     const approaching = organizations
//       .filter((org) => org.monthlyBudgetCents != null)
//       .map((org) => {
//         const budgetCents = org.monthlyBudgetCents ?? 0;
//         const remainingCents = Math.max(0, budgetCents - org.currentMonthSpendCents);
//         const percentRemaining = budgetCents > 0 ? remainingCents / budgetCents : 0;

//         return {
//           organizationId: org.id,
//           name: org.name,
//           budgetCents,
//           spendCents: org.currentMonthSpendCents,
//           remainingCents,
//           percentRemaining,
//           budgetResetAt: org.budgetResetAt,
//         };
//       })
//       .filter((org) => org.percentRemaining < 0.1);

//     res.json({
//       status: "ok",
//       service: "budget",
//       thresholdPercent: 10,
//       organizations: approaching,
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error) {
//     res.status(503).json({
//       status: "error",
//       service: "budget",
//       error: String(error),
//       timestamp: new Date().toISOString(),
//     });
//   }
// });

app.get("/health/redis-pool", (_req, res) => {
  const stats = getPoolStats();
  const healthy = stats.queue.available > 0 && stats.worker.available > 0;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    pools: stats,
  });
});

app.get("/health/mcp-cache", (_req, res) => {
  const stats = getMcpCacheStats();
  const totals = stats.reduce(
    (acc, entry) => {
      acc.hits += entry.hits;
      acc.misses += entry.misses;
      acc.sizeBytes += entry.sizeBytes;
      return acc;
    },
    { hits: 0, misses: 0, sizeBytes: 0 },
  );

  const totalRequests = totals.hits + totals.misses;
  const hitRate = totalRequests === 0 ? 0 : totals.hits / totalRequests;
  const missRate = totalRequests === 0 ? 0 : totals.misses / totalRequests;

  res.json({
    status: "ok",
    service: "mcp-cache",
    totals: {
      hits: totals.hits,
      misses: totals.misses,
      hitRate,
      missRate,
      sizeBytes: totals.sizeBytes,
    },
    providers: stats.map((entry) => {
      const providerTotal = entry.hits + entry.misses;
      return {
        provider: entry.provider,
        hits: entry.hits,
        misses: entry.misses,
        hitRate: entry.hitRate,
        missRate: providerTotal === 0 ? 0 : entry.misses / providerTotal,
        sizeBytes: entry.sizeBytes,
      };
    }),
  });
});

app.get("/health/circuits", (_req, res) => {
  const breakers = getAllCircuitBreakers();
  const circuits: Record<string, any> = {};

  breakers.forEach((breaker, name) => {
    circuits[name] = breaker.getStats();
  });

  const hasOpenCircuit = Object.values(circuits).some((c: any) => c.state === "OPEN");

  res.status(hasOpenCircuit ? 503 : 200).json({
    status: hasOpenCircuit ? "degraded" : "ok",
    service: "circuit-breakers",
    circuits,
  });
});

// Root handler - helps identify which service is responding
app.get("/", (_req, res) => {
  res.json({
    service: "Nubabel Backend API",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      health: "/health",
      api: "/api",
      auth: "/auth",
      docs: "https://github.com/seankim-business/corp-system",
    },
    message: "This is the backend API server. For the web interface, visit app.nubabel.com",
  });
});

app.use("/auth", authRateLimiter, authRoutes);

app.use("/api", apiRateLimiter, webhooksRouter);

app.use("/api", apiRateLimiter, slackOAuthRouter);

app.use("/api", apiRateLimiter, authenticate, sentryUserContext, workflowRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, notionRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, slackIntegrationRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, featureFlagsRouter);
app.use(
  "/api",
  apiRateLimiter,
  authenticate,
  sentryUserContext,
  strictRateLimiter,
  featureFlagsAdminRouter,
);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, gdprRoutes);
app.use("/api", sseRouter);

app.use(
  "/admin/queues",
  authenticate,
  sentryUserContext,
  strictRateLimiter,
  bullBoardAdapter.getRouter(),
);

app.get("/api/user", authenticate, sentryUserContext, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

app.use(sentryErrorHandler());
app.use(errorHandler);

// Serve static files (production)
if (process.env.NODE_ENV === "production") {
  const path = require("path");
  const frontendPath = path.join(__dirname, "../frontend/dist");
  const landingPath = path.join(__dirname, "../landing");

  // Serve landing page for root domain (nubabel.com)
  app.use((req, res, next) => {
    const host = req.get("host") || "";

    // Root domain → landing page
    if (host === "nubabel.com" || host === "www.nubabel.com") {
      if (req.path === "/" || req.path === "/index.html") {
        return res.sendFile(path.join(landingPath, "index.html"));
      }
      // Serve landing static assets (images, etc.)
      return express.static(landingPath)(req, res, next);
    }

    // Subdomains (app.nubabel.com, auth.nubabel.com) → frontend app
    next();
  });

  // Serve frontend app static files
  app.use(express.static(frontendPath));

  // SPA fallback for frontend app (excluding API routes)
  app.use((req, res, next) => {
    if (
      !req.path.startsWith("/api") &&
      !req.path.startsWith("/health") &&
      !req.path.startsWith("/auth")
    ) {
      res.sendFile(path.join(frontendPath, "index.html"));
    } else {
      next();
    }
  });
}

logger.info("Starting server", { port, host: "0.0.0.0" });

const server = app.listen(port, "0.0.0.0", async () => {
  logger.info("✅ Server listening successfully", {
    port,
    environment: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
  });

  logger.info("Server ready - endpoints available", {
    endpoints: {
      health: "/health",
      sse: "/api/events",
      bullBoard: "/admin/queues",
    },
  });

  try {
    await startWorkers();
    logger.info("✅ BullMQ workers started");
  } catch (error) {
    logger.warn("⚠️  Failed to start BullMQ workers (continuing without background jobs)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await startSlackBot();
    logger.info("✅ Slack Bot started");
  } catch (error) {
    logger.warn("⚠️  Failed to start Slack Bot (continuing without Slack integration)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.on("error", (error: any) => {
  logger.error(
    "Server failed to start",
    {
      code: error.code,
      port: error.code === "EADDRINUSE" ? port : undefined,
    },
    error,
  );
  process.exit(1);
});

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.info("Shutdown already in progress");
    return;
  }

  logger.info("Starting graceful shutdown", { signal });
  isShuttingDown = true;

  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timeout (30s), forcing exit");
    process.exit(1);
  }, 30000);

  try {
    logger.info("Closing HTTP server (stop accepting new connections)");
    server.close();

    logger.info("Waiting for active requests to complete", { activeRequests, maxWait: 20000 });
    const maxWait = 20000;
    const startTime = Date.now();
    while (activeRequests > 0 && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (activeRequests > 0) {
      logger.warn("Some requests still active after timeout", { activeRequests });
    } else {
      logger.info("All requests completed");
    }

    logger.info("Closing SSE connections");
    await shutdownSSE();
    logger.info("SSE closed");

    logger.info("Stopping Slack Bot");
    await stopSlackBot();
    logger.info("Slack Bot stopped");

    logger.info("Stopping BullMQ workers");
    await gracefulWorkerShutdown(signal);
    logger.info("Workers stopped");

    logger.info("Closing Redis connections");
    await disconnectRedis();
    logger.info("Redis closed");

    logger.info("Flushing Sentry events");
    await Sentry.close(2000);
    logger.info("Sentry flushed");

    logger.info("Disconnecting Prisma");
    await db.$disconnect();
    logger.info("Prisma disconnected");

    logger.info("Shutting down OpenTelemetry");
    await shutdownOpenTelemetry();
    logger.info("OpenTelemetry shut down");

    clearTimeout(shutdownTimeout);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error(
      "Error during graceful shutdown",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason: String(reason), promise: String(promise) });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {}, error);
  process.exit(1);
});
