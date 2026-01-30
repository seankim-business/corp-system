import { Request, Response, NextFunction } from "express";
import { scanObject, logInjectionAttempt } from "../utils/input-sanitizer";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface SQLSafetyConfig {
  /** Block requests with detected injection patterns. Default: false (log only). */
  blockSuspiciousRequests: boolean;
  /** Paths to skip scanning (e.g., webhooks that receive external payloads). */
  excludePaths: string[];
  /** Maximum request body depth to scan. Default: 10. */
  maxScanDepth: number;
  /** Maximum string length to scan. Default: 10000. */
  maxStringLength: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: SQLSafetyConfig = {
  blockSuspiciousRequests: false, // Start in log-only mode
  excludePaths: [
    "/api/slack/events",
    "/api/slack/interactions",
    "/api/webhooks",
    "/api/stripe/webhook",
  ],
  maxScanDepth: 10,
  maxStringLength: 10000,
};

// =============================================================================
// Middleware
// =============================================================================

/**
 * Middleware that scans incoming request bodies, query params, and URL params
 * for SQL injection, XSS, and path traversal patterns.
 *
 * While Prisma uses parameterized queries for all database operations,
 * this middleware provides defense-in-depth by detecting and logging
 * suspicious input patterns before they reach application logic.
 */
export function sqlSafetyMiddleware(config?: Partial<SQLSafetyConfig>) {
  const cfg: SQLSafetyConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip excluded paths
    if (cfg.excludePaths.some((p) => req.path.startsWith(p))) {
      next();
      return;
    }

    // Skip non-mutating requests (GET, HEAD, OPTIONS)
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      // Still scan query params for GET requests
      if (req.query && Object.keys(req.query).length > 0) {
        const queryScan = scanObject(truncateDeep(req.query, cfg.maxStringLength, cfg.maxScanDepth));
        if (queryScan.suspicious) {
          logInjectionAttempt("query_params", queryScan.findings, {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userId: (req as any).user?.id,
          });

          if (cfg.blockSuspiciousRequests) {
            res.status(400).json({ error: "Invalid query parameters" });
            return;
          }
        }
      }
      next();
      return;
    }

    // Scan request body
    if (req.body && typeof req.body === "object") {
      const bodyScan = scanObject(truncateDeep(req.body, cfg.maxStringLength, cfg.maxScanDepth));
      if (bodyScan.suspicious) {
        logInjectionAttempt("request_body", bodyScan.findings, {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userId: (req as any).user?.id,
          contentType: req.headers["content-type"],
        });

        if (cfg.blockSuspiciousRequests) {
          res.status(400).json({ error: "Invalid request body" });
          return;
        }
      }
    }

    // Scan URL params
    if (req.params && Object.keys(req.params).length > 0) {
      const paramScan = scanObject(req.params);
      if (paramScan.suspicious) {
        logInjectionAttempt("url_params", paramScan.findings, {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userId: (req as any).user?.id,
        });

        if (cfg.blockSuspiciousRequests) {
          res.status(400).json({ error: "Invalid URL parameters" });
          return;
        }
      }
    }

    next();
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Truncate strings in an object to prevent scanning excessively large payloads.
 * Also limits recursion depth.
 */
function truncateDeep(obj: unknown, maxLen: number, maxDepth: number, depth = 0): unknown {
  if (depth > maxDepth) return "[truncated]";

  if (typeof obj === "string") {
    return obj.length > maxLen ? obj.slice(0, maxLen) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map((item) => truncateDeep(item, maxLen, maxDepth, depth + 1));
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    const keys = Object.keys(obj);
    for (const key of keys.slice(0, 100)) {
      result[key] = truncateDeep((obj as Record<string, unknown>)[key], maxLen, maxDepth, depth + 1);
    }
    return result;
  }

  return obj;
}

/**
 * Create a strict version of the middleware that blocks suspicious requests.
 */
export function strictSqlSafetyMiddleware() {
  return sqlSafetyMiddleware({ blockSuspiciousRequests: true });
}

/**
 * Log middleware configuration on startup.
 */
export function logSqlSafetyConfig(config?: Partial<SQLSafetyConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  logger.info("SQL safety middleware configured", {
    blockSuspiciousRequests: cfg.blockSuspiciousRequests,
    excludedPaths: cfg.excludePaths.length,
    maxScanDepth: cfg.maxScanDepth,
    maxStringLength: cfg.maxStringLength,
  });
}
