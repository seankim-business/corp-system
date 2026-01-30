/**
 * MegaApp Manager Service
 *
 * Core orchestration service for the entire value stream.
 * Coordinates modules, handles auto-development, maintenance, and troubleshooting.
 */

import { db as prisma } from '../../../db/client';
import { logger } from '../../../utils/logger';
import { metrics } from '../../../utils/metrics';
import { valueStreamQueue } from '../../../queue/value-stream.queue';
import { getModuleRegistry, type ModuleDefinition } from '../module-registry';
import { getArtifactService } from '../artifact-service';
import { arCoordinatorService } from './ar-coordinator.service';
import { developmentPipelineService } from './development-pipeline.service';
import { troubleshooterService } from './troubleshooter.service';
import type {
  ValueStreamInput,
  ValueStreamExecution,
  ExecutionStatus,
  ExecutionArtifact,
  DevelopmentPlan,
  DevelopmentResult,
  ModuleIssue,
  TroubleshootResult,
  MaintenanceConfig,
  ModuleHealthReport,
  ModuleHealth,
  MaintenanceRecommendation,
} from './types';

export class MegaAppManagerService {
  private moduleRegistry = getModuleRegistry();
  private artifactService = getArtifactService();
  private initialized = false;

  /**
   * Initialize the MegaApp Manager
   */
  async initialize(organizationId: string): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize AR coordinator
      await arCoordinatorService.initialize(organizationId);

      this.initialized = true;
      logger.info('[MegaAppManager] Initialized', { organizationId });
    } catch (error) {
      logger.error('[MegaAppManager] Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      throw error;
    }
  }

  // =========================================================================
  // Value Stream Orchestration
  // =========================================================================

  /**
   * Execute a value stream from a template
   */
  async executeValueStream(
    templateId: string,
    input: ValueStreamInput
  ): Promise<ValueStreamExecution> {
    const startTime = Date.now();
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      logger.info('[MegaAppManager] Starting value stream execution', {
        executionId,
        templateId,
        organizationId: input.organizationId,
      });

      // Get modules for the template
      const modules = await this.getTemplateModules(input.organizationId, templateId);

      if (modules.length === 0) {
        throw new Error(`No modules found for template: ${templateId}`);
      }

      // Calculate execution order
      const moduleIds = modules.map(m => m.id);
      const executionOrder = await this.moduleRegistry.getExecutionOrder(
        input.organizationId,
        input.targetModuleId ? [input.targetModuleId] : moduleIds
      );

      // Initialize execution status
      const status: ExecutionStatus = {
        executionId,
        templateId,
        status: 'running',
        progress: 0,
        completedModules: [],
        pendingModules: executionOrder,
        failedModules: [],
        artifacts: [],
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: input.metadata,
      };

      // Store initial status
      await this.storeExecutionStatus(status);

      // Emit flow started event
      await valueStreamQueue.emitFlowStarted(
        input.organizationId,
        executionId,
        templateId,
        executionOrder,
        { userId: input.userId }
      );

      // Execute modules in order
      const artifacts: ExecutionArtifact[] = [];

      for (const moduleId of executionOrder) {
        const module = modules.find(m => m.id === moduleId);
        if (!module) continue;

        try {
          // Check if module can execute
          const availableArtifacts = await this.artifactService.getAvailableModuleArtifacts(
            input.organizationId,
            input.seasonCode
          );
          const canExecute = this.moduleRegistry.canExecute(
            module,
            Array.from(availableArtifacts.keys())
          );

          if (!canExecute.canExecute) {
            logger.warn('[MegaAppManager] Module cannot execute', {
              moduleId,
              missingInputs: canExecute.missingInputs,
            });

            status.failedModules.push(moduleId);
            status.error = {
              moduleId,
              message: canExecute.reason || 'Missing inputs',
              recoverable: true,
            };
            continue;
          }

          // Update status
          status.currentModule = moduleId;
          await this.storeExecutionStatus(status);

          // Emit module started
          await valueStreamQueue.emitModuleStarted(
            input.organizationId,
            moduleId,
            executionId,
            input.userId
          );

          // Execute module
          const result = await this.executeModule(
            input.organizationId,
            module,
            input,
            executionId
          );

          if (result.success) {
            status.completedModules.push(moduleId);
            status.pendingModules = status.pendingModules.filter(id => id !== moduleId);

            if (result.artifactId) {
              artifacts.push({
                artifactId: result.artifactId,
                moduleId,
                status: 'draft',
                createdAt: new Date(),
              });
            }

            // Emit module completed
            await valueStreamQueue.emitModuleCompleted(
              input.organizationId,
              moduleId,
              executionId,
              result.artifactId
            );
          } else {
            status.failedModules.push(moduleId);
            status.error = {
              moduleId,
              message: result.error || 'Execution failed',
              recoverable: false,
            };

            // Emit module failed
            await valueStreamQueue.emitModuleFailed(
              input.organizationId,
              moduleId,
              executionId,
              result.error || 'Unknown error'
            );

            // Stop execution on failure (could be configurable)
            break;
          }

          // Update progress
          status.progress = (status.completedModules.length / executionOrder.length) * 100;
          status.updatedAt = new Date();
          await this.storeExecutionStatus(status);

        } catch (moduleError) {
          logger.error('[MegaAppManager] Module execution error', {
            moduleId,
            error: moduleError instanceof Error ? moduleError.message : String(moduleError),
          });

          status.failedModules.push(moduleId);
          status.error = {
            moduleId,
            message: moduleError instanceof Error ? moduleError.message : 'Unknown error',
            recoverable: false,
          };
          break;
        }
      }

      // Finalize execution
      const duration = Date.now() - startTime;
      status.status = status.failedModules.length === 0 ? 'completed' : 'failed';
      status.completedAt = new Date();
      status.updatedAt = new Date();
      status.artifacts = artifacts;

      await this.storeExecutionStatus(status);

      // Emit flow event
      if (status.status === 'completed') {
        await valueStreamQueue.emitFlowCompleted(
          input.organizationId,
          executionId,
          templateId,
          status.completedModules
        );
      } else {
        await valueStreamQueue.emitFlowFailed(
          input.organizationId,
          executionId,
          templateId,
          status.completedModules,
          status.pendingModules,
          status.error?.message || 'Unknown error'
        );
      }

      metrics.histogram('mega_app.value_stream_execution', duration);
      metrics.increment('mega_app.value_stream', {
        status: status.status,
        templateId,
      });

      logger.info('[MegaAppManager] Value stream execution completed', {
        executionId,
        status: status.status,
        completedModules: status.completedModules.length,
        duration,
      });

      return {
        executionId,
        templateId,
        status,
        artifacts,
        duration,
      };
    } catch (error) {
      logger.error('[MegaAppManager] Value stream execution failed', {
        error: error instanceof Error ? error.message : String(error),
        executionId,
        templateId,
      });
      throw error;
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionStatus | null> {
    const statusRecord = await prisma.aRDepartmentLog.findFirst({
      where: {
        action: 'value_stream_execution',
        details: {
          path: ['executionId'],
          equals: executionId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!statusRecord) return null;

    return statusRecord.details as unknown as ExecutionStatus;
  }

  // =========================================================================
  // Auto-Development Pipeline
  // =========================================================================

  /**
   * Process a feature request and create development plan
   */
  async processFeatureRequest(
    organizationId: string,
    featureRequest: {
      id: string;
      title: string;
      description: string;
      requirements?: string[];
      priority?: 'low' | 'medium' | 'high' | 'critical';
      targetModuleId?: string;
    }
  ): Promise<DevelopmentPlan> {
    logger.info('[MegaAppManager] Processing feature request', {
      organizationId,
      featureRequestId: featureRequest.id,
    });

    return developmentPipelineService.createDevelopmentPlan(
      organizationId,
      featureRequest
    );
  }

  /**
   * Execute auto-development for a plan
   */
  async autoDevelop(plan: DevelopmentPlan): Promise<DevelopmentResult> {
    logger.info('[MegaAppManager] Starting auto-development', {
      planId: plan.planId,
      organizationId: plan.organizationId,
    });

    return developmentPipelineService.autoDevelop(plan);
  }

  // =========================================================================
  // Maintenance & Troubleshooting
  // =========================================================================

  /**
   * Run health check on modules
   */
  async runHealthCheck(
    organizationId: string,
    moduleId?: string
  ): Promise<ModuleHealthReport> {
    const startTime = Date.now();

    try {
      logger.info('[MegaAppManager] Running health check', {
        organizationId,
        moduleId,
      });

      // Get modules to check
      const modules = moduleId
        ? [await this.moduleRegistry.get(organizationId, moduleId)]
        : await this.moduleRegistry.list(organizationId, { enabled: true });

      const moduleHealth: ModuleHealth[] = [];
      const recommendations: MaintenanceRecommendation[] = [];

      for (const module of modules.filter(Boolean)) {
        const health = await this.checkModuleHealth(organizationId, module!);
        moduleHealth.push(health);

        // Generate recommendations based on health
        if (health.status === 'degraded') {
          recommendations.push({
            moduleId: module!.id,
            type: 'optimization',
            priority: 'medium',
            reason: `Module ${module!.name} showing degraded performance`,
            estimatedImpact: 'Improve execution success rate',
          });
        }

        if (health.status === 'critical') {
          recommendations.push({
            moduleId: module!.id,
            type: 'health_check',
            priority: 'high',
            reason: `Module ${module!.name} in critical state`,
            estimatedImpact: 'Restore module functionality',
          });
        }

        if (health.errorCount > 10) {
          recommendations.push({
            moduleId: module!.id,
            type: 'cleanup',
            priority: 'low',
            reason: `High error count (${health.errorCount}) in module ${module!.name}`,
            estimatedImpact: 'Reduce error noise',
          });
        }
      }

      // Calculate overall health
      const criticalCount = moduleHealth.filter(h => h.status === 'critical').length;
      const degradedCount = moduleHealth.filter(h => h.status === 'degraded').length;

      const overallHealth: 'healthy' | 'degraded' | 'critical' =
        criticalCount > 0 ? 'critical' :
        degradedCount > moduleHealth.length / 2 ? 'degraded' : 'healthy';

      const report: ModuleHealthReport = {
        organizationId,
        timestamp: new Date(),
        overallHealth,
        agentHealth: [], // Would come from AR system
        systemMetrics: {
          avgResponseTime: moduleHealth.reduce((sum, h) => sum + h.averageExecutionTime, 0) / moduleHealth.length,
          errorRate: moduleHealth.reduce((sum, h) => sum + (1 - h.successRate), 0) / moduleHealth.length,
          availabilityPercent: 100 - (criticalCount / moduleHealth.length) * 100,
        },
        alerts: [],
        moduleHealth,
        recommendations,
      };

      metrics.histogram('mega_app.health_check', Date.now() - startTime);

      logger.info('[MegaAppManager] Health check completed', {
        organizationId,
        overallHealth,
        modulesChecked: moduleHealth.length,
        recommendations: recommendations.length,
      });

      return report;
    } catch (error) {
      logger.error('[MegaAppManager] Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Auto-troubleshoot a detected issue
   */
  async autoTroubleshoot(issue: ModuleIssue): Promise<TroubleshootResult> {
    logger.info('[MegaAppManager] Auto-troubleshooting issue', {
      issueId: issue.issueId,
      moduleId: issue.moduleId,
      severity: issue.severity,
    });

    // Diagnose the issue
    const diagnosis = await troubleshooterService.diagnose(issue);

    // Get the best fix
    const fix = await troubleshooterService.generateFix(diagnosis);

    if (!fix) {
      return {
        issueId: issue.issueId,
        fixId: 'none',
        status: 'failed',
        stepsCompleted: 0,
        totalSteps: 0,
        duration: 0,
        verificationPassed: false,
        rollbackPerformed: false,
        details: 'No suitable fix found',
      };
    }

    // Apply the fix
    // For critical issues, require approval
    const requireApproval = issue.severity === 'critical' || fix.risk === 'high';

    return troubleshooterService.applyFix(
      issue.organizationId,
      fix,
      requireApproval
    );
  }

  /**
   * Schedule a maintenance window
   */
  async scheduleMaintenanceWindow(config: MaintenanceConfig): Promise<void> {
    logger.info('[MegaAppManager] Scheduling maintenance window', {
      organizationId: config.organizationId,
      type: config.type,
      scheduledAt: config.scheduledAt,
    });

    // Store maintenance schedule
    await prisma.aRDepartmentLog.create({
      data: {
        organizationId: config.organizationId,
        action: 'maintenance_scheduled',
        category: 'maintenance',
        details: {
          type: config.type,
          scheduledAt: config.scheduledAt.toISOString(),
          estimatedDuration: config.estimatedDuration,
          moduleIds: config.moduleIds,
          impactScope: config.impactScope,
          autoApprove: config.autoApprove,
        },
        impact: config.impactScope === 'organization' ? 'high' : 'medium',
      },
    });

    // If not auto-approved, escalate for approval
    if (!config.autoApprove) {
      await arCoordinatorService.escalateToARDirector(config.organizationId, {
        type: 'approval',
        title: `Maintenance window: ${config.type}`,
        description: `Scheduled maintenance for ${config.moduleIds?.join(', ') || 'all modules'}`,
        urgency: 'medium',
        context: {
          type: config.type,
          scheduledAt: config.scheduledAt,
          estimatedDuration: config.estimatedDuration,
        },
        affectedModules: config.moduleIds,
        requiredAction: 'Approve or reschedule maintenance window',
      });
    }

    // Notify users if requested
    if (config.notifyUsers) {
      // Would send notifications via appropriate channels
      logger.info('[MegaAppManager] Maintenance notification queued', {
        organizationId: config.organizationId,
        scheduledAt: config.scheduledAt,
      });
    }

    metrics.increment('mega_app.maintenance_scheduled', {
      type: config.type,
    });
  }

  /**
   * Detect issues in modules
   */
  async detectIssues(
    organizationId: string,
    moduleId?: string
  ): Promise<ModuleIssue[]> {
    return troubleshooterService.detectIssues(organizationId, moduleId);
  }

  // =========================================================================
  // Shutdown
  // =========================================================================

  /**
   * Gracefully shutdown the manager
   */
  async shutdown(): Promise<void> {
    await arCoordinatorService.shutdown();
    this.initialized = false;
    logger.info('[MegaAppManager] Shutdown complete');
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Get modules for a template
   */
  private async getTemplateModules(
    organizationId: string,
    _templateId: string
  ): Promise<ModuleDefinition[]> {
    // For now, return all active modules
    // In production, would filter by template configuration
    return this.moduleRegistry.list(organizationId, {
      enabled: true,
      status: 'active',
    });
  }

  /**
   * Execute a single module
   */
  private async executeModule(
    organizationId: string,
    module: ModuleDefinition,
    input: ValueStreamInput,
    executionId: string
  ): Promise<{ success: boolean; artifactId?: string; error?: string }> {
    try {
      // Get input artifacts
      const inputArtifacts = await this.getInputArtifacts(
        organizationId,
        module,
        input.seasonCode
      );

      // Execute based on executor type
      let output: Record<string, unknown>;

      switch (module.executorType) {
        case 'ai-agent':
          output = await this.executeWithAgent(module, inputArtifacts, input);
          break;
        case 'workflow':
          output = await this.executeWithWorkflow(module, inputArtifacts, input);
          break;
        case 'mcp-tool':
          output = await this.executeWithMCPTool(module, inputArtifacts, input);
          break;
        case 'hybrid':
          output = await this.executeHybrid(module, inputArtifacts, input);
          break;
        default:
          throw new Error(`Unknown executor type: ${module.executorType}`);
      }

      // Create output artifact
      const artifact = await this.artifactService.create(organizationId, {
        moduleId: module.id,
        data: output,
        seasonCode: input.seasonCode,
        collectionId: input.collectionId,
        tags: [executionId],
        upstreamArtifactIds: inputArtifacts.map(a => a.id),
        createdBy: input.userId,
      });

      return { success: true, artifactId: artifact.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get input artifacts for a module
   */
  private async getInputArtifacts(
    organizationId: string,
    module: ModuleDefinition,
    _seasonCode?: string
  ): Promise<Array<{ id: string; moduleId: string; data: Record<string, unknown> }>> {
    const artifacts: Array<{ id: string; moduleId: string; data: Record<string, unknown> }> = [];

    for (const requiredModuleId of module.requiredInputs) {
      const artifact = await this.artifactService.getLatestForModule(
        organizationId,
        requiredModuleId,
        'approved'
      );

      if (artifact) {
        artifacts.push({
          id: artifact.id,
          moduleId: artifact.moduleId,
          data: artifact.data as Record<string, unknown>,
        });
      }
    }

    return artifacts;
  }

  /**
   * Execute module with AI agent
   */
  private async executeWithAgent(
    module: ModuleDefinition,
    inputArtifacts: Array<{ id: string; moduleId: string; data: Record<string, unknown> }>,
    _input: ValueStreamInput
  ): Promise<Record<string, unknown>> {
    // Would use delegateTask to execute with agent
    // Simplified for now
    return {
      moduleId: module.id,
      executedAt: new Date().toISOString(),
      input: inputArtifacts.map(a => a.moduleId),
      result: 'Agent execution completed',
    };
  }

  /**
   * Execute module with workflow
   */
  private async executeWithWorkflow(
    module: ModuleDefinition,
    inputArtifacts: Array<{ id: string; moduleId: string; data: Record<string, unknown> }>,
    _input: ValueStreamInput
  ): Promise<Record<string, unknown>> {
    // Would trigger n8n workflow
    return {
      moduleId: module.id,
      executedAt: new Date().toISOString(),
      input: inputArtifacts.map(a => a.moduleId),
      result: 'Workflow execution completed',
    };
  }

  /**
   * Execute module with MCP tool
   */
  private async executeWithMCPTool(
    module: ModuleDefinition,
    inputArtifacts: Array<{ id: string; moduleId: string; data: Record<string, unknown> }>,
    _input: ValueStreamInput
  ): Promise<Record<string, unknown>> {
    // Would invoke MCP tool
    return {
      moduleId: module.id,
      executedAt: new Date().toISOString(),
      input: inputArtifacts.map(a => a.moduleId),
      result: 'MCP tool execution completed',
    };
  }

  /**
   * Execute module with hybrid approach
   */
  private async executeHybrid(
    module: ModuleDefinition,
    inputArtifacts: Array<{ id: string; moduleId: string; data: Record<string, unknown> }>,
    _input: ValueStreamInput
  ): Promise<Record<string, unknown>> {
    // Would combine multiple execution methods
    return {
      moduleId: module.id,
      executedAt: new Date().toISOString(),
      input: inputArtifacts.map(a => a.moduleId),
      result: 'Hybrid execution completed',
    };
  }

  /**
   * Check health of a single module
   */
  private async checkModuleHealth(
    organizationId: string,
    module: ModuleDefinition
  ): Promise<ModuleHealth> {
    // Get recent execution data
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: cutoff },
        metadata: {
          path: ['moduleId'],
          equals: module.id,
        },
      },
      select: {
        status: true,
        duration: true,
        createdAt: true,
      },
    });

    const successCount = executions.filter(e => e.status === 'success').length;
    const totalCount = executions.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 1;
    const avgDuration = totalCount > 0
      ? executions.reduce((sum, e) => sum + e.duration, 0) / totalCount
      : 0;
    const errorCount = totalCount - successCount;
    const lastExecuted = executions[0]?.createdAt;

    // Determine status
    let status: ModuleHealth['status'] = 'healthy';
    const issues: string[] = [];

    if (successRate < 0.5) {
      status = 'critical';
      issues.push('Success rate below 50%');
    } else if (successRate < 0.8) {
      status = 'degraded';
      issues.push('Success rate below 80%');
    }

    if (avgDuration > 120000) { // 2 minutes
      if (status === 'healthy') status = 'degraded';
      issues.push('High average execution time');
    }

    if (!lastExecuted && totalCount === 0) {
      status = 'unknown';
      issues.push('No recent executions');
    }

    return {
      moduleId: module.id,
      moduleName: module.name,
      status,
      lastExecuted,
      successRate,
      averageExecutionTime: avgDuration,
      errorCount,
      issues,
    };
  }

  /**
   * Store execution status
   */
  private async storeExecutionStatus(status: ExecutionStatus): Promise<void> {
    await prisma.aRDepartmentLog.create({
      data: {
        organizationId: 'system',
        action: 'value_stream_execution',
        category: 'orchestration',
        details: JSON.parse(JSON.stringify(status)),
        impact: status.status === 'failed' ? 'high' : 'low',
      },
    });
  }
}

// Export singleton instance
export const megaAppManagerService = new MegaAppManagerService();
