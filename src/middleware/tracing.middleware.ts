/**
 * Distributed Tracing Middleware
 *
 * Express middleware that integrates with the lightweight tracing service to:
 * - Extract W3C Trace Context from incoming request headers
 * - Create a server span for each HTTP request
 * - Record standard HTTP attributes on the span
 * - Inject trace context into response headers
 * - Make the span available via AsyncLocalStorage for downstream code
 */

import { Request, Response, NextFunction } from "express";
import { tracer, Span } from "../services/tracing";

// Extend the Express Request type to carry the traceId
declare module "express-serve-static-core" {
  interface Request {
    traceId?: string;
  }
}

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract incoming trace context (if any) from W3C traceparent header
  const incomingContext = tracer.extractContext(
    req.headers as Record<string, string | undefined>,
  );

  // Build a parent-like Span stub so the new span inherits the remote traceId
  let parentSpan: Span | undefined;
  if (incomingContext) {
    parentSpan = new Span(
      "__remote_parent__",
      incomingContext,
      "SERVER",
    );
  }

  // Create a server span for this request
  const path = req.route?.path || req.path;
  const span = tracer.startSpan(`${req.method} ${path}`, {
    parent: parentSpan,
    kind: "SERVER",
    attributes: {
      "http.method": req.method,
      "http.url": req.originalUrl,
      "http.user_agent": req.get("user-agent") || "",
    },
  });

  // Attach traceId to the request object for use in logging / handlers
  req.traceId = span.context.traceId;

  // Inject trace context into response headers
  const outgoingHeaders = tracer.injectContext(span);
  for (const [key, value] of Object.entries(outgoingHeaders)) {
    res.setHeader(key, value);
  }

  // Record status code and end span when the response finishes
  const onFinish = (): void => {
    span.setAttribute("http.status_code", res.statusCode);

    if (res.statusCode >= 400) {
      span.setStatus("ERROR");
    } else {
      span.setStatus("OK");
    }

    tracer.endSpan(span);
    cleanup();
  };

  const onClose = (): void => {
    if (span.endTime === undefined) {
      span.setAttribute("http.status_code", res.statusCode);
      span.setStatus("ERROR");
      span.addEvent("connection_closed");
      tracer.endSpan(span);
    }
    cleanup();
  };

  const cleanup = (): void => {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onClose);
  };

  res.on("finish", onFinish);
  res.on("close", onClose);

  // Execute the rest of the middleware chain within the span's async context
  tracer.withSpan(span, async () => {
    next();
  }).catch(() => {
    // next() itself should not throw; errors are handled by Express error middleware
  });
}
