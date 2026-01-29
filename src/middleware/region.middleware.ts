/**
 * Region Middleware
 *
 * Attaches region-specific database and Redis connections to requests
 * based on the organization's configured region.
 */

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { regionRouter } from "../services/region-router";
import { Region, getRegionById, DEFAULT_REGION_ID } from "../config/regions";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      region?: Region;
      regionDb?: PrismaClient;
      regionRedis?: Redis;
    }
  }
}

export interface RegionMiddlewareOptions {
  /**
   * Whether to fail requests if region is unavailable
   * Default: false (falls back to default region)
   */
  strictMode?: boolean;

  /**
   * Whether to skip region routing for certain paths
   */
  skipPaths?: string[];

  /**
   * Whether to attach connections lazily (on first access)
   * Default: true
   */
  lazyConnections?: boolean;
}

const DEFAULT_OPTIONS: RegionMiddlewareOptions = {
  strictMode: false,
  skipPaths: ["/health", "/metrics", "/api/status"],
  lazyConnections: true,
};

/**
 * Region middleware factory
 *
 * Creates middleware that:
 * 1. Determines the region for the current organization
 * 2. Attaches region-specific database and Redis connections
 * 3. Handles failover if region is unavailable
 */
export function regionMiddleware(options: RegionMiddlewareOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Skip for certain paths
    if (opts.skipPaths?.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Get organization ID from request (set by auth middleware)
    const orgId = req.currentOrganizationId || req.user?.organizationId;

    if (!orgId) {
      // No org context, use default region or skip
      req.region = getRegionById(DEFAULT_REGION_ID) || undefined;
      return next();
    }

    try {
      // Get region for organization
      const region = await regionRouter.getRegionForOrg(orgId);

      if (!region) {
        logger.warn("No region found for organization, using default", {
          orgId,
          defaultRegion: DEFAULT_REGION_ID,
        });
        req.region = getRegionById(DEFAULT_REGION_ID) || undefined;
        return next();
      }

      // Check if region is available
      const isAvailable = regionRouter.isAvailable(region.id);

      if (!isAvailable) {
        if (opts.strictMode) {
          logger.error("Region unavailable in strict mode", {
            orgId,
            regionId: region.id,
          });
          return res.status(503).json({
            error: "Service temporarily unavailable",
            code: "REGION_UNAVAILABLE",
            region: region.id,
          });
        }

        // TODO: Implement getFailoverRegion in regionRouter
        // Attempt failover
        // const fallbackRegion = await regionRouter.getFailoverRegion(region.id);
        const fallbackRegion = region.failoverRegion ? getRegionById(region.failoverRegion) : null;
        if (fallbackRegion) {
          logger.info("Using failover region", {
            orgId,
            originalRegion: region.id,
            fallbackRegion: fallbackRegion.id,
          });
          req.region = fallbackRegion;
          metrics.increment("region.failover", {
            from: region.id,
            to: fallbackRegion.id,
          });
        } else {
          req.region = region; // Use original even if unhealthy
        }
      } else {
        req.region = region;
      }

      // TODO: Fix lazy connection initialization - getters cannot be async
      // For now, use eager connection initialization
      // Attach connections (lazy or eager)
      if (opts.lazyConnections) {
        // Lazy connections not yet implemented due to async getter limitation
        // Define getters that lazily initialize connections
        // Object.defineProperty(req, "regionDb", {
        //   get: async function () {
        //     if (!this._regionDb) {
        //       this._regionDb = await regionRouter.getDatabase(req.region!.id);
        //     }
        //     return this._regionDb;
        //   },
        //   configurable: true,
        // });

        // Object.defineProperty(req, "regionRedis", {
        //   get: async function () {
        //     if (!this._regionRedis) {
        //       this._regionRedis = await regionRouter.getRedis(req.region!.id);
        //     }
        //     return this._regionRedis;
        //   },
        //   configurable: true,
        // });

        // Fallback to eager initialization
        if (req.region) {
          req.regionDb = await regionRouter.getDatabase(req.region.id);
          req.regionRedis = await regionRouter.getRedis(req.region.id);
        }
      } else {
        // Eager connection initialization
        if (req.region) {
          req.regionDb = await regionRouter.getDatabase(req.region.id);
          req.regionRedis = await regionRouter.getRedis(req.region.id);
        }
      }

      // Add region header to response
      if (req.region) {
        res.setHeader("X-Region", req.region.id);
        res.setHeader("X-Region-Location", req.region.location);

        // Track metrics
        const duration = Date.now() - startTime;
        metrics.timing("region.middleware.duration", duration, {
          region: req.region.id,
        });
        metrics.increment("region.requests", {
          region: req.region.id,
        });
      }

      next();
    } catch (error) {
      logger.error("Region middleware error", {
        orgId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't fail the request, use default region
      req.region = getRegionById(DEFAULT_REGION_ID) || undefined;
      next();
    }
  };
}

/**
 * Region validation middleware
 *
 * Validates that the request's region matches compliance requirements
 */
export function regionComplianceMiddleware(
  requiredCompliance: string[],
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.region) {
      return next();
    }

    const regionCompliance = req.region.features.compliance;
    const missingCompliance = requiredCompliance.filter(
      (c) => !regionCompliance.includes(c as never),
    );

    if (missingCompliance.length > 0) {
      logger.warn("Region does not meet compliance requirements", {
        region: req.region.id,
        required: requiredCompliance,
        missing: missingCompliance,
      });

      return res.status(403).json({
        error: "Region does not meet compliance requirements",
        code: "COMPLIANCE_VIOLATION",
        region: req.region.id,
        missingCompliance,
      });
    }

    next();
  };
}

/**
 * Region-specific rate limiting middleware
 *
 * Applies different rate limits based on region capacity
 */
export function regionRateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.region) {
      return next();
    }

    // Could implement region-specific rate limiting here
    // For now, just add region capacity info to headers
    res.setHeader("X-Region-Capacity", req.region.features.available ? "available" : "limited");

    next();
  };
}

/**
 * Utility to get database for current request's region
 */
export async function getRegionDatabase(req: Request): Promise<PrismaClient> {
  if (req.regionDb) {
    return req.regionDb;
  }

  const regionId = req.region?.id || DEFAULT_REGION_ID;
  return regionRouter.getDatabase(regionId);
}

/**
 * Utility to get Redis for current request's region
 */
export async function getRegionRedis(req: Request): Promise<Redis> {
  if (req.regionRedis) {
    return req.regionRedis;
  }

  const regionId = req.region?.id || DEFAULT_REGION_ID;
  return regionRouter.getRedis(regionId);
}

export default regionMiddleware;
