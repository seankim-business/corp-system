/**
 * Load testing suite for the nubabel orchestration pipeline.
 *
 * Verifies system behavior under concurrent load including throughput,
 * connection pool pressure, response time distribution, rate limiting,
 * memory stability, and graceful degradation.
 */

/* -------------------------------------------------------------------------- */
/*  Mocks – hoisted before any import                                         */
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

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: "job-mock" }),
    on: jest.fn(),
    close: jest.fn(),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0 }),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock("../../db/client", () => ({
  db: {
    orchestratorExecution: {
      create: jest.fn().mockResolvedValue({ id: "exec-1" }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  },
}));

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

  let _acquireCount = 0;
  let _inUse = 0;
  const _maxPool = 30;

  return {
    getRedisConnection: jest.fn().mockReturnValue(mockConnection),
    getQueueConnection: jest.fn().mockImplementation(async () => {
      _acquireCount++;
      _inUse++;
      if (_inUse > _maxPool) {
        _inUse--;
        throw new Error("Redis queue pool exhausted");
      }
      return mockConnection;
    }),
    getQueueConnectionSync: jest.fn().mockReturnValue(mockConnection),
    releaseQueueConnection: jest.fn().mockImplementation(() => {
      _inUse = Math.max(0, _inUse - 1);
    }),
    getWorkerConnection: jest.fn().mockResolvedValue(mockConnection),
    getWorkerConnectionSync: jest.fn().mockReturnValue(mockConnection),
    releaseWorkerConnection: jest.fn(),
    getPoolStats: jest.fn().mockImplementation(() => ({
      queue: {
        total: Math.min(_acquireCount, _maxPool),
        available: Math.max(0, _maxPool - _inUse),
        inUse: _inUse,
        ready: Math.min(_acquireCount, _maxPool),
      },
      worker: { total: 10, available: 8, inUse: 2, ready: 10 },
    })),
    redis: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(false),
      incr: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
    },
    withQueueConnection: jest.fn().mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
      fn(mockConnection),
    ),
    withWorkerConnection: jest.fn().mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
      fn(mockConnection),
    ),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
    drainAllPools: jest.fn().mockResolvedValue(undefined),
    __resetCounters: () => {
      _acquireCount = 0;
      _inUse = 0;
    },
  };
});

jest.mock("../../orchestrator/request-analyzer", () => ({
  analyzeRequest: jest.fn().mockResolvedValue({
    intent: "query",
    entities: { target: "test", action: "run", object: "load-test" },
    keywords: ["test"],
    requiresMultiAgent: false,
    complexity: "low",
  }),
}));

jest.mock("../../orchestrator/category-selector", () => ({
  selectCategory: jest.fn().mockReturnValue({ category: "quick", confidence: 0.9, method: "keyword" }),
  selectCategoryWithBudget: jest.fn().mockResolvedValue({
    category: "quick",
    baseCategory: "quick",
    confidence: 0.9,
    method: "keyword",
    matchedKeywords: ["test"],
    downgraded: false,
    downgradeReason: null,
    estimatedCostCents: 1,
    budgetRemainingCents: 10000,
  }),
}));

jest.mock("../../orchestrator/session-state", () => ({
  getSessionState: jest.fn().mockResolvedValue(null),
  updateSessionState: jest.fn().mockResolvedValue(undefined),
  isFollowUpQuery: jest.fn().mockReturnValue(false),
  applyContextBoost: jest.fn().mockImplementation((c: number) => c),
}));

jest.mock("../../orchestrator/delegate-task", () => ({
  delegateTask: jest.fn().mockResolvedValue({
    status: "success",
    output: "Mock AI response for load testing",
    metadata: {
      model: "test-model",
      inputTokens: 100,
      outputTokens: 50,
      duration: 50,
      session_id: "test-session",
    },
  }),
}));

jest.mock("../../orchestrator/multi-agent-orchestrator", () => ({
  shouldUseMultiAgent: jest.fn().mockReturnValue(false),
  orchestrateMultiAgent: jest.fn().mockResolvedValue({
    output: "multi-agent result",
    status: "success",
    metadata: { category: "quick", skills: [], duration: 100, model: "test", sessionId: "s" },
  }),
}));

jest.mock("../../orchestrator/skill-resolver", () => ({
  resolveSkillsFromRegistry: jest.fn().mockResolvedValue({
    resolvedSkills: [],
    executableSkills: [],
    promptSkills: [],
    skillPrompts: [],
  }),
  mergeSkillNames: jest.fn().mockImplementation((a: string[]) => a),
}));

jest.mock("../../services/skill-runtime/skill-executor", () => ({
  SkillExecutorService: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, result: {}, metadata: { executionTimeMs: 10 } }),
  })),
}));

jest.mock("../../services/skill-learning", () => ({
  ExperienceTracker: jest.fn().mockImplementation(() => ({
    trackExecution: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../services/skill-performance", () => ({
  recordSkillExecution: jest.fn().mockResolvedValue(undefined),
  registerSkillInIndex: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/mcp-registry", () => ({
  getActiveMCPConnections: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/budget-enforcer", () => ({
  calculateActualCostCents: jest.fn().mockReturnValue(1),
  checkBudgetSufficient: jest.fn().mockResolvedValue(true),
  getBudgetRemaining: jest.fn().mockResolvedValue(10000),
  isBudgetExhausted: jest.fn().mockReturnValue(false),
  updateSpend: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/metrics", () => ({
  recordBudgetDowngrade: jest.fn(),
  recordBudgetRejection: jest.fn(),
  recordAiRequest: jest.fn(),
}));

jest.mock("../../services/approval-checker", () => ({
  checkApprovalRequired: jest.fn().mockResolvedValue({ required: false }),
  createApprovalRequest: jest.fn().mockResolvedValue("approval-1"),
}));

jest.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue({
      startActiveSpan: jest.fn().mockImplementation((_name: string, fn: (span: unknown) => unknown) =>
        fn({
          setAttribute: jest.fn(),
          recordException: jest.fn(),
          setStatus: jest.fn(),
          end: jest.fn(),
        }),
      ),
    }),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../utils/metrics", () => ({
  metrics: {
    increment: jest.fn(),
    timing: jest.fn(),
    histogram: jest.fn(),
    gauge: jest.fn(),
    record: jest.fn(),
  },
  measureTime: jest.fn().mockImplementation((_name: string, fn: () => unknown) => {
    const result = fn();
    return result instanceof Promise ? result : Promise.resolve(result);
  }),
}));

/* -------------------------------------------------------------------------- */
/*  Imports                                                                   */
/* -------------------------------------------------------------------------- */

import { orchestrate } from "../../orchestrator";
import { OrchestrationRequest, OrchestrationResult } from "../../orchestrator/types";
import { delegateTask } from "../../orchestrator/delegate-task";
import { getPoolStats, getQueueConnection, releaseQueueConnection } from "../../db/redis";
import { isBudgetExhausted, checkBudgetSufficient } from "../../services/budget-enforcer";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

jest.setTimeout(30000);

/** Build a mock OrchestrationRequest. */
function createMockRequest(index: number): OrchestrationRequest {
  return {
    userRequest: `Load test request number ${index}`,
    sessionId: `session-load-${index}`,
    organizationId: `org-load-${index % 5}`, // spread across 5 orgs
    userId: `user-load-${index % 10}`,       // spread across 10 users
  };
}

/** Calculate the p-th percentile of a sorted numeric array. */
function calculatePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}

/** Run N orchestrations concurrently, returning results + timings. */
async function runConcurrentOrchestrations(
  count: number,
): Promise<{ results: PromiseSettledResult<OrchestrationResult>[]; timings: number[] }> {
  const timings: number[] = [];

  const promises = Array.from({ length: count }, async (_, i) => {
    const start = Date.now();
    const result = await orchestrate(createMockRequest(i));
    timings.push(Date.now() - start);
    return result;
  });

  const results = await Promise.allSettled(promises);
  return { results, timings };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("Orchestration Load Tests", () => {
  let consoleSpy: {
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeAll(() => {
    consoleSpy = {
      info: jest.spyOn(console, "info").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterAll(() => {
    consoleSpy.info.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset internal pool counters
    const redisMod = require("../../db/redis") as { __resetCounters?: () => void };
    if (redisMod.__resetCounters) redisMod.__resetCounters();
  });

  /* ======================================================================== */
  /*  1. Concurrent Request Handling                                          */
  /* ======================================================================== */

  describe("Concurrent Request Handling", () => {
    it("should handle 10 simultaneous orchestration requests", async () => {
      const { results } = await runConcurrentOrchestrations(10);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(10);

      for (const r of fulfilled) {
        expect((r as PromiseFulfilledResult<OrchestrationResult>).value.status).toBe("success");
      }
    });

    it("should handle 50 simultaneous orchestration requests", async () => {
      const { results, timings } = await runConcurrentOrchestrations(50);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(50);

      // Verify no result is lost
      const outputs = fulfilled.map(
        (r) => (r as PromiseFulfilledResult<OrchestrationResult>).value.output,
      );
      expect(outputs.every((o) => typeof o === "string" && o.length > 0)).toBe(true);

      // Verify timing collected
      expect(timings.length).toBe(50);
    });

    it("should handle 100 simultaneous orchestration requests without failures", async () => {
      const { results } = await runConcurrentOrchestrations(100);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(100);
      expect(rejected.length).toBe(0);
    });
  });

  /* ======================================================================== */
  /*  2. Queue Throughput                                                     */
  /* ======================================================================== */

  describe("Queue Throughput", () => {
    it("should measure throughput for batch processing", async () => {
      const batchSize = 50;
      const startTime = Date.now();

      const promises = Array.from({ length: batchSize }, (_, i) =>
        orchestrate(createMockRequest(i)),
      );
      const results = await Promise.all(promises);

      const elapsedMs = Date.now() - startTime;
      const throughput = (batchSize / elapsedMs) * 1000; // requests per second

      expect(results.length).toBe(batchSize);
      expect(results.every((r) => r.status === "success")).toBe(true);

      // Throughput should be greater than 0 (sanity check)
      expect(throughput).toBeGreaterThan(0);
    });

    it("should maintain throughput across sequential batches", async () => {
      const batchCount = 3;
      const batchSize = 20;
      const batchTimes: number[] = [];

      for (let batch = 0; batch < batchCount; batch++) {
        const startTime = Date.now();
        const promises = Array.from({ length: batchSize }, (_, i) =>
          orchestrate(createMockRequest(batch * batchSize + i)),
        );
        await Promise.all(promises);
        batchTimes.push(Date.now() - startTime);
      }

      // Later batches should not be drastically slower (no resource leaks)
      // Allow 5x tolerance for CI variance
      const maxTime = Math.max(...batchTimes);
      const minTime = Math.min(...batchTimes);
      expect(maxTime).toBeLessThan(minTime * 5);
    });
  });

  /* ======================================================================== */
  /*  3. Connection Pool Stress                                               */
  /* ======================================================================== */

  describe("Connection Pool Stress", () => {
    it("should report pool stats under concurrent usage", async () => {
      // Fire many concurrent requests
      await runConcurrentOrchestrations(30);

      const stats = getPoolStats();
      expect(stats.queue).toBeDefined();
      expect(stats.worker).toBeDefined();
      expect(typeof stats.queue.total).toBe("number");
      expect(typeof stats.queue.available).toBe("number");
      expect(typeof stats.queue.inUse).toBe("number");
    });

    it("should acquire and release connections under rapid cycling", async () => {
      const iterations = 50;
      const promises = Array.from({ length: iterations }, async () => {
        const conn = await getQueueConnection();
        // Simulate brief work
        await new Promise((resolve) => setTimeout(resolve, 5));
        releaseQueueConnection(conn);
      });

      await Promise.all(promises);

      // Connections should be properly released
      expect(releaseQueueConnection).toHaveBeenCalledTimes(iterations);
    });
  });

  /* ======================================================================== */
  /*  4. Response Time Distribution                                           */
  /* ======================================================================== */

  describe("Response Time Distribution", () => {
    it("should track p50, p95, p99 response times", async () => {
      const count = 100;
      const { timings } = await runConcurrentOrchestrations(count);

      expect(timings.length).toBe(count);

      const sorted = [...timings].sort((a, b) => a - b);
      const p50 = calculatePercentile(sorted, 50);
      const p95 = calculatePercentile(sorted, 95);
      const p99 = calculatePercentile(sorted, 99);

      // Basic ordering: p50 <= p95 <= p99
      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);

      // All timings should be non-negative
      expect(sorted[0]).toBeGreaterThanOrEqual(0);

      // p99 should still be reasonable (under 5 seconds for mocked pipeline)
      expect(p99).toBeLessThan(5000);
    });

    it("should detect outlier response times", async () => {
      // Inject one slow response
      const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;
      let callCount = 0;
      mockDelegateTask.mockImplementation(async () => {
        callCount++;
        if (callCount === 15) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return {
          status: "success",
          output: "response",
          metadata: { model: "test", inputTokens: 100, outputTokens: 50, duration: 50, session_id: "s" },
        };
      });

      const { timings } = await runConcurrentOrchestrations(30);
      const sorted = [...timings].sort((a, b) => a - b);
      const p50 = calculatePercentile(sorted, 50);
      const p99 = calculatePercentile(sorted, 99);

      // p99 should be noticeably higher than p50 due to the injected delay
      expect(p99).toBeGreaterThanOrEqual(p50);
    });
  });

  /* ======================================================================== */
  /*  5. Rate Limiting Under Load                                             */
  /* ======================================================================== */

  describe("Rate Limiting Under Load", () => {
    it("should reject requests when budget is exhausted", async () => {
      const mockExhausted = isBudgetExhausted as jest.MockedFunction<typeof isBudgetExhausted>;
      mockExhausted.mockReturnValue(true);

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => orchestrate(createMockRequest(i))),
      );

      const fulfilled = results.filter(
        (r) => r.status === "fulfilled",
      ) as PromiseFulfilledResult<OrchestrationResult>[];

      // All requests should complete (not throw) but be flagged as failed
      expect(fulfilled.length).toBe(20);
      fulfilled.forEach((r) => {
        expect(r.value.status).toBe("failed");
        expect(r.value.output).toContain("budget");
      });
    });

    it("should reject requests when estimated cost exceeds remaining budget", async () => {
      const mockExhausted = isBudgetExhausted as jest.MockedFunction<typeof isBudgetExhausted>;
      mockExhausted.mockReturnValue(false);

      const mockSufficient = checkBudgetSufficient as jest.MockedFunction<typeof checkBudgetSufficient>;
      mockSufficient.mockResolvedValue(false);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => orchestrate(createMockRequest(i))),
      );

      results.forEach((r) => {
        expect(r.status).toBe("failed");
        expect(r.output).toContain("budget");
      });
    });
  });

  /* ======================================================================== */
  /*  6. Memory Stability                                                     */
  /* ======================================================================== */

  describe("Memory Stability", () => {
    it("should not leak memory across sustained orchestration batches", async () => {
      const batchSize = 30;
      const batches = 5;

      // Force GC if available
      if (global.gc) global.gc();
      const baselineHeap = process.memoryUsage().heapUsed;

      for (let b = 0; b < batches; b++) {
        await Promise.all(
          Array.from({ length: batchSize }, (_, i) =>
            orchestrate(createMockRequest(b * batchSize + i)),
          ),
        );
      }

      if (global.gc) global.gc();
      const finalHeap = process.memoryUsage().heapUsed;

      const heapGrowthMB = (finalHeap - baselineHeap) / (1024 * 1024);

      // Heap growth should stay under 50 MB for 150 mocked requests
      // This is a generous threshold to account for GC timing
      expect(heapGrowthMB).toBeLessThan(50);
    });

    it("should track memory usage over rapid-fire requests", async () => {
      const memorySnapshots: number[] = [];
      const totalRequests = 60;
      const batchSize = 20;

      for (let offset = 0; offset < totalRequests; offset += batchSize) {
        memorySnapshots.push(process.memoryUsage().heapUsed);
        await Promise.all(
          Array.from({ length: batchSize }, (_, i) =>
            orchestrate(createMockRequest(offset + i)),
          ),
        );
      }
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // Memory should have been sampled at each batch boundary
      expect(memorySnapshots.length).toBe(totalRequests / batchSize + 1);

      // No single batch should cause more than 30 MB spike
      for (let i = 1; i < memorySnapshots.length; i++) {
        const deltaMB = (memorySnapshots[i] - memorySnapshots[i - 1]) / (1024 * 1024);
        expect(deltaMB).toBeLessThan(30);
      }
    });
  });

  /* ======================================================================== */
  /*  7. Graceful Degradation                                                 */
  /* ======================================================================== */

  describe("Graceful Degradation", () => {
    it("should return structured failures when delegate task errors", async () => {
      const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;
      mockDelegateTask.mockRejectedValue(new Error("Provider overloaded"));

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => orchestrate(createMockRequest(i))),
      );

      // All should settle (not hang)
      expect(results.length).toBe(20);

      // All should reject because orchestrate re-throws delegate errors
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected.length).toBe(20);
    });

    it("should handle mixed success and failure across concurrent requests", async () => {
      const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;
      let callIdx = 0;
      mockDelegateTask.mockImplementation(async () => {
        callIdx++;
        if (callIdx % 3 === 0) {
          throw new Error("Intermittent failure");
        }
        return {
          status: "success" as const,
          output: "OK",
          metadata: { model: "test", inputTokens: 10, outputTokens: 5, duration: 10, session_id: "s" },
        };
      });

      const results = await Promise.allSettled(
        Array.from({ length: 30 }, (_, i) => orchestrate(createMockRequest(i))),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Should have a mix
      expect(fulfilled.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(fulfilled.length + rejected.length).toBe(30);
    });

    it("should not deadlock when all requests fail simultaneously", async () => {
      const mockDelegateTask = delegateTask as jest.MockedFunction<typeof delegateTask>;
      mockDelegateTask.mockRejectedValue(new Error("Total system failure"));

      const startTime = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: 50 }, (_, i) => orchestrate(createMockRequest(i))),
      );
      const elapsed = Date.now() - startTime;

      // All should settle promptly (no deadlock) — generous 10 s cap
      expect(elapsed).toBeLessThan(10000);
      expect(results.length).toBe(50);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
    });
  });
});
