// Analytics Trend Analyzer - Calculate trends and detect anomalies
import { logger } from "../../utils/logger";
import type { AgentMetrics, DailyMetrics } from "./metrics-aggregator";

// ============================================================================
// INTERFACES
// ============================================================================

export interface Trend {
  metric: string;
  direction: "up" | "down" | "stable";
  changePercent: number;
  previousValue: number;
  currentValue: number;
  significance: "low" | "medium" | "high";
}

export interface Anomaly {
  metric: string;
  value: number;
  expectedValue: number;
  deviationPercent: number;
  timestamp: Date;
  severity: "warning" | "critical";
}

export interface ForecastResult {
  metric: string;
  predictions: Array<{
    date: string;
    predictedValue: number;
    confidenceLow: number;
    confidenceHigh: number;
  }>;
  trend: "increasing" | "decreasing" | "stable";
  reliability: "low" | "medium" | "high";
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

export function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; rSquared: number } {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: calculateMean(y), rSquared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssTot = sumYY - n * yMean * yMean;
  const ssRes = y.reduce((sum, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return sum + Math.pow(yi - predicted, 2);
  }, 0);

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared: Math.max(0, Math.min(1, rSquared)) };
}

// ============================================================================
// TREND ANALYZER CLASS
// ============================================================================

export class TrendAnalyzer {
  private readonly STABLE_THRESHOLD = 2; // % change considered stable

  /**
   * Compare current period metrics to previous period
   */
  analyzeTrends(current: AgentMetrics, previous: AgentMetrics): Trend[] {
    const trends: Trend[] = [];

    const metricsToCompare: Array<{
      name: string;
      current: number;
      previous: number;
      invertBetter?: boolean; // true if lower is better
    }> = [
      {
        name: "successRate",
        current: current.successRate,
        previous: previous.successRate,
      },
      {
        name: "avgLatencyMs",
        current: current.avgLatencyMs,
        previous: previous.avgLatencyMs,
        invertBetter: true,
      },
      {
        name: "totalCostCents",
        current: current.totalCostCents,
        previous: previous.totalCostCents,
        invertBetter: true,
      },
      {
        name: "totalExecutions",
        current: current.totalExecutions,
        previous: previous.totalExecutions,
      },
      {
        name: "avgRating",
        current: current.avgRating,
        previous: previous.avgRating,
      },
      {
        name: "uniqueUsers",
        current: current.uniqueUsers,
        previous: previous.uniqueUsers,
      },
    ];

    for (const metric of metricsToCompare) {
      const changePercent = this.calculateChangePercent(metric.previous, metric.current);
      const direction = this.getDirection(changePercent);
      const significance = this.getSignificance(changePercent);

      trends.push({
        metric: metric.name,
        direction,
        changePercent: Math.round(changePercent * 100) / 100,
        previousValue: metric.previous,
        currentValue: metric.current,
        significance,
      });
    }

    logger.debug("Analyzed trends", {
      agentId: current.agentId,
      trendCount: trends.length,
    });

    return trends;
  }

  /**
   * Detect anomalies in time series metrics
   */
  detectAnomalies(metrics: DailyMetrics[], stdDevThreshold: number = 2): Anomaly[] {
    const anomalies: Anomaly[] = [];

    if (metrics.length < 3) {
      logger.debug("Insufficient data for anomaly detection", { count: metrics.length });
      return anomalies;
    }

    const metricKeys: Array<keyof Omit<DailyMetrics, "date">> = [
      "executions",
      "successCount",
      "avgLatencyMs",
      "costCents",
    ];

    for (const metricKey of metricKeys) {
      const values = metrics.map((m) => m[metricKey]);
      const mean = calculateMean(values);
      const stdDev = calculateStdDev(values);

      if (stdDev === 0) continue;

      metrics.forEach((m) => {
        const value = m[metricKey];
        const zScore = Math.abs((value - mean) / stdDev);

        if (zScore >= stdDevThreshold) {
          const deviationPercent = ((value - mean) / mean) * 100;
          anomalies.push({
            metric: metricKey,
            value,
            expectedValue: Math.round(mean * 100) / 100,
            deviationPercent: Math.round(deviationPercent * 100) / 100,
            timestamp: new Date(m.date),
            severity: zScore >= 3 ? "critical" : "warning",
          });
        }
      });
    }

    logger.debug("Detected anomalies", { count: anomalies.length });
    return anomalies;
  }

  /**
   * Forecast future metrics using linear regression
   */
  forecast(historicalMetrics: DailyMetrics[], daysAhead: number = 7): ForecastResult {
    if (historicalMetrics.length < 5) {
      logger.warn("Insufficient historical data for forecasting", {
        count: historicalMetrics.length,
      });
      return {
        metric: "executions",
        predictions: [],
        trend: "stable",
        reliability: "low",
      };
    }

    // Use executions as primary forecast metric
    const x = historicalMetrics.map((_, i) => i);
    const y = historicalMetrics.map((m) => m.executions);

    const { slope, intercept, rSquared } = linearRegression(x, y);
    const stdDev = calculateStdDev(y);

    // Determine trend direction
    let trend: ForecastResult["trend"];
    const slopePercent = y[0] > 0 ? (slope / y[0]) * 100 : 0;
    if (slopePercent > 2) {
      trend = "increasing";
    } else if (slopePercent < -2) {
      trend = "decreasing";
    } else {
      trend = "stable";
    }

    // Determine reliability based on R-squared
    let reliability: ForecastResult["reliability"];
    if (rSquared >= 0.7) {
      reliability = "high";
    } else if (rSquared >= 0.4) {
      reliability = "medium";
    } else {
      reliability = "low";
    }

    // Generate predictions
    const predictions: ForecastResult["predictions"] = [];
    const lastDate = new Date(historicalMetrics[historicalMetrics.length - 1].date);

    for (let i = 1; i <= daysAhead; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + i);

      const xValue = historicalMetrics.length + i - 1;
      const predictedValue = Math.max(0, Math.round(slope * xValue + intercept));

      // 95% confidence interval
      const confidenceMargin = 1.96 * stdDev;

      predictions.push({
        date: futureDate.toISOString().split("T")[0],
        predictedValue,
        confidenceLow: Math.max(0, Math.round(predictedValue - confidenceMargin)),
        confidenceHigh: Math.round(predictedValue + confidenceMargin),
      });
    }

    logger.debug("Generated forecast", {
      daysAhead,
      trend,
      reliability,
      rSquared: Math.round(rSquared * 100) / 100,
    });

    return {
      metric: "executions",
      predictions,
      trend,
      reliability,
    };
  }

  /**
   * Calculate percentage change between two values
   */
  private calculateChangePercent(previous: number, current: number): number {
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * Determine trend direction based on change percentage
   */
  private getDirection(changePercent: number): Trend["direction"] {
    if (Math.abs(changePercent) <= this.STABLE_THRESHOLD) {
      return "stable";
    }
    return changePercent > 0 ? "up" : "down";
  }

  /**
   * Determine significance of change
   */
  private getSignificance(changePercent: number): Trend["significance"] {
    const absChange = Math.abs(changePercent);

    if (absChange <= 5) return "low";
    if (absChange <= 20) return "medium";
    return "high";
  }
}

// Export singleton instance
export const trendAnalyzer = new TrendAnalyzer();
export default TrendAnalyzer;
