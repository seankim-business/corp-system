/**
 * Redis High Availability Configuration
 *
 * Provides utilities for configuring Redis Sentinel and Cluster connections,
 * connection health monitoring, and automatic failover handling.
 */

import IORedis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from "ioredis";
import { logger } from "../utils/logger";
import { getEnv } from "../utils/env";

export interface SentinelConfig {
  sentinels: Array<{ host: string; port: number }>;
  name: string;
  password?: string;
  sentinelPassword?: string;
  db?: number;
}

export interface ClusterConfig {
  nodes: ClusterNode[];
  password?: string;
  natMap?: Record<string, { host: string; port: number }>;
  clusterRetryStrategy?: (times: number) => number | null;
}

export type RedisMode = "standalone" | "sentinel" | "cluster";

/**
 * Creates a Redis connection using Sentinel for high availability
 */
export function createSentinelConnection(config: SentinelConfig): IORedis {
  const env = getEnv();
  const isTlsEnabled = env.REDIS_URL?.startsWith("rediss://");

  const redisOptions: RedisOptions = {
    sentinels: config.sentinels,
    name: config.name,
    password: config.password,
    sentinelPassword: config.sentinelPassword,
    db: config.db || 0,
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTlsEnabled ? { tls: { rejectUnauthorized: false } } : {}),
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error("Redis Sentinel connection failed after 10 retries");
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis Sentinel retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
  };

  const connection = new IORedis(redisOptions);

  connection.on("error", (err) => {
    logger.error("Redis Sentinel connection error:", err);
  });

  connection.on("+switch-master", (data) => {
    logger.info("Redis Sentinel master switch detected", { data });
  });

  connection.on("ready", () => {
    logger.info("Redis Sentinel connection ready", {
      masterName: config.name,
      sentinels: config.sentinels.length,
    });
  });

  return connection;
}

/**
 * Creates a Redis Cluster connection
 */
export function createClusterConnection(config: ClusterConfig): Cluster {
  const env = getEnv();
  const isTlsEnabled = env.REDIS_URL?.startsWith("rediss://");

  const clusterOptions: ClusterOptions = {
    clusterRetryStrategy:
      config.clusterRetryStrategy ||
      ((times: number) => {
        if (times > 10) {
          logger.error("Redis Cluster connection failed after 10 retries");
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis Cluster retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      }),
    enableReadyCheck: false,
    maxRedirections: 16,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 300,
    retryDelayOnTryAgain: 100,
    slotsRefreshTimeout: 1000,
    ...(isTlsEnabled ? { dnsLookup: (address, callback) => callback(null, address) } : {}),
    redisOptions: {
      password: config.password,
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(isTlsEnabled ? { tls: { rejectUnauthorized: false } } : {}),
    },
    natMap: config.natMap,
  };

  const cluster = new IORedis.Cluster(config.nodes, clusterOptions);

  cluster.on("error", (err) => {
    logger.error("Redis Cluster connection error:", err);
  });

  cluster.on("+node", (node) => {
    logger.info("Redis Cluster node added", { node });
  });

  cluster.on("-node", (node) => {
    logger.warn("Redis Cluster node removed", { node });
  });

  cluster.on("ready", () => {
    logger.info("Redis Cluster connection ready", {
      nodes: config.nodes.length,
    });
  });

  return cluster;
}

/**
 * Determines the current Redis mode from environment variables
 */
export function getRedisMode(): RedisMode {
  const mode = process.env.REDIS_MODE?.toLowerCase();

  if (mode === "sentinel") return "sentinel";
  if (mode === "cluster") return "cluster";
  return "standalone";
}

/**
 * Parses Redis Sentinel configuration from environment variables
 */
export function parseSentinelConfig(): SentinelConfig | null {
  const sentinelsEnv = process.env.REDIS_SENTINELS;

  if (!sentinelsEnv) {
    logger.warn("REDIS_SENTINELS environment variable not set");
    return null;
  }

  try {
    // Format: "host1:port1,host2:port2,host3:port3"
    const sentinels = sentinelsEnv.split(",").map((sentinel: string) => {
      const [host, port] = sentinel.trim().split(":");
      return {
        host: host.trim(),
        port: parseInt(port.trim(), 10),
      };
    });

    if (sentinels.length === 0) {
      logger.error("No valid sentinels found in REDIS_SENTINELS");
      return null;
    }

    const masterName = process.env.REDIS_SENTINEL_MASTER_NAME || "mymaster";
    const password = process.env.REDIS_PASSWORD;
    const sentinelPassword = process.env.REDIS_SENTINEL_PASSWORD;

    return {
      sentinels,
      name: masterName,
      password,
      sentinelPassword,
      db: 0,
    };
  } catch (error) {
    logger.error("Failed to parse REDIS_SENTINELS configuration", { error });
    return null;
  }
}

/**
 * Parses Redis Cluster configuration from environment variables
 */
export function parseClusterConfig(): ClusterConfig | null {
  const nodesEnv = process.env.REDIS_CLUSTER_NODES;

  if (!nodesEnv) {
    logger.warn("REDIS_CLUSTER_NODES environment variable not set");
    return null;
  }

  try {
    // Format: "host1:port1,host2:port2,host3:port3"
    const nodes: ClusterNode[] = nodesEnv.split(",").map((node: string) => {
      const [host, port] = node.trim().split(":");
      return {
        host: host.trim(),
        port: parseInt(port.trim(), 10),
      };
    });

    if (nodes.length === 0) {
      logger.error("No valid nodes found in REDIS_CLUSTER_NODES");
      return null;
    }

    const password = process.env.REDIS_PASSWORD;
    const natMapEnv = process.env.REDIS_CLUSTER_NAT_MAP;

    let natMap: Record<string, { host: string; port: number }> | undefined;
    if (natMapEnv) {
      try {
        // Format: '{"internal-ip:port":"external-ip:port"}'
        const natMapParsed = JSON.parse(natMapEnv);
        natMap = {};
        for (const [internal, external] of Object.entries(natMapParsed)) {
          const [extHost, extPort] = (external as string).split(":");
          natMap[internal] = {
            host: extHost,
            port: parseInt(extPort, 10),
          };
        }
      } catch (error) {
        logger.warn("Failed to parse REDIS_CLUSTER_NAT_MAP, ignoring", { error });
      }
    }

    return {
      nodes,
      password,
      natMap,
    };
  } catch (error) {
    logger.error("Failed to parse REDIS_CLUSTER_NODES configuration", { error });
    return null;
  }
}

/**
 * Validates the current Redis configuration
 */
export function validateRedisConfig(): boolean {
  const mode = getRedisMode();

  logger.info("Validating Redis configuration", { mode });

  switch (mode) {
    case "sentinel": {
      const config = parseSentinelConfig();
      if (!config) {
        logger.error("Invalid Sentinel configuration");
        return false;
      }
      logger.info("Sentinel configuration valid", {
        masterName: config.name,
        sentinelCount: config.sentinels.length,
      });
      return true;
    }

    case "cluster": {
      const config = parseClusterConfig();
      if (!config) {
        logger.error("Invalid Cluster configuration");
        return false;
      }
      logger.info("Cluster configuration valid", {
        nodeCount: config.nodes.length,
      });
      return true;
    }

    case "standalone": {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      logger.info("Standalone configuration", { redisUrl: redisUrl.replace(/:[^:@]+@/, ":***@") });
      return true;
    }

    default: {
      logger.error("Unknown Redis mode", { mode });
      return false;
    }
  }
}

/**
 * Performs a health check on a Redis connection
 */
export async function checkRedisHealth(
  connection: IORedis | Cluster,
): Promise<{ healthy: boolean; error?: string }> {
  try {
    const result = await connection.ping();
    if (result === "PONG") {
      return { healthy: true };
    }
    return { healthy: false, error: `Unexpected PING response: ${result}` };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gets connection information for a Redis instance
 */
export async function getRedisInfo(
  connection: IORedis | Cluster,
): Promise<Record<string, string> | null> {
  try {
    const info = await connection.info();
    const lines = info.split("\r\n");
    const result: Record<string, string> = {};

    for (const line of lines) {
      if (line && !line.startsWith("#")) {
        const [key, value] = line.split(":");
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      }
    }

    return result;
  } catch (error) {
    logger.error("Failed to get Redis info", { error });
    return null;
  }
}

/**
 * Monitors Redis connection health with periodic checks
 */
export function startHealthMonitoring(
  connection: IORedis | Cluster,
  intervalMs: number = 30000,
): NodeJS.Timeout {
  const interval = setInterval(async () => {
    const health = await checkRedisHealth(connection);
    if (!health.healthy) {
      logger.error("Redis health check failed", { error: health.error });
    } else {
      logger.debug("Redis health check passed");
    }
  }, intervalMs);

  interval.unref?.();
  return interval;
}
