/**
 * AR Integration Service
 *
 * Connects the MegaApp agent evolution system with the AR (Agent Resource) system.
 * Handles registration, synchronization, and approval workflows.
 */

import { db as prisma } from "../../../db/client";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import { auditLogger } from "../../audit-logger";
import { arApprovalService } from "../../../ar/approval/ar-approval.service";
import { arAssignmentService } from "../../../ar/organization/ar-assignment.service";
import { arDepartmentService } from "../../../ar/organization/ar-department.service";
import { arPositionService } from "../../../ar/organization/ar-position.service";
import {
  ARModuleRegistration,
  ARApprovalRequest,
  AREvolutionEvent,
  AgentAssignmentSync,
  OrgChangeRecord,
} from "./types";

// Cache configuration
const CACHE_PREFIX = "mega:ar:";
const CACHE_TTL = 300; // 5 minutes

/**
 * ARIntegrationService
 *
 * Bridges MegaApp agent organization with the AR system for proper
 * human oversight, approvals, and organizational structure.
 */
export class ARIntegrationService {
  /**
   * Register a module's agents with the AR department structure
   */
  async registerModuleWithAR(
    organizationId: string,
    moduleId: string
  ): Promise<ARModuleRegistration> {
    const startTime = Date.now();
    logger.info("Registering module with AR", { organizationId, moduleId });

    try {
      // Get or create AR department for this module
      let department = await prisma.agentDepartment.findFirst({
        where: {
          organizationId,
          name: { contains: moduleId },
          status: "active",
        },
      });

      if (!department) {
        // Create a new department for this module
        department = await arDepartmentService.create(organizationId, {
          name: `MegaApp - ${moduleId}`,
          description: `Agent department for MegaApp module: ${moduleId}`,
          status: "active",
          metadata: {
            megaAppModule: moduleId,
            autoCreated: true,
            createdAt: new Date().toISOString(),
          },
        });

        logger.info("Created AR department for module", {
          departmentId: department.id,
          moduleId,
        });
      }

      // Get module team and agents
      const team = await prisma.megaAppTeam.findFirst({
        where: { organizationId, moduleId, status: "active" },
      });

      const agents = await prisma.agent.findMany({
        where: {
          organizationId,
          status: "active",
          metadata: {
            path: ["moduleId"],
            equals: moduleId,
          },
        },
      });

      // Create positions and assignments for agents
      const positionIds: string[] = [];
      const assignmentIds: string[] = [];

      for (const agent of agents) {
        const agentMetadata = agent.metadata as Record<string, unknown>;
        const role = (agentMetadata?.role as string) || "worker";

        // Create or get position
        let position = await prisma.agentPosition.findFirst({
          where: {
            departmentId: department.id,
            title: { contains: agent.name },
          },
        });

        if (!position) {
          position = await arPositionService.create(organizationId, {
            departmentId: department.id,
            title: agent.name,
            description: `Position for ${agent.name} in ${moduleId} module`,
            level: this.roleToLevel(role),
            metadata: {
              megaAppModule: moduleId,
              megaAppTeamId: team?.id,
              agentRole: role,
            },
          });

          logger.info("Created AR position for agent", {
            positionId: position?.id,
            agentName: agent.name,
          });
        }

        if (position) {
          positionIds.push(position.id);
        }

        // Create assignment if not exists
        const existingAssignment = position ? await prisma.agentAssignment.findFirst({
          where: {
            agentId: agent.id,
            positionId: position.id,
            status: "active",
          },
        }) : null;

        if (!existingAssignment && position) {
          const assignment = await arAssignmentService.create({
            organizationId,
            agentId: agent.id,
            positionId: position.id,
            assignmentType: "permanent",
            status: "active",
            metadata: {
              megaAppModule: moduleId,
              autoAssigned: true,
            },
          });

          assignmentIds.push(assignment.id);

          logger.info("Created AR assignment for agent", {
            assignmentId: assignment.id,
            agentId: agent.id,
          });
        } else if (existingAssignment) {
          assignmentIds.push(existingAssignment.id);
        }
      }

      // Store registration record
      const registration: ARModuleRegistration = {
        moduleId,
        organizationId,
        departmentId: department.id,
        positionIds,
        assignmentIds,
        registeredAt: new Date(),
      };

      await this.storeRegistration(registration);

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "mega_app_module",
        resourceId: moduleId,
        details: {
          action: "ar_registration",
          departmentId: department.id,
          positionCount: positionIds.length,
          assignmentCount: assignmentIds.length,
        },
        success: true,
      });

      metrics.timing("mega.ar.register_module", Date.now() - startTime);
      metrics.increment("mega.ar.module_registered", { moduleId });

      logger.info("Module registered with AR", {
        moduleId,
        departmentId: department.id,
        agentCount: agents.length,
      });

      return registration;
    } catch (error) {
      logger.error("Failed to register module with AR", { moduleId }, error as Error);
      metrics.increment("mega.ar.register_module.error");
      throw error;
    }
  }

  /**
   * Synchronize agent assignments between MegaApp and AR
   */
  async syncAgentAssignments(
    organizationId: string,
    moduleId: string
  ): Promise<AgentAssignmentSync> {
    const startTime = Date.now();
    logger.info("Syncing agent assignments", { organizationId, moduleId });

    try {
      // Get module team
      const team = await prisma.megaAppTeam.findFirst({
        where: { organizationId, moduleId, status: "active" },
      });

      if (!team) {
        throw new Error(`No team found for module: ${moduleId}`);
      }

      // Get all agents in module
      const agents = await prisma.agent.findMany({
        where: {
          organizationId,
          status: { in: ["active", "transitioning"] },
          metadata: {
            path: ["moduleId"],
            equals: moduleId,
          },
        },
        include: {
          arAssignments: {
            where: { status: "active" },
          },
        },
      });

      // Get AR department
      const department = await prisma.agentDepartment.findFirst({
        where: {
          organizationId,
          metadata: {
            path: ["megaAppModule"],
            equals: moduleId,
          },
        },
      });

      const agentAssignments: AgentAssignmentSync["agentAssignments"] = [];

      for (const agent of agents) {
        const activeAssignment = agent.arAssignments[0];

        if (activeAssignment) {
          // Assignment exists - check for sync issues
          const position = await prisma.agentPosition.findUnique({
            where: { id: activeAssignment.positionId },
          });

          agentAssignments.push({
            agentId: agent.id,
            positionId: activeAssignment.positionId,
            assignmentId: activeAssignment.id,
            status: position ? "synced" : "error",
          });
        } else {
          // No assignment - needs sync
          agentAssignments.push({
            agentId: agent.id,
            status: "pending",
          });

          // Auto-create assignment if department exists
          if (department) {
            try {
              await this.createMissingAssignment(organizationId, agent, department.id, moduleId);
              agentAssignments[agentAssignments.length - 1].status = "synced";
            } catch (err) {
              logger.warn("Failed to create missing assignment", { agentId: agent.id, error: err as Error });
              agentAssignments[agentAssignments.length - 1].status = "error";
            }
          }
        }
      }

      const result: AgentAssignmentSync = {
        moduleId,
        megaAppTeamId: team.id,
        arDepartmentId: department?.id,
        agentAssignments,
        lastSynced: new Date(),
      };

      // Cache sync result
      const cacheKey = `${CACHE_PREFIX}sync:${organizationId}:${moduleId}`;
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

      metrics.timing("mega.ar.sync_assignments", Date.now() - startTime);
      metrics.increment("mega.ar.assignments_synced", {
        moduleId,
        synced: String(agentAssignments.filter((a) => a.status === "synced").length),
      });

      logger.info("Agent assignments synced", {
        moduleId,
        total: agentAssignments.length,
        synced: agentAssignments.filter((a) => a.status === "synced").length,
        pending: agentAssignments.filter((a) => a.status === "pending").length,
        errors: agentAssignments.filter((a) => a.status === "error").length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to sync agent assignments", { moduleId }, error as Error);
      metrics.increment("mega.ar.sync_assignments.error");
      throw error;
    }
  }

  /**
   * Request AR Director approval for organization changes
   */
  async requestARApproval(
    organizationId: string,
    change: OrgChangeRecord
  ): Promise<{ requestId: string; status: string }> {
    logger.info("Requesting AR approval", {
      organizationId,
      changeType: change.type,
      moduleId: change.moduleId,
    });

    try {
      // Map change type to approval request
      const approvalRequest: ARApprovalRequest = {
        changeType: change.type,
        moduleId: change.moduleId,
        organizationId,
        description: this.generateApprovalDescription(change),
        impactScope: this.determineImpactScope(change),
        estimatedCost: this.estimateChangeCost(change),
        requestContext: change.details,
      };

      // Create AR approval request
      const request = await arApprovalService.createRequest({
        organizationId,
        requestType: "assignment",
        level: this.determineApprovalLevel(change),
        title: `MegaApp Org Change: ${change.type}`,
        description: approvalRequest.description,
        context: {
          megaAppChange: true,
          changeType: change.type,
          moduleId: change.moduleId,
          ...change.details,
        },
        impactScope: approvalRequest.impactScope === "organization" ? "org" : approvalRequest.impactScope,
        estimatedValue: approvalRequest.estimatedCost,
        requesterType: "agent",
        requesterId: "mega-app-evolution-service",
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        resourceType: "ar_approval_request",
        resourceId: request.id,
        details: {
          action: "mega_app_change_approval",
          changeType: change.type,
          moduleId: change.moduleId,
        },
        success: true,
      });

      metrics.increment("mega.ar.approval_requested", { changeType: change.type });

      logger.info("AR approval requested", {
        requestId: request.id,
        changeType: change.type,
        status: request.status,
      });

      return {
        requestId: request.id,
        status: request.status,
      };
    } catch (error) {
      logger.error("Failed to request AR approval", { change }, error as Error);
      metrics.increment("mega.ar.approval_request.error");
      throw error;
    }
  }

  /**
   * Notify AR system of evolution events
   */
  async notifyAROfEvolution(event: AREvolutionEvent): Promise<void> {
    logger.info("Notifying AR of evolution event", {
      eventType: event.eventType,
      moduleId: event.moduleId,
    });

    try {
      // Create AR department log entry
      await prisma.aRDepartmentLog.create({
        data: {
          organizationId: event.organizationId,
          action: `mega_app_${event.eventType}`,
          category: "coordination",
          details: {
            eventType: event.eventType,
            moduleId: event.moduleId,
            timestamp: event.timestamp.toISOString(),
            severity: event.severity,
            ...event.data,
          },
          impact: event.severity === "action_required" ? "high" : "medium",
        },
      });

      // Emit event to value stream queue if action required
      if (event.severity === "action_required") {
        await this.emitToValueStreamQueue(event);
      }

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId: event.organizationId,
        resourceType: "ar_evolution_event",
        resourceId: event.moduleId,
        details: {
          eventType: event.eventType,
          severity: event.severity,
        },
        success: true,
      });

      metrics.increment("mega.ar.evolution_notified", {
        eventType: event.eventType,
        severity: event.severity,
      });

      logger.info("AR notified of evolution event", {
        eventType: event.eventType,
        moduleId: event.moduleId,
      });
    } catch (error) {
      logger.error("Failed to notify AR of evolution", { event }, error as Error);
      metrics.increment("mega.ar.evolution_notify.error");
      // Don't throw - notification failure shouldn't block evolution
    }
  }

  /**
   * Get AR registration status for a module
   */
  async getRegistrationStatus(
    organizationId: string,
    moduleId: string
  ): Promise<ARModuleRegistration | null> {
    const cacheKey = `${CACHE_PREFIX}registration:${organizationId}:${moduleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ARModuleRegistration;
    }

    // Check for registration artifact
    const artifact = await prisma.valueStreamArtifact.findFirst({
      where: {
        organizationId,
        moduleId,
        tags: { has: "ar_module_registration" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!artifact) {
      return null;
    }

    const registration = artifact.data as unknown as ARModuleRegistration;

    // Cache for future requests
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(registration));

    return registration;
  }

  /**
   * Check if approval is pending for a change
   */
  async isApprovalPending(
    organizationId: string,
    moduleId: string,
    changeType: OrgChangeRecord["type"]
  ): Promise<boolean> {
    const pendingRequests = await arApprovalService.findAll(organizationId, {
      status: "pending",
      requestType: "assignment",
    });

    return pendingRequests.some((r) => {
      const context = r.context as Record<string, unknown>;
      return (
        context.megaAppChange === true &&
        context.moduleId === moduleId &&
        context.changeType === changeType
      );
    });
  }

  // Private helper methods

  /**
   * Store registration record
   */
  private async storeRegistration(registration: ARModuleRegistration): Promise<void> {
    // Find existing registration
    const existing = await prisma.valueStreamArtifact.findFirst({
      where: {
        organizationId: registration.organizationId,
        moduleId: registration.moduleId,
        tags: { has: "ar_module_registration" },
      },
    });

    if (existing) {
      await prisma.valueStreamArtifact.update({
        where: { id: existing.id },
        data: {
          data: JSON.parse(JSON.stringify(registration)),
          version: { increment: 1 },
        },
      });
    } else {
      await prisma.valueStreamArtifact.create({
        data: {
          organizationId: registration.organizationId,
          moduleId: registration.moduleId,
          status: "completed",
          version: 1,
          data: JSON.parse(JSON.stringify(registration)),
          tags: ["ar_module_registration"],
        },
      });
    }

    // Update cache
    const cacheKey = `${CACHE_PREFIX}registration:${registration.organizationId}:${registration.moduleId}`;
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(registration));
  }

  /**
   * Create missing assignment for an agent
   */
  private async createMissingAssignment(
    organizationId: string,
    agent: { id: string; name: string; metadata: unknown },
    departmentId: string,
    moduleId: string
  ): Promise<void> {
    const agentMetadata = agent.metadata as Record<string, unknown>;
    const role = (agentMetadata?.role as string) || "worker";

    // Create position if needed
    let position = await prisma.agentPosition.findFirst({
      where: {
        departmentId,
        title: agent.name,
      },
    });

    if (!position) {
      position = await arPositionService.create(organizationId, {
        departmentId,
        title: agent.name,
        description: `Auto-created position for ${agent.name}`,
        level: this.roleToLevel(role),
        metadata: {
          megaAppModule: moduleId,
          autoCreated: true,
        },
      });
    }

    // Create assignment if position exists
    if (position) {
      await arAssignmentService.create({
        organizationId,
        agentId: agent.id,
        positionId: position.id,
        assignmentType: "permanent",
        status: "active",
        metadata: {
          megaAppModule: moduleId,
          autoAssigned: true,
        },
      });
    }
  }

  /**
   * Convert role to position level
   */
  private roleToLevel(role: string): 1 | 2 | 3 | 4 | 5 {
    const levelMap: Record<string, 1 | 2 | 3 | 4 | 5> = {
      worker: 1,
      specialist: 2,
      qa: 2,
      lead: 3,
      supervisor: 4,
      manager: 5,
    };
    return levelMap[role] || 1;
  }

  /**
   * Generate approval description for change
   */
  private generateApprovalDescription(change: OrgChangeRecord): string {
    switch (change.type) {
      case "team_created":
        return `Request to create new agent team for module ${change.moduleId}`;
      case "agent_split":
        return `Request to split agent responsibilities in module ${change.moduleId}`;
      case "agent_promoted":
        return `Request to promote agent to leadership role in module ${change.moduleId}`;
      case "agent_retired":
        return `Request to retire agent in module ${change.moduleId}`;
      default:
        return `Organization change request for module ${change.moduleId}`;
    }
  }

  /**
   * Determine impact scope of change
   */
  private determineImpactScope(
    change: OrgChangeRecord
  ): "individual" | "team" | "department" | "organization" {
    switch (change.type) {
      case "agent_promoted":
      case "agent_retired":
        return "team";
      case "team_created":
      case "agent_split":
        return "department";
      default:
        return "team";
    }
  }

  /**
   * Estimate cost of change (in cents)
   */
  private estimateChangeCost(change: OrgChangeRecord): number {
    // Simplified cost model based on change type
    const costMap: Record<string, number> = {
      team_created: 50000, // $500
      agent_split: 30000, // $300
      agent_promoted: 10000, // $100
      agent_retired: 5000, // $50
    };
    return costMap[change.type] || 10000;
  }

  /**
   * Determine approval level required
   */
  private determineApprovalLevel(change: OrgChangeRecord): 1 | 2 | 3 | 4 | 5 {
    switch (change.type) {
      case "team_created":
        return 3; // PROJECT level
      case "agent_split":
        return 2; // PROCESS level
      case "agent_promoted":
        return 2; // PROCESS level
      case "agent_retired":
        return 1; // TASK level
      default:
        return 2;
    }
  }

  /**
   * Emit event to value stream queue
   */
  private async emitToValueStreamQueue(event: AREvolutionEvent): Promise<void> {
    // Store event for processing by value stream workers
    await prisma.valueStreamArtifact.create({
      data: {
        organizationId: event.organizationId,
        moduleId: event.moduleId,
        status: "pending",
        version: 1,
        data: JSON.parse(JSON.stringify({
          eventType: event.eventType,
          data: event.data,
          severity: event.severity,
          timestamp: event.timestamp.toISOString(),
        })),
        tags: ["evolution_event_queue"],
      },
    });
  }
}

// Export singleton instance
let instance: ARIntegrationService | null = null;

export function getARIntegrationService(): ARIntegrationService {
  if (!instance) {
    instance = new ARIntegrationService();
  }
  return instance;
}
