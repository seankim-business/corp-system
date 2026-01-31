/**
 * Prompt Optimizer Service
 *
 * Generates, tests, and optimizes prompts for agents.
 * Uses LLM to generate variations and A/B testing to validate.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { createExperiment, startExperiment } from "./experiment-manager";
import Anthropic from "@anthropic-ai/sdk";

// Types
export interface PromptVariant {
  id: string;
  organizationId: string;
  agentId: string;
  version: number;
  name: string | null;
  systemPrompt: string;
  userPromptTemplate: string | null;
  isActive: boolean;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  sampleSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFeedback {
  promptVariantId: string;
  success: boolean;
  latencyMs?: number;
  costCents?: number;
  userRating?: number;
  feedback?: string;
}

export interface PromptGenerationOptions {
  optimizationGoal: "accuracy" | "speed" | "cost";
  numVariants?: number;
  preserveCore?: boolean;
}

const anthropic = new Anthropic();

/**
 * Generate prompt variations using LLM
 */
export async function generateVariants(
  basePrompt: string,
  options: PromptGenerationOptions,
): Promise<string[]> {
  const { optimizationGoal, numVariants = 3, preserveCore = true } = options;

  const goalInstructions = {
    accuracy:
      "Focus on clarity, specificity, and explicit instructions. Add examples and edge case handling.",
    speed:
      "Focus on conciseness and directness. Remove unnecessary context while preserving core functionality.",
    cost:
      "Focus on token efficiency. Use shorter instructions, minimize examples, focus on essential directives.",
  };

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a prompt engineering expert. Generate ${numVariants} improved variations of the following prompt.

Optimization goal: ${goalInstructions[optimizationGoal]}
${preserveCore ? "Preserve the core functionality and intent of the original prompt." : "You may restructure the prompt significantly."}

Original prompt:
"""
${basePrompt}
"""

Generate ${numVariants} variations. For each variation, explain briefly what you changed and why.

Format your response as JSON:
{
  "variants": [
    {
      "prompt": "The full prompt text...",
      "changes": "Brief explanation of changes made",
      "expected_improvement": "What improvement is expected"
    }
  ]
}`,
      },
    ],
  });

  try {
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*"variants"[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("Failed to parse LLM response for prompt variants");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.variants.map((v: { prompt: string }) => v.prompt);
  } catch (error) {
    logger.error(
      "Failed to generate prompt variants",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/**
 * Create a prompt variant in the database
 */
export async function createPromptVariant(
  organizationId: string,
  agentId: string,
  systemPrompt: string,
  userPromptTemplate?: string,
  name?: string,
): Promise<PromptVariant> {
  // Get next version number
  const maxVersion = await prisma.$queryRaw<[{ max: number | null }]>`
    SELECT MAX(version) as max FROM prompt_variants
    WHERE organization_id = ${organizationId}::uuid AND agent_id = ${agentId}
  `;

  const version = (maxVersion[0]?.max || 0) + 1;

  const result = await prisma.$queryRaw<PromptVariant[]>`
    INSERT INTO prompt_variants (organization_id, agent_id, version, name, system_prompt, user_prompt_template)
    VALUES (${organizationId}::uuid, ${agentId}, ${version}, ${name || null}, ${systemPrompt}, ${userPromptTemplate || null})
    RETURNING id, organization_id as "organizationId", agent_id as "agentId", version, name,
              system_prompt as "systemPrompt", user_prompt_template as "userPromptTemplate",
              is_active as "isActive", success_rate as "successRate", avg_latency_ms as "avgLatencyMs",
              avg_cost_cents as "avgCostCents", sample_size as "sampleSize",
              created_at as "createdAt", updated_at as "updatedAt"
  `;

  logger.info("Prompt variant created", {
    organizationId,
    agentId,
    version,
  });

  return result[0];
}

/**
 * Create A/B test for prompt variants
 */
export async function testPromptVariant(
  organizationId: string,
  agentId: string,
  newPrompt: string,
  trafficSplit: number = 0.5,
): Promise<string> {
  // Get current active prompt as control
  const activePrompts = await prisma.$queryRaw<PromptVariant[]>`
    SELECT system_prompt as "systemPrompt"
    FROM prompt_variants
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}
      AND is_active = true
    LIMIT 1
  `;

  const controlPrompt = activePrompts[0]?.systemPrompt || "";

  if (!controlPrompt) {
    throw new Error("No active prompt found for this agent");
  }

  // Create the new variant
  const newVariant = await createPromptVariant(organizationId, agentId, newPrompt);

  // Create experiment
  const experiment = await createExperiment({
    organizationId,
    name: `Prompt test for ${agentId} - v${newVariant.version}`,
    agentId,
    type: "prompt",
    controlConfig: { promptVariantId: activePrompts[0], prompt: controlPrompt },
    treatmentConfig: { promptVariantId: newVariant.id, prompt: newPrompt },
    trafficSplit,
    primaryMetric: "success_rate",
  });

  // Start the experiment
  await startExperiment(experiment.id);

  logger.info("Prompt A/B test started", {
    experimentId: experiment.id,
    organizationId,
    agentId,
  });

  return experiment.id;
}

/**
 * Get best performing prompt for agent
 */
export async function getBestPrompt(
  organizationId: string,
  agentId: string,
): Promise<PromptVariant | null> {
  // First try to get active prompt
  const active = await prisma.$queryRaw<PromptVariant[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId", version, name,
           system_prompt as "systemPrompt", user_prompt_template as "userPromptTemplate",
           is_active as "isActive", success_rate as "successRate", avg_latency_ms as "avgLatencyMs",
           avg_cost_cents as "avgCostCents", sample_size as "sampleSize",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM prompt_variants
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}
      AND is_active = true
    LIMIT 1
  `;

  if (active.length > 0) {
    return active[0];
  }

  // Otherwise get best by success rate with minimum sample size
  const best = await prisma.$queryRaw<PromptVariant[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId", version, name,
           system_prompt as "systemPrompt", user_prompt_template as "userPromptTemplate",
           is_active as "isActive", success_rate as "successRate", avg_latency_ms as "avgLatencyMs",
           avg_cost_cents as "avgCostCents", sample_size as "sampleSize",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM prompt_variants
    WHERE organization_id = ${organizationId}::uuid
      AND agent_id = ${agentId}
      AND sample_size >= 10
    ORDER BY success_rate DESC, sample_size DESC
    LIMIT 1
  `;

  return best[0] || null;
}

/**
 * Get all prompt variants for an agent
 */
export async function getPromptVariants(
  organizationId: string,
  agentId: string,
): Promise<PromptVariant[]> {
  return prisma.$queryRaw<PromptVariant[]>`
    SELECT id, organization_id as "organizationId", agent_id as "agentId", version, name,
           system_prompt as "systemPrompt", user_prompt_template as "userPromptTemplate",
           is_active as "isActive", success_rate as "successRate", avg_latency_ms as "avgLatencyMs",
           avg_cost_cents as "avgCostCents", sample_size as "sampleSize",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM prompt_variants
    WHERE organization_id = ${organizationId}::uuid AND agent_id = ${agentId}
    ORDER BY version DESC
  `;
}

/**
 * Set a prompt variant as active
 */
export async function setActivePrompt(
  organizationId: string,
  agentId: string,
  variantId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Deactivate all variants for this agent
    await tx.$executeRaw`
      UPDATE prompt_variants
      SET is_active = false, updated_at = NOW()
      WHERE organization_id = ${organizationId}::uuid AND agent_id = ${agentId}
    `;

    // Activate the specified variant
    await tx.$executeRaw`
      UPDATE prompt_variants
      SET is_active = true, updated_at = NOW()
      WHERE id = ${variantId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND agent_id = ${agentId}
    `;
  });

  logger.info("Active prompt updated", {
    organizationId,
    agentId,
    variantId,
  });
}

/**
 * Update prompt metrics from feedback
 */
export async function updatePromptMetrics(
  variantId: string,
  success: boolean,
  latencyMs?: number,
  costCents?: number,
): Promise<void> {
  // Get current metrics
  const current = await prisma.$queryRaw<PromptVariant[]>`
    SELECT sample_size as "sampleSize", success_rate as "successRate",
           avg_latency_ms as "avgLatencyMs", avg_cost_cents as "avgCostCents"
    FROM prompt_variants
    WHERE id = ${variantId}::uuid
  `;

  if (current.length === 0) return;

  const variant = current[0];
  const newSampleSize = variant.sampleSize + 1;

  // Calculate running averages
  const successCount = Math.round(Number(variant.successRate) * variant.sampleSize) + (success ? 1 : 0);
  const newSuccessRate = successCount / newSampleSize;

  const newAvgLatency = latencyMs
    ? (variant.avgLatencyMs * variant.sampleSize + latencyMs) / newSampleSize
    : variant.avgLatencyMs;

  const newAvgCost = costCents
    ? (variant.avgCostCents * variant.sampleSize + costCents) / newSampleSize
    : variant.avgCostCents;

  await prisma.$executeRaw`
    UPDATE prompt_variants
    SET
      sample_size = ${newSampleSize},
      success_rate = ${newSuccessRate},
      avg_latency_ms = ${Math.round(newAvgLatency)},
      avg_cost_cents = ${Math.round(newAvgCost)},
      updated_at = NOW()
    WHERE id = ${variantId}::uuid
  `;
}

/**
 * Optimize prompt based on user feedback
 */
export async function optimizeFromFeedback(
  organizationId: string,
  agentId: string,
  feedback: UserFeedback[],
): Promise<PromptVariant | null> {
  // Get current best prompt
  const currentBest = await getBestPrompt(organizationId, agentId);
  if (!currentBest) {
    logger.warn("No existing prompt to optimize", { organizationId, agentId });
    return null;
  }

  // Analyze feedback to identify issues
  const issues: string[] = [];
  const successCount = feedback.filter((f) => f.success).length;
  const totalCount = feedback.length;

  if (successCount / totalCount < 0.8) {
    issues.push("Low success rate - prompt may be unclear or missing important instructions");
  }

  const avgRating =
    feedback.filter((f) => f.userRating !== undefined).reduce((sum, f) => sum + (f.userRating || 0), 0) /
      feedback.filter((f) => f.userRating !== undefined).length || 0;

  if (avgRating < 4) {
    issues.push("Low user ratings - prompt output quality may need improvement");
  }

  const feedbackTexts = feedback.filter((f) => f.feedback).map((f) => f.feedback);

  if (issues.length === 0 && feedbackTexts.length === 0) {
    logger.info("No optimization needed based on feedback", { organizationId, agentId });
    return currentBest;
  }

  // Generate improved prompt
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a prompt engineering expert. Improve the following prompt based on performance feedback.

Current prompt:
"""
${currentBest.systemPrompt}
"""

Issues identified:
${issues.map((i) => `- ${i}`).join("\n")}

User feedback:
${feedbackTexts.map((f) => `- "${f}"`).join("\n") || "No specific feedback provided"}

Success rate: ${((successCount / totalCount) * 100).toFixed(1)}%
Average user rating: ${avgRating.toFixed(1)}/5

Generate an improved version of the prompt that addresses these issues.
Return ONLY the improved prompt text, no explanations.`,
      },
    ],
  });

  const improvedPrompt =
    message.content[0].type === "text" ? message.content[0].text.trim() : "";

  if (!improvedPrompt) {
    logger.warn("Failed to generate improved prompt");
    return currentBest;
  }

  // Create new variant and test it
  const newVariant = await createPromptVariant(
    organizationId,
    agentId,
    improvedPrompt,
    currentBest.userPromptTemplate || undefined,
    `Auto-optimized from v${currentBest.version}`,
  );

  logger.info("Prompt optimized from feedback", {
    organizationId,
    agentId,
    oldVersion: currentBest.version,
    newVersion: newVariant.version,
  });

  return newVariant;
}
