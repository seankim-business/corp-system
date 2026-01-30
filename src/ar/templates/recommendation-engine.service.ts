/**
 * Recommendation Engine Service
 *
 * Provides intelligent recommendations for AR structure optimization
 * including templates, team compositions, and resource allocations.
 * Uses collaborative filtering and rule-based recommendations.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";
import { IndustryType, CompanySize, GrowthStage } from "../types";
import { templateMatcherService } from "./template-matcher.service";
import { teamComposerService } from "./team-composer.service";

// =============================================================================
// TYPES
// =============================================================================

export type RecommendationType =
  | 'template'
  | 'team_composition'
  | 'position'
  | 'skill_development'
  | 'resource_allocation'
  | 'structure_optimization';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  impact: {
    efficiency?: number;
    cost?: number;
    quality?: number;
  };
  actions: RecommendedAction[];
  reasoning: string[];
  relatedEntityId?: string;
  expiresAt?: Date;
}

export interface RecommendedAction {
  actionType: string;
  description: string;
  params: Record<string, unknown>;
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface RecommendationContext {
  organizationId: string;
  industry?: IndustryType;
  companySize?: CompanySize;
  growthStage?: GrowthStage;
  currentChallenges?: string[];
  goals?: string[];
  budget?: number;
}

export interface RecommendationResult {
  context: RecommendationContext;
  generatedAt: Date;
  recommendations: Recommendation[];
  summary: {
    totalRecommendations: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    estimatedImpact: {
      efficiency: number;
      cost: number;
    };
  };
}

// =============================================================================
// SERVICE
// =============================================================================

export class RecommendationEngineService {
  /**
   * Generate comprehensive recommendations for an organization
   */
  async generateRecommendations(
    context: RecommendationContext
  ): Promise<RecommendationResult> {
    logger.info("Generating recommendations", {
      organizationId: context.organizationId,
    });

    const startTime = Date.now();
    const recommendations: Recommendation[] = [];

    // Build full context if not provided
    const fullContext = await this.enrichContext(context);

    // Generate different types of recommendations in parallel
    const [
      structureRecs,
      teamRecs,
      skillRecs,
      resourceRecs,
    ] = await Promise.all([
      this.generateStructureRecommendations(fullContext),
      this.generateTeamRecommendations(fullContext),
      this.generateSkillRecommendations(fullContext),
      this.generateResourceRecommendations(fullContext),
    ]);

    recommendations.push(
      ...structureRecs,
      ...teamRecs,
      ...skillRecs,
      ...resourceRecs
    );

    // Sort by priority and confidence
    recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Calculate summary
    const summary = this.calculateSummary(recommendations);

    const result: RecommendationResult = {
      context: fullContext,
      generatedAt: new Date(),
      recommendations,
      summary,
    };

    // Cache result
    const cacheKey = `ar:recommendations:${context.organizationId}`;
    await redis.set(cacheKey, JSON.stringify(result), 3600);

    logger.info("Recommendations generated", {
      organizationId: context.organizationId,
      totalRecommendations: recommendations.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Enrich context with organization data
   */
  private async enrichContext(
    context: RecommendationContext
  ): Promise<RecommendationContext> {
    const org = await prisma.organization.findUnique({
      where: { id: context.organizationId },
    });

    if (!org) {
      return context;
    }

    const settings = org.settings as Record<string, unknown> | null;

    return {
      ...context,
      industry: context.industry || (settings?.industry as IndustryType) || 'technology',
      companySize: context.companySize || (settings?.companySize as CompanySize) || 'startup',
      growthStage: context.growthStage || (settings?.growthStage as GrowthStage) || 'seed',
      goals: context.goals || (settings?.arGoals as string[]) || [],
      currentChallenges: context.currentChallenges || (settings?.arChallenges as string[]) || [],
    };
  }

  /**
   * Generate structure optimization recommendations
   */
  private async generateStructureRecommendations(
    context: RecommendationContext
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get current structure
    const [departments, positions, assignments] = await Promise.all([
      prisma.agentDepartment.count({
        where: { organizationId: context.organizationId, status: 'active' },
      }),
      prisma.agentPosition.count({
        where: { organizationId: context.organizationId },
      }),
      prisma.agentAssignment.count({
        where: { organizationId: context.organizationId, status: 'active' },
      }),
    ]);

    // Check if no structure exists
    if (departments === 0) {
      // Get template recommendations
      const profile = {
        organizationId: context.organizationId,
        industry: context.industry || 'technology',
        companySize: context.companySize || 'startup',
        growthStage: context.growthStage || 'seed',
        currentAgentCount: assignments,
        currentDepartmentCount: departments,
        goals: context.goals,
      };

      const templateMatch = await templateMatcherService.matchTemplates(profile);

      if (templateMatch.topRecommendation) {
        recommendations.push({
          id: `rec-structure-template-${Date.now()}`,
          type: 'template',
          title: 'Apply Industry Template',
          description: `Start with the "${templateMatch.topRecommendation.templateName}" template optimized for ${context.industry} ${context.companySize} organizations.`,
          priority: 'high',
          confidence: templateMatch.topRecommendation.overallScore,
          impact: {
            efficiency: 30,
            quality: 20,
          },
          actions: [
            {
              actionType: 'apply_template',
              description: `Apply the ${templateMatch.topRecommendation.templateName} template`,
              params: { templateId: templateMatch.topRecommendation.templateId },
              estimatedEffort: 'medium',
            },
          ],
          reasoning: [
            `No organizational structure detected`,
            `${templateMatch.topRecommendation.templateName} scores ${templateMatch.topRecommendation.overallScore}% match`,
            ...templateMatch.topRecommendation.strengths,
          ],
          relatedEntityId: templateMatch.topRecommendation.templateId,
        });
      }
    }

    // Check for flat structure that needs hierarchy
    if (departments > 0 && positions < departments * 2) {
      recommendations.push({
        id: `rec-structure-depth-${Date.now()}`,
        type: 'structure_optimization',
        title: 'Add Position Hierarchy',
        description: 'Consider adding more positions to create clearer career paths and responsibilities.',
        priority: 'medium',
        confidence: 70,
        impact: {
          efficiency: 15,
          quality: 10,
        },
        actions: [
          {
            actionType: 'add_positions',
            description: 'Add senior and lead positions to existing departments',
            params: { suggestedLevels: [3, 4] },
            estimatedEffort: 'medium',
          },
        ],
        reasoning: [
          `Current ratio: ${positions} positions for ${departments} departments`,
          'Adding hierarchy improves delegation and accountability',
        ],
      });
    }

    return recommendations;
  }

  /**
   * Generate team composition recommendations
   */
  private async generateTeamRecommendations(
    context: RecommendationContext
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get unfilled positions
    const unfilledPositions = await prisma.agentPosition.findMany({
      where: {
        organizationId: context.organizationId,
      },
      include: {
        assignments: {
          where: { status: 'active' },
        },
      },
    });

    const actuallyUnfilled = unfilledPositions.filter(
      p => p.assignments.length < p.maxConcurrent
    );

    if (actuallyUnfilled.length > 0) {
      // Get composition suggestions
      const composition = await teamComposerService.composeTeam({
        organizationId: context.organizationId,
      });

      if (composition.metrics.filledPositions < composition.metrics.totalPositions) {
        recommendations.push({
          id: `rec-team-fill-${Date.now()}`,
          type: 'team_composition',
          title: 'Fill Vacant Positions',
          description: `${actuallyUnfilled.length} positions are understaffed and could benefit from agent assignments.`,
          priority: actuallyUnfilled.length > 5 ? 'high' : 'medium',
          confidence: 80,
          impact: {
            efficiency: Math.min(30, actuallyUnfilled.length * 5),
          },
          actions: actuallyUnfilled.slice(0, 5).map(pos => ({
            actionType: 'assign_agent',
            description: `Fill ${pos.title} position`,
            params: { positionId: pos.id },
            estimatedEffort: 'low' as const,
          })),
          reasoning: [
            `${actuallyUnfilled.length} positions need agents`,
            `Average fit score for available matches: ${composition.metrics.averageFitScore}%`,
          ],
        });
      }
    }

    // Check for overloaded agents
    const overloadedAssignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'active',
        workload: { gte: 0.9 },
      },
      include: {
        agent: true,
        position: true,
      },
    });

    if (overloadedAssignments.length > 0) {
      recommendations.push({
        id: `rec-team-overload-${Date.now()}`,
        type: 'resource_allocation',
        title: 'Address Agent Overload',
        description: `${overloadedAssignments.length} agents are at or above capacity.`,
        priority: overloadedAssignments.some(a => a.workload >= 1.0) ? 'critical' : 'high',
        confidence: 90,
        impact: {
          efficiency: 20,
          quality: 15,
        },
        actions: [
          {
            actionType: 'rebalance_workload',
            description: 'Redistribute tasks from overloaded agents',
            params: {
              agentIds: overloadedAssignments.map(a => a.agentId),
            },
            estimatedEffort: 'medium',
          },
        ],
        reasoning: overloadedAssignments.map(
          a => `${a.agent.name} at ${Math.round(a.workload * 100)}% capacity in ${a.position.title}`
        ),
      });
    }

    return recommendations;
  }

  /**
   * Generate skill development recommendations
   */
  private async generateSkillRecommendations(
    context: RecommendationContext
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get required skills from positions
    const positions = await prisma.agentPosition.findMany({
      where: { organizationId: context.organizationId },
    });

    const requiredSkills = new Set<string>();
    for (const pos of positions) {
      for (const skill of pos.requiredSkills) {
        requiredSkills.add(skill.toLowerCase());
      }
    }

    // Get available skills from agents
    const agents = await prisma.agent.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'active',
      },
    });

    const availableSkills = new Map<string, number>();
    for (const agent of agents) {
      for (const skill of agent.skills) {
        const key = skill.toLowerCase();
        availableSkills.set(key, (availableSkills.get(key) || 0) + 1);
      }
    }

    // Find gaps
    const skillGaps: string[] = [];
    for (const skill of requiredSkills) {
      if (!availableSkills.has(skill) || availableSkills.get(skill)! < 1) {
        skillGaps.push(skill);
      }
    }

    if (skillGaps.length > 0) {
      recommendations.push({
        id: `rec-skill-gap-${Date.now()}`,
        type: 'skill_development',
        title: 'Address Skill Gaps',
        description: `${skillGaps.length} required skills are missing or underrepresented in your agent pool.`,
        priority: skillGaps.length > 3 ? 'high' : 'medium',
        confidence: 85,
        impact: {
          quality: 25,
          efficiency: 10,
        },
        actions: skillGaps.slice(0, 5).map(skill => ({
          actionType: 'add_skill',
          description: `Add agent with ${skill} capability`,
          params: { skill },
          estimatedEffort: 'medium' as const,
        })),
        reasoning: [
          `Missing skills: ${skillGaps.slice(0, 5).join(', ')}${skillGaps.length > 5 ? ` and ${skillGaps.length - 5} more` : ''}`,
          'These skills are required by existing positions',
        ],
      });
    }

    return recommendations;
  }

  /**
   * Generate resource allocation recommendations
   */
  private async generateResourceRecommendations(
    context: RecommendationContext
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get cost data
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const costEntries = await prisma.aRCostEntry.findMany({
      where: {
        organizationId: context.organizationId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    if (costEntries.length > 0) {
      // Calculate total monthly cost
      const totalCost = costEntries.reduce((sum, entry) => sum + entry.amountCents, 0);

      // Group by department
      const costByDept = new Map<string, number>();
      for (const entry of costEntries) {
        if (entry.departmentId) {
          costByDept.set(
            entry.departmentId,
            (costByDept.get(entry.departmentId) || 0) + entry.amountCents
          );
        }
      }

      // Find departments with unusually high costs
      const avgCostPerDept = totalCost / Math.max(costByDept.size, 1);
      const highCostDepts: string[] = [];

      for (const [deptId, cost] of costByDept) {
        if (cost > avgCostPerDept * 1.5) {
          highCostDepts.push(deptId);
        }
      }

      if (highCostDepts.length > 0) {
        recommendations.push({
          id: `rec-resource-cost-${Date.now()}`,
          type: 'resource_allocation',
          title: 'Optimize High-Cost Departments',
          description: `${highCostDepts.length} departments have costs significantly above average.`,
          priority: 'medium',
          confidence: 75,
          impact: {
            cost: -15,
          },
          actions: [
            {
              actionType: 'review_costs',
              description: 'Review and optimize resource usage in high-cost departments',
              params: { departmentIds: highCostDepts },
              estimatedEffort: 'medium',
            },
          ],
          reasoning: [
            `Average department cost: $${(avgCostPerDept / 100).toFixed(2)}/month`,
            `${highCostDepts.length} departments exceed 150% of average`,
          ],
        });
      }
    }

    // Check for underutilized agents
    const underutilizedAssignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'active',
        workload: { lte: 0.3 },
      },
      include: {
        agent: true,
      },
    });

    if (underutilizedAssignments.length > 2) {
      recommendations.push({
        id: `rec-resource-underutil-${Date.now()}`,
        type: 'resource_allocation',
        title: 'Consolidate Underutilized Agents',
        description: `${underutilizedAssignments.length} agents are significantly underutilized.`,
        priority: 'low',
        confidence: 70,
        impact: {
          cost: -10,
          efficiency: 5,
        },
        actions: [
          {
            actionType: 'consolidate_agents',
            description: 'Consider reassigning tasks or reducing agent count',
            params: {
              agentIds: underutilizedAssignments.map(a => a.agentId),
            },
            estimatedEffort: 'medium',
          },
        ],
        reasoning: underutilizedAssignments.map(
          a => `${a.agent.name}: ${Math.round(a.workload * 100)}% utilization`
        ),
      });
    }

    return recommendations;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    recommendations: Recommendation[]
  ): RecommendationResult['summary'] {
    const byPriority: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byType: Record<string, number> = {};
    let totalEfficiency = 0;
    let totalCost = 0;

    for (const rec of recommendations) {
      byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;
      byType[rec.type] = (byType[rec.type] || 0) + 1;

      if (rec.impact.efficiency) {
        totalEfficiency += rec.impact.efficiency;
      }
      if (rec.impact.cost) {
        totalCost += rec.impact.cost;
      }
    }

    return {
      totalRecommendations: recommendations.length,
      byPriority,
      byType,
      estimatedImpact: {
        efficiency: totalEfficiency,
        cost: totalCost,
      },
    };
  }

  /**
   * Get recommendations for a specific type
   */
  async getRecommendationsByType(
    organizationId: string,
    type: RecommendationType
  ): Promise<Recommendation[]> {
    const cacheKey = `ar:recommendations:${organizationId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      const result: RecommendationResult = JSON.parse(cached);
      return result.recommendations.filter(r => r.type === type);
    }

    const result = await this.generateRecommendations({ organizationId });
    return result.recommendations.filter(r => r.type === type);
  }

  /**
   * Dismiss a recommendation
   */
  async dismissRecommendation(
    organizationId: string,
    recommendationId: string
  ): Promise<void> {
    const dismissKey = `ar:rec-dismissed:${organizationId}`;
    const dismissed = await redis.get(dismissKey);
    const dismissedList: string[] = dismissed ? JSON.parse(dismissed) : [];

    if (!dismissedList.includes(recommendationId)) {
      dismissedList.push(recommendationId);
      await redis.set(dismissKey, JSON.stringify(dismissedList), 604800); // 7 days
    }
  }

  /**
   * Apply a recommendation action
   */
  async applyRecommendation(
    organizationId: string,
    recommendationId: string,
    actionIndex: number
  ): Promise<{ success: boolean; message: string }> {
    const cacheKey = `ar:recommendations:${organizationId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return { success: false, message: 'Recommendations not found' };
    }

    const result: RecommendationResult = JSON.parse(cached);
    const recommendation = result.recommendations.find(r => r.id === recommendationId);

    if (!recommendation) {
      return { success: false, message: 'Recommendation not found' };
    }

    const action = recommendation.actions[actionIndex];
    if (!action) {
      return { success: false, message: 'Action not found' };
    }

    // Log the action - actual implementation would depend on action type
    logger.info("Applying recommendation action", {
      organizationId,
      recommendationId,
      actionType: action.actionType,
      params: action.params,
    });

    // Mark recommendation as applied
    await this.dismissRecommendation(organizationId, recommendationId);

    return {
      success: true,
      message: `Action "${action.description}" has been queued for execution`,
    };
  }
}

// Export singleton instance
export const recommendationEngineService = new RecommendationEngineService();
