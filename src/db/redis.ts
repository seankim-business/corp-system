import Redis from "ioredis";
import { logger } from "../utils/logger";
import { getEnv } from "../utils/env";

interface RedisPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
}

class RedisConnectionPool {
  private pool: Redis[] = [];
  private available: Redis[] = [];
  private inUse: Set<Redis> = new Set();
  private inUseTimestamps: Map<Redis, number> = new Map();
  private config: RedisPoolConfig;
  private poolType: string;
  private healthInterval: NodeJS.Timeout | null = null;
  private leakCheckInterval: NodeJS.Timeout | null = null;
  private readonly MAX_CONNECTION_HOLD_TIME_MS = 30000;

  constructor(config: RedisPoolConfig, poolType: string) {
    this.config = config;
    this.poolType = poolType;
    this.initialize();
    this.startHealthMonitor();
    this.startLeakDetection();
  }

  private initialize(): void {
    for (let i = 0; i < this.config.min; i++) {
      const connection = this.createConnection();
      this.pool.push(connection);
      this.available.push(connection);
    }

    logger.info(`Redis ${this.poolType} pool initialized`, {
      min: this.config.min,
      max: this.config.max,
    });
  }

  private startHealthMonitor(): void {
    this.healthInterval = setInterval(() => {
      const stats = this.getStats();
      if (stats.ready < this.config.min) {
        logger.warn(`Redis ${this.poolType} pool below minimum healthy connections`, {
          ready: stats.ready,
          min: this.config.min,
          total: stats.total,
        });
      }

      if (stats.available === 0 && stats.total >= this.config.max) {
        logger.warn(`Redis ${this.poolType} pool saturated`, {
          available: stats.available,
          inUse: stats.inUse,
          total: stats.total,
          max: this.config.max,
        });
      }
    }, 30000);

    this.healthInterval.unref?.();
  }

  private startLeakDetection(): void {
    this.leakCheckInterval = setInterval(() => {
      const now = Date.now();
      const leaked: Redis[] = [];

      this.inUseTimestamps.forEach((timestamp, connection) => {
        if (now - timestamp > this.MAX_CONNECTION_HOLD_TIME_MS) {
          leaked.push(connection);
        }
      });

      if (leaked.length > 0) {
        logger.warn(
          `Redis ${this.poolType} pool: force-releasing ${leaked.length} leaked connections`,
          {
            leakedCount: leaked.length,
            maxHoldTimeMs: this.MAX_CONNECTION_HOLD_TIME_MS,
          },
        );

        leaked.forEach((connection) => {
          this.forceRelease(connection);
        });
      }
    }, 10000);

    this.leakCheckInterval.unref?.();
  }

  private forceRelease(connection: Redis): void {
    this.inUse.delete(connection);
    this.inUseTimestamps.delete(connection);

    if (connection.status === "end" || connection.status === "close") {
      this.removeConnection(connection);
      this.ensureMinimumConnections();
      return;
    }

    this.available.push(connection);
  }

  private createConnection(): Redis {
    const env = getEnv();
    const redisUrl = env.REDIS_URL || "redis://localhost:6379";
    const redisPassword = env.REDIS_PASSWORD;
    const isTlsEnabled = redisUrl.startsWith("rediss://");

    const connection = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      password: redisPassword || undefined,
      ...(isTlsEnabled ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error(`Redis ${this.poolType} connection failed after 10 retries`);
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    connection.on("error", (err) => {
      logger.error(`Redis ${this.poolType} connection error:`, err);
    });

    connection.on("end", () => {
      this.handleConnectionEnd(connection);
    });

    connection.on("close", () => {
      this.handleConnectionEnd(connection);
    });

    return connection;
  }

  private handleConnectionEnd(connection: Redis): void {
    this.removeConnection(connection);
    this.ensureMinimumConnections();
  }

  private removeConnection(connection: Redis): void {
    this.pool = this.pool.filter((conn) => conn !== connection);
    this.available = this.available.filter((conn) => conn !== connection);
    this.inUse.delete(connection);
  }

  private ensureMinimumConnections(): void {
    const deficit = Math.max(0, this.config.min - this.pool.length);
    for (let i = 0; i < deficit; i++) {
      const connection = this.createConnection();
      this.pool.push(connection);
      this.available.push(connection);
    }
  }

  private pruneStaleConnections(): void {
    const stale = this.pool.filter((conn) => conn.status === "end" || conn.status === "close");
    if (stale.length === 0) return;
    stale.forEach((conn) => this.removeConnection(conn));
    this.ensureMinimumConnections();
  }

  async acquire(): Promise<Redis> {
    this.pruneStaleConnections();

    if (this.available.length > 0) {
      const connection = this.available.pop()!;
      this.inUse.add(connection);
      this.inUseTimestamps.set(connection, Date.now());
      return connection;
    }

    if (this.pool.length < this.config.max) {
      const connection = this.createConnection();
      this.pool.push(connection);
      this.inUse.add(connection);
      this.inUseTimestamps.set(connection, Date.now());
      return connection;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis ${this.poolType} pool timeout`));
      }, this.config.acquireTimeoutMillis);

      const checkAvailable = setInterval(() => {
        this.pruneStaleConnections();
        if (this.available.length > 0) {
          clearInterval(checkAvailable);
          clearTimeout(timeout);
          const connection = this.available.pop()!;
          this.inUse.add(connection);
          this.inUseTimestamps.set(connection, Date.now());
          resolve(connection);
        }
      }, 10);
    });
  }

  acquireImmediate(): Redis {
    this.pruneStaleConnections();

    if (this.available.length > 0) {
      const connection = this.available.pop()!;
      this.inUse.add(connection);
      this.inUseTimestamps.set(connection, Date.now());
      return connection;
    }

    if (this.pool.length < this.config.max) {
      const connection = this.createConnection();
      this.pool.push(connection);
      this.inUse.add(connection);
      this.inUseTimestamps.set(connection, Date.now());
      return connection;
    }

    throw new Error(`Redis ${this.poolType} pool exhausted`);
  }

  release(connection: Redis): void {
    if (!this.inUse.has(connection)) return;

    this.inUse.delete(connection);
    this.inUseTimestamps.delete(connection);

    if (connection.status === "end" || connection.status === "close") {
      this.removeConnection(connection);
      this.ensureMinimumConnections();
      return;
    }

    this.available.push(connection);
  }

  async drain(): Promise<void> {
    logger.info(`Draining Redis ${this.poolType} pool...`);

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }

    if (this.leakCheckInterval) {
      clearInterval(this.leakCheckInterval);
      this.leakCheckInterval = null;
    }

    while (this.inUse.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await Promise.all(this.pool.map((conn) => conn.quit()));
    this.pool = [];
    this.available = [];
    this.inUseTimestamps.clear();
  }

  getStats() {
    return {
      total: this.pool.length,
      available: this.available.length,
      inUse: this.inUse.size,
      ready: this.pool.filter((conn) => conn.status === "ready").length,
    };
  }
}

// Increased pool sizes to prevent exhaustion under load
// Queue pool: handles auth (PKCE), caching, general operations
// Worker pool: handles BullMQ workers which need dedicated connections
const queuePool = new RedisConnectionPool(
  { min: 10, max: 30, acquireTimeoutMillis: 10000 },
  "queue",
);

const workerPool = new RedisConnectionPool(
  { min: 10, max: 40, acquireTimeoutMillis: 15000 },
  "worker",
);

export async function getQueueConnection(): Promise<Redis> {
  return queuePool.acquire();
}

export function getQueueConnectionSync(): Redis {
  return queuePool.acquireImmediate();
}

export function releaseQueueConnection(connection: Redis): void {
  queuePool.release(connection);
}

export async function getWorkerConnection(): Promise<Redis> {
  return workerPool.acquire();
}

export function getWorkerConnectionSync(): Redis {
  return workerPool.acquireImmediate();
}

export function releaseWorkerConnection(connection: Redis): void {
  workerPool.release(connection);
}

// Backwards compatibility (queue pool)
export function getRedisConnection(): Redis {
  return getQueueConnectionSync();
}

export function releaseRedisConnection(connection: Redis): void {
  releaseQueueConnection(connection);
}

export async function drainAllPools(): Promise<void> {
  await Promise.all([queuePool.drain(), workerPool.drain()]);
}

export function getPoolStats() {
  return {
    queue: queuePool.getStats(),
    worker: workerPool.getStats(),
  };
}

export async function withQueueConnection<T>(fn: (connection: Redis) => Promise<T>): Promise<T> {
  const connection = await queuePool.acquire();
  try {
    return await fn(connection);
  } finally {
    queuePool.release(connection);
  }
}

export async function withWorkerConnection<T>(fn: (connection: Redis) => Promise<T>): Promise<T> {
  const connection = await workerPool.acquire();
  try {
    return await fn(connection);
  } finally {
    workerPool.release(connection);
  }
}

export async function disconnectRedis(): Promise<void> {
  await drainAllPools();
}

function getPrefixedKey(key: string): string {
  // PKCE keys should not be prefixed with NODE_ENV to ensure
  // consistency across auth servers/environments
  if (key.startsWith("pkce:")) {
    return key;
  }
  const env = getEnv();
  const nodeEnv = env.NODE_ENV || "development";
  return `${nodeEnv}:${key}`;
}

export const redis = {
  async get(key: string): Promise<string | null> {
    try {
      return await withQueueConnection((client) => client.get(getPrefixedKey(key)));
    } catch (error: any) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const prefixedKey = getPrefixedKey(key);
      await withQueueConnection(async (client) => {
        if (ttl) {
          await client.set(prefixedKey, value, "EX", ttl);
        } else {
          await client.set(prefixedKey, value);
        }
      });
      return true;
    } catch (error: any) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    try {
      await withQueueConnection((client) => client.del(getPrefixedKey(key)));
      return true;
    } catch (error: any) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      const result = await withQueueConnection((client) => client.exists(getPrefixedKey(key)));
      return result === 1;
    } catch (error: any) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  },

  async lpush(key: string, value: string): Promise<number> {
    try {
      return await withQueueConnection((client) => client.lpush(getPrefixedKey(key), value));
    } catch (error: unknown) {
      logger.error(`Redis LPUSH error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await withQueueConnection((client) => client.lrange(getPrefixedKey(key), start, stop));
    } catch (error: unknown) {
      logger.error(`Redis LRANGE error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await withQueueConnection((client) =>
        client.expire(getPrefixedKey(key), seconds),
      );
      return result === 1;
    } catch (error: unknown) {
      logger.error(`Redis EXPIRE error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  },

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      return await withQueueConnection((client) =>
        client.hincrby(getPrefixedKey(key), field, increment),
      );
    } catch (error: unknown) {
      logger.error(`Redis HINCRBY error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await withQueueConnection((client) => client.hgetall(getPrefixedKey(key)));
    } catch (error: unknown) {
      logger.error(`Redis HGETALL error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  },

  async incr(key: string): Promise<number> {
    try {
      return await withQueueConnection((client) => client.incr(getPrefixedKey(key)));
    } catch (error: unknown) {
      logger.error(`Redis INCR error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await withQueueConnection((client) => client.incrby(getPrefixedKey(key), increment));
    } catch (error: unknown) {
      logger.error(`Redis INCRBY error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async ttl(key: string): Promise<number> {
    try {
      return await withQueueConnection((client) => client.ttl(getPrefixedKey(key)));
    } catch (error: unknown) {
      logger.error(`Redis TTL error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return -1;
    }
  },

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    try {
      const prefixedArgs = args.map((arg, idx) =>
        idx < numKeys && typeof arg === "string" ? getPrefixedKey(arg) : arg,
      );
      return await withQueueConnection((client) => client.eval(script, numKeys, ...prefixedArgs));
    } catch (error: unknown) {
      logger.error("Redis EVAL error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async setex(key: string, ttl: number, value: string): Promise<boolean> {
    return this.set(key, value, ttl);
  },
};
