import "dotenv/config";
import * as path from "path";
import * as Sentry from "@sentry/node";
import { initSentry } from "./services/sentry";

// Initialize Sentry FIRST
initSentry();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authenticate, authenticateOptional } from "./middleware/auth.middleware";
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
  webhookRateLimiter,
  sidecarRateLimiter,
} from "./middleware/rate-limiter.middleware";
import { getAllCircuitBreakers, getCircuitBreaker } from "./utils/circuit-breaker";
import { getEnv } from "./utils/env";
import { startScheduledTasks, stopScheduledTasks } from "./utils/scheduler";
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
// import n8nRoutes from "./api/n8n"; // TODO: Fix TypeScript errors in n8n.ts
import { slackOAuthRouter, slackIntegrationRouter } from "./api/slack-integration";
import { googleAiOAuthRouter } from "./api/google-ai-oauth";
import notionOAuthRoutes from "./api/notion-oauth";
// import { githubModelsOAuthRouter } from "./api/github-models-oauth";
// import { providersRouter } from "./api/providers";
import { organizationSettingsRouter } from "./api/organization-settings";
import { featureFlagsAdminRouter, featureFlagsRouter } from "./api/feature-flags";
import { webhooksRouter } from "./api/webhooks";
import { emailWebhooksRouter } from "./api/email-webhooks";
import { sidecarCallbacksRouter } from "./api/sidecar-callbacks";
import gdprRoutes from "./api/gdpr.routes";
import dashboardRoutes from "./api/dashboard";
import membersRoutes from "./api/members";
import approvalsRoutes from "./api/approvals";
import okrRoutes from "./api/okr";
import orgChangesRoutes from "./api/org-changes";
import searchRoutes from "./api/search";
import driveRoutes from "./api/drive";
import googleCalendarRoutes from "./api/google-calendar";
import githubRoutes from "./api/github";
import githubSsotRoutes from "./api/github-ssot";
import sopRoutes from "./api/sop";
// import sopsRoutes from "./api/sops";
// import sopEditorRoutes from "./api/sop-editor";
import sopGeneratorRoutes from "./api/sop-generator";
import dailyBriefingRoutes from "./api/daily-briefing";
import schedulesRoutes from "./api/schedules";
import marketplaceHubRoutes from "./api/marketplace-hub";
import marketplaceRoutes from "./api/marketplace";
// import taskPrioritizationRoutes from "./api/task-prioritization";
import syncRoutes from "./api/sync";
import delegationRoutes from "./api/delegations";
import agentMetricsRoutes from "./api/agent-metrics";
// import agentHierarchyRoutes from "./api/agent-hierarchy";
// import agentActivityRoutes from "./api/agent-activity";
import regionsRoutes from "./api/regions";
// AR (Agent Resource) Management routes
import arDepartmentsRoutes from "./ar/api/ar-departments";
import arPositionsRoutes from "./ar/api/ar-positions";
import arAssignmentsRoutes from "./ar/api/ar-assignments";
import arCoordinationRoutes from "./ar/api/ar-coordination";
import arAnalyticsRoutes from "./ar/api/ar-analytics";
import slackArCommandsRouter from "./api/slack-ar-commands";
import identityRoutes from "./api/identity";
import memberInviteRoutes from "./api/member-invite";
import resourceRegistryRoutes from "./api/resource-registry";
import featureRequestsRoutes from "./api/feature-requests";
import { notionWebhooksRouter } from "./api/notion-webhooks";
import codeOpsRoutes from "./api/code-ops";
// import agentSessionsRoutes from "./api/agent-sessions";
import costsRoutes from "./api/costs";
// import onboardingRoutes from "./api/onboarding";
// import errorManagementRoutes from "./api/error-management";
// import agentAdminRoutes from "./api/agent-admin";
// import optimizationRoutes from "./api/optimization";
import patternsRoutes from "./api/patterns";
import feedbackRoutes from "./api/feedback";
import memoryRoutes from "./api/memory";
import knowledgeGraphRoutes from "./api/knowledge-graph";
// import ragRoutes from "./api/rag";
// import alertsRoutes from "./api/alerts";
import analyticsRoutes from "./api/analytics";
// import metaAgentRoutes from "./api/meta-agent";
// import billingRoutes from "./api/billing";
// import stripeWebhookRoutes from "./api/stripe-webhook";
// import v1ApiRouter from "./api/v1";
import { serverAdapter as bullBoardAdapter } from "./queue/bull-board";
import { sseRouter, shutdownSSE } from "./api/sse";
import { shutdownAgentActivityService } from "./services/monitoring";
// import { conversationsRouter } from "./api/conversations";
import { startWorkers, gracefulShutdown as gracefulWorkerShutdown } from "./workers";
import { startSlackBot, stopSlackBot } from "./api/slack";
import { initializeSlackAlerts } from "./services/slack-anthropic-alerts";
import { disconnectRedis } from "./db/redis";
import { db } from "./db/client";
import { shutdownOpenTelemetry } from "./instrumentation";
import { logger } from "./utils/logger";
import { calculateSLI, createMetricsRouter, getMcpCacheStats } from "./services/metrics";
import { adminRouter } from "./admin";
import { claudeMaxAccountsRouter } from "./api/claude-max-accounts";
import { claudeConnectRouter, claudeConnectPublicRouter } from "./api/claude-connect";
// NOTE: accounts.routes.ts removed - functionality migrated to user.routes.ts
import { errorHandler } from "./middleware/error-handler";
import { csrfProtection } from "./middleware/csrf.middleware";
import healthDashboardRouter from "./api/health-dashboard";
import healthAnthropicRouter from "./api/health-anthropic";
import mcpServersRouter from "./api/mcp-servers";

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

// Configure helmet with explicit CSP to allow cross-subdomain API calls
// See: docs/troubleshooting/AUTH_REDIRECT_LOOP.md#issue-5
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://auth.nubabel.com",
          "https://*.nubabel.com",
          "wss://*.nubabel.com",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://static.cloudflareinsights.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        frameSrc: ["'self'", "https://accounts.google.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

// CORS: Allow requests from all nubabel.com subdomains
const allowedOrigins = [
  process.env.BASE_URL || "http://localhost:3000",
  process.env.FRONTEND_URL || "https://app.nubabel.com",
  "https://nubabel.com",
  "https://www.nubabel.com",
  "https://app.nubabel.com",
  "https://auth.nubabel.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow all *.nubabel.com subdomains
      if (origin.endsWith(".nubabel.com") || origin === "https://nubabel.com") {
        return callback(null, true);
      }

      // Allow explicitly listed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Development: allow localhost
      if (origin.includes("localhost")) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
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
app.use(csrfProtection);
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
      FRONTEND_URL: process.env.FRONTEND_URL || "NOT_SET",
    },
  });
});

app.use("/health", healthDashboardRouter);
app.use("/health", healthAnthropicRouter);

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

app.post("/health/circuits/reset", (req, res) => {
  const { name } = req.body || {};
  const breakers = getAllCircuitBreakers();

  if (name) {
    const breaker = breakers.get(name);
    if (!breaker) {
      return res.status(404).json({ error: `Circuit breaker '${name}' not found` });
    }
    breaker.reset();
    logger.info(`Circuit breaker '${name}' reset manually`);
    return res.json({ success: true, message: `Circuit breaker '${name}' has been reset` });
  }

  breakers.forEach((breaker, breakerName) => {
    breaker.reset();
    logger.info(`Circuit breaker '${breakerName}' reset manually`);
  });

  return res.json({
    success: true,
    message: `All ${breakers.size} circuit breakers have been reset`,
  });
});

/**
 * POST /health/reset-all
 * Manual reset endpoint for all circuit breakers, including postgresql.
 * This endpoint explicitly resets the postgresql circuit breaker along with all others.
 */
app.post("/health/reset-all", (_req, res) => {
  try {
    const allBreakers = getAllCircuitBreakers();
    const resetBreakers: string[] = [];

    // Reset all circuit breakers in the registry
    for (const [name, breaker] of allBreakers) {
      breaker.reset();
      resetBreakers.push(name);
      logger.info(`Circuit breaker ${name} reset via reset-all endpoint`);
    }

    // Explicitly reset the postgresql circuit breaker
    const postgresqlBreaker = getCircuitBreaker("postgresql");
    postgresqlBreaker.reset();
    if (!resetBreakers.includes("postgresql")) {
      resetBreakers.push("postgresql");
    }
    logger.info("PostgreSQL circuit breaker explicitly reset via reset-all endpoint");

    res.json({
      success: true,
      resetBreakers,
      message: `Successfully reset ${resetBreakers.length} circuit breakers`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to reset circuit breakers via reset-all", { error });
    res.status(500).json({
      success: false,
      error: "Failed to reset circuit breakers",
    });
  }
});

/**
 * POST /health/sync-slack-users
 * TEMPORARY: One-time sync endpoint for Slack users to ExternalIdentity
 * Bypasses auth for emergency fix - remove after use
 */
app.post("/health/sync-slack-users", async (_req, res) => {
  try {
    const { db } = await import("./db/client");
    const { WebClient } = await import("@slack/web-api");

    logger.info("Starting emergency Slack user sync via health endpoint");

    // Find all organizations with Slack integrations and try each one
    const orgs = await db.organization.findMany({
      where: { slackIntegrations: { some: { enabled: true } } },
      include: { slackIntegrations: true },
    });

    if (!orgs.length) {
      return res.status(404).json({ error: "No organization with Slack integration" });
    }

    // Use environment variable token as fallback (more reliable)
    const envBotToken = process.env.SLACK_BOT_TOKEN;
    let org = orgs[0]; // Use first org with Slack
    let integration = org.slackIntegrations.find((i: any) => i.enabled);
    let botToken = envBotToken || integration?.botToken;

    if (!botToken) {
      return res.status(404).json({ error: "No Slack bot token found" });
    }

    // Verify token works
    try {
      const testClient = new WebClient(botToken);
      await testClient.auth.test();
      logger.info("Using Slack token", { source: envBotToken ? "env" : "db", orgId: org.id });
    } catch (e) {
      // If env token fails, try DB token
      if (envBotToken && integration?.botToken && integration.botToken !== envBotToken) {
        try {
          const testClient2 = new WebClient(integration.botToken);
          await testClient2.auth.test();
          botToken = integration.botToken;
          logger.info("Using DB Slack token after env token failed", { orgId: org.id });
        } catch (e2) {
          return res.status(500).json({ error: "All Slack tokens invalid" });
        }
      } else {
        return res.status(500).json({ error: "Slack token invalid" });
      }
    }

    const slack = new WebClient(botToken);
    const workspaceId = integration?.workspaceId || "T03KC04T1GT"; // Kyndof workspace ID fallback

    let cursor: string | undefined;
    const members: any[] = [];
    do {
      const r = await slack.users.list({ cursor, limit: 200 });
      members.push(...(r.members || []));
      cursor = r.response_metadata?.next_cursor;
    } while (cursor);

    const stats = { total: members.length, synced: 0, skipped: 0, errors: 0 };

    for (const m of members) {
      if (m.is_bot || m.deleted || m.id === "USLACKBOT") {
        stats.skipped++;
        continue;
      }

      const p = m.profile || {};
      const email = p.email;
      const name = p.display_name || p.real_name || m.name;

      try {
        const existing = await db.slackUser.findUnique({ where: { slackUserId: m.id } });
        let userId: string;

        if (existing) {
          await db.slackUser.update({ where: { slackUserId: m.id }, data: { lastSyncedAt: new Date() } });
          userId = existing.userId;
        } else {
          let user = email ? await db.user.findUnique({ where: { email } }) : null;
          if (!user) {
            user = await db.user.create({
              data: { email: email || `slack+${m.id}@placeholder.nubabel.com`, displayName: name },
            });
          }
          userId = user.id;
          await db.slackUser.create({
            data: {
              slackUserId: m.id,
              slackTeamId: workspaceId!,
              userId,
              organizationId: org.id,
              displayName: name,
              email,
              lastSyncedAt: new Date(),
            },
          });
        }

        const extId = await db.externalIdentity.findFirst({
          where: { organizationId: org.id, provider: "slack", providerUserId: m.id },
        });
        if (!extId) {
          await db.externalIdentity.create({
            data: {
              organizationId: org.id,
              provider: "slack",
              providerUserId: m.id,
              providerTeamId: workspaceId,
              email,
              displayName: name,
              status: "linked",
              userId,
              autoLinkedAt: new Date(),
              autoLinkMethod: "health_sync",
            },
          });
        }

        const mem = await db.membership.findUnique({
          where: { organizationId_userId: { organizationId: org.id, userId } },
        });
        if (!mem) {
          await db.membership.create({ data: { organizationId: org.id, userId, role: "member" } });
        }

        stats.synced++;
      } catch (e) {
        stats.errors++;
        logger.error(`Failed to sync Slack user ${m.name}`, { error: e });
      }
    }

    logger.info("Emergency Slack user sync completed", stats);
    res.json({ success: true, stats, message: "Slack users synced successfully" });
  } catch (error) {
    logger.error("Failed to sync Slack users", { error });
    res.status(500).json({ success: false, error: "Failed to sync Slack users" });
  }
});

app.use("/auth", authRateLimiter, authRoutes);

app.use("/api", webhookRateLimiter, webhooksRouter);
app.use("/webhooks/email", webhookRateLimiter, emailWebhooksRouter);
app.use("/api/sidecar", sidecarRateLimiter, sidecarCallbacksRouter);
app.use("/api", webhookRateLimiter, syncRoutes);

app.use("/api", apiRateLimiter, slackOAuthRouter);
app.use("/api/slack/ar", webhookRateLimiter, slackArCommandsRouter);
app.use("/api", apiRateLimiter, googleAiOAuthRouter);
app.use("/api", apiRateLimiter, authenticateOptional, notionOAuthRoutes);
// app.use("/api", apiRateLimiter, githubModelsOAuthRouter);

// app.use("/api", apiRateLimiter, authenticate, sentryUserContext, providersRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, workflowRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, notionRoutes);
// app.use("/api/n8n", apiRateLimiter, authenticate, sentryUserContext, n8nRoutes);
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
app.use("/api/dashboard", apiRateLimiter, authenticate, sentryUserContext, dashboardRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, membersRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, approvalsRoutes);
app.use("/api/okr", apiRateLimiter, authenticate, sentryUserContext, okrRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, orgChangesRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, searchRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, driveRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, googleCalendarRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, githubRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, githubSsotRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, sopRoutes);
// app.use("/api/sops", apiRateLimiter, authenticate, sentryUserContext, sopsRoutes);
// app.use("/api/sops", apiRateLimiter, authenticate, sentryUserContext, sopEditorRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, sopGeneratorRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, dailyBriefingRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, schedulesRoutes);
// app.use("/api", apiRateLimiter, authenticate, sentryUserContext, taskPrioritizationRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, organizationSettingsRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, delegationRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, agentMetricsRoutes);
// app.use("/api/agents", apiRateLimiter, authenticate, sentryUserContext, agentHierarchyRoutes);
// app.use("/api/agent-activity", apiRateLimiter, authenticate, sentryUserContext, agentActivityRoutes);
app.use("/api/regions", apiRateLimiter, authenticate, sentryUserContext, regionsRoutes);
// AR (Agent Resource) Management routes
app.use("/api/ar/departments", apiRateLimiter, authenticate, sentryUserContext, arDepartmentsRoutes);
app.use("/api/ar/positions", apiRateLimiter, authenticate, sentryUserContext, arPositionsRoutes);
app.use("/api/ar/assignments", apiRateLimiter, authenticate, sentryUserContext, arAssignmentsRoutes);
app.use("/api/ar/coordination", apiRateLimiter, authenticate, sentryUserContext, arCoordinationRoutes);
app.use("/api/ar/analytics", apiRateLimiter, authenticate, sentryUserContext, arAnalyticsRoutes);
// Identity linking routes
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, identityRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, memberInviteRoutes);
app.use("/api/resource-registry", apiRateLimiter, authenticate, sentryUserContext, resourceRegistryRoutes);
app.use("/api/feature-requests", apiRateLimiter, authenticate, sentryUserContext, featureRequestsRoutes);
app.use("/api/code-operations", apiRateLimiter, authenticate, sentryUserContext, codeOpsRoutes);
app.use("/api", webhookRateLimiter, notionWebhooksRouter);
// app.use("/api/agent", apiRateLimiter, authenticate, sentryUserContext, agentSessionsRoutes);
// app.use("/api/admin", apiRateLimiter, authenticate, sentryUserContext, agentAdminRoutes);
app.use("/api/admin", apiRateLimiter, authenticate, sentryUserContext, adminRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, claudeMaxAccountsRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, claudeConnectRouter);
// Public endpoint for receiving tokens from claude.ai (no auth required)
app.use("/api", webhookRateLimiter, claudeConnectPublicRouter);
// app.use("/api/admin/accounts", apiRateLimiter, authenticate, sentryUserContext, accountsRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, costsRoutes);
// app.use("/api/optimization", apiRateLimiter, authenticate, sentryUserContext, optimizationRoutes);
// app.use("/api", apiRateLimiter, authenticate, sentryUserContext, conversationsRouter);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, feedbackRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, patternsRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, memoryRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, knowledgeGraphRoutes);
// app.use("/api/rag", apiRateLimiter, authenticate, sentryUserContext, ragRoutes);
// app.use("/api/alerts", apiRateLimiter, authenticate, sentryUserContext, alertsRoutes);
app.use("/api", apiRateLimiter, authenticate, sentryUserContext, analyticsRoutes);
// app.use("/api/meta-agent", apiRateLimiter, authenticate, sentryUserContext, metaAgentRoutes);
// app.use("/api", apiRateLimiter, authenticate, sentryUserContext, onboardingRoutes);
// app.use("/api/billing", apiRateLimiter, authenticate, sentryUserContext, billingRoutes);
// app.use("/api/webhooks/stripe", webhookRateLimiter, stripeWebhookRoutes);
app.use("/api", sseRouter);
app.use(
  "/api/marketplace-hub",
  apiRateLimiter,
  authenticate,
  sentryUserContext,
  marketplaceHubRoutes,
);
app.use(
  "/api/marketplace",
  apiRateLimiter,
  authenticate,
  sentryUserContext,
  marketplaceRoutes,
);
app.use(
  "/api/mcp",
  apiRateLimiter,
  authenticate,
  sentryUserContext,
  mcpServersRouter,
);

// Public API v1 (external developer access with API key auth)
// app.use("/api/v1", v1ApiRouter);

app.use(
  "/admin/queues",
  authenticate,
  sentryUserContext,
  strictRateLimiter,
  bullBoardAdapter.getRouter(),
);

// app.use(
//   "/admin/errors",
//   apiRateLimiter,
//   authenticate,
//   sentryUserContext,
//   strictRateLimiter,
//   errorManagementRoutes,
// );

app.get("/api/user", authenticate, sentryUserContext, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

app.get("/api/user/profile", authenticate, sentryUserContext, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await db.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({
    id: user.id,
    email: user.email,
    name: user.displayName || user.email?.split("@")[0] || "User",
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    organization: req.organization
      ? {
          id: req.organization.id,
          name: req.organization.name,
          slug: req.organization.slug,
        }
      : null,
    membership: req.membership
      ? {
          role: req.membership.role,
          joinedAt: req.membership.createdAt,
        }
      : null,
  });
});

app.use(sentryErrorHandler());
app.use(errorHandler);

// Serve static files (production)
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend/dist");
  const landingPath = path.join(__dirname, "../landing");

  app.use((req, res, next) => {
    const host = req.get("host") || "";

    // Root domain → landing page
    if (host === "nubabel.com" || host === "www.nubabel.com") {
      if (req.path === "/" || req.path === "/index.html") {
        return res.sendFile(path.join(landingPath, "index.html"));
      }
      return express.static(landingPath)(req, res, next);
    }

    // Auth server (auth.nubabel.com) → NO frontend, only API/auth routes
    if (host.startsWith("auth.")) {
      // Don't serve frontend on auth subdomain
      return next();
    }

    // App subdomain (app.nubabel.com) → frontend app
    if (host.startsWith("app.")) {
      // Serve static files
      return express.static(frontendPath)(req, res, () => {
        // SPA fallback (excluding API routes)
        if (
          !req.path.startsWith("/api") &&
          !req.path.startsWith("/health") &&
          !req.path.startsWith("/auth")
        ) {
          return res.sendFile(path.join(frontendPath, "index.html"));
        }
        next();
      });
    }

    next();
  });
}

logger.info("Starting server", { port, host: "0.0.0.0" });

const server = app.listen(port, "0.0.0.0", async () => {
  // Reset all circuit breakers on startup to ensure clean state
  try {
    const allBreakers = getAllCircuitBreakers();
    for (const [name, breaker] of allBreakers) {
      breaker.reset();
    }
    // Also explicitly reset postgresql circuit breaker
    const postgresqlBreaker = getCircuitBreaker("postgresql");
    postgresqlBreaker.reset();
    logger.info("✅ Circuit breakers reset on startup", {
      breakerCount: allBreakers.size + 1,
    });
  } catch (error) {
    logger.warn("⚠️  Failed to reset circuit breakers on startup", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

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

    if (process.env.SLACK_BOT_TOKEN) {
      const alertChannel = process.env.SLACK_ALERT_CHANNEL || "#eng-alerts";

      try {
        initializeSlackAlerts({
          slackToken: process.env.SLACK_BOT_TOKEN,
          alertChannel,
        });

        const { getSlackAlerts } = await import("./services/slack-anthropic-alerts");
        const alerts = getSlackAlerts();
        if (alerts) {
          await alerts.validateConfiguration();
        }

        logger.info("✅ Slack Anthropic alerts initialized and validated", {
          channel: alertChannel,
        });
      } catch (error) {
        logger.error("❌ Failed to initialize Slack alerts (continuing without monitoring)", {
          error: error instanceof Error ? error.message : String(error),
          channel: alertChannel,
        });
      }
    }
  } catch (error) {
    logger.warn("⚠️  Failed to start Slack Bot (continuing without Slack integration)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    startScheduledTasks();
    logger.info("✅ Scheduled tasks started (audit log cleanup: daily)");
  } catch (error) {
    logger.warn("⚠️  Failed to start scheduled tasks", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const { loadAvailableProviders } = await import("./mcp/providers");
    const providers = await loadAvailableProviders();
    logger.info("✅ MCP providers loaded", {
      count: providers.length,
      providers,
    });
  } catch (error) {
    logger.warn("⚠️  Failed to load MCP providers (continuing without MCP tools)", {
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

    logger.info("Closing agent activity service");
    await shutdownAgentActivityService();
    logger.info("Agent activity service closed");

    logger.info("Stopping Slack Bot");
    await stopSlackBot();
    logger.info("Slack Bot stopped");

    logger.info("Stopping scheduled tasks");
    stopScheduledTasks();
    logger.info("Scheduled tasks stopped");

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
