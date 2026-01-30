/**
 * AR Operations Manager Meta-Agent
 *
 * A specialized meta-agent that oversees the daily operations of the
 * AR system. Handles escalations, monitors agent health, and ensures
 * smooth organizational operations.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";
import { workloadRebalancerService } from "../coordination/workload-rebalancer.service";
import { issueDetectorService, type DetectedIssue } from "../coordination/issue-detector.service";

// =============================================================================
// TYPES
// =============================================================================

export interface OpsAction {
  id: string;
  type: 'escalation' | 'rebalance' | 'alert' | 'status_change' | 'intervention';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  targetEntity?: {
    type: 'agent' | 'department' | 'position' | 'task';
    id: string;
    name: string;
  };
  createdAt: Date;
  completedAt?: Date;
  result?: Record<string, unknown>;
}

export interface OpsReport {
  organizationId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalAgents: number;
    activeAgents: number;
    healthyAgents: number;
    atRiskAgents: number;
    criticalIssues: number;
    pendingActions: number;
  };
  issues: DetectedIssue[];
  actions: OpsAction[];
  recommendations: string[];
}

export interface HealthCheckResult {
  agentId: string;
  agentName: string;
  status: 'healthy' | 'warning' | 'critical';
  workload: number;
  performance: number | null;
  activeTasks: number;
  issues: string[];
  lastActive?: Date;
}

// =============================================================================
// SERVICE
// =============================================================================

export class AROpsManagerAgent {
  private organizationId: string;
  private actionQueue: OpsAction[] = [];

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Run daily operations check
   */
  async runDailyCheck(): Promise<OpsReport> {
    logger.info("AR Ops Manager: Running daily check", {
      organizationId: this.organizationId,
    });

    const startTime = Date.now();

    // Gather metrics
    const [agents, issues, healthChecks] = await Promise.all([
      this.getAgentMetrics(),
      this.detectIssues(),
      this.runHealthChecks(),
    ]);

    // Generate actions based on findings
    const actions = await this.generateActions(issues, healthChecks);
    this.actionQueue.push(...actions);

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, healthChecks);

    const now = new Date();
    const report: OpsReport = {
      organizationId: this.organizationId,
      generatedAt: now,
      period: {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now,
      },
      summary: {
        totalAgents: agents.total,
        activeAgents: agents.active,
        healthyAgents: healthChecks.filter(h => h.status === 'healthy').length,
        atRiskAgents: healthChecks.filter(h => h.status !== 'healthy').length,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        pendingActions: this.actionQueue.filter(a => a.status === 'pending').length,
      },
      issues,
      actions: this.actionQueue,
      recommendations,
    };

    // Cache report
    const cacheKey = `ar:ops-report:${this.organizationId}:${now.toISOString().split('T')[0]}`;
    await redis.set(cacheKey, JSON.stringify(report), 86400);

    logger.info("AR Ops Manager: Daily check complete", {
      organizationId: this.organizationId,
      durationMs: Date.now() - startTime,
      issues: issues.length,
      actions: actions.length,
    });

    return report;
  }

  /**
   * Get agent metrics
   */
  private async getAgentMetrics(): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      prisma.agent.count({
        where: { organizationId: this.organizationId },
      }),
      prisma.agent.count({
        where: {
          organizationId: this.organizationId,
          status: 'active',
        },
      }),
    ]);

    return { total, active };
  }

  /**
   * Detect issues using the issue detector service
   */
  private async detectIssues(): Promise<DetectedIssue[]> {
    const result = await issueDetectorService.detectIssues(this.organizationId);
    return result.issues;
  }

  /**
   * Run health checks on all active agents
   */
  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'active',
      },
      include: {
        agent: true,
        position: true,
      },
    });

    const results: HealthCheckResult[] = [];

    for (const assignment of assignments) {
      const activeTasks = await prisma.task.count({
        where: {
          organizationId: this.organizationId,
          status: { in: ['1_NotStarted', '2_InProgress', '3_Pending'] },
          OR: [
            { responsible: { has: assignment.agentId } },
            { accountable: { has: assignment.agentId } },
          ],
        },
      });

      const issues: string[] = [];
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      // Check workload
      if (assignment.workload >= 1.0) {
        issues.push('Critically overloaded');
        status = 'critical';
      } else if (assignment.workload >= 0.9) {
        issues.push('Near capacity');
        status = 'warning';
      }

      // Check performance
      if (assignment.performanceScore !== null && assignment.performanceScore < 50) {
        issues.push('Low performance score');
        status = status === 'critical' ? 'critical' : 'warning';
      }

      // Check task count relative to capacity
      if (activeTasks > assignment.position.maxConcurrent * 2) {
        issues.push('Too many concurrent tasks');
        status = 'critical';
      }

      results.push({
        agentId: assignment.agentId,
        agentName: assignment.agent.name,
        status,
        workload: assignment.workload,
        performance: assignment.performanceScore,
        activeTasks,
        issues,
        lastActive: assignment.agent.lastActiveAt || undefined,
      });
    }

    return results;
  }

  /**
   * Generate actions based on detected issues
   */
  private async generateActions(
    issues: DetectedIssue[],
    healthChecks: HealthCheckResult[]
  ): Promise<OpsAction[]> {
    const actions: OpsAction[] = [];

    // Handle critical issues
    for (const issue of issues.filter(i => i.severity === 'critical')) {
      const agentEntity = issue.affectedEntities.find(e => e.type === 'agent');
      actions.push({
        id: `action-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: 'escalation',
        description: `Escalate: ${issue.description}`,
        status: 'pending',
        priority: 'critical',
        targetEntity: agentEntity
          ? { type: 'agent', id: agentEntity.id, name: agentEntity.name }
          : undefined,
        createdAt: new Date(),
      });
    }

    // Handle overloaded agents
    const criticalAgents = healthChecks.filter(h => h.status === 'critical');
    if (criticalAgents.length > 0) {
      actions.push({
        id: `action-rebalance-${Date.now()}`,
        type: 'rebalance',
        description: `Rebalance workload for ${criticalAgents.length} critically overloaded agents`,
        status: 'pending',
        priority: 'high',
        createdAt: new Date(),
      });
    }

    // Handle performance issues
    const lowPerformers = healthChecks.filter(
      h => h.performance !== null && h.performance < 50
    );
    for (const agent of lowPerformers) {
      actions.push({
        id: `action-perf-${agent.agentId}`,
        type: 'intervention',
        description: `Performance intervention needed for ${agent.agentName}`,
        status: 'pending',
        priority: 'medium',
        targetEntity: { type: 'agent', id: agent.agentId, name: agent.agentName },
        createdAt: new Date(),
      });
    }

    return actions;
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(
    issues: DetectedIssue[],
    healthChecks: HealthCheckResult[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    if (criticalCount > 3) {
      recommendations.push(
        'Multiple critical issues detected - consider pausing new work assignments until resolved'
      );
    }

    const overloadedPercent = healthChecks.filter(h => h.workload >= 0.9).length / healthChecks.length;
    if (overloadedPercent > 0.3) {
      recommendations.push(
        'Over 30% of agents are near or at capacity - consider hiring or rebalancing'
      );
    }

    const underutilized = healthChecks.filter(h => h.workload <= 0.3);
    if (underutilized.length > 2) {
      recommendations.push(
        `${underutilized.length} agents are significantly underutilized - consider consolidation`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Operations running smoothly - no immediate actions needed');
    }

    return recommendations;
  }

  /**
   * Execute pending actions
   */
  async executePendingActions(): Promise<{
    executed: number;
    failed: number;
    errors: string[];
  }> {
    const pending = this.actionQueue.filter(a => a.status === 'pending');
    let executed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const action of pending) {
      try {
        action.status = 'in_progress';
        await this.executeAction(action);
        action.status = 'completed';
        action.completedAt = new Date();
        executed++;
      } catch (error) {
        action.status = 'failed';
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${action.description}: ${message}`);
        failed++;
      }
    }

    logger.info("AR Ops Manager: Actions executed", {
      organizationId: this.organizationId,
      executed,
      failed,
    });

    return { executed, failed, errors };
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: OpsAction): Promise<void> {
    switch (action.type) {
      case 'rebalance':
        const proposal = await workloadRebalancerService.generateRebalanceProposal(
          this.organizationId,
          'scheduled'
        );
        if (!proposal.requiresApproval) {
          await workloadRebalancerService.applyProposal(
            this.organizationId,
            proposal.id
          );
        }
        action.result = { proposalId: proposal.id };
        break;

      case 'escalation':
        // Log escalation - in production would notify supervisors
        logger.warn("AR Ops Manager: Escalation", {
          organizationId: this.organizationId,
          action: action.description,
          target: action.targetEntity,
        });
        break;

      case 'alert':
      case 'intervention':
        // Log for now - production would create notifications
        logger.info("AR Ops Manager: Action logged", {
          type: action.type,
          description: action.description,
        });
        break;

      default:
        logger.warn("Unknown action type", { type: action.type });
    }
  }

  /**
   * Get action queue
   */
  getActionQueue(): OpsAction[] {
    return [...this.actionQueue];
  }

  /**
   * Clear completed actions
   */
  clearCompletedActions(): void {
    this.actionQueue = this.actionQueue.filter(a => a.status !== 'completed');
  }
}

// Factory function to create ops manager for an organization
export function createAROpsManager(organizationId: string): AROpsManagerAgent {
  return new AROpsManagerAgent(organizationId);
}
