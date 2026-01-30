/**
 * Project Date Optimizer Service
 *
 * Optimizes project timelines based on resource availability,
 * dependencies, and organizational constraints.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectTimeline {
  projectId: string;
  projectName: string;
  originalStartDate: Date;
  originalEndDate: Date;
  optimizedStartDate: Date;
  optimizedEndDate: Date;
  milestones: MilestoneTimeline[];
  resourceAllocation: ResourceAllocation[];
  risks: TimelineRisk[];
  confidenceScore: number; // 0-100
}

export interface MilestoneTimeline {
  id: string;
  name: string;
  originalDate: Date;
  optimizedDate: Date;
  dependencies: string[];
  criticalPath: boolean;
  slackDays: number;
}

export interface ResourceAllocation {
  entityType: 'agent' | 'human';
  entityId: string;
  entityName: string;
  allocationPercent: number;
  startDate: Date;
  endDate: Date;
  conflicts: ResourceConflict[];
}

export interface ResourceConflict {
  conflictType: 'overallocation' | 'unavailable' | 'skill_mismatch';
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedResolution: string;
}

export interface TimelineRisk {
  riskType: 'resource' | 'dependency' | 'deadline' | 'scope';
  description: string;
  probability: number; // 0-100
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
}

export interface OptimizationConstraints {
  fixedDeadline?: Date;
  fixedStartDate?: Date;
  maxResourceAllocation?: number; // Max % per resource
  requiredBufferDays?: number;
  excludeWeekends?: boolean;
  excludeHolidays?: string[]; // ISO date strings
  priorityWeight?: number; // How much to weight this project vs others
}

export interface OptimizationResult {
  projectId: string;
  organizationId: string;
  optimizedAt: Date;
  timeline: ProjectTimeline;
  alternativeTimelines: ProjectTimeline[];
  recommendation: string;
  warnings: string[];
}

// =============================================================================
// SERVICE
// =============================================================================

export class ProjectDateOptimizerService {
  /**
   * Optimize timeline for a single project
   */
  async optimizeProjectTimeline(
    organizationId: string,
    projectId: string,
    constraints?: OptimizationConstraints
  ): Promise<OptimizationResult> {
    logger.info("Optimizing project timeline", { organizationId, projectId });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
      },
    });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Get resource availability
    const resourceAvailability = await this.getResourceAvailability(
      organizationId,
      project.startDate || new Date(),
      project.dueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    );

    // Build task dependency graph
    const taskGraph = this.buildTaskDependencyGraph(project.tasks);

    // Calculate critical path
    const criticalPath = this.calculateCriticalPath(taskGraph);

    // Optimize timeline
    const timeline = await this.calculateOptimalTimeline(
      project,
      taskGraph,
      criticalPath,
      resourceAvailability,
      constraints
    );

    // Generate alternative timelines
    const alternatives = await this.generateAlternativeTimelines(
      project,
      taskGraph,
      resourceAvailability,
      constraints
    );

    // Identify risks
    const risks = this.identifyTimelineRisks(timeline, resourceAvailability);
    timeline.risks = risks;

    // Generate recommendation
    const recommendation = this.generateRecommendation(timeline, alternatives);

    // Cache result
    const cacheKey = `ar:project-timeline:${projectId}`;
    await redis.set(
      cacheKey,
      JSON.stringify({ timeline, optimizedAt: new Date() }),
      3600
    );

    const warnings: string[] = [];
    if (risks.filter(r => r.impact === 'critical').length > 0) {
      warnings.push('Critical risks identified - review timeline carefully');
    }
    if (timeline.confidenceScore < 70) {
      warnings.push('Low confidence score - consider adding buffer time');
    }

    return {
      projectId,
      organizationId,
      optimizedAt: new Date(),
      timeline,
      alternativeTimelines: alternatives,
      recommendation,
      warnings,
    };
  }

  /**
   * Get resource availability for date range
   */
  private async getResourceAvailability(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, { date: Date; available: number }[]>> {
    const availability = new Map<string, { date: Date; available: number }[]>();

    // Get agent assignments
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      include: {
        agent: true,
      },
    });

    // Get human availability
    const humanAvailability = await prisma.humanAvailability.findMany({
      where: {
        organizationId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Build availability map for agents
    for (const assignment of assignments) {
      const agentAvailability: { date: Date; available: number }[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        agentAvailability.push({
          date: new Date(currentDate),
          available: 1 - assignment.workload, // Available capacity
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      availability.set(`agent:${assignment.agentId}`, agentAvailability);
    }

    // Build availability map for humans
    const humanAvailabilityByUser = new Map<string, typeof humanAvailability>();
    for (const ha of humanAvailability) {
      const existing = humanAvailabilityByUser.get(ha.userId) || [];
      existing.push(ha);
      humanAvailabilityByUser.set(ha.userId, existing);
    }

    for (const [userId, records] of humanAvailabilityByUser.entries()) {
      const userAvailability: { date: Date; available: number }[] = records.map(r => ({
        date: r.date,
        available: r.status === 'available' ? 1.0 : r.status === 'busy' ? 0.5 : 0,
      }));
      availability.set(`human:${userId}`, userAvailability);
    }

    return availability;
  }

  /**
   * Build task dependency graph
   */
  private buildTaskDependencyGraph(tasks: any[]): Map<string, TaskNode> {
    const graph = new Map<string, TaskNode>();

    for (const task of tasks) {
      const dependencies = ((task.metadata as Record<string, unknown>)?.dependencies as string[]) || [];
      const estimatedHours = ((task.metadata as Record<string, unknown>)?.estimatedHours as number) || 8;

      graph.set(task.id, {
        id: task.id,
        title: task.title,
        dependencies,
        dependents: [],
        estimatedHours,
        earliestStart: new Date(),
        latestStart: new Date(),
        earliestFinish: new Date(),
        latestFinish: new Date(),
        slack: 0,
        onCriticalPath: false,
      });
    }

    // Build reverse dependencies (dependents)
    for (const [taskId, node] of graph.entries()) {
      for (const depId of node.dependencies) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.push(taskId);
        }
      }
    }

    return graph;
  }

  /**
   * Calculate critical path using CPM algorithm
   */
  private calculateCriticalPath(graph: Map<string, TaskNode>): string[] {
    // Forward pass - calculate earliest start/finish
    const visited = new Set<string>();
    const topoOrder: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = graph.get(nodeId)!;
      for (const depId of node.dependencies) {
        visit(depId);
      }
      topoOrder.push(nodeId);
    };

    for (const nodeId of graph.keys()) {
      visit(nodeId);
    }

    // Calculate earliest times
    const projectStart = new Date();
    for (const nodeId of topoOrder) {
      const node = graph.get(nodeId)!;

      if (node.dependencies.length === 0) {
        node.earliestStart = projectStart;
      } else {
        let maxFinish = projectStart;
        for (const depId of node.dependencies) {
          const depNode = graph.get(depId)!;
          if (depNode.earliestFinish > maxFinish) {
            maxFinish = depNode.earliestFinish;
          }
        }
        node.earliestStart = maxFinish;
      }

      node.earliestFinish = new Date(
        node.earliestStart.getTime() + node.estimatedHours * 60 * 60 * 1000
      );
    }

    // Backward pass - calculate latest start/finish
    const projectEnd = Math.max(
      ...Array.from(graph.values()).map(n => n.earliestFinish.getTime())
    );

    for (const nodeId of topoOrder.reverse()) {
      const node = graph.get(nodeId)!;

      if (node.dependents.length === 0) {
        node.latestFinish = new Date(projectEnd);
      } else {
        let minStart = new Date(projectEnd);
        for (const depId of node.dependents) {
          const depNode = graph.get(depId)!;
          if (depNode.latestStart < minStart) {
            minStart = depNode.latestStart;
          }
        }
        node.latestFinish = minStart;
      }

      node.latestStart = new Date(
        node.latestFinish.getTime() - node.estimatedHours * 60 * 60 * 1000
      );

      // Calculate slack
      node.slack = (node.latestStart.getTime() - node.earliestStart.getTime()) / (60 * 60 * 1000);
      node.onCriticalPath = node.slack === 0;
    }

    // Return critical path nodes
    return Array.from(graph.entries())
      .filter(([_, node]) => node.onCriticalPath)
      .map(([id, _]) => id);
  }

  /**
   * Calculate optimal timeline
   */
  private async calculateOptimalTimeline(
    project: any,
    taskGraph: Map<string, TaskNode>,
    criticalPath: string[],
    _resourceAvailability: Map<string, { date: Date; available: number }[]>,
    constraints?: OptimizationConstraints
  ): Promise<ProjectTimeline> {
    const milestones: MilestoneTimeline[] = [];
    const resourceAllocation: ResourceAllocation[] = [];

    // Calculate milestones from critical path
    for (const taskId of criticalPath) {
      const node = taskGraph.get(taskId)!;
      milestones.push({
        id: taskId,
        name: node.title,
        originalDate: node.earliestFinish,
        optimizedDate: node.earliestFinish,
        dependencies: node.dependencies,
        criticalPath: true,
        slackDays: 0,
      });
    }

    // Add non-critical tasks
    for (const [taskId, node] of taskGraph.entries()) {
      if (!criticalPath.includes(taskId)) {
        milestones.push({
          id: taskId,
          name: node.title,
          originalDate: node.earliestFinish,
          optimizedDate: node.earliestFinish,
          dependencies: node.dependencies,
          criticalPath: false,
          slackDays: Math.floor(node.slack / 24),
        });
      }
    }

    // Calculate resource allocation
    const assignedResources = new Set<string>();
    for (const task of Array.from(taskGraph.values())) {
      // In production, this would look up actual task assignments
      // For now, use mock allocation
      if (!assignedResources.has(task.id)) {
        resourceAllocation.push({
          entityType: 'agent',
          entityId: `agent-${task.id}`,
          entityName: `Agent for ${task.title}`,
          allocationPercent: 100,
          startDate: task.earliestStart,
          endDate: task.earliestFinish,
          conflicts: [],
        });
        assignedResources.add(task.id);
      }
    }

    // Apply constraints
    let optimizedStartDate = project.startDate || new Date();
    let optimizedEndDate = project.dueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    if (constraints?.fixedStartDate) {
      optimizedStartDate = constraints.fixedStartDate;
    }
    if (constraints?.fixedDeadline) {
      optimizedEndDate = constraints.fixedDeadline;
    }
    if (constraints?.requiredBufferDays) {
      optimizedEndDate = new Date(
        optimizedEndDate.getTime() - constraints.requiredBufferDays * 24 * 60 * 60 * 1000
      );
    }

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(
      milestones,
      resourceAllocation,
      constraints
    );

    return {
      projectId: project.id,
      projectName: project.name,
      originalStartDate: project.startDate || new Date(),
      originalEndDate: project.dueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      optimizedStartDate,
      optimizedEndDate,
      milestones,
      resourceAllocation,
      risks: [], // Will be filled by caller
      confidenceScore,
    };
  }

  /**
   * Generate alternative timelines
   */
  private async generateAlternativeTimelines(
    project: any,
    taskGraph: Map<string, TaskNode>,
    resourceAvailability: Map<string, { date: Date; available: number }[]>,
    constraints?: OptimizationConstraints
  ): Promise<ProjectTimeline[]> {
    const alternatives: ProjectTimeline[] = [];

    // Alternative 1: Aggressive timeline (minimal buffer)
    const aggressiveConstraints = { ...constraints, requiredBufferDays: 0 };
    const criticalPath = this.calculateCriticalPath(taskGraph);
    const aggressiveTimeline = await this.calculateOptimalTimeline(
      project,
      taskGraph,
      criticalPath,
      resourceAvailability,
      aggressiveConstraints
    );
    aggressiveTimeline.confidenceScore = Math.max(0, aggressiveTimeline.confidenceScore - 20);
    alternatives.push(aggressiveTimeline);

    // Alternative 2: Conservative timeline (extra buffer)
    const conservativeConstraints = {
      ...constraints,
      requiredBufferDays: (constraints?.requiredBufferDays || 0) + 7,
    };
    const conservativeTimeline = await this.calculateOptimalTimeline(
      project,
      taskGraph,
      criticalPath,
      resourceAvailability,
      conservativeConstraints
    );
    conservativeTimeline.confidenceScore = Math.min(100, conservativeTimeline.confidenceScore + 15);
    alternatives.push(conservativeTimeline);

    return alternatives;
  }

  /**
   * Identify timeline risks
   */
  private identifyTimelineRisks(
    timeline: ProjectTimeline,
    _resourceAvailability: Map<string, { date: Date; available: number }[]>
  ): TimelineRisk[] {
    const risks: TimelineRisk[] = [];

    // Check for resource conflicts
    const overallocated = timeline.resourceAllocation.filter(
      ra => ra.allocationPercent > 100
    );
    if (overallocated.length > 0) {
      risks.push({
        riskType: 'resource',
        description: `${overallocated.length} resources are over-allocated`,
        probability: 80,
        impact: 'high',
        mitigation: 'Consider adding resources or extending timeline',
      });
    }

    // Check for tight deadlines
    const criticalMilestones = timeline.milestones.filter(m => m.criticalPath && m.slackDays < 2);
    if (criticalMilestones.length > 0) {
      risks.push({
        riskType: 'deadline',
        description: `${criticalMilestones.length} critical milestones have less than 2 days slack`,
        probability: 60,
        impact: 'high',
        mitigation: 'Add buffer time or reduce scope',
      });
    }

    // Check for dependency chains
    const longChains = timeline.milestones.filter(m => m.dependencies.length > 3);
    if (longChains.length > 0) {
      risks.push({
        riskType: 'dependency',
        description: 'Long dependency chains increase risk of delays',
        probability: 50,
        impact: 'medium',
        mitigation: 'Consider parallelizing some tasks',
      });
    }

    return risks;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidenceScore(
    milestones: MilestoneTimeline[],
    resourceAllocation: ResourceAllocation[],
    constraints?: OptimizationConstraints
  ): number {
    let score = 80; // Base score

    // Reduce for tight milestones
    const tightMilestones = milestones.filter(m => m.slackDays < 1);
    score -= tightMilestones.length * 5;

    // Reduce for resource conflicts
    const conflicts = resourceAllocation.flatMap(ra => ra.conflicts);
    score -= conflicts.filter(c => c.severity === 'high').length * 10;
    score -= conflicts.filter(c => c.severity === 'medium').length * 5;

    // Increase for buffer time
    if (constraints?.requiredBufferDays && constraints.requiredBufferDays > 5) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    timeline: ProjectTimeline,
    alternatives: ProjectTimeline[]
  ): string {
    if (timeline.confidenceScore >= 80) {
      return 'Recommended timeline has high confidence. Proceed with current plan.';
    } else if (timeline.confidenceScore >= 60) {
      const conservative = alternatives.find(a => a.confidenceScore > timeline.confidenceScore);
      if (conservative) {
        return `Consider the conservative timeline for higher confidence (${conservative.confidenceScore}% vs ${timeline.confidenceScore}%).`;
      }
      return 'Timeline is acceptable but monitor closely for risks.';
    } else {
      return 'Timeline has significant risks. Strongly recommend reviewing scope or adding resources.';
    }
  }

  /**
   * Optimize multiple projects for resource leveling
   */
  async optimizePortfolioTimelines(
    organizationId: string,
    projectIds: string[],
    constraints?: OptimizationConstraints
  ): Promise<{
    projects: OptimizationResult[];
    portfolioRisks: TimelineRisk[];
    resourceUtilization: { entityId: string; avgUtilization: number }[];
  }> {
    logger.info("Optimizing portfolio timelines", {
      organizationId,
      projectCount: projectIds.length,
    });

    const projects: OptimizationResult[] = [];
    const allAllocations: ResourceAllocation[] = [];

    // Optimize each project
    for (const projectId of projectIds) {
      try {
        const result = await this.optimizeProjectTimeline(
          organizationId,
          projectId,
          constraints
        );
        projects.push(result);
        allAllocations.push(...result.timeline.resourceAllocation);
      } catch (error) {
        logger.error("Failed to optimize project", { projectId, error });
      }
    }

    // Calculate portfolio-level risks
    const portfolioRisks: TimelineRisk[] = [];

    // Check for cross-project resource conflicts
    const resourceUsage = new Map<string, number>();
    for (const allocation of allAllocations) {
      const key = `${allocation.entityType}:${allocation.entityId}`;
      const current = resourceUsage.get(key) || 0;
      resourceUsage.set(key, current + allocation.allocationPercent);
    }

    const overallocatedResources = Array.from(resourceUsage.entries())
      .filter(([_, usage]) => usage > 100);

    if (overallocatedResources.length > 0) {
      portfolioRisks.push({
        riskType: 'resource',
        description: `${overallocatedResources.length} resources are allocated across multiple projects totaling > 100%`,
        probability: 70,
        impact: 'high',
        mitigation: 'Stagger project timelines or add resources',
      });
    }

    // Calculate resource utilization
    const resourceUtilization = Array.from(resourceUsage.entries()).map(
      ([entityId, totalUsage]) => ({
        entityId,
        avgUtilization: Math.min(totalUsage, 100),
      })
    );

    return {
      projects,
      portfolioRisks,
      resourceUtilization,
    };
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface TaskNode {
  id: string;
  title: string;
  dependencies: string[];
  dependents: string[];
  estimatedHours: number;
  earliestStart: Date;
  latestStart: Date;
  earliestFinish: Date;
  latestFinish: Date;
  slack: number;
  onCriticalPath: boolean;
}

// Export singleton instance
export const projectDateOptimizerService = new ProjectDateOptimizerService();
