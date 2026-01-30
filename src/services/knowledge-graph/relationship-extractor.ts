/**
 * Relationship Extractor
 * Extracts entities and relationships from organizational data
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import {
  NodeType,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionResult,
} from "./types";

export class RelationshipExtractor {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Extract all entities from organizational data
   */
  async extractEntities(): Promise<ExtractedEntity[]> {
    logger.info("Extracting entities from organizational data", {
      organizationId: this.organizationId,
    });

    const entities: ExtractedEntity[] = [];

    try {
      // Extract agents
      const agents = await this.extractAgents();
      entities.push(...agents);

      // Extract teams
      const teams = await this.extractTeams();
      entities.push(...teams);

      // Extract members (users)
      const members = await this.extractMembers();
      entities.push(...members);

      // Extract projects (if applicable)
      const projects = await this.extractProjects();
      entities.push(...projects);

      // Extract goals
      const goals = await this.extractGoals();
      entities.push(...goals);

      // Extract workflows
      const workflows = await this.extractWorkflows();
      entities.push(...workflows);

      logger.info("Entity extraction complete", {
        organizationId: this.organizationId,
        counts: this.countByType(entities),
      });

      return entities;
    } catch (error) {
      logger.error(
        "Failed to extract entities",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Extract all relationships from organizational data
   */
  async extractRelationships(): Promise<ExtractedRelationship[]> {
    logger.info("Extracting relationships from organizational data", {
      organizationId: this.organizationId,
    });

    const relationships: ExtractedRelationship[] = [];

    try {
      // Extract agent relationships
      const agentRels = await this.extractAgentRelationships();
      relationships.push(...agentRels);

      // Extract team relationships
      const teamRels = await this.extractTeamRelationships();
      relationships.push(...teamRels);

      // Extract goal relationships
      const goalRels = await this.extractGoalRelationships();
      relationships.push(...goalRels);

      // Extract workflow relationships
      const workflowRels = await this.extractWorkflowRelationships();
      relationships.push(...workflowRels);

      logger.info("Relationship extraction complete", {
        organizationId: this.organizationId,
        count: relationships.length,
      });

      return relationships;
    } catch (error) {
      logger.error(
        "Failed to extract relationships",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Extract both entities and relationships
   */
  async extract(): Promise<ExtractionResult> {
    logger.info("Extracting entities and relationships", {
      organizationId: this.organizationId,
    });

    try {
      const [entities, relationships] = await Promise.all([
        this.extractEntities(),
        this.extractRelationships(),
      ]);

      return { entities, relationships };
    } catch (error) {
      logger.error(
        "Failed to extract",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        entities: [],
        relationships: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // ============================================================================
  // Entity Extraction Methods
  // ============================================================================

  private async extractAgents(): Promise<ExtractedEntity[]> {
    try {
      const agents = await db.agent.findMany({
        where: { organizationId: this.organizationId },
        include: {
          skillAssignments: {
            include: { extension: true },
          },
        },
      });

      return agents.map((agent) => ({
        type: "agent" as NodeType,
        id: agent.id,
        label: agent.name,
        properties: {
          role: agent.role,
          type: agent.type,
          status: agent.status,
          teamId: agent.teamId,
          managerId: agent.managerId,
          skills: agent.skills,
          metadata: agent.metadata,
        },
        source: "agent" as const,
      }));
    } catch (error) {
      logger.warn("Failed to extract agents", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async extractTeams(): Promise<ExtractedEntity[]> {
    try {
      const teams = await db.team.findMany({
        where: { organizationId: this.organizationId },
      });

      return teams.map((team) => ({
        type: "team" as NodeType,
        id: team.id,
        label: team.name,
        properties: {
          type: team.type,
          leaderId: team.leaderId,
          maxMembers: team.maxMembers,
        },
        source: "team" as const,
      }));
    } catch (error) {
      logger.warn("Failed to extract teams", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async extractMembers(): Promise<ExtractedEntity[]> {
    try {
      const memberships = await db.membership.findMany({
        where: { organizationId: this.organizationId },
        include: { user: true },
      });

      return memberships.map((membership) => ({
        type: "person" as NodeType,
        id: membership.user.id,
        label: membership.user.displayName || membership.user.email,
        properties: {
          email: membership.user.email,
          role: membership.role,
          membershipId: membership.id,
        },
        source: "member" as const,
      }));
    } catch (error) {
      logger.warn("Failed to extract members", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async extractProjects(): Promise<ExtractedEntity[]> {
    try {
      const projects = await db.project.findMany({
        where: { organizationId: this.organizationId },
      });

      return projects.map((project) => ({
        type: "project" as NodeType,
        id: project.id,
        label: project.name,
        properties: {
          description: project.description,
          status: project.status,
          progress: project.progress,
          budget: project.budget,
        },
        source: "project" as const,
      }));
    } catch (error) {
      logger.debug("Projects not available", {
        organizationId: this.organizationId,
      });
      return [];
    }
  }

  private async extractGoals(): Promise<ExtractedEntity[]> {
    try {
      const goals = await db.goal.findMany({
        where: { organizationId: this.organizationId },
      });

      return goals.map((goal) => ({
        type: "goal" as NodeType,
        id: goal.id,
        label: goal.title,
        properties: {
          description: goal.description,
          status: goal.status,
          progress: goal.progress,
          dueDate: goal.dueDate,
          parentGoalId: goal.parentGoalId,
        },
        source: "goal" as const,
      }));
    } catch (error) {
      logger.debug("Goals not available", {
        organizationId: this.organizationId,
      });
      return [];
    }
  }

  private async extractWorkflows(): Promise<ExtractedEntity[]> {
    try {
      const workflows = await db.workflow.findMany({
        where: { organizationId: this.organizationId },
      });

      return workflows.map((workflow) => ({
        type: "workflow" as NodeType,
        id: workflow.id,
        label: workflow.name,
        properties: {
          description: workflow.description,
          enabled: workflow.enabled,
          sopEnabled: workflow.sopEnabled,
          config: workflow.config,
        },
        source: "workflow" as const,
      }));
    } catch (error) {
      logger.debug("Workflows not available", {
        organizationId: this.organizationId,
      });
      return [];
    }
  }

  // ============================================================================
  // Relationship Extraction Methods
  // ============================================================================

  private async extractAgentRelationships(): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    try {
      // Agent -> Team (member_of)
      const agents = await db.agent.findMany({
        where: {
          organizationId: this.organizationId,
          teamId: { not: null },
        },
      });

      for (const agent of agents) {
        if (agent.teamId) {
          relationships.push({
            sourceId: agent.id,
            sourceType: "agent",
            targetId: agent.teamId,
            targetType: "team",
            relationshipType: "member_of",
            weight: 1.0,
          });
        }

        // Agent -> Manager (reports to)
        if (agent.managerId) {
          relationships.push({
            sourceId: agent.id,
            sourceType: "agent",
            targetId: agent.managerId,
            targetType: "agent",
            relationshipType: "child_of",
            weight: 1.0,
          });
        }
      }

      // Extract delegation patterns from orchestrator executions
      const executions = await db.orchestratorExecution.findMany({
        where: { organizationId: this.organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          skills: true,
          metadata: true,
        },
      });

      // Infer agent collaboration from shared skills in executions
      const skillUsage = new Map<string, Set<string>>();
      for (const exec of executions) {
        for (const skill of exec.skills) {
          if (!skillUsage.has(skill)) {
            skillUsage.set(skill, new Set());
          }
          skillUsage.get(skill)!.add(exec.id);
        }
      }

      // Add skill-based relationships between agents
      const agentsBySkill = new Map<string, string[]>();
      for (const agent of agents) {
        for (const skill of agent.skills) {
          if (!agentsBySkill.has(skill)) {
            agentsBySkill.set(skill, []);
          }
          agentsBySkill.get(skill)!.push(agent.id);
        }
      }

      // Agents sharing skills collaborate
      for (const [_skill, agentIds] of agentsBySkill) {
        for (let i = 0; i < agentIds.length; i++) {
          for (let j = i + 1; j < agentIds.length; j++) {
            relationships.push({
              sourceId: agentIds[i],
              sourceType: "agent",
              targetId: agentIds[j],
              targetType: "agent",
              relationshipType: "collaborates_with",
              weight: 0.6,
            });
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to extract agent relationships", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return relationships;
  }

  private async extractTeamRelationships(): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    try {
      const teams = await db.team.findMany({
        where: { organizationId: this.organizationId },
        include: {
          agents: true,
        },
      });

      for (const team of teams) {
        // Agent members
        for (const agent of team.agents) {
          relationships.push({
            sourceId: agent.id,
            sourceType: "agent",
            targetId: team.id,
            targetType: "team",
            relationshipType: "member_of",
            weight: 1.0,
          });
        }

        // Team leader manages team
        if (team.leaderId) {
          relationships.push({
            sourceId: team.leaderId,
            sourceType: "agent",
            targetId: team.id,
            targetType: "team",
            relationshipType: "manages",
            weight: 1.0,
          });
        }
      }
    } catch (error) {
      logger.warn("Failed to extract team relationships", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return relationships;
  }

  private async extractGoalRelationships(): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    try {
      const goals = await db.goal.findMany({
        where: { organizationId: this.organizationId },
      });

      for (const goal of goals) {
        // Parent-child goal relationships
        if (goal.parentGoalId) {
          relationships.push({
            sourceId: goal.id,
            sourceType: "goal",
            targetId: goal.parentGoalId,
            targetType: "goal",
            relationshipType: "child_of",
            weight: 1.0,
          });
        }

        // Goal assigned to owner position
        if (goal.ownerPositionId) {
          relationships.push({
            sourceId: goal.id,
            sourceType: "goal",
            targetId: goal.ownerPositionId,
            targetType: "agent",
            relationshipType: "assigned_to",
            weight: 1.0,
          });
        }
      }
    } catch (error) {
      logger.warn("Failed to extract goal relationships", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return relationships;
  }

  private async extractWorkflowRelationships(): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    try {
      const workflows = await db.workflow.findMany({
        where: { organizationId: this.organizationId },
      });

      for (const workflow of workflows) {
        // Extract agent dependencies from SOP steps if available
        const sopSteps = workflow.sopSteps as Array<{ agentId?: string; order?: number }> | null;
        if (sopSteps && Array.isArray(sopSteps)) {
          for (const step of sopSteps) {
            if (step.agentId) {
              relationships.push({
                sourceId: workflow.id,
                sourceType: "workflow",
                targetId: step.agentId,
                targetType: "agent",
                relationshipType: "depends_on",
                weight: 0.9,
                metadata: { stepOrder: step.order },
              });
            }
          }
        }

        // Extract from config if it contains agent references
        const config = workflow.config as Record<string, unknown> | null;
        if (config && config.agents && Array.isArray(config.agents)) {
          for (const agentId of config.agents as string[]) {
            relationships.push({
              sourceId: workflow.id,
              sourceType: "workflow",
              targetId: agentId,
              targetType: "agent",
              relationshipType: "depends_on",
              weight: 0.8,
            });
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to extract workflow relationships", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return relationships;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private countByType(entities: ExtractedEntity[]): Record<string, number> {
    return entities.reduce(
      (acc, entity) => {
        acc[entity.type] = (acc[entity.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}

/**
 * Factory function to create a RelationshipExtractor
 */
export function createRelationshipExtractor(
  organizationId: string
): RelationshipExtractor {
  return new RelationshipExtractor(organizationId);
}
