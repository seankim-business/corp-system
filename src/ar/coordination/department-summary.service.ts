/**
 * Department Summary Service
 *
 * Aggregates daily metrics across department agents and identifies critical blockers.
 * Provides department-level insights for resource allocation and priority optimization.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface DepartmentDailySummary {
  id: string;
  organizationId: string;
  departmentId: string;
  reportDate: Date;
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  avgGoalAlignment: number | null;
  totalCostCents: number;
  criticalBlockers: Array<{
    type: string;
    severity: 'high' | 'critical';
    affectedAgents: string[];
    description: string;
    recommendedAction: string;
  }>;
  resourceShortages: Array<{
    resourceType: string;
    deficit: number;
    impactedTasks: string[];
  }>;
  analysisText: string | null;
  priorityActions: Array<{
    action: string;
    priority: number;
    deadline: Date | null;
  }>;
  metadata: Record<string, any>;
}

export interface DepartmentMetrics {
  departmentId: string;
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  avgGoalAlignment: number | null;
  totalTokensConsumed: number;
  totalCostCents: number;
  capacityUtilization: number;
}

export interface Blocker {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedAgents: string[];
  affectedTasks: string[];
  detectedAt: Date;
  recommendedAction: string;
}

export class DepartmentSummaryService {
  /**
   * Generate daily summary for a department
   */
  async generateSummary(departmentId: string, date: Date): Promise<DepartmentDailySummary> {
    logger.info("Generating department summary", { departmentId, date });

    const department = await prisma.agentDepartment.findUnique({
      where: { id: departmentId },
      include: {
        positions: {
          include: {
            assignments: {
              where: { status: 'active' },
              include: { agent: true }
            }
          }
        }
      }
    });

    if (!department) {
      throw new Error(`Department not found: ${departmentId}`);
    }

    // Aggregate metrics
    const metrics = await this.aggregateMetrics(departmentId, date);

    // Identify critical blockers
    const criticalBlockers = await this.identifyCriticalBlockers(departmentId);

    // Detect resource shortages
    const resourceShortages = await this.detectResourceShortages(departmentId, date);

    // Generate AI analysis
    const analysisText = this.generateAnalysisText(metrics, criticalBlockers);

    // Generate priority actions
    const priorityActions = this.generatePriorityActions(metrics, criticalBlockers, resourceShortages);

    // Create or update summary
    const summary = await prisma.departmentDailySummary.upsert({
      where: {
        organizationId_departmentId_reportDate: {
          organizationId: department.organizationId,
          departmentId,
          reportDate: new Date(date.toISOString().split('T')[0])
        }
      },
      create: {
        organizationId: department.organizationId,
        departmentId,
        reportDate: new Date(date.toISOString().split('T')[0]),
        totalAgents: metrics.totalAgents,
        activeAgents: metrics.activeAgents,
        totalTasks: metrics.totalTasks,
        completedTasks: metrics.completedTasks,
        avgGoalAlignment: metrics.avgGoalAlignment,
        totalCostCents: metrics.totalCostCents,
        criticalBlockers: criticalBlockers as any,
        resourceShortages: resourceShortages as any,
        analysisText,
        priorityActions: priorityActions as any
      },
      update: {
        totalAgents: metrics.totalAgents,
        activeAgents: metrics.activeAgents,
        totalTasks: metrics.totalTasks,
        completedTasks: metrics.completedTasks,
        avgGoalAlignment: metrics.avgGoalAlignment,
        totalCostCents: metrics.totalCostCents,
        criticalBlockers: criticalBlockers as any,
        resourceShortages: resourceShortages as any,
        analysisText,
        priorityActions: priorityActions as any
      }
    });

    logger.info("Department summary generated", { departmentId, reportDate: date, summaryId: summary.id });

    return this.mapToDepartmentDailySummary(summary);
  }

  /**
   * Generate summaries for all departments in an organization
   */
  async generateAllSummaries(
    organizationId: string,
    date: Date
  ): Promise<DepartmentDailySummary[]> {
    logger.info("Generating all department summaries", { organizationId, date });

    const departments = await prisma.agentDepartment.findMany({
      where: {
        organizationId,
        status: 'active'
      }
    });

    const summaries: DepartmentDailySummary[] = [];

    for (const dept of departments) {
      try {
        const summary = await this.generateSummary(dept.id, date);
        summaries.push(summary);
      } catch (error) {
        logger.error("Failed to generate summary for department", { departmentId: dept.id, error });
      }
    }

    logger.info("All department summaries generated", {
      organizationId,
      date,
      totalSummaries: summaries.length
    });

    return summaries;
  }

  /**
   * Aggregate metrics for a department on a specific date
   */
  async aggregateMetrics(departmentId: string, date: Date): Promise<DepartmentMetrics> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get department positions and assignments
    const positions = await prisma.agentPosition.findMany({
      where: { departmentId },
      include: {
        assignments: {
          where: { status: 'active' },
          include: { agent: true }
        }
      }
    });

    const agentIds = positions.flatMap(p => p.assignments.map(a => a.agentId));
    const totalAgents = agentIds.length;
    const activeAgents = agentIds.length; // All in active assignments

    // Get daily reports for all agents
    const reports = await prisma.agentDailyReport.findMany({
      where: {
        agentId: { in: agentIds },
        reportDate: new Date(date.toISOString().split('T')[0])
      }
    });

    const totalTasks = reports.reduce((sum, r) =>
      sum + r.tasksCompleted + r.tasksInProgress + r.tasksBlocked, 0
    );
    const completedTasks = reports.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const inProgressTasks = reports.reduce((sum, r) => sum + r.tasksInProgress, 0);
    const blockedTasks = reports.reduce((sum, r) => sum + r.tasksBlocked, 0);

    const avgGoalAlignment = reports.length > 0
      ? reports
          .filter(r => r.goalAlignmentScore !== null)
          .reduce((sum, r) => sum + (r.goalAlignmentScore || 0), 0) / reports.length
      : null;

    const totalTokensConsumed = reports.reduce((sum, r) => sum + r.tokensConsumed, 0);

    // Estimate cost (example: $0.01 per 1000 tokens for Sonnet)
    const totalCostCents = Math.round(totalTokensConsumed / 1000);

    // Calculate capacity utilization
    const capacityUtilization = totalAgents > 0
      ? (inProgressTasks + completedTasks) / (totalAgents * 10) // Assuming max 10 tasks per agent
      : 0;

    return {
      departmentId,
      totalAgents,
      activeAgents,
      totalTasks,
      completedTasks,
      inProgressTasks,
      blockedTasks,
      avgGoalAlignment,
      totalTokensConsumed,
      totalCostCents,
      capacityUtilization: Math.min(capacityUtilization, 1.0)
    };
  }

  /**
   * Identify critical blockers affecting the department
   */
  async identifyCriticalBlockers(departmentId: string): Promise<Blocker[]> {
    const positions = await prisma.agentPosition.findMany({
      where: { departmentId },
      include: {
        assignments: {
          where: { status: 'active' },
          include: { agent: true }
        }
      }
    });

    const agentIds = positions.flatMap(p => p.assignments.map(a => a.agentId));

    // Get recent reports
    const recentReports = await prisma.agentDailyReport.findMany({
      where: {
        agentId: { in: agentIds },
        reportDate: {
          gte: new Date(new Date().setDate(new Date().getDate() - 7))
        }
      }
    });

    const blockers: Blocker[] = [];

    // Aggregate blockers from agent reports
    const blockerMap = new Map<string, {
      count: number;
      affectedAgents: Set<string>;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }>();

    for (const report of recentReports) {
      const reportBlockers = report.blockers as any[];
      for (const blocker of reportBlockers || []) {
        const key = blocker.description;
        const existing = blockerMap.get(key) || {
          count: 0,
          affectedAgents: new Set<string>(),
          severity: blocker.severity,
          description: blocker.description
        };
        existing.count++;
        existing.affectedAgents.add(report.agentId);
        blockerMap.set(key, existing);
      }
    }

    // Convert to blocker array (only critical/high)
    for (const [description, data] of blockerMap.entries()) {
      if (data.severity === 'critical' || data.severity === 'high') {
        blockers.push({
          id: `blocker-${Date.now()}-${Math.random()}`,
          type: 'department',
          severity: data.severity,
          description,
          affectedAgents: Array.from(data.affectedAgents),
          affectedTasks: [],
          detectedAt: new Date(),
          recommendedAction: 'Review department resource allocation and task priorities'
        });
      }
    }

    return blockers;
  }

  /**
   * Detect resource shortages in the department
   */
  private async detectResourceShortages(departmentId: string, date: Date): Promise<Array<{
    resourceType: string;
    deficit: number;
    impactedTasks: string[];
  }>> {
    const shortages: any[] = [];

    // Get capacity data
    const agentIds = (await prisma.agentAssignment.findMany({
      where: {
        position: { departmentId },
        status: 'active'
      },
      select: { agentId: true }
    })).map((a: { agentId: string }) => a.agentId);

    const capacities = await prisma.agentCapacity.findMany({
      where: {
        date: new Date(date.toISOString().split('T')[0]),
        agentId: { in: agentIds }
      }
    });

    // Check token shortage
    const totalMaxTokens = capacities.reduce((sum, c) => sum + c.maxTokens, 0);
    const totalUsedTokens = capacities.reduce((sum, c) => sum + c.usedTokens, 0);
    if (totalUsedTokens > totalMaxTokens * 0.9) {
      shortages.push({
        resourceType: 'tokens',
        deficit: totalUsedTokens - totalMaxTokens,
        impactedTasks: []
      });
    }

    // Check task capacity shortage
    const totalMaxTasks = capacities.reduce((sum, c) => sum + c.maxTasks, 0);
    const totalCurrentTasks = capacities.reduce((sum, c) => sum + c.currentTasks, 0);
    if (totalCurrentTasks > totalMaxTasks * 0.9) {
      shortages.push({
        resourceType: 'task_capacity',
        deficit: totalCurrentTasks - totalMaxTasks,
        impactedTasks: []
      });
    }

    return shortages;
  }

  /**
   * Generate AI analysis text
   */
  private generateAnalysisText(metrics: DepartmentMetrics, blockers: Blocker[]): string {
    const completionRate = metrics.totalTasks > 0
      ? (metrics.completedTasks / metrics.totalTasks * 100).toFixed(1)
      : '0.0';

    let analysis = `Department completed ${metrics.completedTasks} of ${metrics.totalTasks} tasks (${completionRate}%). `;

    if (metrics.avgGoalAlignment !== null) {
      analysis += `Average goal alignment is ${metrics.avgGoalAlignment.toFixed(1)}%. `;
    }

    if (blockers.length > 0) {
      analysis += `${blockers.length} critical blocker(s) detected affecting ${new Set(blockers.flatMap(b => b.affectedAgents)).size} agent(s). `;
    }

    if (metrics.capacityUtilization > 0.9) {
      analysis += 'Department is operating at high capacity. ';
    } else if (metrics.capacityUtilization < 0.5) {
      analysis += 'Department has available capacity for additional tasks. ';
    }

    return analysis;
  }

  /**
   * Generate priority actions
   */
  private generatePriorityActions(
    metrics: DepartmentMetrics,
    blockers: Blocker[],
    shortages: any[]
  ): Array<{ action: string; priority: number; deadline: Date | null }> {
    const actions: any[] = [];

    // Address critical blockers
    if (blockers.length > 0) {
      actions.push({
        action: `Resolve ${blockers.length} critical blocker(s)`,
        priority: 1,
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });
    }

    // Address resource shortages
    for (const shortage of shortages) {
      actions.push({
        action: `Allocate additional ${shortage.resourceType}`,
        priority: 2,
        deadline: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
      });
    }

    // Address low goal alignment
    if (metrics.avgGoalAlignment !== null && metrics.avgGoalAlignment < 60) {
      actions.push({
        action: 'Review and realign agent tasks with organizational goals',
        priority: 3,
        deadline: null
      });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Map database record to DepartmentDailySummary interface
   */
  private mapToDepartmentDailySummary(record: any): DepartmentDailySummary {
    return {
      id: record.id,
      organizationId: record.organizationId,
      departmentId: record.departmentId,
      reportDate: record.reportDate,
      totalAgents: record.totalAgents,
      activeAgents: record.activeAgents,
      totalTasks: record.totalTasks,
      completedTasks: record.completedTasks,
      avgGoalAlignment: record.avgGoalAlignment,
      totalCostCents: record.totalCostCents,
      criticalBlockers: record.criticalBlockers as any,
      resourceShortages: record.resourceShortages as any,
      analysisText: record.analysisText,
      priorityActions: record.priorityActions as any,
      metadata: record.metadata as any
    };
  }
}
