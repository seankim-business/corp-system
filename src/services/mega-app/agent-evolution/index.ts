/**
 * Agent Evolution Service
 *
 * Automatically scales and evolves the MegaApp agent organization
 * based on module maturity and operational metrics.
 *
 * @module mega-app/agent-evolution
 */

// Export all types
export * from "./types";

// Export services
export {
  MaturityTrackerService,
  getMaturityTrackerService,
} from "./maturity-tracker.service";

export {
  SplitTriggerService,
  getSplitTriggerService,
} from "./split-trigger.service";

export {
  OrganizationManagerService,
  getOrganizationManagerService,
} from "./organization-manager.service";

export {
  ARIntegrationService,
  getARIntegrationService,
} from "./ar-integration.service";

// Re-export commonly used types for convenience
export type {
  ModuleMaturityMetrics,
  MaturityPhase,
  SplitTrigger,
  SplitStrategy,
  AgentSplitSuggestion,
  TeamConfig,
  MaturityAssessmentResult,
  SplitRecommendationResult,
} from "./types";

// Facade class for simplified usage
import { MaturityTrackerService, getMaturityTrackerService } from "./maturity-tracker.service";
import { SplitTriggerService, getSplitTriggerService } from "./split-trigger.service";
import { OrganizationManagerService, getOrganizationManagerService } from "./organization-manager.service";
import { ARIntegrationService, getARIntegrationService } from "./ar-integration.service";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import {
  MaturityPhase,
  TeamConfig,
  AgentSplitConfig,
  AgentPromotionConfig,
  AgentRetirementConfig,
  MaturityAssessmentResult,
  SplitRecommendationResult,
} from "./types";

/**
 * AgentEvolutionService
 *
 * Main facade for the agent evolution system. Coordinates between maturity tracking,
 * split triggers, organization management, and AR integration.
 */
export class AgentEvolutionService {
  private maturityTracker: MaturityTrackerService;
  private splitTrigger: SplitTriggerService;
  private orgManager: OrganizationManagerService;
  private arIntegration: ARIntegrationService;

  constructor() {
    this.maturityTracker = getMaturityTrackerService();
    this.splitTrigger = getSplitTriggerService();
    this.orgManager = getOrganizationManagerService();
    this.arIntegration = getARIntegrationService();
  }

  /**
   * Assess module maturity and recommend actions
   */
  async assessModule(
    organizationId: string,
    moduleId: string
  ): Promise<MaturityAssessmentResult> {
    logger.info("Assessing module for evolution", { organizationId, moduleId });

    // Get maturity assessment
    const assessment = await this.maturityTracker.assessModuleMaturity(
      organizationId,
      moduleId
    );

    // If phase transition recommended, notify AR
    if (assessment.phaseTransitionRecommended) {
      await this.arIntegration.notifyAROfEvolution({
        eventType: "maturity_transition",
        moduleId,
        organizationId,
        timestamp: new Date(),
        data: {
          currentPhase: assessment.currentPhase,
          recommendedPhase: assessment.recommendedPhase,
          metrics: assessment.metrics,
        },
        severity: "info",
      });
    }

    // If high severity triggers detected, notify AR
    const highSeverityTriggers = assessment.triggers.filter(
      (t) => t.severity === "high"
    );
    if (highSeverityTriggers.length > 0) {
      await this.arIntegration.notifyAROfEvolution({
        eventType: "split_triggered",
        moduleId,
        organizationId,
        timestamp: new Date(),
        data: {
          triggers: highSeverityTriggers,
          recommendedActions: assessment.recommendations,
        },
        severity: "action_required",
      });
    }

    metrics.increment("mega.evolution.module_assessed", { moduleId });

    return assessment;
  }

  /**
   * Generate split recommendations for a module
   */
  async generateSplitRecommendations(
    organizationId: string,
    moduleId: string
  ): Promise<SplitRecommendationResult[]> {
    logger.info("Generating split recommendations", { organizationId, moduleId });

    // Get split triggers
    const triggers = await this.splitTrigger.evaluateSplitTriggers(
      organizationId,
      moduleId
    );

    // Generate recommendations for each trigger
    const recommendations: SplitRecommendationResult[] = [];

    for (const trigger of triggers) {
      const recommendation = await this.splitTrigger.generateSplitRecommendation(
        organizationId,
        trigger
      );
      recommendations.push(recommendation);
    }

    metrics.increment("mega.evolution.recommendations_generated", {
      moduleId,
      count: String(recommendations.length),
    });

    return recommendations;
  }

  /**
   * Create a new team for a module
   */
  async createTeam(
    organizationId: string,
    moduleId: string,
    config: TeamConfig
  ): Promise<{ teamId: string; agentIds: string[]; registered: boolean }> {
    logger.info("Creating team with AR integration", { organizationId, moduleId });

    // Check if approval is pending
    const approvalPending = await this.arIntegration.isApprovalPending(
      organizationId,
      moduleId,
      "team_created"
    );

    if (approvalPending) {
      throw new Error("Approval for team creation is still pending");
    }

    // Create the team
    const result = await this.orgManager.createAgentTeam(
      organizationId,
      moduleId,
      config
    );

    // Register with AR
    let registered = false;
    try {
      await this.arIntegration.registerModuleWithAR(organizationId, moduleId);
      registered = true;
    } catch (err) {
      logger.warn("Failed to register team with AR", { moduleId, error: err as Error });
    }

    // Notify AR of team creation
    await this.arIntegration.notifyAROfEvolution({
      eventType: "team_created",
      moduleId,
      organizationId,
      timestamp: new Date(),
      data: {
        teamId: result.teamId,
        agentCount: result.agentIds.length,
        config,
      },
      severity: "info",
    });

    return { ...result, registered };
  }

  /**
   * Split an agent based on recommendations
   */
  async splitAgent(
    organizationId: string,
    config: AgentSplitConfig,
    requireApproval: boolean = true
  ): Promise<{ newAgentIds: string[]; transitionId: string; approvalId?: string }> {
    const agent = await this.getAgentModuleId(organizationId, config.originalAgentId);
    const moduleId = agent.moduleId;

    logger.info("Splitting agent with AR integration", {
      organizationId,
      agentId: config.originalAgentId,
      moduleId,
    });

    // Request approval if required
    let approvalId: string | undefined;
    if (requireApproval) {
      const approvalResult = await this.arIntegration.requestARApproval(organizationId, {
        id: "",
        type: "agent_split",
        moduleId,
        organizationId,
        details: {
          originalAgentId: config.originalAgentId,
          strategy: config.strategy,
          newAgentCount: config.resultingAgents.length,
        },
        status: "pending",
        requestedAt: new Date(),
        requestedBy: "evolution-service",
      });
      approvalId = approvalResult.requestId;

      // If not auto-approved, return pending state
      if (approvalResult.status === "pending") {
        return {
          newAgentIds: [],
          transitionId: "",
          approvalId,
        };
      }
    }

    // Execute split
    const result = await this.orgManager.splitAgent(organizationId, config);

    // Sync with AR
    await this.arIntegration.syncAgentAssignments(organizationId, moduleId);

    // Notify AR
    await this.arIntegration.notifyAROfEvolution({
      eventType: "split_triggered",
      moduleId,
      organizationId,
      timestamp: new Date(),
      data: {
        originalAgentId: config.originalAgentId,
        newAgentIds: result.newAgentIds,
        strategy: config.strategy,
        transitionId: result.transitionId,
      },
      severity: "info",
    });

    return { ...result, approvalId };
  }

  /**
   * Promote an agent to leadership
   */
  async promoteAgent(
    organizationId: string,
    config: AgentPromotionConfig
  ): Promise<{ success: boolean }> {
    const agent = await this.getAgentModuleId(organizationId, config.agentId);
    const moduleId = agent.moduleId;

    logger.info("Promoting agent with AR integration", {
      organizationId,
      agentId: config.agentId,
      newRole: config.newRole,
    });

    // Execute promotion
    const result = await this.orgManager.promoteAgent(organizationId, config);

    // Sync with AR
    await this.arIntegration.syncAgentAssignments(organizationId, moduleId);

    // Notify AR
    await this.arIntegration.notifyAROfEvolution({
      eventType: "agent_promoted",
      moduleId,
      organizationId,
      timestamp: new Date(),
      data: {
        agentId: config.agentId,
        newRole: config.newRole,
        subordinates: config.subordinateAgentIds,
      },
      severity: "info",
    });

    return result;
  }

  /**
   * Retire an agent gracefully
   */
  async retireAgent(
    organizationId: string,
    config: AgentRetirementConfig
  ): Promise<{ success: boolean; handoffComplete: boolean }> {
    const agent = await this.getAgentModuleId(organizationId, config.agentId);
    const moduleId = agent.moduleId;

    logger.info("Retiring agent with AR integration", {
      organizationId,
      agentId: config.agentId,
      reason: config.reason,
    });

    // Execute retirement
    const result = await this.orgManager.retireAgent(organizationId, config);

    // Sync with AR
    await this.arIntegration.syncAgentAssignments(organizationId, moduleId);

    // Notify AR
    await this.arIntegration.notifyAROfEvolution({
      eventType: "agent_retired",
      moduleId,
      organizationId,
      timestamp: new Date(),
      data: {
        agentId: config.agentId,
        reason: config.reason,
        handoffAgentId: config.taskHandoffAgentId,
      },
      severity: "info",
    });

    return result;
  }

  /**
   * Run evolution assessment for all modules in an organization
   */
  async runEvolutionCycle(organizationId: string): Promise<{
    modulesAssessed: number;
    transitionsRecommended: number;
    triggersDetected: number;
  }> {
    logger.info("Running evolution cycle", { organizationId });

    // Get all active modules
    const teams = await this.getActiveTeams(organizationId);
    const moduleIds = [...new Set(teams.map((t) => t.moduleId).filter(Boolean))] as string[];

    let transitionsRecommended = 0;
    let triggersDetected = 0;

    // Assess each module
    for (const moduleId of moduleIds) {
      try {
        const assessment = await this.assessModule(organizationId, moduleId);

        if (assessment.phaseTransitionRecommended) {
          transitionsRecommended++;
        }
        triggersDetected += assessment.triggers.length;
      } catch (err) {
        logger.warn("Failed to assess module", { moduleId, error: err as Error });
      }
    }

    metrics.increment("mega.evolution.cycle_completed", {
      modules: String(moduleIds.length),
      transitions: String(transitionsRecommended),
      triggers: String(triggersDetected),
    });

    logger.info("Evolution cycle completed", {
      modulesAssessed: moduleIds.length,
      transitionsRecommended,
      triggersDetected,
    });

    return {
      modulesAssessed: moduleIds.length,
      transitionsRecommended,
      triggersDetected,
    };
  }

  /**
   * Get maturity status for all modules
   */
  async getOrganizationMaturityStatus(organizationId: string): Promise<{
    modules: {
      moduleId: string;
      phase: MaturityPhase;
      teamSize: number;
      hasLeader: boolean;
    }[];
    summary: {
      mvp: number;
      growth: number;
      mature: number;
    };
  }> {
    const teams = await this.getActiveTeams(organizationId);
    const moduleIds = [...new Set(teams.map((t) => t.moduleId).filter(Boolean))] as string[];

    const modules: {
      moduleId: string;
      phase: MaturityPhase;
      teamSize: number;
      hasLeader: boolean;
    }[] = [];

    const summary = { mvp: 0, growth: 0, mature: 0 };

    for (const moduleId of moduleIds) {
      const team = teams.find((t) => t.moduleId === moduleId);
      const phase = await this.maturityTracker.getCurrentPhase(organizationId, moduleId);

      modules.push({
        moduleId,
        phase,
        teamSize: team?.maxAgents || 0,
        hasLeader: !!team?.leadAgentId,
      });

      summary[phase]++;
    }

    return { modules, summary };
  }

  // Private helpers

  private async getAgentModuleId(
    _organizationId: string,
    agentId: string
  ): Promise<{ moduleId: string }> {
    const agent = await import("../../../db/client").then((m) =>
      m.db.agent.findUnique({
        where: { id: agentId },
      })
    );

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const metadata = agent.metadata as Record<string, unknown>;
    const moduleId = metadata?.moduleId as string;

    if (!moduleId) {
      throw new Error(`Agent has no moduleId: ${agentId}`);
    }

    return { moduleId };
  }

  private async getActiveTeams(organizationId: string) {
    const { db } = await import("../../../db/client");
    return db.megaAppTeam.findMany({
      where: {
        organizationId,
        status: "active",
      },
    });
  }
}

// Export singleton facade
let evolutionServiceInstance: AgentEvolutionService | null = null;

export function getAgentEvolutionService(): AgentEvolutionService {
  if (!evolutionServiceInstance) {
    evolutionServiceInstance = new AgentEvolutionService();
  }
  return evolutionServiceInstance;
}
