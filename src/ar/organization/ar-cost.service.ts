/**
 * AR Cost Service
 *
 * Tracks and analyzes costs for the Agent Resource (AR) system.
 * Provides cost recording, budget tracking, trend analysis, and cost summaries
 * across agents, departments, and the entire organization.
 */

import { db as prisma } from '../../db/client';
import { logger } from '../../utils/logger';
import { auditLogger } from '../../services/audit-logger';
import type { ARCostEntry } from '@prisma/client';
import {
  ARNotFoundError,
  ARValidationError,
} from '../errors';

// =============================================================================
// Types
// =============================================================================

export type CostType = 'token' | 'api_call' | 'compute';

export interface CostSummary {
  totalCents: number;
  totalTokens: number;
  byType: Record<CostType, number>;
  byModel: Record<string, number>;
  period: { start: Date; end: Date };
}

export interface CostTrend {
  date: Date;
  totalCents: number;
  tokenCount: number;
}

export interface BudgetStatus {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  projectedOverage?: number;
}

export interface RecordCostInput {
  organizationId: string;
  agentId?: string;
  departmentId?: string;
  costType: CostType;
  amountCents: number;
  tokenCount?: number;
  modelUsed?: string;
  taskReference?: string;
  description?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// =============================================================================
// AR Cost Service
// =============================================================================

export class ARCostService {
  /**
   * Record a cost entry
   */
  async recordCost(data: RecordCostInput): Promise<ARCostEntry> {
    try {
      if (data.amountCents < 0) {
        throw new ARValidationError('Cost amount cannot be negative', {
          amountCents: data.amountCents,
        });
      }

      if (data.tokenCount !== undefined && data.tokenCount < 0) {
        throw new ARValidationError('Token count cannot be negative', {
          tokenCount: data.tokenCount,
        });
      }

      // Validate agent exists if specified
      if (data.agentId) {
        const agent = await prisma.agent.findUnique({
          where: { id: data.agentId },
        });

        if (!agent || agent.organizationId !== data.organizationId) {
          throw new ARValidationError('Agent not found or belongs to different organization', {
            agentId: data.agentId,
          });
        }
      }

      // Validate department exists if specified
      if (data.departmentId) {
        const department = await prisma.agentDepartment.findUnique({
          where: { id: data.departmentId },
        });

        if (!department || department.organizationId !== data.organizationId) {
          throw new ARValidationError('Department not found or belongs to different organization', {
            departmentId: data.departmentId,
          });
        }
      }

      // Create cost entry
      const costEntry = await prisma.aRCostEntry.create({
        data: {
          organizationId: data.organizationId,
          agentId: data.agentId,
          departmentId: data.departmentId,
          costType: data.costType,
          amountCents: data.amountCents,
          tokenCount: data.tokenCount,
          modelUsed: data.modelUsed,
          taskReference: data.taskReference,
          description: data.description,
        },
      });

      // Update organization spending if budget tracking is enabled
      const organization = await prisma.organization.findUnique({
        where: { id: data.organizationId },
      });

      if (organization?.monthlyBudgetCents) {
        await prisma.organization.update({
          where: { id: data.organizationId },
          data: {
            currentMonthSpendCents: {
              increment: data.amountCents,
            },
          },
        });
      }

      // Audit log
      await auditLogger.log({
        action: 'ar.cost.recorded',
        organizationId: data.organizationId,
        resourceType: 'ar_cost_entry',
        resourceId: costEntry.id,
        details: {
          costType: data.costType,
          amountCents: data.amountCents,
          agentId: data.agentId,
          departmentId: data.departmentId,
        },
        success: true,
      });

      logger.info('Cost recorded', {
        organizationId: data.organizationId,
        costEntryId: costEntry.id,
        amountCents: data.amountCents,
        costType: data.costType,
      });

      return costEntry;
    } catch (error) {
      logger.error('Failed to record cost', { data }, error as Error);
      throw error;
    }
  }

  /**
   * Get costs for an agent
   */
  async getAgentCosts(agentId: string, dateRange: DateRange): Promise<CostSummary> {
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!agent) {
        throw new ARNotFoundError('Agent', agentId);
      }

      const entries = await prisma.aRCostEntry.findMany({
        where: {
          agentId,
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      return this.aggregateCosts(entries, dateRange);
    } catch (error) {
      logger.error('Failed to get agent costs', { agentId, dateRange }, error as Error);
      throw error;
    }
  }

  /**
   * Get costs for a department (including sub-departments)
   */
  async getDepartmentCosts(
    departmentId: string,
    dateRange: DateRange,
    includeSubDepartments: boolean = true
  ): Promise<CostSummary> {
    try {
      const department = await prisma.agentDepartment.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        throw new ARNotFoundError('Department', departmentId);
      }

      let departmentIds = [departmentId];

      // Get all sub-departments recursively if requested
      if (includeSubDepartments) {
        departmentIds = await this.getAllSubDepartmentIds(departmentId);
      }

      const entries = await prisma.aRCostEntry.findMany({
        where: {
          departmentId: {
            in: departmentIds,
          },
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      return this.aggregateCosts(entries, dateRange);
    } catch (error) {
      logger.error(
        'Failed to get department costs',
        { departmentId, dateRange, includeSubDepartments },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get organization-wide costs
   */
  async getOrganizationCosts(
    organizationId: string,
    dateRange: DateRange
  ): Promise<CostSummary> {
    try {
      const entries = await prisma.aRCostEntry.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      return this.aggregateCosts(entries, dateRange);
    } catch (error) {
      logger.error(
        'Failed to get organization costs',
        { organizationId, dateRange },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get cost trends over time
   */
  async getCostTrends(
    organizationId: string,
    dateRange: DateRange,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<CostTrend[]> {
    try {
      // Determine the SQL date truncation function based on granularity
      const truncateFunction =
        granularity === 'day'
          ? 'DATE_TRUNC(\'day\', created_at)'
          : granularity === 'week'
          ? 'DATE_TRUNC(\'week\', created_at)'
          : 'DATE_TRUNC(\'month\', created_at)';

      // Use raw query for efficient aggregation
      const results = await prisma.$queryRaw<
        Array<{ date: Date; totalCents: bigint; tokenCount: bigint }>
      >`
        SELECT
          ${truncateFunction} as date,
          CAST(SUM(amount_cents) AS BIGINT) as "totalCents",
          CAST(SUM(COALESCE(token_count, 0)) AS BIGINT) as "tokenCount"
        FROM ar_cost_entries
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${dateRange.start}
          AND created_at <= ${dateRange.end}
        GROUP BY ${truncateFunction}
        ORDER BY date ASC
      `;

      return results.map((row) => ({
        date: row.date,
        totalCents: Number(row.totalCents),
        tokenCount: Number(row.tokenCount),
      }));
    } catch (error) {
      logger.error(
        'Failed to get cost trends',
        { organizationId, dateRange, granularity },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get budget status for a department
   */
  async getBudgetStatus(departmentId: string): Promise<BudgetStatus> {
    try {
      const department = await prisma.agentDepartment.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        throw new ARNotFoundError('Department', departmentId);
      }

      if (!department.budgetCents) {
        throw new ARValidationError('Department does not have a budget configured', {
          departmentId,
        });
      }

      // Get current month's spending
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const costSummary = await this.getDepartmentCosts(
        departmentId,
        { start: startOfMonth, end: endOfMonth },
        true
      );

      const budgetCents = department.budgetCents;
      const spentCents = costSummary.totalCents;
      const remainingCents = budgetCents - spentCents;
      const percentUsed = (spentCents / budgetCents) * 100;

      // Calculate projected overage if spending rate continues
      const daysInMonth = endOfMonth.getDate();
      const daysPassed = now.getDate();
      const daysRemaining = daysInMonth - daysPassed;

      let projectedOverage: number | undefined;
      if (daysRemaining > 0 && daysPassed > 0) {
        const dailyRate = spentCents / daysPassed;
        const projectedTotal = spentCents + dailyRate * daysRemaining;
        if (projectedTotal > budgetCents) {
          projectedOverage = projectedTotal - budgetCents;
        }
      }

      return {
        budgetCents,
        spentCents,
        remainingCents,
        percentUsed,
        projectedOverage,
      };
    } catch (error) {
      logger.error('Failed to get budget status', { departmentId }, error as Error);
      throw error;
    }
  }

  /**
   * Check if an action would exceed budget
   */
  async checkBudget(
    departmentId: string,
    estimatedCostCents: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const budgetStatus = await this.getBudgetStatus(departmentId);

      if (budgetStatus.remainingCents >= estimatedCostCents) {
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: `Insufficient budget. Required: ${estimatedCostCents} cents, Available: ${budgetStatus.remainingCents} cents`,
      };
    } catch (error) {
      logger.error(
        'Failed to check budget',
        { departmentId, estimatedCostCents },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get top cost consumers
   */
  async getTopCostConsumers(
    organizationId: string,
    dateRange: DateRange,
    limit: number = 10
  ): Promise<Array<{ agentId: string; totalCents: number }>> {
    try {
      const results = await prisma.$queryRaw<
        Array<{ agent_id: string; total_cents: bigint }>
      >`
        SELECT
          agent_id,
          CAST(SUM(amount_cents) AS BIGINT) as total_cents
        FROM ar_cost_entries
        WHERE organization_id = ${organizationId}::uuid
          AND agent_id IS NOT NULL
          AND created_at >= ${dateRange.start}
          AND created_at <= ${dateRange.end}
        GROUP BY agent_id
        ORDER BY total_cents DESC
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        agentId: row.agent_id,
        totalCents: Number(row.total_cents),
      }));
    } catch (error) {
      logger.error(
        'Failed to get top cost consumers',
        { organizationId, dateRange, limit },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Calculate cost per task type
   */
  async getCostByTaskType(
    organizationId: string,
    dateRange: DateRange
  ): Promise<Record<string, CostSummary>> {
    try {
      const entries = await prisma.aRCostEntry.findMany({
        where: {
          organizationId,
          taskReference: { not: null },
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      // Group by task reference
      const groupedByTask: Record<string, ARCostEntry[]> = {};
      for (const entry of entries) {
        if (entry.taskReference) {
          if (!groupedByTask[entry.taskReference]) {
            groupedByTask[entry.taskReference] = [];
          }
          groupedByTask[entry.taskReference].push(entry);
        }
      }

      // Aggregate costs for each task type
      const result: Record<string, CostSummary> = {};
      for (const [taskType, taskEntries] of Object.entries(groupedByTask)) {
        result[taskType] = this.aggregateCosts(taskEntries, dateRange);
      }

      return result;
    } catch (error) {
      logger.error(
        'Failed to get cost by task type',
        { organizationId, dateRange },
        error as Error
      );
      throw error;
    }
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  /**
   * Aggregate cost entries into a summary
   */
  private aggregateCosts(entries: ARCostEntry[], dateRange: DateRange): CostSummary {
    const byType: Record<CostType, number> = {
      token: 0,
      api_call: 0,
      compute: 0,
    };

    const byModel: Record<string, number> = {};

    let totalCents = 0;
    let totalTokens = 0;

    for (const entry of entries) {
      totalCents += entry.amountCents;
      totalTokens += entry.tokenCount || 0;

      // Aggregate by cost type
      const costType = entry.costType as CostType;
      byType[costType] = (byType[costType] || 0) + entry.amountCents;

      // Aggregate by model
      if (entry.modelUsed) {
        byModel[entry.modelUsed] = (byModel[entry.modelUsed] || 0) + entry.amountCents;
      }
    }

    return {
      totalCents,
      totalTokens,
      byType,
      byModel,
      period: {
        start: dateRange.start,
        end: dateRange.end,
      },
    };
  }

  /**
   * Recursively get all sub-department IDs
   */
  private async getAllSubDepartmentIds(departmentId: string): Promise<string[]> {
    const allIds = [departmentId];
    const queue = [departmentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      const children = await prisma.agentDepartment.findMany({
        where: { parentId: currentId },
        select: { id: true },
      });

      for (const child of children) {
        allIds.push(child.id);
        queue.push(child.id);
      }
    }

    return allIds;
  }
}

// Export singleton instance
export const arCostService = new ARCostService();
