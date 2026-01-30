/**
 * Uptime Monitor
 *
 * Self-contained uptime monitoring that tracks service availability,
 * performs periodic health checks on internal and external dependencies,
 * and exposes uptime metrics for Prometheus/Grafana.
 */
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// =============================================================================
// Types
// =============================================================================

type EndpointStatus = "up" | "down" | "degraded" | "unknown";

interface MonitoredEndpoint {
  name: string;
  url: string;
  interval: number; // check interval in ms
  timeout: number; // request timeout in ms
  expectedStatus?: number;
  expectedBodyContains?: string;
}

interface EndpointCheck {
  name: string;
  url: string;
  status: EndpointStatus;
  responseTimeMs: number;
  statusCode: number | null;
  lastCheck: string;
  consecutiveFailures: number;
  uptimePercent: number;
}

interface UptimeStats {
  startedAt: string;
  uptimeSeconds: number;
  totalChecks: number;
  totalFailures: number;
  endpoints: EndpointCheck[];
  overallStatus: EndpointStatus;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_ENDPOINTS: MonitoredEndpoint[] = [
  {
    name: "api-health",
    url: `http://localhost:${process.env.PORT || 3000}/api/health`,
    interval: 30000,
    timeout: 5000,
    expectedStatus: 200,
  },
  {
    name: "api-ready",
    url: `http://localhost:${process.env.PORT || 3000}/api/health/ready`,
    interval: 30000,
    timeout: 5000,
    expectedStatus: 200,
  },
];

const REDIS_KEY_PREFIX = "uptime:";
const HISTORY_TTL = 86400; // 24 hours

// =============================================================================
// Uptime Monitor Class
// =============================================================================

class UptimeMonitor {
  private endpoints: MonitoredEndpoint[];
  private checks: Map<string, EndpointCheck> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private startedAt: Date | null = null;
  private totalChecks = 0;
  private totalFailures = 0;

  constructor(endpoints: MonitoredEndpoint[] = DEFAULT_ENDPOINTS) {
    this.endpoints = endpoints;
  }

  /**
   * Start monitoring all configured endpoints.
   */
  start(): void {
    this.startedAt = new Date();

    for (const endpoint of this.endpoints) {
      this.checks.set(endpoint.name, {
        name: endpoint.name,
        url: endpoint.url,
        status: "unknown",
        responseTimeMs: 0,
        statusCode: null,
        lastCheck: new Date().toISOString(),
        consecutiveFailures: 0,
        uptimePercent: 100,
      });

      // Immediate first check
      void this.checkEndpoint(endpoint);

      // Schedule periodic checks
      const timer = setInterval(() => {
        void this.checkEndpoint(endpoint);
      }, endpoint.interval);

      this.timers.set(endpoint.name, timer);
    }

    logger.info("Uptime monitor started", {
      endpoints: this.endpoints.map((e) => e.name),
      count: this.endpoints.length,
    });
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    logger.info("Uptime monitor stopped");
  }

  /**
   * Add a new endpoint to monitor at runtime.
   */
  addEndpoint(endpoint: MonitoredEndpoint): void {
    this.endpoints.push(endpoint);
    this.checks.set(endpoint.name, {
      name: endpoint.name,
      url: endpoint.url,
      status: "unknown",
      responseTimeMs: 0,
      statusCode: null,
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
      uptimePercent: 100,
    });

    void this.checkEndpoint(endpoint);

    const timer = setInterval(() => {
      void this.checkEndpoint(endpoint);
    }, endpoint.interval);

    this.timers.set(endpoint.name, timer);
    logger.info("Uptime endpoint added", { name: endpoint.name, url: endpoint.url });
  }

  /**
   * Remove an endpoint from monitoring.
   */
  removeEndpoint(name: string): boolean {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    this.checks.delete(name);
    this.endpoints = this.endpoints.filter((e) => e.name !== name);
    return !!timer;
  }

  /**
   * Get current uptime stats.
   */
  getStats(): UptimeStats {
    const endpoints = Array.from(this.checks.values());
    const hasDown = endpoints.some((e) => e.status === "down");
    const hasDegraded = endpoints.some((e) => e.status === "degraded");

    let overallStatus: EndpointStatus = "up";
    if (hasDown) overallStatus = "down";
    else if (hasDegraded) overallStatus = "degraded";
    else if (endpoints.every((e) => e.status === "unknown")) overallStatus = "unknown";

    return {
      startedAt: this.startedAt?.toISOString() || new Date().toISOString(),
      uptimeSeconds: this.startedAt ? Math.round((Date.now() - this.startedAt.getTime()) / 1000) : 0,
      totalChecks: this.totalChecks,
      totalFailures: this.totalFailures,
      endpoints,
      overallStatus,
    };
  }

  /**
   * Get uptime history from Redis for a specific endpoint.
   */
  async getHistory(
    endpointName: string,
    limit: number = 100,
  ): Promise<Array<{ timestamp: string; status: string; responseTimeMs: number }>> {
    try {
      const key = `${REDIS_KEY_PREFIX}history:${endpointName}`;
      const entries = await redis.lrange(key, 0, limit - 1);
      return entries.map((entry) => JSON.parse(entry));
    } catch (err) {
      logger.warn("Failed to read uptime history", { endpoint: endpointName, error: String(err) });
      return [];
    }
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private async checkEndpoint(endpoint: MonitoredEndpoint): Promise<void> {
    const start = Date.now();
    const check = this.checks.get(endpoint.name);
    if (!check) return;

    this.totalChecks++;

    try {
      const response = await fetch(endpoint.url, {
        method: "GET",
        signal: AbortSignal.timeout(endpoint.timeout),
      });

      const responseTimeMs = Date.now() - start;
      const statusCode = response.status;
      const expectedStatus = endpoint.expectedStatus || 200;

      let status: EndpointStatus = "up";
      if (statusCode !== expectedStatus) {
        status = statusCode >= 500 ? "down" : "degraded";
      }

      if (endpoint.expectedBodyContains) {
        const body = await response.text();
        if (!body.includes(endpoint.expectedBodyContains)) {
          status = "degraded";
        }
      }

      // Check response time (>2s = degraded)
      if (status === "up" && responseTimeMs > 2000) {
        status = "degraded";
      }

      check.status = status;
      check.responseTimeMs = responseTimeMs;
      check.statusCode = statusCode;
      check.lastCheck = new Date().toISOString();

      if (status === "up") {
        check.consecutiveFailures = 0;
      } else {
        check.consecutiveFailures++;
        this.totalFailures++;
      }

      // Update uptime percentage (exponential moving average)
      const isUp = status === "up" ? 1 : 0;
      check.uptimePercent = check.uptimePercent * 0.99 + isUp * 1;

      // Store history in Redis
      await this.recordHistory(endpoint.name, status, responseTimeMs);

      if (status !== "up") {
        logger.warn("Uptime check failed", {
          endpoint: endpoint.name,
          status,
          statusCode,
          responseTimeMs,
          consecutiveFailures: check.consecutiveFailures,
        });
      }
    } catch (err) {
      const responseTimeMs = Date.now() - start;

      check.status = "down";
      check.responseTimeMs = responseTimeMs;
      check.statusCode = null;
      check.lastCheck = new Date().toISOString();
      check.consecutiveFailures++;
      check.uptimePercent = check.uptimePercent * 0.99;
      this.totalFailures++;

      await this.recordHistory(endpoint.name, "down", responseTimeMs);

      logger.error("Uptime check error", {
        endpoint: endpoint.name,
        error: String(err),
        consecutiveFailures: check.consecutiveFailures,
      });
    }
  }

  private async recordHistory(
    endpointName: string,
    status: string,
    responseTimeMs: number,
  ): Promise<void> {
    try {
      const key = `${REDIS_KEY_PREFIX}history:${endpointName}`;
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        status,
        responseTimeMs,
      });
      await redis.lpush(key, entry);
      await redis.expire(key, HISTORY_TTL);
    } catch {
      // Non-critical, silently ignore
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const uptimeMonitor = new UptimeMonitor();
