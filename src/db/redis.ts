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
};
