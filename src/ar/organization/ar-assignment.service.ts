import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../services/audit-logger";
import type { AgentAssignment, AgentPosition, User } from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

export type AssignmentStatus = "active" | "on_leave" | "suspended" | "terminated";
export type AssignmentType = "permanent" | "temporary" | "acting";

export interface ARAssignmentCreateInput {
  organizationId: string;
  agentId: string;
  positionId: string;
  humanSupervisor?: string;
  assignmentType?: AssignmentType;
  startDate?: Date;
  endDate?: Date;
  status?: AssignmentStatus;
  performanceScore?: number;
  workload?: number;
  metadata?: Record<string, any>;
}

export interface AssignmentFilters {
  status?: AssignmentStatus;
  assignmentType?: AssignmentType;
  agentId?: string;
  positionId?: string;
  departmentId?: string;
  humanSupervisor?: string;
}

export interface AssignmentOptions {
  assignmentType?: AssignmentType;
  startDate?: Date;
  endDate?: Date;
  humanSupervisor?: string;
  notifySlack?: boolean;
}

// ============================================================================
// AR Assignment Service
// ============================================================================

export class ARAssignmentService {
  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new agent assignment
   */
  async create(data: ARAssignmentCreateInput): Promise<AgentAssignment> {
    // Validate position capacity
    await this.validatePositionCapacity(data.positionId, data.organizationId);

    // Validate agent exists and is active
    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${data.agentId}`);
    }

    if (agent.status !== "active") {
      throw new Error(`Agent is not active: ${agent.status}`);
    }

    // Validate position exists
    const position = await prisma.agentPosition.findUnique({
      where: { id: data.positionId },
      include: { department: true },
    });

    if (!position) {
      throw new Error(`Position not found: ${data.positionId}`);
    }

    // Create assignment
    const assignment = await prisma.agentAssignment.create({
      data: {
        organizationId: data.organizationId,
        agentId: data.agentId,
        positionId: data.positionId,
        humanSupervisor: data.humanSupervisor,
        assignmentType: data.assignmentType || "permanent",
        startDate: data.startDate || new Date(),
        endDate: data.endDate,
        status: data.status || "active",
        performanceScore: data.performanceScore,
        workload: data.workload || 1.0,
        metadata: data.metadata || {},
      },
    });

    // Audit log
    await auditLogger.log({
      action: "admin.action",
      organizationId: data.organizationId,
      resourceType: "agent_assignment",
      resourceId: assignment.id,
      details: {
        action: "create",
        agentId: data.agentId,
        positionId: data.positionId,
        assignmentType: assignment.assignmentType,
      },
      success: true,
    });

    logger.info("Agent assignment created", {
      assignmentId: assignment.id,
      agentId: data.agentId,
      positionId: data.positionId,
      positionTitle: position.title,
      department: position.department.name,
    });

    // Send Slack notification
    await this.sendSlackNotification(assignment, "assigned", position);

    return assignment;
  }

  /**
   * Find assignment by ID
   */
  async findById(id: string): Promise<AgentAssignment | null> {
    return await prisma.agentAssignment.findUnique({
      where: { id },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });
  }

  /**
   * Find all assignments for an agent
   */
  async findByAgent(agentId: string): Promise<AgentAssignment[]> {
    return await prisma.agentAssignment.findMany({
      where: { agentId },
      include: {
        position: {
          include: {
            department: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find all assignments for a position
   */
  async findByPosition(positionId: string): Promise<AgentAssignment[]> {
    return await prisma.agentAssignment.findMany({
      where: { positionId },
      include: {
        agent: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find all assignments with filters
   */
  async findAll(
    organizationId: string,
    filters?: AssignmentFilters,
  ): Promise<AgentAssignment[]> {
    const where: any = {
      organizationId,
    };

    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.assignmentType) where.assignmentType = filters.assignmentType;
      if (filters.agentId) where.agentId = filters.agentId;
      if (filters.positionId) where.positionId = filters.positionId;
      if (filters.humanSupervisor) where.humanSupervisor = filters.humanSupervisor;
      if (filters.departmentId) {
        where.position = {
          departmentId: filters.departmentId,
        };
      }
    }

    return await prisma.agentAssignment.findMany({
      where,
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update an assignment
   */
  async update(
    id: string,
    data: Partial<ARAssignmentCreateInput>,
  ): Promise<AgentAssignment> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Assignment not found: ${id}`);
    }

    // If changing position, validate capacity
    if (data.positionId && data.positionId !== existing.positionId) {
      await this.validatePositionCapacity(data.positionId, existing.organizationId);
    }

    const updated = await prisma.agentAssignment.update({
      where: { id },
      data: {
        humanSupervisor: data.humanSupervisor,
        assignmentType: data.assignmentType,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        performanceScore: data.performanceScore,
        workload: data.workload,
        metadata: data.metadata,
      },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });

    // Audit log
    await auditLogger.log({
      action: "admin.action",
      organizationId: existing.organizationId,
      resourceType: "agent_assignment",
      resourceId: id,
      details: {
        action: "update",
        changes: data,
      },
      success: true,
    });

    logger.info("Agent assignment updated", {
      assignmentId: id,
      changes: data,
    });

    return updated;
  }

  /**
   * Terminate an assignment
   */
  async terminate(id: string, reason?: string): Promise<AgentAssignment> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Assignment not found: ${id}`);
    }

    const terminated = await prisma.agentAssignment.update({
      where: { id },
      data: {
        status: "terminated",
        endDate: new Date(),
        metadata: {
          ...(existing.metadata as Record<string, any>),
          terminationReason: reason,
          terminatedAt: new Date().toISOString(),
        },
      },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });

    // Audit log
    await auditLogger.log({
      action: "admin.action",
      organizationId: existing.organizationId,
      resourceType: "agent_assignment",
      resourceId: id,
      details: {
        action: "terminate",
        reason,
      },
      success: true,
    });

    logger.info("Agent assignment terminated", {
      assignmentId: id,
      reason,
    });

    // Send Slack notification
    await this.sendSlackNotification(terminated, "terminated", terminated.position);

    return terminated;
  }

  // --------------------------------------------------------------------------
  // Assignment Operations
  // --------------------------------------------------------------------------

  /**
   * Assign an agent to a position
   */
  async assignAgent(
    agentId: string,
    positionId: string,
    options?: AssignmentOptions,
  ): Promise<AgentAssignment> {
    // Get agent to determine organizationId
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Check if agent already has an active assignment to this position
    const existing = await prisma.agentAssignment.findFirst({
      where: {
        agentId,
        positionId,
        status: "active",
      },
    });

    if (existing) {
      throw new Error(`Agent is already assigned to this position (active assignment exists)`);
    }

    return await this.create({
      organizationId: agent.organizationId,
      agentId,
      positionId,
      assignmentType: options?.assignmentType,
      startDate: options?.startDate,
      endDate: options?.endDate,
      humanSupervisor: options?.humanSupervisor,
    });
  }

  /**
   * Reassign an agent to a new position
   */
  async reassignAgent(assignmentId: string, newPositionId: string): Promise<AgentAssignment> {
    return await prisma.$transaction(async (tx) => {
      // Get existing assignment
      const existing = await tx.agentAssignment.findUnique({
        where: { id: assignmentId },
      });

      if (!existing) {
        throw new Error(`Assignment not found: ${assignmentId}`);
      }

      // Validate new position capacity
      await this.validatePositionCapacity(newPositionId, existing.organizationId);

      // Terminate old assignment
      await tx.agentAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "terminated",
          endDate: new Date(),
          metadata: {
            ...(existing.metadata as Record<string, any>),
            reassignedTo: newPositionId,
            reassignedAt: new Date().toISOString(),
          },
        },
      });

      // Create new assignment
      const newAssignment = await tx.agentAssignment.create({
        data: {
          organizationId: existing.organizationId,
          agentId: existing.agentId,
          positionId: newPositionId,
          humanSupervisor: existing.humanSupervisor,
          assignmentType: existing.assignmentType,
          startDate: new Date(),
          status: "active",
          workload: existing.workload,
          metadata: {
            reassignedFrom: assignmentId,
            reassignedAt: new Date().toISOString(),
          },
        },
        include: {
          agent: true,
          position: {
            include: {
              department: true,
            },
          },
        },
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId: existing.organizationId,
        resourceType: "agent_assignment",
        resourceId: newAssignment.id,
        details: {
          action: "reassign",
          oldAssignmentId: assignmentId,
          oldPositionId: existing.positionId,
          newPositionId,
        },
        success: true,
      });

      logger.info("Agent reassigned", {
        oldAssignmentId: assignmentId,
        newAssignmentId: newAssignment.id,
        agentId: existing.agentId,
        oldPositionId: existing.positionId,
        newPositionId,
      });

      // Send Slack notification
      await this.sendSlackNotification(newAssignment, "reassigned", newAssignment.position);

      return newAssignment;
    });
  }

  /**
   * Set human supervisor for an assignment
   */
  async setHumanSupervisor(assignmentId: string, userId: string): Promise<AgentAssignment> {
    const existing = await this.findById(assignmentId);
    if (!existing) {
      throw new Error(`Assignment not found: ${assignmentId}`);
    }

    // Validate user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const updated = await prisma.agentAssignment.update({
      where: { id: assignmentId },
      data: {
        humanSupervisor: userId,
      },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });

    // Audit log
    await auditLogger.log({
      action: "admin.action",
      organizationId: existing.organizationId,
      resourceType: "agent_assignment",
      resourceId: assignmentId,
      details: {
        action: "set_supervisor",
        userId,
      },
      success: true,
    });

    logger.info("Human supervisor assigned", {
      assignmentId,
      userId,
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // Status Operations
  // --------------------------------------------------------------------------

  /**
   * Update assignment status
   */
  async updateStatus(assignmentId: string, status: AssignmentStatus): Promise<AgentAssignment> {
    const existing = await this.findById(assignmentId);
    if (!existing) {
      throw new Error(`Assignment not found: ${assignmentId}`);
    }

    const updated = await prisma.agentAssignment.update({
      where: { id: assignmentId },
      data: { status },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });

    // Audit log
    await auditLogger.log({
      action: "admin.action",
      organizationId: existing.organizationId,
      resourceType: "agent_assignment",
      resourceId: assignmentId,
      details: {
        action: "update_status",
        oldStatus: existing.status,
        newStatus: status,
      },
      success: true,
    });

    logger.info("Assignment status updated", {
      assignmentId,
      oldStatus: existing.status,
      newStatus: status,
    });

    // Send Slack notification for significant status changes
    if (status === "suspended" || status === "terminated") {
      await this.sendSlackNotification(updated, status, updated.position);
    }

    return updated;
  }

  /**
   * Update workload
   */
  async updateWorkload(assignmentId: string, workload: number): Promise<AgentAssignment> {
    if (workload < 0 || workload > 1) {
      throw new Error("Workload must be between 0 and 1");
    }

    const updated = await prisma.agentAssignment.update({
      where: { id: assignmentId },
      data: { workload },
    });

    logger.info("Assignment workload updated", {
      assignmentId,
      workload,
    });

    return updated;
  }

  /**
   * Update performance score
   */
  async updatePerformanceScore(assignmentId: string, score: number): Promise<AgentAssignment> {
    if (score < 0 || score > 100) {
      throw new Error("Performance score must be between 0 and 100");
    }

    const updated = await prisma.agentAssignment.update({
      where: { id: assignmentId },
      data: { performanceScore: score },
    });

    logger.info("Assignment performance score updated", {
      assignmentId,
      score,
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  /**
   * Get all active assignments for an organization
   */
  async getActiveAssignments(organizationId: string): Promise<AgentAssignment[]> {
    return await this.findAll(organizationId, { status: "active" });
  }

  /**
   * Get assignments by department
   */
  async getAssignmentsByDepartment(departmentId: string): Promise<AgentAssignment[]> {
    return await prisma.agentAssignment.findMany({
      where: {
        position: {
          departmentId,
        },
      },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get agent's supervisor (human or agent position)
   */
  async getAgentSupervisor(
    agentId: string,
  ): Promise<{ human?: User; agentPosition?: AgentPosition } | null> {
    // Get active assignment
    const assignment = await prisma.agentAssignment.findFirst({
      where: {
        agentId,
        status: "active",
      },
      include: {
        position: {
          include: {
            reportsTo: true,
          },
        },
      },
    });

    if (!assignment) {
      return null;
    }

    const result: { human?: User; agentPosition?: AgentPosition } = {};

    // Human supervisor
    if (assignment.humanSupervisor) {
      const user = await prisma.user.findUnique({
        where: { id: assignment.humanSupervisor },
      });
      if (user) {
        result.human = user;
      }
    }

    // Agent position supervisor (the position this position reports to)
    if (assignment.position.reportsTo) {
      result.agentPosition = assignment.position.reportsTo;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Validate that a position has capacity for a new assignment
   */
  private async validatePositionCapacity(
    positionId: string,
    organizationId: string,
  ): Promise<void> {
    const position = await prisma.agentPosition.findUnique({
      where: { id: positionId },
      include: {
        assignments: {
          where: {
            status: "active",
          },
        },
      },
    });

    if (!position) {
      throw new Error(`Position not found: ${positionId}`);
    }

    if (position.organizationId !== organizationId) {
      throw new Error("Position does not belong to this organization");
    }

    const activeCount = position.assignments.length;

    if (activeCount >= position.maxConcurrent) {
      throw new Error(
        `Position at capacity: ${activeCount}/${position.maxConcurrent} active assignments`,
      );
    }
  }

  /**
   * Send Slack notification for assignment changes
   */
  private async sendSlackNotification(
    assignment: any,
    action: string,
    _position: any,
  ): Promise<void> {
    try {
      // TODO: Implement slack notification using appropriate service
      // Temporarily disabled due to missing sendSlackNotification export

      // const agent = assignment.agent;
      // const department = position.department;

      // let message = "";
      // switch (action) {
      //   case "assigned":
      //     message = `Agent *${agent.name}* has been assigned to position *${position.title}* in ${department.name}`;
      //     break;
      //   case "reassigned":
      //     message = `Agent *${agent.name}* has been reassigned to *${position.title}* in ${department.name}`;
      //     break;
      //   case "terminated":
      //     message = `Agent *${agent.name}*'s assignment to *${position.title}* has been terminated`;
      //     break;
      //   case "suspended":
      //     message = `Agent *${agent.name}*'s assignment to *${position.title}* has been suspended`;
      //     break;
      //   default:
      //     message = `Agent assignment updated: *${agent.name}* - *${position.title}*`;
      // }

      // await sendSlackNotification({
      //   organizationId: assignment.organizationId,
      //   channel: "#agent-assignments",
      //   message,
      //   metadata: {
      //     assignmentId: assignment.id,
      //     agentId: agent.id,
      //     positionId: position.id,
      //     action,
      //   },
      // });
    } catch (error) {
      // Log but don't fail on notification errors
      logger.warn("Failed to send Slack notification for assignment", {
        assignmentId: assignment.id,
        action,
        error,
      });
    }
  }
}

// Export singleton instance
export const arAssignmentService = new ARAssignmentService();
