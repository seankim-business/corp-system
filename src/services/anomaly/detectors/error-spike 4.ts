/**
 * Error Spike Detector
 *
 * Detects sudden increases in error rates using statistical methods.
 */

import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { redis } from "../../../db/redis";
import {
  AnomalyDetector,
  DetectorResult,
  ErrorSpikeConfig,
  AnomalyType,
  AnomalySeverity,
} from "../types";

const DEFAULT_CONFIG: ErrorSpikeConfig = {
  enabled: true,
  warningThreshold: 2, // 2 standard deviations
  criticalThreshold: 3, // 3 standard deviations
  sampleWindowMs: 5 * 60 * 1000, // 5 minutes
  minSampleSize: 10,
  baselineWindowMs: 60 * 60 * 1000, // 1 hour
  errorRateWarning: 10, // 10%
  errorRateCritical: 25, // 25%
};

const BASELINE_CACHE_PREFIX = "anomaly:error_spike:baseline:";
const BASELINE_CACHE_TTL = 3600; // 1 hour

interface ErrorStats {
  total: number;
  failed: number;
  errorRate: number;
  byType: Record<string, number>;
}

export class ErrorSpikeDetector implements AnomalyDetector {
  name = "error-spike";
  type: AnomalyType = "error_spike";
  private config: ErrorSpikeConfig;

  constructor(config: Partial<ErrorSpikeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(config: Partial<ErrorSpikeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async detect(organizationId: string): Promise<DetectorResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    const results: DetectorResult[] = [];

    try {
      const now = new Date();
      const sampleStart = new Date(now.getTime() - this.config.sampleWindowMs);
      const baselineStart = new Date(now.getTime() - this.config.baselineWindowMs);

      // Get current error stats
      const currentStats = await this.getErrorStats(organizationId, sampleStart, now);

      if (currentStats.total < this.config.minSampleSize) {
        logger.debug("Insufficient samples for error spike detection", {
          organizationId,
          samples: currentStats.total,
          minRequired: this.config.minSampleSize,
        });
        return [];
      }

      // Get baseline stats
      const baselineStats = await this.getBaselineStats(organizationId, baselineStart, sampleStart);

      // Calculate deviation
      const { isAnomaly, severity, deviation } = this.analyzeErrorRate(
        currentStats,
        baselineStats,
      );

      if (isAnomaly) {
        results.push({
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity,
            description: this.buildDescription(currentStats, baselineStats),
            metric: "error_rate",
            expectedValue: baselineStats.errorRate,
            actualValue: currentStats.errorRate,
            deviation,
            timeRange: { start: sampleStart, end: now },
            suggestedActions: this.getSuggestedActions(currentStats),
            autoResolvable: false,
            metadata: {
              totalRequests: currentStats.total,
              failedRequests: currentStats.failed,
              errorsByType: currentStats.byType,
              baselineErrorRate: baselineStats.errorRate,
              baselineSamples: baselineStats.total,
            },
          },
        });
      }

      // Also check for per-agent error spikes
      const agentResults = await this.detectAgentAnomalies(
        organizationId,
        sampleStart,
        now,
        baselineStart,
      );
      results.push(...agentResults);
    } catch (error) {
      logger.error("Error spike detection failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  private async getErrorStats(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<ErrorStats> {
    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        status: true,
        errorMessage: true,
      },
    });

    const total = executions.length;
    const failed = executions.filter((e) => e.status === "failed").length;
    const errorRate = total > 0 ? (failed / total) * 100 : 0;

    // Categorize errors
    const byType: Record<string, number> = {};
    for (const exec of executions) {
      if (exec.status === "failed" && exec.errorMessage) {
        const errorType = this.categorizeError(exec.errorMessage);
        byType[errorType] = (byType[errorType] || 0) + 1;
      }
    }

    return { total, failed, errorRate, byType };
  }

  private async getBaselineStats(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<ErrorStats> {
    // Try cache first
    const cacheKey = `${BASELINE_CACHE_PREFIX}${organizationId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Ignore parse errors
      }
    }

    // Calculate baseline
    const stats = await this.getErrorStats(organizationId, start, end);

    // Cache the baseline
    await redis.setex(cacheKey, BASELINE_CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  private analyzeErrorRate(
    current: ErrorStats,
    baseline: ErrorStats,
  ): { isAnomaly: boolean; severity: AnomalySeverity; deviation: number } {
    // Check absolute thresholds first
    if (current.errorRate >= this.config.errorRateCritical) {
      return {
        isAnomaly: true,
        severity: "critical",
        deviation: current.errorRate / Math.max(baseline.errorRate, 1),
      };
    }

    if (current.errorRate >= this.config.errorRateWarning) {
      return {
        isAnomaly: true,
        severity: "warning",
        deviation: current.errorRate / Math.max(baseline.errorRate, 1),
      };
    }

    // Check statistical deviation
    if (baseline.total > 0 && baseline.errorRate > 0) {
      // Simple z-score approximation using baseline rate as expected
      const expectedRate = baseline.errorRate;
      const variance = expectedRate * (100 - expectedRate) / 100;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        const deviation = (current.errorRate - expectedRate) / stdDev;

        if (deviation >= this.config.criticalThreshold) {
          return { isAnomaly: true, severity: "critical", deviation };
        }

        if (deviation >= this.config.warningThreshold) {
          return { isAnomaly: true, severity: "warning", deviation };
        }
      }
    }

    return { isAnomaly: false, severity: "warning", deviation: 0 };
  }

  private async detectAgentAnomalies(
    organizationId: string,
    sampleStart: Date,
    sampleEnd: Date,
    _baselineStart: Date,
  ): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Get per-agent error rates
    const executions = await prisma.orchestratorExecution.groupBy({
      by: ["sessionId"],
      where: {
        organizationId,
        createdAt: { gte: sampleStart, lte: sampleEnd },
      },
      _count: { status: true },
    });

    // Get agent sessions with high error rates
    const failedBySession = await prisma.orchestratorExecution.groupBy({
      by: ["sessionId"],
      where: {
        organizationId,
        status: "failed",
        createdAt: { gte: sampleStart, lte: sampleEnd },
      },
      _count: { status: true },
    });

    const failedMap = new Map(
      failedBySession.map((f) => [f.sessionId, f._count.status]),
    );

    for (const exec of executions) {
      const total = exec._count.status;
      const failed = failedMap.get(exec.sessionId) || 0;
      const errorRate = total > 0 ? (failed / total) * 100 : 0;

      if (errorRate >= this.config.errorRateCritical && total >= 5) {
        results.push({
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity: "critical",
            description: `High error rate (${errorRate.toFixed(1)}%) detected for session ${exec.sessionId}`,
            metric: "session_error_rate",
            expectedValue: this.config.errorRateWarning,
            actualValue: errorRate,
            deviation: errorRate / this.config.errorRateWarning,
            timeRange: { start: sampleStart, end: sampleEnd },
            suggestedActions: [
              "Review recent errors for this session",
              "Check agent configuration and permissions",
              "Verify external service connectivity",
            ],
            autoResolvable: false,
            metadata: {
              sessionId: exec.sessionId,
              totalRequests: total,
              failedRequests: failed,
            },
          },
        });
      }
    }

    return results;
  }

  private categorizeError(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes("timeout")) return "timeout";
    if (lowerError.includes("rate limit")) return "rate_limit";
    if (lowerError.includes("unauthorized") || lowerError.includes("401")) return "auth";
    if (lowerError.includes("forbidden") || lowerError.includes("403")) return "permission";
    if (lowerError.includes("not found") || lowerError.includes("404")) return "not_found";
    if (lowerError.includes("500") || lowerError.includes("server error")) return "server_error";
    if (lowerError.includes("network") || lowerError.includes("connection")) return "network";

    return "unknown";
  }

  private buildDescription(current: ErrorStats, baseline: ErrorStats): string {
    const rateChange = current.errorRate - baseline.errorRate;
    const direction = rateChange > 0 ? "increased" : "decreased";

    return (
      `Error rate ${direction} to ${current.errorRate.toFixed(1)}% ` +
      `(baseline: ${baseline.errorRate.toFixed(1)}%). ` +
      `${current.failed} of ${current.total} requests failed in the last 5 minutes.`
    );
  }

  private getSuggestedActions(stats: ErrorStats): string[] {
    const actions: string[] = [
      "Review recent error logs for root cause",
      "Check external service status pages",
      "Verify API credentials and permissions",
    ];

    // Add specific actions based on error types
    const topErrorType = Object.entries(stats.byType).sort(
      ([, a], [, b]) => b - a,
    )[0];

    if (topErrorType) {
      switch (topErrorType[0]) {
        case "timeout":
          actions.push("Consider increasing timeout limits");
          actions.push("Check for slow external dependencies");
          break;
        case "rate_limit":
          actions.push("Review rate limiting configuration");
          actions.push("Implement request throttling");
          break;
        case "auth":
          actions.push("Refresh API credentials");
          actions.push("Verify OAuth token expiration");
          break;
        case "network":
          actions.push("Check network connectivity");
          actions.push("Verify DNS resolution");
          break;
      }
    }

    return actions;
  }
}

export const errorSpikeDetector = new ErrorSpikeDetector();
