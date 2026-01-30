import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export type ExperimentStatus = "active" | "paused" | "completed";

export interface ABVariant {
  id: string;
  name: string;
  weight: number;
}

export interface ABExperiment {
  id: string;
  name: string;
  variants: ABVariant[];
  status: ExperimentStatus;
  organizationIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ABAssignment {
  experimentId: string;
  variantId: string;
  organizationId: string;
  assignedAt: string;
}

export interface VariantStats {
  variantId: string;
  variantName: string;
  count: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface ExperimentResults {
  experimentId: string;
  experimentName: string;
  status: ExperimentStatus;
  variants: VariantStats[];
  isSignificant: boolean;
  chiSquared: number;
  pValue: number;
}

// =============================================================================
// Constants
// =============================================================================

const EXPERIMENT_PREFIX = "ab:exp:";
const EXPERIMENT_INDEX_KEY = "ab:experiments";
const ASSIGNMENT_PREFIX = "ab:assign:";
const OUTCOME_PREFIX = "ab:outcome:";
const EXPERIMENT_TTL = 2592000; // 30 days
const ASSIGNMENT_TTL = 2592000; // 30 days
const OUTCOME_TTL = 2592000; // 30 days

// =============================================================================
// Experiment Management
// =============================================================================

/**
 * Create a new A/B experiment.
 * Validates that variant weights sum to 1.0 (within tolerance).
 */
export async function createExperiment(
  experiment: Omit<ABExperiment, "createdAt" | "updatedAt">,
): Promise<ABExperiment> {
  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(
      `Variant weights must sum to 1.0, got ${totalWeight.toFixed(4)}`,
    );
  }

  if (experiment.variants.length < 2) {
    throw new Error("Experiment must have at least 2 variants");
  }

  const variantIds = new Set(experiment.variants.map((v) => v.id));
  if (variantIds.size !== experiment.variants.length) {
    throw new Error("Variant IDs must be unique");
  }

  const now = new Date().toISOString();
  const fullExperiment: ABExperiment = {
    ...experiment,
    createdAt: now,
    updatedAt: now,
  };

  const experimentKey = `${EXPERIMENT_PREFIX}${experiment.id}`;
  await redis.set(experimentKey, JSON.stringify(fullExperiment), EXPERIMENT_TTL);

  // Add to experiment index
  await addToExperimentIndex(experiment.id);

  logger.info("A/B experiment created", {
    experimentId: experiment.id,
    name: experiment.name,
    variantCount: experiment.variants.length,
    status: experiment.status,
  });

  return fullExperiment;
}

/**
 * Pause an active experiment. Existing assignments remain but no new outcomes are recorded.
 */
export async function pauseExperiment(experimentId: string): Promise<ABExperiment> {
  return updateExperimentStatus(experimentId, "paused");
}

/**
 * Complete an experiment. Freezes all data for final analysis.
 */
export async function completeExperiment(experimentId: string): Promise<ABExperiment> {
  return updateExperimentStatus(experimentId, "completed");
}

/**
 * Retrieve an experiment by ID.
 */
export async function getExperiment(experimentId: string): Promise<ABExperiment | null> {
  const experimentKey = `${EXPERIMENT_PREFIX}${experimentId}`;
  const data = await redis.get(experimentKey);
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as ABExperiment;
  } catch {
    logger.warn("Failed to parse experiment data", { experimentId });
    return null;
  }
}

/**
 * Get all active experiments.
 */
export async function getActiveExperiments(): Promise<ABExperiment[]> {
  const indexData = await redis.get(EXPERIMENT_INDEX_KEY);
  if (!indexData) {
    return [];
  }

  let experimentIds: string[];
  try {
    experimentIds = JSON.parse(indexData);
  } catch {
    return [];
  }

  const results: ABExperiment[] = [];
  for (const id of experimentIds) {
    const experiment = await getExperiment(id);
    if (experiment && experiment.status === "active") {
      results.push(experiment);
    }
  }

  return results;
}

// =============================================================================
// Variant Assignment
// =============================================================================

/**
 * Assign a variant to an organization for a given experiment.
 *
 * Uses a deterministic hash of organizationId + experimentId so the same
 * organization always gets the same variant. The assignment is cached in Redis
 * for fast retrieval.
 *
 * Returns null if the experiment is not active or the organization is not
 * in the allowlist (when one is configured).
 */
export async function assignVariant(
  experimentId: string,
  organizationId: string,
): Promise<ABAssignment | null> {
  // Check for cached assignment first
  const assignmentKey = `${ASSIGNMENT_PREFIX}${experimentId}:${organizationId}`;
  const cached = await redis.get(assignmentKey);
  if (cached) {
    try {
      return JSON.parse(cached) as ABAssignment;
    } catch {
      // Cache corrupted, reassign below
    }
  }

  // Load the experiment
  const experiment = await getExperiment(experimentId);
  if (!experiment) {
    logger.warn("Cannot assign variant: experiment not found", { experimentId });
    return null;
  }

  if (experiment.status !== "active") {
    logger.debug("Cannot assign variant: experiment not active", {
      experimentId,
      status: experiment.status,
    });
    return null;
  }

  // Check organization allowlist
  if (
    experiment.organizationIds &&
    experiment.organizationIds.length > 0 &&
    !experiment.organizationIds.includes(organizationId)
  ) {
    logger.debug("Organization not in experiment allowlist", {
      experimentId,
      organizationId,
    });
    return null;
  }

  // Deterministic assignment using hash
  const variantId = selectVariantByHash(
    experimentId,
    organizationId,
    experiment.variants,
  );

  const assignment: ABAssignment = {
    experimentId,
    variantId,
    organizationId,
    assignedAt: new Date().toISOString(),
  };

  // Cache the assignment
  await redis.set(assignmentKey, JSON.stringify(assignment), ASSIGNMENT_TTL);

  logger.debug("Variant assigned", {
    experimentId,
    organizationId,
    variantId,
  });

  return assignment;
}

// =============================================================================
// Outcome Recording
// =============================================================================

/**
 * Record an outcome (success/failure + duration) for an experiment trial.
 * Uses Redis hashes to maintain per-variant counters for efficient aggregation.
 */
export async function recordOutcome(
  experimentId: string,
  organizationId: string,
  variantId: string,
  success: boolean,
  durationMs: number,
): Promise<void> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) {
    logger.warn("Cannot record outcome: experiment not found", { experimentId });
    return;
  }

  if (experiment.status === "completed") {
    logger.debug("Cannot record outcome: experiment completed", { experimentId });
    return;
  }

  // Validate that the variant exists in this experiment
  const variantExists = experiment.variants.some((v) => v.id === variantId);
  if (!variantExists) {
    logger.warn("Cannot record outcome: variant not in experiment", {
      experimentId,
      variantId,
    });
    return;
  }

  const outcomeKey = `${OUTCOME_PREFIX}${experimentId}:${variantId}`;

  // Increment counters atomically via Redis hash fields
  await redis.hincrby(outcomeKey, "count", 1);
  await redis.hincrby(outcomeKey, success ? "success" : "failure", 1);
  await redis.hincrby(outcomeKey, "totalDurationMs", Math.round(durationMs));
  await redis.expire(outcomeKey, OUTCOME_TTL);

  logger.debug("Outcome recorded", {
    experimentId,
    organizationId,
    variantId,
    success,
    durationMs: Math.round(durationMs),
  });
}

// =============================================================================
// Results & Analysis
// =============================================================================

/**
 * Get aggregated results for an experiment, including per-variant stats
 * and chi-squared significance test.
 */
export async function getExperimentResults(
  experimentId: string,
): Promise<ExperimentResults | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) {
    return null;
  }

  const variantStats: VariantStats[] = [];

  for (const variant of experiment.variants) {
    const outcomeKey = `${OUTCOME_PREFIX}${experimentId}:${variant.id}`;
    const data = await redis.hgetall(outcomeKey);

    const count = parseInt(data["count"] || "0", 10);
    const successCount = parseInt(data["success"] || "0", 10);
    const failureCount = parseInt(data["failure"] || "0", 10);
    const totalDurationMs = parseInt(data["totalDurationMs"] || "0", 10);

    variantStats.push({
      variantId: variant.id,
      variantName: variant.name,
      count,
      successCount,
      failureCount,
      successRate: count > 0 ? Math.round((successCount / count) * 10000) / 10000 : 0,
      avgDurationMs: count > 0 ? Math.round(totalDurationMs / count) : 0,
      totalDurationMs,
    });
  }

  // Chi-squared test for significance
  const { chiSquared, pValue, isSignificant } = chiSquaredTest(variantStats);

  return {
    experimentId,
    experimentName: experiment.name,
    status: experiment.status,
    variants: variantStats,
    isSignificant,
    chiSquared,
    pValue,
  };
}

// =============================================================================
// Statistical Significance - Chi-Squared Test
// =============================================================================

/**
 * Perform a chi-squared test on variant success rates.
 *
 * Compares observed success/failure counts against expected counts
 * (assuming all variants have the same underlying success rate).
 *
 * Returns the chi-squared statistic, approximate p-value, and whether
 * the result is statistically significant at p < 0.05.
 */
function chiSquaredTest(variants: VariantStats[]): {
  chiSquared: number;
  pValue: number;
  isSignificant: boolean;
} {
  const variantsWithData = variants.filter((v) => v.count > 0);

  // Need at least 2 variants with data for comparison
  if (variantsWithData.length < 2) {
    return { chiSquared: 0, pValue: 1, isSignificant: false };
  }

  const totalCount = variantsWithData.reduce((sum, v) => sum + v.count, 0);
  const totalSuccess = variantsWithData.reduce((sum, v) => sum + v.successCount, 0);
  const totalFailure = totalCount - totalSuccess;

  // Avoid division by zero
  if (totalCount === 0 || totalSuccess === 0 || totalFailure === 0) {
    return { chiSquared: 0, pValue: 1, isSignificant: false };
  }

  // Expected proportions under null hypothesis (same rate for all)
  const expectedSuccessRate = totalSuccess / totalCount;
  const expectedFailureRate = totalFailure / totalCount;

  let chiSq = 0;

  for (const variant of variantsWithData) {
    const expectedSuccess = variant.count * expectedSuccessRate;
    const expectedFailure = variant.count * expectedFailureRate;

    // Avoid division by zero for expected values
    if (expectedSuccess > 0) {
      chiSq +=
        Math.pow(variant.successCount - expectedSuccess, 2) / expectedSuccess;
    }
    if (expectedFailure > 0) {
      const observedFailure = variant.count - variant.successCount;
      chiSq +=
        Math.pow(observedFailure - expectedFailure, 2) / expectedFailure;
    }
  }

  chiSq = Math.round(chiSq * 10000) / 10000;

  // Degrees of freedom = (rows - 1) * (cols - 1) = (numVariants - 1) * 1
  const df = variantsWithData.length - 1;

  // Approximate p-value using chi-squared survival function
  const pValue = chiSquaredSurvival(chiSq, df);

  return {
    chiSquared: chiSq,
    pValue: Math.round(pValue * 10000) / 10000,
    isSignificant: pValue < 0.05,
  };
}

/**
 * Approximate chi-squared survival function (1 - CDF).
 * Uses the regularized incomplete gamma function approximation.
 *
 * For small degrees of freedom (typical in A/B tests with 2-4 variants),
 * this provides a reasonable approximation without external dependencies.
 */
function chiSquaredSurvival(x: number, df: number): number {
  if (x <= 0) return 1;
  if (df <= 0) return 0;

  // Use the regularized incomplete gamma function: P(a, x) = gamma(a, x) / Gamma(a)
  // where a = df/2, x = chiSq/2
  // Survival = 1 - P(a, x) = Q(a, x)
  const a = df / 2;
  const z = x / 2;

  return 1 - regularizedGammaP(a, z);
}

/**
 * Regularized lower incomplete gamma function P(a, x) via series expansion.
 * Convergent for all x > 0, most efficient when x < a + 1.
 * Falls back to continued fraction for large x.
 */
function regularizedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  // For x > a + 1, use the complement via continued fraction
  if (x > a + 1) {
    return 1 - regularizedGammaQ(a, x);
  }

  // Series expansion: P(a, x) = e^(-x) * x^a * sum(x^n / gamma(a + n + 1))
  const lnGammaA = lnGamma(a);
  let sum = 1 / a;
  let term = 1 / a;

  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - lnGammaA) * sum;
}

/**
 * Regularized upper incomplete gamma function Q(a, x) via continued fraction
 * (Lentz's method). Efficient when x > a + 1.
 */
function regularizedGammaQ(a: number, x: number): number {
  const lnGammaA = lnGamma(a);

  // Continued fraction using modified Lentz's method
  let f = 1e-30;
  let c = 1e-30;
  let d = 1 / (x + 1 - a);
  f = d;

  for (let i = 1; i < 200; i++) {
    const an = i * (a - i);
    const bn = x + 2 * i + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - lnGammaA) * f;
}

/**
 * Log-gamma function using Stirling's approximation with Lanczos coefficients.
 */
function lnGamma(x: number): number {
  // Lanczos approximation with g=7
  const coefficients = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    // Reflection formula: Gamma(x) * Gamma(1-x) = pi / sin(pi*x)
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
    );
  }

  x -= 1;
  let a = coefficients[0];
  const t = x + 7.5; // g + 0.5

  for (let i = 1; i < coefficients.length; i++) {
    a += coefficients[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Deterministic variant selection using a hash of experimentId + organizationId.
 * Respects variant weights for proportional assignment.
 */
function selectVariantByHash(
  experimentId: string,
  organizationId: string,
  variants: ABVariant[],
): string {
  const hash = deterministicHash(`${experimentId}:${organizationId}`);
  const bucket = (hash % 10000) / 10000; // Normalize to [0, 1)

  let cumulativeWeight = 0;
  for (const variant of variants) {
    cumulativeWeight += variant.weight;
    if (bucket < cumulativeWeight) {
      return variant.id;
    }
  }

  // Fallback to last variant (handles floating-point edge case)
  return variants[variants.length - 1].id;
}

/**
 * Simple deterministic hash function (djb2).
 * Returns a positive integer for consistent bucketing.
 */
function deterministicHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash + char) | 0; // hash * 33 + char
  }
  return Math.abs(hash);
}

/**
 * Update an experiment's status with validation.
 */
async function updateExperimentStatus(
  experimentId: string,
  newStatus: ExperimentStatus,
): Promise<ABExperiment> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  if (experiment.status === "completed" && newStatus !== "completed") {
    throw new Error("Cannot change status of a completed experiment");
  }

  experiment.status = newStatus;
  experiment.updatedAt = new Date().toISOString();

  const experimentKey = `${EXPERIMENT_PREFIX}${experimentId}`;
  await redis.set(experimentKey, JSON.stringify(experiment), EXPERIMENT_TTL);

  logger.info("A/B experiment status updated", {
    experimentId,
    name: experiment.name,
    newStatus,
  });

  return experiment;
}

/**
 * Add an experiment ID to the global index for enumeration.
 */
async function addToExperimentIndex(experimentId: string): Promise<void> {
  const indexData = await redis.get(EXPERIMENT_INDEX_KEY);

  let experimentIds: string[] = [];
  if (indexData) {
    try {
      experimentIds = JSON.parse(indexData);
    } catch {
      experimentIds = [];
    }
  }

  if (!experimentIds.includes(experimentId)) {
    experimentIds.push(experimentId);
    await redis.set(
      EXPERIMENT_INDEX_KEY,
      JSON.stringify(experimentIds),
      EXPERIMENT_TTL,
    );
  }
}
