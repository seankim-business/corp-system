/**
 * Latency Anomaly Detector
 *
 * Detects performance degradation using percentile analysis and statistical methods.
 */

import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { redis } from "../../../db/redis";
import {
  AnomalyDetector,
  DetectorResult,
  LatencyConfig,
  AnomalyType,
  AnomalySeverity,
  StatisticalSummary,
} from "../types";

const DEFAULT_CONFIG: LatencyConfig = {
  enabled: true,
  warningThreshold: 2, // 2 standard deviations
  criticalThreshold: 3, // 3 standard deviations
  sampleWindowMs: 5 * 60 * 1000, // 5 minutes
  minSampleSize: 10,
  baselineWindowMs: 60 * 60 * 1000, // 1 hour
  p95ThresholdMs: 30000, // 30 seconds
  p99ThresholdMs: 60000, // 60 seconds
};

const BASELINE_CACHE_PREFIX = "anomaly:latency:baseline:";
const BASELINE_CACHE_TTL = 3600; // 1 hour

export class LatencyAnomalyDetector implements AnomalyDetector {
  name = "latency-anomaly";
  type: AnomalyType = "latency";
  private config: LatencyConfig;

  constructor(config: Partial<LatencyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(config: Partial<LatencyConfig>): void {
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

      // Get current latency stats
      const currentDurations = await this.getLatencies(organizationId, sampleStart, now);

      if (currentDurations.length < this.config.minSampleSize) {
        logger.debug("Insufficient samples for latency detection", {
          organizationId,
          samples: currentDurations.length,
          minRequired: this.config.minSampleSize,
        });
        return [];
      }

      // Get baseline stats
      const baselineStats = await this.getBaselineStats(organizationId, baselineStart, sampleStart);
      const currentStats = this.calculateStats(currentDurations);

      // Check P95 threshold
      const p95Result = this.analyzeLatency(
        currentStats.p95,
        baselineStats.p95,
        this.config.p95ThresholdMs,
        "p95",
      );

      if (p95Result.isAnomaly) {
        results.push({
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity: p95Result.severity,
            description: this.buildDescription("P95", currentStats.p95, baselineStats.p95),
            metric: "latency_p95",
            expectedValue: baselineStats.p95,
            actualValue: currentStats.p95,
            deviation: p95Result.deviation,
            timeRange: { start: sampleStart, end: now },
            suggestedActions: this.getSuggestedActions(currentStats, baselineStats),
            autoResolvable: false,
            metadata: {
              currentP50: currentStats.p50,
              currentP95: currentStats.p95,
              currentP99: currentStats.p99,
              currentMean: currentStats.mean,
              baselineP95: baselineStats.p95,
              baselineP99: baselineStats.p99,
              baselineMean: baselineStats.mean,
              sampleCount: currentStats.count,
            },
          },
        });
      }

      // Check P99 threshold (only if P95 didn't trigger critical)
      if (p95Result.severity !== "critical") {
        const p99Result = this.analyzeLatency(
          currentStats.p99,
          baselineStats.p99,
          this.config.p99ThresholdMs,
          "p99",
        );

        if (p99Result.isAnomaly) {
          results.push({
            detected: true,
            anomaly: {
              organizationId,
              type: this.type,
              severity: p99Result.severity,
              description: this.buildDescription("P99", currentStats.p99, baselineStats.p99),
              metric: "latency_p99",
              expectedValue: baselineStats.p99,
              actualValue: currentStats.p99,
              deviation: p99Result.deviation,
              timeRange: { start: sampleStart, end: now },
              suggestedActions: this.getSuggestedActions(currentStats, baselineStats),
              autoResolvable: false,
              metadata: {
                currentP50: currentStats.p50,
                currentP95: currentStats.p95,
                currentP99: currentStats.p99,
                baselineP99: baselineStats.p99,
                sampleCount: currentStats.count,
              },
            },
          });
        }
      }
    } catch (error) {
      logger.error("Latency anomaly detection failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  private async getLatencies(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<number[]> {
    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: start, lte: end },
        status: "success", // Only count successful executions for latency
      },
      select: {
        duration: true,
      },
    });

    return executions
      .map((e) => e.duration)
      .filter((d): d is number => d !== null && d > 0);
  }

  private async getBaselineStats(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<StatisticalSummary> {
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
    const durations = await this.getLatencies(organizationId, start, end);
    const stats = this.calculateStats(durations);

    // Cache the baseline
    await redis.setex(cacheKey, BASELINE_CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  private calculateStats(values: number[]): StatisticalSummary {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        mean: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    // Calculate standard deviation
    const squaredDiffs = sorted.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      count,
      sum,
      mean,
      stdDev,
      min: sorted[0],
      max: sorted[count - 1],
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(p * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private analyzeLatency(
    current: number,
    baseline: number,
    absoluteThreshold: number,
    _metric: string,
  ): { isAnomaly: boolean; severity: AnomalySeverity; deviation: number } {
    // Check absolute threshold first
    if (current >= absoluteThreshold * 2) {
      return {
        isAnomaly: true,
        severity: "critical",
        deviation: current / Math.max(baseline, 1),
      };
    }

    if (current >= absoluteThreshold) {
      return {
        isAnomaly: true,
        severity: "warning",
        deviation: current / Math.max(baseline, 1),
      };
    }

    // Check relative increase from baseline
    if (baseline > 0) {
      const ratio = current / baseline;

      // Critical: more than 3x baseline
      if (ratio >= 3) {
        return {
          isAnomaly: true,
          severity: "critical",
          deviation: ratio,
        };
      }

      // Warning: more than 2x baseline
      if (ratio >= 2) {
        return {
          isAnomaly: true,
          severity: "warning",
          deviation: ratio,
        };
      }
    }

    return { isAnomaly: false, severity: "warning", deviation: 0 };
  }

  private buildDescription(percentile: string, current: number, baseline: number): string {
    const currentSec = (current / 1000).toFixed(2);
    const baselineSec = (baseline / 1000).toFixed(2);
    const increase = baseline > 0 ? ((current - baseline) / baseline * 100).toFixed(1) : "N/A";

    return (
      `${percentile} latency increased to ${currentSec}s ` +
      `(baseline: ${baselineSec}s, +${increase}%). ` +
      `Response times are degraded.`
    );
  }

  private getSuggestedActions(
    current: StatisticalSummary,
    baseline: StatisticalSummary,
  ): string[] {
    const actions: string[] = [
      "Review recent deployments for performance regressions",
      "Check database query performance",
      "Monitor external API response times",
    ];

    // Add specific actions based on degradation pattern
    if (current.p99 / current.p50 > 10) {
      actions.push("Investigate high tail latency (P99 >> P50)");
      actions.push("Look for specific slow queries or operations");
    }

    if (current.mean > baseline.mean * 2) {
      actions.push("General slowdown detected - check system resources");
      actions.push("Review concurrent load patterns");
    }

    if (current.max > baseline.max * 3) {
      actions.push("Extreme outliers detected - check for blocking operations");
    }

    return actions;
  }
}

export const latencyAnomalyDetector = new LatencyAnomalyDetector();
