/**
 * Issue Detector Service
 *
 * Detects blockers, challenges, and anomalies in agent work.
 * Proactively identifies issues before they escalate.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueCategory =
  | 'blocker'
  | 'overload'
  | 'underutilization'
  | 'deadline_risk'
  | 'quality_concern'
  | 'resource_conflict'
  | 'communication_gap'
  | 'performance_degradation'
  | 'anomaly';

export interface DetectedIssue {
  id: string;
  organizationId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedEntities: {
    type: 'agent' | 'task' | 'department' | 'position';
    id: string;
    name: string;
  }[];
  suggestedActions: {
    action: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }[];
  metrics: Record<string, number>;
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface IssueDetectionResult {
  organizationId: string;
  scannedAt: Date;
  issuesFound: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  issues: DetectedIssue[];
  summary: string;
}

export interface DetectionThresholds {
  blockedTaskHours: number;        // Hours before blocked task is flagged
  overloadWorkload: number;        // Workload % to consider overloaded
  underutilizationWorkload: number; // Workload % to consider underutilized
  deadlineRiskDays: number;        // Days before deadline to flag risk
  staleTaskDays: number;           // Days without update to flag
  errorRateThreshold: number;      // Error rate % to flag
}

const DEFAULT_THRESHOLDS: DetectionThresholds = {
  blockedTaskHours: 4,
  overloadWorkload: 0.9,
  underutilizationWorkload: 0.3,
  deadlineRiskDays: 2,
  staleTaskDays: 3,
  errorRateThreshold: 10,
};

// =============================================================================
// SERVICE
// =============================================================================

export class IssueDetectorService {
  private thresholds: DetectionThresholds;

  constructor(thresholds?: Partial<DetectionThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Run full issue detection scan for an organization
   */
  async detectIssues(organizationId: string): Promise<IssueDetectionResult> {
    logger.info("Starting issue detection scan", { organizationId });

    const startTime = Date.now();
    const issues: DetectedIssue[] = [];

    // Run all detectors in parallel
    const [
      blockerIssues,
      overloadIssues,
      underutilizationIssues,
      deadlineRiskIssues,
      staleTaskIssues,
      performanceIssues,
      resourceConflictIssues,
    ] = await Promise.all([
      this.detectBlockers(organizationId),
      this.detectOverload(organizationId),
      this.detectUnderutilization(organizationId),
      this.detectDeadlineRisks(organizationId),
      this.detectStaleTasks(organizationId),
      this.detectPerformanceIssues(organizationId),
      this.detectResourceConflicts(organizationId),
    ]);

    issues.push(
      ...blockerIssues,
      ...overloadIssues,
      ...underutilizationIssues,
      ...deadlineRiskIssues,
      ...staleTaskIssues,
      ...performanceIssues,
      ...resourceConflictIssues
    );

    // Count by severity
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;

    // Generate summary
    const summary = this.generateSummary(issues);

    // Cache results
    const cacheKey = `ar:issues:${organizationId}`;
    await redis.set(
      cacheKey,
      JSON.stringify({ issues, scannedAt: new Date() }),
      300 // 5 minutes
    );

    logger.info("Issue detection complete", {
      organizationId,
      issuesFound: issues.length,
      critical: criticalCount,
      high: highCount,
      durationMs: Date.now() - startTime,
    });

    return {
      organizationId,
      scannedAt: new Date(),
      issuesFound: issues.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      issues,
      summary,
    };
  }

  /**
   * Detect blocked tasks that need attention
   */
  private async detectBlockers(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    const blockedTasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: '4_Blocked',
      },
      include: {
        project: true,
      },
    });

    const now = new Date();

    for (const task of blockedTasks) {
      const blockedHours = (now.getTime() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60);

      if (blockedHours >= this.thresholds.blockedTaskHours) {
        const severity: IssueSeverity =
          blockedHours > 24 ? 'critical' :
          blockedHours > 8 ? 'high' : 'medium';

        issues.push({
          id: `blocker-${task.id}`,
          organizationId,
          category: 'blocker',
          severity,
          title: `Task blocked for ${Math.round(blockedHours)} hours`,
          description: `Task "${task.name}" has been blocked since ${task.updatedAt.toISOString()}`,
          affectedEntities: [
            { type: 'task', id: task.id, name: task.name },
          ],
          suggestedActions: [
            {
              action: 'Identify and resolve blocker',
              impact: 'high',
              effort: 'medium',
            },
            {
              action: 'Reassign to agent with different capabilities',
              impact: 'medium',
              effort: 'low',
            },
            {
              action: 'Escalate to human supervisor',
              impact: 'high',
              effort: 'low',
            },
          ],
          metrics: {
            blockedHours: Math.round(blockedHours),
          },
          detectedAt: now,
        });
      }
    }

    return issues;
  }

  /**
   * Detect overloaded agents
   */
  private async detectOverload(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId,
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

    const now = new Date();

    for (const assignment of assignments) {
      if (assignment.workload >= this.thresholds.overloadWorkload) {
        const severity: IssueSeverity =
          assignment.workload >= 1.0 ? 'critical' :
          assignment.workload >= 0.95 ? 'high' : 'medium';

        issues.push({
          id: `overload-${assignment.agentId}`,
          organizationId,
          category: 'overload',
          severity,
          title: `Agent at ${Math.round(assignment.workload * 100)}% capacity`,
          description: `Agent "${assignment.agent.name}" is overloaded in position "${assignment.position.title}"`,
          affectedEntities: [
            { type: 'agent', id: assignment.agentId, name: assignment.agent.name },
            { type: 'position', id: assignment.positionId, name: assignment.position.title },
            { type: 'department', id: assignment.position.departmentId, name: assignment.position.department.name },
          ],
          suggestedActions: [
            {
              action: 'Redistribute tasks to other agents',
              impact: 'high',
              effort: 'medium',
            },
            {
              action: 'Defer lower-priority tasks',
              impact: 'medium',
              effort: 'low',
            },
            {
              action: 'Request additional agent assignment',
              impact: 'high',
              effort: 'high',
            },
          ],
          metrics: {
            workloadPercent: Math.round(assignment.workload * 100),
          },
          detectedAt: now,
        });
      }
    }

    return issues;
  }

  /**
   * Detect underutilized agents
   */
  private async detectUnderutilization(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId,
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

    const now = new Date();

    for (const assignment of assignments) {
      if (assignment.workload <= this.thresholds.underutilizationWorkload) {
        issues.push({
          id: `underutilized-${assignment.agentId}`,
          organizationId,
          category: 'underutilization',
          severity: 'low',
          title: `Agent at ${Math.round(assignment.workload * 100)}% capacity`,
          description: `Agent "${assignment.agent.name}" is underutilized and could take on more work`,
          affectedEntities: [
            { type: 'agent', id: assignment.agentId, name: assignment.agent.name },
            { type: 'department', id: assignment.position.departmentId, name: assignment.position.department.name },
          ],
          suggestedActions: [
            {
              action: 'Assign additional tasks from backlog',
              impact: 'medium',
              effort: 'low',
            },
            {
              action: 'Redistribute work from overloaded agents',
              impact: 'high',
              effort: 'medium',
            },
            {
              action: 'Consider cross-training or temporary reassignment',
              impact: 'medium',
              effort: 'medium',
            },
          ],
          metrics: {
            workloadPercent: Math.round(assignment.workload * 100),
          },
          detectedAt: now,
        });
      }
    }

    return issues;
  }

  /**
   * Detect tasks at risk of missing deadlines
   */
  private async detectDeadlineRisks(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    const now = new Date();
    const riskDate = new Date(now.getTime() + this.thresholds.deadlineRiskDays * 24 * 60 * 60 * 1000);

    const riskyTasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: {
          in: ['1_NotStarted', '2_InProgress', '3_Pending', '4_Blocked'],
        },
        dueDate: {
          lte: riskDate,
        },
      },
      include: {
        project: true,
      },
    });

    for (const task of riskyTasks) {
      if (!task.dueDate) continue;

      const daysUntilDue = Math.ceil(
        (new Date(task.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isOverdue = daysUntilDue < 0;
      const severity: IssueSeverity =
        isOverdue ? 'critical' :
        daysUntilDue <= 1 ? 'high' : 'medium';

      issues.push({
        id: `deadline-risk-${task.id}`,
        organizationId,
        category: 'deadline_risk',
        severity,
        title: isOverdue
          ? `Task overdue by ${Math.abs(daysUntilDue)} days`
          : `Task due in ${daysUntilDue} days`,
        description: `Task "${task.name}" ${isOverdue ? 'missed deadline' : 'approaching deadline'} (${task.status})`,
        affectedEntities: [
          { type: 'task', id: task.id, name: task.name },
        ],
        suggestedActions: [
          {
            action: 'Prioritize and focus resources',
            impact: 'high',
            effort: 'medium',
          },
          {
            action: isOverdue ? 'Negotiate deadline extension' : 'Add additional resources',
            impact: 'high',
            effort: 'medium',
          },
          {
            action: 'Remove blockers if any',
            impact: 'high',
            effort: 'low',
          },
        ],
        metrics: {
          daysUntilDue,
          isOverdue: isOverdue ? 1 : 0,
        },
        detectedAt: now,
      });
    }

    return issues;
  }

  /**
   * Detect stale tasks with no recent activity
   */
  private async detectStaleTasks(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    const now = new Date();
    const staleDate = new Date(now.getTime() - this.thresholds.staleTaskDays * 24 * 60 * 60 * 1000);

    const staleTasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: {
          in: ['1_NotStarted', '2_InProgress', '3_Pending'],
        },
        updatedAt: {
          lt: staleDate,
        },
      },
    });

    for (const task of staleTasks) {
      const staleDays = Math.ceil(
        (now.getTime() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      issues.push({
        id: `stale-${task.id}`,
        organizationId,
        category: 'anomaly',
        severity: staleDays > 7 ? 'medium' : 'low',
        title: `Task inactive for ${staleDays} days`,
        description: `Task "${task.name}" has had no activity for ${staleDays} days`,
        affectedEntities: [
          { type: 'task', id: task.id, name: task.name },
        ],
        suggestedActions: [
          {
            action: 'Check if task is still relevant',
            impact: 'medium',
            effort: 'low',
          },
          {
            action: 'Reassign if current assignee is unavailable',
            impact: 'medium',
            effort: 'low',
          },
          {
            action: 'Close task if no longer needed',
            impact: 'low',
            effort: 'low',
          },
        ],
        metrics: {
          staleDays,
        },
        detectedAt: now,
      });
    }

    return issues;
  }

  /**
   * Detect performance degradation
   */
  private async detectPerformanceIssues(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    // Get recent agent executions with errors
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const executions = await prisma.agentExecution.groupBy({
      by: ['agentId'],
      where: {
        agent: {
          organizationId,
        },
        createdAt: {
          gte: recentWindow,
        },
      },
      _count: {
        id: true,
      },
    });

    const errorExecutions = await prisma.agentExecution.groupBy({
      by: ['agentId'],
      where: {
        agent: {
          organizationId,
        },
        createdAt: {
          gte: recentWindow,
        },
        status: 'failed',
      },
      _count: {
        id: true,
      },
    });

    const errorMap = new Map(errorExecutions.map(e => [e.agentId, e._count.id]));

    for (const exec of executions) {
      const totalCount = exec._count.id;
      const errorCount = errorMap.get(exec.agentId) || 0;
      const errorRate = (errorCount / totalCount) * 100;

      if (errorRate >= this.thresholds.errorRateThreshold && totalCount >= 5) {
        const agent = await prisma.agent.findUnique({
          where: { id: exec.agentId },
        });

        issues.push({
          id: `performance-${exec.agentId}`,
          organizationId,
          category: 'performance_degradation',
          severity: errorRate >= 30 ? 'high' : 'medium',
          title: `Agent error rate: ${Math.round(errorRate)}%`,
          description: `Agent "${agent?.name}" has a ${Math.round(errorRate)}% error rate (${errorCount}/${totalCount} executions)`,
          affectedEntities: [
            { type: 'agent', id: exec.agentId, name: agent?.name || 'Unknown' },
          ],
          suggestedActions: [
            {
              action: 'Review recent error logs',
              impact: 'high',
              effort: 'low',
            },
            {
              action: 'Check agent configuration and prompts',
              impact: 'high',
              effort: 'medium',
            },
            {
              action: 'Consider agent replacement or retraining',
              impact: 'high',
              effort: 'high',
            },
          ],
          metrics: {
            errorRate: Math.round(errorRate),
            totalExecutions: totalCount,
            errorCount,
          },
          detectedAt: new Date(),
        });
      }
    }

    return issues;
  }

  /**
   * Detect resource conflicts
   */
  private async detectResourceConflicts(organizationId: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    // Find agents assigned to multiple active positions
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      include: {
        agent: true,
        position: true,
      },
    });

    const agentAssignmentCount = new Map<string, typeof assignments>();

    for (const assignment of assignments) {
      const existing = agentAssignmentCount.get(assignment.agentId) || [];
      existing.push(assignment);
      agentAssignmentCount.set(assignment.agentId, existing);
    }

    for (const [agentId, agentAssignments] of agentAssignmentCount.entries()) {
      if (agentAssignments.length > 1) {
        const totalWorkload = agentAssignments.reduce((sum, a) => sum + a.workload, 0);

        if (totalWorkload > 1.0) {
          issues.push({
            id: `conflict-${agentId}`,
            organizationId,
            category: 'resource_conflict',
            severity: totalWorkload > 1.5 ? 'high' : 'medium',
            title: `Agent assigned to ${agentAssignments.length} positions (${Math.round(totalWorkload * 100)}% total)`,
            description: `Agent "${agentAssignments[0].agent.name}" has conflicting assignments totaling ${Math.round(totalWorkload * 100)}% workload`,
            affectedEntities: [
              { type: 'agent', id: agentId, name: agentAssignments[0].agent.name },
              ...agentAssignments.map(a => ({
                type: 'position' as const,
                id: a.positionId,
                name: a.position.title,
              })),
            ],
            suggestedActions: [
              {
                action: 'Reduce workload on one or more positions',
                impact: 'high',
                effort: 'medium',
              },
              {
                action: 'Reassign one position to another agent',
                impact: 'high',
                effort: 'medium',
              },
              {
                action: 'Clarify primary vs secondary assignments',
                impact: 'medium',
                effort: 'low',
              },
            ],
            metrics: {
              assignmentCount: agentAssignments.length,
              totalWorkload: Math.round(totalWorkload * 100),
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate issue summary
   */
  private generateSummary(issues: DetectedIssue[]): string {
    if (issues.length === 0) {
      return 'No issues detected. All systems operating normally.';
    }

    const critical = issues.filter(i => i.severity === 'critical').length;
    const high = issues.filter(i => i.severity === 'high').length;

    const parts: string[] = [];

    if (critical > 0) {
      parts.push(`${critical} critical issue${critical > 1 ? 's' : ''} requiring immediate attention`);
    }

    if (high > 0) {
      parts.push(`${high} high-priority issue${high > 1 ? 's' : ''}`);
    }

    const categories = [...new Set(issues.map(i => i.category))];
    parts.push(`Categories affected: ${categories.join(', ')}`);

    return parts.join('. ') + '.';
  }

  /**
   * Get cached issues for an organization
   */
  async getCachedIssues(organizationId: string): Promise<IssueDetectionResult | null> {
    const cacheKey = `ar:issues:${organizationId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) return null;

    return JSON.parse(cached);
  }

  /**
   * Mark an issue as resolved
   */
  async resolveIssue(
    organizationId: string,
    issueId: string,
    resolution: string
  ): Promise<void> {
    // In production, this would update a database record
    // For now, we just log and invalidate cache
    logger.info("Issue resolved", { organizationId, issueId, resolution });

    const cacheKey = `ar:issues:${organizationId}`;
    await redis.del(cacheKey);
  }
}

// Export singleton instance
export const issueDetectorService = new IssueDetectorService();
