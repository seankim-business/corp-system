/**
 * Workload Rebalancer Service
 *
 * Automatically rebalances work across agents based on capacity,
 * performance, and organizational priorities.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export type RebalanceTrigger =
  | 'overload'
  | 'underutilized'
  | 'deadline_risk'
  | 'performance_issue'
  | 'manual'
  | 'scheduled';

export type RebalanceAction =
  | 'reassign_task'
  | 'transfer_workload'
  | 'adjust_capacity'
  | 'request_backup';

export interface WorkloadSnapshot {
  agentId: string;
  agentName: string;
  positionId: string;
  positionTitle: string;
  departmentId: string;
  departmentName: string;
  currentWorkload: number;
  maxCapacity: number;
  activeTasks: number;
  performanceScore: number | null;
  skills: string[];
}

export interface RebalanceChange {
  action: RebalanceAction;
  sourceAgentId: string;
  sourceAgentName: string;
  targetAgentId?: string;
  targetAgentName?: string;
  taskId?: string;
  taskTitle?: string;
  workloadDelta: number;
  rationale: string;
}

export interface RebalanceProposal {
  id: string;
  organizationId: string;
  trigger: RebalanceTrigger;
  triggerDetails: Record<string, unknown>;
  proposedChanges: RebalanceChange[];
  expectedImpact: {
    overloadedAgentsReduced: number;
    underutilizedAgentsReduced: number;
    estimatedEfficiencyGain: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'partial';
  requiresApproval: boolean;
  createdAt: Date;
  appliedAt?: Date;
}

export interface RebalanceConfig {
  autoApproveThreshold: number;  // Changes below this can auto-approve
  maxChangesPerCycle: number;    // Max changes to propose at once
  minWorkloadDelta: number;      // Minimum workload difference to trigger
  protectedAgents: string[];     // Agents that shouldn't be rebalanced
}

const DEFAULT_CONFIG: RebalanceConfig = {
  autoApproveThreshold: 3,
  maxChangesPerCycle: 10,
  minWorkloadDelta: 0.2,
  protectedAgents: [],
};

// =============================================================================
// SERVICE
// =============================================================================

export class WorkloadRebalancerService {
  private config: RebalanceConfig;

  constructor(config?: Partial<RebalanceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze current workload distribution
   */
  async analyzeWorkloadDistribution(
    organizationId: string
  ): Promise<{
    snapshots: WorkloadSnapshot[];
    overloaded: WorkloadSnapshot[];
    underutilized: WorkloadSnapshot[];
    balanced: WorkloadSnapshot[];
    avgWorkload: number;
    stdDeviation: number;
  }> {
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

    // Build snapshots
    const snapshots: WorkloadSnapshot[] = await Promise.all(
      assignments.map(async (assignment) => {
        const activeTasks = await prisma.task.count({
          where: {
            organizationId,
            status: { in: ['1_NotStarted', '2_InProgress', '3_Pending'] },
            OR: [
              { responsible: { has: assignment.agentId } },
              { accountable: { has: assignment.agentId } },
            ],
          },
        });

        return {
          agentId: assignment.agentId,
          agentName: assignment.agent.name,
          positionId: assignment.positionId,
          positionTitle: assignment.position.title,
          departmentId: assignment.position.departmentId,
          departmentName: assignment.position.department.name,
          currentWorkload: assignment.workload,
          maxCapacity: assignment.position.maxConcurrent,
          activeTasks,
          performanceScore: assignment.performanceScore,
          skills: assignment.position.requiredSkills || [],
        };
      })
    );

    // Calculate statistics
    const workloads = snapshots.map(s => s.currentWorkload);
    const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length || 0;
    const variance = workloads.reduce((sum, w) => sum + Math.pow(w - avgWorkload, 2), 0) / workloads.length || 0;
    const stdDeviation = Math.sqrt(variance);

    // Categorize
    const overloaded = snapshots.filter(s => s.currentWorkload >= 0.9);
    const underutilized = snapshots.filter(s => s.currentWorkload <= 0.3);
    const balanced = snapshots.filter(s => s.currentWorkload > 0.3 && s.currentWorkload < 0.9);

    return {
      snapshots,
      overloaded,
      underutilized,
      balanced,
      avgWorkload,
      stdDeviation,
    };
  }

  /**
   * Generate rebalancing proposal
   */
  async generateRebalanceProposal(
    organizationId: string,
    trigger: RebalanceTrigger,
    triggerDetails?: Record<string, unknown>
  ): Promise<RebalanceProposal> {
    logger.info("Generating rebalance proposal", { organizationId, trigger });

    const analysis = await this.analyzeWorkloadDistribution(organizationId);
    const changes: RebalanceChange[] = [];

    // Strategy 1: Move tasks from overloaded to underutilized agents
    for (const overloaded of analysis.overloaded) {
      if (changes.length >= this.config.maxChangesPerCycle) break;
      if (this.config.protectedAgents.includes(overloaded.agentId)) continue;

      // Find suitable underutilized agents
      const candidates = analysis.underutilized.filter(
        u => !this.config.protectedAgents.includes(u.agentId) &&
             u.departmentId === overloaded.departmentId &&
             this.hasSkillOverlap(u.skills, overloaded.skills)
      );

      if (candidates.length === 0) continue;

      // Sort by best fit (lowest workload + skill match)
      candidates.sort((a, b) => a.currentWorkload - b.currentWorkload);
      const target = candidates[0];

      // Find a task to transfer
      const transferableTask = await this.findTransferableTask(
        organizationId,
        overloaded.agentId,
        target.skills
      );

      if (transferableTask) {
        const workloadDelta = Math.min(0.2, overloaded.currentWorkload - 0.7);

        changes.push({
          action: 'reassign_task',
          sourceAgentId: overloaded.agentId,
          sourceAgentName: overloaded.agentName,
          targetAgentId: target.agentId,
          targetAgentName: target.agentName,
          taskId: transferableTask.id,
          taskTitle: transferableTask.title,
          workloadDelta,
          rationale: `Transfer task from overloaded agent (${Math.round(overloaded.currentWorkload * 100)}%) to underutilized agent (${Math.round(target.currentWorkload * 100)}%)`,
        });
      }
    }

    // Strategy 2: Request backup for critically overloaded with no transfer options
    for (const overloaded of analysis.overloaded.filter(o => o.currentWorkload >= 1.0)) {
      if (changes.length >= this.config.maxChangesPerCycle) break;

      const hasTransfer = changes.some(c => c.sourceAgentId === overloaded.agentId);
      if (hasTransfer) continue;

      changes.push({
        action: 'request_backup',
        sourceAgentId: overloaded.agentId,
        sourceAgentName: overloaded.agentName,
        workloadDelta: overloaded.currentWorkload - 0.8,
        rationale: `Agent critically overloaded (${Math.round(overloaded.currentWorkload * 100)}%) with no transfer options - backup needed`,
      });
    }

    // Calculate expected impact
    const expectedImpact = {
      overloadedAgentsReduced: Math.min(
        analysis.overloaded.length,
        changes.filter(c => c.action === 'reassign_task').length
      ),
      underutilizedAgentsReduced: Math.min(
        analysis.underutilized.length,
        changes.filter(c => c.targetAgentId).length
      ),
      estimatedEfficiencyGain: this.calculateEfficiencyGain(analysis, changes),
    };

    const proposal: RebalanceProposal = {
      id: `rebalance-${Date.now()}`,
      organizationId,
      trigger,
      triggerDetails: triggerDetails || {},
      proposedChanges: changes,
      expectedImpact,
      status: 'pending',
      requiresApproval: changes.length > this.config.autoApproveThreshold,
      createdAt: new Date(),
    };

    // Cache proposal
    const cacheKey = `ar:rebalance:${organizationId}:${proposal.id}`;
    await redis.set(cacheKey, JSON.stringify(proposal), 3600);

    logger.info("Rebalance proposal generated", {
      organizationId,
      proposalId: proposal.id,
      changesCount: changes.length,
      requiresApproval: proposal.requiresApproval,
    });

    return proposal;
  }

  /**
   * Apply a rebalancing proposal
   */
  async applyProposal(
    organizationId: string,
    proposalId: string,
    options?: { partial?: boolean; changeIds?: number[] }
  ): Promise<{
    success: boolean;
    appliedChanges: number;
    errors: string[];
  }> {
    const cacheKey = `ar:rebalance:${organizationId}:${proposalId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return {
        success: false,
        appliedChanges: 0,
        errors: ['Proposal not found or expired'],
      };
    }

    const proposal: RebalanceProposal = JSON.parse(cached);
    const errors: string[] = [];
    let appliedChanges = 0;

    const changesToApply = options?.partial && options.changeIds
      ? proposal.proposedChanges.filter((_, idx) => options.changeIds!.includes(idx))
      : proposal.proposedChanges;

    for (const change of changesToApply) {
      try {
        await this.applyChange(organizationId, change);
        appliedChanges++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to apply change: ${message}`);
      }
    }

    // Update proposal status
    proposal.status = errors.length === 0 ? 'applied' : 'partial';
    proposal.appliedAt = new Date();
    await redis.set(cacheKey, JSON.stringify(proposal), 3600);

    logger.info("Rebalance proposal applied", {
      organizationId,
      proposalId,
      appliedChanges,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      appliedChanges,
      errors,
    };
  }

  /**
   * Apply a single rebalance change
   */
  private async applyChange(
    _organizationId: string,
    change: RebalanceChange
  ): Promise<void> {
    switch (change.action) {
      case 'reassign_task':
        if (!change.taskId || !change.targetAgentId) {
          throw new Error('Task reassignment requires taskId and targetAgentId');
        }

        // Update task assignment
        const task = await prisma.task.findUnique({
          where: { id: change.taskId },
        });

        if (!task) {
          throw new Error(`Task not found: ${change.taskId}`);
        }

        const currentResponsible = task.responsible || [];
        const newResponsible = currentResponsible
          .filter(id => id !== change.sourceAgentId)
          .concat(change.targetAgentId);

        await prisma.task.update({
          where: { id: change.taskId },
          data: { responsible: newResponsible },
        });

        // Update agent workloads
        await this.adjustAgentWorkload(
          change.sourceAgentId,
          -change.workloadDelta
        );
        await this.adjustAgentWorkload(
          change.targetAgentId,
          change.workloadDelta
        );
        break;

      case 'adjust_capacity':
        // Update the agent assignment workload directly
        const assignment = await prisma.agentAssignment.findFirst({
          where: {
            agentId: change.sourceAgentId,
            status: 'active',
          },
        });

        if (assignment) {
          await prisma.agentAssignment.update({
            where: { id: assignment.id },
            data: {
              workload: Math.max(0, Math.min(1, assignment.workload + change.workloadDelta)),
            },
          });
        }
        break;

      case 'request_backup':
        // Log the backup request - in production this would create an approval request
        logger.warn("Backup requested for overloaded agent", {
          agentId: change.sourceAgentId,
          agentName: change.sourceAgentName,
          workloadDelta: change.workloadDelta,
          rationale: change.rationale,
        });
        break;

      default:
        logger.warn("Unknown rebalance action", { action: change.action });
    }
  }

  /**
   * Adjust an agent's workload
   */
  private async adjustAgentWorkload(
    agentId: string,
    delta: number
  ): Promise<void> {
    const assignment = await prisma.agentAssignment.findFirst({
      where: {
        agentId,
        status: 'active',
      },
    });

    if (assignment) {
      const newWorkload = Math.max(0, Math.min(1.5, assignment.workload + delta));
      await prisma.agentAssignment.update({
        where: { id: assignment.id },
        data: { workload: newWorkload },
      });
    }
  }

  /**
   * Find a task that can be transferred
   */
  private async findTransferableTask(
    organizationId: string,
    agentId: string,
    targetSkills: string[]
  ): Promise<{ id: string; title: string } | null> {
    // Find tasks that aren't urgent and can be transferred
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        status: { in: ['1_NotStarted', '2_InProgress'] },
        OR: [
          { responsible: { has: agentId } },
        ],
      },
      orderBy: [
        { dueDate: 'desc' }, // Prefer tasks with later deadlines
      ],
      take: 10,
    });

    // Find task with best skill match based on description keywords
    for (const task of tasks) {
      const taskDescription = (task.description || '').toLowerCase();
      const taskName = task.name.toLowerCase();
      const hasSkillMatch = targetSkills.some(skill =>
        taskDescription.includes(skill.toLowerCase()) ||
        taskName.includes(skill.toLowerCase())
      ) || targetSkills.length === 0;

      if (hasSkillMatch) {
        return { id: task.id, title: task.name };
      }
    }

    // If no skill match, return the least urgent task
    return tasks[0] ? { id: tasks[0].id, title: tasks[0].name } : null;
  }

  /**
   * Check if two skill sets have overlap
   */
  private hasSkillOverlap(skills1: string[], skills2: string[]): boolean {
    if (skills1.length === 0 || skills2.length === 0) return true;

    return skills1.some(s1 =>
      skills2.some(s2 =>
        s1.toLowerCase().includes(s2.toLowerCase()) ||
        s2.toLowerCase().includes(s1.toLowerCase())
      )
    );
  }

  /**
   * Calculate expected efficiency gain
   */
  private calculateEfficiencyGain(
    _analysis: Awaited<ReturnType<typeof this.analyzeWorkloadDistribution>>,
    changes: RebalanceChange[]
  ): number {
    // Simple efficiency metric based on number of task transfers
    const transferCount = changes.filter(c => c.action === 'reassign_task').length;
    const estimatedReduction = transferCount * 0.05; // 5% improvement per transfer

    return Math.min(0.3, estimatedReduction); // Cap at 30%
  }

  /**
   * Get rebalancing history
   * Note: In production, this would query a database table
   */
  async getRebalanceHistory(
    _organizationId: string,
    _limit: number = 10
  ): Promise<RebalanceProposal[]> {
    // TODO: Implement with database storage
    // Redis doesn't support pattern-based key retrieval in our abstraction
    // Return empty array for now - production would use a proper storage
    return [];
  }
}

// Export singleton instance
export const workloadRebalancerService = new WorkloadRebalancerService();
