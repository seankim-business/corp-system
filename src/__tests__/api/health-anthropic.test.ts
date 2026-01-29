import request from "supertest";
import express from "express";
import healthRouter from "../../api/health-anthropic";
import { anthropicMetricsTracker } from "../../services/anthropic-metrics";
import { logger } from "../../utils/logger";

jest.mock("../../services/anthropic-metrics");
jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const mockTracker = anthropicMetricsTracker as jest.Mocked<typeof anthropicMetricsTracker>;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/health", healthRouter);
  return app;
}

describe("GET /health/anthropic", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("should return 200 with complete usage metrics", async () => {
    mockTracker.getUsageStats.mockImplementation(async (window) => {
      if (window === "minute") {
        return {
          requests: 5,
          tokens: 7500,
          cost: 0.075,
          errors: 0,
          rateLimitHits: 0,
        };
      }
      if (window === "hour") {
        return {
          requests: 100,
          tokens: 150000,
          cost: 1.5,
          errors: 2,
          rateLimitHits: 0,
        };
      }
      return {
        requests: 1200,
        tokens: 1800000,
        cost: 18.0,
        errors: 5,
        rateLimitHits: 1,
      };
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 1200,
      quotaRemaining: "0.0%",
      estimatedDailyRequests: 1200,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {
        "claude-sonnet-4": { requests: 800, tokens: 1200000, cost: 12.0 },
        "claude-opus-4": { requests: 400, tokens: 600000, cost: 6.0 },
      },
      byCategory: {
        "code-generation": { requests: 700, cost: 10.5 },
        analysis: { requests: 500, cost: 7.5 },
      },
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      timestamp: expect.any(String),
      current_usage: {
        last_minute: {
          requests: 5,
          tokens: 7500,
          cost: 0.075,
          errors: 0,
          rate_limit_hits: 0,
        },
        last_hour: {
          requests: 100,
          tokens: 150000,
          cost: 1.5,
          errors: 2,
          rate_limit_hits: 0,
        },
        today: {
          requests: 1200,
          tokens: 1800000,
          cost: 18.0,
          errors: 5,
          rate_limit_hits: 1,
        },
      },
      quota: {
        max_requests_per_day: 1000,
        current_requests: 1200,
        quota_remaining: "0.0%",
        estimated_daily_requests: 1200,
      },
      breakdown: {
        by_model: {
          "claude-sonnet-4": { requests: 800, tokens: 1200000, cost: 12.0 },
          "claude-opus-4": { requests: 400, tokens: 600000, cost: 6.0 },
        },
        by_category: {
          "code-generation": { requests: 700, cost: 10.5 },
          analysis: { requests: 500, cost: 7.5 },
        },
      },
      warnings: expect.any(Array),
    });
  });

  it("should include all required fields in response", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 0,
      quotaRemaining: "100.0%",
      estimatedDailyRequests: 0,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.body).toHaveProperty("current_usage");
    expect(response.body).toHaveProperty("quota");
    expect(response.body).toHaveProperty("breakdown");
    expect(response.body).toHaveProperty("warnings");
  });

  it("should generate warning when quota remaining is below 20%", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 850,
      quotaRemaining: "15.0%",
      estimatedDailyRequests: 850,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).toContain("Low quota remaining: 15.0%");
  });

  it("should generate warning when rate limit hits detected", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 0,
      rateLimitHits: 3,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 100,
      quotaRemaining: "90.0%",
      estimatedDailyRequests: 100,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).toContain("Rate limit hit 3 times today");
  });

  it("should generate warning when error rate exceeds 5%", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 10,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 100,
      quotaRemaining: "90.0%",
      estimatedDailyRequests: 100,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).toContain("High error rate: 10.0%");
  });

  it("should generate warning when approaching daily limit", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 500,
      quotaRemaining: "50.0%",
      estimatedDailyRequests: 850,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).toContain(
      "Estimated daily requests (850) approaching limit (1000)",
    );
  });

  it("should generate multiple warnings when multiple issues detected", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 10,
      rateLimitHits: 2,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 900,
      quotaRemaining: "10.0%",
      estimatedDailyRequests: 950,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings.length).toBeGreaterThanOrEqual(3);
    expect(response.body.warnings).toContain("Low quota remaining: 10.0%");
    expect(response.body.warnings).toContain("Rate limit hit 2 times today");
    expect(response.body.warnings).toContain("High error rate: 10.0%");
  });

  it("should return empty warnings array when no issues detected", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 2,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 100,
      quotaRemaining: "90.0%",
      estimatedDailyRequests: 200,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).toEqual([]);
  });

  it("should return 500 when metrics tracker throws error", async () => {
    mockTracker.getUsageStats.mockRejectedValue(new Error("Redis connection failed"));

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      error: "Redis connection failed",
      timestamp: expect.any(String),
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to fetch Anthropic health metrics",
      expect.objectContaining({
        error: "Redis connection failed",
      }),
    );
  });

  it("should handle partial metric failure gracefully", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockRejectedValue(new Error("Quota calculation failed"));

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it("should round cost values to 4 decimal places", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.234567,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 100,
      quotaRemaining: "90.0%",
      estimatedDailyRequests: 200,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.current_usage.last_minute.cost).toBe(1.2346);
  });

  it("should handle zero requests without division by zero error", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 0,
      quotaRemaining: "100.0%",
      estimatedDailyRequests: 0,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.warnings).not.toContain(expect.stringContaining("NaN"));
  });

  it("should handle concurrent requests without race conditions", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 100,
      tokens: 150000,
      cost: 1.5,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 100,
      quotaRemaining: "90.0%",
      estimatedDailyRequests: 200,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const responses = await Promise.all([
      request(app).get("/health/anthropic"),
      request(app).get("/health/anthropic"),
      request(app).get("/health/anthropic"),
    ]);

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.every((r) => r.body.success === true)).toBe(true);
  });

  it("should return consistent timestamp format", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 0,
      quotaRemaining: "100.0%",
      estimatedDailyRequests: 0,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should include detailed breakdown by model", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 0,
      quotaRemaining: "100.0%",
      estimatedDailyRequests: 0,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {
        "claude-sonnet-4": { requests: 500, tokens: 750000, cost: 7.5 },
        "claude-haiku-3.5": { requests: 300, tokens: 450000, cost: 2.25 },
      },
      byCategory: {},
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.breakdown.by_model).toHaveProperty("claude-sonnet-4");
    expect(response.body.breakdown.by_model).toHaveProperty("claude-haiku-3.5");
  });

  it("should include detailed breakdown by category", async () => {
    mockTracker.getUsageStats.mockResolvedValue({
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      rateLimitHits: 0,
    });

    mockTracker.getQuotaEstimate.mockResolvedValue({
      maxRequestsPerDay: 1000,
      currentRequests: 0,
      quotaRemaining: "100.0%",
      estimatedDailyRequests: 0,
    });

    mockTracker.getDetailedMetrics.mockResolvedValue({
      byModel: {},
      byCategory: {
        "code-generation": { requests: 400, cost: 6.0 },
        analysis: { requests: 300, cost: 4.5 },
        writing: { requests: 100, cost: 1.5 },
      },
    });

    const response = await request(app).get("/health/anthropic");

    expect(response.status).toBe(200);
    expect(response.body.breakdown.by_category).toHaveProperty("code-generation");
    expect(response.body.breakdown.by_category).toHaveProperty("analysis");
    expect(response.body.breakdown.by_category).toHaveProperty("writing");
  });
});
