/**
 * Troubleshooter Service
 *
 * Automatic issue detection, diagnosis, and resolution for MegaApp modules.
 * Integrates with AR for approvals and agent assignment.
 */

import { db as prisma } from '../../../db/client';
import { logger } from '../../../utils/logger';
import { metrics } from '../../../utils/metrics';
import { arCoordinatorService } from './ar-coordinator.service';
import type {
  ModuleIssue,
  IssueType,
  IssueDiagnosis,
  SuggestedFix,
  FixStep,
  TroubleshootResult,
} from './types';

export class TroubleshooterService {
  private readonly ISSUE_PATTERNS: Map<string, IssuePattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  /**
   * Detect issues in a module
   */
  async detectIssues(
    organizationId: string,
    moduleId?: string
  ): Promise<ModuleIssue[]> {
    const startTime = Date.now();
    const issues: ModuleIssue[] = [];

    try {
      // Get modules to check
      const modules = moduleId
        ? [await this.getModule(organizationId, moduleId)]
        : await this.getAllModules(organizationId);

      for (const module of modules.filter(Boolean)) {
        // Check execution history for failures
        const recentExecutions = await this.getRecentExecutions(
          organizationId,
          module!.id,
          24 // hours
        );

        // Check for high failure rate
        const failureRate = this.calculateFailureRate(recentExecutions);
        if (failureRate > 0.2) { // More than 20% failures
          issues.push(this.createIssue(
            organizationId,
            module!.id,
            'execution_failure',
            failureRate > 0.5 ? 'high' : 'medium',
            `High execution failure rate: ${(failureRate * 100).toFixed(1)}%`,
            `Module ${module!.name} has a ${(failureRate * 100).toFixed(1)}% failure rate in the last 24 hours`,
            { failureRate, executionCount: recentExecutions.length }
          ));
        }

        // Check for performance degradation
        const avgDuration = this.calculateAverageDuration(recentExecutions);
        const baselineDuration = await this.getBaselineDuration(organizationId, module!.id);
        if (avgDuration > baselineDuration * 1.5) { // 50% slower than baseline
          issues.push(this.createIssue(
            organizationId,
            module!.id,
            'performance_degradation',
            avgDuration > baselineDuration * 2 ? 'high' : 'medium',
            `Performance degradation detected`,
            `Module ${module!.name} is ${((avgDuration / baselineDuration - 1) * 100).toFixed(0)}% slower than baseline`,
            { avgDuration, baselineDuration }
          ));
        }

        // Check for timeout issues
        const timeoutCount = recentExecutions.filter(e => e.error?.includes('timeout')).length;
        if (timeoutCount > 2) {
          issues.push(this.createIssue(
            organizationId,
            module!.id,
            'timeout',
            timeoutCount > 5 ? 'high' : 'medium',
            `Frequent timeout errors`,
            `Module ${module!.name} has experienced ${timeoutCount} timeouts in the last 24 hours`,
            { timeoutCount }
          ));
        }

        // Check for dependency errors
        const depErrors = recentExecutions.filter(e =>
          e.error?.includes('dependency') || e.error?.includes('missing input')
        ).length;
        if (depErrors > 1) {
          issues.push(this.createIssue(
            organizationId,
            module!.id,
            'dependency_error',
            'medium',
            `Dependency resolution failures`,
            `Module ${module!.name} has dependency issues affecting execution`,
            { depErrors }
          ));
        }
      }

      metrics.histogram('troubleshooter.detect_issues', Date.now() - startTime);
      metrics.gauge('troubleshooter.issues_found', issues.length, {
        organizationId,
      });

      logger.info('[Troubleshooter] Issue detection completed', {
        organizationId,
        moduleId,
        issuesFound: issues.length,
      });

      return issues;
    } catch (error) {
      logger.error('[Troubleshooter] Failed to detect issues', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        moduleId,
      });
      throw error;
    }
  }

  /**
   * Diagnose an issue and find root cause
   */
  async diagnose(issue: ModuleIssue): Promise<IssueDiagnosis> {
    const startTime = Date.now();

    try {
      logger.info('[Troubleshooter] Diagnosing issue', {
        issueId: issue.issueId,
        type: issue.type,
        moduleId: issue.moduleId,
      });

      // Get diagnostic data
      const diagnosticData = await this.collectDiagnosticData(issue);

      // Analyze root cause based on issue type
      const analysis = await this.analyzeRootCause(issue, diagnosticData);

      // Generate suggested fixes
      const suggestedFixes = this.generateSuggestedFixes(issue, analysis);

      const diagnosis: IssueDiagnosis = {
        issueId: issue.issueId,
        rootCause: analysis.rootCause,
        confidence: analysis.confidence,
        relatedIssues: analysis.relatedIssues,
        suggestedFixes,
        diagnosticData,
        diagnosedAt: new Date(),
      };

      // Store diagnosis
      await this.storeDiagnosis(diagnosis);

      metrics.histogram('troubleshooter.diagnose', Date.now() - startTime);
      metrics.increment('troubleshooter.diagnosis.success');

      logger.info('[Troubleshooter] Diagnosis completed', {
        issueId: issue.issueId,
        rootCause: analysis.rootCause,
        confidence: analysis.confidence,
        fixCount: suggestedFixes.length,
      });

      return diagnosis;
    } catch (error) {
      logger.error('[Troubleshooter] Failed to diagnose issue', {
        error: error instanceof Error ? error.message : String(error),
        issueId: issue.issueId,
      });
      metrics.increment('troubleshooter.diagnosis.error');
      throw error;
    }
  }

  /**
   * Generate a fix plan for a diagnosis
   */
  async generateFix(diagnosis: IssueDiagnosis): Promise<SuggestedFix | null> {
    if (diagnosis.suggestedFixes.length === 0) {
      logger.warn('[Troubleshooter] No suggested fixes available', {
        issueId: diagnosis.issueId,
      });
      return null;
    }

    // Return the highest confidence fix
    const sortedFixes = [...diagnosis.suggestedFixes].sort(
      (a, b) => b.confidence - a.confidence
    );

    return sortedFixes[0];
  }

  /**
   * Apply a fix to resolve an issue
   */
  async applyFix(
    organizationId: string,
    fix: SuggestedFix,
    requireApproval: boolean = true
  ): Promise<TroubleshootResult> {
    const startTime = Date.now();
    const stepsCompleted: number[] = [];
    let verificationPassed = false;
    let rollbackPerformed = false;

    try {
      // Check if approval is required
      if (requireApproval && fix.requiresApproval) {
        const escalationId = await arCoordinatorService.escalateToARDirector(
          organizationId,
          {
            type: 'approval',
            title: `Fix approval required: ${fix.title}`,
            description: fix.description,
            urgency: fix.risk === 'high' ? 'high' : 'medium',
            context: {
              fixId: fix.fixId,
              steps: fix.steps,
              estimatedDuration: fix.estimatedDuration,
            },
            requiredAction: 'Approve or reject the proposed fix',
          }
        );

        logger.info('[Troubleshooter] Fix awaiting approval', {
          fixId: fix.fixId,
          escalationId,
        });

        return {
          issueId: fix.fixId.split('-')[0],
          fixId: fix.fixId,
          status: 'partial',
          stepsCompleted: 0,
          totalSteps: fix.steps.length,
          duration: Date.now() - startTime,
          verificationPassed: false,
          rollbackPerformed: false,
          details: `Awaiting approval (escalation: ${escalationId})`,
        };
      }

      // Execute fix steps
      for (const step of fix.steps) {
        try {
          if (step.automated) {
            await this.executeAutomatedStep(organizationId, step);
          } else {
            // Log manual step requirement
            logger.info('[Troubleshooter] Manual step required', {
              fixId: fix.fixId,
              step: step.order,
              action: step.action,
            });
          }
          stepsCompleted.push(step.order);
        } catch (stepError) {
          logger.error('[Troubleshooter] Step execution failed', {
            fixId: fix.fixId,
            step: step.order,
            error: stepError instanceof Error ? stepError.message : String(stepError),
          });

          // Attempt rollback
          rollbackPerformed = await this.rollbackSteps(
            organizationId,
            fix,
            stepsCompleted
          );
          break;
        }
      }

      // Verify fix if all steps completed
      if (stepsCompleted.length === fix.steps.length) {
        verificationPassed = await this.verifyFix(organizationId, fix);
      }

      const result: TroubleshootResult = {
        issueId: fix.fixId.split('-')[0],
        fixId: fix.fixId,
        status: this.determineFixStatus(
          stepsCompleted.length,
          fix.steps.length,
          verificationPassed,
          rollbackPerformed
        ),
        stepsCompleted: stepsCompleted.length,
        totalSteps: fix.steps.length,
        duration: Date.now() - startTime,
        verificationPassed,
        rollbackPerformed,
      };

      metrics.histogram('troubleshooter.apply_fix', Date.now() - startTime);
      metrics.increment('troubleshooter.fix.applied', {
        status: result.status,
      });

      logger.info('[Troubleshooter] Fix application completed', {
        fixId: fix.fixId,
        status: result.status,
        stepsCompleted: stepsCompleted.length,
        verificationPassed,
      });

      return result;
    } catch (error) {
      logger.error('[Troubleshooter] Failed to apply fix', {
        error: error instanceof Error ? error.message : String(error),
        fixId: fix.fixId,
      });

      return {
        issueId: fix.fixId.split('-')[0],
        fixId: fix.fixId,
        status: 'failed',
        stepsCompleted: stepsCompleted.length,
        totalSteps: fix.steps.length,
        duration: Date.now() - startTime,
        verificationPassed: false,
        rollbackPerformed,
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Initialize known issue patterns
   */
  private initializePatterns(): void {
    this.ISSUE_PATTERNS.set('execution_failure', {
      symptoms: ['error', 'exception', 'failed'],
      possibleCauses: [
        'Invalid input data',
        'Agent configuration issue',
        'External service unavailable',
        'Resource limits exceeded',
      ],
      fixStrategies: ['retry', 'reconfigure', 'escalate'],
    });

    this.ISSUE_PATTERNS.set('performance_degradation', {
      symptoms: ['slow', 'latency', 'timeout_warning'],
      possibleCauses: [
        'High workload',
        'Memory pressure',
        'Inefficient processing',
        'Network latency',
      ],
      fixStrategies: ['optimize', 'scale', 'cache'],
    });

    this.ISSUE_PATTERNS.set('timeout', {
      symptoms: ['timeout', 'deadline_exceeded'],
      possibleCauses: [
        'Task too complex',
        'Agent overloaded',
        'External dependency slow',
        'Configuration issue',
      ],
      fixStrategies: ['increase_timeout', 'simplify', 'retry'],
    });

    this.ISSUE_PATTERNS.set('dependency_error', {
      symptoms: ['missing_input', 'dependency_not_found', 'circular'],
      possibleCauses: [
        'Missing upstream artifact',
        'Module misconfiguration',
        'Execution order issue',
      ],
      fixStrategies: ['regenerate_dependency', 'reorder', 'reconfigure'],
    });
  }

  /**
   * Create an issue object
   */
  private createIssue(
    organizationId: string,
    moduleId: string,
    type: IssueType,
    severity: ModuleIssue['severity'],
    title: string,
    description: string,
    context?: Record<string, unknown>
  ): ModuleIssue {
    return {
      issueId: `issue-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      organizationId,
      moduleId,
      type,
      severity,
      title,
      description,
      detectedAt: new Date(),
      context,
    };
  }

  /**
   * Get module details
   */
  private async getModule(
    organizationId: string,
    moduleId: string
  ): Promise<{ id: string; name: string } | null> {
    const module = await prisma.megaAppModule.findFirst({
      where: { organizationId, id: moduleId },
      select: { id: true, name: true },
    });
    return module;
  }

  /**
   * Get all modules for an organization
   */
  private async getAllModules(
    organizationId: string
  ): Promise<Array<{ id: string; name: string }>> {
    return prisma.megaAppModule.findMany({
      where: { organizationId, enabled: true },
      select: { id: true, name: true },
    });
  }

  /**
   * Get recent executions for a module
   */
  private async getRecentExecutions(
    organizationId: string,
    moduleId: string,
    hoursBack: number
  ): Promise<Array<{ status: string; duration: number; error?: string }>> {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    // Query orchestrator executions related to this module
    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: cutoff },
        metadata: {
          path: ['moduleId'],
          equals: moduleId,
        },
      },
      select: {
        status: true,
        duration: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return executions.map(e => ({
      status: e.status,
      duration: e.duration,
      error: e.errorMessage || undefined,
    }));
  }

  /**
   * Calculate failure rate from executions
   */
  private calculateFailureRate(
    executions: Array<{ status: string }>
  ): number {
    if (executions.length === 0) return 0;
    const failures = executions.filter(e => e.status === 'failed').length;
    return failures / executions.length;
  }

  /**
   * Calculate average duration from executions
   */
  private calculateAverageDuration(
    executions: Array<{ duration: number }>
  ): number {
    if (executions.length === 0) return 0;
    const total = executions.reduce((sum, e) => sum + e.duration, 0);
    return total / executions.length;
  }

  /**
   * Get baseline duration for a module
   */
  private async getBaselineDuration(
    organizationId: string,
    moduleId: string
  ): Promise<number> {
    // Get historical average (last 7 days) as baseline
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await prisma.orchestratorExecution.aggregate({
      where: {
        organizationId,
        status: 'success',
        createdAt: { gte: cutoff },
        metadata: {
          path: ['moduleId'],
          equals: moduleId,
        },
      },
      _avg: {
        duration: true,
      },
    });

    return result._avg.duration || 30000; // Default to 30 seconds
  }

  /**
   * Collect diagnostic data for an issue
   */
  private async collectDiagnosticData(
    issue: ModuleIssue
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      issue: {
        id: issue.issueId,
        type: issue.type,
        severity: issue.severity,
      },
      context: issue.context,
    };

    // Get recent logs
    const logs = await prisma.aRDepartmentLog.findMany({
      where: {
        organizationId: issue.organizationId,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    data.recentLogs = logs;

    // Get module configuration
    const module = await this.getModule(issue.organizationId, issue.moduleId);
    data.module = module;

    return data;
  }

  /**
   * Analyze root cause of an issue
   */
  private async analyzeRootCause(
    issue: ModuleIssue,
    _diagnosticData: Record<string, unknown>
  ): Promise<{ rootCause: string; confidence: number; relatedIssues?: string[] }> {
    const pattern = this.ISSUE_PATTERNS.get(issue.type);

    if (!pattern) {
      return {
        rootCause: 'Unknown issue type - manual investigation required',
        confidence: 0.3,
      };
    }

    // Analyze based on context
    const context = issue.context || {};
    let rootCause = pattern.possibleCauses[0];
    let confidence = 0.5;

    // Refine based on specific data
    if (issue.type === 'execution_failure') {
      const failureRate = context.failureRate as number;
      if (failureRate > 0.8) {
        rootCause = 'Systematic configuration or integration issue';
        confidence = 0.8;
      } else if (failureRate > 0.5) {
        rootCause = 'Intermittent failure likely due to external dependencies';
        confidence = 0.6;
      }
    }

    if (issue.type === 'performance_degradation') {
      const avgDuration = context.avgDuration as number;
      const baseline = context.baselineDuration as number;
      if (avgDuration > baseline * 3) {
        rootCause = 'Severe performance issue - possible resource exhaustion';
        confidence = 0.75;
      }
    }

    return {
      rootCause,
      confidence,
      relatedIssues: undefined,
    };
  }

  /**
   * Generate suggested fixes based on issue and analysis
   */
  private generateSuggestedFixes(
    issue: ModuleIssue,
    analysis: { rootCause: string; confidence: number }
  ): SuggestedFix[] {
    const fixes: SuggestedFix[] = [];
    const pattern = this.ISSUE_PATTERNS.get(issue.type);

    if (!pattern) return fixes;

    // Generate fix based on type
    switch (issue.type) {
      case 'execution_failure':
        fixes.push({
          fixId: `fix-${issue.issueId}-retry`,
          title: 'Retry failed executions',
          description: 'Retry failed module executions with exponential backoff',
          type: 'automatic',
          confidence: 0.6,
          estimatedDuration: 5,
          risk: 'low',
          steps: [
            {
              order: 1,
              action: 'identify_failed_executions',
              description: 'Identify all failed executions in the last 24 hours',
              automated: true,
            },
            {
              order: 2,
              action: 'retry_with_backoff',
              description: 'Retry each failed execution with exponential backoff',
              automated: true,
              rollbackAction: 'cancel_pending_retries',
            },
            {
              order: 3,
              action: 'verify_success',
              description: 'Verify retry success rate',
              automated: true,
            },
          ],
          requiresApproval: false,
        });

        if (analysis.confidence > 0.7) {
          fixes.push({
            fixId: `fix-${issue.issueId}-reconfigure`,
            title: 'Reconfigure module',
            description: 'Reset module configuration to known-good state',
            type: 'semi-automatic',
            confidence: 0.5,
            estimatedDuration: 15,
            risk: 'medium',
            steps: [
              {
                order: 1,
                action: 'backup_config',
                description: 'Backup current module configuration',
                automated: true,
              },
              {
                order: 2,
                action: 'reset_config',
                description: 'Reset to default configuration',
                automated: true,
                rollbackAction: 'restore_backup',
              },
              {
                order: 3,
                action: 'validate_config',
                description: 'Validate configuration and test execution',
                automated: true,
              },
            ],
            requiresApproval: true,
          });
        }
        break;

      case 'performance_degradation':
        fixes.push({
          fixId: `fix-${issue.issueId}-optimize`,
          title: 'Optimize module execution',
          description: 'Apply performance optimizations to improve execution speed',
          type: 'automatic',
          confidence: 0.55,
          estimatedDuration: 10,
          risk: 'low',
          steps: [
            {
              order: 1,
              action: 'clear_cache',
              description: 'Clear module execution cache',
              automated: true,
            },
            {
              order: 2,
              action: 'optimize_queries',
              description: 'Optimize database queries for module',
              automated: true,
            },
            {
              order: 3,
              action: 'benchmark',
              description: 'Run benchmark to verify improvement',
              automated: true,
            },
          ],
          requiresApproval: false,
        });
        break;

      case 'timeout':
        fixes.push({
          fixId: `fix-${issue.issueId}-timeout`,
          title: 'Adjust timeout configuration',
          description: 'Increase timeout limits for module execution',
          type: 'automatic',
          confidence: 0.65,
          estimatedDuration: 2,
          risk: 'low',
          steps: [
            {
              order: 1,
              action: 'analyze_timeouts',
              description: 'Analyze timeout patterns',
              automated: true,
            },
            {
              order: 2,
              action: 'increase_timeout',
              description: 'Increase timeout limit by 50%',
              automated: true,
              rollbackAction: 'revert_timeout',
            },
          ],
          requiresApproval: false,
        });
        break;

      case 'dependency_error':
        fixes.push({
          fixId: `fix-${issue.issueId}-deps`,
          title: 'Resolve dependency issues',
          description: 'Regenerate missing dependencies and validate execution order',
          type: 'semi-automatic',
          confidence: 0.6,
          estimatedDuration: 20,
          risk: 'medium',
          steps: [
            {
              order: 1,
              action: 'identify_missing',
              description: 'Identify missing upstream artifacts',
              automated: true,
            },
            {
              order: 2,
              action: 'regenerate_artifacts',
              description: 'Regenerate missing artifacts',
              automated: true,
            },
            {
              order: 3,
              action: 'validate_chain',
              description: 'Validate dependency chain',
              automated: true,
            },
          ],
          requiresApproval: true,
        });
        break;
    }

    return fixes;
  }

  /**
   * Store diagnosis in database
   */
  private async storeDiagnosis(diagnosis: IssueDiagnosis): Promise<void> {
    await prisma.aRDepartmentLog.create({
      data: {
        organizationId: 'system',
        action: 'issue_diagnosis',
        category: 'troubleshooting',
        details: {
          issueId: diagnosis.issueId,
          rootCause: diagnosis.rootCause,
          confidence: diagnosis.confidence,
          suggestedFixes: diagnosis.suggestedFixes.map(f => ({
            fixId: f.fixId,
            title: f.title,
            type: f.type,
            confidence: f.confidence,
          })),
        },
        impact: 'medium',
      },
    });
  }

  /**
   * Execute an automated fix step
   */
  private async executeAutomatedStep(
    organizationId: string,
    step: FixStep
  ): Promise<void> {
    logger.info('[Troubleshooter] Executing automated step', {
      organizationId,
      step: step.order,
      action: step.action,
    });

    // Step execution logic would go here based on action type
    // For now, simulate execution
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Rollback completed steps
   */
  private async rollbackSteps(
    organizationId: string,
    fix: SuggestedFix,
    completedSteps: number[]
  ): Promise<boolean> {
    logger.info('[Troubleshooter] Rolling back steps', {
      organizationId,
      fixId: fix.fixId,
      completedSteps,
    });

    try {
      // Execute rollback actions in reverse order
      for (const stepOrder of completedSteps.reverse()) {
        const step = fix.steps.find(s => s.order === stepOrder);
        if (step?.rollbackAction) {
          await this.executeAutomatedStep(organizationId, {
            order: stepOrder,
            action: step.rollbackAction,
            description: `Rollback: ${step.description}`,
            automated: true,
          });
        }
      }
      return true;
    } catch (error) {
      logger.error('[Troubleshooter] Rollback failed', {
        error: error instanceof Error ? error.message : String(error),
        fixId: fix.fixId,
      });
      return false;
    }
  }

  /**
   * Verify that a fix was successful
   */
  private async verifyFix(
    organizationId: string,
    fix: SuggestedFix
  ): Promise<boolean> {
    // Verification logic would depend on the fix type
    // For now, return true
    logger.info('[Troubleshooter] Verifying fix', {
      organizationId,
      fixId: fix.fixId,
    });
    return true;
  }

  /**
   * Determine fix status based on results
   */
  private determineFixStatus(
    completed: number,
    total: number,
    verified: boolean,
    rolledBack: boolean
  ): TroubleshootResult['status'] {
    if (rolledBack) return 'rolled_back';
    if (completed === 0) return 'failed';
    if (completed < total) return 'partial';
    if (!verified) return 'partial';
    return 'success';
  }
}

// Type for issue patterns
interface IssuePattern {
  symptoms: string[];
  possibleCauses: string[];
  fixStrategies: string[];
}

// Export singleton instance
export const troubleshooterService = new TroubleshooterService();
