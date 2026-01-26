import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authenticate } from "./middleware/auth.middleware";
import { authRateLimiter, apiRateLimiter } from "./middleware/rate-limiter.middleware";
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
import { sseRouter } from "./api/sse";
import { startWorkers, stopWorkers } from "./workers";
import { startSlackBot, stopSlackBot } from "./api/slack";
import { disconnectRedis } from "./db/redis";
import { db } from "./db/client";

console.log("🚀 Initializing Nubabel Platform...");
console.log(`📍 Node version: ${process.version}`);
console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`📍 Port: ${process.env.PORT || "3000"}`);

try {
  getEnv();
} catch (error) {
  console.error(String(error));
  process.exit(1);
}

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);

app.use(helmet());
app.use(
  cors({
    origin: process.env.BASE_URL || "http://localhost:3000",
    credentials: true,
  }),
);
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

app.use("/auth", authRateLimiter, authRoutes);

// Webhooks must be reachable without auth; signatures are verified in-route.
app.use("/api", apiRateLimiter, webhooksRouter);

app.use("/api", apiRateLimiter, slackOAuthRouter);

app.use("/api", apiRateLimiter, authenticate, workflowRoutes);
app.use("/api", apiRateLimiter, authenticate, notionRoutes);
app.use("/api", apiRateLimiter, authenticate, slackIntegrationRouter);
app.use("/api", apiRateLimiter, authenticate, featureFlagsRouter);
app.use("/api", apiRateLimiter, authenticate, featureFlagsAdminRouter);
app.use("/api", sseRouter);

app.use("/admin/queues", authenticate, bullBoardAdapter.getRouter());

app.get("/api/user", authenticate, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

console.log(`🌐 Starting server on 0.0.0.0:${port}...`);

const server = app.listen(port, "0.0.0.0", async () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✅ Base URL: ${process.env.BASE_URL || "http://localhost:3000"}`);
  console.log(`✅ Health check endpoint: /health`);
  console.log(`✅ SSE endpoint: /api/events`);
  console.log(`✅ Bull Board: /admin/queues`);
  console.log(`✅ Ready to accept connections`);

  await startWorkers();
  console.log(`✅ BullMQ workers started`);

  if (process.env.SLACK_ENABLED === "true") {
    try {
      await startSlackBot();
      console.log(`✅ Slack Bot started`);
    } catch (error) {
      console.error(`⚠️ Failed to start Slack Bot:`, error);
    }
  }
});

server.on("error", (error: any) => {
  console.error("❌ Server failed to start");
  console.error(`❌ Error code: ${error.code}`);
  console.error(`❌ Error message: ${error.message}`);
  console.error(`❌ Stack trace:`, error.stack);
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use`);
  }
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  await stopSlackBot();
  await stopWorkers();
  await disconnectRedis();
  await db.$disconnect();
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  await stopSlackBot();
  await stopWorkers();
  await disconnectRedis();
  await db.$disconnect();
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
