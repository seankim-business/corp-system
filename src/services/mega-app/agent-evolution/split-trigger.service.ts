/**
 * Split Trigger Service
 *
 * Detects when agents should be split based on workload, complexity, and quality metrics.
 * Generates recommendations for how to split agent responsibilities.
 */

import { db as prisma } from "../../../db/client";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import {
  SplitTrigger,
  SplitStrategy,
  AgentSplitSuggestion,
  SplitRecommendationResult,
  WorkloadTriggerConditions,
  ComplexityTriggerConditions,
  QualityTriggerConditions,
  DEFAULT_PHASE_THRESHOLDS,
} from "./types";
import { MaturityTrackerService } from "./maturity-tracker.service";

// Cache configuration
const CACHE_PREFIX = "mega:split:";
const CACHE_TTL = 300; // 5 minutes

// Split trigger thresholds
const WORKLOAD_THRESHOLDS = {
  queueDepth: DEFAULT_PHASE_THRESHOLDS.mvpToGrowth.queueDepthThreshold,
  queueDepthDurationMs: DEFAULT_PHASE_THRESHOLDS.mvpToGrowth.queueDepthDurationMs,
  waitTimeMs: DEFAULT_PHASE_THRESHOLDS.mvpToGrowth.waitTimeThreshold,
  utilizationPercent: DEFAULT_PHASE_THRESHOLDS.mvpToGrowth.utilizationThreshold * 100,
};

const COMPLEXITY_THRESHOLDS = {
  taskDiversity: 5,
  distinctSkillSets: 3,
  expertiseGapScore: 0.7,
};

const QUALITY_THRESHOLDS = {
  errorRatePercent: 10,
  revisionRequestRate: 0.15,
  complexTaskErrorRate: 0.2,
};

/**
 * SplitTriggerService
 *
 * Evaluates agent workload and determines when splitting is needed.
 */
export class SplitTriggerService {
  constructor(_maturityTracker?: MaturityTrackerService) {
    // maturityTracker parameter reserved for future use
  }

  /**
   * Evaluate all split triggers for a module
   */
  async evaluateSplitTriggers(
    organizationId: string,
    moduleId: string
  ): Promise<SplitTrigger[]> {
    const startTime = Date.now();
    logger.info("Evaluating split triggers", { organizationId, moduleId });

    try {
      // Check cache first
      const cacheKey = `${CACHE_PREFIX}triggers:${organizationId}:${moduleId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const triggers = JSON.parse(cached) as SplitTrigger[];
        logger.debug("Returning cached triggers", { moduleId, count: triggers.length });
        return triggers;
      }

      // Evaluate all trigger types
      const [workloadTriggers, complexityTriggers, qualityTriggers] = await Promise.all([
        this.evaluateWorkloadTriggers(organizationId, moduleId),
        this.evaluateComplexityTriggers(organizationId, moduleId),
        this.evaluateQualityTriggers(organizationId, moduleId),
      ]);

      const allTriggers = [...workloadTriggers, ...complexityTriggers, ...qualityTriggers];

      // Cache results
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(allTriggers));

      metrics.timing("mega.split.evaluation", Date.now() - startTime);
      metrics.increment("mega.split.triggers_detected", {
        moduleId,
        count: String(allTriggers.length),
      });

      logger.info("Split triggers evaluated", {
        moduleId,
        workload: workloadTriggers.length,
        complexity: complexityTriggers.length,
        quality: qualityTriggers.length,
      });

      return allTriggers;
    } catch (error) {
      logger.error("Failed to evaluate split triggers", { moduleId }, error as Error);
      metrics.increment("mega.split.evaluation.error");
      throw error;
    }
  }

  /**
   * Generate a detailed split recommendation for a trigger
   */
  async generateSplitRecommendation(
    organizationId: string,
    trigger: SplitTrigger
  ): Promise<SplitRecommendationResult> {
    logger.info("Generating split recommendation", {
      moduleId: trigger.moduleId,
      type: trigger.type,
      strategy: trigger.recommendedStrategy,
    });

    const suggestedAgents = await this.refineAgentSuggestions(
      organizationId,
      trigger.moduleId,
      trigger.recommendedStrategy
    );

    // Calculate estimated benefits
    const estimatedBenefits = this.calculateEstimatedBenefits(trigger, suggestedAgents.length);

    // Calculate estimated costs
    const estimatedCosts = this.calculateEstimatedCosts(suggestedAgents);

    // Generate implementation steps
    const implementationSteps = this.generateImplementationSteps(trigger, suggestedAgents);

    // Identify risks
    const risks = this.identifyRisks(trigger, suggestedAgents);

    // Calculate confidence score
    const confidence = this.calculateConfidence(trigger, estimatedBenefits, estimatedCosts);

    const result: SplitRecommendationResult = {
      trigger,
      strategy: trigger.recommendedStrategy,
      suggestedAgents,
      estimatedBenefits,
      estimatedCosts,
      implementationSteps,
      risks,
      confidence,
    };

    metrics.increment("mega.split.recommendation_generated", {
      strategy: trigger.recommendedStrategy,
      confidence: String(Math.round(confidence * 100)),
    });

    return result;
  }

  /**
   * Evaluate workload-based triggers
   */
  private async evaluateWorkloadTriggers(
    organizationId: string,
    moduleId: string
  ): Promise<SplitTrigger[]> {
    const triggers: SplitTrigger[] = [];
    const conditions = await this.checkWorkloadConditions(organizationId, moduleId);

    // Queue depth trigger
    if (conditions.queueDepthExceedsThreshold) {
      const currentQueueDepth = await this.getCurrentQueueDepth(organizationId, moduleId);

      triggers.push({
        type: "workload",
        reason: `Queue depth (${currentQueueDepth}) exceeds threshold (${WORKLOAD_THRESHOLDS.queueDepth}) for extended period`,
        moduleId,
        recommendedStrategy: this.selectStrategyForWorkload(conditions),
        suggestedAgents: await this.suggestAgentsForWorkload(organizationId, moduleId),
        metrics: {
          currentValue: currentQueueDepth,
          threshold: WORKLOAD_THRESHOLDS.queueDepth,
          duration: conditions.queueDepthDuration,
        },
        detectedAt: new Date(),
        severity: this.calculateWorkloadSeverity(currentQueueDepth),
      });
    }

    // Wait time trigger
    if (conditions.avgWaitTimeExceedsThreshold) {
      const avgWaitTime = await this.getAverageWaitTime(organizationId, moduleId);

      triggers.push({
        type: "workload",
        reason: `Average wait time (${Math.round(avgWaitTime / 60000)} min) exceeds threshold (${WORKLOAD_THRESHOLDS.waitTimeMs / 60000} min)`,
        moduleId,
        recommendedStrategy: "quality-tier-split",
        suggestedAgents: this.suggestQualityTierAgents(moduleId),
        metrics: {
          currentValue: avgWaitTime,
          threshold: WORKLOAD_THRESHOLDS.waitTimeMs,
        },
        detectedAt: new Date(),
        severity: this.calculateWaitTimeSeverity(avgWaitTime),
      });
    }

    // Utilization trigger
    if (conditions.utilizationExceedsThreshold) {
      const utilization = await this.getAgentUtilization(organizationId, moduleId);

      triggers.push({
        type: "workload",
        reason: `Agent utilization (${utilization.toFixed(1)}%) exceeds threshold (${WORKLOAD_THRESHOLDS.utilizationPercent}%)`,
        moduleId,
        recommendedStrategy: "functional-split",
        suggestedAgents: await this.suggestFunctionalSplitAgents(organizationId, moduleId),
        metrics: {
          currentValue: utilization,
          threshold: WORKLOAD_THRESHOLDS.utilizationPercent,
        },
        detectedAt: new Date(),
        severity: utilization > 95 ? "high" : "medium",
      });
    }

    return triggers;
  }

  /**
   * Evaluate complexity-based triggers
   */
  private async evaluateComplexityTriggers(
    organizationId: string,
    moduleId: string
  ): Promise<SplitTrigger[]> {
    const triggers: SplitTrigger[] = [];
    const conditions = await this.checkComplexityConditions(organizationId, moduleId);

    // Task diversity trigger
    if (conditions.highTaskDiversity) {
      triggers.push({
        type: "complexity",
        reason: `High task diversity (${conditions.taskTypeCount} types) indicates need for specialization`,
        moduleId,
        recommendedStrategy: "functional-split",
        suggestedAgents: await this.suggestSpecialistAgents(
          organizationId,
          moduleId,
          conditions.distinctSkillSetsRequired
        ),
        metrics: {
          currentValue: conditions.taskTypeCount,
          threshold: COMPLEXITY_THRESHOLDS.taskDiversity,
        },
        detectedAt: new Date(),
        severity: conditions.taskTypeCount > 10 ? "high" : "medium",
      });
    }

    // Expertise gap trigger
    if (conditions.expertiseGapDetected) {
      triggers.push({
        type: "complexity",
        reason: "Expertise gaps detected - some task types require specialized knowledge",
        moduleId,
        recommendedStrategy: "pipeline-split",
        suggestedAgents: this.suggestExpertiseAgents(moduleId, conditions.distinctSkillSetsRequired),
        metrics: {
          currentValue: 1,
          threshold: 0,
        },
        detectedAt: new Date(),
        severity: "medium",
      });
    }

    return triggers;
  }

  /**
   * Evaluate quality-based triggers
   */
  private async evaluateQualityTriggers(
    organizationId: string,
    moduleId: string
  ): Promise<SplitTrigger[]> {
    const triggers: SplitTrigger[] = [];
    const conditions = await this.checkQualityConditions(organizationId, moduleId);

    // Error rate trigger
    if (conditions.qualityDeclining) {
      const overallErrorRate = await this.getOverallErrorRate(organizationId, moduleId);

      triggers.push({
        type: "quality",
        reason: `Error rate (${(overallErrorRate * 100).toFixed(1)}%) exceeds acceptable threshold (${QUALITY_THRESHOLDS.errorRatePercent}%)`,
        moduleId,
        recommendedStrategy: "pipeline-split",
        suggestedAgents: this.suggestQualityFocusedAgents(moduleId),
        metrics: {
          currentValue: overallErrorRate * 100,
          threshold: QUALITY_THRESHOLDS.errorRatePercent,
        },
        detectedAt: new Date(),
        severity: overallErrorRate > 0.2 ? "high" : "medium",
      });
    }

    // High revision request rate
    if (conditions.revisionRequestRate > QUALITY_THRESHOLDS.revisionRequestRate) {
      triggers.push({
        type: "quality",
        reason: `High revision request rate (${(conditions.revisionRequestRate * 100).toFixed(1)}%) indicates quality issues`,
        moduleId,
        recommendedStrategy: "quality-tier-split",
        suggestedAgents: this.suggestReviewerAgents(moduleId),
        metrics: {
          currentValue: conditions.revisionRequestRate * 100,
          threshold: QUALITY_THRESHOLDS.revisionRequestRate * 100,
        },
        detectedAt: new Date(),
        severity: "medium",
      });
    }

    return triggers;
  }

  /**
   * Check workload conditions
   */
  private async checkWorkloadConditions(
    organizationId: string,
    moduleId: string
  ): Promise<WorkloadTriggerConditions> {
    const [queueDepth, avgWaitTime, utilization] = await Promise.all([
      this.getCurrentQueueDepth(organizationId, moduleId),
      this.getAverageWaitTime(organizationId, moduleId),
      this.getAgentUtilization(organizationId, moduleId),
    ]);

    // Check if queue depth has been high for extended period
    const queueHistory = await this.getQueueDepthHistory(organizationId, moduleId);
    const queueDepthDuration = this.calculateHighQueueDuration(queueHistory);

    return {
      queueDepthExceedsThreshold:
        queueDepth > WORKLOAD_THRESHOLDS.queueDepth &&
        queueDepthDuration >= WORKLOAD_THRESHOLDS.queueDepthDurationMs,
      queueDepthDuration,
      avgWaitTimeExceedsThreshold: avgWaitTime > WORKLOAD_THRESHOLDS.waitTimeMs,
      utilizationExceedsThreshold: utilization > WORKLOAD_THRESHOLDS.utilizationPercent,
    };
  }

  /**
   * Check complexity conditions
   */
  private async checkComplexityConditions(
    organizationId: string,
    moduleId: string
  ): Promise<ComplexityTriggerConditions> {
    // Count artifacts for this module
    const total = await prisma.valueStreamArtifact.count({
      where: { organizationId, moduleId },
    });

    const errors = await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        status: "error",
      },
    });

    const errorRate = total > 0 ? errors / total : 0;
    const taskTypeCount = 1; // Simplified: each module is a task type
    const distinctSkillSets = [moduleId.toLowerCase().replace(/_/g, "-")];
    const expertiseGapDetected = errorRate > COMPLEXITY_THRESHOLDS.expertiseGapScore;

    return {
      highTaskDiversity: taskTypeCount > COMPLEXITY_THRESHOLDS.taskDiversity,
      taskTypeCount,
      distinctSkillSetsRequired: distinctSkillSets,
      expertiseGapDetected,
    };
  }

  /**
   * Check quality conditions
   */
  private async checkQualityConditions(
    organizationId: string,
    moduleId: string
  ): Promise<QualityTriggerConditions> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get error rates for the module
    const errorRateByTaskType = new Map<string, number>();

    const total = await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        createdAt: { gte: oneDayAgo },
      },
    });
    const errors = await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        status: "error",
        createdAt: { gte: oneDayAgo },
      },
    });
    errorRateByTaskType.set(moduleId, total > 0 ? errors / total : 0);

    // Calculate overall error rate
    const overallErrorRate = await this.getOverallErrorRate(organizationId, moduleId);

    // Estimate revision request rate (artifacts with version > 1)
    const totalArtifacts = await prisma.valueStreamArtifact.count({
      where: { organizationId, moduleId, createdAt: { gte: oneDayAgo } },
    });
    const revisedArtifacts = await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        createdAt: { gte: oneDayAgo },
        version: { gt: 1 },
      },
    });
    const revisionRequestRate = totalArtifacts > 0 ? revisedArtifacts / totalArtifacts : 0;

    // Calculate complex task error rate (simplified - assumes certain types are "complex")
    const complexTypes = Array.from(errorRateByTaskType.entries())
      .filter(([_, rate]) => rate > 0.1);
    const complexTaskErrorRate =
      complexTypes.length > 0
        ? complexTypes.reduce((sum, [_, rate]) => sum + rate, 0) / complexTypes.length
        : 0;

    return {
      qualityDeclining: overallErrorRate > QUALITY_THRESHOLDS.errorRatePercent / 100,
      errorRateByTaskType,
      revisionRequestRate,
      complexTaskErrorRate,
    };
  }

  // Helper methods for metrics

  private async getCurrentQueueDepth(organizationId: string, moduleId: string): Promise<number> {
    return await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        status: { in: ["pending", "processing"] },
      },
    });
  }

  private async getAverageWaitTime(organizationId: string, moduleId: string): Promise<number> {
    const pendingArtifacts = await prisma.valueStreamArtifact.findMany({
      where: {
        organizationId,
        moduleId,
        status: "pending",
      },
      select: { createdAt: true },
      take: 100,
    });

    if (pendingArtifacts.length === 0) return 0;

    const now = Date.now();
    return (
      pendingArtifacts.reduce((sum, a) => sum + (now - a.createdAt.getTime()), 0) /
      pendingArtifacts.length
    );
  }

  private async getAgentUtilization(organizationId: string, moduleId: string): Promise<number> {
    const team = await prisma.megaAppTeam.findFirst({
      where: { organizationId, moduleId, status: "active" },
    });

    if (!team) return 0;

    const assignments = await prisma.agentAssignment.findMany({
      where: { organizationId, status: "active" },
      select: { workload: true },
    });

    if (assignments.length === 0) return 0;

    return (
      (assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length) * 100
    );
  }

  private async getQueueDepthHistory(
    organizationId: string,
    moduleId: string
  ): Promise<{ timestamp: Date; depth: number }[]> {
    // Simplified - in production would use time-series data
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const currentDepth = await this.getCurrentQueueDepth(organizationId, moduleId);

    // Return simulated history for now
    return [
      { timestamp: new Date(oneHourAgo), depth: currentDepth * 0.9 },
      { timestamp: new Date(now - 30 * 60 * 1000), depth: currentDepth * 0.95 },
      { timestamp: new Date(), depth: currentDepth },
    ];
  }

  private calculateHighQueueDuration(
    history: { timestamp: Date; depth: number }[]
  ): number {
    let duration = 0;
    const threshold = WORKLOAD_THRESHOLDS.queueDepth;

    for (let i = 1; i < history.length; i++) {
      if (history[i - 1].depth > threshold && history[i].depth > threshold) {
        duration += history[i].timestamp.getTime() - history[i - 1].timestamp.getTime();
      }
    }

    return duration;
  }

  private async getOverallErrorRate(organizationId: string, moduleId: string): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, errors] = await Promise.all([
      prisma.valueStreamArtifact.count({
        where: { organizationId, moduleId, createdAt: { gte: oneDayAgo } },
      }),
      prisma.valueStreamArtifact.count({
        where: {
          organizationId,
          moduleId,
          status: "error",
          createdAt: { gte: oneDayAgo },
        },
      }),
    ]);

    return total > 0 ? errors / total : 0;
  }

  // Strategy selection and agent suggestion helpers

  private selectStrategyForWorkload(conditions: WorkloadTriggerConditions): SplitStrategy {
    if (conditions.avgWaitTimeExceedsThreshold) {
      return "quality-tier-split";
    }
    if (conditions.utilizationExceedsThreshold) {
      return "functional-split";
    }
    return "functional-split";
  }

  private calculateWorkloadSeverity(queueDepth: number): "low" | "medium" | "high" {
    if (queueDepth > WORKLOAD_THRESHOLDS.queueDepth * 3) return "high";
    if (queueDepth > WORKLOAD_THRESHOLDS.queueDepth * 2) return "medium";
    return "low";
  }

  private calculateWaitTimeSeverity(waitTime: number): "low" | "medium" | "high" {
    if (waitTime > WORKLOAD_THRESHOLDS.waitTimeMs * 3) return "high";
    if (waitTime > WORKLOAD_THRESHOLDS.waitTimeMs * 2) return "medium";
    return "low";
  }

  private async suggestAgentsForWorkload(
    organizationId: string,
    moduleId: string
  ): Promise<AgentSplitSuggestion[]> {
    return this.suggestFunctionalSplitAgents(organizationId, moduleId);
  }

  private async suggestFunctionalSplitAgents(
    _organizationId: string,
    moduleId: string
  ): Promise<AgentSplitSuggestion[]> {
    const agents: AgentSplitSuggestion[] = [
      {
        name: `${moduleId}-lead`,
        role: "lead",
        specialization: "Task routing and coordination",
        taskTypes: [moduleId],
        modelTier: "sonnet",
        capabilities: ["routing", "coordination", "quality-review"],
      },
      {
        name: `${moduleId}-worker`,
        role: "worker",
        specialization: `${moduleId} processing`,
        taskTypes: [moduleId],
        modelTier: "sonnet",
        capabilities: [moduleId.toLowerCase()],
      },
    ];

    return agents;
  }

  private suggestQualityTierAgents(moduleId: string): AgentSplitSuggestion[] {
    return [
      {
        name: `${moduleId}-quick`,
        role: "worker",
        specialization: "Quick processing for simple tasks",
        taskTypes: ["simple", "standard"],
        modelTier: "haiku",
        capabilities: ["fast-processing"],
      },
      {
        name: `${moduleId}-detailed`,
        role: "worker",
        specialization: "Detailed analysis for complex tasks",
        taskTypes: ["complex", "detailed"],
        modelTier: "opus",
        capabilities: ["deep-analysis"],
      },
    ];
  }

  private async suggestSpecialistAgents(
    _organizationId: string,
    moduleId: string,
    skillSets: string[]
  ): Promise<AgentSplitSuggestion[]> {
    const agents: AgentSplitSuggestion[] = [];

    for (const skill of skillSets.slice(0, 5)) {
      agents.push({
        name: `${moduleId}-${skill}-specialist`,
        role: "worker",
        specialization: `${skill} specialist`,
        taskTypes: [skill],
        modelTier: "sonnet",
        capabilities: [skill],
      });
    }

    return agents;
  }

  private suggestExpertiseAgents(
    moduleId: string,
    skillSets: string[]
  ): AgentSplitSuggestion[] {
    return [
      {
        name: `${moduleId}-validator`,
        role: "worker",
        specialization: "Input validation",
        taskTypes: ["validation"],
        modelTier: "haiku",
        capabilities: ["validation"],
      },
      {
        name: `${moduleId}-expert`,
        role: "worker",
        specialization: `Expert processing for ${skillSets.slice(0, 3).join(", ")}`,
        taskTypes: skillSets,
        modelTier: "opus",
        capabilities: skillSets,
      },
    ];
  }

  private suggestQualityFocusedAgents(moduleId: string): AgentSplitSuggestion[] {
    return [
      {
        name: `${moduleId}-processor`,
        role: "worker",
        specialization: "Core processing",
        taskTypes: ["processing"],
        modelTier: "sonnet",
        capabilities: ["processing"],
      },
      {
        name: `${moduleId}-qa`,
        role: "qa",
        specialization: "Quality assurance",
        taskTypes: ["review", "validation"],
        modelTier: "sonnet",
        capabilities: ["quality-review", "validation"],
      },
    ];
  }

  private suggestReviewerAgents(moduleId: string): AgentSplitSuggestion[] {
    return [
      {
        name: `${moduleId}-reviewer`,
        role: "qa",
        specialization: "Output review and quality control",
        taskTypes: ["review"],
        modelTier: "sonnet",
        capabilities: ["quality-review", "revision-handling"],
      },
    ];
  }

  // Recommendation calculation helpers

  private async refineAgentSuggestions(
    organizationId: string,
    moduleId: string,
    strategy: SplitStrategy
  ): Promise<AgentSplitSuggestion[]> {
    switch (strategy) {
      case "functional-split":
        return this.suggestFunctionalSplitAgents(organizationId, moduleId);
      case "quality-tier-split":
        return this.suggestQualityTierAgents(moduleId);
      case "pipeline-split":
        return this.suggestQualityFocusedAgents(moduleId);
      default:
        return [];
    }
  }

  private calculateEstimatedBenefits(
    trigger: SplitTrigger,
    agentCount: number
  ): SplitRecommendationResult["estimatedBenefits"] {
    const baseReduction = 0.3; // 30% base improvement
    const agentFactor = Math.min(agentCount * 0.1, 0.5); // Up to 50% additional

    return {
      expectedQueueReduction: Math.round((baseReduction + agentFactor) * 100),
      expectedWaitTimeReduction: Math.round((baseReduction + agentFactor * 0.8) * 100),
      expectedErrorRateReduction:
        trigger.type === "quality" ? Math.round((baseReduction + 0.2) * 100) : 10,
    };
  }

  private calculateEstimatedCosts(
    agents: AgentSplitSuggestion[]
  ): SplitRecommendationResult["estimatedCosts"] {
    // Simplified cost model
    const modelCosts: Record<string, number> = {
      haiku: 100,
      sonnet: 300,
      opus: 1000,
    };

    const additionalAgentCost = agents.reduce(
      (sum, agent) => sum + (modelCosts[agent.modelTier] || 300),
      0
    );

    return {
      additionalAgentCost,
      transitionPeriodCost: additionalAgentCost * 0.5, // 50% during transition
    };
  }

  private generateImplementationSteps(
    _trigger: SplitTrigger,
    agents: AgentSplitSuggestion[]
  ): string[] {
    const steps = [
      "1. Request AR Director approval for organization change",
      "2. Create new agent positions in AR system",
    ];

    for (let i = 0; i < agents.length; i++) {
      steps.push(`3.${i + 1}. Provision ${agents[i].name} (${agents[i].modelTier})`);
    }

    steps.push(
      "4. Configure task routing rules",
      "5. Begin gradual task migration",
      "6. Monitor performance during transition period",
      "7. Complete migration and decommission original agent if needed"
    );

    return steps;
  }

  private identifyRisks(trigger: SplitTrigger, agents: AgentSplitSuggestion[]): string[] {
    const risks = [
      "Temporary service disruption during transition",
      "Increased operational complexity with more agents",
      "Potential knowledge fragmentation across specialists",
    ];

    if (agents.length > 5) {
      risks.push("High number of agents may complicate coordination");
    }

    if (trigger.severity === "high") {
      risks.push("Delayed action may cause further quality degradation");
    }

    return risks;
  }

  private calculateConfidence(
    trigger: SplitTrigger,
    benefits: SplitRecommendationResult["estimatedBenefits"],
    costs: SplitRecommendationResult["estimatedCosts"]
  ): number {
    // Base confidence on trigger severity and benefit/cost ratio
    let confidence = 0.5;

    // Higher confidence for high severity triggers
    if (trigger.severity === "high") confidence += 0.2;
    if (trigger.severity === "medium") confidence += 0.1;

    // Adjust based on benefit/cost ratio
    const benefitValue = (benefits.expectedQueueReduction + benefits.expectedWaitTimeReduction) / 2;
    const costValue = costs.additionalAgentCost / 100;

    if (benefitValue > costValue * 2) confidence += 0.2;
    else if (benefitValue > costValue) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }
}

// Export singleton instance
let instance: SplitTriggerService | null = null;

export function getSplitTriggerService(
  maturityTracker?: MaturityTrackerService
): SplitTriggerService {
  if (!instance) {
    instance = new SplitTriggerService(maturityTracker);
  }
  return instance;
}
