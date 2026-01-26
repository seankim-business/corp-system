import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { trace } from "@opentelemetry/api";
import { setCorrelationId } from "../utils/logger";

/**
 * Correlation ID Middleware
 *
 * Generates or propagates X-Request-ID for distributed tracing across:
 * - HTTP requests (header)
 * - Logs (via AsyncLocalStorage)
 * - OpenTelemetry spans (attributes)
 * - Response headers (for client tracking)
 *
 * Supports correlation ID propagation from:
 * - X-Request-ID header (case-insensitive)
 * - x-request-id header (lowercase)
 * - Generates new UUID if not present
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check for existing X-Request-ID (from load balancer or previous service)
  const existingId = req.get("X-Request-ID") || req.get("x-request-id");

  // Generate new ID if not present
  const correlationId = existingId || randomUUID();

  // Store on request object for access in route handlers
  req.correlationId = correlationId;

  // Add to response headers for client tracking
  res.setHeader("X-Request-ID", correlationId);

  // Set in async context for logger (enables correlation ID in all logs)
  setCorrelationId(correlationId);

  // Add to OpenTelemetry span
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute("correlation.id", correlationId);
    span.setAttribute("request.id", correlationId);
  }

  next();
}
