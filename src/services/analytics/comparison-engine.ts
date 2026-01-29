// Analytics Comparison Engine - Compare agents and generate rankings
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import type { AgentMetrics } from "./metrics-aggregator";
import { metricsAggregator } from "./metrics-aggregator";

// ============================================================================
// INTERFACES
// ============================================================================

export interface AgentComparison {
  agentId: string;
  agentName?: string;
  metrics: {
    executions: number;
    successRate: number;
    avgLatencyMs: number;
    costPerExecution: number;
    avgRating: number;
  };
  rankings: {
    overall: number;
    bySuccessRate: number;
    byLatency: number;
    byCost: number;
    byRating: number;
  };
  score: number; // 0-100 composite score
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName?: string;
  score: number;
  executions: number;
  successRate: number;
  avgLatencyMs: number;
  costCents: number;
  trend: "up" | "down" | "stable";
  previousRank?: number;
}

export interface ComparisonReport {
  organizationId: string;
  period: { start: Date; end: Date };
  totalAgents: number;
  comparisons: AgentComparison[];
  bestPerformers: {
    bySuccessRate: { agentId: string; agentName?: string; value: number };
    byLatency: { agentId: string; agentName?: string; value: number };
    byCost: { agentId: string; agentName?: string; value: number };
    byRating: { agentId: string; agentName?: string; value: number };
  };
  averages: {
    successRate: number;
    latencyMs: number;
    costPerExecution: number;
    rating: number;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a value to 0-100 scale
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number,
  invert: boolean = false,
): number {
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return invert ? 100 - normalized : normalized;
}

/**
 * Rank values and return a map of id to rank
 */
export function rankValues(
  values: Array<{ id: string; value: number }>,
  ascending: boolean = true,
): Map<string, number> {
  const sorted = [...values].sort((a, b) =>
    ascending ? a.value - b.value : b.value - a.value,
  );

  const rankMap = new Map<string, number>();
  sorted.forEach((item, index) => {
    rankMap.set(item.id, index + 1);
  });

  return rankMap;
}

// ============================================================================
// COMPARISON ENGINE CLASS
// ============================================================================

// Scoring weights
const WEIGHTS = {
  successRate: 0.3,
  latency: 0.25,
  cost: 0.25,
  rating: 0.2,
};

export class ComparisonEngine {
  /**
   * Compare multiple agents and generate detailed comparison report
   */
  async compareAgents(
    orgId: string,
    agentIds: string[],
    period: { start: Date; end: Date },
  ): Promise<ComparisonReport> {
    logger.debug("Comparing agents", { orgId, agentCount: agentIds.length });

    // Fetch metrics for all agents
    const agentMetricsList: AgentMetrics[] = await Promise.all(
      agentIds.map((agentId) => metricsAggregator.getAgentMetrics(orgId, agentId, period)),
    );

    // Filter out agents with no executions
    const activeAgents = agentMetricsList.filter((m) => m.totalExecutions > 0);

    if (activeAgents.length === 0) {
      return {
        organizationId: orgId,
        period,
        totalAgents: 0,
        comparisons: [],
        bestPerformers: {
          bySuccessRate: { agentId: "", value: 0 },
          byLatency: { agentId: "", value: 0 },
          byCost: { agentId: "", value: 0 },
          byRating: { agentId: "", value: 0 },
        },
        averages: {
          successRate: 0,
          latencyMs: 0,
          costPerExecution: 0,
          rating: 0,
        },
      };
    }

    // Calculate rankings
    const successRateRanks = rankValues(
      activeAgents.map((m) => ({ id: m.agentId, value: m.successRate })),
      false, // Higher is better
    );
    const latencyRanks = rankValues(
      activeAgents.map((m) => ({ id: m.agentId, value: m.avgLatencyMs })),
      true, // Lower is better
    );
    const costRanks = rankValues(
      activeAgents.map((m) => ({
        id: m.agentId,
        value: m.totalExecutions > 0 ? m.totalCostCents / m.totalExecutions : 0,
      })),
      true, // Lower is better
    );
    const ratingRanks = rankValues(
      activeAgents.map((m) => ({ id: m.agentId, value: m.avgRating })),
      false, // Higher is better
    );

    // Calculate min/max for normalization
    const successRates = activeAgents.map((m) => m.successRate);
    const latencies = activeAgents.map((m) => m.avgLatencyMs);
    const costs = activeAgents.map((m) =>
      m.totalExecutions > 0 ? m.totalCostCents / m.totalExecutions : 0,
    );
    const ratings = activeAgents.map((m) => m.avgRating);

    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);

    // Generate comparisons with scores
    const comparisons: AgentComparison[] = activeAgents.map((m) => {
      const costPerExecution = m.totalExecutions > 0 ? m.totalCostCents / m.totalExecutions : 0;
      const score = this.calculateCompositeScore(m, {
        minSuccessRate,
        maxSuccessRate,
        minLatency,
        maxLatency,
        minCost,
        maxCost,
        minRating,
        maxRating,
      });

      return {
        agentId: m.agentId,
        agentName: m.agentName,
        metrics: {
          executions: m.totalExecutions,
          successRate: m.successRate,
          avgLatencyMs: m.avgLatencyMs,
          costPerExecution: Math.round(costPerExecution * 100) / 100,
          avgRating: m.avgRating,
        },
        rankings: {
          overall: 0, // Will be set after sorting
          bySuccessRate: successRateRanks.get(m.agentId) || 0,
          byLatency: latencyRanks.get(m.agentId) || 0,
          byCost: costRanks.get(m.agentId) || 0,
          byRating: ratingRanks.get(m.agentId) || 0,
        },
        score,
      };
    });

    // Sort by score and assign overall ranking
    comparisons.sort((a, b) => b.score - a.score);
    comparisons.forEach((c, index) => {
      c.rankings.overall = index + 1;
    });

    // Find best performers
    const bestBySuccessRate = [...activeAgents].sort((a, b) => b.successRate - a.successRate)[0];
    const bestByLatency = [...activeAgents].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0];
    const bestByCost = [...activeAgents]
      .filter((m) => m.totalExecutions > 0)
      .sort(
        (a, b) =>
          a.totalCostCents / a.totalExecutions - b.totalCostCents / b.totalExecutions,
      )[0];
    const bestByRating = [...activeAgents]
      .filter((m) => m.avgRating > 0)
      .sort((a, b) => b.avgRating - a.avgRating)[0];

    // Calculate averages
    const avgSuccessRate =
      activeAgents.length > 0
        ? Math.round(
            (activeAgents.reduce((sum, m) => sum + m.successRate, 0) / activeAgents.length) * 10,
          ) / 10
        : 0;
    const avgLatency =
      activeAgents.length > 0
        ? Math.round(
            activeAgents.reduce((sum, m) => sum + m.avgLatencyMs, 0) / activeAgents.length,
          )
        : 0;
    const totalCost = activeAgents.reduce((sum, m) => sum + m.totalCostCents, 0);
    const totalExecs = activeAgents.reduce((sum, m) => sum + m.totalExecutions, 0);
    const avgCostPerExec = totalExecs > 0 ? Math.round((totalCost / totalExecs) * 100) / 100 : 0;
    const avgRating =
      activeAgents.filter((m) => m.avgRating > 0).length > 0
        ? Math.round(
            (activeAgents.filter((m) => m.avgRating > 0).reduce((sum, m) => sum + m.avgRating, 0) /
              activeAgents.filter((m) => m.avgRating > 0).length) *
              10,
          ) / 10
        : 0;

    return {
      organizationId: orgId,
      period,
      totalAgents: activeAgents.length,
      comparisons,
      bestPerformers: {
        bySuccessRate: bestBySuccessRate
          ? {
              agentId: bestBySuccessRate.agentId,
              agentName: bestBySuccessRate.agentName,
              value: bestBySuccessRate.successRate,
            }
          : { agentId: "", value: 0 },
        byLatency: bestByLatency
          ? {
              agentId: bestByLatency.agentId,
              agentName: bestByLatency.agentName,
              value: bestByLatency.avgLatencyMs,
            }
          : { agentId: "", value: 0 },
        byCost: bestByCost
          ? {
              agentId: bestByCost.agentId,
              agentName: bestByCost.agentName,
              value:
                Math.round(
                  (bestByCost.totalCostCents / bestByCost.totalExecutions) * 100,
                ) / 100,
            }
          : { agentId: "", value: 0 },
        byRating: bestByRating
          ? {
              agentId: bestByRating.agentId,
              agentName: bestByRating.agentName,
              value: bestByRating.avgRating,
            }
          : { agentId: "", value: 0 },
      },
      averages: {
        successRate: avgSuccessRate,
        latencyMs: avgLatency,
        costPerExecution: avgCostPerExec,
        rating: avgRating,
      },
    };
  }

  /**
   * Get leaderboard of top agents
   */
  async getLeaderboard(
    orgId: string,
    period: { start: Date; end: Date },
    limit: number = 10,
  ): Promise<LeaderboardEntry[]> {
    logger.debug("Generating leaderboard", { orgId, limit });

    // Get all agents for org
    const agents = await prisma.agent.findMany({
      where: { organizationId: orgId, status: "active" },
      select: { id: true, name: true },
    });

    if (agents.length === 0) {
      return [];
    }

    // Get current period comparison
    const currentReport = await this.compareAgents(
      orgId,
      agents.map((a) => a.id),
      period,
    );

    // Get previous period for trend calculation
    const periodDuration = period.end.getTime() - period.start.getTime();
    const previousPeriod = {
      start: new Date(period.start.getTime() - periodDuration),
      end: period.start,
    };

    let previousRankMap = new Map<string, number>();
    try {
      const previousReport = await this.compareAgents(
        orgId,
        agents.map((a) => a.id),
        previousPeriod,
      );
      previousReport.comparisons.forEach((c) => {
        previousRankMap.set(c.agentId, c.rankings.overall);
      });
    } catch (error) {
      logger.debug("No previous period data for trend calculation");
    }

    // Build leaderboard
    const leaderboard: LeaderboardEntry[] = currentReport.comparisons
      .slice(0, limit)
      .map((c, index) => {
        const previousRank = previousRankMap.get(c.agentId);
        let trend: LeaderboardEntry["trend"] = "stable";
        if (previousRank !== undefined) {
          if (c.rankings.overall < previousRank) trend = "up";
          else if (c.rankings.overall > previousRank) trend = "down";
        }

        const agentData = agents.find((a) => a.id === c.agentId);

        return {
          rank: index + 1,
          agentId: c.agentId,
          agentName: agentData?.name || c.agentName,
          score: c.score,
          executions: c.metrics.executions,
          successRate: c.metrics.successRate,
          avgLatencyMs: c.metrics.avgLatencyMs,
          costCents: Math.round(c.metrics.costPerExecution * c.metrics.executions),
          trend,
          previousRank,
        };
      });

    return leaderboard;
  }

  /**
   * Get specific agent's rank within organization
   */
  async getAgentRank(
    orgId: string,
    agentId: string,
    period: { start: Date; end: Date },
  ): Promise<{ rank: number; total: number; percentile: number }> {
    const agents = await prisma.agent.findMany({
      where: { organizationId: orgId, status: "active" },
      select: { id: true },
    });

    const report = await this.compareAgents(
      orgId,
      agents.map((a) => a.id),
      period,
    );

    const agentComparison = report.comparisons.find((c) => c.agentId === agentId);

    if (!agentComparison) {
      return { rank: 0, total: report.totalAgents, percentile: 0 };
    }

    const percentile =
      report.totalAgents > 1
        ? Math.round(
            ((report.totalAgents - agentComparison.rankings.overall) /
              (report.totalAgents - 1)) *
              100,
          )
        : 100;

    return {
      rank: agentComparison.rankings.overall,
      total: report.totalAgents,
      percentile,
    };
  }

  /**
   * Calculate composite score for an agent (0-100)
   */
  calculateCompositeScore(
    metrics: AgentMetrics,
    ranges: {
      minSuccessRate: number;
      maxSuccessRate: number;
      minLatency: number;
      maxLatency: number;
      minCost: number;
      maxCost: number;
      minRating: number;
      maxRating: number;
    },
  ): number {
    const costPerExecution =
      metrics.totalExecutions > 0 ? metrics.totalCostCents / metrics.totalExecutions : 0;

    // Normalize each metric to 0-100
    const successScore = normalizeValue(
      metrics.successRate,
      ranges.minSuccessRate,
      ranges.maxSuccessRate,
    );
    const latencyScore = normalizeValue(
      metrics.avgLatencyMs,
      ranges.minLatency,
      ranges.maxLatency,
      true, // Invert: lower is better
    );
    const costScore = normalizeValue(
      costPerExecution,
      ranges.minCost,
      ranges.maxCost,
      true, // Invert: lower is better
    );
    const ratingScore = normalizeValue(
      metrics.avgRating,
      ranges.minRating,
      ranges.maxRating,
    );

    // Apply weights
    const compositeScore =
      successScore * WEIGHTS.successRate +
      latencyScore * WEIGHTS.latency +
      costScore * WEIGHTS.cost +
      ratingScore * WEIGHTS.rating;

    return Math.round(compositeScore * 10) / 10;
  }
}

// Export singleton instance
export const comparisonEngine = new ComparisonEngine();
export default ComparisonEngine;
