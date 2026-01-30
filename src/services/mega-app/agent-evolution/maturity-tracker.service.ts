/**
 * Maturity Tracker Service
 *
 * Tracks module maturity metrics and determines phase transitions
 * for the Mega App agent organization evolution.
 */

import { db as prisma } from "../../../db/client";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import {
  ModuleMaturityMetrics,
  MaturityPhase,
  PhaseThresholds,
  MaturityAssessmentResult,
  DEFAULT_PHASE_THRESHOLDS,
  SplitTrigger,
} from "./types";

// Cache key prefix
const CACHE_PREFIX = "mega:maturity:";
const CACHE_TTL = 300; // 5 minutes

/**
 * MaturityTrackerService
 *
 * Assesses module maturity based on operational metrics and determines
 * when modules should transition between MVP, Growth, and Mature phases.
 */
export class MaturityTrackerService {
  private readonly thresholds: PhaseThresholds;

  constructor(thresholds?: PhaseThresholds) {
    this.thresholds = thresholds || DEFAULT_PHASE_THRESHOLDS;
  }

  /**
   * Assess the maturity of a specific module
   */
  async assessModuleMaturity(
    organizationId: string,
    moduleId: string
  ): Promise<MaturityAssessmentResult> {
    const startTime = Date.now();
    logger.info("Assessing module maturity", { organizationId, moduleId });

    try {
      // Get current metrics
      const currentMetrics = await this.calculateModuleMetrics(organizationId, moduleId);

      // Determine current phase from stored state
      const currentPhase = await this.getCurrentPhase(organizationId, moduleId);

      // Determine recommended phase based on metrics
      const recommendedPhase = this.getMaturityPhase(currentMetrics);

      // Detect any split triggers
      const triggers = await this.detectSplitTriggers(organizationId, moduleId, currentMetrics);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        currentPhase,
        recommendedPhase,
        currentMetrics,
        triggers
      );

      const result: MaturityAssessmentResult = {
        moduleId,
        currentPhase,
        recommendedPhase,
        phaseTransitionRecommended: currentPhase !== recommendedPhase,
        metrics: currentMetrics,
        triggers,
        recommendations,
        assessedAt: new Date(),
      };

      // Cache the assessment
      await this.cacheAssessment(organizationId, moduleId, result);

      // Store maturity record
      await this.storeMaturityRecord(organizationId, moduleId, {
        moduleId,
        phase: currentPhase,
        metrics: currentMetrics,
        lastAssessed: new Date(),
      });

      metrics.timing("mega.maturity.assessment", Date.now() - startTime);
      metrics.increment("mega.maturity.assessed", { moduleId, phase: currentPhase });

      logger.info("Module maturity assessed", {
        moduleId,
        currentPhase,
        recommendedPhase,
        triggerCount: triggers.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to assess module maturity", { moduleId }, error as Error);
      metrics.increment("mega.maturity.assessment.error");
      throw error;
    }
  }

  /**
   * Calculate operational metrics for a module
   */
  async calculateModuleMetrics(
    organizationId: string,
    moduleId: string
  ): Promise<ModuleMaturityMetrics["metrics"]> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get team for module
    const team = await prisma.megaAppTeam.findFirst({
      where: {
        organizationId,
        moduleId,
        status: "active",
      },
    });

    if (!team) {
      logger.warn("No team found for module", { moduleId });
      return this.getDefaultMetrics();
    }

    // Get task execution data from value stream artifacts
    const [completedTasks, totalTasks, pendingArtifacts, errorArtifacts] = await Promise.all([
      // Completed tasks (completed artifacts) in last 24h
      prisma.valueStreamArtifact.count({
        where: {
          organizationId,
          moduleId,
          status: "completed",
          updatedAt: { gte: oneDayAgo },
        },
      }),
      // Total tasks in last 24h
      prisma.valueStreamArtifact.count({
        where: {
          organizationId,
          moduleId,
          createdAt: { gte: oneDayAgo },
        },
      }),
      // Pending tasks (queue depth)
      prisma.valueStreamArtifact.count({
        where: {
          organizationId,
          moduleId,
          status: { in: ["pending", "processing"] },
        },
      }),
      // Error tasks
      prisma.valueStreamArtifact.count({
        where: {
          organizationId,
          moduleId,
          status: "error",
          updatedAt: { gte: oneDayAgo },
        },
      }),
    ]);

    // Calculate task completion rate
    const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;

    // Calculate error rate
    const errorRate = totalTasks > 0 ? (errorArtifacts / totalTasks) * 100 : 0;

    // Get average wait time from pending artifacts
    const pendingArtifactList = await prisma.valueStreamArtifact.findMany({
      where: {
        organizationId,
        moduleId,
        status: "pending",
      },
      select: { createdAt: true },
      take: 100,
    });

    const averageWaitTime =
      pendingArtifactList.length > 0
        ? pendingArtifactList.reduce(
            (sum, a) => sum + (now.getTime() - a.createdAt.getTime()),
            0
          ) / pendingArtifactList.length
        : 0;

    // Calculate utilization from agent assignments
    const teamAgents = await prisma.agent.findMany({
      where: {
        organizationId,
        // Agents working on this module's tasks
        arAssignments: {
          some: {
            status: "active",
          },
        },
      },
      include: {
        arAssignments: {
          where: { status: "active" },
        },
      },
    });

    const utilizationRate =
      teamAgents.length > 0
        ? teamAgents.reduce(
            (sum, agent) =>
              sum +
              (agent.arAssignments[0]?.workload || 0),
            0
          ) /
          teamAgents.length *
          100
        : 0;

    // Calculate task diversity (count of artifacts in the module)
    const taskDiversity = await prisma.valueStreamArtifact.count({
      where: {
        organizationId,
        moduleId,
        createdAt: { gte: oneDayAgo },
      },
    });

    return {
      taskCompletionRate,
      averageQueueDepth: pendingArtifacts,
      averageWaitTime,
      utilizationRate,
      errorRate,
      taskDiversity,
    };
  }

  /**
   * Determine the maturity phase based on metrics
   */
  getMaturityPhase(metricsData: ModuleMaturityMetrics["metrics"]): MaturityPhase {
    const { mvpToGrowth, growthToMature } = this.thresholds;

    // Check for Mature phase conditions
    if (
      metricsData.taskDiversity >= growthToMature.minTaskDiversity &&
      metricsData.taskCompletionRate > 90 &&
      metricsData.errorRate < 5
    ) {
      return "mature";
    }

    // Check for Growth phase conditions (any trigger condition met)
    if (
      metricsData.averageQueueDepth > mvpToGrowth.queueDepthThreshold ||
      metricsData.averageWaitTime > mvpToGrowth.waitTimeThreshold ||
      metricsData.utilizationRate > mvpToGrowth.utilizationThreshold * 100
    ) {
      return "growth";
    }

    return "mvp";
  }

  /**
   * Get the current stored phase for a module
   */
  async getCurrentPhase(organizationId: string, moduleId: string): Promise<MaturityPhase> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}phase:${organizationId}:${moduleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return cached as MaturityPhase;
    }

    // Check team configuration
    const team = await prisma.megaAppTeam.findFirst({
      where: {
        organizationId,
        moduleId,
        status: "active",
      },
    });

    // Infer phase from team configuration
    let phase: MaturityPhase = "mvp";

    if (team) {
      // If team has child teams, likely mature
      const childTeams = await prisma.megaAppTeam.count({
        where: {
          parentTeamId: team.id,
          status: "active",
        },
      });

      if (childTeams > 0) {
        phase = "mature";
      } else if (team.maxAgents > 3) {
        phase = "growth";
      }
    }

    // Cache the phase
    await redis.setex(cacheKey, CACHE_TTL, phase);

    return phase;
  }

  /**
   * Detect split triggers based on current metrics
   */
  private async detectSplitTriggers(
    organizationId: string,
    moduleId: string,
    metricsData: ModuleMaturityMetrics["metrics"]
  ): Promise<SplitTrigger[]> {
    const triggers: SplitTrigger[] = [];
    const { mvpToGrowth } = this.thresholds;

    // Workload-based triggers
    if (metricsData.averageQueueDepth > mvpToGrowth.queueDepthThreshold) {
      triggers.push({
        type: "workload",
        reason: `Queue depth (${metricsData.averageQueueDepth}) exceeds threshold (${mvpToGrowth.queueDepthThreshold})`,
        moduleId,
        recommendedStrategy: "functional-split",
        suggestedAgents: await this.suggestFunctionalSplit(organizationId, moduleId),
        metrics: {
          currentValue: metricsData.averageQueueDepth,
          threshold: mvpToGrowth.queueDepthThreshold,
        },
        detectedAt: new Date(),
        severity: metricsData.averageQueueDepth > mvpToGrowth.queueDepthThreshold * 2 ? "high" : "medium",
      });
    }

    if (metricsData.averageWaitTime > mvpToGrowth.waitTimeThreshold) {
      triggers.push({
        type: "workload",
        reason: `Average wait time (${Math.round(metricsData.averageWaitTime / 60000)} min) exceeds threshold (${mvpToGrowth.waitTimeThreshold / 60000} min)`,
        moduleId,
        recommendedStrategy: "quality-tier-split",
        suggestedAgents: this.suggestQualityTierSplit(moduleId),
        metrics: {
          currentValue: metricsData.averageWaitTime,
          threshold: mvpToGrowth.waitTimeThreshold,
        },
        detectedAt: new Date(),
        severity: metricsData.averageWaitTime > mvpToGrowth.waitTimeThreshold * 2 ? "high" : "medium",
      });
    }

    // Complexity-based triggers
    if (metricsData.taskDiversity > 5) {
      triggers.push({
        type: "complexity",
        reason: `High task diversity (${metricsData.taskDiversity} types) suggests specialization opportunity`,
        moduleId,
        recommendedStrategy: "functional-split",
        suggestedAgents: await this.suggestFunctionalSplit(organizationId, moduleId),
        metrics: {
          currentValue: metricsData.taskDiversity,
          threshold: 5,
        },
        detectedAt: new Date(),
        severity: "medium",
      });
    }

    // Quality-based triggers
    if (metricsData.errorRate > 10) {
      triggers.push({
        type: "quality",
        reason: `Error rate (${metricsData.errorRate.toFixed(1)}%) exceeds acceptable threshold (10%)`,
        moduleId,
        recommendedStrategy: "pipeline-split",
        suggestedAgents: this.suggestPipelineSplit(moduleId),
        metrics: {
          currentValue: metricsData.errorRate,
          threshold: 10,
        },
        detectedAt: new Date(),
        severity: metricsData.errorRate > 20 ? "high" : "medium",
      });
    }

    return triggers;
  }

  /**
   * Suggest agents for functional split
   */
  private async suggestFunctionalSplit(
    _organizationId: string,
    moduleId: string
  ): Promise<SplitTrigger["suggestedAgents"]> {
    // Suggest specialized agents based on module
    const suggestions: SplitTrigger["suggestedAgents"] = [];

    // Add specialist workers
    suggestions.push({
      name: `${moduleId}-specialist`,
      role: "worker",
      specialization: `${moduleId} processing`,
      taskTypes: [moduleId],
      modelTier: "sonnet",
      capabilities: [moduleId.toLowerCase().replace(/_/g, "-")],
    });

    // Add a lead agent
    suggestions.unshift({
      name: `${moduleId}-lead`,
      role: "lead",
      specialization: "Task routing and quality review",
      taskTypes: [moduleId],
      modelTier: "sonnet",
      capabilities: ["task-routing", "quality-review", "escalation-handling"],
    });

    return suggestions;
  }

  /**
   * Suggest agents for quality tier split
   */
  private suggestQualityTierSplit(moduleId: string): SplitTrigger["suggestedAgents"] {
    return [
      {
        name: `${moduleId}-quick-processor`,
        role: "worker",
        specialization: "Rapid processing for simple tasks",
        taskTypes: ["simple", "standard"],
        modelTier: "haiku",
        capabilities: ["quick-processing", "high-throughput"],
      },
      {
        name: `${moduleId}-detailed-analyst`,
        role: "worker",
        specialization: "Thorough analysis for complex tasks",
        taskTypes: ["complex", "detailed"],
        modelTier: "opus",
        capabilities: ["deep-analysis", "complex-reasoning"],
      },
    ];
  }

  /**
   * Suggest agents for pipeline split
   */
  private suggestPipelineSplit(moduleId: string): SplitTrigger["suggestedAgents"] {
    return [
      {
        name: `${moduleId}-validator`,
        role: "worker",
        specialization: "Input validation and preprocessing",
        taskTypes: ["validation"],
        modelTier: "haiku",
        capabilities: ["input-validation", "preprocessing"],
      },
      {
        name: `${moduleId}-processor`,
        role: "worker",
        specialization: "Core processing logic",
        taskTypes: ["processing"],
        modelTier: "sonnet",
        capabilities: ["core-processing"],
      },
      {
        name: `${moduleId}-reviewer`,
        role: "qa",
        specialization: "Quality review and output validation",
        taskTypes: ["review"],
        modelTier: "sonnet",
        capabilities: ["quality-review", "output-validation"],
      },
    ];
  }

  /**
   * Generate recommendations based on assessment
   */
  private generateRecommendations(
    currentPhase: MaturityPhase,
    recommendedPhase: MaturityPhase,
    metricsData: ModuleMaturityMetrics["metrics"],
    triggers: SplitTrigger[]
  ): string[] {
    const recommendations: string[] = [];

    // Phase transition recommendations
    if (currentPhase !== recommendedPhase) {
      recommendations.push(
        `Consider transitioning from ${currentPhase} to ${recommendedPhase} phase based on current metrics`
      );
    }

    // Metric-specific recommendations
    if (metricsData.taskCompletionRate < 80) {
      recommendations.push(
        "Task completion rate is below target. Review agent capabilities and task complexity."
      );
    }

    if (metricsData.errorRate > 5) {
      recommendations.push(
        "Error rate is elevated. Consider implementing additional validation or quality checks."
      );
    }

    if (metricsData.utilizationRate < 50) {
      recommendations.push(
        "Agent utilization is low. Consider consolidating agents or redistributing workload."
      );
    }

    if (metricsData.utilizationRate > 90) {
      recommendations.push(
        "Agent utilization is near capacity. Consider scaling up or splitting workload."
      );
    }

    // Trigger-specific recommendations
    for (const trigger of triggers) {
      if (trigger.severity === "high") {
        recommendations.push(
          `High priority: ${trigger.reason}. Recommended action: ${trigger.recommendedStrategy}`
        );
      }
    }

    return recommendations;
  }

  /**
   * Cache assessment result
   */
  private async cacheAssessment(
    organizationId: string,
    moduleId: string,
    result: MaturityAssessmentResult
  ): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}assessment:${organizationId}:${moduleId}`;
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  }

  /**
   * Store maturity record in database
   */
  private async storeMaturityRecord(
    organizationId: string,
    moduleId: string,
    record: ModuleMaturityMetrics
  ): Promise<void> {
    try {
      // Store in value stream artifact as metadata for now
      // A dedicated maturity tracking table could be added later
      const existing = await prisma.valueStreamArtifact.findFirst({
        where: {
          organizationId,
          moduleId,
          tags: { has: "maturity_assessment" },
        },
      });

      if (existing) {
        await prisma.valueStreamArtifact.update({
          where: { id: existing.id },
          data: {
            data: JSON.parse(JSON.stringify(record)),
            version: { increment: 1 },
          },
        });
      } else {
        await prisma.valueStreamArtifact.create({
          data: {
            organizationId,
            moduleId,
            status: "approved",
            version: 1,
            data: JSON.parse(JSON.stringify(record)),
            tags: ["maturity_assessment"],
          },
        });
      }
    } catch (error) {
      logger.warn("Failed to store maturity record", { moduleId, error: error as Error });
    }
  }

  /**
   * Get default metrics for modules without data
   */
  private getDefaultMetrics(): ModuleMaturityMetrics["metrics"] {
    return {
      taskCompletionRate: 100,
      averageQueueDepth: 0,
      averageWaitTime: 0,
      utilizationRate: 0,
      errorRate: 0,
      taskDiversity: 1,
    };
  }

  /**
   * Get cached assessment if available
   */
  async getCachedAssessment(
    organizationId: string,
    moduleId: string
  ): Promise<MaturityAssessmentResult | null> {
    const cacheKey = `${CACHE_PREFIX}assessment:${organizationId}:${moduleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as MaturityAssessmentResult;
    }

    return null;
  }

  /**
   * Update module phase
   */
  async updateModulePhase(
    organizationId: string,
    moduleId: string,
    newPhase: MaturityPhase
  ): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}phase:${organizationId}:${moduleId}`;
    await redis.setex(cacheKey, CACHE_TTL * 12, newPhase); // Longer TTL for phase

    logger.info("Module phase updated", { moduleId, newPhase });
    metrics.increment("mega.maturity.phase_transition", { moduleId, phase: newPhase });
  }
}

// Export singleton instance
let instance: MaturityTrackerService | null = null;

export function getMaturityTrackerService(
  thresholds?: PhaseThresholds
): MaturityTrackerService {
  if (!instance) {
    instance = new MaturityTrackerService(thresholds);
  }
  return instance;
}
