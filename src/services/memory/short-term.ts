/**
 * Short-term Memory Service
 *
 * Uses Redis to store session-scoped memory with configurable TTL.
 * Provides fast access to current conversation context.
 *
 * Implementation uses Redis hash operations for efficient storage
 * of multiple key-value pairs per session.
 */

import { redis, withQueueConnection } from "../../db/redis";
import { logger } from "../../utils/logger";

const SESSION_MEMORY_PREFIX = "memory:session:";
const DEFAULT_TTL = 24 * 60 * 60; // 24 hours

export class ShortTermMemory {
  private ttl: number;

  constructor(ttlSeconds: number = DEFAULT_TTL) {
    this.ttl = ttlSeconds;
  }

  /**
   * Store a key-value pair in session memory
   */
  async remember(sessionId: string, key: string, value: string): Promise<void> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      await withQueueConnection(async (client) => {
        await client.hset(redisKey, key, value);
        await client.expire(redisKey, this.ttl);
      });
      logger.debug("Short-term memory stored", { sessionId, key });
    } catch (error) {
      logger.error("Failed to store short-term memory", {
        sessionId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Store multiple key-value pairs at once
   */
  async rememberMany(sessionId: string, memories: Record<string, string>): Promise<void> {
    if (Object.keys(memories).length === 0) return;

    const redisKey = this.getRedisKey(sessionId);

    try {
      await withQueueConnection(async (client) => {
        // Use hmset for multiple fields
        await client.hmset(redisKey, memories);
        await client.expire(redisKey, this.ttl);
      });
      logger.debug("Short-term memories stored", {
        sessionId,
        count: Object.keys(memories).length,
      });
    } catch (error) {
      logger.error("Failed to store short-term memories", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Recall a specific key from session memory
   */
  async recall(sessionId: string, key: string): Promise<string | null> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const value = await withQueueConnection((client) =>
        client.hget(redisKey, key),
      );
      return value;
    } catch (error) {
      logger.error("Failed to recall short-term memory", {
        sessionId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get all memories for a session
   */
  async getSessionContext(sessionId: string): Promise<Record<string, string>> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const result = await redis.hgetall(redisKey);
      return result || {};
    } catch (error) {
      logger.error("Failed to get session context", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Remove a specific key from session memory
   */
  async forget(sessionId: string, key: string): Promise<void> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      await withQueueConnection((client) => client.hdel(redisKey, key));
      logger.debug("Short-term memory removed", { sessionId, key });
    } catch (error) {
      logger.error("Failed to forget short-term memory", {
        sessionId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove multiple keys from session memory
   */
  async forgetMany(sessionId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const redisKey = this.getRedisKey(sessionId);

    try {
      await withQueueConnection((client) => client.hdel(redisKey, ...keys));
      logger.debug("Short-term memories removed", { sessionId, count: keys.length });
    } catch (error) {
      logger.error("Failed to forget short-term memories", {
        sessionId,
        keys,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear all memories for a session
   */
  async clearSession(sessionId: string): Promise<void> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      await redis.del(redisKey);
      logger.debug("Session memory cleared", { sessionId });
    } catch (error) {
      logger.error("Failed to clear session memory", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a session has any memories
   */
  async hasMemories(sessionId: string): Promise<boolean> {
    const count = await this.getMemoryCount(sessionId);
    return count > 0;
  }

  /**
   * Get the count of memories in a session
   */
  async getMemoryCount(sessionId: string): Promise<number> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const count = await withQueueConnection((client) => client.hlen(redisKey));
      return count;
    } catch (error) {
      logger.error("Failed to get memory count", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Extend the TTL for a session
   */
  async extendTTL(sessionId: string, additionalSeconds?: number): Promise<void> {
    const redisKey = this.getRedisKey(sessionId);
    const newTTL = additionalSeconds || this.ttl;

    try {
      const success = await redis.expire(redisKey, newTTL);
      if (success) {
        logger.debug("Session TTL extended", { sessionId, newTTL });
      }
    } catch (error) {
      logger.error("Failed to extend session TTL", {
        sessionId,
        additionalSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get remaining TTL for a session
   */
  async getTTL(sessionId: string): Promise<number> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      return await redis.ttl(redisKey);
    } catch (error) {
      logger.error("Failed to get session TTL", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return -1;
    }
  }

  /**
   * Check if a specific key exists in session memory
   */
  async exists(sessionId: string, key: string): Promise<boolean> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const exists = await withQueueConnection((client) =>
        client.hexists(redisKey, key),
      );
      return exists === 1;
    } catch (error) {
      logger.error("Failed to check key existence", {
        sessionId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get all keys in a session (without values)
   */
  async getKeys(sessionId: string): Promise<string[]> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const keys = await withQueueConnection((client) => client.hkeys(redisKey));
      return keys;
    } catch (error) {
      logger.error("Failed to get session keys", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Increment a numeric value in session memory
   * Returns the new value after incrementing
   */
  async increment(sessionId: string, key: string, by: number = 1): Promise<number> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const newValue = await redis.hincrby(redisKey, key, by);
      return newValue;
    } catch (error) {
      logger.error("Failed to increment session value", {
        sessionId,
        key,
        by,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Set a value only if the key doesn't already exist
   * Returns true if the value was set, false if key already existed
   */
  async setIfNotExists(sessionId: string, key: string, value: string): Promise<boolean> {
    const redisKey = this.getRedisKey(sessionId);

    try {
      const result = await withQueueConnection((client) =>
        client.hsetnx(redisKey, key, value),
      );

      if (result === 1) {
        // Also set TTL if this is a new key
        await redis.expire(redisKey, this.ttl);
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Failed to set if not exists", {
        sessionId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private getRedisKey(sessionId: string): string {
    return `${SESSION_MEMORY_PREFIX}${sessionId}`;
  }
}

// Export singleton instance
export const shortTermMemory = new ShortTermMemory();
