import { AnthropicMetricsTracker, AnthropicRequestData } from "../../services/anthropic-metrics";
import { redis } from "../../db/redis";
import { metricsCollector } from "../../services/metrics";
import { logger } from "../../utils/logger";

// =============================================================================
// Mocks
// =============================================================================

jest.mock("../../db/redis", () => ({
  redis: {
    hincrby: jest.fn(),
    hgetall: jest.fn(),
    expire: jest.fn(),
  },
}));

jest.mock("../../services/metrics", () => ({
  metricsCollector: {
    incrementCounter: jest.fn(),
    observeHistogram: jest.fn(),
    describeMetric: jest.fn(),
    getCounterValues: jest.fn(),
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// =============================================================================
// Test Data
// =============================================================================

const mockRequestData: AnthropicRequestData = {
  model: "claude-sonnet-4",
  category: "code-generation",
  inputTokens: 1000,
  outputTokens: 500,
  cost: 0.015,
  duration: 2500,
  success: true,
};

const mockFailedRequestData: AnthropicRequestData = {
  model: "claude-opus-4",
  category: "analysis",
  inputTokens: 2000,
  outputTokens: 1000,
  cost: 0.045,
  duration: 5000,
  success: false,
  error: "rate_limit_error",
};

const mockUsageStatsData = {
  requests: "10",
  tokens: "15000",
  cost: "450000", // Stored as cost * 1000000 (microcents)
  errors: "2",
  rateLimitHits: "1",
};

// =============================================================================
// Tests
// =============================================================================

describe("AnthropicMetricsTracker", () => {
  let tracker: AnthropicMetricsTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new AnthropicMetricsTracker();
  });

  // ===========================================================================
  // recordRequest Tests
  // ===========================================================================

  describe("recordRequest", () => {
    it("should record successful request with all metrics", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRequest(mockRequestData);

      // Verify Prometheus metrics recorded
      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_requests_total",
        {
          model: "claude-sonnet-4",
          category: "code-generation",
          success: "true",
        },
        1,
      );

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_tokens_total",
        {
          model: "claude-sonnet-4",
          type: "input",
        },
        1000,
      );

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_tokens_total",
        {
          model: "claude-sonnet-4",
          type: "output",
        },
        500,
      );

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_tokens_total",
        {
          model: "claude-sonnet-4",
          type: "total",
        },
        1500,
      );

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_cost_total",
        {
          model: "claude-sonnet-4",
          category: "code-generation",
        },
        0.015,
      );

      expect(metricsCollector.observeHistogram).toHaveBeenCalledWith(
        "anthropic_request_duration_seconds",
        {
          model: "claude-sonnet-4",
          category: "code-generation",
        },
        2.5, // duration in seconds
      );

      // Verify Redis time-series data updated
      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "requests", 1);
      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "tokens", 1500);
      expect(redis.hincrby).toHaveBeenCalledWith(
        expect.any(String),
        "cost",
        Math.round(0.015 * 1000000),
      );
      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "errors", 0);
    });

    it("should record failed request with error metric", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRequest(mockFailedRequestData);

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_requests_total",
        {
          model: "claude-opus-4",
          category: "analysis",
          success: "false",
        },
        1,
      );

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_errors_total",
        {
          error_type: "rate_limit_error",
        },
        1,
      );

      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "errors", 1);
    });

    it("should update time-series data for all time windows", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRequest(mockRequestData);

      // Verify minute, hour, and day windows updated (3 windows * 5 fields = 15 calls)
      const hincrbyCalls = (redis.hincrby as jest.Mock).mock.calls;
      const redisKeys = hincrbyCalls.map((call) => call[0]);

      expect(redisKeys.some((key: string) => key.includes(":minute:"))).toBe(true);
      expect(redisKeys.some((key: string) => key.includes(":hour:"))).toBe(true);
      expect(redisKeys.some((key: string) => key.includes(":day:"))).toBe(true);
    });

    it("should set correct TTL for each time window", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRequest(mockRequestData);

      const expireCalls = (redis.expire as jest.Mock).mock.calls;
      const ttls = expireCalls.map((call) => call[1]);

      expect(ttls).toContain(120); // minute TTL
      expect(ttls).toContain(7200); // hour TTL
      expect(ttls).toContain(172800); // day TTL
    });

    it("should handle zero token counts", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      const zeroTokenData: AnthropicRequestData = {
        ...mockRequestData,
        inputTokens: 0,
        outputTokens: 0,
      };

      await tracker.recordRequest(zeroTokenData);

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_tokens_total",
        expect.any(Object),
        0,
      );

      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "tokens", 0);
    });

    it("should handle Redis failure gracefully", async () => {
      (redis.hincrby as jest.Mock).mockRejectedValue(new Error("Redis connection failed"));

      await tracker.recordRequest(mockRequestData);

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update time-series data",
        expect.objectContaining({
          error: "Redis connection failed",
          window: expect.any(String),
        }),
      );
    });

    it("should log successful recording", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRequest(mockRequestData);

      expect(logger.debug).toHaveBeenCalledWith(
        "Anthropic metrics recorded",
        expect.objectContaining({
          model: "claude-sonnet-4",
          tokens: 1500,
          cost: 0.015,
          duration: 2500,
        }),
      );
    });
  });

  // ===========================================================================
  // recordRateLimit Tests
  // ===========================================================================

  describe("recordRateLimit", () => {
    it("should record rate limit hit with account name", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRateLimit("production-account");

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_rate_limit_hits_total",
        {
          account: "production-account",
        },
        1,
      );

      expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "rateLimitHits", 1);
    });

    it("should use default account when no name provided", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRateLimit();

      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        "anthropic_rate_limit_hits_total",
        {
          account: "default",
        },
        1,
      );
    });

    it("should update all time windows", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRateLimit();

      const hincrbyCalls = (redis.hincrby as jest.Mock).mock.calls;
      expect(hincrbyCalls.length).toBeGreaterThanOrEqual(3); // minute, hour, day
    });

    it("should log warning on rate limit hit", async () => {
      (redis.hincrby as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await tracker.recordRateLimit("test-account");

      expect(logger.warn).toHaveBeenCalledWith("Anthropic rate limit hit", {
        account: "test-account",
      });
    });

    it("should handle Redis failure gracefully", async () => {
      (redis.hincrby as jest.Mock).mockRejectedValue(new Error("Redis error"));

      await tracker.recordRateLimit();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to record rate limit",
        expect.objectContaining({
          error: "Redis error",
        }),
      );
    });
  });

  // ===========================================================================
  // getUsageStats Tests
  // ===========================================================================

  describe("getUsageStats", () => {
    it("should return parsed usage stats for minute window", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue(mockUsageStatsData);

      const stats = await tracker.getUsageStats("minute");

      expect(stats).toEqual({
        requests: 10,
        tokens: 15000,
        cost: 450000,
        errors: 2,
        rateLimitHits: 1,
      });
    });

    it("should return parsed usage stats for hour window", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue(mockUsageStatsData);

      const stats = await tracker.getUsageStats("hour");

      expect(stats.requests).toBe(10);
      expect(stats.tokens).toBe(15000);
    });

    it("should return parsed usage stats for day window", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue(mockUsageStatsData);

      const stats = await tracker.getUsageStats("day");

      expect(stats.requests).toBe(10);
    });

    it("should return zero values when no data exists", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue({});

      const stats = await tracker.getUsageStats("minute");

      expect(stats).toEqual({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        rateLimitHits: 0,
      });
    });

    it("should return zero values when Redis returns null", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue(null);

      const stats = await tracker.getUsageStats("minute");

      expect(stats).toEqual({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        rateLimitHits: 0,
      });
    });

    it("should handle partial data gracefully", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue({
        requests: "5",
        // Missing other fields
      });

      const stats = await tracker.getUsageStats("minute");

      expect(stats).toEqual({
        requests: 5,
        tokens: 0,
        cost: 0,
        errors: 0,
        rateLimitHits: 0,
      });
    });

    it("should handle Redis failure gracefully", async () => {
      (redis.hgetall as jest.Mock).mockRejectedValue(new Error("Redis error"));

      const stats = await tracker.getUsageStats("minute");

      expect(stats).toEqual({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        rateLimitHits: 0,
      });

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to get usage stats",
        expect.objectContaining({
          error: "Redis error",
          timeWindow: "minute",
        }),
      );
    });
  });

  // ===========================================================================
  // getQuotaEstimate Tests
  // ===========================================================================

  describe("getQuotaEstimate", () => {
    it("should return quota estimate for free tier", async () => {
      // Mock day stats with 30 requests
      (redis.hgetall as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(":day:")) {
          return Promise.resolve({
            requests: "30",
            tokens: "0",
            cost: "0",
            errors: "0",
            rateLimitHits: "0",
          });
        }
        // Mock hour stats
        return Promise.resolve({
          requests: "5",
          tokens: "0",
          cost: "0",
          errors: "0",
          rateLimitHits: "0",
        });
      });

      // Mock current hour = 10 (for estimation calculation)
      jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);

      const quota = await tracker.getQuotaEstimate();

      expect(quota.maxRequestsPerDay).toBe(50);
      expect(quota.currentRequests).toBe(30);
      expect(quota.quotaRemaining).toBe("40.0%");
      expect(quota.estimatedDailyRequests).toBeGreaterThanOrEqual(30);
    });

    it("should return quota estimate for standard tier", async () => {
      (redis.hgetall as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(":day:")) {
          return Promise.resolve({
            requests: "100",
            tokens: "0",
            cost: "0",
            errors: "0",
            rateLimitHits: "0",
          });
        }
        return Promise.resolve({
          requests: "10",
          tokens: "0",
          cost: "0",
          errors: "0",
          rateLimitHits: "0",
        });
      });

      jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);

      const quota = await tracker.getQuotaEstimate();

      expect(quota.maxRequestsPerDay).toBe(1000); // Standard tier
      expect(quota.currentRequests).toBe(100);
    });

    it("should return quota estimate for pro tier", async () => {
      (redis.hgetall as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(":day:")) {
          return Promise.resolve({
            requests: "2000",
            tokens: "0",
            cost: "0",
            errors: "0",
            rateLimitHits: "0",
          });
        }
        return Promise.resolve({
          requests: "200",
          tokens: "0",
          cost: "0",
          errors: "0",
          rateLimitHits: "0",
        });
      });

      jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);

      const quota = await tracker.getQuotaEstimate();

      expect(quota.maxRequestsPerDay).toBe(5000); // Pro tier
      expect(quota.currentRequests).toBe(2000);
    });

    it("should return quota estimate for max tier", async () => {
      (redis.hgetall as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(":day:")) {
          return Promise.resolve({
            requests: "10000",
            tokens: "0",
            cost: "0",
            errors: "0",
            rateLimitHits: "0",
          });
        }
        return Promise.resolve({
          requests: "1000",
          tokens: "0",
          cost: "0",
          errors: "0",
          rateLimitHits: "0",
        });
      });

      jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);

      const quota = await tracker.getQuotaEstimate();

      expect(quota.maxRequestsPerDay).toBe(40000); // Max tier
      expect(quota.currentRequests).toBe(10000);
    });

    it("should handle zero usage", async () => {
      (redis.hgetall as jest.Mock).mockResolvedValue({});

      const quota = await tracker.getQuotaEstimate();

      expect(quota.currentRequests).toBe(0);
      expect(quota.quotaRemaining).toBe("100.0%");
      expect(quota.estimatedDailyRequests).toBe(0);
    });

    it("should handle high usage scenario", async () => {
      (redis.hgetall as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(":day:")) {
          return Promise.resolve({
            requests: "4500",
            tokens: "0",
            cost: "0",
            errors: "0",
            rateLimitHits: "0",
          });
        }
        return Promise.resolve({
          requests: "100",
          tokens: "0",
          cost: "0",
          errors: "0",
          rateLimitHits: "0",
        });
      });

      jest.spyOn(Date.prototype, "getHours").mockReturnValue(23);

      const quota = await tracker.getQuotaEstimate();

      expect(quota.currentRequests).toBe(4500);
      expect(quota.maxRequestsPerDay).toBeGreaterThanOrEqual(4500);
      expect(quota.quotaRemaining).toMatch(/^\d+\.\d%$/);
    });

    it("should handle Redis failure gracefully", async () => {
      (redis.hgetall as jest.Mock).mockRejectedValue(new Error("Redis error"));

      const quota = await tracker.getQuotaEstimate();

      expect(quota.maxRequestsPerDay).toBe(50);
      expect(quota.currentRequests).toBe(0);
      expect(quota.quotaRemaining).toBe("100.0%");
    });
  });

  // ===========================================================================
  // getDetailedMetrics Tests
  // ===========================================================================

  describe("getDetailedMetrics", () => {
    it("should return detailed metrics by model and category", async () => {
      (metricsCollector.getCounterValues as jest.Mock)
        .mockReturnValueOnce([
          { labels: { model: "claude-sonnet-4", category: "code", success: "true" }, value: 10 },
          { labels: { model: "claude-opus-4", category: "analysis", success: "true" }, value: 5 },
        ])
        .mockReturnValueOnce([
          { labels: { model: "claude-sonnet-4", type: "total" }, value: 15000 },
          { labels: { model: "claude-opus-4", type: "total" }, value: 25000 },
        ])
        .mockReturnValueOnce([
          { labels: { model: "claude-sonnet-4", category: "code" }, value: 0.15 },
          { labels: { model: "claude-opus-4", category: "analysis" }, value: 0.45 },
        ]);

      const detailed = await tracker.getDetailedMetrics();

      expect(detailed.byModel["claude-sonnet-4"]).toEqual({
        requests: 10,
        tokens: 15000,
        cost: 0.15,
      });

      expect(detailed.byModel["claude-opus-4"]).toEqual({
        requests: 5,
        tokens: 25000,
        cost: 0.45,
      });

      expect(detailed.byCategory["code"]).toEqual({
        requests: 10,
        cost: 0.15,
      });

      expect(detailed.byCategory["analysis"]).toEqual({
        requests: 5,
        cost: 0.45,
      });
    });

    it("should return empty objects when no metrics exist", async () => {
      (metricsCollector.getCounterValues as jest.Mock).mockReturnValue([]);

      const detailed = await tracker.getDetailedMetrics();

      expect(detailed.byModel).toEqual({});
      expect(detailed.byCategory).toEqual({});
    });

    it("should handle missing labels gracefully", async () => {
      (metricsCollector.getCounterValues as jest.Mock)
        .mockReturnValueOnce([{ labels: {}, value: 10 }]) // Missing model/category
        .mockReturnValueOnce([{ labels: {}, value: 15000 }])
        .mockReturnValueOnce([{ labels: {}, value: 0.15 }]);

      const detailed = await tracker.getDetailedMetrics();

      expect(detailed.byModel).toEqual({});
      expect(detailed.byCategory).toEqual({});
    });

    it("should aggregate multiple requests for same model", async () => {
      const requestCounters = [
        { labels: { model: "claude-sonnet-4", category: "code" }, value: 5 },
        { labels: { model: "claude-sonnet-4", category: "analysis" }, value: 3 },
      ];

      (metricsCollector.getCounterValues as jest.Mock).mockImplementation((name: string) => {
        if (name === "anthropic_requests_total") return requestCounters;
        if (name === "anthropic_tokens_total")
          return [{ labels: { model: "claude-sonnet-4", type: "total" }, value: 10000 }];
        if (name === "anthropic_cost_total")
          return [
            { labels: { model: "claude-sonnet-4", category: "code" }, value: 0.1 },
            { labels: { model: "claude-sonnet-4", category: "analysis" }, value: 0.05 },
          ];
        return [];
      });

      const detailed = await tracker.getDetailedMetrics();

      expect(detailed.byModel["claude-sonnet-4"].requests).toBe(8);
      expect(detailed.byModel["claude-sonnet-4"].tokens).toBe(10000);
      expect(detailed.byModel["claude-sonnet-4"].cost).toBeCloseTo(0.15, 2);
    });

    it("should handle error gracefully", async () => {
      (metricsCollector.getCounterValues as jest.Mock).mockImplementation(() => {
        throw new Error("Metrics collector error");
      });

      const detailed = await tracker.getDetailedMetrics();

      expect(detailed.byModel).toEqual({});
      expect(detailed.byCategory).toEqual({});
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
