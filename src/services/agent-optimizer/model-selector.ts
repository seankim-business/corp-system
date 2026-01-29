/**
 * Model Selector Service
 *
 * Selects optimal models for different task types based on
 * performance benchmarks, cost, and historical data.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

// Types
export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  capabilities: string[];
  inputCostPer1K: number;
  outputCostPer1K: number;
  benchmarkAccuracy: number | null;
  benchmarkLatencyMs: number | null;
  benchmarkCostEfficiency: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskProfile {
  complexity: "simple" | "medium" | "complex";
  type: "routing" | "generation" | "analysis" | "coding";
  expectedTokens: number;
  latencyRequirement: "fast" | "normal" | "slow_ok";
  qualityRequirement: "high" | "medium" | "low";
}

export interface AgentModelPreference {
  id: string;
  organizationId: string;
  agentId: string;
  taskType: string;
  modelName: string;
  score: number;
  sampleSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeoffAnalysis {
  agentId: string;
  recommendations: {
    currentModel: string;
    suggestedModel: string;
    costSavingsPercent: number;
    qualityImpact: "none" | "minor" | "significant";
    reason: string;
  }[];
  costBreakdown: {
    model: string;
    totalCostCents: number;
    requestCount: number;
    avgCostPerRequest: number;
  }[];
}

// Capability weights for scoring
const CAPABILITY_WEIGHTS: Record<string, Record<string, number>> = {
  routing: { fast: 1.0, reasoning: 0.3 },
  generation: { creative: 0.8, reasoning: 0.5, fast: 0.2 },
  analysis: { reasoning: 1.0, coding: 0.3 },
  coding: { coding: 1.0, reasoning: 0.7 },
};

// Quality requirements mapped to minimum accuracy
const QUALITY_THRESHOLDS: Record<string, number> = {
  high: 0.9,
  medium: 0.8,
  low: 0.7,
};

// Latency requirements mapped to max latency
const LATENCY_THRESHOLDS: Record<string, number> = {
  fast: 1000,
  normal: 3000,
  slow_ok: 10000,
};

/**
 * Get all available model profiles
 */
export async function getModelProfiles(enabled: boolean = true): Promise<ModelProfile[]> {
  if (enabled) {
    return prisma.$queryRaw<ModelProfile[]>`
      SELECT id, name, provider, max_tokens as "maxTokens", capabilities,
             input_cost_per_1k as "inputCostPer1K", output_cost_per_1k as "outputCostPer1K",
             benchmark_accuracy as "benchmarkAccuracy", benchmark_latency_ms as "benchmarkLatencyMs",
             benchmark_cost_efficiency as "benchmarkCostEfficiency", enabled,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM model_profiles
      WHERE enabled = true
      ORDER BY name
    `;
  }

  return prisma.$queryRaw<ModelProfile[]>`
    SELECT id, name, provider, max_tokens as "maxTokens", capabilities,
           input_cost_per_1k as "inputCostPer1K", output_cost_per_1k as "outputCostPer1K",
           benchmark_accuracy as "benchmarkAccuracy", benchmark_latency_ms as "benchmarkLatencyMs",
           benchmark_cost_efficiency as "benchmarkCostEfficiency", enabled,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM model_profiles
    ORDER BY name
  `;
}

/**
 * Get a specific model profile
 */
export async function getModelProfile(name: string): Promise<ModelProfile | null> {
  const profiles = await prisma.$queryRaw<ModelProfile[]>`
    SELECT id, name, provider, max_tokens as "maxTokens", capabilities,
           input_cost_per_1k as "inputCostPer1K", output_cost_per_1k as "outputCostPer1K",
           benchmark_accuracy as "benchmarkAccuracy", benchmark_latency_ms as "benchmarkLatencyMs",
           benchmark_cost_efficiency as "benchmarkCostEfficiency", enabled,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM model_profiles
    WHERE name = ${name}
  `;

  return profiles[0] || null;
}

/**
 * Select optimal model for a task
 */
export async function selectModel(task: TaskProfile): Promise<ModelProfile> {
  const allModels = await getModelProfiles(true);

  if (allModels.length === 0) {
    throw new Error("No models available");
  }

  // Filter models that meet requirements
  const eligibleModels = allModels.filter((model) => {
    // Check token capacity
    if (model.maxTokens < task.expectedTokens) return false;

    // Check latency requirement
    const maxLatency = LATENCY_THRESHOLDS[task.latencyRequirement];
    if (model.benchmarkLatencyMs && model.benchmarkLatencyMs > maxLatency) return false;

    // Check quality requirement
    const minAccuracy = QUALITY_THRESHOLDS[task.qualityRequirement];
    if (model.benchmarkAccuracy && model.benchmarkAccuracy < minAccuracy) return false;

    return true;
  });

  if (eligibleModels.length === 0) {
    // Fallback to best available model
    logger.warn("No model meets all requirements, using best available", { task });
    return allModels.sort(
      (a, b) => (b.benchmarkAccuracy || 0) - (a.benchmarkAccuracy || 0),
    )[0];
  }

  // Score eligible models
  const weights = CAPABILITY_WEIGHTS[task.type] || {};
  const scoredModels = eligibleModels.map((model) => {
    let score = 0;

    // Capability score
    for (const cap of model.capabilities) {
      score += weights[cap] || 0;
    }

    // Cost efficiency (lower is better, so invert)
    const avgCostPer1K = (Number(model.inputCostPer1K) + Number(model.outputCostPer1K)) / 2;
    const costScore = 1 / (avgCostPer1K + 0.001); // Avoid division by zero
    score += costScore * 0.3;

    // Latency efficiency (lower is better, so invert)
    if (model.benchmarkLatencyMs) {
      const latencyScore = 1 / (model.benchmarkLatencyMs / 1000 + 0.1);
      score += latencyScore * (task.latencyRequirement === "fast" ? 0.5 : 0.2);
    }

    // Complexity adjustment
    if (task.complexity === "complex") {
      score *= model.benchmarkAccuracy || 0.8;
    } else if (task.complexity === "simple") {
      score *= Number(model.benchmarkCostEfficiency) || 0.8;
    }

    return { model, score };
  });

  // Sort by score and return best
  scoredModels.sort((a, b) => b.score - a.score);

  logger.debug("Model selected", {
    task,
    selected: scoredModels[0].model.name,
    score: scoredModels[0].score,
  });

  return scoredModels[0].model;
}

/**
 * Learn optimal models from historical execution data
 */
export async function learnOptimalModels(
  organizationId: string,
  agentId: string,
): Promise<Map<string, ModelProfile>> {
  // Get historical performance data
  const history = await prisma.$queryRaw<
    {
      model: string;
      category: string | null;
      successRate: number;
      avgLatency: number;
      avgCost: number;
      sampleSize: bigint;
    }[]
  >`
    SELECT
      model,
      category,
      AVG(CASE WHEN cost_cents > 0 THEN 1.0 ELSE 0.0 END) as "successRate",
      AVG(cost_cents) as "avgCost",
      COUNT(*) as "sampleSize",
      0 as "avgLatency"
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}::uuid
    GROUP BY model, category
    HAVING COUNT(*) >= 10
  `;

  const modelMap = new Map<string, ModelProfile>();

  // Get all model profiles
  const allModels = await getModelProfiles();
  const modelsByName = new Map(allModels.map((m) => [m.name, m]));

  // Group by task type (category)
  const taskTypes = new Set(history.map((h) => h.category || "default"));

  for (const taskType of taskTypes) {
    const taskHistory = history.filter((h) => (h.category || "default") === taskType);

    if (taskHistory.length === 0) continue;

    // Score each model for this task type
    let bestModel: ModelProfile | null = null;
    let bestScore = -Infinity;

    for (const h of taskHistory) {
      const model = modelsByName.get(h.model);
      if (!model) continue;

      // Score: balance success rate, cost, and sample size
      const sampleWeight = Math.min(1, Number(h.sampleSize) / 100);
      const score = h.successRate * 0.5 - (h.avgCost / 100) * 0.3 + sampleWeight * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    if (bestModel) {
      modelMap.set(taskType, bestModel);

      // Update preference in database
      await prisma.$executeRaw`
        INSERT INTO agent_model_preferences (organization_id, agent_id, task_type, model_name, score, sample_size)
        VALUES (${organizationId}::uuid, ${agentId}, ${taskType}, ${bestModel.name}, ${bestScore}, 1)
        ON CONFLICT (organization_id, agent_id, task_type, model_name)
        DO UPDATE SET score = ${bestScore}, sample_size = agent_model_preferences.sample_size + 1, updated_at = NOW()
      `;
    }
  }

  logger.info("Optimal models learned", {
    organizationId,
    agentId,
    taskTypes: Array.from(taskTypes),
    modelCount: modelMap.size,
  });

  return modelMap;
}

/**
 * Get learned model preference for a task type
 */
export async function getModelPreference(
  organizationId: string,
  agentId: string,
  taskType: string,
): Promise<ModelProfile | null> {
  const prefs = await prisma.$queryRaw<AgentModelPreference[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId",
           task_type as "taskType", model_name as "modelName", score,
           sample_size as "sampleSize", created_at as "createdAt", updated_at as "updatedAt"
    FROM agent_model_preferences
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}
      AND task_type = ${taskType}
    ORDER BY score DESC, sample_size DESC
    LIMIT 1
  `;

  if (prefs.length === 0) return null;

  return getModelProfile(prefs[0].modelName);
}

/**
 * Analyze cost vs quality tradeoffs
 */
export async function analyzeTradeoffs(
  organizationId: string,
  agentId: string,
): Promise<TradeoffAnalysis> {
  // Get cost breakdown by model
  const costBreakdown = await prisma.$queryRaw<
    {
      model: string;
      totalCostCents: bigint;
      requestCount: bigint;
    }[]
  >`
    SELECT
      model,
      SUM(cost_cents) as "totalCostCents",
      COUNT(*) as "requestCount"
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}::uuid
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY model
    ORDER BY SUM(cost_cents) DESC
  `;

  const costData = costBreakdown.map((c) => ({
    model: c.model,
    totalCostCents: Number(c.totalCostCents),
    requestCount: Number(c.requestCount),
    avgCostPerRequest:
      Number(c.requestCount) > 0 ? Number(c.totalCostCents) / Number(c.requestCount) : 0,
  }));

  // Get model profiles for comparison
  const allModels = await getModelProfiles();
  const modelsByName = new Map(allModels.map((m) => [m.name, m]));

  // Generate recommendations
  const recommendations: TradeoffAnalysis["recommendations"] = [];

  for (const usage of costData) {
    const currentModel = modelsByName.get(usage.model);
    if (!currentModel) continue;

    // Find cheaper alternatives
    for (const altModel of allModels) {
      if (altModel.name === usage.model) continue;

      const currentAvgCost =
        (Number(currentModel.inputCostPer1K) + Number(currentModel.outputCostPer1K)) / 2;
      const altAvgCost =
        (Number(altModel.inputCostPer1K) + Number(altModel.outputCostPer1K)) / 2;

      if (altAvgCost >= currentAvgCost) continue;

      const costSavingsPercent = ((currentAvgCost - altAvgCost) / currentAvgCost) * 100;
      const accuracyDiff =
        (currentModel.benchmarkAccuracy || 0.85) - (altModel.benchmarkAccuracy || 0.85);

      let qualityImpact: "none" | "minor" | "significant" = "none";
      if (accuracyDiff > 0.1) qualityImpact = "significant";
      else if (accuracyDiff > 0.03) qualityImpact = "minor";

      // Only recommend if savings are significant and quality impact is acceptable
      if (costSavingsPercent > 20 && qualityImpact !== "significant") {
        recommendations.push({
          currentModel: usage.model,
          suggestedModel: altModel.name,
          costSavingsPercent: Math.round(costSavingsPercent),
          qualityImpact,
          reason: `Save ~${costSavingsPercent.toFixed(0)}% on costs with ${qualityImpact === "none" ? "no" : "minor"} quality impact`,
        });
      }
    }
  }

  // Deduplicate and sort by savings
  const uniqueRecs = new Map<string, (typeof recommendations)[0]>();
  for (const rec of recommendations) {
    const key = `${rec.currentModel}-${rec.suggestedModel}`;
    if (!uniqueRecs.has(key) || uniqueRecs.get(key)!.costSavingsPercent < rec.costSavingsPercent) {
      uniqueRecs.set(key, rec);
    }
  }

  return {
    agentId,
    recommendations: Array.from(uniqueRecs.values()).sort(
      (a, b) => b.costSavingsPercent - a.costSavingsPercent,
    ),
    costBreakdown: costData,
  };
}

/**
 * Update model profile benchmarks
 */
export async function updateModelBenchmarks(
  name: string,
  benchmarks: {
    accuracy?: number;
    latencyMs?: number;
    costEfficiency?: number;
  },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE model_profiles
    SET
      benchmark_accuracy = COALESCE(${benchmarks.accuracy ?? null}, benchmark_accuracy),
      benchmark_latency_ms = COALESCE(${benchmarks.latencyMs ?? null}, benchmark_latency_ms),
      benchmark_cost_efficiency = COALESCE(${benchmarks.costEfficiency ?? null}, benchmark_cost_efficiency),
      updated_at = NOW()
    WHERE name = ${name}
  `;

  logger.info("Model benchmarks updated", { name, benchmarks });
}
