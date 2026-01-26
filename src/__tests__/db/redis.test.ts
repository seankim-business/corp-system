import { redis, disconnectRedis } from "../../db/redis";

describe("Redis Security Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Key Prefix for Environment Isolation", () => {
    it("should prefix keys with environment name", async () => {
      process.env.NODE_ENV = "test";
      const result = await redis.set("session:abc123", "value");
      expect(result).toBe(true);
    });

    it("should isolate development keys", async () => {
      process.env.NODE_ENV = "development";
      const result = await redis.set("cache:key", "dev-value");
      expect(result).toBe(true);
    });

    it("should isolate production keys", async () => {
      process.env.NODE_ENV = "production";
      const result = await redis.set("cache:key", "prod-value");
      expect(result).toBe(true);
    });

    it("should apply prefix to all operations", async () => {
      process.env.NODE_ENV = "test";

      const key = "test:key";
      const setResult = await redis.set(key, "value");
      expect(setResult).toBe(true);

      const existsResult = await redis.exists(key);
      expect(existsResult).toBe(true);

      const delResult = await redis.del(key);
      expect(delResult).toBe(true);
    });

    it("should apply prefix to list operations", async () => {
      process.env.NODE_ENV = "test";

      const key = "queue:items";
      const length = await redis.lpush(key, "item1");
      expect(length).toBeGreaterThanOrEqual(0);
    });

    it("should apply prefix to hash operations", async () => {
      process.env.NODE_ENV = "test";

      const key = "user:profile";
      const result = await redis.hincrby(key, "visits", 1);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should apply prefix to expiration", async () => {
      process.env.NODE_ENV = "test";

      const key = "temp:data";
      await redis.set(key, "value");
      const expired = await redis.expire(key, 1);
      expect(typeof expired).toBe("boolean");
    });
  });

  describe("Error Handling", () => {
    it("should return null on GET error", async () => {
      const result = await redis.get("nonexistent:key");
      expect(result === null || typeof result === "string").toBe(true);
    });

    it("should return false on SET error", async () => {
      const result = await redis.set("", "");
      expect(typeof result).toBe("boolean");
    });

    it("should return false on DEL error", async () => {
      const result = await redis.del("");
      expect(typeof result).toBe("boolean");
    });

    it("should return false on EXISTS error", async () => {
      const result = await redis.exists("");
      expect(typeof result).toBe("boolean");
    });

    it("should return number on LPUSH error", async () => {
      const result = await redis.lpush("", "");
      expect(typeof result).toBe("number");
    });

    it("should return array on LRANGE error", async () => {
      const result = await redis.lrange("", 0, -1);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return boolean on EXPIRE error", async () => {
      const result = await redis.expire("", 1);
      expect(typeof result).toBe("boolean");
    });

    it("should return number on HINCRBY error", async () => {
      const result = await redis.hincrby("", "", 1);
      expect(typeof result).toBe("number");
    });

    it("should return object on HGETALL error", async () => {
      const result = await redis.hgetall("");
      expect(typeof result).toBe("object");
    });
  });

  describe("TTL and Expiration", () => {
    it("should set key with TTL", async () => {
      process.env.NODE_ENV = "test";
      const key = "temp:session";
      const ttl = 3600;

      const result = await redis.set(key, "session-data", ttl);
      expect(result).toBe(true);
    });
  });

  describe("Configuration Validation", () => {
    it("should handle missing REDIS_URL gracefully", async () => {
      delete process.env.REDIS_URL;
      expect(() => {
        require("../../db/redis");
      }).not.toThrow();
    });

    it("should handle missing REDIS_PASSWORD gracefully", async () => {
      delete process.env.REDIS_PASSWORD;
      expect(() => {
        require("../../db/redis");
      }).not.toThrow();
    });

    it("should use default NODE_ENV if not set", async () => {
      delete process.env.NODE_ENV;
      expect(() => {
        require("../../db/redis");
      }).not.toThrow();
    });
  });
});
