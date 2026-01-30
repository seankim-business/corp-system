/**
 * Organization Manager Service
 *
 * Manages agent organization changes including team creation, agent splits,
 * promotions, and retirements for the Mega App system.
 */

import { db as prisma } from "../../../db/client";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import { auditLogger } from "../../audit-logger";
import {
  TeamConfig,
  AgentSplitConfig,
  AgentPromotionConfig,
  AgentRetirementConfig,
  OrgChangeRecord,
} from "./types";

// Cache configuration
const CACHE_PREFIX = "mega:org:";
const CACHE_TTL = 300; // 5 minutes

/**
 * OrganizationManagerService
 *
 * Handles all agent organization changes for MegaApp modules.
 */
export class OrganizationManagerService {
  /**
   * Create a new agent team for a module
   */
  async createAgentTeam(
    organizationId: string,
    moduleId: string,
    teamConfig: TeamConfig
  ): Promise<{ teamId: string; agentIds: string[] }> {
    const startTime = Date.now();
    logger.info("Creating agent team", { organizationId, moduleId, teamName: teamConfig.name });

    try {
      // Create team in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the team
        const team = await tx.megaAppTeam.create({
          data: {
            organizationId,
            name: teamConfig.name,
            description: teamConfig.description,
            moduleId,
            parentTeamId: teamConfig.parentTeamId,
            maxAgents: teamConfig.maxAgents,
            scalingPolicy: teamConfig.scalingPolicy,
            status: "active",
          },
        });

        const agentIds: string[] = [];

        // Create agents for the team
        for (const agentConfig of teamConfig.agents) {
          let agentId = agentConfig.agentId;

          // Create new agent if no ID provided
          if (!agentId) {
            const agent = await tx.agent.create({
              data: {
                organizationId,
                name: agentConfig.name,
                type: "value-stream",
                role: agentConfig.specialization || "worker",
                status: "active",
                skills: agentConfig.capabilities,
                preferredModel: this.modelTierToModel(agentConfig.modelTier),
                metadata: {
                  moduleId,
                  teamId: team.id,
                  agentRole: agentConfig.role,
                  specialization: agentConfig.specialization,
                  taskTypes: agentConfig.taskTypes,
                  modelTier: agentConfig.modelTier,
                },
              },
            });
            agentId = agent.id;
          }

          agentIds.push(agentId);

          // Set lead agent if applicable
          if (agentConfig.role === "lead") {
            await tx.megaAppTeam.update({
              where: { id: team.id },
              data: { leadAgentId: agentId },
            });
          }
        }

        return { teamId: team.id, agentIds };
      });

      // Create org change record
      await this.createOrgChangeRecord({
        type: "team_created",
        moduleId,
        organizationId,
        details: {
          teamId: result.teamId,
          teamName: teamConfig.name,
          agentCount: result.agentIds.length,
          agentIds: result.agentIds,
        },
        status: "completed",
        requestedBy: "system",
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "mega_app_team",
        resourceId: result.teamId,
        details: {
          action: "team_created",
          moduleId,
          agentCount: result.agentIds.length,
        },
        success: true,
      });

      // Invalidate cache
      await this.invalidateModuleCache(organizationId, moduleId);

      metrics.timing("mega.org.create_team", Date.now() - startTime);
      metrics.increment("mega.org.team_created", { moduleId });

      logger.info("Agent team created", {
        teamId: result.teamId,
        agentCount: result.agentIds.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to create agent team", { moduleId }, error as Error);
      metrics.increment("mega.org.create_team.error");
      throw error;
    }
  }

  /**
   * Split an agent into multiple specialized agents
   */
  async splitAgent(
    organizationId: string,
    config: AgentSplitConfig
  ): Promise<{ newAgentIds: string[]; transitionId: string }> {
    const startTime = Date.now();
    logger.info("Splitting agent", {
      organizationId,
      originalAgentId: config.originalAgentId,
      strategy: config.strategy,
    });

    try {
      // Get original agent
      const originalAgent = await prisma.agent.findUnique({
        where: { id: config.originalAgentId },
        include: {
          arAssignments: { where: { status: "active" } },
        },
      });

      if (!originalAgent) {
        throw new Error(`Agent not found: ${config.originalAgentId}`);
      }

      const moduleId = (originalAgent.metadata as Record<string, unknown>)?.moduleId as string;

      // Create new agents in transaction
      const result = await prisma.$transaction(async (tx) => {
        const newAgentIds: string[] = [];

        // Create new specialized agents
        for (const agentSpec of config.resultingAgents) {
          const newAgent = await tx.agent.create({
            data: {
              organizationId,
              name: agentSpec.name,
              type: "value-stream",
              role: agentSpec.specialization || "worker",
              status: "active",
              skills: agentSpec.capabilities,
              preferredModel: this.modelTierToModel(agentSpec.modelTier),
              metadata: {
                moduleId,
                agentRole: agentSpec.role,
                specialization: agentSpec.specialization,
                taskTypes: agentSpec.taskTypes,
                splitFromAgentId: config.originalAgentId,
                splitStrategy: config.strategy,
                modelTier: agentSpec.modelTier,
              },
            },
          });
          newAgentIds.push(newAgent.id);
        }

        // Create transition record
        const transitionRecord = await tx.valueStreamArtifact.create({
          data: {
            organizationId,
            moduleId: moduleId || "unknown",
            status: "processing",
            version: 1,
            data: JSON.parse(JSON.stringify({
              originalAgentId: config.originalAgentId,
              newAgentIds,
              strategy: config.strategy,
              taskMigration: config.taskMigration,
              transitionPeriodDays: config.transitionPeriodDays,
              startedAt: new Date().toISOString(),
              expectedEndAt: new Date(
                Date.now() + config.transitionPeriodDays * 24 * 60 * 60 * 1000
              ).toISOString(),
              type: "split_transition",
              status: "in_progress",
            })),
            tags: ["agent_split_transition"],
          },
        });

        // Update original agent status
        await tx.agent.update({
          where: { id: config.originalAgentId },
          data: {
            status: "transitioning",
            metadata: {
              ...(originalAgent.metadata as Record<string, unknown>),
              splitInProgress: true,
              replacedByAgents: newAgentIds,
            },
          },
        });

        return { newAgentIds, transitionId: transitionRecord.id };
      });

      // Create org change record
      await this.createOrgChangeRecord({
        type: "agent_split",
        moduleId: moduleId || "unknown",
        organizationId,
        details: {
          originalAgentId: config.originalAgentId,
          newAgentIds: result.newAgentIds,
          strategy: config.strategy,
          transitionId: result.transitionId,
        },
        status: "completed",
        requestedBy: "system",
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "agent",
        resourceId: config.originalAgentId,
        details: {
          action: "agent_split",
          strategy: config.strategy,
          newAgentCount: result.newAgentIds.length,
        },
        success: true,
      });

      // Invalidate cache
      if (moduleId) {
        await this.invalidateModuleCache(organizationId, moduleId);
      }

      metrics.timing("mega.org.split_agent", Date.now() - startTime);
      metrics.increment("mega.org.agent_split", { strategy: config.strategy });

      logger.info("Agent split completed", {
        originalAgentId: config.originalAgentId,
        newAgentCount: result.newAgentIds.length,
        transitionId: result.transitionId,
      });

      return result;
    } catch (error) {
      logger.error(
        "Failed to split agent",
        { agentId: config.originalAgentId },
        error as Error
      );
      metrics.increment("mega.org.split_agent.error");
      throw error;
    }
  }

  /**
   * Promote an agent to a leadership role
   */
  async promoteAgent(
    organizationId: string,
    config: AgentPromotionConfig
  ): Promise<{ success: boolean; positionId?: string }> {
    const startTime = Date.now();
    logger.info("Promoting agent", {
      organizationId,
      agentId: config.agentId,
      newRole: config.newRole,
    });

    try {
      // Get agent
      const agent = await prisma.agent.findUnique({
        where: { id: config.agentId },
        include: {
          arAssignments: { where: { status: "active" } },
        },
      });

      if (!agent) {
        throw new Error(`Agent not found: ${config.agentId}`);
      }

      const moduleId = (agent.metadata as Record<string, unknown>)?.moduleId as string;

      // Update agent in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update agent role and capabilities
        await tx.agent.update({
          where: { id: config.agentId },
          data: {
            skills: [...(agent.skills || []), ...config.newResponsibilities],
            metadata: {
              ...(agent.metadata as Record<string, unknown>),
              role: config.newRole,
              promotedAt: config.effectiveDate.toISOString(),
              subordinates: config.subordinateAgentIds,
            },
          },
        });

        // If promoting to team lead, update team
        if (config.newRole === "lead" && moduleId) {
          const team = await tx.megaAppTeam.findFirst({
            where: { organizationId, moduleId, status: "active" },
          });

          if (team) {
            await tx.megaAppTeam.update({
              where: { id: team.id },
              data: { leadAgentId: config.agentId },
            });
          }
        }

        return { success: true };
      });

      // Create org change record
      await this.createOrgChangeRecord({
        type: "agent_promoted",
        moduleId: moduleId || "unknown",
        organizationId,
        details: {
          agentId: config.agentId,
          newRole: config.newRole,
          responsibilities: config.newResponsibilities,
          subordinates: config.subordinateAgentIds,
          effectiveDate: config.effectiveDate,
        },
        status: "completed",
        requestedBy: "system",
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "agent",
        resourceId: config.agentId,
        details: {
          action: "agent_promoted",
          newRole: config.newRole,
        },
        success: true,
      });

      // Invalidate cache
      if (moduleId) {
        await this.invalidateModuleCache(organizationId, moduleId);
      }

      metrics.timing("mega.org.promote_agent", Date.now() - startTime);
      metrics.increment("mega.org.agent_promoted", { role: config.newRole });

      logger.info("Agent promoted", {
        agentId: config.agentId,
        newRole: config.newRole,
      });

      return result;
    } catch (error) {
      logger.error("Failed to promote agent", { agentId: config.agentId }, error as Error);
      metrics.increment("mega.org.promote_agent.error");
      throw error;
    }
  }

  /**
   * Gracefully retire an agent
   */
  async retireAgent(
    organizationId: string,
    config: AgentRetirementConfig
  ): Promise<{ success: boolean; handoffComplete: boolean }> {
    const startTime = Date.now();
    logger.info("Retiring agent", {
      organizationId,
      agentId: config.agentId,
      reason: config.reason,
    });

    try {
      // Get agent
      const agent = await prisma.agent.findUnique({
        where: { id: config.agentId },
        include: {
          arAssignments: { where: { status: "active" } },
        },
      });

      if (!agent) {
        throw new Error(`Agent not found: ${config.agentId}`);
      }

      const moduleId = (agent.metadata as Record<string, unknown>)?.moduleId as string;

      // Verify handoff agent exists
      const handoffAgent = await prisma.agent.findUnique({
        where: { id: config.taskHandoffAgentId },
      });

      if (!handoffAgent) {
        throw new Error(`Handoff agent not found: ${config.taskHandoffAgentId}`);
      }

      // Update agent in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create retirement transition record
        await tx.valueStreamArtifact.create({
          data: {
            organizationId,
            moduleId: moduleId || "unknown",
            status: "processing",
            version: 1,
            data: JSON.parse(JSON.stringify({
              retiringAgentId: config.agentId,
              handoffAgentId: config.taskHandoffAgentId,
              reason: config.reason,
              gracePeriodDays: config.gracePeriodDays,
              retainKnowledge: config.retainKnowledge,
              startedAt: new Date().toISOString(),
              expectedEndAt: new Date(
                Date.now() + config.gracePeriodDays * 24 * 60 * 60 * 1000
              ).toISOString(),
              type: "retirement_transition",
              status: "in_progress",
            })),
            tags: ["agent_retirement_transition"],
          },
        });

        // Update retiring agent status
        await tx.agent.update({
          where: { id: config.agentId },
          data: {
            status: "retiring",
            metadata: {
              ...(agent.metadata as Record<string, unknown>),
              retirementReason: config.reason,
              handoffAgentId: config.taskHandoffAgentId,
              retirementStartedAt: new Date().toISOString(),
            },
          },
        });

        // Transfer any active assignments
        for (const assignment of agent.arAssignments) {
          // End current assignment
          await tx.agentAssignment.update({
            where: { id: assignment.id },
            data: {
              status: "terminated",
              endDate: new Date(),
              metadata: {
                ...(assignment.metadata as Record<string, unknown>),
                terminationReason: "agent_retirement",
                handedOffTo: config.taskHandoffAgentId,
              },
            },
          });
        }

        // If this was a team lead, update team
        if (moduleId) {
          const team = await tx.megaAppTeam.findFirst({
            where: {
              organizationId,
              moduleId,
              leadAgentId: config.agentId,
            },
          });

          if (team) {
            await tx.megaAppTeam.update({
              where: { id: team.id },
              data: { leadAgentId: config.taskHandoffAgentId },
            });
          }
        }

        return { success: true, handoffComplete: true };
      });

      // Create org change record
      await this.createOrgChangeRecord({
        type: "agent_retired",
        moduleId: moduleId || "unknown",
        organizationId,
        details: {
          agentId: config.agentId,
          reason: config.reason,
          handoffAgentId: config.taskHandoffAgentId,
          gracePeriodDays: config.gracePeriodDays,
        },
        status: "completed",
        requestedBy: "system",
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "agent",
        resourceId: config.agentId,
        details: {
          action: "agent_retired",
          reason: config.reason,
          handoffAgent: config.taskHandoffAgentId,
        },
        success: true,
      });

      // Invalidate cache
      if (moduleId) {
        await this.invalidateModuleCache(organizationId, moduleId);
      }

      metrics.timing("mega.org.retire_agent", Date.now() - startTime);
      metrics.increment("mega.org.agent_retired", { reason: config.reason });

      logger.info("Agent retirement initiated", {
        agentId: config.agentId,
        handoffAgentId: config.taskHandoffAgentId,
      });

      return result;
    } catch (error) {
      logger.error("Failed to retire agent", { agentId: config.agentId }, error as Error);
      metrics.increment("mega.org.retire_agent.error");
      throw error;
    }
  }

  /**
   * Get team structure for a module
   */
  async getTeamStructure(
    organizationId: string,
    moduleId: string
  ): Promise<{
    team: any;
    agents: any[];
    childTeams: any[];
  } | null> {
    const cacheKey = `${CACHE_PREFIX}structure:${organizationId}:${moduleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const team = await prisma.megaAppTeam.findFirst({
      where: { organizationId, moduleId, status: "active" },
      include: {
        childTeams: {
          where: { status: "active" },
        },
      },
    });

    if (!team) {
      return null;
    }

    // Get agents in team
    const agents = await prisma.agent.findMany({
      where: {
        organizationId,
        status: { in: ["active", "transitioning"] },
        metadata: {
          path: ["moduleId"],
          equals: moduleId,
        },
      },
    });

    const result = {
      team,
      agents,
      childTeams: team.childTeams,
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Get organization change history
   */
  async getChangeHistory(
    organizationId: string,
    moduleId?: string,
    limit: number = 20
  ): Promise<OrgChangeRecord[]> {
    const artifacts = await prisma.valueStreamArtifact.findMany({
      where: {
        organizationId,
        // artifactType is stored in data JSON field, not as a direct column
        ...(moduleId && { moduleId }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return artifacts.map((a) => ({
      id: a.id,
      ...(a.data as unknown as Omit<OrgChangeRecord, "id">),
    }));
  }

  // Helper methods

  /**
   * Create organization change record
   */
  private async createOrgChangeRecord(
    record: Omit<OrgChangeRecord, "id" | "requestedAt">
  ): Promise<string> {
    const artifact = await prisma.valueStreamArtifact.create({
      data: {
        organizationId: record.organizationId,
        moduleId: record.moduleId,
        status: "completed",
        version: 1,
        data: JSON.parse(JSON.stringify({
          ...record,
          requestedAt: new Date().toISOString(),
        })),
        tags: ["org_change_record", record.type],
      },
    });

    return artifact.id;
  }

  /**
   * Convert model tier to actual model name
   */
  private modelTierToModel(tier: "haiku" | "sonnet" | "opus"): string {
    const modelMap: Record<string, string> = {
      haiku: "claude-3-5-haiku-20241022",
      sonnet: "claude-sonnet-4-20250514",
      opus: "claude-opus-4-5-20251101",
    };
    return modelMap[tier] || modelMap.sonnet;
  }

  /**
   * Invalidate module cache
   */
  private async invalidateModuleCache(
    organizationId: string,
    moduleId: string
  ): Promise<void> {
    // Redis keys() is not available in our interface - comment out for now
    // TODO: Implement with scanIterator if needed
    // const pattern = `${CACHE_PREFIX}*:${organizationId}:${moduleId}`;
    // const keys = await redis.keys(pattern);
    // if (keys.length > 0) {
    //   await redis.del(...keys);
    // }
    await redis.del(`${CACHE_PREFIX}:${organizationId}:${moduleId}`);
  }

  /**
   * Complete a split transition
   */
  async completeSplitTransition(
    organizationId: string,
    transitionId: string
  ): Promise<{ success: boolean }> {
    logger.info("Completing split transition", { organizationId, transitionId });

    const transition = await prisma.valueStreamArtifact.findUnique({
      where: { id: transitionId },
    });

    if (!transition) {
      throw new Error(`Transition not found: ${transitionId}`);
    }

    const content = transition.data as Record<string, unknown>;
    const originalAgentId = content.originalAgentId as string;

    await prisma.$transaction(async (tx) => {
      // Update transition record
      await tx.valueStreamArtifact.update({
        where: { id: transitionId },
        data: {
          status: "completed",
          data: {
            ...content,
            completedAt: new Date().toISOString(),
          },
        },
      });

      // Archive original agent
      await tx.agent.update({
        where: { id: originalAgentId },
        data: {
          status: "archived",
          metadata: {
            archivedAt: new Date().toISOString(),
            archivedReason: "split_completed",
          },
        },
      });
    });

    logger.info("Split transition completed", { transitionId, originalAgentId });

    return { success: true };
  }

  /**
   * Complete a retirement transition
   */
  async completeRetirementTransition(
    organizationId: string,
    agentId: string
  ): Promise<{ success: boolean }> {
    logger.info("Completing retirement transition", { organizationId, agentId });

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        status: "archived",
        metadata: {
          archivedAt: new Date().toISOString(),
          archivedReason: "retirement_completed",
        },
      },
    });

    logger.info("Retirement transition completed", { agentId });

    return { success: true };
  }
}

// Export singleton instance
let instance: OrganizationManagerService | null = null;

export function getOrganizationManagerService(): OrganizationManagerService {
  if (!instance) {
    instance = new OrganizationManagerService();
  }
  return instance;
}
