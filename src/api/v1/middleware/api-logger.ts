/**
 * API Request Logger Middleware
 *
 * Logs all API requests with relevant metadata for debugging and analytics.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../../utils/logger";
import { metricsCollector } from "../../../services/metrics";

export interface APIRequestLog {
  requestId: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  organizationId?: string;
  apiKeyId?: string;
  apiKeyPrefix?: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
  error?: string;
}

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * API logger middleware.
 * Logs request start, completion, and tracks metrics.
 */
export function apiLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Attach request ID to request and response
    req.headers["x-request-id"] = requestId;
    res.setHeader("X-Request-ID", requestId);

    // Log request start (debug level)
    logger.debug("API request started", {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    // Capture original end function
    const originalEnd = res.end.bind(res);

    // Override end to log completion
    res.end = function (
      chunk?: any,
      encoding?: BufferEncoding | (() => void),
      callback?: () => void,
    ): Response {
      const duration = Date.now() - startTime;

      const logData: APIRequestLog = {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query as Record<string, unknown>,
        organizationId: req.apiOrganizationId,
        apiKeyId: req.apiKey?.id,
        apiKeyPrefix: req.apiKey?.keyPrefix,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get("user-agent"),
        ip: req.ip,
      };

      // Log based on status code
      if (res.statusCode >= 500) {
        logger.error("API request failed", logData);
      } else if (res.statusCode >= 400) {
        logger.warn("API request client error", logData);
      } else {
        logger.info("API request completed", logData);
      }

      // Track metrics
      trackAPIMetrics(req, res, duration);

      // Call original end
      if (typeof encoding === "function") {
        return originalEnd(chunk, encoding);
      }
      return originalEnd(chunk, encoding as BufferEncoding, callback);
    };

    next();
  };
}

/**
 * Track API request metrics.
 */
function trackAPIMetrics(req: Request, res: Response, duration: number): void {
  const path = normalizePath(req.path);
  const method = req.method;
  const status = String(res.statusCode);
  const tier = req.apiKey?.rateLimitTier || "unknown";

  // Increment request counter
  metricsCollector.incrementCounter("api_v1_requests_total", {
    method,
    path,
    status,
    tier,
  });

  // Record duration
  metricsCollector.observeHistogram(
    "api_v1_request_duration_seconds",
    {
      method,
      path,
    },
    duration / 1000,
  );

  // Track by organization
  if (req.apiOrganizationId) {
    metricsCollector.incrementCounter("api_v1_requests_by_org_total", {
      organization_id: req.apiOrganizationId,
      method,
    });
  }
}

/**
 * Normalize path for metrics (replace IDs with placeholders).
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

/**
 * Error logging middleware for API errors.
 */
export function apiErrorLogger() {
  return (err: Error, req: Request, _res: Response, next: NextFunction) => {
    logger.error("API error", {
      requestId: req.headers["x-request-id"],
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
      organizationId: req.apiOrganizationId,
      apiKeyId: req.apiKey?.id,
    });

    next(err);
  };
}
