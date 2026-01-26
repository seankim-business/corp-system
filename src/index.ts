import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authenticate } from "./middleware/auth.middleware";
import {
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
} from "./middleware/rate-limiter.middleware";
import { getAllCircuitBreakers } from "./utils/circuit-breaker";
import { getEnv } from "./utils/env";
import { getRedisClient } from "./db/redis";
import { getRedisConnection } from "./queue/base.queue";
import authRoutes from "./auth/auth.routes";
import workflowRoutes from "./api/workflows";
import notionRoutes from "./api/notion";
import { slackOAuthRouter, slackIntegrationRouter } from "./api/slack-integration";
import { featureFlagsAdminRouter, featureFlagsRouter } from "./api/feature-flags";
import { webhooksRouter } from "./api/webhooks";
import { serverAdapter as bullBoardAdapter } from "./queue/bull-board";
import { sseRouter, shutdownSSE } from "./api/sse";
import { startWorkers, stopWorkers } from "./workers";
import { startSlackBot, stopSlackBot } from "./api/slack";
import { disconnectRedis } from "./db/redis";
import { db } from "./db/client";
import { shutdownOpenTelemetry } from "./instrumentation";
import { logger } from "./utils/logger";

logger.info("Initializing Nubabel Platform", {
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || "development",
  port: process.env.PORT || "3000",
});

try {
  getEnv();
} catch (error) {
  logger.error(
    "Environment validation failed",
    {},
    error instanceof Error ? error : new Error(String(error)),
  );
  process.exit(1);
}

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);

let activeRequests = 0;
let isShuttingDown = false;

app.use(helmet());
app.use(
  cors({
    origin: process.env.BASE_URL || "http://localhost:3000",
    credentials: true,
  }),
);

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

// Health check endpoints (no auth required)
app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "live", timestamp: new Date().toISOString() });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    const redisClient = await getRedisClient();
    await redisClient.ping();
    const bullRedis = getRedisConnection();
    await bullRedis.ping();

    res.json({
      status: "ok",
      service: "ready",
      checks: { database: true, redis: true, bullmqRedis: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "ready",
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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
  try {
    const { getRedisConnection } = await import("./queue/base.queue");
    const redis = getRedisConnection();

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
  }
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

app.use("/api", apiRateLimiter, authenticate, workflowRoutes);
app.use("/api", apiRateLimiter, authenticate, notionRoutes);
app.use("/api", apiRateLimiter, authenticate, slackIntegrationRouter);
app.use("/api", apiRateLimiter, authenticate, featureFlagsRouter);
app.use("/api", apiRateLimiter, authenticate, strictRateLimiter, featureFlagsAdminRouter);
app.use("/api", sseRouter);

app.use("/admin/queues", authenticate, strictRateLimiter, bullBoardAdapter.getRouter());

app.get("/api/user", authenticate, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Internal server error", { message: err.message }, err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Serve frontend static files (production)
if (process.env.NODE_ENV === "production") {
  const path = require("path");
  const frontendPath = path.join(__dirname, "../frontend/dist");
  
  app.use(express.static(frontendPath));
  
  // SPA fallback - send index.html for all non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

logger.info("Starting server", { port, host: "0.0.0.0" });

const server = app.listen(port, "0.0.0.0", async () => {
  logger.info("Server ready", {
    port,
    environment: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
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
    await stopWorkers();
    logger.info("Workers stopped");

    logger.info("Closing Redis connections");
    await disconnectRedis();
    logger.info("Redis closed");

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
