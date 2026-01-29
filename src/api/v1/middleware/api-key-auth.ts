/**
 * API Key Authentication Middleware
 *
 * Validates API keys and checks required scopes for v1 API endpoints.
 */

import { Request, Response, NextFunction } from "express";
import { apiKeyService, APIKey, APIScope } from "../../../services/api-keys";
import { logger } from "../../../utils/logger";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: APIKey;
      apiOrganizationId?: string;
    }
  }
}

export interface APIKeyAuthOptions {
  requiredScopes?: APIScope[];
  allowExpired?: boolean;
}

/**
 * API Key authentication middleware factory.
 * @param requiredScopes - Array of scopes required to access the endpoint
 */
export function apiKeyAuth(requiredScopes: APIScope[] = []) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const authHeader = req.headers.authorization;

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "missing_api_key",
        message: "API key required. Use Authorization: Bearer <api_key>",
        documentation_url: "https://docs.nubabel.com/api/authentication",
      });
    }

    const key = authHeader.substring(7).trim();

    if (!key) {
      return res.status(401).json({
        error: "missing_api_key",
        message: "API key is empty",
      });
    }

    try {
      const apiKey = await apiKeyService.validate(key);

      if (!apiKey) {
        logger.warn("Invalid API key attempt", {
          keyPrefix: key.substring(0, 12),
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });

        return res.status(401).json({
          error: "invalid_api_key",
          message: "Invalid or expired API key",
        });
      }

      // Check required scopes
      if (requiredScopes.length > 0) {
        const missingScopes = requiredScopes.filter(
          (scope) => !apiKey.scopes.includes(scope),
        );

        if (missingScopes.length > 0) {
          return res.status(403).json({
            error: "insufficient_scope",
            message: `Missing required scope(s): ${missingScopes.join(", ")}`,
            required_scopes: requiredScopes,
            granted_scopes: apiKey.scopes,
          });
        }
      }

      // Attach API key info to request
      req.apiKey = apiKey;
      req.apiOrganizationId = apiKey.organizationId;

      // Track usage asynchronously (don't block the request)
      apiKeyService.trackUsage(apiKey.id).catch((err) => {
        logger.error("Failed to track API key usage", { error: err, keyId: apiKey.id });
      });

      next();
    } catch (error) {
      logger.error("API key authentication error", { error });
      return res.status(500).json({
        error: "authentication_error",
        message: "An error occurred during authentication",
      });
    }
  };
}

/**
 * Middleware to require specific scopes after initial auth.
 * Useful for route-specific scope checks.
 */
export function requireScopes(scopes: APIScope[]) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: "not_authenticated",
        message: "API key authentication required",
      });
    }

    const missingScopes = scopes.filter((scope) => !req.apiKey!.scopes.includes(scope));

    if (missingScopes.length > 0) {
      return res.status(403).json({
        error: "insufficient_scope",
        message: `Missing required scope(s): ${missingScopes.join(", ")}`,
        required_scopes: scopes,
        granted_scopes: req.apiKey.scopes,
      });
    }

    next();
  };
}

/**
 * Extract organization ID from authenticated request.
 */
export function getOrganizationId(req: Request): string {
  if (!req.apiOrganizationId) {
    throw new Error("Organization ID not available - API key auth required");
  }
  return req.apiOrganizationId;
}
