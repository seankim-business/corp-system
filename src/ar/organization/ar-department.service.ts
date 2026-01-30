/**
 * AR Department Service
 *
 * Manages organizational departments within the Agent Resource (AR) system.
 * Provides CRUD operations, hierarchy management, and budget operations.
 */

import { db as prisma } from '../../db/client';
import { logger } from '../../utils/logger';
import { auditLogger } from '../../services/audit-logger';
import {
  ARNotFoundError,
  ARValidationError,
  ARConflictError,
} from '../errors';
import type {
  ARDepartmentCreateInput,
  DepartmentStatus,
} from '../types';
import type { AgentDepartment } from '@prisma/client';

// =============================================================================
// Additional Types
// =============================================================================

export interface DepartmentFilters {
  status?: DepartmentStatus | DepartmentStatus[];
  parentId?: string | null;
  search?: string;
}

export interface DepartmentHierarchyNode {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parentId: string | null;
  headAgentId: string | null;
  headHumanId: string | null;
  budgetCents: number | null;
  costCenter: string | null;
  status: string;
  metadata: any;
  children: DepartmentHierarchyNode[];
  depth: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface CostSummary {
  departmentId: string;
  totalCostCents: number;
  startDate: Date;
  endDate: Date;
  breakdown: {
    taskCosts: number;
    agentCosts: number;
    overheadCosts: number;
  };
  childDepartmentsCosts: {
    departmentId: string;
    departmentName: string;
    costCents: number;
  }[];
}

// =============================================================================
// AR Department Service
// =============================================================================

export class ARDepartmentService {
  /**
   * Create a new department
   */
  async create(
    organizationId: string,
    data: ARDepartmentCreateInput
  ): Promise<AgentDepartment> {
    try {
      // Validate parent department exists if specified
      if (data.parentId) {
        const parent = await this.findById(data.parentId);
        if (!parent || parent.organizationId !== organizationId) {
          throw new ARValidationError('Parent department not found or belongs to different organization', {
            parentId: data.parentId,
          });
        }
      }

      // Generate unique code if not provided
      const code = this.generateDepartmentCode(data.name);

      // Check for duplicate code
      const existing = await prisma.agentDepartment.findFirst({
        where: {
          organizationId,
          code,
        },
      });

      if (existing) {
        throw new ARConflictError('Department with this code already exists', {
          code,
          existingId: existing.id,
        });
      }

      // Create department
      const department = await prisma.agentDepartment.create({
        data: {
          organizationId,
          name: data.name,
          code,
          description: data.description,
          parentId: data.parentId,
          headAgentId: data.headPositionId, // Note: this maps to headAgentId in schema
          status: data.status || 'active',
          metadata: data.metadata || {},
        },
      });

      // Audit log
      await auditLogger.log({
        action: 'ar.department.created',
        organizationId,
        resourceType: 'agent_department',
        resourceId: department.id,
        details: {
          name: department.name,
          code: department.code,
          parentId: department.parentId,
        },
        success: true,
      });

      logger.info('Department created', {
        organizationId,
        departmentId: department.id,
        name: department.name,
      });

      return department;
    } catch (error) {
      logger.error(
        'Failed to create department',
        { organizationId, data },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Find department by ID
   */
  async findById(id: string): Promise<AgentDepartment | null> {
    try {
      return await prisma.agentDepartment.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error('Failed to find department by ID', { id }, error as Error);
      throw error;
    }
  }

  /**
   * Find department by code within an organization
   */
  async findByCode(
    organizationId: string,
    code: string
  ): Promise<AgentDepartment | null> {
    try {
      return await prisma.agentDepartment.findFirst({
        where: {
          organizationId,
          code,
        },
      });
    } catch (error) {
      logger.error(
        'Failed to find department by code',
        { organizationId, code },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Find all departments for an organization with optional filters
   */
  async findAll(
    organizationId: string,
    filters?: DepartmentFilters
  ): Promise<AgentDepartment[]> {
    try {
      const where: any = { organizationId };

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          where.status = { in: filters.status };
        } else {
          where.status = filters.status;
        }
      }

      if (filters?.parentId !== undefined) {
        where.parentId = filters.parentId;
      }

      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { code: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      return await prisma.agentDepartment.findMany({
        where,
        orderBy: [{ name: 'asc' }],
      });
    } catch (error) {
      logger.error(
        'Failed to find departments',
        { organizationId, filters },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Update a department
   */
  async update(
    id: string,
    data: Partial<ARDepartmentCreateInput>
  ): Promise<AgentDepartment> {
    try {
      // Check department exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new ARNotFoundError('Department', id);
      }

      // Validate parent department if being changed
      if (data.parentId !== undefined) {
        if (data.parentId === id) {
          throw new ARValidationError('Department cannot be its own parent', {
            departmentId: id,
          });
        }

        if (data.parentId !== null) {
          const parent = await this.findById(data.parentId);
          if (!parent || parent.organizationId !== existing.organizationId) {
            throw new ARValidationError(
              'Parent department not found or belongs to different organization',
              { parentId: data.parentId }
            );
          }

          // Check for circular reference
          const wouldCreateCycle = await this.wouldCreateCycle(id, data.parentId);
          if (wouldCreateCycle) {
            throw new ARValidationError(
              'Cannot set parent: would create circular hierarchy',
              { departmentId: id, parentId: data.parentId }
            );
          }
        }
      }

      // Prepare update data
      const updateData: any = {};
      if (data.name) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.parentId !== undefined) updateData.parentId = data.parentId;
      if (data.headPositionId !== undefined) updateData.headAgentId = data.headPositionId;
      if (data.status) updateData.status = data.status;
      if (data.metadata) updateData.metadata = data.metadata;

      // Update department
      const updated = await prisma.agentDepartment.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      await auditLogger.log({
        action: 'ar.department.updated',
        organizationId: existing.organizationId,
        resourceType: 'agent_department',
        resourceId: id,
        details: {
          changes: updateData,
        },
        success: true,
      });

      logger.info('Department updated', {
        organizationId: existing.organizationId,
        departmentId: id,
        changes: Object.keys(updateData),
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update department', { id, data }, error as Error);
      throw error;
    }
  }

  /**
   * Delete a department (soft delete by setting status to archived)
   */
  async delete(id: string): Promise<void> {
    try {
      const department = await this.findById(id);
      if (!department) {
        throw new ARNotFoundError('Department', id);
      }

      // Check if department has children
      const children = await this.getChildren(id);
      if (children.length > 0) {
        throw new ARValidationError(
          'Cannot delete department with children',
          {
            departmentId: id,
            childCount: children.length,
          }
        );
      }

      // Soft delete by setting status to archived
      await prisma.agentDepartment.update({
        where: { id },
        data: { status: 'archived' },
      });

      // Audit log
      await auditLogger.log({
        action: 'ar.department.deleted',
        organizationId: department.organizationId,
        resourceType: 'agent_department',
        resourceId: id,
        details: {
          name: department.name,
          code: department.code,
        },
        success: true,
      });

      logger.info('Department deleted (archived)', {
        organizationId: department.organizationId,
        departmentId: id,
      });
    } catch (error) {
      logger.error('Failed to delete department', { id }, error as Error);
      throw error;
    }
  }

  /**
   * Get department hierarchy for an organization
   */
  async getHierarchy(organizationId: string): Promise<DepartmentHierarchyNode[]> {
    try {
      const departments = await prisma.agentDepartment.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });

      // Build hierarchy tree
      const tree = this.buildHierarchyTree(departments);

      return tree;
    } catch (error) {
      logger.error(
        'Failed to get department hierarchy',
        { organizationId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get direct children of a department
   */
  async getChildren(departmentId: string): Promise<AgentDepartment[]> {
    try {
      return await prisma.agentDepartment.findMany({
        where: { parentId: departmentId },
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      logger.error(
        'Failed to get department children',
        { departmentId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get all ancestors of a department (parent, grandparent, etc.)
   */
  async getAncestors(departmentId: string): Promise<AgentDepartment[]> {
    try {
      const ancestors: AgentDepartment[] = [];
      let currentId: string | null = departmentId;

      while (currentId) {
        const dept = await this.findById(currentId);
        if (!dept) break;

        if (dept.parentId) {
          const parent = await this.findById(dept.parentId);
          if (parent) {
            ancestors.push(parent);
            currentId = parent.parentId;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      return ancestors;
    } catch (error) {
      logger.error(
        'Failed to get department ancestors',
        { departmentId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Move a department to a new parent
   */
  async moveDepartment(
    departmentId: string,
    newParentId: string | null
  ): Promise<AgentDepartment> {
    try {
      const department = await this.findById(departmentId);
      if (!department) {
        throw new ARNotFoundError('Department', departmentId);
      }

      // Validate new parent
      if (newParentId !== null) {
        if (newParentId === departmentId) {
          throw new ARValidationError('Department cannot be its own parent', {
            departmentId,
          });
        }

        const newParent = await this.findById(newParentId);
        if (!newParent || newParent.organizationId !== department.organizationId) {
          throw new ARValidationError(
            'Parent department not found or belongs to different organization',
            { parentId: newParentId }
          );
        }

        // Check for circular reference
        const wouldCreateCycle = await this.wouldCreateCycle(departmentId, newParentId);
        if (wouldCreateCycle) {
          throw new ARValidationError(
            'Cannot move department: would create circular hierarchy',
            { departmentId, newParentId }
          );
        }
      }

      // Move department
      const updated = await prisma.agentDepartment.update({
        where: { id: departmentId },
        data: { parentId: newParentId },
      });

      // Audit log
      await auditLogger.log({
        action: 'ar.department.moved',
        organizationId: department.organizationId,
        resourceType: 'agent_department',
        resourceId: departmentId,
        details: {
          oldParentId: department.parentId,
          newParentId,
        },
        success: true,
      });

      logger.info('Department moved', {
        organizationId: department.organizationId,
        departmentId,
        oldParentId: department.parentId,
        newParentId,
      });

      return updated;
    } catch (error) {
      logger.error(
        'Failed to move department',
        { departmentId, newParentId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Update department budget
   */
  async updateBudget(
    departmentId: string,
    budgetCents: number
  ): Promise<AgentDepartment> {
    try {
      if (budgetCents < 0) {
        throw new ARValidationError('Budget cannot be negative', { budgetCents });
      }

      const department = await this.findById(departmentId);
      if (!department) {
        throw new ARNotFoundError('Department', departmentId);
      }

      const updated = await prisma.agentDepartment.update({
        where: { id: departmentId },
        data: { budgetCents },
      });

      // Audit log
      await auditLogger.log({
        action: 'ar.department.budget_updated',
        organizationId: department.organizationId,
        resourceType: 'agent_department',
        resourceId: departmentId,
        details: {
          oldBudgetCents: department.budgetCents,
          newBudgetCents: budgetCents,
        },
        success: true,
      });

      logger.info('Department budget updated', {
        organizationId: department.organizationId,
        departmentId,
        budgetCents,
      });

      return updated;
    } catch (error) {
      logger.error(
        'Failed to update department budget',
        { departmentId, budgetCents },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get department costs for a date range
   */
  async getDepartmentCosts(
    departmentId: string,
    dateRange: DateRange
  ): Promise<CostSummary> {
    try {
      const department = await this.findById(departmentId);
      if (!department) {
        throw new ARNotFoundError('Department', departmentId);
      }

      // Get direct costs from AR cost entries
      const costs = await prisma.aRCostEntry.findMany({
        where: {
          organizationId: department.organizationId,
          departmentId,
          createdAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
      });

      // Calculate breakdown
      const breakdown = {
        taskCosts: costs
          .filter((c) => c.costType === 'task')
          .reduce((sum, c) => sum + (c.amountCents || 0), 0),
        agentCosts: costs
          .filter((c) => c.costType === 'agent')
          .reduce((sum, c) => sum + (c.amountCents || 0), 0),
        overheadCosts: costs
          .filter((c) => c.costType === 'overhead')
          .reduce((sum, c) => sum + (c.amountCents || 0), 0),
      };

      const totalCostCents =
        breakdown.taskCosts + breakdown.agentCosts + breakdown.overheadCosts;

      // Get child departments costs
      const children = await this.getChildren(departmentId);
      const childDepartmentsCosts = await Promise.all(
        children.map(async (child) => {
          const childCosts = await this.getDepartmentCosts(child.id, dateRange);
          return {
            departmentId: child.id,
            departmentName: child.name,
            costCents: childCosts.totalCostCents,
          };
        })
      );

      return {
        departmentId,
        totalCostCents,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        breakdown,
        childDepartmentsCosts,
      };
    } catch (error) {
      logger.error(
        'Failed to get department costs',
        { departmentId, dateRange },
        error as Error
      );
      throw error;
    }
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  /**
   * Generate a unique department code from name
   */
  private generateDepartmentCode(name: string): string {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Build hierarchy tree from flat list of departments
   */
  private buildHierarchyTree(
    departments: AgentDepartment[],
    parentId: string | null = null,
    depth: number = 0
  ): DepartmentHierarchyNode[] {
    const children = departments.filter((d) => d.parentId === parentId);

    return children.map((dept) => ({
      id: dept.id,
      name: dept.name,
      code: dept.code,
      description: dept.description,
      parentId: dept.parentId,
      headAgentId: dept.headAgentId,
      headHumanId: dept.headHumanId,
      budgetCents: dept.budgetCents,
      costCenter: dept.costCenter,
      status: dept.status,
      metadata: dept.metadata,
      depth,
      children: this.buildHierarchyTree(departments, dept.id, depth + 1),
    }));
  }

  /**
   * Check if moving a department would create a circular reference
   */
  private async wouldCreateCycle(
    departmentId: string,
    newParentId: string
  ): Promise<boolean> {
    let currentId: string | null = newParentId;

    while (currentId) {
      if (currentId === departmentId) {
        return true;
      }

      const dept = await this.findById(currentId);
      if (!dept) break;

      currentId = dept.parentId;
    }

    return false;
  }
}

// Export singleton instance
export const arDepartmentService = new ARDepartmentService();
