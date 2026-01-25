import Redis from "ioredis";
import { logger } from "./logger";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

class CacheManager {
  private defaultTTL = 3600;

  private getKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const fullKey = this.getKey(key, options?.prefix);
      const cached = await redis.get(fullKey);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      logger.error("Cache get error", { key }, error as Error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.getKey(key, options?.prefix);
      const ttl = options?.ttl || this.defaultTTL;

      await redis.setex(fullKey, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error("Cache set error", { key }, error as Error);
    }
  }

  async del(key: string, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.getKey(key, options?.prefix);
      await redis.del(fullKey);
    } catch (error) {
      logger.error("Cache del error", { key }, error as Error);
    }
  }

  async remember<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key, options);

    if (cached !== null) {
      logger.debug("Cache hit", { key });
      return cached;
    }

    logger.debug("Cache miss", { key });
    const value = await fn();
    await this.set(key, value, options);

    return value;
  }

  async flush(prefix?: string): Promise<void> {
    try {
      if (prefix) {
        const pattern = `${prefix}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        await redis.flushdb();
      }
    } catch (error) {
      logger.error("Cache flush error", { prefix }, error as Error);
    }
  }
}

export const cache = new CacheManager();
