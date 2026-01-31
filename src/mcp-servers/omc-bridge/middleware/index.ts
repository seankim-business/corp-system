/**
 * OMC Bridge Middleware
 *
 * Authentication and rate limiting middleware for the OMC Bridge API.
 */

export {
  verifyOmcBridgeAuth,
  extractOrganizationContext,
  resolveWorkspacePath,
  validateWorkspaceAccess,
  OmcBridgeAuthContext,
} from "./auth";

export {
  rateLimitMiddleware,
  checkRateLimit,
  incrementUsage,
  getRemainingQuota,
  setRateLimitConfig,
  clearRateLimitData,
  RateLimitConfig,
  RateLimitStatus,
} from "./rate-limit";
