/**
 * Region Router Service
 *
 * Manages routing requests to the correct region based on organization settings.
 * Handles database and Redis connection management per region.
 */

import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Request } from "express";
import {
  Region,
  REGIONS,
  getRegionById,
  getDefaultRegion,
  getFailoverRegion,
  isRegionAvailable,
  DEFAULT_REGION_ID,
} from "../config/regions";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { getCircuitBreaker } from "../utils/circuit-breaker";

interface RegionConnections {
  database: PrismaClient;
  redis: Redis;
  lastHealthCheck: Date;
  healthy: boolean;
}

interface CachedOrgRegion {
  regionId: string;
  expiresAt: number;
}

const HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute
const ORG_REGION_CACHE_TTL_MS = 300000; // 5 minutes

class RegionRouter {
  private connections: Map<string, RegionConnections> = new Map();
  private orgRegionCache: Map<string, CachedOrgRegion> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    // Don't auto-initialize - let it be lazy loaded
  }

  /**
   * Initialize connections for a specific region
   */
  private async initializeRegion(region: Region): Promise<RegionConnections> {
    const existingConnection = this.connections.get(region.id);
    if (existingConnection) {
      return existingConnection;
    }

    logger.info("Initializing region connections", { regionId: region.id });

    // For the default region, use the existing global connections
    if (region.id === DEFAULT_REGION_ID) {
      const defaultRedis = this.createRedisConnection(region);
      const connections: RegionConnections = {
        database: db,
        redis: defaultRedis,
        lastHealthCheck: new Date(),
        healthy: true,
      };
      this.connections.set(region.id, connections);
      this.startHealthCheck(region);
      return connections;
    }

    // Create region-specific connections
    const database = this.createDatabaseConnection(region);
    const redis = this.createRedisConnection(region);

    const connections: RegionConnections = {
      database,
      redis,
      lastHealthCheck: new Date(),
      healthy: true,
    };

    this.connections.set(region.id, connections);
    this.startHealthCheck(region);

    metrics.increment("region.initialized", { regionId: region.id });

    return connections;
  }

  /**
   * Create a Prisma client for a specific region
   */
  private createDatabaseConnection(region: Region): PrismaClient {
    const { host, port, ssl } = region.database;
    const dbName = process.env.DB_NAME || "nubabel";
    const dbUser = process.env.DB_USER || "nubabel";
    const dbPassword = process.env.DB_PASSWORD || "";

    const sslMode = ssl ? "require" : "disable";
    const connectionUrl = `postgresql://${dbUser}:${dbPassword}@${host}:${port}/${dbName}?sslmode=${sslMode}`;

    const circuitBreaker = getCircuitBreaker(`db-${region.id}`, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 60000,
    });

    const client = new PrismaClient({
      datasources: {
        db: {
          url: connectionUrl,
        },
      },
      log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
    });

    // Wrap queries with circuit breaker
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }: any) {
            return circuitBreaker.execute(() => query(args));
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  /**
   * Create a Redis connection for a specific region
   */
  private createRedisConnection(region: Region): Redis {
    const { host, port, ssl } = region.redis;
    const password = process.env.REDIS_PASSWORD || undefined;

    const redis = new Redis({
      host,
      port,
      password,
      tls: ssl ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error(`Redis connection failed for region ${region.id} after 10 retries`);
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redis.on("error", (err) => {
      logger.error(`Redis error for region ${region.id}:`, err);
      this.markRegionUnhealthy(region.id);
    });

    redis.on("connect", () => {
      logger.info(`Redis connected for region ${region.id}`);
      this.markRegionHealthy(region.id);
    });

    return redis;
  }

  /**
   * Start health check interval for a region
   */
  private startHealthCheck(region: Region): void {
    const existing = this.healthCheckIntervals.get(region.id);
    if (existing) {
      clearInterval(existing);
    }

    const interval = setInterval(async () => {
      await this.checkRegionHealth(region.id);
    }, HEALTH_CHECK_INTERVAL_MS);

    // Don't prevent process exit
    interval.unref?.();
    this.healthCheckIntervals.set(region.id, interval);
  }

  /**
   * Check health of a specific region
   */
  private async checkRegionHealth(regionId: string): Promise<boolean> {
    const connections = this.connections.get(regionId);
    if (!connections) return false;

    try {
      // Check Redis
      await connections.redis.ping();

      // Check Database (simple query)
      await connections.database.$queryRaw`SELECT 1`;

      connections.healthy = true;
      connections.lastHealthCheck = new Date();

      metrics.increment("region.health_check.success", { regionId });
      return true;
    } catch (error) {
      connections.healthy = false;
      connections.lastHealthCheck = new Date();

      logger.error(`Health check failed for region ${regionId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      metrics.increment("region.health_check.failure", { regionId });
      return false;
    }
  }

  private markRegionUnhealthy(regionId: string): void {
    const connections = this.connections.get(regionId);
    if (connections) {
      connections.healthy = false;
    }
  }

  private markRegionHealthy(regionId: string): void {
    const connections = this.connections.get(regionId);
    if (connections) {
      connections.healthy = true;
    }
  }

  /**
   * Get region for an organization (with caching)
   */
  async getRegionForOrg(orgId: string): Promise<Region> {
    // Check cache first
    const cached = this.orgRegionCache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) {
      const region = getRegionById(cached.regionId);
      if (region && isRegionAvailable(region.id)) {
        return region;
      }
    }

    // Query database
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });

      const settings = org?.settings as { regionId?: string } | null;
      const regionId = settings?.regionId || DEFAULT_REGION_ID;
      const region = getRegionById(regionId);

      if (!region) {
        logger.warn(`Region ${regionId} not found for org ${orgId}, using default`);
        return getDefaultRegion();
      }

      // Check availability and failover
      if (!isRegionAvailable(region.id)) {
        const failover = getFailoverRegion(region.id);
        if (failover && isRegionAvailable(failover.id)) {
          logger.warn(`Region ${region.id} unavailable, failing over to ${failover.id}`, {
            orgId,
          });
          metrics.increment("region.failover", {
            from: region.id,
            to: failover.id,
          });
          return failover;
        }
        return getDefaultRegion();
      }

      // Cache the result
      this.orgRegionCache.set(orgId, {
        regionId: region.id,
        expiresAt: Date.now() + ORG_REGION_CACHE_TTL_MS,
      });

      return region;
    } catch (error) {
      logger.error("Failed to get region for org", {
        orgId,
        error: error instanceof Error ? error.message : String(error),
      });
      return getDefaultRegion();
    }
  }

  /**
   * Get database connection for a region
   */
  async getDatabase(regionId: string): Promise<PrismaClient> {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    let connections = this.connections.get(regionId);
    if (!connections) {
      connections = await this.initializeRegion(region);
    }

    // Check health and failover if necessary
    if (!connections.healthy) {
      const failover = getFailoverRegion(regionId);
      if (failover) {
        logger.warn(`Database unhealthy for ${regionId}, using failover ${failover.id}`);
        return this.getDatabase(failover.id);
      }
    }

    return connections.database;
  }

  /**
   * Get Redis connection for a region
   */
  async getRedis(regionId: string): Promise<Redis> {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    let connections = this.connections.get(regionId);
    if (!connections) {
      connections = await this.initializeRegion(region);
    }

    // Check health and failover if necessary
    if (!connections.healthy) {
      const failover = getFailoverRegion(regionId);
      if (failover) {
        logger.warn(`Redis unhealthy for ${regionId}, using failover ${failover.id}`);
        return this.getRedis(failover.id);
      }
    }

    return connections.redis;
  }

  /**
   * Route a request to the correct region based on organization
   */
  async routeRequest(req: Request): Promise<Region> {
    const orgId = (req as any).organization?.id || (req as any).organizationId;

    if (!orgId) {
      return getDefaultRegion();
    }

    return this.getRegionForOrg(orgId);
  }

  /**
   * Check if a region is available
   */
  isAvailable(regionId: string): boolean {
    const region = getRegionById(regionId);
    if (!region) return false;

    // Check config availability
    if (!region.features.available) return false;

    // Check connection health if initialized
    const connections = this.connections.get(regionId);
    if (connections) {
      return connections.healthy;
    }

    return true; // Not yet initialized, assume available
  }

  /**
   * Get all region health statuses
   */
  getRegionHealthStatus(): Record<
    string,
    { available: boolean; healthy: boolean; lastCheck: Date | null }
  > {
    const status: Record<string, { available: boolean; healthy: boolean; lastCheck: Date | null }> =
      {};

    for (const region of REGIONS) {
      const connections = this.connections.get(region.id);
      status[region.id] = {
        available: region.features.available,
        healthy: connections?.healthy ?? true,
        lastCheck: connections?.lastHealthCheck ?? null,
      };
    }

    return status;
  }

  /**
   * Update organization's region assignment
   */
  async setOrgRegion(orgId: string, regionId: string): Promise<void> {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    if (!region.features.available) {
      throw new Error(`Region ${regionId} is not available`);
    }

    await db.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          regionId,
        },
      },
    });

    // Invalidate cache
    this.orgRegionCache.delete(orgId);

    logger.info("Organization region updated", { orgId, regionId });
    metrics.increment("region.org_assignment", { regionId });
  }

  /**
   * Get failover region for a given region
   */
  getFailoverRegion(regionId: string): Region | undefined {
    return getFailoverRegion(regionId);
  }

  /**
   * Clear organization region cache
   */
  clearOrgCache(orgId?: string): void {
    if (orgId) {
      this.orgRegionCache.delete(orgId);
    } else {
      this.orgRegionCache.clear();
    }
  }

  /**
   * Graceful shutdown - close all connections
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down region router...");

    // Stop health checks
    for (const [regionId, interval] of this.healthCheckIntervals) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(regionId);
    }

    // Close connections
    for (const [regionId, connections] of this.connections) {
      try {
        await connections.redis.quit();
        // Don't disconnect default region's database (it's the global client)
        if (regionId !== DEFAULT_REGION_ID) {
          await connections.database.$disconnect();
        }
        logger.info(`Closed connections for region ${regionId}`);
      } catch (error) {
        logger.error(`Error closing connections for region ${regionId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.connections.clear();
    this.orgRegionCache.clear();
    logger.info("Region router shutdown complete");
  }
}

// Singleton instance
export const regionRouter = new RegionRouter();

// Export types
export type { Region, RegionConnections };
