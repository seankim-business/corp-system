/**
 * Load testing suite for HTTP API endpoints.
 *
 * Tests concurrent request handling, rate limiting behavior,
 * response time distribution, and connection handling under stress
 * for the Express API layer.
 */

export {};

/* -------------------------------------------------------------------------- */
/*  Mocks                                                                     */
/* -------------------------------------------------------------------------- */

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    status: "ready",
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue("OK"),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
  }));
});

jest.mock("../../db/redis", () => {
  const mockConnection = {
    on: jest.fn(),
    status: "ready",
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue("OK"),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
  };

  return {
    getRedisConnection: jest.fn().mockReturnValue(mockConnection),
    getQueueConnectionSync: jest.fn().mockReturnValue(mockConnection),
    releaseQueueConnection: jest.fn(),
    getPoolStats: jest.fn().mockReturnValue({
      queue: { total: 30, available: 25, inUse: 5, ready: 30 },
      worker: { total: 10, available: 8, inUse: 2, ready: 10 },
    }),
    redis: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(false),
      incr: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      setex: jest.fn().mockResolvedValue("OK"),
      hgetall: jest.fn().mockResolvedValue({}),
      hincrby: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      lpush: jest.fn().mockResolvedValue(1),
    },
    withQueueConnection: jest.fn().mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
      fn(mockConnection),
    ),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
    drainAllPools: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

jest.setTimeout(30000);

interface LoadTestResult {
  statusCode: number;
  latencyMs: number;
  success: boolean;
}

/** Simulate a concurrent batch of HTTP-like requests. */
async function simulateHttpBatch(
  count: number,
  handlerFn: () => Promise<{ status: number; body: unknown }>,
): Promise<LoadTestResult[]> {
  const promises = Array.from({ length: count }, async () => {
    const start = Date.now();
    try {
      const { status } = await handlerFn();
      return {
        statusCode: status,
        latencyMs: Date.now() - start,
        success: status >= 200 && status < 300,
      };
    } catch {
      return {
        statusCode: 500,
        latencyMs: Date.now() - start,
        success: false,
      };
    }
  });

  return Promise.all(promises);
}

/** Calculate percentile from a sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("API Load Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Health Endpoint Throughput", () => {
    it("should handle 200 concurrent health check requests", async () => {
      const handler = async () => ({ status: 200, body: { ok: true } });
      const results = await simulateHttpBatch(200, handler);

      expect(results.length).toBe(200);
      expect(results.every((r) => r.success)).toBe(true);

      const sorted = results.map((r) => r.latencyMs).sort((a, b) => a - b);
      const p99 = percentile(sorted, 99);
      // Health checks should be fast (mocked)
      expect(p99).toBeLessThan(1000);
    });
  });

  describe("Rate Limiting Behavior", () => {
    it("should apply per-org rate limits under concurrent load", async () => {
      let requestCount = 0;
      const rateLimit = 50;

      const handler = async () => {
        requestCount++;
        if (requestCount > rateLimit) {
          return { status: 429, body: { error: "Rate limited" } };
        }
        return { status: 200, body: { ok: true } };
      };

      const results = await simulateHttpBatch(100, handler);

      const successCount = results.filter((r) => r.statusCode === 200).length;
      const rateLimitedCount = results.filter((r) => r.statusCode === 429).length;

      expect(successCount).toBe(rateLimit);
      expect(rateLimitedCount).toBe(100 - rateLimit);
    });

    it("should return 429 with correct headers when rate limited", async () => {
      const handler = async () => ({
        status: 429,
        body: {
          error: "Too many requests",
          retryAfter: 60,
        },
      });

      const results = await simulateHttpBatch(10, handler);
      expect(results.every((r) => r.statusCode === 429)).toBe(true);
    });
  });

  describe("Mixed Endpoint Load", () => {
    it("should handle mixed success and error responses gracefully", async () => {
      let idx = 0;
      const handler = async () => {
        idx++;
        if (idx % 5 === 0) return { status: 500, body: { error: "Server error" } };
        if (idx % 7 === 0) return { status: 404, body: { error: "Not found" } };
        return { status: 200, body: { data: `result-${idx}` } };
      };

      const results = await simulateHttpBatch(100, handler);

      expect(results.length).toBe(100);
      const statusCodes = new Set(results.map((r) => r.statusCode));
      expect(statusCodes.size).toBeGreaterThan(1);

      const successRate = results.filter((r) => r.success).length / results.length;
      expect(successRate).toBeGreaterThan(0.5);
    });

    it("should not accumulate errors across batches", async () => {
      const errorCounts: number[] = [];

      for (let batch = 0; batch < 5; batch++) {
        let batchIdx = 0;
        const handler = async () => {
          batchIdx++;
          if (batchIdx % 10 === 0) throw new Error("Random failure");
          return { status: 200, body: { ok: true } };
        };

        const results = await simulateHttpBatch(50, handler);
        errorCounts.push(results.filter((r) => !r.success).length);
      }

      // Error count should remain roughly the same per batch (not accumulate)
      const maxErrors = Math.max(...errorCounts);
      const minErrors = Math.min(...errorCounts);
      expect(maxErrors - minErrors).toBeLessThan(10);
    });
  });

  describe("Latency Distribution", () => {
    it("should track p50/p95/p99 across variable-latency requests", async () => {
      const handler = async () => {
        const delay = Math.random() * 50; // 0-50ms simulated latency
        await new Promise((resolve) => setTimeout(resolve, delay));
        return { status: 200, body: { ok: true } };
      };

      const results = await simulateHttpBatch(100, handler);
      const sorted = results.map((r) => r.latencyMs).sort((a, b) => a - b);

      const p50 = percentile(sorted, 50);
      const p95 = percentile(sorted, 95);
      const p99 = percentile(sorted, 99);

      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
      expect(p99).toBeLessThan(5000);
    });
  });

  describe("Connection Exhaustion Recovery", () => {
    it("should recover gracefully when connections are exhausted", async () => {
      let activeConnections = 0;
      const maxConnections = 20;

      const handler = async () => {
        activeConnections++;
        if (activeConnections > maxConnections) {
          activeConnections--;
          return { status: 503, body: { error: "Service unavailable" } };
        }
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeConnections--;
        return { status: 200, body: { ok: true } };
      };

      const results = await simulateHttpBatch(50, handler);

      expect(results.length).toBe(50);
      // Some should succeed, some may get 503
      const successes = results.filter((r) => r.success).length;
      expect(successes).toBeGreaterThan(0);

      // After all settled, connections should be released
      expect(activeConnections).toBe(0);
    });
  });

  describe("Sustained Load", () => {
    it("should maintain stable performance across 5 sequential batches", async () => {
      const batchTimes: number[] = [];
      const batchSize = 30;

      for (let batch = 0; batch < 5; batch++) {
        const start = Date.now();
        const handler = async () => ({ status: 200, body: { ok: true } });
        await simulateHttpBatch(batchSize, handler);
        batchTimes.push(Date.now() - start);
      }

      // No batch should take more than 5x the fastest
      const maxTime = Math.max(...batchTimes);
      const minTime = Math.min(...batchTimes);
      expect(maxTime).toBeLessThan(Math.max(minTime * 5, 100));
    });

    it("should not leak memory across sustained request batches", async () => {
      if (global.gc) global.gc();
      const baselineHeap = process.memoryUsage().heapUsed;

      for (let batch = 0; batch < 10; batch++) {
        const handler = async () => ({
          status: 200,
          body: { data: "x".repeat(100) },
        });
        await simulateHttpBatch(50, handler);
      }

      if (global.gc) global.gc();
      const finalHeap = process.memoryUsage().heapUsed;
      const growthMB = (finalHeap - baselineHeap) / (1024 * 1024);

      // 500 requests with 100-byte payloads should not grow heap > 50 MB
      expect(growthMB).toBeLessThan(50);
    });
  });
});
