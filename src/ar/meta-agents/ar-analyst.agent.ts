/**
 * AR Analyst Meta-Agent
 *
 * Analyzes AR performance data, generates insights, identifies trends,
 * and produces analytical reports for strategic decision-making.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export interface PerformanceTrend {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'improving' | 'declining' | 'stable';
  significance: 'low' | 'medium' | 'high';
}

export interface DepartmentAnalysis {
  departmentId: string;
  departmentName: string;
  metrics: {
    agentCount: number;
    avgWorkload: number;
    avgPerformance: number | null;
    taskCompletion: number;
    costEfficiency: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface AgentPerformanceAnalysis {
  agentId: string;
  agentName: string;
  positionTitle: string;
  metrics: {
    workload: number;
    performanceScore: number | null;
    tasksCompleted: number;
    tasksOverdue: number;
    avgTaskDuration: number | null;
  };
  ranking: {
    overall: number;
    inDepartment: number;
    byWorkload: number;
  };
  trend: 'improving' | 'declining' | 'stable';
  insights: string[];
}

export interface AnalyticsReport {
  organizationId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  executiveSummary: {
    healthScore: number;
    keyFindings: string[];
    topRecommendations: string[];
  };
  trends: PerformanceTrend[];
  departmentAnalysis: DepartmentAnalysis[];
  topPerformers: AgentPerformanceAnalysis[];
  needsAttention: AgentPerformanceAnalysis[];
  costAnalysis: {
    totalCostCents: number;
    costByDepartment: Record<string, number>;
    costTrend: number;
    projectedMonthlyCostCents: number;
  };
}

// =============================================================================
// SERVICE
// =============================================================================

export class ARAnalystAgent {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateAnalyticsReport(
    periodDays: number = 30
  ): Promise<AnalyticsReport> {
    logger.info("AR Analyst: Generating analytics report", {
      organizationId: this.organizationId,
      periodDays,
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Gather all analysis data in parallel
    const [
      trends,
      departmentAnalysis,
      agentAnalysis,
      costAnalysis,
    ] = await Promise.all([
      this.analyzePerformanceTrends(periodStart, now),
      this.analyzeDepartments(),
      this.analyzeAgents(periodStart, now),
      this.analyzeCosts(periodStart, now),
    ]);

    // Sort agents for rankings
    const sortedAgents = [...agentAnalysis].sort((a, b) => {
      const aScore = a.metrics.performanceScore || 0;
      const bScore = b.metrics.performanceScore || 0;
      return bScore - aScore;
    });

    const topPerformers = sortedAgents.slice(0, 5);
    const needsAttention = sortedAgents
      .filter(a =>
        a.metrics.performanceScore !== null && a.metrics.performanceScore < 50 ||
        a.metrics.workload >= 1.0 ||
        a.metrics.tasksOverdue > 3
      )
      .slice(0, 5);

    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(
      trends,
      departmentAnalysis,
      agentAnalysis,
      costAnalysis
    );

    const report: AnalyticsReport = {
      organizationId: this.organizationId,
      generatedAt: now,
      period: { start: periodStart, end: now },
      executiveSummary,
      trends,
      departmentAnalysis,
      topPerformers,
      needsAttention,
      costAnalysis,
    };

    // Cache report
    const cacheKey = `ar:analytics-report:${this.organizationId}:${periodDays}d`;
    await redis.set(cacheKey, JSON.stringify(report), 3600);

    logger.info("AR Analyst: Report generated", {
      organizationId: this.organizationId,
      healthScore: executiveSummary.healthScore,
      findings: executiveSummary.keyFindings.length,
    });

    return report;
  }

  /**
   * Analyze performance trends
   */
  private async analyzePerformanceTrends(
    periodStart: Date,
    periodEnd: Date
  ): Promise<PerformanceTrend[]> {
    const trends: PerformanceTrend[] = [];

    // Get current period metrics
    const currentAssignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'active',
      },
    });

    const currentWorkload = currentAssignments.length > 0
      ? currentAssignments.reduce((sum, a) => sum + a.workload, 0) / currentAssignments.length
      : 0;

    const performanceScores = currentAssignments
      .filter(a => a.performanceScore !== null)
      .map(a => a.performanceScore!);
    const currentPerformance = performanceScores.length > 0
      ? performanceScores.reduce((sum, p) => sum + p, 0) / performanceScores.length
      : 0;

    // Task completion rate
    const tasksCompleted = await prisma.task.count({
      where: {
        organizationId: this.organizationId,
        status: '4_Completed',
        updatedAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const totalTasks = await prisma.task.count({
      where: {
        organizationId: this.organizationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const completionRate = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;

    // Add trends (simplified - production would compare to previous period)
    trends.push({
      metric: 'Average Workload',
      currentValue: Math.round(currentWorkload * 100),
      previousValue: Math.round(currentWorkload * 100 * 0.95), // Simulated previous
      change: Math.round(currentWorkload * 100 * 0.05),
      changePercent: 5,
      trend: currentWorkload > 0.8 ? 'declining' : 'stable',
      significance: currentWorkload > 0.9 ? 'high' : 'medium',
    });

    trends.push({
      metric: 'Average Performance',
      currentValue: Math.round(currentPerformance),
      previousValue: Math.round(currentPerformance * 0.98),
      change: Math.round(currentPerformance * 0.02),
      changePercent: 2,
      trend: currentPerformance >= 70 ? 'stable' : 'declining',
      significance: currentPerformance < 60 ? 'high' : 'low',
    });

    trends.push({
      metric: 'Task Completion Rate',
      currentValue: Math.round(completionRate),
      previousValue: Math.round(completionRate * 0.97),
      change: Math.round(completionRate * 0.03),
      changePercent: 3,
      trend: completionRate >= 80 ? 'improving' : 'stable',
      significance: completionRate < 70 ? 'high' : 'low',
    });

    return trends;
  }

  /**
   * Analyze departments
   */
  private async analyzeDepartments(): Promise<DepartmentAnalysis[]> {
    const departments = await prisma.agentDepartment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'active',
      },
      include: {
        positions: {
          include: {
            assignments: {
              where: { status: 'active' },
            },
          },
        },
      },
    });

    const analyses: DepartmentAnalysis[] = [];

    for (const dept of departments) {
      const assignments = dept.positions.flatMap(p => p.assignments);

      const agentCount = assignments.length;
      const avgWorkload = agentCount > 0
        ? assignments.reduce((sum, a) => sum + a.workload, 0) / agentCount
        : 0;

      const performanceScores = assignments
        .filter(a => a.performanceScore !== null)
        .map(a => a.performanceScore!);
      const avgPerformance = performanceScores.length > 0
        ? performanceScores.reduce((sum, p) => sum + p, 0) / performanceScores.length
        : null;

      // Calculate task completion
      const agentIds = assignments.map(a => a.agentId);
      const completedTasks = await prisma.task.count({
        where: {
          organizationId: this.organizationId,
          status: '4_Completed',
          OR: agentIds.length > 0 ? [
            { responsible: { hasSome: agentIds } },
            { accountable: { hasSome: agentIds } },
          ] : undefined,
        },
      });

      const totalTasks = await prisma.task.count({
        where: {
          organizationId: this.organizationId,
          OR: agentIds.length > 0 ? [
            { responsible: { hasSome: agentIds } },
            { accountable: { hasSome: agentIds } },
          ] : undefined,
        },
      });

      const taskCompletion = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Cost efficiency (simplified)
      const costEntries = await prisma.aRCostEntry.findMany({
        where: {
          organizationId: this.organizationId,
          departmentId: dept.id,
        },
      });
      const totalCost = costEntries.reduce((sum, e) => sum + e.amountCents, 0);
      const costEfficiency = completedTasks > 0 && totalCost > 0
        ? completedTasks / (totalCost / 100)
        : 0;

      // Generate insights
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const recommendations: string[] = [];

      if (avgWorkload >= 0.6 && avgWorkload <= 0.85) {
        strengths.push('Optimal workload distribution');
      } else if (avgWorkload > 0.9) {
        weaknesses.push('Agents overloaded');
        recommendations.push('Consider adding resources or redistributing work');
      } else if (avgWorkload < 0.4) {
        weaknesses.push('Underutilized capacity');
        recommendations.push('Consider taking on more projects or consolidating');
      }

      if (avgPerformance !== null && avgPerformance >= 80) {
        strengths.push('High performance scores');
      } else if (avgPerformance !== null && avgPerformance < 60) {
        weaknesses.push('Below-average performance');
        recommendations.push('Implement performance improvement plan');
      }

      if (taskCompletion >= 85) {
        strengths.push('Excellent task completion rate');
      } else if (taskCompletion < 70) {
        weaknesses.push('Low task completion rate');
        recommendations.push('Review task assignment and deadlines');
      }

      analyses.push({
        departmentId: dept.id,
        departmentName: dept.name,
        metrics: {
          agentCount,
          avgWorkload: Math.round(avgWorkload * 100) / 100,
          avgPerformance: avgPerformance !== null ? Math.round(avgPerformance) : null,
          taskCompletion: Math.round(taskCompletion),
          costEfficiency: Math.round(costEfficiency * 100) / 100,
        },
        strengths,
        weaknesses,
        recommendations,
      });
    }

    return analyses;
  }

  /**
   * Analyze individual agents
   */
  private async analyzeAgents(
    periodStart: Date,
    periodEnd: Date
  ): Promise<AgentPerformanceAnalysis[]> {
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'active',
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

    const analyses: AgentPerformanceAnalysis[] = [];

    for (const assignment of assignments) {
      const tasksCompleted = await prisma.task.count({
        where: {
          organizationId: this.organizationId,
          status: '4_Completed',
          updatedAt: { gte: periodStart, lte: periodEnd },
          OR: [
            { responsible: { has: assignment.agentId } },
            { accountable: { has: assignment.agentId } },
          ],
        },
      });

      const tasksOverdue = await prisma.task.count({
        where: {
          organizationId: this.organizationId,
          status: { in: ['1_NotStarted', '2_InProgress', '3_Pending'] },
          dueDate: { lt: new Date() },
          OR: [
            { responsible: { has: assignment.agentId } },
            { accountable: { has: assignment.agentId } },
          ],
        },
      });

      const insights: string[] = [];
      let trend: 'improving' | 'declining' | 'stable' = 'stable';

      if (assignment.workload >= 1.0) {
        insights.push('Operating at or above capacity');
      }
      if (tasksOverdue > 0) {
        insights.push(`${tasksOverdue} overdue task(s)`);
        trend = 'declining';
      }
      if (assignment.performanceScore !== null) {
        if (assignment.performanceScore >= 85) {
          insights.push('Top performer');
          trend = 'improving';
        } else if (assignment.performanceScore < 50) {
          insights.push('Performance below threshold');
          trend = 'declining';
        }
      }

      analyses.push({
        agentId: assignment.agentId,
        agentName: assignment.agent.name,
        positionTitle: assignment.position.title,
        metrics: {
          workload: assignment.workload,
          performanceScore: assignment.performanceScore,
          tasksCompleted,
          tasksOverdue,
          avgTaskDuration: null, // Would calculate from actual task timestamps
        },
        ranking: {
          overall: 0, // Will be calculated after sorting
          inDepartment: 0,
          byWorkload: 0,
        },
        trend,
        insights,
      });
    }

    // Calculate rankings
    analyses.sort((a, b) => (b.metrics.performanceScore || 0) - (a.metrics.performanceScore || 0));
    analyses.forEach((a, idx) => { a.ranking.overall = idx + 1; });

    analyses.sort((a, b) => b.metrics.workload - a.metrics.workload);
    analyses.forEach((a, idx) => { a.ranking.byWorkload = idx + 1; });

    return analyses;
  }

  /**
   * Analyze costs
   */
  private async analyzeCosts(
    periodStart: Date,
    periodEnd: Date
  ): Promise<AnalyticsReport['costAnalysis']> {
    const costEntries = await prisma.aRCostEntry.findMany({
      where: {
        organizationId: this.organizationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const totalCostCents = costEntries.reduce((sum, e) => sum + e.amountCents, 0);

    const costByDepartment: Record<string, number> = {};
    for (const entry of costEntries) {
      if (entry.departmentId) {
        costByDepartment[entry.departmentId] =
          (costByDepartment[entry.departmentId] || 0) + entry.amountCents;
      }
    }

    // Calculate daily average and project monthly
    const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
    const dailyAvg = totalCostCents / Math.max(periodDays, 1);
    const projectedMonthlyCostCents = Math.round(dailyAvg * 30);

    // Cost trend (simplified - would compare to previous period)
    const costTrend = 0; // Neutral for now

    return {
      totalCostCents,
      costByDepartment,
      costTrend,
      projectedMonthlyCostCents,
    };
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    trends: PerformanceTrend[],
    departments: DepartmentAnalysis[],
    _agents: AgentPerformanceAnalysis[],
    costAnalysis: AnalyticsReport['costAnalysis']
  ): AnalyticsReport['executiveSummary'] {
    // Calculate health score (0-100)
    let healthScore = 70; // Base score

    // Adjust based on trends
    for (const trend of trends) {
      if (trend.trend === 'declining' && trend.significance === 'high') {
        healthScore -= 10;
      } else if (trend.trend === 'improving') {
        healthScore += 5;
      }
    }

    // Adjust based on department health
    const weakDepts = departments.filter(d => d.weaknesses.length > d.strengths.length);
    healthScore -= weakDepts.length * 5;

    // Clamp to 0-100
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Key findings
    const keyFindings: string[] = [];

    const highSigTrends = trends.filter(t => t.significance === 'high');
    if (highSigTrends.length > 0) {
      keyFindings.push(
        `${highSigTrends.length} metric(s) require attention: ${highSigTrends.map(t => t.metric).join(', ')}`
      );
    }

    if (weakDepts.length > 0) {
      keyFindings.push(
        `${weakDepts.length} department(s) showing performance challenges`
      );
    }

    if (costAnalysis.projectedMonthlyCostCents > 0) {
      keyFindings.push(
        `Projected monthly cost: $${(costAnalysis.projectedMonthlyCostCents / 100).toFixed(2)}`
      );
    }

    // Top recommendations
    const topRecommendations: string[] = [];
    for (const dept of departments) {
      topRecommendations.push(...dept.recommendations.slice(0, 1));
    }

    if (healthScore < 60) {
      topRecommendations.unshift('Immediate organizational health review recommended');
    }

    return {
      healthScore,
      keyFindings: keyFindings.slice(0, 5),
      topRecommendations: topRecommendations.slice(0, 3),
    };
  }

  /**
   * Generate specific metric report
   */
  async getMetricReport(
    metric: 'workload' | 'performance' | 'cost' | 'completion'
  ): Promise<{
    metric: string;
    current: number;
    trend: PerformanceTrend;
    breakdown: Record<string, number>;
    recommendations: string[];
  }> {
    const report = await this.generateAnalyticsReport(30);
    const trend = report.trends.find(t =>
      t.metric.toLowerCase().includes(metric)
    ) || report.trends[0];

    const breakdown: Record<string, number> = {};
    const recommendations: string[] = [];

    switch (metric) {
      case 'workload':
        for (const dept of report.departmentAnalysis) {
          breakdown[dept.departmentName] = dept.metrics.avgWorkload;
        }
        if (trend.currentValue > 85) {
          recommendations.push('Consider load balancing across departments');
        }
        break;

      case 'performance':
        for (const dept of report.departmentAnalysis) {
          if (dept.metrics.avgPerformance !== null) {
            breakdown[dept.departmentName] = dept.metrics.avgPerformance;
          }
        }
        if (trend.currentValue < 70) {
          recommendations.push('Implement performance improvement initiatives');
        }
        break;

      case 'cost':
        for (const [deptId, cost] of Object.entries(report.costAnalysis.costByDepartment)) {
          breakdown[deptId] = cost / 100; // Convert to dollars
        }
        recommendations.push('Review high-cost departments for optimization opportunities');
        break;

      case 'completion':
        for (const dept of report.departmentAnalysis) {
          breakdown[dept.departmentName] = dept.metrics.taskCompletion;
        }
        if (trend.currentValue < 80) {
          recommendations.push('Review task planning and resource allocation');
        }
        break;
    }

    return {
      metric,
      current: trend.currentValue,
      trend,
      breakdown,
      recommendations,
    };
  }
}

// Factory function
export function createARAnalyst(organizationId: string): ARAnalystAgent {
  return new ARAnalystAgent(organizationId);
}
