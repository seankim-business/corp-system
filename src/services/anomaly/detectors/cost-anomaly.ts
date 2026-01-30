/**
 * Cost Anomaly Detector
 *
 * Detects unexpected cost changes and budget anomalies.
 *
 * BLOCKED: Requires Prisma schema migration to add:
 * - AgentCostRecord table (or cost tracking on OrchestratorExecution)
 * - Cost aggregation by agent, model, and time period
 *
 * All detection methods return stubs until cost tracking exists.
 */

// import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
// import { redis } from "../../../db/redis";
import {
  AnomalyDetector,
  DetectorResult,
  CostConfig,
  AnomalyType,
  // AnomalySeverity,
} from "../types";

const DEFAULT_CONFIG: CostConfig = {
  enabled: true,
  warningThreshold: 2,
  criticalThreshold: 3,
  sampleWindowMs: 60 * 60 * 1000, // 1 hour
  minSampleSize: 5,
  baselineWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  dailyBudgetWarningPercent: 80,
  hourlySpendMultiplier: 2, // 2x normal hourly = spike
};

// const BASELINE_CACHE_PREFIX = "anomaly:cost:baseline:";
// const BASELINE_CACHE_TTL = 3600; // 1 hour

// Cost statistics interface - uncomment when implementing
// interface CostStats {
//   totalCostCents: number;
//   costPerHour: number;
//   requestCount: number;
//   avgCostPerRequest: number;
//   byAgent: Record<string, number>;
//   byModel: Record<string, number>;
// }

export class CostAnomalyDetector implements AnomalyDetector {
  name = "cost-anomaly";
  type: AnomalyType = "cost";
  private config: CostConfig;

  constructor(config: Partial<CostConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(config: Partial<CostConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect cost anomalies for an organization
   */
  async detect(_organizationId: string): Promise<DetectorResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    logger.warn("CostAnomalyDetector.detect called but not implemented - AgentCostRecord table doesn't exist yet");
    return [];
  }

  // Get cost statistics for a time window - uncomment when implementing
  // /**
  //  * Get cost statistics for a time window
  //  */
  // private async getCostStats(
  //   _organizationId: string,
  //   _start: Date,
  //   _end: Date,
  // ): Promise<CostStats> {
  //   // Return empty stats
  //   return {
  //     totalCostCents: 0,
  //     costPerHour: 0,
  //     requestCount: 0,
  //     avgCostPerRequest: 0,
  //     byAgent: {},
  //     byModel: {},
  //   };
  // }

  // Get baseline cost statistics - uncomment when implementing
  // /**
  //  * Get baseline cost statistics
  //  */
  // private async getBaselineStats(
  //   _organizationId: string,
  //   _start: Date,
  //   _end: Date,
  // ): Promise<CostStats> {
  //   // Return empty stats
  //   return {
  //     totalCostCents: 0,
  //     costPerHour: 0,
  //     requestCount: 0,
  //     avgCostPerRequest: 0,
  //     byAgent: {},
  //     byModel: {},
  //   };
  // }

  // Detect spending spikes - uncomment when implementing
  // private detectSpendSpike(
  //   current: CostStats,
  //   baseline: CostStats,
  // ): { isAnomaly: boolean; severity: AnomalySeverity; deviation: number } {
  //   if (baseline.costPerHour < 1) {
  //     // Baseline too low
  //     return { isAnomaly: false, severity: "warning", deviation: 0 };
  //   }

  //   const ratio = current.costPerHour / baseline.costPerHour;

  //   // Critical: more than 3x baseline
  //   if (ratio >= this.config.hourlySpendMultiplier * 1.5) {
  //     return {
  //       isAnomaly: true,
  //       severity: "critical",
  //       deviation: ratio,
  //     };
  //   }

  //   // Warning: more than 2x baseline
  //   if (ratio >= this.config.hourlySpendMultiplier) {
  //     return {
  //       isAnomaly: true,
  //       severity: "warning",
  //       deviation: ratio,
  //     };
  //   }

  //   return { isAnomaly: false, severity: "warning", deviation: ratio };
  // }

  // Detect budget anomalies - uncomment when implementing
  // Note: Organization.monthlyBudgetCents and currentMonthSpendCents already exist in schema
  // /**
  //  * Detect budget anomalies
  //  */
  // private async detectBudgetAnomaly(
  //   _organizationId: string,
  //   _sampleStart: Date,
  //   _sampleEnd: Date,
  // ): Promise<DetectorResult | null> {
  //   return null;
  // }

  // Detect expensive agents - uncomment when implementing
  // private detectExpensiveAgent(
  //   organizationId: string,
  //   current: CostStats,
  //   baseline: CostStats,
  //   sampleStart: Date,
  //   sampleEnd: Date,
  // ): DetectorResult | null {
  //   // Find agents with unusually high costs
  //   for (const [agentId, cost] of Object.entries(current.byAgent)) {
  //     const baselineCost = baseline.byAgent[agentId] || 0;
  //     const baselineHourly = baselineCost / 24; // Baseline is 24 hours

  //     // Current is already per-hour (1 hour window)
  //     const ratio = baselineHourly > 0 ? cost / baselineHourly : 0;

  //     // Agent spending 5x more than baseline
  //     if (ratio >= 5 && cost > 100) {
  //       // Only alert if cost is significant (> $1)
  //       return {
  //         detected: true,
  //         anomaly: {
  //           organizationId,
  //           type: this.type,
  //           severity: "warning",
  //           description: `Agent ${agentId} cost spike: $${(cost / 100).toFixed(2)}/hr (${ratio.toFixed(1)}x normal)`,
  //           metric: "agent_cost_per_hour",
  //           expectedValue: baselineHourly,
  //           actualValue: cost,
  //           deviation: ratio,
  //           agentId,
  //           timeRange: { start: sampleStart, end: sampleEnd },
  //           suggestedActions: [
  //             `Review recent activity for agent ${agentId}`,
  //             "Check for inefficient prompts or loops",
  //             "Verify agent is operating correctly",
  //           ],
  //           autoResolvable: false,
  //           metadata: {
  //             agentId,
  //             currentCostCents: cost,
  //             baselineHourlyCostCents: baselineHourly,
  //             ratio,
  //           },
  //         },
  //       };
  //     }
  //   }

  //   return null;
  // }

  // Build spike description - uncomment when implementing
  // private buildSpikeDescription(current: CostStats, baseline: CostStats): string {
  //   const currentDollars = (current.costPerHour / 100).toFixed(2);
  //   const baselineDollars = (baseline.costPerHour / 100).toFixed(2);
  //   const ratio = (current.costPerHour / baseline.costPerHour).toFixed(1);

  //   return (
  //     `Cost spike detected: $${currentDollars}/hr ` +
  //     `(${ratio}x baseline of $${baselineDollars}/hr). ` +
  //     `${current.requestCount} requests in the last hour.`
  //   );
  // }

  // Get spike suggested actions - uncomment when implementing
  // private getSpikeSuggestedActions(stats: CostStats): string[] {
  //   const actions: string[] = [
  //     "Review recent high-cost operations",
  //     "Check for runaway processes or loops",
  //     "Verify model selection is appropriate",
  //   ];

  //   // Find top cost contributor
  //   const topModel = Object.entries(stats.byModel).sort(([, a], [, b]) => b - a)[0];
  //   if (topModel && topModel[1] > stats.totalCostCents * 0.5) {
  //     actions.push(`Model "${topModel[0]}" accounts for most costs - consider alternatives`);
  //   }

  //   const topAgent = Object.entries(stats.byAgent).sort(([, a], [, b]) => b - a)[0];
  //   if (topAgent && topAgent[1] > stats.totalCostCents * 0.5) {
  //     actions.push(`Agent ${topAgent[0]} is the top spender - review its configuration`);
  //   }

  //   return actions;
  // }

  // Get top entries - uncomment when implementing
  // private getTopEntries(
  //   map: Record<string, number>,
  //   count: number,
  // ): Array<{ key: string; value: number }> {
  //   return Object.entries(map)
  //     .sort(([, a], [, b]) => b - a)
  //     .slice(0, count)
  //     .map(([key, value]) => ({ key, value }));
  // }
}

export const costAnomalyDetector = new CostAnomalyDetector();
