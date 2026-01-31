/**
 * A/B Testing for Routing Strategies
 *
 * Enables experimentation with different routing strategies (category selection,
 * skill selection, etc.) to optimize orchestration performance.
 */

import { Category, Skill } from "./types";
import * as crypto from "crypto";

// ============================================
// TYPES
// ============================================

/**
 * Variant in an A/B test experiment
 */
export interface ABVariant {
  id: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  trafficPercent: number; // 0-100
}

/**
 * A/B experiment configuration
 */
export interface ABExperiment {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "paused" | "completed";

  // Variants
  control: ABVariant;
  treatments: ABVariant[];

  // Targeting
  targetUserIds?: string[]; // Empty = all users
  targetOrganizationIds?: string[];
  targetCategories?: Category[];

  // Timing
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Metrics to track
  primaryMetric: "success_rate" | "latency_ms" | "cost_cents" | "user_satisfaction";
  secondaryMetrics?: string[];
}

/**
 * Result of a single experiment exposure
 */
export interface ABResult {
  experimentId: string;
  variantId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;

  // Outcome metrics
  success: boolean;
  latencyMs: number;
  costCents?: number;
  category?: Category;
  skills?: Skill[];

  // Additional context
  metadata?: Record<string, any>;
}

/**
 * Aggregated statistics for a variant
 */
export interface VariantStats {
  variantId: string;
  variantName: string;
  sampleSize: number;

  // Success metrics
  successCount: number;
  successRate: number;
  successRateCI: { lower: number; upper: number }; // 95% CI

  // Latency metrics
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Cost metrics
  avgCostCents: number;
  totalCostCents: number;

  // Category breakdown
  categoryDistribution: Record<Category, number>;
}

/**
 * Full experiment statistics
 */
export interface ExperimentStats {
  experimentId: string;
  experimentName: string;
  status: "draft" | "running" | "paused" | "completed";
  totalSamples: number;

  controlStats: VariantStats;
  treatmentStats: VariantStats[];

  // Statistical significance
  significanceLevel: number; // p-value
  isSignificant: boolean;
  winner?: string; // variant ID if significant

  // Time range
  firstResult?: Date;
  lastResult?: Date;
}

/**
 * User's assigned variant
 */
export interface VariantAssignment {
  experimentId: string;
  variantId: string;
  assignedAt: Date;
}

// ============================================
// AB TEST MANAGER
// ============================================

export class ABTestManager {
  private experiments: Map<string, ABExperiment> = new Map();
  private results: Map<string, ABResult[]> = new Map(); // experimentId -> results
  private assignments: Map<string, Map<string, VariantAssignment>> = new Map(); // experimentId -> userId -> assignment

  /**
   * Register a new experiment
   */
  registerExperiment(config: Omit<ABExperiment, "createdAt" | "updatedAt">): ABExperiment {
    const now = new Date();
    const experiment: ABExperiment = {
      ...config,
      createdAt: now,
      updatedAt: now,
    };

    // Validate traffic split
    const totalTraffic =
      experiment.control.trafficPercent +
      experiment.treatments.reduce((sum, t) => sum + t.trafficPercent, 0);

    if (totalTraffic !== 100) {
      throw new Error(`Traffic split must equal 100%, got ${totalTraffic}%`);
    }

    this.experiments.set(experiment.id, experiment);
    this.results.set(experiment.id, []);
    this.assignments.set(experiment.id, new Map());

    return experiment;
  }

  /**
   * Get an experiment by ID
   */
  getExperiment(experimentId: string): ABExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * List all experiments
   */
  listExperiments(status?: ABExperiment["status"]): ABExperiment[] {
    const all = Array.from(this.experiments.values());
    return status ? all.filter((e) => e.status === status) : all;
  }

  /**
   * Update experiment status
   */
  updateExperimentStatus(experimentId: string, status: ABExperiment["status"]): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = status;
    experiment.updatedAt = new Date();
  }

  /**
   * Deterministically assign a user to a variant
   * Uses consistent hashing to ensure same user always gets same variant
   */
  assignVariant(userId: string, experimentId: string): ABVariant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    // Check if experiment is active
    if (experiment.status !== "running") {
      return null;
    }

    // Check targeting
    if (experiment.targetUserIds && !experiment.targetUserIds.includes(userId)) {
      return null;
    }

    // Check cached assignment
    const experimentAssignments = this.assignments.get(experimentId);
    const cached = experimentAssignments?.get(userId);
    if (cached) {
      const variant = this.getVariantById(experiment, cached.variantId);
      if (variant) return variant;
    }

    // Deterministic assignment using hash
    const hash = this.hashUserExperiment(userId, experimentId);
    const bucket = hash % 100; // 0-99

    // Determine variant based on bucket
    let cumulative = 0;
    let assignedVariant: ABVariant = experiment.control;

    // Check control first
    cumulative += experiment.control.trafficPercent;
    if (bucket < cumulative) {
      assignedVariant = experiment.control;
    } else {
      // Check treatments
      for (const treatment of experiment.treatments) {
        cumulative += treatment.trafficPercent;
        if (bucket < cumulative) {
          assignedVariant = treatment;
          break;
        }
      }
    }

    // Cache assignment
    if (experimentAssignments) {
      experimentAssignments.set(userId, {
        experimentId,
        variantId: assignedVariant.id,
        assignedAt: new Date(),
      });
    }

    return assignedVariant;
  }

  /**
   * Check if user is in a specific variant
   */
  isInVariant(userId: string, experimentId: string, variantId: string): boolean {
    const assigned = this.assignVariant(userId, experimentId);
    return assigned?.id === variantId;
  }

  /**
   * Record an experiment result
   */
  recordResult(result: Omit<ABResult, "timestamp">): void {
    const experiment = this.experiments.get(result.experimentId);
    if (!experiment) {
      console.warn(`Experiment not found: ${result.experimentId}`);
      return;
    }

    const fullResult: ABResult = {
      ...result,
      timestamp: new Date(),
    };

    const results = this.results.get(result.experimentId);
    if (results) {
      results.push(fullResult);
    }
  }

  /**
   * Get statistics for an experiment
   */
  getExperimentStats(experimentId: string): ExperimentStats | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const results = this.results.get(experimentId) || [];
    if (results.length === 0) {
      return {
        experimentId,
        experimentName: experiment.name,
        status: experiment.status,
        totalSamples: 0,
        controlStats: this.emptyVariantStats(experiment.control),
        treatmentStats: experiment.treatments.map((t) => this.emptyVariantStats(t)),
        significanceLevel: 1,
        isSignificant: false,
      };
    }

    // Group results by variant
    const controlResults = results.filter((r) => r.variantId === experiment.control.id);
    const treatmentResultsMap = new Map<string, ABResult[]>();
    for (const treatment of experiment.treatments) {
      treatmentResultsMap.set(
        treatment.id,
        results.filter((r) => r.variantId === treatment.id)
      );
    }

    // Calculate stats
    const controlStats = this.calculateVariantStats(experiment.control, controlResults);
    const treatmentStats = experiment.treatments.map((t) =>
      this.calculateVariantStats(t, treatmentResultsMap.get(t.id) || [])
    );

    // Calculate significance (simplified two-proportion z-test for success rate)
    const { pValue, winner } = this.calculateSignificance(
      controlStats,
      treatmentStats,
      experiment.primaryMetric
    );

    return {
      experimentId,
      experimentName: experiment.name,
      status: experiment.status,
      totalSamples: results.length,
      controlStats,
      treatmentStats,
      significanceLevel: pValue,
      isSignificant: pValue < 0.05,
      winner: pValue < 0.05 ? winner : undefined,
      firstResult: results.length > 0 ? results[0].timestamp : undefined,
      lastResult: results.length > 0 ? results[results.length - 1].timestamp : undefined,
    };
  }

  /**
   * Get raw results for an experiment
   */
  getResults(experimentId: string, limit?: number): ABResult[] {
    const results = this.results.get(experimentId) || [];
    if (limit) {
      return results.slice(-limit);
    }
    return results;
  }

  /**
   * Clear results for an experiment
   */
  clearResults(experimentId: string): void {
    this.results.set(experimentId, []);
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(experimentId: string): boolean {
    this.results.delete(experimentId);
    this.assignments.delete(experimentId);
    return this.experiments.delete(experimentId);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private hashUserExperiment(userId: string, experimentId: string): number {
    const combined = `${userId}:${experimentId}`;
    const hash = crypto.createHash("md5").update(combined).digest("hex");
    // Convert first 8 hex chars to number
    return parseInt(hash.substring(0, 8), 16);
  }

  private getVariantById(experiment: ABExperiment, variantId: string): ABVariant | null {
    if (experiment.control.id === variantId) {
      return experiment.control;
    }
    return experiment.treatments.find((t) => t.id === variantId) || null;
  }

  private emptyVariantStats(variant: ABVariant): VariantStats {
    return {
      variantId: variant.id,
      variantName: variant.name,
      sampleSize: 0,
      successCount: 0,
      successRate: 0,
      successRateCI: { lower: 0, upper: 0 },
      avgLatencyMs: 0,
      medianLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      avgCostCents: 0,
      totalCostCents: 0,
      categoryDistribution: {} as Record<Category, number>,
    };
  }

  private calculateVariantStats(variant: ABVariant, results: ABResult[]): VariantStats {
    if (results.length === 0) {
      return this.emptyVariantStats(variant);
    }

    const n = results.length;
    const successes = results.filter((r) => r.success).length;
    const successRate = successes / n;

    // Calculate 95% CI using Wilson score interval
    const z = 1.96;
    const denominator = 1 + (z * z) / n;
    const center = successRate + (z * z) / (2 * n);
    const spread = z * Math.sqrt((successRate * (1 - successRate) + (z * z) / (4 * n)) / n);

    // Latency stats
    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / n;
    const medianLatency = latencies[Math.floor(n / 2)];
    const p95Latency = latencies[Math.floor(n * 0.95)];
    const p99Latency = latencies[Math.floor(n * 0.99)];

    // Cost stats
    const costs = results.map((r) => r.costCents || 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const avgCost = totalCost / n;

    // Category distribution
    const categoryDist: Record<string, number> = {};
    for (const result of results) {
      if (result.category) {
        categoryDist[result.category] = (categoryDist[result.category] || 0) + 1;
      }
    }

    return {
      variantId: variant.id,
      variantName: variant.name,
      sampleSize: n,
      successCount: successes,
      successRate,
      successRateCI: {
        lower: Math.max(0, (center - spread) / denominator),
        upper: Math.min(1, (center + spread) / denominator),
      },
      avgLatencyMs: avgLatency,
      medianLatencyMs: medianLatency,
      p95LatencyMs: p95Latency,
      p99LatencyMs: p99Latency,
      avgCostCents: avgCost,
      totalCostCents: totalCost,
      categoryDistribution: categoryDist as Record<Category, number>,
    };
  }

  private calculateSignificance(
    controlStats: VariantStats,
    treatmentStats: VariantStats[],
    metric: ABExperiment["primaryMetric"]
  ): { pValue: number; winner: string | undefined } {
    if (controlStats.sampleSize < 30) {
      return { pValue: 1, winner: undefined };
    }

    // Find best treatment
    let bestTreatment: VariantStats | null = null;
    let bestDiff = 0;

    for (const treatment of treatmentStats) {
      if (treatment.sampleSize < 30) continue;

      let diff: number;
      if (metric === "success_rate") {
        diff = treatment.successRate - controlStats.successRate;
      } else if (metric === "latency_ms") {
        diff = controlStats.avgLatencyMs - treatment.avgLatencyMs; // Lower is better
      } else if (metric === "cost_cents") {
        diff = controlStats.avgCostCents - treatment.avgCostCents; // Lower is better
      } else {
        diff = treatment.successRate - controlStats.successRate;
      }

      if (diff > bestDiff) {
        bestDiff = diff;
        bestTreatment = treatment;
      }
    }

    if (!bestTreatment) {
      return { pValue: 1, winner: undefined };
    }

    // Two-proportion z-test for success rate
    const p1 = controlStats.successRate;
    const p2 = bestTreatment.successRate;
    const n1 = controlStats.sampleSize;
    const n2 = bestTreatment.sampleSize;

    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

    if (se === 0) {
      return { pValue: 1, winner: undefined };
    }

    const z = Math.abs(p2 - p1) / se;

    // Approximate p-value from z-score
    const pValue = 2 * (1 - this.normalCDF(z));

    const winner = p2 > p1 ? bestTreatment.variantId : controlStats.variantId;

    return { pValue, winner };
  }

  private normalCDF(z: number): number {
    // Approximation of standard normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const abTestManager = new ABTestManager();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Create a simple A/B experiment with control and one treatment
 */
export function createSimpleExperiment(
  id: string,
  name: string,
  controlConfig: Record<string, any>,
  treatmentConfig: Record<string, any>,
  trafficSplit = 50
): ABExperiment {
  return abTestManager.registerExperiment({
    id,
    name,
    status: "draft",
    control: {
      id: `${id}-control`,
      name: "Control",
      config: controlConfig,
      trafficPercent: trafficSplit,
    },
    treatments: [
      {
        id: `${id}-treatment`,
        name: "Treatment",
        config: treatmentConfig,
        trafficPercent: 100 - trafficSplit,
      },
    ],
    primaryMetric: "success_rate",
  });
}

/**
 * Quick check if user should use new routing strategy
 */
export function shouldUseNewRouting(
  userId: string,
  experimentId: string,
  treatmentId?: string
): boolean {
  const variant = abTestManager.assignVariant(userId, experimentId);
  if (!variant) return false;

  if (treatmentId) {
    return variant.id === treatmentId;
  }

  // Return true if in any treatment (not control)
  const experiment = abTestManager.getExperiment(experimentId);
  return experiment?.control.id !== variant.id;
}
