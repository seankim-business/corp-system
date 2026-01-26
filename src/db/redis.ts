import { createClient } from "redis";
import { logger } from "../utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (redisClient && redisClient.isReady) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          logger.error("Redis reconnection failed after 10 attempts");
          return new Error("Max reconnection attempts reached");
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  redisClient.on("error", (err: Error) => {
    logger.error("Redis client error:", err);
  });

  redisClient.on("connect", () => {
    logger.info("Redis client connected");
  });

  redisClient.on("ready", () => {
    logger.debug("Redis client ready");
  });

  await redisClient.connect();

  return redisClient;
}

export async function disconnectRedis() {
  if (redisClient && redisClient.isReady) {
    await redisClient.quit();
    redisClient = null;
  }
}

export const redis = {
  async get(key: string): Promise<string | null> {
    try {
      const client = await getRedisClient();
      return await client.get(key);
    } catch (error: any) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      if (ttl) {
        await client.setEx(key, ttl, value);
      } else {
        await client.set(key, value);
      }
      return true;
    } catch (error: any) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      await client.del(key);
      return true;
    } catch (error: any) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error: any) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  },

  async lpush(key: string, value: string): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.lPush(key, value);
    } catch (error: unknown) {
      logger.error(`Redis LPUSH error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const client = await getRedisClient();
      return await client.lRange(key, start, stop);
    } catch (error: unknown) {
      logger.error(`Redis LRANGE error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const result = await client.expire(key, seconds);
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
      const client = await getRedisClient();
      return await client.hIncrBy(key, field, increment);
    } catch (error: unknown) {
      logger.error(`Redis HINCRBY error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const client = await getRedisClient();
      return await client.hGetAll(key);
    } catch (error: unknown) {
      logger.error(`Redis HGETALL error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  },
};
