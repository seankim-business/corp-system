/**
 * Daily Report Service
 *
 * Generates and manages daily activity reports for agents.
 * Tracks task completion, token usage, goal alignment, and blockers.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface AgentDailyReport {
  id: string;
  organizationId: string;
  agentId: string;
  reportDate: Date;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tokensConsumed: number;
  avgResponseTime: number | null;
  goalAlignmentScore: number | null;
  contributedGoals: string[];
  blockers: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
  }>;
  challenges: Array<{
    description: string;
    category: string;
  }>;
  topTasks: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export class DailyReportService {
  /**
   * Generate a daily report for a specific agent
   */
  async generateAgentReport(agentId: string, date: Date): Promise<AgentDailyReport> {
    logger.info("Generating daily report for agent", { agentId, date });

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        arAssignments: {
          where: { status: 'active' },
          include: { position: true }
        }
      }
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get task metrics
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: agent.organizationId,
        OR: [
          { responsible: { has: agentId } },
          { accountable: { has: agentId } }
        ],
        updatedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const tasksCompleted = tasks.filter(t => t.status === '5_Done').length;
    const tasksInProgress = tasks.filter(t => t.status === '2_InProgress').length;
    const tasksBlocked = tasks.filter(t => t.status === '4_Blocked').length;

    // Get execution metrics
    const executions = await prisma.agentExecution.findMany({
      where: {
        agentId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const tokensConsumed = executions.reduce((sum, exec) => {
      return sum + (exec.metadata as any)?.tokensUsed || 0;
    }, 0);

    const completedExecutions = executions.filter(e => e.status === 'completed');
    const avgResponseTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.durationMs || 0), 0) / completedExecutions.length
      : null;

    // Get goal alignment score
    const alignmentRecords = await prisma.goalAlignmentRecord.findMany({
      where: {
        agentId,
        analysisDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const goalAlignmentScore = alignmentRecords.length > 0
      ? alignmentRecords.reduce((sum, r) => sum + r.alignmentScore, 0) / alignmentRecords.length
      : null;

    const contributedGoals = [...new Set(alignmentRecords.map(r => r.goalId))];

    // Detect blockers
    const blockers = this.detectBlockers(tasks, executions);

    // Detect challenges
    const challenges = this.detectChallenges(executions);

    // Create or update report
    const report = await prisma.agentDailyReport.upsert({
      where: {
        organizationId_agentId_reportDate: {
          organizationId: agent.organizationId,
          agentId,
          reportDate: new Date(date.toISOString().split('T')[0])
        }
      },
      create: {
        organizationId: agent.organizationId,
        agentId,
        reportDate: new Date(date.toISOString().split('T')[0]),
        tasksCompleted,
        tasksInProgress,
        tasksBlocked,
        tokensConsumed,
        avgResponseTime,
        goalAlignmentScore,
        contributedGoals,
        blockers: blockers as any,
        challenges: challenges as any,
        summaryText: null,
        recommendations: [] as any
      },
      update: {
        tasksCompleted,
        tasksInProgress,
        tasksBlocked,
        tokensConsumed,
        avgResponseTime,
        goalAlignmentScore,
        contributedGoals,
        blockers: blockers as any,
        challenges: challenges as any,
        summaryText: null,
        recommendations: [] as any
      }
    });

    logger.info("Daily report generated", { agentId, reportDate: date, reportId: report.id });

    return this.mapToAgentDailyReport(report);
  }

  /**
   * Generate daily reports for all agents in an organization
   */
  async generateAllAgentReports(
    organizationId: string,
    date: Date
  ): Promise<AgentDailyReport[]> {
    logger.info("Generating all agent reports", { organizationId, date });

    const agents = await prisma.agent.findMany({
      where: {
        organizationId,
        status: 'active'
      }
    });

    const reports: AgentDailyReport[] = [];

    for (const agent of agents) {
      try {
        const report = await this.generateAgentReport(agent.id, date);
        reports.push(report);
      } catch (error) {
        logger.error("Failed to generate report for agent", { agentId: agent.id, error });
      }
    }

    logger.info("All agent reports generated", {
      organizationId,
      date,
      totalReports: reports.length
    });

    return reports;
  }

  /**
   * Get an existing agent report
   */
  async getAgentReport(agentId: string, date: Date): Promise<AgentDailyReport | null> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return null;

    const report = await prisma.agentDailyReport.findFirst({
      where: {
        organizationId: agent.organizationId,
        agentId,
        reportDate: new Date(date.toISOString().split('T')[0])
      }
    });

    if (!report) {
      return null;
    }

    return this.mapToAgentDailyReport(report);
  }

  /**
   * Get report history for an agent within a date range
   */
  async getReportHistory(agentId: string, dateRange: DateRange): Promise<AgentDailyReport[]> {
    const reports = await prisma.agentDailyReport.findMany({
      where: {
        agentId,
        reportDate: {
          gte: dateRange.startDate,
          lte: dateRange.endDate
        }
      },
      orderBy: {
        reportDate: 'desc'
      }
    });

    return reports.map(r => this.mapToAgentDailyReport(r));
  }

  /**
   * Detect blockers from tasks and executions
   */
  private detectBlockers(tasks: any[], executions: any[]): Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
  }> {
    const blockers: any[] = [];

    // Detect blocked tasks
    const blockedTasks = tasks.filter(t => t.status === '4_Blocked');
    if (blockedTasks.length > 0) {
      blockers.push({
        description: `${blockedTasks.length} tasks are currently blocked`,
        severity: blockedTasks.length > 5 ? 'critical' : blockedTasks.length > 2 ? 'high' : 'medium',
        suggestedAction: 'Review blocked tasks and identify dependencies or resource needs'
      });
    }

    // Detect failed executions
    const failedExecutions = executions.filter(e => e.status === 'failed');
    if (failedExecutions.length > 3) {
      blockers.push({
        description: `${failedExecutions.length} failed executions today`,
        severity: failedExecutions.length > 10 ? 'critical' : 'high',
        suggestedAction: 'Review error logs and agent configuration'
      });
    }

    // Detect overdue tasks
    const overdueTasks = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) < new Date() && t.status !== '5_Done'
    );
    if (overdueTasks.length > 0) {
      blockers.push({
        description: `${overdueTasks.length} tasks are overdue`,
        severity: overdueTasks.length > 5 ? 'high' : 'medium',
        suggestedAction: 'Reprioritize task queue or allocate additional resources'
      });
    }

    return blockers;
  }

  /**
   * Detect challenges from execution patterns
   */
  private detectChallenges(executions: any[]): Array<{
    description: string;
    category: string;
  }> {
    const challenges: any[] = [];

    // Detect long execution times
    const longExecutions = executions.filter(e => (e.durationMs || 0) > 300000); // > 5 minutes
    if (longExecutions.length > 5) {
      challenges.push({
        description: 'Execution times are consistently long',
        category: 'performance'
      });
    }

    // Detect context switches
    const uniqueTasks = new Set(executions.map(e => e.taskDescription)).size;
    if (uniqueTasks > 15) {
      challenges.push({
        description: 'High number of context switches between tasks',
        category: 'focus'
      });
    }

    return challenges;
  }

  /**
   * Map database record to AgentDailyReport interface
   */
  private mapToAgentDailyReport(record: any): AgentDailyReport {
    return {
      id: record.id,
      organizationId: record.organizationId,
      agentId: record.agentId,
      reportDate: record.reportDate,
      tasksCompleted: record.tasksCompleted,
      tasksInProgress: record.tasksInProgress,
      tasksBlocked: record.tasksBlocked,
      tokensConsumed: record.tokensConsumed,
      avgResponseTime: record.avgResponseTime,
      goalAlignmentScore: record.goalAlignmentScore,
      contributedGoals: record.contributedGoals,
      blockers: record.blockers as any,
      challenges: record.challenges as any,
      topTasks: record.topTasks,
      metadata: record.metadata as any,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}
