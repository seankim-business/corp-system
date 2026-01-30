/**
 * AR Hierarchy Service
 *
 * Service for building and querying organizational hierarchies including:
 * - Department tree structures
 * - Position reporting chains
 * - Complete org chart data
 * - Cycle detection and validation
 * - Redis caching for frequently accessed hierarchies
 */

import { db as prisma } from '../../db/client';
import { redis } from '../../db/redis';
import { logger } from '../../utils/logger';
import { auditLogger } from '../../services/audit-logger';
import type {
  AgentDepartment,
  AgentPosition,
  AgentAssignment
} from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface DepartmentHierarchyNode {
  department: AgentDepartment;
  children: DepartmentHierarchyNode[];
  positions: AgentPosition[];
  depth: number;
}

export interface PositionHierarchyNode {
  position: AgentPosition;
  directReports: PositionHierarchyNode[];
  assignments: AgentAssignment[];
  depth: number;
}

export interface OrgChartData {
  departments: DepartmentHierarchyNode[];
  totalDepartments: number;
  totalPositions: number;
  totalAssignments: number;
  maxDepth: number;
}

// =============================================================================
// AR Hierarchy Service
// =============================================================================

export class ARHierarchyService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly MAX_DEPTH = 50; // Prevent infinite loops

  // ===========================================================================
  // Department Hierarchy
  // ===========================================================================

  /**
   * Get full department hierarchy as a tree
   */
  async getDepartmentHierarchy(organizationId: string): Promise<DepartmentHierarchyNode[]> {
    try {
      const cacheKey = `ar:org:${organizationId}:dept-hierarchy`;

      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Department hierarchy cache hit', { organizationId });
        return JSON.parse(cached);
      }

      // Fetch all departments for organization
      const departments = await prisma.agentDepartment.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });

      // Fetch all positions for these departments
      const positions = await prisma.agentPosition.findMany({
        where: {
          organizationId,
          departmentId: { in: departments.map(d => d.id) },
        },
        orderBy: [{ level: 'desc' }, { title: 'asc' }],
      });

      // Build hierarchy tree
      const tree = this.buildDepartmentTree(departments, positions);

      // Cache the result
      await redis.set(cacheKey, JSON.stringify(tree), this.CACHE_TTL);

      logger.info('Department hierarchy built', {
        organizationId,
        departmentCount: departments.length,
        positionCount: positions.length,
      });

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
   * Get position reporting hierarchy as a tree
   */
  async getPositionHierarchy(
    organizationId: string,
    rootPositionId?: string
  ): Promise<PositionHierarchyNode[]> {
    try {
      const cacheKey = rootPositionId
        ? `ar:org:${organizationId}:pos-hierarchy:${rootPositionId}`
        : `ar:org:${organizationId}:pos-hierarchy:all`;

      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Position hierarchy cache hit', { organizationId, rootPositionId });
        return JSON.parse(cached);
      }

      // Fetch positions
      const positions = await prisma.agentPosition.findMany({
        where: { organizationId },
        include: {
          assignments: {
            where: { status: 'active' },
          },
        },
        orderBy: [{ level: 'desc' }, { title: 'asc' }],
      });

      // Build hierarchy tree
      const tree = rootPositionId
        ? this.buildPositionTree(positions, rootPositionId)
        : this.buildPositionTree(positions);

      // Cache the result
      await redis.set(cacheKey, JSON.stringify(tree), this.CACHE_TTL);

      logger.info('Position hierarchy built', {
        organizationId,
        rootPositionId,
        positionCount: positions.length,
      });

      return tree;
    } catch (error) {
      logger.error(
        'Failed to get position hierarchy',
        { organizationId, rootPositionId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get complete org chart data
   */
  async getOrgChart(organizationId: string): Promise<OrgChartData> {
    try {
      const cacheKey = `ar:org:${organizationId}:org-chart`;

      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Org chart cache hit', { organizationId });
        return JSON.parse(cached);
      }

      // Get department hierarchy (includes positions)
      const departments = await this.getDepartmentHierarchy(organizationId);

      // Count assignments
      const assignmentCount = await prisma.agentAssignment.count({
        where: {
          organizationId,
          status: 'active',
        },
      });

      // Calculate max depth
      const maxDepth = this.calculateMaxDepth(departments);

      // Count totals
      const totalDepartments = await prisma.agentDepartment.count({
        where: { organizationId },
      });

      const totalPositions = await prisma.agentPosition.count({
        where: { organizationId },
      });

      const orgChart: OrgChartData = {
        departments,
        totalDepartments,
        totalPositions,
        totalAssignments: assignmentCount,
        maxDepth,
      };

      // Cache the result
      await redis.set(cacheKey, JSON.stringify(orgChart), this.CACHE_TTL);

      logger.info('Org chart built', {
        organizationId,
        totalDepartments,
        totalPositions,
        totalAssignments: assignmentCount,
        maxDepth,
      });

      return orgChart;
    } catch (error) {
      logger.error('Failed to get org chart', { organizationId }, error as Error);
      throw error;
    }
  }

  // ===========================================================================
  // Ancestry and Descendants
  // ===========================================================================

  /**
   * Find all ancestors of a department (path to root)
   */
  async getDepartmentAncestors(departmentId: string): Promise<AgentDepartment[]> {
    try {
      const ancestors: AgentDepartment[] = [];
      let currentId: string | null = departmentId;
      const visited = new Set<string>();

      while (currentId && ancestors.length < this.MAX_DEPTH) {
        // Prevent cycles
        if (visited.has(currentId)) {
          logger.error('Circular reference detected in department hierarchy', {
            departmentId,
            currentId,
            ancestors: ancestors.map(a => a.id),
          });
          break;
        }
        visited.add(currentId);

        const dept: any = await prisma.agentDepartment.findUnique({
          where: { id: currentId },
        });

        if (!dept) break;

        // Don't include the starting department
        if (dept.id !== departmentId) {
          ancestors.push(dept);
        }

        currentId = dept.parentId;
      }

      logger.debug('Department ancestors retrieved', {
        departmentId,
        ancestorCount: ancestors.length,
      });

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
   * Find all descendants of a department (recursive)
   */
  async getDepartmentDescendants(departmentId: string): Promise<AgentDepartment[]> {
    try {
      const descendants: AgentDepartment[] = [];
      const visited = new Set<string>();

      const collectDescendants = async (id: string) => {
        if (visited.has(id) || visited.size > this.MAX_DEPTH) {
          return;
        }
        visited.add(id);

        const children = await prisma.agentDepartment.findMany({
          where: { parentId: id },
        });

        for (const child of children) {
          descendants.push(child);
          await collectDescendants(child.id);
        }
      };

      await collectDescendants(departmentId);

      logger.debug('Department descendants retrieved', {
        departmentId,
        descendantCount: descendants.length,
      });

      return descendants;
    } catch (error) {
      logger.error(
        'Failed to get department descendants',
        { departmentId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get reporting chain for a position (up to CEO/top)
   */
  async getReportingChain(positionId: string): Promise<AgentPosition[]> {
    try {
      const chain: AgentPosition[] = [];
      let currentId: string | null = positionId;
      const visited = new Set<string>();

      while (currentId && chain.length < this.MAX_DEPTH) {
        // Prevent cycles
        if (visited.has(currentId)) {
          logger.error('Circular reference detected in reporting chain', {
            positionId,
            currentId,
            chain: chain.map(p => p.id),
          });
          break;
        }
        visited.add(currentId);

        const position: any = await prisma.agentPosition.findUnique({
          where: { id: currentId },
        });

        if (!position) break;

        chain.push(position);
        currentId = position.reportsToId;
      }

      logger.debug('Reporting chain retrieved', {
        positionId,
        chainLength: chain.length,
      });

      return chain;
    } catch (error) {
      logger.error(
        'Failed to get reporting chain',
        { positionId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get all subordinates (direct and indirect) of a position
   */
  async getAllSubordinates(positionId: string): Promise<AgentPosition[]> {
    try {
      const subordinates: AgentPosition[] = [];
      const visited = new Set<string>();

      const collectSubordinates = async (id: string) => {
        if (visited.has(id) || visited.size > this.MAX_DEPTH) {
          return;
        }
        visited.add(id);

        const reports = await prisma.agentPosition.findMany({
          where: { reportsToId: id },
        });

        for (const report of reports) {
          subordinates.push(report);
          await collectSubordinates(report.id);
        }
      };

      await collectSubordinates(positionId);

      logger.debug('Subordinates retrieved', {
        positionId,
        subordinateCount: subordinates.length,
      });

      return subordinates;
    } catch (error) {
      logger.error(
        'Failed to get subordinates',
        { positionId },
        error as Error
      );
      throw error;
    }
  }

  // ===========================================================================
  // Validation
  // ===========================================================================

  /**
   * Validate that moving a department won't create cycles
   */
  async validateDepartmentMove(
    departmentId: string,
    newParentId: string | null
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Moving to root is always valid
      if (newParentId === null) {
        return { valid: true };
      }

      // Cannot be its own parent
      if (departmentId === newParentId) {
        return {
          valid: false,
          reason: 'A department cannot be its own parent',
        };
      }

      // Check if department exists
      const department = await prisma.agentDepartment.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        return {
          valid: false,
          reason: 'Department not found',
        };
      }

      // Check if new parent exists and is in same organization
      const newParent = await prisma.agentDepartment.findUnique({
        where: { id: newParentId },
      });

      if (!newParent) {
        return {
          valid: false,
          reason: 'New parent department not found',
        };
      }

      if (newParent.organizationId !== department.organizationId) {
        return {
          valid: false,
          reason: 'Cannot move department to different organization',
        };
      }

      // Check if new parent is a descendant of the department (would create cycle)
      const descendants = await this.getDepartmentDescendants(departmentId);
      const isDescendant = descendants.some(d => d.id === newParentId);

      if (isDescendant) {
        return {
          valid: false,
          reason: 'Cannot move department under one of its descendants (would create cycle)',
        };
      }

      // Audit log
      await auditLogger.log({
        action: 'ar.department.moved',
        organizationId: department.organizationId,
        resourceType: 'agent_department',
        resourceId: departmentId,
        details: {
          departmentId,
          newParentId,
          valid: true,
        },
        success: true,
      });

      return { valid: true };
    } catch (error) {
      logger.error(
        'Failed to validate department move',
        { departmentId, newParentId },
        error as Error
      );
      return {
        valid: false,
        reason: 'Validation failed due to error',
      };
    }
  }

  /**
   * Validate that changing reporting line won't create cycles
   */
  async validateReportingChange(
    positionId: string,
    newReportsToId: string | null
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Reporting to no one (CEO/top position) is always valid
      if (newReportsToId === null) {
        return { valid: true };
      }

      // Cannot report to itself
      if (positionId === newReportsToId) {
        return {
          valid: false,
          reason: 'A position cannot report to itself',
        };
      }

      // Check if position exists
      const position = await prisma.agentPosition.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        return {
          valid: false,
          reason: 'Position not found',
        };
      }

      // Check if new reports-to exists and is in same organization
      const newReportsTo = await prisma.agentPosition.findUnique({
        where: { id: newReportsToId },
      });

      if (!newReportsTo) {
        return {
          valid: false,
          reason: 'New reports-to position not found',
        };
      }

      if (newReportsTo.organizationId !== position.organizationId) {
        return {
          valid: false,
          reason: 'Cannot change reporting line to different organization',
        };
      }

      // Check if new reports-to is a subordinate of the position (would create cycle)
      const subordinates = await this.getAllSubordinates(positionId);
      const isSubordinate = subordinates.some(s => s.id === newReportsToId);

      if (isSubordinate) {
        return {
          valid: false,
          reason: 'Cannot report to one of your subordinates (would create cycle)',
        };
      }

      // Audit log
      await auditLogger.log({
        action: 'admin.action',
        organizationId: position.organizationId,
        resourceType: 'agent_position',
        resourceId: positionId,
        details: {
          positionId,
          newReportsToId,
          valid: true,
          validationType: 'reporting_change_validated',
        },
        success: true,
      });

      return { valid: true };
    } catch (error) {
      logger.error(
        'Failed to validate reporting change',
        { positionId, newReportsToId },
        error as Error
      );
      return {
        valid: false,
        reason: 'Validation failed due to error',
      };
    }
  }

  /**
   * Calculate depth of a node in hierarchy
   */
  async calculateDepth(
    type: 'department' | 'position',
    id: string
  ): Promise<number> {
    try {
      let depth = 0;
      const visited = new Set<string>();

      if (type === 'department') {
        const ancestors = await this.getDepartmentAncestors(id);
        depth = ancestors.length;
      } else {
        let currentId: string | null = id;

        while (currentId && depth < this.MAX_DEPTH) {
          if (visited.has(currentId)) break;
          visited.add(currentId);

          const position: any = await prisma.agentPosition.findUnique({
            where: { id: currentId },
          });

          if (!position || !position.reportsToId) break;

          depth++;
          currentId = position.reportsToId;
        }
      }

      logger.debug('Depth calculated', { type, id, depth });

      return depth;
    } catch (error) {
      logger.error('Failed to calculate depth', { type, id }, error as Error);
      return 0;
    }
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate hierarchy cache for an organization
   */
  async invalidateCache(organizationId: string): Promise<void> {
    try {
      const keys = [
        `ar:org:${organizationId}:dept-hierarchy`,
        `ar:org:${organizationId}:pos-hierarchy:all`,
        `ar:org:${organizationId}:org-chart`,
      ];

      for (const key of keys) {
        await redis.del(key);
      }

      logger.debug('Hierarchy cache invalidated', { organizationId });
    } catch (error) {
      logger.error(
        'Failed to invalidate cache',
        { organizationId },
        error as Error
      );
      // Don't throw - cache invalidation is not critical
    }
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Build department hierarchy tree from flat list
   */
  private buildDepartmentTree(
    departments: AgentDepartment[],
    positions: AgentPosition[],
    parentId: string | null = null,
    depth: number = 0
  ): DepartmentHierarchyNode[] {
    if (depth > this.MAX_DEPTH) {
      logger.warn('Max depth reached in department tree', { depth, parentId });
      return [];
    }

    const children = departments.filter(d => d.parentId === parentId);

    return children.map(dept => ({
      department: dept,
      positions: positions.filter(p => p.departmentId === dept.id),
      depth,
      children: this.buildDepartmentTree(departments, positions, dept.id, depth + 1),
    }));
  }

  /**
   * Build position hierarchy tree from flat list
   */
  private buildPositionTree(
    positions: (AgentPosition & { assignments: AgentAssignment[] })[],
    rootId: string | null = null,
    depth: number = 0
  ): PositionHierarchyNode[] {
    if (depth > this.MAX_DEPTH) {
      logger.warn('Max depth reached in position tree', { depth, rootId });
      return [];
    }

    const children = positions.filter(p => p.reportsToId === rootId);

    return children.map(pos => ({
      position: pos,
      assignments: pos.assignments,
      depth,
      directReports: this.buildPositionTree(positions, pos.id, depth + 1),
    }));
  }

  /**
   * Calculate maximum depth in department tree
   */
  private calculateMaxDepth(nodes: DepartmentHierarchyNode[]): number {
    let maxDepth = 0;

    const traverse = (node: DepartmentHierarchyNode) => {
      maxDepth = Math.max(maxDepth, node.depth);
      node.children.forEach(traverse);
    };

    nodes.forEach(traverse);

    return maxDepth;
  }
}

// Export singleton instance
export const arHierarchyService = new ARHierarchyService();
