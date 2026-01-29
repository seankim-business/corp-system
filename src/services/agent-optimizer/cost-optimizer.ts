/**
 * Cost Optimizer Service
 *
 * Strategies and recommendations for reducing agent costs
 * while maintaining quality thresholds.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { getModelProfiles, analyzeTradeoffs } from "./model-selector";

// Types
export interface CostReduction {
  strategy: string;
  description: string;
  estimatedSavingsPercent: number;
  implementationEffort: "low" | "medium" | "high";
  qualityImpact: "none" | "minor" | "moderate";
  details: Record<string, unknown>;
}

export interface CostAnalysis {
  organizationId: string;
  period: string;
  totalCostCents: number;
  totalRequests: number;
  avgCostPerRequest: number;
  byAgent: {
    agentId: string;
    costCents: number;
    requests: number;
    avgCost: number;
    percentOfTotal: number;
  }[];
  byModel: {
    model: string;
    costCents: number;
    requests: number;
    avgCost: number;
    percentOfTotal: number;
  }[];
  recommendations: CostReduction[];
}

export interface TokenEfficiencyAnalysis {
  agentId: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  inputOutputRatio: number;
  efficiency: "optimal" | "input_heavy" | "output_heavy";
  recommendation: string;
}

/**
 * Analyze organization costs and generate recommendations
 */
export async function analyzeCosts(
  organizationId: string,
  days: number = 30,
): Promise<CostAnalysis> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get total costs
  const totalData = await prisma.$queryRaw<
    [{ totalCostCents: bigint; totalRequests: bigint }]
  >`
    SELECT
      COALESCE(SUM(cost_cents), 0) as "totalCostCents",
      COUNT(*) as "totalRequests"
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND created_at >= ${startDate}
  `;

  const totalCostCents = Number(totalData[0].totalCostCents);
  const totalRequests = Number(totalData[0].totalRequests);
  const avgCostPerRequest = totalRequests > 0 ? totalCostCents / totalRequests : 0;

  // By agent breakdown
  const byAgentData = await prisma.$queryRaw<
    { agentId: string; costCents: bigint; requests: bigint }[]
  >`
    SELECT
      agent_id as "agentId",
      SUM(cost_cents) as "costCents",
      COUNT(*) as requests
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND created_at >= ${startDate}
    GROUP BY agent_id
    ORDER BY SUM(cost_cents) DESC
  `;

  const byAgent = byAgentData.map((a) => ({
    agentId: a.agentId,
    costCents: Number(a.costCents),
    requests: Number(a.requests),
    avgCost: Number(a.requests) > 0 ? Number(a.costCents) / Number(a.requests) : 0,
    percentOfTotal: totalCostCents > 0 ? (Number(a.costCents) / totalCostCents) * 100 : 0,
  }));

  // By model breakdown
  const byModelData = await prisma.$queryRaw<
    { model: string; costCents: bigint; requests: bigint }[]
  >`
    SELECT
      model,
      SUM(cost_cents) as "costCents",
      COUNT(*) as requests
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND created_at >= ${startDate}
    GROUP BY model
    ORDER BY SUM(cost_cents) DESC
  `;

  const byModel = byModelData.map((m) => ({
    model: m.model,
    costCents: Number(m.costCents),
    requests: Number(m.requests),
    avgCost: Number(m.requests) > 0 ? Number(m.costCents) / Number(m.requests) : 0,
    percentOfTotal: totalCostCents > 0 ? (Number(m.costCents) / totalCostCents) * 100 : 0,
  }));

  // Generate recommendations
  const recommendations = await generateRecommendations(
    organizationId,
    byAgent,
    byModel,
    totalCostCents,
  );

  return {
    organizationId,
    period: `${days} days`,
    totalCostCents,
    totalRequests,
    avgCostPerRequest,
    byAgent,
    byModel,
    recommendations,
  };
}

/**
 * Generate cost reduction recommendations
 */
async function generateRecommendations(
  organizationId: string,
  byAgent: CostAnalysis["byAgent"],
  byModel: CostAnalysis["byModel"],
  totalCostCents: number,
): Promise<CostReduction[]> {
  const recommendations: CostReduction[] = [];

  // 1. Model downgrade opportunities
  const expensiveModels = byModel.filter(
    (m) =>
      (m.model.includes("opus") || m.model.includes("gpt-4")) &&
      m.percentOfTotal > 20,
  );

  if (expensiveModels.length > 0) {
    const modelProfiles = await getModelProfiles();
    const cheaperAlternatives = modelProfiles.filter(
      (p) => p.name.includes("sonnet") || p.name.includes("haiku") || p.name.includes("mini"),
    );

    if (cheaperAlternatives.length > 0) {
      recommendations.push({
        strategy: "model_downgrade",
        description:
          "Use smaller models for simple tasks where high accuracy isn't critical",
        estimatedSavingsPercent: 30,
        implementationEffort: "low",
        qualityImpact: "minor",
        details: {
          expensiveModels: expensiveModels.map((m) => m.model),
          suggestedAlternatives: cheaperAlternatives.map((m) => m.name).slice(0, 3),
        },
      });
    }
  }

  // 2. High-volume agent optimization
  const highVolumeAgents = byAgent.filter(
    (a) => a.requests > 100 && a.percentOfTotal > 15,
  );

  for (const agent of highVolumeAgents) {
    const tradeoffs = await analyzeTradeoffs(organizationId, agent.agentId);

    if (tradeoffs.recommendations.length > 0) {
      // Map qualityImpact from TradeoffAnalysis to CostReduction format
      const qualityMap: Record<string, "none" | "minor" | "moderate"> = {
        none: "none",
        minor: "minor",
        significant: "moderate",
      };
      recommendations.push({
        strategy: "agent_model_optimization",
        description: `Optimize model selection for agent ${agent.agentId}`,
        estimatedSavingsPercent: tradeoffs.recommendations[0].costSavingsPercent,
        implementationEffort: "medium",
        qualityImpact: qualityMap[tradeoffs.recommendations[0].qualityImpact] || "minor",
        details: {
          agentId: agent.agentId,
          currentCost: agent.costCents,
          recommendations: tradeoffs.recommendations.slice(0, 2),
        },
      });
    }
  }

  // 3. Caching strategy
  if (totalCostCents > 10000) {
    // >$100/month
    recommendations.push({
      strategy: "response_caching",
      description: "Cache common queries to reduce duplicate API calls",
      estimatedSavingsPercent: 15,
      implementationEffort: "medium",
      qualityImpact: "none",
      details: {
        suggestion:
          "Implement semantic caching for frequently asked questions",
        estimatedHitRate: 0.2,
      },
    });
  }

  // 4. Prompt optimization
  if (byAgent.some((a) => a.avgCost > 50)) {
    // >$0.50 per request
    recommendations.push({
      strategy: "prompt_optimization",
      description:
        "Reduce prompt length and optimize system prompts to reduce token usage",
      estimatedSavingsPercent: 20,
      implementationEffort: "medium",
      qualityImpact: "none",
      details: {
        highCostAgents: byAgent.filter((a) => a.avgCost > 50).map((a) => a.agentId),
        suggestion: "Review and trim system prompts, use concise instructions",
      },
    });
  }

  // 5. Request batching
  if (byAgent.some((a) => a.requests > 1000)) {
    recommendations.push({
      strategy: "request_batching",
      description: "Batch multiple small requests into single API calls",
      estimatedSavingsPercent: 10,
      implementationEffort: "high",
      qualityImpact: "none",
      details: {
        suggestion: "Combine related queries into single context windows",
      },
    });
  }

  // Sort by estimated savings
  recommendations.sort((a, b) => b.estimatedSavingsPercent - a.estimatedSavingsPercent);

  return recommendations;
}

/**
 * Analyze token efficiency for an agent
 */
export async function analyzeTokenEfficiency(
  organizationId: string,
  agentId: string,
): Promise<TokenEfficiencyAnalysis> {
  const data = await prisma.$queryRaw<
    [{ avgInput: number; avgOutput: number }]
  >`
    SELECT
      AVG(input_tokens) as "avgInput",
      AVG(output_tokens) as "avgOutput"
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}::uuid
      AND created_at >= NOW() - INTERVAL '30 days'
  `;

  const avgInputTokens = data[0]?.avgInput || 0;
  const avgOutputTokens = data[0]?.avgOutput || 0;
  const inputOutputRatio = avgOutputTokens > 0 ? avgInputTokens / avgOutputTokens : 0;

  let efficiency: TokenEfficiencyAnalysis["efficiency"] = "optimal";
  let recommendation = "Token usage is balanced and efficient.";

  if (inputOutputRatio > 5) {
    efficiency = "input_heavy";
    recommendation =
      "Input tokens are disproportionately high. Consider reducing system prompt length or providing more concise context.";
  } else if (inputOutputRatio < 0.5) {
    efficiency = "output_heavy";
    recommendation =
      "Output tokens are high relative to input. Consider setting max_tokens limits or asking for more concise responses.";
  }

  return {
    agentId,
    avgInputTokens: Math.round(avgInputTokens),
    avgOutputTokens: Math.round(avgOutputTokens),
    inputOutputRatio: Math.round(inputOutputRatio * 100) / 100,
    efficiency,
    recommendation,
  };
}

/**
 * Calculate potential savings from recommendations
 */
export async function calculatePotentialSavings(
  organizationId: string,
  days: number = 30,
): Promise<{
  currentCostCents: number;
  potentialSavingsCents: number;
  savingsPercent: number;
  recommendations: { strategy: string; savingsCents: number }[];
}> {
  const analysis = await analyzeCosts(organizationId, days);

  let totalPotentialSavings = 0;
  const savingsBreakdown: { strategy: string; savingsCents: number }[] = [];

  for (const rec of analysis.recommendations) {
    const savings = Math.round(
      (analysis.totalCostCents * rec.estimatedSavingsPercent) / 100,
    );
    totalPotentialSavings += savings;
    savingsBreakdown.push({
      strategy: rec.strategy,
      savingsCents: savings,
    });
  }

  // Cap total savings at 60% (realistic maximum)
  const maxSavings = Math.round(analysis.totalCostCents * 0.6);
  totalPotentialSavings = Math.min(totalPotentialSavings, maxSavings);

  return {
    currentCostCents: analysis.totalCostCents,
    potentialSavingsCents: totalPotentialSavings,
    savingsPercent:
      analysis.totalCostCents > 0
        ? Math.round((totalPotentialSavings / analysis.totalCostCents) * 100)
        : 0,
    recommendations: savingsBreakdown,
  };
}

/**
 * Get daily cost trend
 */
export async function getDailyCostTrend(
  organizationId: string,
  days: number = 30,
): Promise<{ date: string; costCents: number; requests: number }[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const data = await prisma.$queryRaw<
    { date: Date; costCents: bigint; requests: bigint }[]
  >`
    SELECT
      DATE(created_at) as date,
      SUM(cost_cents) as "costCents",
      COUNT(*) as requests
    FROM agent_cost_records
    WHERE organization_id = ${organizationId}::uuid
      AND created_at >= ${startDate}
    GROUP BY DATE(created_at)
    ORDER BY date
  `;

  return data.map((d) => ({
    date: d.date.toISOString().split("T")[0],
    costCents: Number(d.costCents),
    requests: Number(d.requests),
  }));
}

/**
 * Set cost alert threshold
 */
export async function setCostAlert(
  organizationId: string,
  thresholdCents: number,
  alertType: "daily" | "weekly" | "monthly",
): Promise<void> {
  // Store in organization settings
  await prisma.$executeRaw`
    UPDATE organizations
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{costAlerts}',
      ${JSON.stringify({ thresholdCents, alertType })}::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${organizationId}::uuid
  `;

  logger.info("Cost alert configured", {
    organizationId,
    thresholdCents,
    alertType,
  });
}
