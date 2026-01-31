/**
 * Usage Anomaly Detector
 *
 * Detects unusual usage patterns including traffic spikes and drops.
 */

import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { redis } from "../../../db/redis";
import {
  AnomalyDetector,
  DetectorResult,
  UsageConfig,
  AnomalyType,
  AnomalySeverity,
} from "../types";

const DEFAULT_CONFIG: UsageConfig = {
  enabled: true,
  warningThreshold: 2,
  criticalThreshold: 3,
  sampleWindowMs: 5 * 60 * 1000, // 5 minutes
  minSampleSize: 5,
  baselineWindowMs: 60 * 60 * 1000, // 1 hour
  requestRateMultiplier: 3, // 3x normal = spike
  minimumRequestsPerMinute: 1,
};

const BASELINE_CACHE_PREFIX = "anomaly:usage:baseline:";
const BASELINE_CACHE_TTL = 3600; // 1 hour

interface UsageStats {
  totalRequests: number;
  requestsPerMinute: number;
  uniqueSessions: number;
  byCategory: Record<string, number>;
}

export class UsageAnomalyDetector implements AnomalyDetector {
  name = "usage-anomaly";
  type: AnomalyType = "usage";
  private config: UsageConfig;

  constructor(config: Partial<UsageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(config: Partial<UsageConfig>): void {
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

      // Get current usage stats
      const currentStats = await this.getUsageStats(organizationId, sampleStart, now);

      // Skip if minimal activity
      if (currentStats.requestsPerMinute < this.config.minimumRequestsPerMinute) {
        logger.debug("Minimal activity for usage detection", {
          organizationId,
          requestsPerMinute: currentStats.requestsPerMinute,
        });
        return [];
      }

      // Get baseline stats
      const baselineStats = await this.getBaselineStats(organizationId, baselineStart, sampleStart);

      // Detect traffic spike
      const spikeResult = this.detectSpike(currentStats, baselineStats);
      if (spikeResult.isAnomaly) {
        results.push({
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity: spikeResult.severity,
            description: this.buildSpikeDescription(currentStats, baselineStats),
            metric: "requests_per_minute",
            expectedValue: baselineStats.requestsPerMinute,
            actualValue: currentStats.requestsPerMinute,
            deviation: spikeResult.deviation,
            timeRange: { start: sampleStart, end: now },
            suggestedActions: this.getSpikeSuggestedActions(),
            autoResolvable: true,
            metadata: {
              currentRequests: currentStats.totalRequests,
              currentRpm: currentStats.requestsPerMinute,
              baselineRpm: baselineStats.requestsPerMinute,
              uniqueSessions: currentStats.uniqueSessions,
              byCategory: currentStats.byCategory,
            },
          },
        });
      }

      // Detect traffic drop
      const dropResult = this.detectDrop(currentStats, baselineStats);
      if (dropResult.isAnomaly) {
        results.push({
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity: dropResult.severity,
            description: this.buildDropDescription(currentStats, baselineStats),
            metric: "requests_per_minute_drop",
            expectedValue: baselineStats.requestsPerMinute,
            actualValue: currentStats.requestsPerMinute,
            deviation: dropResult.deviation,
            timeRange: { start: sampleStart, end: now },
            suggestedActions: this.getDropSuggestedActions(),
            autoResolvable: false,
            metadata: {
              currentRequests: currentStats.totalRequests,
              currentRpm: currentStats.requestsPerMinute,
              baselineRpm: baselineStats.requestsPerMinute,
              dropPercent: ((baselineStats.requestsPerMinute - currentStats.requestsPerMinute) /
                          baselineStats.requestsPerMinute * 100).toFixed(1),
            },
          },
        });
      }

      // Detect unusual category distribution
      const categoryResult = await this.detectCategoryAnomaly(
        organizationId,
        currentStats,
        baselineStats,
        sampleStart,
        now,
      );
      if (categoryResult) {
        results.push(categoryResult);
      }
    } catch (error) {
      logger.error("Usage anomaly detection failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  private async getUsageStats(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<UsageStats> {
    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        sessionId: true,
        category: true,
      },
    });

    const windowMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    const totalRequests = executions.length;
    const requestsPerMinute = windowMinutes > 0 ? totalRequests / windowMinutes : 0;

    const uniqueSessions = new Set(executions.map((e) => e.sessionId)).size;

    const byCategory: Record<string, number> = {};
    for (const exec of executions) {
      const category = exec.category || "uncategorized";
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      totalRequests,
      requestsPerMinute,
      uniqueSessions,
      byCategory,
    };
  }

  private async getBaselineStats(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<UsageStats> {
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
    const stats = await this.getUsageStats(organizationId, start, end);

    // Cache the baseline
    await redis.setex(cacheKey, BASELINE_CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  private detectSpike(
    current: UsageStats,
    baseline: UsageStats,
  ): { isAnomaly: boolean; severity: AnomalySeverity; deviation: number } {
    if (baseline.requestsPerMinute < this.config.minimumRequestsPerMinute) {
      // No reliable baseline
      return { isAnomaly: false, severity: "warning", deviation: 0 };
    }

    const ratio = current.requestsPerMinute / baseline.requestsPerMinute;

    // Critical: more than 5x baseline
    if (ratio >= this.config.requestRateMultiplier * 1.5) {
      return {
        isAnomaly: true,
        severity: "critical",
        deviation: ratio,
      };
    }

    // Warning: more than 3x baseline
    if (ratio >= this.config.requestRateMultiplier) {
      return {
        isAnomaly: true,
        severity: "warning",
        deviation: ratio,
      };
    }

    return { isAnomaly: false, severity: "warning", deviation: ratio };
  }

  private detectDrop(
    current: UsageStats,
    baseline: UsageStats,
  ): { isAnomaly: boolean; severity: AnomalySeverity; deviation: number } {
    if (baseline.requestsPerMinute < this.config.minimumRequestsPerMinute * 5) {
      // Baseline too low to detect drops reliably
      return { isAnomaly: false, severity: "warning", deviation: 0 };
    }

    const ratio = current.requestsPerMinute / baseline.requestsPerMinute;

    // Critical: less than 5% of baseline
    if (ratio < 0.05) {
      return {
        isAnomaly: true,
        severity: "critical",
        deviation: 1 / ratio,
      };
    }

    // Warning: less than 10% of baseline
    if (ratio < 0.1) {
      return {
        isAnomaly: true,
        severity: "warning",
        deviation: 1 / ratio,
      };
    }

    return { isAnomaly: false, severity: "warning", deviation: 0 };
  }

  private async detectCategoryAnomaly(
    organizationId: string,
    current: UsageStats,
    baseline: UsageStats,
    sampleStart: Date,
    sampleEnd: Date,
  ): Promise<DetectorResult | null> {
    // Check if a category suddenly dominates or disappears
    for (const [category, count] of Object.entries(current.byCategory)) {
      const currentPercent = current.totalRequests > 0
        ? (count / current.totalRequests) * 100
        : 0;
      const baselineCount = baseline.byCategory[category] || 0;
      const baselinePercent = baseline.totalRequests > 0
        ? (baselineCount / baseline.totalRequests) * 100
        : 0;

      // New category appearing with significant volume
      if (baselinePercent < 5 && currentPercent > 30) {
        return {
          detected: true,
          anomaly: {
            organizationId,
            type: this.type,
            severity: "warning",
            description: `Unusual increase in "${category}" requests: ${currentPercent.toFixed(1)}% (was ${baselinePercent.toFixed(1)}%)`,
            metric: `category_${category}_percent`,
            expectedValue: baselinePercent,
            actualValue: currentPercent,
            deviation: currentPercent / Math.max(baselinePercent, 1),
            timeRange: { start: sampleStart, end: sampleEnd },
            suggestedActions: [
              `Review recent "${category}" activity`,
              "Check if this is expected behavior change",
              "Verify agent routing configuration",
            ],
            autoResolvable: true,
            metadata: {
              category,
              currentCount: count,
              baselineCount,
              currentPercent,
              baselinePercent,
            },
          },
        };
      }
    }

    return null;
  }

  private buildSpikeDescription(current: UsageStats, baseline: UsageStats): string {
    const ratio = (current.requestsPerMinute / baseline.requestsPerMinute).toFixed(1);
    return (
      `Traffic spike detected: ${current.requestsPerMinute.toFixed(1)} req/min ` +
      `(${ratio}x baseline of ${baseline.requestsPerMinute.toFixed(1)} req/min). ` +
      `${current.uniqueSessions} unique sessions in the last 5 minutes.`
    );
  }

  private buildDropDescription(current: UsageStats, baseline: UsageStats): string {
    const dropPercent = ((baseline.requestsPerMinute - current.requestsPerMinute) /
                        baseline.requestsPerMinute * 100).toFixed(1);
    return (
      `Traffic drop detected: ${current.requestsPerMinute.toFixed(1)} req/min ` +
      `(${dropPercent}% below baseline of ${baseline.requestsPerMinute.toFixed(1)} req/min). ` +
      `This may indicate an outage or integration issue.`
    );
  }

  private getSpikeSuggestedActions(): string[] {
    return [
      "Monitor system resources (CPU, memory)",
      "Check for automated processes or batch jobs",
      "Review rate limiting configuration",
      "Verify this is not a DoS attempt",
    ];
  }

  private getDropSuggestedActions(): string[] {
    return [
      "Check if Slack integration is healthy",
      "Verify API endpoints are responding",
      "Review recent configuration changes",
      "Check for upstream service outages",
    ];
  }
}

export const usageAnomalyDetector = new UsageAnomalyDetector();
