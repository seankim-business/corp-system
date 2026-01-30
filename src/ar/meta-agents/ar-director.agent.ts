/**
 * AR Director Agent
 *
 * Strategic AR leadership and organization-wide coordination.
 * Responsibilities:
 * - Reviews daily AR summaries and escalates issues
 * - Approves major organizational changes
 * - Generates executive AR reports
 * - Coordinates with human leadership
 */

import { db as prisma } from '../../db/client';
import { logger } from '../../utils/logger';
import { metrics } from '../../utils/metrics';
import {
  ARServices,
  DirectorReview,
  DirectorDecision,
  EscalationContext,
  ExecutiveReport,
  ReportPeriod,
  LeadershipCoordinationRequest,
} from './types';

export class ARDirectorAgent {
  private readonly organizationId: string;

  constructor(_services: ARServices) {
    this.organizationId = _services.organizationId;
  }

  /**
   * Review daily AR summary
   * Analyzes the day's operations and identifies issues requiring attention
   */
  async reviewDailySummary(
    organizationId: string,
    date: Date
  ): Promise<DirectorReview> {
    const startTime = Date.now();
    logger.info('AR Director reviewing daily summary', { organizationId, date });

    try {
      // Calculate date range for the day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Fetch key metrics for the day
      const [activeAgents, assignments, costData] = await Promise.all([
        // Count active agents
        prisma.agent.count({
          where: {
            organizationId,
            status: 'active',
          },
        }),
        // Get active assignments
        prisma.agentAssignment.findMany({
          where: {
            organizationId,
            status: 'active',
          },
        }),
        // Get cost data for the day
        prisma.aRCostEntry.aggregate({
          where: {
            organizationId,
            createdAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
          _sum: {
            amountCents: true,
          },
        }),
      ]);

      // Calculate average performance (placeholder - would use actual task data)
      const averagePerformance = assignments.reduce(
        (sum, a) => sum + (a.performanceScore || 0),
        0
      ) / (assignments.length || 1);

      // Identify escalations (simplified - would check for actual issues)
      const escalations: EscalationContext[] = [];

      // Check for budget concerns
      const totalCost = costData._sum.amountCents || 0;
      if (totalCost > 100000) { // Example threshold: $1000
        escalations.push({
          id: `budget-${date.toISOString()}`,
          type: 'budget',
          severity: 'high',
          description: `Daily cost of $${(totalCost / 100).toFixed(2)} exceeds normal threshold`,
          affectedDepartments: [],
          proposedAction: 'Review high-cost operations and optimize',
        });
      }

      // Check for performance issues
      if (averagePerformance < 70) {
        escalations.push({
          id: `perf-${date.toISOString()}`,
          type: 'performance',
          severity: 'medium',
          description: `Average performance score of ${averagePerformance.toFixed(1)} below target`,
          affectedAgents: assignments.filter(a => (a.performanceScore || 0) < 70).map(a => a.agentId),
          proposedAction: 'Initiate coaching sessions for underperforming agents',
        });
      }

      // Process each escalation and make decisions
      const decisions: DirectorDecision[] = [];
      for (const escalation of escalations) {
        const decision = await this.makeEscalationDecision(escalation);
        decisions.push(decision);
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (assignments.length > 0) {
        const avgUtilization = assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length;
        if (avgUtilization < 0.6) {
          recommendations.push('Consider consolidating underutilized agents to reduce costs');
        }
        if (avgUtilization > 0.9) {
          recommendations.push('High workload detected - consider hiring additional agents');
        }
      }

      const review: DirectorReview = {
        date,
        organizationId,
        summary: this.generateSummaryText(activeAgents, assignments.length, averagePerformance, totalCost),
        keyMetrics: {
          activeAgents,
          tasksCompleted: 0, // Would come from task tracking
          averagePerformance,
          costSpent: totalCost,
        },
        escalations,
        decisions,
        recommendations,
        approvalStatus: escalations.some(e => e.severity === 'critical')
          ? 'escalated'
          : decisions.some(d => d.decision === 'escalate_to_human')
          ? 'requires_action'
          : 'approved',
      };

      // Log the review
      await this.logDirectorActivity('daily_review', {
        date,
        escalationCount: escalations.length,
        decisionCount: decisions.length,
      });

      metrics.timing('ar_director.review_daily', Date.now() - startTime);
      return review;
    } catch (error) {
      logger.error('AR Director daily review failed', { error, organizationId, date });
      metrics.increment('ar_director.review_daily.error');
      throw error;
    }
  }

  /**
   * Process an escalation and make a decision
   */
  async processEscalation(escalation: EscalationContext): Promise<DirectorDecision> {
    logger.info('AR Director processing escalation', {
      escalationId: escalation.id,
      type: escalation.type,
      severity: escalation.severity
    });

    return this.makeEscalationDecision(escalation);
  }

  /**
   * Generate executive report for leadership
   */
  async generateExecutiveReport(
    organizationId: string,
    period: ReportPeriod
  ): Promise<ExecutiveReport> {
    const startTime = Date.now();
    logger.info('AR Director generating executive report', { organizationId, period });

    try {
      // Calculate date range based on period
      const { startDate, endDate } = this.getDateRange(period);

      // Fetch comprehensive data
      const [departments, agents, assignments, costs] = await Promise.all([
        prisma.agentDepartment.count({
          where: { organizationId, status: 'active' },
        }),
        prisma.agent.count({
          where: { organizationId, status: 'active' },
        }),
        prisma.agentAssignment.findMany({
          where: {
            organizationId,
            status: 'active',
          },
        }),
        prisma.aRCostEntry.aggregate({
          where: {
            organizationId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amountCents: true,
          },
        }),
      ]);

      const totalCost = costs._sum.amountCents || 0;
      const avgUtilization = assignments.length > 0
        ? assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length
        : 0;

      const report: ExecutiveReport = {
        period,
        startDate,
        endDate,
        organizationId,
        summary: {
          totalAgents: agents,
          totalDepartments: departments,
          tasksCompleted: 0, // Would track from task system
          totalCost,
          averageUtilization: avgUtilization,
        },
        highlights: this.generateHighlights(assignments, avgUtilization),
        concerns: this.identifyConcerns(totalCost, avgUtilization, assignments),
        recommendations: this.generateExecutiveRecommendations(assignments, totalCost),
        keyMetrics: {
          cost_per_agent: agents > 0 ? totalCost / agents : 0,
          active_agents: agents,
          total_departments: departments,
        },
        trends: this.calculateTrends(),
      };

      await this.logDirectorActivity('executive_report', {
        period,
        totalCost,
        agentCount: agents,
      });

      metrics.histogram('ar_director.executive_report', Date.now() - startTime);
      return report;
    } catch (error) {
      logger.error('AR Director executive report failed', { error, organizationId, period });
      metrics.increment('ar_director.executive_report.error');
      throw error;
    }
  }

  /**
   * Coordinate with human leadership
   */
  async coordinateWithLeadership(
    request: LeadershipCoordinationRequest
  ): Promise<void> {
    logger.info('AR Director coordinating with leadership', {
      type: request.type,
      urgency: request.urgency
    });

    try {
      // Create approval request if needed
      if (request.type === 'approval' && request.requiredApprovalLevel) {
        // Would integrate with approval system
        logger.info('Creating approval request for leadership', {
          subject: request.subject,
          level: request.requiredApprovalLevel,
        });
      }

      // Log coordination activity
      await this.logDirectorActivity('leadership_coordination', {
        type: request.type,
        subject: request.subject,
        urgency: request.urgency,
      });

      // Would send notification via Slack or other channels
      metrics.increment('ar_director.leadership_coordination');
    } catch (error) {
      logger.error('AR Director leadership coordination failed', { error, request });
      metrics.increment('ar_director.leadership_coordination.error');
      throw error;
    }
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  private async makeEscalationDecision(
    escalation: EscalationContext
  ): Promise<DirectorDecision> {
    // Decision logic based on escalation type and severity
    let decision: DirectorDecision['decision'] = 'approve';
    let action = '';
    let rationale = '';

    switch (escalation.type) {
      case 'budget':
        if (escalation.severity === 'critical') {
          decision = 'escalate_to_human';
          action = 'Immediate human review required for budget overrun';
          rationale = 'Budget exceeded critical threshold requiring executive approval';
        } else {
          decision = 'approve';
          action = escalation.proposedAction || 'Optimize costs and monitor';
          rationale = 'Within acceptable variance, implementing cost optimization';
        }
        break;

      case 'performance':
        decision = 'approve';
        action = escalation.proposedAction || 'Initiate performance improvement plan';
        rationale = 'Standard performance management process';
        break;

      case 'structural':
        decision = 'escalate_to_human';
        action = 'Request human approval for organizational change';
        rationale = 'Structural changes require human oversight';
        break;

      case 'emergency':
        decision = 'approve';
        action = 'Implement emergency response immediately';
        rationale = 'Emergency situation requires immediate action';
        break;
    }

    return {
      escalationId: escalation.id,
      decision,
      action,
      rationale,
      implementationPlan: escalation.proposedAction ? [escalation.proposedAction] : [],
      notifyAgents: escalation.affectedAgents,
      notifyHumans: decision === 'escalate_to_human' ? ['leadership'] : undefined,
      decidedAt: new Date(),
    };
  }

  private generateSummaryText(
    agents: number,
    assignments: number,
    performance: number,
    cost: number
  ): string {
    return `Daily Summary: ${agents} active agents with ${assignments} assignments. ` +
      `Average performance: ${performance.toFixed(1)}%. ` +
      `Total cost: $${(cost / 100).toFixed(2)}.`;
  }

  private generateHighlights(
    assignments: any[],
    utilization: number
  ): string[] {
    const highlights: string[] = [];

    if (utilization > 0.8) {
      highlights.push('High agent utilization indicates strong operational efficiency');
    }

    if (assignments.length > 0) {
      const topPerformers = assignments
        .filter(a => (a.performanceScore || 0) > 90)
        .length;
      if (topPerformers > 0) {
        highlights.push(`${topPerformers} agents performing above 90% benchmark`);
      }
    }

    return highlights;
  }

  private identifyConcerns(
    cost: number,
    utilization: number,
    assignments: any[]
  ): string[] {
    const concerns: string[] = [];

    if (cost > 500000) { // $5000
      concerns.push('Operating costs above projected budget');
    }

    if (utilization < 0.5) {
      concerns.push('Low agent utilization - potential resource waste');
    }

    const lowPerformers = assignments.filter(a => (a.performanceScore || 0) < 60).length;
    if (lowPerformers > 0) {
      concerns.push(`${lowPerformers} agents require performance intervention`);
    }

    return concerns;
  }

  private generateExecutiveRecommendations(
    assignments: any[],
    cost: number
  ): string[] {
    const recommendations: string[] = [];

    if (assignments.length > 0) {
      const avgUtilization = assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length;

      if (avgUtilization < 0.6) {
        recommendations.push('Consider consolidation opportunities to optimize resource allocation');
      }

      if (cost > 1000000) { // $10,000
        recommendations.push('Evaluate model tier assignments for cost optimization potential');
      }
    }

    recommendations.push('Continue monitoring performance trends for early intervention opportunities');

    return recommendations;
  }

  private calculateTrends(): ExecutiveReport['trends'] {
    // Placeholder - would calculate actual trends from historical data
    return [
      {
        metric: 'agent_count',
        direction: 'stable',
        change: 0,
      },
      {
        metric: 'cost',
        direction: 'up',
        change: 5,
      },
      {
        metric: 'performance',
        direction: 'up',
        change: 3,
      },
    ];
  }

  private getDateRange(period: ReportPeriod): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarterly':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
    }

    return { startDate, endDate };
  }

  private async logDirectorActivity(
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.aRDepartmentLog.create({
        data: {
          organizationId: this.organizationId,
          action,
          category: 'coordination',
          details,
          impact: 'high',
        },
      });
    } catch (error) {
      logger.error('Failed to log director activity', { error, action });
    }
  }
}
