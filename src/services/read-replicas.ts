import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReplicaConfig {
  url: string;
  name: string;
  weight: number; // higher = more traffic
  maxConnections: number;
  region?: string;
}

interface ReadReplicaOptions {
  replicas: ReplicaConfig[];
  healthCheckIntervalMs: number;
  failoverThresholdMs: number;
  stickySessionTtlMs: number;
}

interface ReplicaHealth {
  name: string;
  url: string;
  healthy: boolean;
  latencyMs: number;
  lastChecked: number;
  consecutiveFailures: number;
  totalQueries: number;
  errorRate: number;
}

type ReplicaStats = {
  totalReplicas: number;
  healthyReplicas: number;
  unhealthyReplicas: number;
  replicas: ReplicaHealth[];
  averageLatencyMs: number;
};

// ---------------------------------------------------------------------------
// ReadReplicaManager
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = "read-replica";
const HEALTH_CHECK_QUERY = "SELECT 1 as health_check";
const MAX_CONSECUTIVE_FAILURES = 3;

class ReadReplicaManager {
  private replicas: Map<
    string,
    { client: PrismaClient; config: ReplicaConfig }
  > = new Map();
  private health: Map<string, ReplicaHealth> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private roundRobinIndex = 0;
  private options: ReadReplicaOptions;
  private started = false;

  constructor(options?: Partial<ReadReplicaOptions>) {
    this.options = {
      replicas: [],
      healthCheckIntervalMs: 10_000,
      failoverThresholdMs: 5_000,
      stickySessionTtlMs: 60_000,
      ...options,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    if (this.started) return;

    const replicaUrls = this.getReplicaUrlsFromEnv();
    const allConfigs = [...this.options.replicas, ...replicaUrls];

    if (allConfigs.length === 0) {
      logger.info("No read replicas configured — reads will use primary");
      return;
    }

    for (const config of allConfigs) {
      this.addReplica(config);
    }

    this.healthCheckTimer = setInterval(
      () => void this.runHealthChecks(),
      this.options.healthCheckIntervalMs,
    );

    this.started = true;
    logger.info(`Read replica manager started with ${allConfigs.length} replica(s)`);
  }

  async stop(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    const disconnects: Promise<void>[] = [];
    for (const [name, { client }] of this.replicas) {
      disconnects.push(
        client.$disconnect().catch((err) => {
          logger.warn(`Error disconnecting replica ${name}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
    }
    await Promise.all(disconnects);

    this.replicas.clear();
    this.health.clear();
    this.started = false;
    logger.info("Read replica manager stopped");
  }

  // -----------------------------------------------------------------------
  // Replica management
  // -----------------------------------------------------------------------

  addReplica(config: ReplicaConfig): void {
    if (this.replicas.has(config.name)) {
      logger.warn(`Replica ${config.name} already registered — skipping`);
      return;
    }

    const client = new PrismaClient({
      datasourceUrl: config.url,
      log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
    });

    this.replicas.set(config.name, { client, config });
    this.health.set(config.name, {
      name: config.name,
      url: maskUrl(config.url),
      healthy: true, // optimistic
      latencyMs: 0,
      lastChecked: 0,
      consecutiveFailures: 0,
      totalQueries: 0,
      errorRate: 0,
    });

    logger.info(`Registered read replica: ${config.name}`);
  }

  async removeReplica(name: string): Promise<void> {
    const entry = this.replicas.get(name);
    if (!entry) return;

    await entry.client.$disconnect();
    this.replicas.delete(name);
    this.health.delete(name);
    logger.info(`Removed read replica: ${name}`);
  }

  // -----------------------------------------------------------------------
  // Replica selection
  // -----------------------------------------------------------------------

  /**
   * Get a read replica PrismaClient for read-only queries.
   * Falls back to null if no healthy replicas available (caller should use primary).
   */
  getReadClient(sessionId?: string): PrismaClient | null {
    const healthy = this.getHealthyReplicas();
    if (healthy.length === 0) return null;

    // Sticky session: same session → same replica for consistency
    if (sessionId) {
      const sticky = this.getStickyReplica(sessionId, healthy);
      if (sticky) return sticky;
    }

    // Weighted round-robin
    return this.selectByWeight(healthy);
  }

  /**
   * Execute a read-only query on a replica, falling back to the provided primary.
   */
  async executeOnReplica<T>(
    primaryClient: PrismaClient,
    queryFn: (client: PrismaClient) => Promise<T>,
    sessionId?: string,
  ): Promise<T> {
    const replica = this.getReadClient(sessionId);
    const client = replica ?? primaryClient;
    const replicaName = replica ? this.findReplicaName(replica) : "primary";

    const start = Date.now();
    try {
      const result = await queryFn(client);
      const elapsed = Date.now() - start;

      if (replicaName !== "primary") {
        void this.recordQueryMetric(replicaName, elapsed, true);
      }

      return result;
    } catch (error) {
      const elapsed = Date.now() - start;
      if (replicaName !== "primary") {
        void this.recordQueryMetric(replicaName, elapsed, false);
      }

      // Retry on primary if replica failed
      if (replica) {
        logger.warn(`Replica ${replicaName} query failed, retrying on primary`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return queryFn(primaryClient);
      }
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Health checks
  // -----------------------------------------------------------------------

  async runHealthChecks(): Promise<void> {
    const checks: Promise<void>[] = [];

    for (const [name, { client }] of this.replicas) {
      checks.push(this.checkReplica(name, client));
    }

    await Promise.allSettled(checks);
    void this.persistHealthMetrics();
  }

  private async checkReplica(name: string, client: PrismaClient): Promise<void> {
    const healthEntry = this.health.get(name);
    if (!healthEntry) return;

    const start = Date.now();
    try {
      await client.$queryRawUnsafe(HEALTH_CHECK_QUERY);
      const latency = Date.now() - start;

      healthEntry.healthy = true;
      healthEntry.latencyMs = latency;
      healthEntry.lastChecked = Date.now();
      healthEntry.consecutiveFailures = 0;

      if (latency > this.options.failoverThresholdMs) {
        logger.warn(`Replica ${name} slow: ${latency}ms`);
      }
    } catch (error) {
      healthEntry.consecutiveFailures += 1;
      healthEntry.lastChecked = Date.now();

      if (healthEntry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        healthEntry.healthy = false;
        logger.error(`Replica ${name} marked unhealthy after ${healthEntry.consecutiveFailures} failures`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getStats(): ReplicaStats {
    const replicas = Array.from(this.health.values());
    const healthyCount = replicas.filter((r) => r.healthy).length;
    const totalLatency = replicas.reduce((sum, r) => sum + r.latencyMs, 0);

    return {
      totalReplicas: replicas.length,
      healthyReplicas: healthyCount,
      unhealthyReplicas: replicas.length - healthyCount,
      replicas,
      averageLatencyMs: replicas.length > 0 ? Math.round(totalLatency / replicas.length) : 0,
    };
  }

  async getReplicationLag(): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};

    for (const [name, { client }] of this.replicas) {
      try {
        const rows = await client.$queryRawUnsafe<Array<{ lag_bytes: bigint }>>(
          `SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS lag_bytes`,
        );
        result[name] = rows.length > 0 ? Number(rows[0].lag_bytes) : null;
      } catch {
        result[name] = null;
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private getReplicaUrlsFromEnv(): ReplicaConfig[] {
    const configs: ReplicaConfig[] = [];
    let idx = 1;

    while (process.env[`DATABASE_REPLICA_URL_${idx}`]) {
      configs.push({
        url: process.env[`DATABASE_REPLICA_URL_${idx}`]!,
        name: process.env[`DATABASE_REPLICA_NAME_${idx}`] || `replica-${idx}`,
        weight: parseInt(process.env[`DATABASE_REPLICA_WEIGHT_${idx}`] || "1", 10),
        maxConnections: parseInt(
          process.env[`DATABASE_REPLICA_MAX_CONN_${idx}`] || "10",
          10,
        ),
        region: process.env[`DATABASE_REPLICA_REGION_${idx}`],
      });
      idx += 1;
    }

    return configs;
  }

  private getHealthyReplicas(): Array<{
    name: string;
    client: PrismaClient;
    config: ReplicaConfig;
  }> {
    const result: Array<{
      name: string;
      client: PrismaClient;
      config: ReplicaConfig;
    }> = [];

    for (const [name, entry] of this.replicas) {
      const h = this.health.get(name);
      if (h?.healthy) {
        result.push({ name, ...entry });
      }
    }

    return result;
  }

  private selectByWeight(
    healthy: Array<{ name: string; client: PrismaClient; config: ReplicaConfig }>,
  ): PrismaClient {
    const totalWeight = healthy.reduce((sum, r) => sum + r.config.weight, 0);

    if (totalWeight === 0 || healthy.length === 1) {
      // Simple round-robin fallback
      this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
      return healthy[this.roundRobinIndex].client;
    }

    // Weighted selection
    let random = Math.random() * totalWeight;
    for (const replica of healthy) {
      random -= replica.config.weight;
      if (random <= 0) {
        return replica.client;
      }
    }

    return healthy[0].client;
  }

  private getStickyReplica(
    sessionId: string,
    healthy: Array<{ name: string; client: PrismaClient }>,
  ): PrismaClient | null {
    // Deterministic hash → consistent replica for the session
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % healthy.length;
    return healthy[idx].client;
  }

  private findReplicaName(client: PrismaClient): string {
    for (const [name, entry] of this.replicas) {
      if (entry.client === client) return name;
    }
    return "unknown";
  }

  private async recordQueryMetric(
    replicaName: string,
    durationMs: number,
    success: boolean,
  ): Promise<void> {
    try {
      const key = `${REDIS_KEY_PREFIX}:metrics:${replicaName}`;
      await redis.hincrby(key, "totalQueries", 1);
      await redis.hincrby(key, success ? "successCount" : "errorCount", 1);
      await redis.hincrby(key, "totalDurationMs", durationMs);

      const healthEntry = this.health.get(replicaName);
      if (healthEntry) {
        healthEntry.totalQueries += 1;
        if (!success) {
          const metrics = await redis.hgetall(key);
          const total = parseInt(metrics.totalQueries || "1", 10);
          const errors = parseInt(metrics.errorCount || "0", 10);
          healthEntry.errorRate = errors / total;
        }
      }
    } catch {
      // Non-critical — don't let metrics recording break queries
    }
  }

  private async persistHealthMetrics(): Promise<void> {
    try {
      const stats = this.getStats();
      await redis.setex(
        `${REDIS_KEY_PREFIX}:health`,
        60,
        JSON.stringify(stats),
      );
    } catch {
      // Non-critical
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "invalid-url";
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const readReplicaManager = new ReadReplicaManager();
export type { ReplicaConfig, ReadReplicaOptions, ReplicaHealth, ReplicaStats };
