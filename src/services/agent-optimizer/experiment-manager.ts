/**
 * Experiment Manager Service
 *
 * A/B testing framework for agent performance optimization.
 * Manages experiments, variant assignments, and result analysis.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import crypto from "crypto";

// Types
export interface Experiment {
  id: string;
  organizationId: string;
  name: string;
  agentId: string;
  status: "draft" | "running" | "completed" | "cancelled";
  type: "prompt" | "model" | "routing";
  trafficSplit: number;
  primaryMetric: "success_rate" | "latency" | "cost" | "user_rating";
  secondaryMetrics: string[];
  minSampleSize: number;
  startedAt?: Date;
  endedAt?: Date;
  results?: ExperimentResults;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentVariant {
  id: string;
  experimentId: string;
  name: string;
  isControl: boolean;
  type: string;
  config: Record<string, unknown>;
  sampleSize: number;
  successCount: number;
  totalLatencyMs: number;
  totalCostCents: number;
  totalRating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricData {
  success: boolean;
  latencyMs?: number;
  costCents?: number;
  userRating?: number;
  metadata?: Record<string, unknown>;
}

export interface ExperimentResults {
  controlVariant: VariantResults;
  treatmentVariant: VariantResults;
  winner: string | null;
  confidence: number;
  improvement: number;
  isSignificant: boolean;
  analyzedAt: Date;
}

export interface VariantResults {
  variantId: string;
  name: string;
  sampleSize: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  avgRating: number;
}

export interface CreateExperimentParams {
  organizationId: string;
  name: string;
  agentId: string;
  type: "prompt" | "model" | "routing";
  controlConfig: Record<string, unknown>;
  treatmentConfig: Record<string, unknown>;
  trafficSplit?: number;
  primaryMetric?: "success_rate" | "latency" | "cost" | "user_rating";
  secondaryMetrics?: string[];
  minSampleSize?: number;
}

/**
 * Create a new A/B test experiment
 */
export async function createExperiment(
  params: CreateExperimentParams,
): Promise<Experiment> {
  const {
    organizationId,
    name,
    agentId,
    type,
    controlConfig,
    treatmentConfig,
    trafficSplit = 0.5,
    primaryMetric = "success_rate",
    secondaryMetrics = [],
    minSampleSize = 100,
  } = params;

  const experiment = await prisma.$transaction(async (tx) => {
    // Create experiment
    const exp = await tx.$queryRaw<Experiment[]>`
      INSERT INTO experiments (organization_id, name, agent_id, type, traffic_split, primary_metric, secondary_metrics, min_sample_size)
      VALUES (${organizationId}::uuid, ${name}, ${agentId}, ${type}, ${trafficSplit}, ${primaryMetric}, ${secondaryMetrics}::text[], ${minSampleSize})
      RETURNING id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
                traffic_split as "trafficSplit", primary_metric as "primaryMetric",
                secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
                started_at as "startedAt", ended_at as "endedAt", results,
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const experiment = exp[0];

    // Create control variant
    await tx.$executeRaw`
      INSERT INTO experiment_variants (experiment_id, name, is_control, type, config)
      VALUES (${experiment.id}::uuid, 'Control', true, ${type}, ${JSON.stringify(controlConfig)}::jsonb)
    `;

    // Create treatment variant
    await tx.$executeRaw`
      INSERT INTO experiment_variants (experiment_id, name, is_control, type, config)
      VALUES (${experiment.id}::uuid, 'Treatment', false, ${type}, ${JSON.stringify(treatmentConfig)}::jsonb)
    `;

    return experiment;
  });

  logger.info("Experiment created", {
    experimentId: experiment.id,
    organizationId,
    agentId,
    type,
  });

  return experiment;
}

/**
 * Start an experiment (begin collecting data)
 */
export async function startExperiment(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE experiments
    SET status = 'running', started_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid AND status = 'draft'
  `;

  logger.info("Experiment started", { experimentId: id });
}

/**
 * Stop an experiment
 */
export async function stopExperiment(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE experiments
    SET status = 'completed', ended_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid AND status = 'running'
  `;

  logger.info("Experiment stopped", { experimentId: id });
}

/**
 * Cancel an experiment
 */
export async function cancelExperiment(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE experiments
    SET status = 'cancelled', ended_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid AND status IN ('draft', 'running')
  `;

  logger.info("Experiment cancelled", { experimentId: id });
}

/**
 * Get variant for a request (consistent assignment by user ID)
 */
export async function getVariant(
  experimentId: string,
  userId: string,
): Promise<ExperimentVariant | null> {
  // Check for existing assignment
  const existing = await prisma.$queryRaw<ExperimentVariant[]>`
    SELECT ev.id, ev.experiment_id as "experimentId", ev.name, ev.is_control as "isControl",
           ev.type, ev.config, ev.sample_size as "sampleSize",
           ev.success_count as "successCount", ev.total_latency_ms as "totalLatencyMs",
           ev.total_cost_cents as "totalCostCents", ev.total_rating as "totalRating",
           ev.rating_count as "ratingCount", ev.created_at as "createdAt", ev.updated_at as "updatedAt"
    FROM experiment_user_assignments eua
    JOIN experiment_variants ev ON eua.variant_id = ev.id
    WHERE eua.experiment_id = ${experimentId}::uuid AND eua.user_id = ${userId}::uuid
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  // Get experiment for traffic split
  const experiments = await prisma.$queryRaw<Experiment[]>`
    SELECT traffic_split as "trafficSplit"
    FROM experiments
    WHERE id = ${experimentId}::uuid AND status = 'running'
  `;

  if (experiments.length === 0) {
    return null;
  }

  const trafficSplit = Number(experiments[0].trafficSplit);

  // Deterministic assignment based on hash of experiment + user
  const hash = crypto
    .createHash("md5")
    .update(`${experimentId}:${userId}`)
    .digest("hex");
  const hashNum = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  const isControl = hashNum > trafficSplit;

  // Get the appropriate variant
  const variants = await prisma.$queryRaw<ExperimentVariant[]>`
    SELECT id, experiment_id as "experimentId", name, is_control as "isControl",
           type, config, sample_size as "sampleSize",
           success_count as "successCount", total_latency_ms as "totalLatencyMs",
           total_cost_cents as "totalCostCents", total_rating as "totalRating",
           rating_count as "ratingCount", created_at as "createdAt", updated_at as "updatedAt"
    FROM experiment_variants
    WHERE experiment_id = ${experimentId}::uuid AND is_control = ${isControl}
  `;

  if (variants.length === 0) {
    return null;
  }

  const variant = variants[0];

  // Save assignment
  await prisma.$executeRaw`
    INSERT INTO experiment_user_assignments (experiment_id, user_id, variant_id)
    VALUES (${experimentId}::uuid, ${userId}::uuid, ${variant.id}::uuid)
    ON CONFLICT (experiment_id, user_id) DO NOTHING
  `;

  return variant;
}

/**
 * Record a metric for a variant
 */
export async function recordMetric(
  experimentId: string,
  variantId: string,
  userId: string | null,
  sessionId: string | null,
  metrics: MetricData,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Insert metric record
    await tx.$executeRaw`
      INSERT INTO experiment_metrics (experiment_id, variant_id, user_id, session_id, success, latency_ms, cost_cents, user_rating, metadata)
      VALUES (
        ${experimentId}::uuid,
        ${variantId}::uuid,
        ${userId ? `${userId}::uuid` : null}::uuid,
        ${sessionId},
        ${metrics.success},
        ${metrics.latencyMs ?? null},
        ${metrics.costCents ?? null},
        ${metrics.userRating ?? null},
        ${metrics.metadata ? JSON.stringify(metrics.metadata) : null}::jsonb
      )
    `;

    // Update variant aggregates
    await tx.$executeRaw`
      UPDATE experiment_variants
      SET
        sample_size = sample_size + 1,
        success_count = success_count + ${metrics.success ? 1 : 0},
        total_latency_ms = total_latency_ms + COALESCE(${metrics.latencyMs ?? 0}, 0),
        total_cost_cents = total_cost_cents + COALESCE(${metrics.costCents ?? 0}, 0),
        total_rating = total_rating + COALESCE(${metrics.userRating ?? 0}, 0),
        rating_count = rating_count + ${metrics.userRating !== undefined ? 1 : 0},
        updated_at = NOW()
      WHERE id = ${variantId}::uuid
    `;
  });
}

/**
 * Analyze experiment results
 */
export async function analyzeResults(experimentId: string): Promise<ExperimentResults> {
  // Get variants with their metrics
  const variants = await prisma.$queryRaw<ExperimentVariant[]>`
    SELECT id, experiment_id as "experimentId", name, is_control as "isControl",
           type, config, sample_size as "sampleSize",
           success_count as "successCount", total_latency_ms as "totalLatencyMs",
           total_cost_cents as "totalCostCents", total_rating as "totalRating",
           rating_count as "ratingCount"
    FROM experiment_variants
    WHERE experiment_id = ${experimentId}::uuid
    ORDER BY is_control DESC
  `;

  if (variants.length < 2) {
    throw new Error("Experiment must have at least 2 variants");
  }

  const control = variants.find((v) => v.isControl)!;
  const treatment = variants.find((v) => !v.isControl)!;

  const controlResults: VariantResults = {
    variantId: control.id,
    name: control.name,
    sampleSize: control.sampleSize,
    successRate: control.sampleSize > 0 ? control.successCount / control.sampleSize : 0,
    avgLatencyMs: control.sampleSize > 0 ? Number(control.totalLatencyMs) / control.sampleSize : 0,
    avgCostCents: control.sampleSize > 0 ? control.totalCostCents / control.sampleSize : 0,
    avgRating: control.ratingCount > 0 ? Number(control.totalRating) / control.ratingCount : 0,
  };

  const treatmentResults: VariantResults = {
    variantId: treatment.id,
    name: treatment.name,
    sampleSize: treatment.sampleSize,
    successRate: treatment.sampleSize > 0 ? treatment.successCount / treatment.sampleSize : 0,
    avgLatencyMs:
      treatment.sampleSize > 0 ? Number(treatment.totalLatencyMs) / treatment.sampleSize : 0,
    avgCostCents: treatment.sampleSize > 0 ? treatment.totalCostCents / treatment.sampleSize : 0,
    avgRating: treatment.ratingCount > 0 ? Number(treatment.totalRating) / treatment.ratingCount : 0,
  };

  // Get primary metric from experiment
  const experiments = await prisma.$queryRaw<Experiment[]>`
    SELECT primary_metric as "primaryMetric"
    FROM experiments
    WHERE id = ${experimentId}::uuid
  `;

  const primaryMetric = experiments[0]?.primaryMetric || "success_rate";

  // Calculate improvement and statistical significance
  let controlValue: number;
  let treatmentValue: number;
  let higherIsBetter = true;

  switch (primaryMetric) {
    case "success_rate":
      controlValue = controlResults.successRate;
      treatmentValue = treatmentResults.successRate;
      break;
    case "latency":
      controlValue = controlResults.avgLatencyMs;
      treatmentValue = treatmentResults.avgLatencyMs;
      higherIsBetter = false;
      break;
    case "cost":
      controlValue = controlResults.avgCostCents;
      treatmentValue = treatmentResults.avgCostCents;
      higherIsBetter = false;
      break;
    case "user_rating":
      controlValue = controlResults.avgRating;
      treatmentValue = treatmentResults.avgRating;
      break;
    default:
      controlValue = controlResults.successRate;
      treatmentValue = treatmentResults.successRate;
  }

  const improvement =
    controlValue !== 0 ? ((treatmentValue - controlValue) / controlValue) * 100 : 0;

  // Simple z-test for proportions (for success rate)
  const confidence = calculateConfidence(
    control.sampleSize,
    control.successCount,
    treatment.sampleSize,
    treatment.successCount,
  );

  const isSignificant = confidence >= 0.95;

  // Determine winner
  let winner: string | null = null;
  if (isSignificant) {
    if (higherIsBetter) {
      winner = treatmentValue > controlValue ? treatment.id : control.id;
    } else {
      winner = treatmentValue < controlValue ? treatment.id : control.id;
    }
  }

  const results: ExperimentResults = {
    controlVariant: controlResults,
    treatmentVariant: treatmentResults,
    winner,
    confidence,
    improvement,
    isSignificant,
    analyzedAt: new Date(),
  };

  // Save results
  await prisma.$executeRaw`
    UPDATE experiments
    SET results = ${JSON.stringify(results)}::jsonb, updated_at = NOW()
    WHERE id = ${experimentId}::uuid
  `;

  return results;
}

/**
 * Calculate statistical confidence using z-test for proportions
 */
function calculateConfidence(
  n1: number,
  success1: number,
  n2: number,
  success2: number,
): number {
  if (n1 === 0 || n2 === 0) return 0;

  const p1 = success1 / n1;
  const p2 = success2 / n2;
  const pPooled = (success1 + success2) / (n1 + n2);

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;

  const z = Math.abs(p1 - p2) / se;

  // Convert z-score to confidence (using approximation)
  const confidence = 1 - 2 * (1 - normalCDF(z));
  return Math.min(0.9999, Math.max(0, confidence));
}

/**
 * Approximate normal CDF
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Promote the winning variant
 */
export async function promoteWinner(experimentId: string): Promise<void> {
  const experiments = await prisma.$queryRaw<Experiment[]>`
    SELECT results
    FROM experiments
    WHERE id = ${experimentId}::uuid
  `;

  if (experiments.length === 0) {
    throw new Error("Experiment not found");
  }

  const results = experiments[0].results as ExperimentResults | null;
  if (!results || !results.winner) {
    throw new Error("No winner to promote");
  }

  // Get the winning variant's config
  const variants = await prisma.$queryRaw<ExperimentVariant[]>`
    SELECT config, type
    FROM experiment_variants
    WHERE id = ${results.winner}::uuid
  `;

  if (variants.length === 0) {
    throw new Error("Winner variant not found");
  }

  // Mark experiment as completed
  await prisma.$executeRaw`
    UPDATE experiments
    SET status = 'completed', ended_at = NOW(), updated_at = NOW()
    WHERE id = ${experimentId}::uuid
  `;

  logger.info("Experiment winner promoted", {
    experimentId,
    winnerId: results.winner,
  });
}

/**
 * Get experiment by ID
 */
export async function getExperiment(
  id: string,
  organizationId: string,
): Promise<Experiment | null> {
  const experiments = await prisma.$queryRaw<Experiment[]>`
    SELECT id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
           traffic_split as "trafficSplit", primary_metric as "primaryMetric",
           secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
           started_at as "startedAt", ended_at as "endedAt", results,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM experiments
    WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
  `;

  return experiments[0] || null;
}

/**
 * List experiments for an organization
 */
export async function listExperiments(
  organizationId: string,
  agentId?: string,
  status?: string,
): Promise<Experiment[]> {
  if (agentId && status) {
    return prisma.$queryRaw<Experiment[]>`
      SELECT id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
             traffic_split as "trafficSplit", primary_metric as "primaryMetric",
             secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
             started_at as "startedAt", ended_at as "endedAt", results,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM experiments
      WHERE organization_id = ${organizationId}::uuid
        AND agent_id = ${agentId}
        AND status = ${status}
      ORDER BY created_at DESC
    `;
  } else if (agentId) {
    return prisma.$queryRaw<Experiment[]>`
      SELECT id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
             traffic_split as "trafficSplit", primary_metric as "primaryMetric",
             secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
             started_at as "startedAt", ended_at as "endedAt", results,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM experiments
      WHERE organization_id = ${organizationId}::uuid AND agent_id = ${agentId}
      ORDER BY created_at DESC
    `;
  } else if (status) {
    return prisma.$queryRaw<Experiment[]>`
      SELECT id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
             traffic_split as "trafficSplit", primary_metric as "primaryMetric",
             secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
             started_at as "startedAt", ended_at as "endedAt", results,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM experiments
      WHERE organization_id = ${organizationId}::uuid AND status = ${status}
      ORDER BY created_at DESC
    `;
  }

  return prisma.$queryRaw<Experiment[]>`
    SELECT id, organization_id as "organizationId", name, agent_id as "agentId", status, type,
           traffic_split as "trafficSplit", primary_metric as "primaryMetric",
           secondary_metrics as "secondaryMetrics", min_sample_size as "minSampleSize",
           started_at as "startedAt", ended_at as "endedAt", results,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM experiments
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY created_at DESC
  `;
}

/**
 * Get variants for an experiment
 */
export async function getExperimentVariants(experimentId: string): Promise<ExperimentVariant[]> {
  return prisma.$queryRaw<ExperimentVariant[]>`
    SELECT id, experiment_id as "experimentId", name, is_control as "isControl",
           type, config, sample_size as "sampleSize",
           success_count as "successCount", total_latency_ms as "totalLatencyMs",
           total_cost_cents as "totalCostCents", total_rating as "totalRating",
           rating_count as "ratingCount", created_at as "createdAt", updated_at as "updatedAt"
    FROM experiment_variants
    WHERE experiment_id = ${experimentId}::uuid
    ORDER BY is_control DESC
  `;
}
