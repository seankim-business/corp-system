/**
 * V1 Public API Router
 *
 * Combines all v1 API routes with middleware for authentication,
 * rate limiting, and request logging.
 */

import { Router, Request, Response } from "express";
import { apiLogger } from "./middleware/api-logger";
import { apiRateLimiter } from "./middleware/rate-limiter";

// Import route modules
import agentsRouter from "./routes/agents";
import workflowsRouter from "./routes/workflows";
import executionsRouter from "./routes/executions";
import webhooksRouter from "./routes/webhooks";
import organizationsRouter from "./routes/organizations";

const router = Router();

// Apply global middleware to all v1 routes
router.use(apiLogger());
router.use(apiRateLimiter());

// Health check endpoint (no auth required)
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// API info endpoint (no auth required)
router.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Nubabel Public API",
    version: "1.0.0",
    documentation: "/api/v1/docs",
    endpoints: {
      agents: "/api/v1/agents",
      workflows: "/api/v1/workflows",
      executions: "/api/v1/executions",
      webhooks: "/api/v1/webhooks",
      organization: "/api/v1/organization",
    },
    authentication: {
      type: "Bearer Token",
      header: "Authorization: Bearer <api_key>",
    },
  });
});

// Mount route modules
router.use("/agents", agentsRouter);
router.use("/workflows", workflowsRouter);
router.use("/executions", executionsRouter);
router.use("/webhooks", webhooksRouter);
router.use("/organization", organizationsRouter);

// 404 handler for v1 API
router.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "not_found",
    message: "The requested endpoint does not exist",
    documentation: "/api/v1/docs",
  });
});

export default router;
