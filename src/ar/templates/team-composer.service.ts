/**
 * Team Composer Service
 *
 * Composes optimal teams based on templates and available agents/resources.
 * Handles agent-to-position matching, skill gap analysis, and team formation.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";
import { PositionLevel } from "../types";

// =============================================================================
// TYPES
// =============================================================================

export interface TeamCompositionRequest {
  organizationId: string;
  templateId?: string;
  targetDepartmentId?: string;
  projectId?: string;
  requirements?: {
    minAgents?: number;
    maxAgents?: number;
    requiredSkills?: string[];
    preferredModelTier?: 'opus' | 'sonnet' | 'haiku';
    budgetConstraintCents?: number;
  };
}

export interface AgentCandidate {
  agentId: string;
  agentName: string;
  currentPositionId?: string;
  currentWorkload: number;
  skills: string[];
  modelTier: string;
  performanceScore: number | null;
  fitScore: number;
  fitDetails: {
    skillMatch: number;
    availabilityScore: number;
    performanceBonus: number;
  };
}

export interface PositionAssignment {
  positionId: string;
  positionTitle: string;
  positionLevel: PositionLevel;
  requiredSkills: string[];
  assignedAgent: AgentCandidate | null;
  alternativeCandidates: AgentCandidate[];
  isFilled: boolean;
  isOptimal: boolean;
  notes: string[];
}

export interface SkillGap {
  skill: string;
  required: boolean;
  positionsNeedingSkill: string[];
  availableAgentsWithSkill: number;
  gap: number; // negative means shortage
  recommendation: string;
}

export interface TeamComposition {
  id: string;
  organizationId: string;
  composedAt: Date;
  templateId?: string;
  assignments: PositionAssignment[];
  skillGaps: SkillGap[];
  metrics: {
    totalPositions: number;
    filledPositions: number;
    optimalAssignments: number;
    averageFitScore: number;
    estimatedMonthlyCostCents: number;
  };
  recommendations: string[];
  status: 'draft' | 'proposed' | 'approved' | 'applied';
}

// =============================================================================
// SERVICE
// =============================================================================

export class TeamComposerService {
  /**
   * Compose a team based on request parameters
   */
  async composeTeam(request: TeamCompositionRequest): Promise<TeamComposition> {
    logger.info("Composing team", {
      organizationId: request.organizationId,
      templateId: request.templateId,
    });

    const startTime = Date.now();

    // Get available agents
    const availableAgents = await this.getAvailableAgents(request.organizationId);

    // Get positions to fill
    const positions = await this.getPositionsToFill(request);

    // Match agents to positions
    const assignments = await this.matchAgentsToPositions(
      availableAgents,
      positions,
      request.requirements
    );

    // Analyze skill gaps
    const skillGaps = this.analyzeSkillGaps(assignments, availableAgents);

    // Calculate metrics
    const metrics = this.calculateMetrics(assignments);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      assignments,
      skillGaps,
      request.requirements
    );

    const composition: TeamComposition = {
      id: `composition-${Date.now()}`,
      organizationId: request.organizationId,
      composedAt: new Date(),
      templateId: request.templateId,
      assignments,
      skillGaps,
      metrics,
      recommendations,
      status: 'draft',
    };

    // Cache composition
    const cacheKey = `ar:team-composition:${composition.id}`;
    await redis.set(cacheKey, JSON.stringify(composition), 3600);

    logger.info("Team composition complete", {
      compositionId: composition.id,
      totalPositions: metrics.totalPositions,
      filledPositions: metrics.filledPositions,
      durationMs: Date.now() - startTime,
    });

    return composition;
  }

  /**
   * Get available agents for assignment
   */
  private async getAvailableAgents(organizationId: string): Promise<AgentCandidate[]> {
    const agents = await prisma.agent.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      include: {
        arAssignments: {
          where: { status: 'active' },
          include: { position: true },
        },
      },
    });

    return agents.map(agent => {
      const currentAssignment = agent.arAssignments[0];
      // Get model tier from metadata if available
      const metadata = agent.metadata as Record<string, unknown> | null;
      const modelTier = (metadata?.modelTier as string) || 'sonnet';

      return {
        agentId: agent.id,
        agentName: agent.name,
        currentPositionId: currentAssignment?.positionId,
        currentWorkload: currentAssignment?.workload || 0,
        skills: agent.skills || [],
        modelTier,
        performanceScore: currentAssignment?.performanceScore || null,
        fitScore: 0, // Will be calculated during matching
        fitDetails: {
          skillMatch: 0,
          availabilityScore: 0,
          performanceBonus: 0,
        },
      };
    });
  }

  /**
   * Get positions that need to be filled
   */
  private async getPositionsToFill(
    request: TeamCompositionRequest
  ): Promise<any[]> {
    // If template provided, use template positions
    if (request.templateId) {
      const template = await prisma.aRIndustryTemplate.findUnique({
        where: { id: request.templateId },
      });

      if (template) {
        const departments = template.departments as any[] || [];
        const positions: any[] = [];

        for (const dept of departments) {
          const deptPositions = dept.positions || [];
          for (const pos of deptPositions) {
            const count = pos.count || 1;
            for (let i = 0; i < count; i++) {
              positions.push({
                id: `template-${dept.name}-${pos.title}-${i}`,
                title: pos.title,
                level: pos.level || 1,
                requiredSkills: pos.skills || [],
                departmentName: dept.name,
                isFromTemplate: true,
              });
            }
          }
        }

        return positions;
      }
    }

    // Otherwise, use existing organization positions
    const whereClause: any = {
      organizationId: request.organizationId,
    };

    if (request.targetDepartmentId) {
      whereClause.departmentId = request.targetDepartmentId;
    }

    const positions = await prisma.agentPosition.findMany({
      where: whereClause,
      include: {
        department: true,
        assignments: {
          where: { status: 'active' },
        },
      },
    });

    // Filter to unfilled or understaffed positions
    return positions.filter(pos => {
      const currentAssignments = pos.assignments.length;
      return currentAssignments < pos.maxConcurrent;
    }).map(pos => ({
      id: pos.id,
      title: pos.title,
      level: pos.level,
      requiredSkills: pos.requiredSkills || [],
      departmentName: pos.department.name,
      isFromTemplate: false,
      maxConcurrent: pos.maxConcurrent,
      currentAssignments: pos.assignments.length,
    }));
  }

  /**
   * Match agents to positions using optimization
   */
  private async matchAgentsToPositions(
    agents: AgentCandidate[],
    positions: any[],
    requirements?: TeamCompositionRequest['requirements']
  ): Promise<PositionAssignment[]> {
    const assignments: PositionAssignment[] = [];
    const assignedAgentIds = new Set<string>();

    // Sort positions by level (higher level first - more critical to fill)
    const sortedPositions = [...positions].sort((a, b) => b.level - a.level);

    for (const position of sortedPositions) {
      // Score all available agents for this position
      const candidates = agents
        .filter(agent => !assignedAgentIds.has(agent.agentId))
        .map(agent => this.scoreAgentForPosition(agent, position, requirements))
        .sort((a, b) => b.fitScore - a.fitScore);

      const bestCandidate = candidates[0];
      const isOptimal = bestCandidate && bestCandidate.fitScore >= 70;

      if (bestCandidate && bestCandidate.fitScore >= 40) {
        assignedAgentIds.add(bestCandidate.agentId);
      }

      const notes: string[] = [];
      if (!bestCandidate) {
        notes.push('No available agents for this position');
      } else if (bestCandidate.fitScore < 40) {
        notes.push('No suitable candidates found - position may need different requirements');
      } else if (!isOptimal) {
        notes.push('Assigned agent is a partial match - consider training or recruiting');
      }

      assignments.push({
        positionId: position.id,
        positionTitle: position.title,
        positionLevel: position.level as PositionLevel,
        requiredSkills: position.requiredSkills,
        assignedAgent: bestCandidate && bestCandidate.fitScore >= 40 ? bestCandidate : null,
        alternativeCandidates: candidates.slice(1, 4), // Top 3 alternatives
        isFilled: !!(bestCandidate && bestCandidate.fitScore >= 40),
        isOptimal,
        notes,
      });
    }

    return assignments;
  }

  /**
   * Score an agent for a specific position
   */
  private scoreAgentForPosition(
    agent: AgentCandidate,
    position: any,
    requirements?: TeamCompositionRequest['requirements']
  ): AgentCandidate {
    // Skill match (0-100)
    const requiredSkills = position.requiredSkills || [];
    let skillMatch = 0;

    if (requiredSkills.length === 0) {
      skillMatch = 70; // Default if no skills required
    } else {
      const matchedSkills = requiredSkills.filter((skill: string) =>
        agent.skills.some(agentSkill =>
          agentSkill.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(agentSkill.toLowerCase())
        )
      );
      skillMatch = Math.round((matchedSkills.length / requiredSkills.length) * 100);
    }

    // Availability score (0-100)
    const availabilityScore = Math.round((1 - agent.currentWorkload) * 100);

    // Performance bonus (0-20)
    const performanceBonus = agent.performanceScore
      ? Math.min(20, Math.round(agent.performanceScore / 5))
      : 10; // Default if no score

    // Model tier bonus for level match
    let tierBonus = 0;
    if (position.level >= 4 && agent.modelTier === 'opus') tierBonus = 10;
    else if (position.level <= 2 && agent.modelTier === 'haiku') tierBonus = 5;

    // Requirements check
    let requirementPenalty = 0;
    if (requirements?.preferredModelTier && agent.modelTier !== requirements.preferredModelTier) {
      requirementPenalty = 10;
    }

    // Calculate fit score
    const fitScore = Math.min(100, Math.max(0,
      skillMatch * 0.5 +
      availabilityScore * 0.3 +
      performanceBonus +
      tierBonus -
      requirementPenalty
    ));

    return {
      ...agent,
      fitScore: Math.round(fitScore),
      fitDetails: {
        skillMatch,
        availabilityScore,
        performanceBonus,
      },
    };
  }

  /**
   * Analyze skill gaps in the team composition
   */
  private analyzeSkillGaps(
    assignments: PositionAssignment[],
    availableAgents: AgentCandidate[]
  ): SkillGap[] {
    const skillDemand = new Map<string, { positions: string[]; required: boolean }>();
    const skillSupply = new Map<string, number>();

    // Calculate demand
    for (const assignment of assignments) {
      for (const skill of assignment.requiredSkills) {
        const existing = skillDemand.get(skill) || { positions: [], required: true };
        existing.positions.push(assignment.positionTitle);
        skillDemand.set(skill, existing);
      }
    }

    // Calculate supply
    for (const agent of availableAgents) {
      for (const skill of agent.skills) {
        skillSupply.set(skill, (skillSupply.get(skill) || 0) + 1);
      }
    }

    // Identify gaps
    const gaps: SkillGap[] = [];

    for (const [skill, demand] of skillDemand.entries()) {
      const supply = skillSupply.get(skill) || 0;
      const gap = supply - demand.positions.length;

      if (gap < 0) {
        let recommendation = '';
        if (gap <= -3) {
          recommendation = 'Critical shortage - prioritize recruiting or training';
        } else if (gap <= -1) {
          recommendation = 'Consider adding agents with this skill';
        } else {
          recommendation = 'Minor gap - monitor and address as needed';
        }

        gaps.push({
          skill,
          required: demand.required,
          positionsNeedingSkill: demand.positions,
          availableAgentsWithSkill: supply,
          gap,
          recommendation,
        });
      }
    }

    // Sort by gap severity
    gaps.sort((a, b) => a.gap - b.gap);

    return gaps;
  }

  /**
   * Calculate composition metrics
   */
  private calculateMetrics(
    assignments: PositionAssignment[]
  ): TeamComposition['metrics'] {
    const totalPositions = assignments.length;
    const filledPositions = assignments.filter(a => a.isFilled).length;
    const optimalAssignments = assignments.filter(a => a.isOptimal).length;

    const assignedAgents = assignments
      .filter(a => a.assignedAgent)
      .map(a => a.assignedAgent!);

    const averageFitScore = assignedAgents.length > 0
      ? Math.round(assignedAgents.reduce((sum, a) => sum + a.fitScore, 0) / assignedAgents.length)
      : 0;

    // Estimate monthly cost (simplified)
    const costPerTier: Record<string, number> = {
      opus: 100000,   // $1000/month
      sonnet: 50000,  // $500/month
      haiku: 20000,   // $200/month
    };

    const estimatedMonthlyCostCents = assignedAgents.reduce(
      (sum, agent) => sum + (costPerTier[agent.modelTier] || 50000),
      0
    );

    return {
      totalPositions,
      filledPositions,
      optimalAssignments,
      averageFitScore,
      estimatedMonthlyCostCents,
    };
  }

  /**
   * Generate recommendations based on composition analysis
   */
  private generateRecommendations(
    assignments: PositionAssignment[],
    skillGaps: SkillGap[],
    requirements?: TeamCompositionRequest['requirements']
  ): string[] {
    const recommendations: string[] = [];

    // Fill rate recommendation
    const fillRate = assignments.filter(a => a.isFilled).length / assignments.length;
    if (fillRate < 0.5) {
      recommendations.push(
        'Less than 50% of positions filled - consider recruiting additional agents or relaxing requirements'
      );
    } else if (fillRate < 0.8) {
      recommendations.push(
        'Some positions remain unfilled - review skill requirements and agent availability'
      );
    }

    // Optimal rate recommendation
    const optimalRate = assignments.filter(a => a.isOptimal).length / assignments.length;
    if (optimalRate < 0.6 && fillRate >= 0.5) {
      recommendations.push(
        'Many assignments are suboptimal - consider agent training or role adjustments'
      );
    }

    // Skill gap recommendations
    const criticalGaps = skillGaps.filter(g => g.gap <= -2);
    if (criticalGaps.length > 0) {
      recommendations.push(
        `Critical skill gaps identified: ${criticalGaps.map(g => g.skill).join(', ')}`
      );
    }

    // Budget recommendation
    if (requirements?.budgetConstraintCents) {
      const estimated = assignments
        .filter(a => a.assignedAgent)
        .reduce((sum, a) => {
          const costMap: Record<string, number> = { opus: 100000, sonnet: 50000, haiku: 20000 };
          return sum + (costMap[a.assignedAgent!.modelTier] || 50000);
        }, 0);

      if (estimated > requirements.budgetConstraintCents) {
        recommendations.push(
          'Estimated cost exceeds budget - consider using lower-tier models for some positions'
        );
      }
    }

    // Level distribution recommendation
    const highLevelPositions = assignments.filter(a => a.positionLevel >= 4);
    const highLevelFilled = highLevelPositions.filter(a => a.isFilled && a.isOptimal);
    if (highLevelFilled.length < highLevelPositions.length * 0.8) {
      recommendations.push(
        'Leadership positions need stronger candidates - prioritize senior agent recruitment'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Team composition looks optimal - proceed with implementation');
    }

    return recommendations;
  }

  /**
   * Apply a team composition
   */
  async applyComposition(
    compositionId: string,
    _actorId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const cacheKey = `ar:team-composition:${compositionId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return { success: false, errors: ['Composition not found or expired'] };
    }

    const composition: TeamComposition = JSON.parse(cached);
    const errors: string[] = [];

    // Apply each assignment
    for (const assignment of composition.assignments) {
      if (!assignment.isFilled || !assignment.assignedAgent) continue;

      try {
        // Create or update assignment
        await prisma.agentAssignment.create({
          data: {
            organizationId: composition.organizationId,
            agentId: assignment.assignedAgent.agentId,
            positionId: assignment.positionId,
            assignmentType: 'permanent',
            status: 'active',
            workload: 1.0,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to assign ${assignment.assignedAgent.agentName}: ${message}`);
      }
    }

    // Update composition status
    composition.status = errors.length === 0 ? 'applied' : 'proposed';
    await redis.set(cacheKey, JSON.stringify(composition), 3600);

    logger.info("Team composition applied", {
      compositionId,
      assignmentsApplied: composition.assignments.filter(a => a.isFilled).length,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const teamComposerService = new TeamComposerService();
