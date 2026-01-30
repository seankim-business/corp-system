/**
 * AR Coordinator Service
 *
 * Deep integration with the Agent Resource (AR) system.
 * Handles agent assignment, escalations, and performance reporting.
 */

import { db as prisma } from '../../../db/client';
import { logger } from '../../../utils/logger';
import { metrics } from '../../../utils/metrics';
import { arAssignmentService } from '../../../ar/organization/ar-assignment.service';
import { ARDirectorAgent } from '../../../ar/meta-agents/ar-director.agent';
import { CoordinationEngine } from '../../../ar/coordination/coordination-engine';
import type {
  AvailableAgent,
  AgentCapabilityRequirements,
  ARAssignmentRequest,
  ARAssignmentResult,
  ARDirectorEscalation,
  ARAnalystMetrics,
} from './types';

export class ARCoordinatorService {
  private coordinationEngine: CoordinationEngine | null = null;
  private directorAgent: ARDirectorAgent | null = null;
  private initialized = false;

  /**
   * Initialize the AR coordinator
   */
  async initialize(organizationId: string): Promise<void> {
    if (this.initialized) return;

    try {
      this.coordinationEngine = new CoordinationEngine();
      await this.coordinationEngine.start();

      this.directorAgent = new ARDirectorAgent({ organizationId });

      this.initialized = true;
      logger.info('[ARCoordinator] Initialized', { organizationId });
    } catch (error) {
      logger.error('[ARCoordinator] Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Get available agents matching capability requirements
   */
  async getAvailableAgents(
    organizationId: string,
    requirements: AgentCapabilityRequirements
  ): Promise<AvailableAgent[]> {
    const startTime = Date.now();

    try {
      // Get all active assignments
      const assignments = await arAssignmentService.getActiveAssignments(organizationId);

      // Get agent details and filter by capabilities
      const availableAgents: AvailableAgent[] = [];

      for (const assignment of assignments) {
        const agent = await prisma.agent.findUnique({
          where: { id: assignment.agentId },
        });

        if (!agent || agent.status !== 'active') continue;

        // Check capability match using skills
        const agentCapabilities = agent.skills || [];
        const hasPrimaryCapability = agentCapabilities.includes(requirements.primaryCapability);

        if (!hasPrimaryCapability) continue;

        // Check secondary capabilities if required
        const hasSecondaryCapabilities = !requirements.secondaryCapabilities ||
          requirements.secondaryCapabilities.every(cap => agentCapabilities.includes(cap));

        if (!hasSecondaryCapabilities) continue;

        // Check performance score
        if (requirements.minPerformanceScore &&
            (assignment.performanceScore || 0) < requirements.minPerformanceScore) {
          continue;
        }

        // Check workload
        if (requirements.maxWorkload &&
            assignment.workload > requirements.maxWorkload) {
          continue;
        }

        // Check tier preference using preferredModel
        const agentTier = agent.preferredModel || 'sonnet';
        if (requirements.preferredTier && agentTier !== requirements.preferredTier) {
          // Deprioritize but don't exclude
        }

        // Determine availability status
        let status: AvailableAgent['status'] = 'available';
        if (assignment.workload > 0.8) {
          status = 'busy';
        }
        if (assignment.status !== 'active') {
          status = 'offline';
        }

        availableAgents.push({
          agentId: agent.id,
          positionId: assignment.positionId,
          capabilities: agentCapabilities,
          performanceScore: assignment.performanceScore || 80,
          currentWorkload: assignment.workload,
          tier: agentTier,
          status,
        });
      }

      // Sort by availability and performance
      availableAgents.sort((a, b) => {
        // Prefer available agents
        if (a.status !== b.status) {
          return a.status === 'available' ? -1 : 1;
        }
        // Then by performance
        if (a.performanceScore !== b.performanceScore) {
          return b.performanceScore - a.performanceScore;
        }
        // Then by workload (lower is better)
        return a.currentWorkload - b.currentWorkload;
      });

      metrics.histogram('ar_coordinator.get_available_agents', Date.now() - startTime);
      metrics.increment('ar_coordinator.get_available_agents.count', {
        found: String(availableAgents.length),
      });

      logger.debug('[ARCoordinator] Found available agents', {
        organizationId,
        capability: requirements.primaryCapability,
        found: availableAgents.length,
      });

      return availableAgents;
    } catch (error) {
      logger.error('[ARCoordinator] Failed to get available agents', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        requirements,
      });
      metrics.increment('ar_coordinator.get_available_agents.error');
      throw error;
    }
  }

  /**
   * Request agent assignment from AR system
   */
  async requestAgentAssignment(
    organizationId: string,
    request: ARAssignmentRequest
  ): Promise<ARAssignmentResult | null> {
    const startTime = Date.now();

    try {
      // Get available agents matching requirements
      const availableAgents = await this.getAvailableAgents(
        organizationId,
        request.requirements
      );

      if (availableAgents.length === 0) {
        logger.warn('[ARCoordinator] No agents available for assignment', {
          taskId: request.taskId,
          requirements: request.requirements,
        });
        return null;
      }

      // Select best agent (first one since already sorted)
      const selectedAgent = availableAgents[0];

      // Check if agent has capacity
      if (selectedAgent.currentWorkload >= 1.0) {
        // Try to find another agent or escalate
        const alternativeAgent = availableAgents.find(
          a => a.status === 'available' && a.currentWorkload < 0.9
        );

        if (!alternativeAgent) {
          logger.warn('[ARCoordinator] All matching agents at capacity, escalating', {
            taskId: request.taskId,
          });

          await this.escalateToARDirector(organizationId, {
            type: 'resource_conflict',
            title: `No available agents for task ${request.taskId}`,
            description: `All agents with capability "${request.requirements.primaryCapability}" are at capacity`,
            urgency: request.priority,
            context: { taskId: request.taskId, requirements: request.requirements },
            requiredAction: 'Approve workload rebalancing or prioritize this task',
          });

          return null;
        }
      }

      // Calculate confidence based on agent metrics
      const confidence = this.calculateAssignmentConfidence(selectedAgent, request);

      // Update agent workload (simple increment)
      const assignment = await arAssignmentService.findByAgent(selectedAgent.agentId);
      const activeAssignment = assignment.find(a => a.status === 'active');

      if (activeAssignment) {
        const newWorkload = Math.min(1.0, selectedAgent.currentWorkload + 0.1);
        await arAssignmentService.updateWorkload(activeAssignment.id, newWorkload);
      }

      const result: ARAssignmentResult = {
        taskId: request.taskId,
        agentId: selectedAgent.agentId,
        positionId: selectedAgent.positionId,
        assignmentId: activeAssignment?.id || '',
        estimatedStartTime: new Date(),
        confidence,
      };

      metrics.histogram('ar_coordinator.request_assignment', Date.now() - startTime);
      metrics.increment('ar_coordinator.assignment.success');

      logger.info('[ARCoordinator] Agent assigned to task', {
        taskId: request.taskId,
        agentId: selectedAgent.agentId,
        confidence,
      });

      return result;
    } catch (error) {
      logger.error('[ARCoordinator] Failed to request agent assignment', {
        error: error instanceof Error ? error.message : String(error),
        taskId: request.taskId,
      });
      metrics.increment('ar_coordinator.assignment.error');
      throw error;
    }
  }

  /**
   * Release agent after task completion
   */
  async releaseAgent(
    _organizationId: string,
    agentId: string,
    taskId: string,
    success: boolean
  ): Promise<void> {
    try {
      // Find active assignment
      const assignments = await arAssignmentService.findByAgent(agentId);
      const activeAssignment = assignments.find(a => a.status === 'active');

      if (activeAssignment) {
        // Decrease workload
        const newWorkload = Math.max(0, activeAssignment.workload - 0.1);
        await arAssignmentService.updateWorkload(activeAssignment.id, newWorkload);

        // Update performance score based on task outcome
        if (activeAssignment.performanceScore !== null) {
          const scoreDelta = success ? 1 : -2;
          const newScore = Math.max(0, Math.min(100, activeAssignment.performanceScore + scoreDelta));
          await arAssignmentService.updatePerformanceScore(activeAssignment.id, newScore);
        }
      }

      logger.info('[ARCoordinator] Agent released', {
        agentId,
        taskId,
        success,
      });
    } catch (error) {
      logger.error('[ARCoordinator] Failed to release agent', {
        error: error instanceof Error ? error.message : String(error),
        agentId,
        taskId,
      });
    }
  }

  /**
   * Escalate critical issue to AR Director
   */
  async escalateToARDirector(
    organizationId: string,
    escalation: ARDirectorEscalation
  ): Promise<string> {
    try {
      if (!this.directorAgent) {
        await this.initialize(organizationId);
      }

      // Create escalation context
      const escalationContext = {
        id: `esc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: this.mapEscalationType(escalation.type),
        severity: escalation.urgency === 'critical' ? 'critical' as const :
                  escalation.urgency === 'high' ? 'high' as const : 'medium' as const,
        description: escalation.description,
        affectedAgents: escalation.affectedAgents,
        proposedAction: escalation.requiredAction,
        metadata: escalation.context,
      };

      // Process through director
      const decision = await this.directorAgent!.processEscalation(escalationContext);

      // Log escalation
      await prisma.aRDepartmentLog.create({
        data: {
          organizationId,
          action: 'mega_app_escalation',
          category: 'coordination',
          details: JSON.parse(JSON.stringify({
            escalation,
            decision,
          })),
          impact: escalation.urgency,
        },
      });

      metrics.increment('ar_coordinator.escalation', {
        type: escalation.type,
        urgency: escalation.urgency,
      });

      logger.info('[ARCoordinator] Escalated to AR Director', {
        escalationId: escalationContext.id,
        type: escalation.type,
        decision: decision.decision,
      });

      return escalationContext.id;
    } catch (error) {
      logger.error('[ARCoordinator] Failed to escalate to AR Director', {
        error: error instanceof Error ? error.message : String(error),
        escalation,
      });
      throw error;
    }
  }

  /**
   * Report performance metrics to AR Analyst
   */
  async reportToARAnalyst(
    organizationId: string,
    metricsData: ARAnalystMetrics[]
  ): Promise<void> {
    try {
      // Store metrics for AR Analyst consumption
      for (const metric of metricsData) {
        await prisma.aRDepartmentLog.create({
          data: {
            organizationId,
            action: 'mega_app_metrics',
            category: 'analysis',
            details: {
              moduleId: metric.moduleId,
              period: metric.period,
              metrics: {
                executions: metric.executions,
                successRate: metric.successRate,
                averageDuration: metric.averageDuration,
                costTotal: metric.costTotal,
                agentUtilization: metric.agentUtilization,
                bottlenecks: metric.bottlenecks,
              },
            },
            impact: 'low',
          },
        });
      }

      logger.info('[ARCoordinator] Reported metrics to AR Analyst', {
        organizationId,
        metricsCount: metricsData.length,
      });
    } catch (error) {
      logger.error('[ARCoordinator] Failed to report metrics', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }

  /**
   * Get coordination status from coordination engine
   */
  async getCoordinationStatus(_organizationId: string): Promise<{
    active: boolean;
    activeNegotiations: number;
    pendingDecisions: number;
  }> {
    if (!this.coordinationEngine) {
      return {
        active: false,
        activeNegotiations: 0,
        pendingDecisions: 0,
      };
    }

    // Get status from coordination engine
    // Count active negotiations and pending decisions from Redis would go here
    // For now, return basic status
    return {
      active: this.initialized,
      activeNegotiations: 0,
      pendingDecisions: 0,
    };
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    if (this.coordinationEngine) {
      await this.coordinationEngine.stop();
    }
    this.initialized = false;
    logger.info('[ARCoordinator] Shutdown complete');
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Calculate assignment confidence based on agent metrics
   */
  private calculateAssignmentConfidence(
    agent: AvailableAgent,
    request: ARAssignmentRequest
  ): number {
    let confidence = 0.5;

    // Performance score contributes up to 30%
    confidence += (agent.performanceScore / 100) * 0.3;

    // Workload contributes up to 20% (lower is better)
    confidence += (1 - agent.currentWorkload) * 0.2;

    // Availability status
    if (agent.status === 'available') {
      confidence += 0.1;
    }

    // Tier match
    if (request.requirements.preferredTier &&
        agent.tier === request.requirements.preferredTier) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Map escalation type to AR escalation format
   */
  private mapEscalationType(
    type: ARDirectorEscalation['type']
  ): 'budget' | 'performance' | 'structural' | 'emergency' {
    switch (type) {
      case 'approval':
        return 'structural';
      case 'resource_conflict':
        return 'performance';
      case 'performance':
        return 'performance';
      case 'emergency':
        return 'emergency';
      default:
        return 'performance';
    }
  }
}

// Export singleton instance
export const arCoordinatorService = new ARCoordinatorService();
