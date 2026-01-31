/**
 * CSRF Protection Middleware
 *
 * Implements stateless double-submit cookie pattern for SPA applications.
 * This approach is secure because:
 * 1. The CSRF token is set as an httpOnly: false cookie (readable by JS)
 * 2. The client must send the same token in a header
 * 3. Cross-origin requests cannot read cookies from other domains (SOP)
 * 4. Attacker sites cannot forge the header since they can't read the cookie
 *
 * Flow:
 * 1. Server sets CSRF token cookie on first request
 * 2. Frontend reads cookie and includes token in X-CSRF-Token header
 * 3. Server validates header matches cookie
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32;

// Methods that don't require CSRF protection (safe methods)
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths that are exempt from CSRF (webhooks, callbacks, etc.)
const EXEMPT_PATHS = [
  "/api/webhooks",
  "/api/sidecar",
  "/health",
  "/metrics",
  "/api/slack/events", // Slack uses its own signing verification
  "/api/slack/oauth",
  "/auth/google/callback",
  "/api/admin/identities/sync-slack", // Admin-only endpoint with auth, CSRF not needed
  "/api/admin/identities/fix-link", // Emergency admin fix endpoint
  "/api/admin/identities/create-user-and-link", // Emergency admin endpoint to create user + link
];

/**
 * Checks if a path should be exempt from CSRF protection.
 * Webhooks and OAuth callbacks use their own verification mechanisms.
 */
function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.some((exempt) => path.startsWith(exempt));
}

/**
 * Generates a cryptographically secure random token.
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * CSRF protection middleware.
 *
 * Usage:
 * - Apply after cookie-parser middleware
 * - Apply before routes that need protection
 *
 * Frontend Integration:
 * 1. Read the 'csrf_token' cookie value
 * 2. Include it in requests as 'X-CSRF-Token' header
 *
 * Example frontend code:
 * ```typescript
 * function getCsrfToken(): string {
 *   const match = document.cookie.match(/csrf_token=([^;]+)/);
 *   return match ? match[1] : '';
 * }
 *
 * fetch('/api/endpoint', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-CSRF-Token': getCsrfToken(),
 *   },
 *   credentials: 'include',
 *   body: JSON.stringify(data),
 * });
 * ```
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Always ensure a CSRF token cookie exists
  const existingToken = req.cookies?.[CSRF_COOKIE_NAME];
  const csrfToken = existingToken || generateCsrfToken();

  // Set/refresh the CSRF cookie
  if (!existingToken) {
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // Changed from strict to allow cross-subdomain
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
      domain: process.env.COOKIE_DOMAIN,
    });
  }

  // Safe methods don't need CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt paths (webhooks, callbacks) have their own verification
  if (isExemptPath(req.path)) {
    return next();
  }

  // Validate CSRF token
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!headerToken) {
    logger.warn("CSRF validation failed: missing header", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(403).json({
      error: "CSRF validation failed",
      message: "Missing CSRF token in request header",
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    logger.warn("CSRF validation failed: token mismatch", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(403).json({
      error: "CSRF validation failed",
      message: "Invalid CSRF token",
    });
    return;
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Endpoint to get a CSRF token for SPAs that need it on initial load.
 * Can be used if the SPA needs to make a request before any cookie is set.
 */
export function csrfTokenEndpoint(req: Request, res: Response): void {
  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
      domain: process.env.COOKIE_DOMAIN,
    });
  }

  res.json({ csrfToken });
}
