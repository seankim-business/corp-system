/**
 * Goal Alignment Service
 *
 * Analyzes agent contributions to organizational goals and calculates alignment scores.
 * Tracks how agent activities map to strategic objectives.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface Goal {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  ownerPositionId: string | null;
  dueDate: Date | null;
  progress: number;
  parentGoalId: string | null;
  description: string | null;
}

export interface Contribution {
  taskId: string;
  taskName: string;
  completedAt: Date;
  goalRelevance: number; // 0-1 score
  impact: 'low' | 'medium' | 'high';
}

export interface GoalAlignmentRecord {
  id: string;
  organizationId: string;
  agentId: string;
  goalId: string;
  alignmentScore: number;
  contribution: string;
  evidenceLinks: string[];
  analysisDate: Date;
  createdAt: Date;
}

export interface AlignmentReport {
  organizationId: string;
  reportDate: Date;
  totalGoals: number;
  activeGoals: number;
  agentAlignments: Array<{
    agentId: string;
    agentName: string;
    avgAlignmentScore: number;
    contributedGoals: number;
    topGoals: Array<{
      goalId: string;
      goalTitle: string;
      alignmentScore: number;
    }>;
  }>;
  departmentAlignments: Array<{
    departmentId: string;
    departmentName: string;
    avgAlignmentScore: number;
    totalContributions: number;
  }>;
  unalignedAgents: Array<{
    agentId: string;
    agentName: string;
    daysSinceContribution: number;
  }>;
}

export class GoalAlignmentService {
  /**
   * Analyze agent's alignment with goals based on recent contributions
   */
  async analyzeAlignment(agentId: string, goals: Goal[]): Promise<GoalAlignmentRecord> {
    logger.info("Analyzing goal alignment for agent", { agentId, goalCount: goals.length });

    const agent = await prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get recent tasks for agent
    const recentTasks = await prisma.task.findMany({
      where: {
        organizationId: agent.organizationId,
        OR: [
          { responsible: { has: agentId } },
          { accountable: { has: agentId } }
        ],
        status: '5_Done',
        updatedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });

    const contributions: Contribution[] = recentTasks.map(task => ({
      taskId: task.id,
      taskName: task.name,
      completedAt: task.updatedAt,
      goalRelevance: this.calculateTaskGoalRelevance(task, goals),
      impact: this.determineImpact(task)
    }));

    // For each active goal, calculate alignment
    const alignmentRecords: GoalAlignmentRecord[] = [];

    for (const goal of goals.filter(g => g.status === 'active')) {
      const alignmentScore = await this.calculateAlignmentScore(contributions, [goal]);
      const contribution = this.describeContribution(contributions, goal);
      const evidenceLinks = contributions
        .filter(c => c.goalRelevance > 0.3)
        .map(c => c.taskId);

      const record = await prisma.goalAlignmentRecord.create({
        data: {
          organizationId: agent.organizationId,
          agentId,
          goalId: goal.id,
          alignmentScore,
          contribution,
          evidenceLinks,
          analysisDate: new Date()
        }
      });

      alignmentRecords.push(this.mapToGoalAlignmentRecord(record));
    }

    logger.info("Goal alignment analysis complete", {
      agentId,
      recordsCreated: alignmentRecords.length
    });

    // Return the record with highest alignment
    return alignmentRecords.sort((a, b) => b.alignmentScore - a.alignmentScore)[0];
  }

  /**
   * Calculate alignment score based on contributions and goals
   */
  async calculateAlignmentScore(contributions: Contribution[], goals: Goal[]): Promise<number> {
    if (contributions.length === 0 || goals.length === 0) {
      return 0;
    }

    // Calculate weighted average of goal relevance
    const totalRelevance = contributions.reduce((sum, c) => sum + c.goalRelevance, 0);
    const avgRelevance = totalRelevance / contributions.length;

    // Factor in impact
    const impactWeights = { low: 0.5, medium: 1.0, high: 1.5 };
    const weightedImpact = contributions.reduce((sum, c) => sum + impactWeights[c.impact], 0) / contributions.length;

    // Calculate final score (0-100)
    const alignmentScore = (avgRelevance * weightedImpact) * 100;

    return Math.min(Math.round(alignmentScore), 100);
  }

  /**
   * Get alignment history for an agent on a specific goal
   */
  async getAlignmentHistory(agentId: string, goalId: string): Promise<GoalAlignmentRecord[]> {
    const records = await prisma.goalAlignmentRecord.findMany({
      where: {
        agentId,
        goalId
      },
      orderBy: {
        analysisDate: 'desc'
      },
      take: 30 // Last 30 records
    });

    return records.map(r => this.mapToGoalAlignmentRecord(r));
  }

  /**
   * Generate alignment report for the entire organization
   */
  async generateAlignmentReport(organizationId: string): Promise<AlignmentReport> {
    logger.info("Generating alignment report", { organizationId });

    // Get all active goals
    const goals = await prisma.goal.findMany({
      where: { organizationId }
    });

    const activeGoals = goals.filter(g => g.status === 'active');

    // Get recent alignment records
    const recentRecords = await prisma.goalAlignmentRecord.findMany({
      where: {
        organizationId,
        analysisDate: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    // Group by agent
    const agentAlignmentMap = new Map<string, {
      scores: number[];
      goals: Set<string>;
      goalScores: Map<string, number>;
    }>();

    for (const record of recentRecords) {
      const existing = agentAlignmentMap.get(record.agentId) || {
        scores: [] as number[],
        goals: new Set<string>(),
        goalScores: new Map<string, number>()
      };
      existing.scores.push(record.alignmentScore);
      existing.goals.add(record.goalId);
      existing.goalScores.set(record.goalId, record.alignmentScore);
      agentAlignmentMap.set(record.agentId, existing);
    }

    // Build agent alignments
    const agents = await prisma.agent.findMany({
      where: {
        organizationId,
        id: { in: Array.from(agentAlignmentMap.keys()) }
      }
    });

    const agentAlignments = agents.map(agent => {
      const data = agentAlignmentMap.get(agent.id)!;
      const avgAlignmentScore = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;

      // Get top 3 goals
      const topGoals = Array.from(data.goalScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([goalId, score]) => {
          const goal = goals.find(g => g.id === goalId);
          return {
            goalId,
            goalTitle: goal?.title || 'Unknown',
            alignmentScore: score
          };
        });

      return {
        agentId: agent.id,
        agentName: agent.name,
        avgAlignmentScore: Math.round(avgAlignmentScore),
        contributedGoals: data.goals.size,
        topGoals
      };
    });

    // Build department alignments
    const departments = await prisma.agentDepartment.findMany({
      where: { organizationId, status: 'active' },
      include: {
        positions: {
          include: {
            assignments: {
              where: { status: 'active' }
            }
          }
        }
      }
    });

    const departmentAlignments = departments.map(dept => {
      const deptAgentIds = dept.positions.flatMap(p => p.assignments.map(a => a.agentId));
      const deptRecords = recentRecords.filter(r => deptAgentIds.includes(r.agentId));

      const avgScore = deptRecords.length > 0
        ? deptRecords.reduce((sum, r) => sum + r.alignmentScore, 0) / deptRecords.length
        : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        avgAlignmentScore: Math.round(avgScore),
        totalContributions: deptRecords.length
      };
    });

    // Find unaligned agents
    const allAgents = await prisma.agent.findMany({
      where: { organizationId, status: 'active' }
    });

    const unalignedAgents = allAgents
      .filter(agent => !agentAlignmentMap.has(agent.id))
      .map(agent => ({
        agentId: agent.id,
        agentName: agent.name,
        daysSinceContribution: this.calculateDaysSinceContribution(agent.id, recentRecords)
      }));

    return {
      organizationId,
      reportDate: new Date(),
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      agentAlignments: agentAlignments.sort((a, b) => b.avgAlignmentScore - a.avgAlignmentScore),
      departmentAlignments: departmentAlignments.sort((a, b) => b.avgAlignmentScore - a.avgAlignmentScore),
      unalignedAgents
    };
  }

  /**
   * Calculate task-goal relevance using keyword matching
   */
  private calculateTaskGoalRelevance(task: any, goals: Goal[]): number {
    if (goals.length === 0) return 0;

    const taskText = `${task.name} ${task.description || ''}`.toLowerCase();
    const goalTexts = goals.map(g => `${g.title} ${g.description || ''}`.toLowerCase());

    // Simple keyword overlap score
    const taskWords = new Set(taskText.split(/\s+/).filter(w => w.length > 3));
    let maxOverlap = 0;

    for (const goalText of goalTexts) {
      const goalWords = new Set(goalText.split(/\s+/).filter(w => w.length > 3));
      const overlap = Array.from(taskWords).filter(w => goalWords.has(w)).length;
      const relevance = Math.min(overlap / Math.max(taskWords.size, goalWords.size), 1.0);
      maxOverlap = Math.max(maxOverlap, relevance);
    }

    return maxOverlap;
  }

  /**
   * Determine task impact level
   */
  private determineImpact(task: any): 'low' | 'medium' | 'high' {
    const importanceScore = task.importanceScore || 0;
    const urgencyScore = task.urgencyScore || 0;

    const totalScore = importanceScore + urgencyScore;

    if (totalScore >= 15) return 'high';
    if (totalScore >= 8) return 'medium';
    return 'low';
  }

  /**
   * Describe agent's contribution to a goal
   */
  private describeContribution(contributions: Contribution[], _goal: Goal): string {
    const relevantContributions = contributions.filter(c => c.goalRelevance > 0.3);

    if (relevantContributions.length === 0) {
      return 'No direct contributions detected';
    }

    const taskCount = relevantContributions.length;
    const highImpact = relevantContributions.filter(c => c.impact === 'high').length;

    return `Completed ${taskCount} task(s) aligned with this goal${highImpact > 0 ? `, including ${highImpact} high-impact task(s)` : ''}`;
  }

  /**
   * Calculate days since last contribution
   */
  private calculateDaysSinceContribution(agentId: string, records: any[]): number {
    const agentRecords = records.filter(r => r.agentId === agentId);

    if (agentRecords.length === 0) {
      return 999; // No records
    }

    const mostRecent = agentRecords.sort((a, b) =>
      b.analysisDate.getTime() - a.analysisDate.getTime()
    )[0];

    const daysSince = Math.floor((Date.now() - mostRecent.analysisDate.getTime()) / (24 * 60 * 60 * 1000));
    return daysSince;
  }

  /**
   * Map database record to GoalAlignmentRecord interface
   */
  private mapToGoalAlignmentRecord(record: any): GoalAlignmentRecord {
    return {
      id: record.id,
      organizationId: record.organizationId,
      agentId: record.agentId,
      goalId: record.goalId,
      alignmentScore: record.alignmentScore,
      contribution: record.contribution,
      evidenceLinks: record.evidenceLinks,
      analysisDate: record.analysisDate,
      createdAt: record.createdAt
    };
  }
}
