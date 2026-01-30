/**
 * AR Position Service
 *
 * Manages agent positions within the organizational hierarchy, including
 * CRUD operations, reporting chain management, and position analytics.
 *
 * Multi-tenant: All operations scoped to organizationId
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../services/audit-logger";
import { ARPositionCreateInput, PositionLevel } from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface PositionFilters {
  departmentId?: string;
  level?: PositionLevel;
  reportsToId?: string | null;
  hasVacancies?: boolean; // Positions with available slots
  search?: string; // Search by title
}

export interface PositionStatistics {
  totalPositions: number;
  positionsByLevel: Record<PositionLevel, number>;
  positionsByDepartment: Record<string, number>;
  vacantPositions: number;
  filledPositions: number;
  averageReportsPerManager: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ARPositionService {
  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new position
   */
  async create(
    organizationId: string,
    data: ARPositionCreateInput,
    actorId?: string,
  ): Promise<any> {
    try {
      // Validate reporting chain before creating
      if (data.reportsToId) {
        await this.validateReportingChain(organizationId, data.reportsToId, null);
      }

      // Validate department belongs to organization
      const department = await prisma.agentDepartment.findFirst({
        where: {
          id: data.departmentId,
          organizationId,
        },
      });

      if (!department) {
        throw new Error(`Department ${data.departmentId} not found in organization`);
      }

      const position = await prisma.agentPosition.create({
        data: {
          organizationId,
          departmentId: data.departmentId,
          title: data.title,
          level: data.level,
          reportsToId: data.reportsToId,
          requiredSkills: data.requiredCapabilities || [],
          metadata: data.metadata || {},
        },
        include: {
          department: true,
          reportsTo: true,
          directReports: true,
          assignments: {
            include: {
              agent: true,
            },
          },
        },
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        userId: actorId,
        resourceType: "agent_position",
        resourceId: position.id,
        details: {
          operation: "create",
          title: position.title,
          level: position.level,
          departmentId: position.departmentId,
        },
        success: true,
      });

      logger.info("Position created", {
        positionId: position.id,
        title: position.title,
        organizationId,
      });

      return position;
    } catch (error) {
      logger.error(
        "Failed to create position",
        { organizationId, title: data.title },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find position by ID
   */
  async findById(organizationId: string, id: string): Promise<any | null> {
    try {
      const position = await prisma.agentPosition.findFirst({
        where: {
          id,
          organizationId,
        },
        include: {
          department: true,
          reportsTo: true,
          directReports: {
            include: {
              assignments: {
                where: {
                  status: "active",
                },
              },
            },
          },
          assignments: {
            include: {
              agent: true,
            },
          },
        },
      });

      return position;
    } catch (error) {
      logger.error(
        "Failed to find position",
        { organizationId, id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find all positions in a department
   */
  async findByDepartment(organizationId: string, departmentId: string): Promise<any[]> {
    try {
      const positions = await prisma.agentPosition.findMany({
        where: {
          organizationId,
          departmentId,
        },
        include: {
          reportsTo: true,
          directReports: true,
          assignments: {
            where: {
              status: "active",
            },
            include: {
              agent: true,
            },
          },
        },
        orderBy: [{ level: "desc" }, { title: "asc" }],
      });

      return positions;
    } catch (error) {
      logger.error(
        "Failed to find positions by department",
        { organizationId, departmentId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find all positions with optional filters
   */
  async findAll(organizationId: string, filters?: PositionFilters): Promise<any[]> {
    try {
      const where: any = {
        organizationId,
      };

      if (filters?.departmentId) {
        where.departmentId = filters.departmentId;
      }

      if (filters?.level) {
        where.level = filters.level;
      }

      if (filters?.reportsToId !== undefined) {
        where.reportsToId = filters.reportsToId;
      }

      if (filters?.search) {
        where.title = {
          contains: filters.search,
          mode: "insensitive",
        };
      }

      const positions = await prisma.agentPosition.findMany({
        where,
        include: {
          department: true,
          reportsTo: true,
          assignments: {
            where: {
              status: "active",
            },
            include: {
              agent: true,
            },
          },
        },
        orderBy: [{ level: "desc" }, { title: "asc" }],
      });

      // Filter by vacancy if requested
      if (filters?.hasVacancies !== undefined) {
        return positions.filter((p) => {
          const activeAssignments = p.assignments?.length || 0;
          const hasVacancy = activeAssignments < p.maxConcurrent;
          return filters.hasVacancies ? hasVacancy : !hasVacancy;
        });
      }

      return positions;
    } catch (error) {
      logger.error(
        "Failed to find positions",
        { organizationId, filters },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Update a position
   */
  async update(
    organizationId: string,
    id: string,
    data: Partial<ARPositionCreateInput>,
    actorId?: string,
  ): Promise<any> {
    try {
      // Verify position exists and belongs to organization
      const existing = await this.findById(organizationId, id);
      if (!existing) {
        throw new Error(`Position ${id} not found in organization`);
      }

      // Validate reporting chain if being changed
      if (data.reportsToId !== undefined) {
        await this.validateReportingChain(organizationId, data.reportsToId, id);
      }

      const updateData: any = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.level !== undefined) updateData.level = data.level;
      if (data.reportsToId !== undefined) updateData.reportsToId = data.reportsToId;
      if (data.requiredCapabilities !== undefined)
        updateData.requiredSkills = data.requiredCapabilities;
      if (data.metadata !== undefined) {
        updateData.metadata = {
          ...existing.metadata,
          ...data.metadata,
        };
      }

      const position = await prisma.agentPosition.update({
        where: { id },
        data: updateData,
        include: {
          department: true,
          reportsTo: true,
          directReports: true,
          assignments: {
            include: {
              agent: true,
            },
          },
        },
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        userId: actorId,
        resourceType: "agent_position",
        resourceId: position.id,
        details: {
          operation: "update",
          changes: updateData,
        },
        success: true,
      });

      logger.info("Position updated", {
        positionId: position.id,
        organizationId,
      });

      return position;
    } catch (error) {
      logger.error(
        "Failed to update position",
        { organizationId, id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Delete a position
   */
  async delete(organizationId: string, id: string, actorId?: string): Promise<void> {
    try {
      // Verify position exists and belongs to organization
      const existing = await this.findById(organizationId, id);
      if (!existing) {
        throw new Error(`Position ${id} not found in organization`);
      }

      // Check for active assignments
      const activeAssignments = await prisma.agentAssignment.count({
        where: {
          positionId: id,
          status: "active",
        },
      });

      if (activeAssignments > 0) {
        throw new Error(
          `Cannot delete position with ${activeAssignments} active assignment(s). Terminate assignments first.`,
        );
      }

      // Check for direct reports
      const directReports = await prisma.agentPosition.count({
        where: {
          reportsToId: id,
        },
      });

      if (directReports > 0) {
        throw new Error(
          `Cannot delete position with ${directReports} direct report(s). Reassign reporting lines first.`,
        );
      }

      await prisma.agentPosition.delete({
        where: { id },
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        userId: actorId,
        resourceType: "agent_position",
        resourceId: id,
        details: {
          operation: "delete",
          title: existing.title,
        },
        success: true,
      });

      logger.info("Position deleted", {
        positionId: id,
        organizationId,
      });
    } catch (error) {
      logger.error(
        "Failed to delete position",
        { organizationId, id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // ==========================================================================
  // HIERARCHY OPERATIONS
  // ==========================================================================

  /**
   * Get the full reporting chain from a position to the top
   */
  async getReportingChain(organizationId: string, positionId: string): Promise<any[]> {
    try {
      const chain: any[] = [];
      let currentId: string | null = positionId;

      while (currentId) {
        const position = await this.findById(organizationId, currentId);
        if (!position) break;

        chain.push(position);

        // Prevent infinite loops (circular reference)
        if (chain.some((p, idx) => idx < chain.length - 1 && p.id === currentId)) {
          logger.error("Circular reporting chain detected", {
            organizationId,
            positionId,
            chain: chain.map((p) => p.id),
          });
          break;
        }

        currentId = position.reportsToId;
      }

      return chain;
    } catch (error) {
      logger.error(
        "Failed to get reporting chain",
        { organizationId, positionId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Get all direct reports for a position
   */
  async getDirectReports(organizationId: string, positionId: string): Promise<any[]> {
    try {
      const reports = await prisma.agentPosition.findMany({
        where: {
          organizationId,
          reportsToId: positionId,
        },
        include: {
          department: true,
          assignments: {
            where: {
              status: "active",
            },
            include: {
              agent: true,
            },
          },
        },
        orderBy: [{ level: "desc" }, { title: "asc" }],
      });

      return reports;
    } catch (error) {
      logger.error(
        "Failed to get direct reports",
        { organizationId, positionId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Change the reporting line for a position
   */
  async changeReportingLine(
    organizationId: string,
    positionId: string,
    newReportsToId: string | null,
    actorId?: string,
  ): Promise<any> {
    try {
      // Validate new reporting chain
      await this.validateReportingChain(organizationId, newReportsToId, positionId);

      const position = await prisma.agentPosition.update({
        where: { id: positionId },
        data: {
          reportsToId: newReportsToId,
        },
        include: {
          department: true,
          reportsTo: true,
          directReports: true,
          assignments: {
            include: {
              agent: true,
            },
          },
        },
      });

      // Audit log
      await auditLogger.log({
        action: "admin.action",
        organizationId,
        userId: actorId,
        resourceType: "agent_position",
        resourceId: positionId,
        details: {
          operation: "change_reporting_line",
          oldReportsToId: position.reportsToId,
          newReportsToId,
        },
        success: true,
      });

      logger.info("Reporting line changed", {
        positionId,
        newReportsToId,
        organizationId,
      });

      return position;
    } catch (error) {
      logger.error(
        "Failed to change reporting line",
        { organizationId, positionId, newReportsToId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // ==========================================================================
  // POSITION ANALYSIS
  // ==========================================================================

  /**
   * Get all positions at a specific level
   */
  async getPositionsByLevel(organizationId: string, level: PositionLevel): Promise<any[]> {
    return this.findAll(organizationId, { level });
  }

  /**
   * Get all vacant positions (with available assignment slots)
   */
  async getVacantPositions(organizationId: string): Promise<any[]> {
    return this.findAll(organizationId, { hasVacancies: true });
  }

  /**
   * Get position statistics for the organization
   */
  async getPositionStats(organizationId: string): Promise<PositionStatistics> {
    try {
      const positions = await prisma.agentPosition.findMany({
        where: { organizationId },
        include: {
          assignments: {
            where: {
              status: "active",
            },
          },
          directReports: true,
        },
      });

      const stats: PositionStatistics = {
        totalPositions: positions.length,
        positionsByLevel: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
        positionsByDepartment: {},
        vacantPositions: 0,
        filledPositions: 0,
        averageReportsPerManager: 0,
      };

      let totalReports = 0;
      let managersCount = 0;

      for (const position of positions) {
        // By level
        stats.positionsByLevel[position.level as PositionLevel]++;

        // By department
        stats.positionsByDepartment[position.departmentId] =
          (stats.positionsByDepartment[position.departmentId] || 0) + 1;

        // Vacancy
        const activeAssignments = position.assignments?.length || 0;
        if (activeAssignments < position.maxConcurrent) {
          stats.vacantPositions++;
        } else {
          stats.filledPositions++;
        }

        // Manager stats
        if (position.directReports && position.directReports.length > 0) {
          managersCount++;
          totalReports += position.directReports.length;
        }
      }

      stats.averageReportsPerManager = managersCount > 0 ? totalReports / managersCount : 0;

      return stats;
    } catch (error) {
      logger.error(
        "Failed to get position stats",
        { organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // ==========================================================================
  // VALIDATION HELPERS
  // ==========================================================================

  /**
   * Validate reporting chain to prevent circular references
   */
  private async validateReportingChain(
    organizationId: string,
    reportsToId: string | null,
    positionId: string | null,
  ): Promise<void> {
    if (!reportsToId) return; // Top-level position, no validation needed

    // Cannot report to itself
    if (positionId && reportsToId === positionId) {
      throw new Error("Position cannot report to itself");
    }

    // Verify reportsTo exists and belongs to organization
    const reportsToPosition = await this.findById(organizationId, reportsToId);
    if (!reportsToPosition) {
      throw new Error(`Reports-to position ${reportsToId} not found in organization`);
    }

    // Check for circular reference by walking up the chain
    if (positionId) {
      const chain = await this.getReportingChain(organizationId, reportsToId);
      if (chain.some((p) => p.id === positionId)) {
        throw new Error("Circular reporting chain detected");
      }
    }
  }
}

// Export singleton instance
export const arPositionService = new ARPositionService();
