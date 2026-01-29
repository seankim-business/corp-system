/**
 * Admin System Health Service
 *
 * Monitors system health, performance, and infrastructure status.
 */

import { db as prisma } from "../../db/client";
import Redis from "ioredis";

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: Date;
  components: ComponentHealth[];
  alerts: SystemAlert[];
}

export interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  message?: string;
  lastChecked: Date;
}

export interface SystemAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  component: string;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
}

export interface SystemLogs {
  logs: LogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LogEntry {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

const SERVER_START_TIME = Date.now();

export class AdminSystemHealthService {
  private redis: Redis | null = null;

  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
    }
  }

  /**
   * Get comprehensive system health status
   */
  async getHealth(): Promise<SystemHealth> {
    const components = await this.checkAllComponents();
    const alerts = await this.getActiveAlerts();

    const unhealthyCount = components.filter((c) => c.status === "unhealthy").length;
    const degradedCount = components.filter((c) => c.status === "degraded").length;

    let status: SystemHealth["status"] = "healthy";
    if (unhealthyCount > 0) {
      status = "unhealthy";
    } else if (degradedCount > 0) {
      status = "degraded";
    }

    return {
      status,
      uptime: Date.now() - SERVER_START_TIME,
      timestamp: new Date(),
      components,
      alerts,
    };
  }

  /**
   * Check all system components
   */
  private async checkAllComponents(): Promise<ComponentHealth[]> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkDiskSpace(),
      this.checkExternalApis(),
    ]);

    return checks.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        name: "unknown",
        status: "unhealthy" as const,
        message: result.reason?.message || "Check failed",
        lastChecked: new Date(),
      };
    });
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      return {
        name: "database",
        status: latency < 100 ? "healthy" : latency < 500 ? "degraded" : "unhealthy",
        latency,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        name: "database",
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Connection failed",
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<ComponentHealth> {
    if (!this.redis) {
      return {
        name: "redis",
        status: "degraded",
        message: "Redis not configured",
        lastChecked: new Date(),
      };
    }

    const start = Date.now();
    try {
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        name: "redis",
        status: latency < 50 ? "healthy" : latency < 200 ? "degraded" : "unhealthy",
        latency,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        name: "redis",
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Connection failed",
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<ComponentHealth> {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const usagePercent = (used.heapUsed / used.heapTotal) * 100;

    return {
      name: "memory",
      status: usagePercent < 70 ? "healthy" : usagePercent < 90 ? "degraded" : "unhealthy",
      message: `${heapUsedMB}MB / ${heapTotalMB}MB (${Math.round(usagePercent)}%)`,
      lastChecked: new Date(),
    };
  }

  /**
   * Check disk space (placeholder - would need system-level access)
   */
  private async checkDiskSpace(): Promise<ComponentHealth> {
    // Placeholder - in production would check actual disk usage
    return {
      name: "disk",
      status: "healthy",
      message: "Disk space monitoring not implemented",
      lastChecked: new Date(),
    };
  }

  /**
   * Check external API connectivity
   */
  private async checkExternalApis(): Promise<ComponentHealth> {
    // Placeholder - would actually ping each service
    // TODO: Check connectivity to key external services (notion, google, openai)
    return {
      name: "external_apis",
      status: "healthy",
      message: "External API checks not implemented",
      lastChecked: new Date(),
    };
  }

  /**
   * Get active system alerts
   */
  private async getActiveAlerts(): Promise<SystemAlert[]> {
    // TODO: Implement alert storage and retrieval
    return [];
  }

  /**
   * Get system logs with filtering
   */
  async getLogs(options: {
    level?: string;
    component?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<SystemLogs> {
    // TODO: Implement log retrieval from logging service
    // For now, return empty result
    return {
      logs: [],
      total: 0,
      page: options.page || 1,
      totalPages: 0,
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    requestsPerSecond: number;
    avgResponseTime: number;
    errorRate: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
  }> {
    // TODO: Integrate with actual metrics collection
    return {
      requestsPerSecond: 0,
      avgResponseTime: 0,
      errorRate: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    // TODO: Get actual BullMQ queue stats
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
  }

  /**
   * Cleanup on shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export const adminSystemHealthService = new AdminSystemHealthService();
