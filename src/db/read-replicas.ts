import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { redis } from "./redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoadBalanceStrategy = "round-robin" | "least-connections" | "random";

export interface ReplicaStatus {
  index: number;
  url: string;
  healthy: boolean;
  latencyMs: number;
  replicationLagMs: number;
  activeConnections: number;
  lastChecked: string | null;
  consecutiveFailures: number;
}

interface ReplicaNode {
  index: number;
  url: string;
  client: PrismaClient;
  healthy: boolean;
  latencyMs: number;
  replicationLagMs: number;
  activeConnections: number;
  lastChecked: Date | null;
  consecutiveFailures: number;
}

interface ReplicaHealthData {
  healthy: boolean;
  latencyMs: number;
  replicationLagMs: number;
  lastChecked: string;
  consecutiveFailures: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PRIMARY_URL = process.env.DATABASE_URL ?? "";
const REPLICA_URLS_RAW = process.env.DATABASE_REPLICA_URLS ?? "";
const MAX_LAG_MS = parseInt(process.env.DB_REPLICA_MAX_LAG_MS ?? "5000", 10);
const HEALTH_INTERVAL_MS = parseInt(
  process.env.DB_REPLICA_HEALTH_INTERVAL_MS ?? "10000",
  10,
);
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const REDIS_HEALTH_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseReplicaUrls(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<invalid-url>";
  }
}

function createReplicaPrismaClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
  });
}

// ---------------------------------------------------------------------------
// ReadReplicaRouter
// ---------------------------------------------------------------------------

export class ReadReplicaRouter {
  private primary: PrismaClient;
  private replicas: ReplicaNode[] = [];
  private strategy: LoadBalanceStrategy;
  private roundRobinIndex = 0;
  private healthInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(strategy: LoadBalanceStrategy = "round-robin") {
    this.strategy = strategy;
    this.primary = new PrismaClient({
      datasources: { db: { url: PRIMARY_URL } },
      log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
    });

    const replicaUrls = parseReplicaUrls(REPLICA_URLS_RAW);

    this.replicas = replicaUrls.map((url, index) => ({
      index,
      url,
      client: createReplicaPrismaClient(url),
      healthy: true, // optimistic start
      latencyMs: 0,
      replicationLagMs: 0,
      activeConnections: 0,
      lastChecked: null,
      consecutiveFailures: 0,
    }));

    if (replicaUrls.length > 0) {
      logger.info("Read replica router initialized", {
        replicaCount: replicaUrls.length,
        strategy: this.strategy,
        maxLagMs: MAX_LAG_MS,
        healthIntervalMs: HEALTH_INTERVAL_MS,
      });
    } else {
      logger.info(
        "Read replica router initialized with no replicas; all reads will use primary",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns a healthy read replica client.
   * Falls back to the primary if no healthy replica is available.
   */
  getReadClient(): PrismaClient {
    const eligible = this.getEligibleReplicas();

    if (eligible.length === 0) {
      logger.debug(
        "No healthy replicas available, falling back to primary for read",
      );
      return this.primary;
    }

    const selected = this.selectReplica(eligible);
    selected.activeConnections++;

    logger.debug("Routing read to replica", {
      replicaIndex: selected.index,
      strategy: this.strategy,
      activeConnections: selected.activeConnections,
      latencyMs: selected.latencyMs,
    });

    return selected.client;
  }

  /**
   * Always returns the primary client for write operations.
   */
  getWriteClient(): PrismaClient {
    return this.primary;
  }

  /**
   * Starts periodic health checking for all replicas.
   */
  start(): void {
    if (this.running) {
      logger.warn("Read replica health monitor is already running");
      return;
    }

    if (this.replicas.length === 0) {
      logger.debug(
        "No replicas configured; health monitor will not start",
      );
      return;
    }

    this.running = true;

    // Run an initial health check immediately (fire-and-forget)
    void this.checkAllReplicas();

    this.healthInterval = setInterval(() => {
      void this.checkAllReplicas();
    }, HEALTH_INTERVAL_MS);

    // Allow the process to exit even if the interval is still active
    this.healthInterval.unref?.();

    logger.info("Read replica health monitor started", {
      intervalMs: HEALTH_INTERVAL_MS,
      replicaCount: this.replicas.length,
    });
  }

  /**
   * Stops the health monitoring interval.
   */
  stop(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.running = false;
    logger.info("Read replica health monitor stopped");
  }

  /**
   * Returns current health status for every replica.
   */
  getStatus(): ReplicaStatus[] {
    return this.replicas.map((r) => ({
      index: r.index,
      url: maskUrl(r.url),
      healthy: r.healthy,
      latencyMs: r.latencyMs,
      replicationLagMs: r.replicationLagMs,
      activeConnections: r.activeConnections,
      lastChecked: r.lastChecked ? r.lastChecked.toISOString() : null,
      consecutiveFailures: r.consecutiveFailures,
    }));
  }

  /**
   * Gracefully disconnects all Prisma clients managed by this router.
   */
  async disconnect(): Promise<void> {
    this.stop();
    await Promise.all([
      this.primary.$disconnect(),
      ...this.replicas.map((r) => r.client.$disconnect()),
    ]);
    logger.info("Read replica router disconnected all clients");
  }

  // -------------------------------------------------------------------------
  // Load Balancing
  // -------------------------------------------------------------------------

  private getEligibleReplicas(): ReplicaNode[] {
    return this.replicas.filter(
      (r) => r.healthy && r.replicationLagMs <= MAX_LAG_MS,
    );
  }

  private selectReplica(eligible: ReplicaNode[]): ReplicaNode {
    switch (this.strategy) {
      case "round-robin":
        return this.selectRoundRobin(eligible);
      case "least-connections":
        return this.selectLeastConnections(eligible);
      case "random":
        return this.selectRandom(eligible);
    }
  }

  private selectRoundRobin(eligible: ReplicaNode[]): ReplicaNode {
    const index = this.roundRobinIndex % eligible.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % eligible.length;
    return eligible[index];
  }

  private selectLeastConnections(eligible: ReplicaNode[]): ReplicaNode {
    let best = eligible[0];
    for (let i = 1; i < eligible.length; i++) {
      if (eligible[i].activeConnections < best.activeConnections) {
        best = eligible[i];
      }
    }
    return best;
  }

  private selectRandom(eligible: ReplicaNode[]): ReplicaNode {
    const index = Math.floor(Math.random() * eligible.length);
    return eligible[index];
  }

  // -------------------------------------------------------------------------
  // Health Checking
  // -------------------------------------------------------------------------

  private async checkAllReplicas(): Promise<void> {
    const checks = this.replicas.map((replica) =>
      this.checkReplica(replica),
    );
    await Promise.allSettled(checks);
  }

  private async checkReplica(replica: ReplicaNode): Promise<void> {
    const start = Date.now();

    try {
      // Connectivity check: run a trivial query with a timeout race
      await Promise.race([
        replica.client.$queryRawUnsafe("SELECT 1"),
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("Health check timed out")),
            HEALTH_CHECK_TIMEOUT_MS,
          ),
        ),
      ]);

      const latencyMs = Date.now() - start;

      // Replication lag check
      const replicationLagMs = await this.measureReplicationLag(replica);

      const wasUnhealthy = !replica.healthy;

      replica.latencyMs = latencyMs;
      replica.replicationLagMs = replicationLagMs;
      replica.healthy = true;
      replica.consecutiveFailures = 0;
      replica.lastChecked = new Date();

      if (wasUnhealthy) {
        logger.info("Replica recovered", {
          replicaIndex: replica.index,
          latencyMs,
          replicationLagMs,
        });
      }

      if (replicationLagMs > MAX_LAG_MS) {
        logger.warn("Replica replication lag exceeds threshold", {
          replicaIndex: replica.index,
          replicationLagMs,
          maxLagMs: MAX_LAG_MS,
        });
      }

      // Persist metrics to Redis
      await this.storeHealthMetrics(replica);
    } catch (err) {
      replica.consecutiveFailures++;
      replica.lastChecked = new Date();
      replica.latencyMs = Date.now() - start;

      if (replica.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
        replica.healthy = false;
        logger.error("Replica marked unhealthy after consecutive failures", {
          replicaIndex: replica.index,
          consecutiveFailures: replica.consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        logger.warn("Replica health check failed", {
          replicaIndex: replica.index,
          consecutiveFailures: replica.consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await this.storeHealthMetrics(replica);
    }
  }

  /**
   * Attempts to measure replication lag on the replica.
   *
   * For streaming replicas the query
   *   `SELECT CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
   *          THEN 0
   *          ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())::int
   *          END AS lag_ms`
   * returns the lag in seconds (converted to ms).
   *
   * Falls back to 0 if the query fails (e.g. logical replication setups).
   */
  private async measureReplicationLag(replica: ReplicaNode): Promise<number> {
    try {
      const result: Array<{ lag_ms: number | null }> =
        await replica.client.$queryRawUnsafe(`
          SELECT
            CASE
              WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
              ELSE COALESCE(
                EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())::int * 1000,
                0
              )
            END AS lag_ms
        `);

      if (result.length > 0 && result[0].lag_ms !== null) {
        return Math.max(0, Number(result[0].lag_ms));
      }
      return 0;
    } catch {
      // If the replica does not expose WAL replay functions, treat lag as 0
      // so that connectivity alone decides health.
      logger.debug("Unable to measure replication lag, defaulting to 0", {
        replicaIndex: replica.index,
      });
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Redis persistence
  // -------------------------------------------------------------------------

  private async storeHealthMetrics(replica: ReplicaNode): Promise<void> {
    const key = `db:replica:${replica.index}:health`;
    const data: ReplicaHealthData = {
      healthy: replica.healthy,
      latencyMs: replica.latencyMs,
      replicationLagMs: replica.replicationLagMs,
      lastChecked: replica.lastChecked
        ? replica.lastChecked.toISOString()
        : new Date().toISOString(),
      consecutiveFailures: replica.consecutiveFailures,
    };

    try {
      await redis.set(key, JSON.stringify(data), REDIS_HEALTH_TTL_SECONDS);
    } catch (err) {
      logger.warn("Failed to store replica health metrics in Redis", {
        replicaIndex: replica.index,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const replicaRouter = new ReadReplicaRouter(
  (process.env.DB_REPLICA_LB_STRATEGY as LoadBalanceStrategy | undefined) ??
    "round-robin",
);
