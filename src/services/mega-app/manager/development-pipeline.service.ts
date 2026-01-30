/**
 * Development Pipeline Service
 *
 * Auto-development from feature requests. Handles plan creation,
 * agent assignment, development tracking, QA validation, and release.
 */

import { db as prisma } from '../../../db/client';
import { logger } from '../../../utils/logger';
import { metrics } from '../../../utils/metrics';
import { valueStreamQueue } from '../../../queue/value-stream.queue';
import { delegateTask } from '../../../orchestrator/delegate-task';
import { arCoordinatorService } from './ar-coordinator.service';
import type {
  DevelopmentPlan,
  DevelopmentPlanStatus,
  DevelopmentTask,
  AgentAssignment,
  DevelopmentResult,
  AgentCapabilityRequirements,
} from './types';

export class DevelopmentPipelineService {
  private readonly CAPABILITY_MAP: Record<string, string> = {
    design: 'module_design',
    implementation: 'code_implementation',
    testing: 'qa_testing',
    documentation: 'technical_writing',
    review: 'code_review',
  };

  /**
   * Create a development plan from a feature request
   */
  async createDevelopmentPlan(
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
    const startTime = Date.now();

    try {
      logger.info('[DevelopmentPipeline] Creating development plan', {
        organizationId,
        featureRequestId: featureRequest.id,
        title: featureRequest.title,
      });

      // Analyze feature request complexity
      const complexity = this.analyzeComplexity(featureRequest);

      // Generate tasks based on requirements
      const tasks = await this.generateTasks(featureRequest, complexity);

      // Calculate estimates
      const estimatedHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);

      // Determine if approval is required (based on complexity and estimated hours)
      const approvalRequired = complexity === 'complex' || estimatedHours > 40;

      const plan: DevelopmentPlan = {
        planId: `plan-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        featureRequestId: featureRequest.id,
        organizationId,
        title: featureRequest.title,
        description: featureRequest.description,
        status: approvalRequired ? 'pending_approval' : 'draft',
        priority: featureRequest.priority || 'medium',
        complexity,
        estimatedHours,
        tasks,
        dependencies: [],
        assignedAgents: [],
        approvalRequired,
        createdAt: new Date(),
        updatedAt: new Date(),
        targetCompletionDate: this.calculateTargetDate(estimatedHours),
      };

      // Store plan
      await this.storePlan(plan);

      // If approval required, escalate to AR Director
      if (approvalRequired) {
        await arCoordinatorService.escalateToARDirector(organizationId, {
          type: 'approval',
          title: `Development plan approval: ${plan.title}`,
          description: `New development plan requires approval. Complexity: ${complexity}, Estimated: ${estimatedHours}h`,
          urgency: featureRequest.priority || 'medium',
          context: {
            planId: plan.planId,
            tasks: tasks.length,
            estimatedHours,
          },
          requiredAction: 'Review and approve/reject development plan',
        });
      }

      metrics.histogram('dev_pipeline.create_plan', Date.now() - startTime);
      metrics.increment('dev_pipeline.plans_created', { complexity });

      logger.info('[DevelopmentPipeline] Development plan created', {
        planId: plan.planId,
        complexity,
        tasksCount: tasks.length,
        estimatedHours,
        approvalRequired,
      });

      return plan;
    } catch (error) {
      logger.error('[DevelopmentPipeline] Failed to create development plan', {
        error: error instanceof Error ? error.message : String(error),
        featureRequestId: featureRequest.id,
      });
      throw error;
    }
  }

  /**
   * Assign tasks to agents via AR system
   */
  async assignToAgents(plan: DevelopmentPlan): Promise<DevelopmentPlan> {
    const startTime = Date.now();

    try {
      logger.info('[DevelopmentPipeline] Assigning tasks to agents', {
        planId: plan.planId,
        tasksCount: plan.tasks.length,
      });

      const assignments: AgentAssignment[] = [];

      // Group tasks by type for efficient assignment
      const tasksByType = this.groupTasksByType(plan.tasks);

      for (const [taskType, tasks] of Object.entries(tasksByType)) {
        const capability = this.CAPABILITY_MAP[taskType] || taskType;

        // Request agent assignment from AR
        const requirements: AgentCapabilityRequirements = {
          primaryCapability: capability,
          minPerformanceScore: plan.complexity === 'complex' ? 80 : 60,
          preferredTier: this.getTierForComplexity(plan.complexity),
          maxWorkload: 0.8,
        };

        for (const task of tasks) {
          const assignment = await arCoordinatorService.requestAgentAssignment(
            plan.organizationId,
            {
              taskId: task.taskId,
              requirements,
              priority: plan.priority,
              estimatedDuration: task.estimatedHours * 60, // Convert to minutes
              deadline: plan.targetCompletionDate,
              context: {
                planId: plan.planId,
                taskTitle: task.title,
              },
            }
          );

          if (assignment) {
            // Find existing assignment or create new one
            let agentAssignment = assignments.find(
              a => a.agentId === assignment.agentId
            );

            if (!agentAssignment) {
              agentAssignment = {
                agentId: assignment.agentId,
                taskIds: [],
                capability,
                assignedAt: new Date(),
                status: 'active',
              };
              assignments.push(agentAssignment);
            }

            agentAssignment.taskIds.push(task.taskId);
            task.assignedAgentId = assignment.agentId;
          } else {
            logger.warn('[DevelopmentPipeline] Could not assign agent to task', {
              planId: plan.planId,
              taskId: task.taskId,
              capability,
            });
          }
        }
      }

      // Update plan with assignments
      plan.assignedAgents = assignments;
      plan.updatedAt = new Date();

      // Update stored plan
      await this.updateStoredPlan(plan);

      metrics.histogram('dev_pipeline.assign_agents', Date.now() - startTime);
      metrics.gauge('dev_pipeline.assigned_agents', assignments.length, {
        planId: plan.planId,
      });

      logger.info('[DevelopmentPipeline] Agents assigned to plan', {
        planId: plan.planId,
        assignmentsCount: assignments.length,
        totalTasksAssigned: assignments.reduce((sum, a) => sum + a.taskIds.length, 0),
      });

      return plan;
    } catch (error) {
      logger.error('[DevelopmentPipeline] Failed to assign agents', {
        error: error instanceof Error ? error.message : String(error),
        planId: plan.planId,
      });
      throw error;
    }
  }

  /**
   * Track development progress
   */
  async trackDevelopment(planId: string): Promise<{
    plan: DevelopmentPlan;
    progress: number;
    blockers: string[];
  }> {
    try {
      const plan = await this.loadPlan(planId);
      if (!plan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      // Calculate progress
      const completedTasks = plan.tasks.filter(t => t.status === 'completed').length;
      const progress = (completedTasks / plan.tasks.length) * 100;

      // Identify blockers
      const blockers: string[] = [];

      for (const task of plan.tasks) {
        if (task.status === 'pending' || task.status === 'in_progress') {
          // Check dependencies
          const unmetDeps = task.dependencies.filter(depId => {
            const depTask = plan.tasks.find(t => t.taskId === depId);
            return depTask && depTask.status !== 'completed';
          });

          if (unmetDeps.length > 0) {
            blockers.push(`Task "${task.title}" blocked by unmet dependencies`);
          }

          // Check if assigned agent is available
          if (task.assignedAgentId) {
            const assignment = plan.assignedAgents.find(
              a => a.agentId === task.assignedAgentId
            );
            if (!assignment || assignment.status !== 'active') {
              blockers.push(`Task "${task.title}" - assigned agent unavailable`);
            }
          } else {
            blockers.push(`Task "${task.title}" - no agent assigned`);
          }
        }

        // Check for failed tasks
        if (task.status === 'failed') {
          blockers.push(`Task "${task.title}" has failed and needs attention`);
        }
      }

      // Update plan status based on progress
      if (completedTasks === plan.tasks.length) {
        plan.status = 'testing';
      } else if (completedTasks > 0 || plan.tasks.some(t => t.status === 'in_progress')) {
        plan.status = 'in_progress';
      }

      logger.debug('[DevelopmentPipeline] Tracking development', {
        planId,
        progress,
        blockersCount: blockers.length,
      });

      return { plan, progress, blockers };
    } catch (error) {
      logger.error('[DevelopmentPipeline] Failed to track development', {
        error: error instanceof Error ? error.message : String(error),
        planId,
      });
      throw error;
    }
  }

  /**
   * Execute a single task
   */
  async executeTask(
    plan: DevelopmentPlan,
    taskId: string
  ): Promise<{ success: boolean; artifactId?: string; error?: string }> {
    const task = plan.tasks.find(t => t.taskId === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const startTime = Date.now();

    try {
      logger.info('[DevelopmentPipeline] Executing task', {
        planId: plan.planId,
        taskId,
        taskTitle: task.title,
        assignedAgent: task.assignedAgentId,
      });

      // Update task status
      task.status = 'in_progress';
      await this.updateStoredPlan(plan);

      // Prepare execution prompt
      const prompt = this.buildTaskPrompt(plan, task);

      // Execute via orchestrator
      const result = await delegateTask({
        category: this.getCategoryForTaskType(task.type),
        load_skills: this.getSkillsForTaskType(task.type),
        prompt,
        session_id: `dev-${plan.planId}-${taskId}`,
        organizationId: plan.organizationId,
        context: {
          planId: plan.planId,
          taskId,
          taskType: task.type,
        },
      });

      // Calculate actual hours
      task.actualHours = (Date.now() - startTime) / (1000 * 60 * 60);

      if (result.status === 'success') {
        task.status = 'completed';

        // Create artifact for the output
        const artifactId = await this.createTaskArtifact(plan, task, result.output);
        task.artifactIds = [...(task.artifactIds || []), artifactId];

        await this.updateStoredPlan(plan);

        metrics.increment('dev_pipeline.task_completed', {
          type: task.type,
        });

        return { success: true, artifactId };
      } else {
        task.status = 'failed';
        await this.updateStoredPlan(plan);

        metrics.increment('dev_pipeline.task_failed', {
          type: task.type,
        });

        return { success: false, error: result.output };
      }
    } catch (error) {
      task.status = 'failed';
      await this.updateStoredPlan(plan);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate implementation through QA
   */
  async validateImplementation(planId: string): Promise<{
    passed: boolean;
    results: Array<{ check: string; passed: boolean; details?: string }>;
  }> {
    const startTime = Date.now();

    try {
      const plan = await this.loadPlan(planId);
      if (!plan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      logger.info('[DevelopmentPipeline] Validating implementation', {
        planId,
      });

      const results: Array<{ check: string; passed: boolean; details?: string }> = [];

      // Check all tasks completed
      const incompleteTasks = plan.tasks.filter(t => t.status !== 'completed');
      results.push({
        check: 'All tasks completed',
        passed: incompleteTasks.length === 0,
        details: incompleteTasks.length > 0
          ? `${incompleteTasks.length} tasks incomplete`
          : undefined,
      });

      // Check artifacts created
      const tasksWithArtifacts = plan.tasks.filter(
        t => t.artifactIds && t.artifactIds.length > 0
      );
      results.push({
        check: 'Artifacts generated',
        passed: tasksWithArtifacts.length > 0,
        details: `${tasksWithArtifacts.length}/${plan.tasks.length} tasks produced artifacts`,
      });

      // Check testing task passed
      const testingTasks = plan.tasks.filter(t => t.type === 'testing');
      const testsPassed = testingTasks.every(t => t.status === 'completed');
      results.push({
        check: 'Tests passed',
        passed: testsPassed,
        details: testingTasks.length === 0
          ? 'No testing tasks defined'
          : undefined,
      });

      // Check review completed
      const reviewTasks = plan.tasks.filter(t => t.type === 'review');
      const reviewsPassed = reviewTasks.every(t => t.status === 'completed');
      results.push({
        check: 'Reviews completed',
        passed: reviewsPassed,
        details: reviewTasks.length === 0
          ? 'No review tasks defined'
          : undefined,
      });

      const allPassed = results.every(r => r.passed);

      if (allPassed) {
        plan.status = 'completed';
        await this.updateStoredPlan(plan);
      }

      metrics.histogram('dev_pipeline.validate', Date.now() - startTime);
      metrics.increment('dev_pipeline.validation', {
        result: allPassed ? 'passed' : 'failed',
      });

      logger.info('[DevelopmentPipeline] Validation completed', {
        planId,
        passed: allPassed,
        checksRun: results.length,
      });

      return { passed: allPassed, results };
    } catch (error) {
      logger.error('[DevelopmentPipeline] Validation failed', {
        error: error instanceof Error ? error.message : String(error),
        planId,
      });
      throw error;
    }
  }

  /**
   * Release feature to module
   */
  async releaseFeature(planId: string): Promise<{
    success: boolean;
    releaseId?: string;
    error?: string;
  }> {
    try {
      const plan = await this.loadPlan(planId);
      if (!plan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      if (plan.status !== 'completed') {
        return {
          success: false,
          error: 'Plan must be completed before release',
        };
      }

      logger.info('[DevelopmentPipeline] Releasing feature', {
        planId,
        title: plan.title,
      });

      // Collect all artifacts
      const artifactIds = plan.tasks
        .flatMap(t => t.artifactIds || [])
        .filter(Boolean);

      // Emit flow completed event
      await valueStreamQueue.emitFlowCompleted(
        plan.organizationId,
        plan.planId,
        'development-pipeline',
        plan.tasks.map(t => t.taskId),
        {
          featureRequestId: plan.featureRequestId,
          artifactIds,
        }
      );

      const releaseId = `release-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Release agents
      for (const assignment of plan.assignedAgents) {
        for (const taskId of assignment.taskIds) {
          await arCoordinatorService.releaseAgent(
            plan.organizationId,
            assignment.agentId,
            taskId,
            true
          );
        }
        assignment.status = 'completed';
      }

      await this.updateStoredPlan(plan);

      metrics.increment('dev_pipeline.releases');

      logger.info('[DevelopmentPipeline] Feature released', {
        planId,
        releaseId,
        artifactsCount: artifactIds.length,
      });

      return { success: true, releaseId };
    } catch (error) {
      logger.error('[DevelopmentPipeline] Release failed', {
        error: error instanceof Error ? error.message : String(error),
        planId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute full auto-development pipeline
   */
  async autoDevelop(plan: DevelopmentPlan): Promise<DevelopmentResult> {
    const startTime = Date.now();
    const completedTasks: string[] = [];
    const failedTasks: { taskId: string; error: string }[] = [];
    const artifacts: string[] = [];

    try {
      logger.info('[DevelopmentPipeline] Starting auto-development', {
        planId: plan.planId,
      });

      // Phase 1: Assign agents
      plan = await this.assignToAgents(plan);

      // Phase 2: Execute tasks in order
      const executionOrder = this.getTaskExecutionOrder(plan.tasks);

      for (const taskId of executionOrder) {
        const result = await this.executeTask(plan, taskId);

        if (result.success) {
          completedTasks.push(taskId);
          if (result.artifactId) {
            artifacts.push(result.artifactId);
          }
        } else {
          failedTasks.push({ taskId, error: result.error || 'Unknown error' });

          // Decide whether to continue or stop
          const task = plan.tasks.find(t => t.taskId === taskId);
          if (task?.type === 'implementation') {
            // Stop if implementation fails
            break;
          }
        }
      }

      // Phase 3: Validate
      const validation = await this.validateImplementation(plan.planId);

      // Phase 4: Release if successful
      let releaseSuccess = false;
      if (validation.passed) {
        const releaseResult = await this.releaseFeature(plan.planId);
        releaseSuccess = releaseResult.success;
      }

      const duration = Date.now() - startTime;

      const result: DevelopmentResult = {
        planId: plan.planId,
        status: releaseSuccess ? 'success' :
                failedTasks.length === 0 ? 'partial' : 'failed',
        completedTasks,
        failedTasks,
        artifacts,
        duration,
        summary: this.generateResultSummary(
          completedTasks.length,
          failedTasks.length,
          plan.tasks.length,
          validation.passed
        ),
      };

      // Report metrics to AR
      await arCoordinatorService.reportToARAnalyst(plan.organizationId, [{
        moduleId: 'development-pipeline',
        period: 'daily',
        executions: 1,
        successRate: failedTasks.length === 0 ? 1 : completedTasks.length / plan.tasks.length,
        averageDuration: duration,
        costTotal: 0, // Would calculate from actual cost
        agentUtilization: plan.assignedAgents.length > 0 ? 0.8 : 0,
      }]);

      metrics.histogram('dev_pipeline.auto_develop', duration);

      return result;
    } catch (error) {
      logger.error('[DevelopmentPipeline] Auto-development failed', {
        error: error instanceof Error ? error.message : String(error),
        planId: plan.planId,
      });

      return {
        planId: plan.planId,
        status: 'failed',
        completedTasks,
        failedTasks,
        artifacts,
        duration: Date.now() - startTime,
        summary: `Auto-development failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Analyze complexity of feature request
   */
  private analyzeComplexity(
    featureRequest: { requirements?: string[]; description: string }
  ): 'simple' | 'medium' | 'complex' {
    const requirementsCount = featureRequest.requirements?.length || 0;
    const descriptionLength = featureRequest.description.length;

    if (requirementsCount > 5 || descriptionLength > 1000) {
      return 'complex';
    }
    if (requirementsCount > 2 || descriptionLength > 300) {
      return 'medium';
    }
    return 'simple';
  }

  /**
   * Generate tasks based on feature request
   */
  private async generateTasks(
    featureRequest: { id: string; title: string; description: string; requirements?: string[] },
    complexity: 'simple' | 'medium' | 'complex'
  ): Promise<DevelopmentTask[]> {
    const tasks: DevelopmentTask[] = [];
    let order = 0;

    // Design task (for medium and complex)
    if (complexity !== 'simple') {
      tasks.push({
        taskId: `task-${featureRequest.id}-design`,
        title: `Design: ${featureRequest.title}`,
        description: `Create design specification for ${featureRequest.description}`,
        type: 'design',
        status: 'pending',
        dependencies: [],
        estimatedHours: complexity === 'complex' ? 8 : 4,
        order: order++,
      });
    }

    // Implementation tasks
    const implTaskCount = complexity === 'complex' ? 3 : complexity === 'medium' ? 2 : 1;
    const designTaskId = tasks.length > 0 ? tasks[0].taskId : undefined;

    for (let i = 0; i < implTaskCount; i++) {
      tasks.push({
        taskId: `task-${featureRequest.id}-impl-${i}`,
        title: `Implement: ${featureRequest.title} (Part ${i + 1})`,
        description: `Implementation work for ${featureRequest.description}`,
        type: 'implementation',
        status: 'pending',
        dependencies: designTaskId ? [designTaskId] : [],
        estimatedHours: complexity === 'complex' ? 16 : complexity === 'medium' ? 8 : 4,
        order: order++,
      });
    }

    // Testing task
    const implTaskIds = tasks
      .filter(t => t.type === 'implementation')
      .map(t => t.taskId);

    tasks.push({
      taskId: `task-${featureRequest.id}-test`,
      title: `Test: ${featureRequest.title}`,
      description: `Testing and validation for ${featureRequest.description}`,
      type: 'testing',
      status: 'pending',
      dependencies: implTaskIds,
      estimatedHours: complexity === 'complex' ? 8 : 4,
      order: order++,
    });

    // Documentation task
    tasks.push({
      taskId: `task-${featureRequest.id}-docs`,
      title: `Document: ${featureRequest.title}`,
      description: `Documentation for ${featureRequest.description}`,
      type: 'documentation',
      status: 'pending',
      dependencies: implTaskIds,
      estimatedHours: complexity === 'complex' ? 4 : 2,
      order: order++,
    });

    // Review task (for complex)
    if (complexity === 'complex') {
      const testTaskId = tasks.find(t => t.type === 'testing')!.taskId;
      tasks.push({
        taskId: `task-${featureRequest.id}-review`,
        title: `Review: ${featureRequest.title}`,
        description: `Code review for ${featureRequest.description}`,
        type: 'review',
        status: 'pending',
        dependencies: [testTaskId],
        estimatedHours: 4,
        order: order++,
      });
    }

    return tasks;
  }

  /**
   * Calculate target completion date
   */
  private calculateTargetDate(estimatedHours: number): Date {
    // Assume 6 productive hours per day
    const days = Math.ceil(estimatedHours / 6);
    const target = new Date();
    target.setDate(target.getDate() + days);
    return target;
  }

  /**
   * Group tasks by type
   */
  private groupTasksByType(
    tasks: DevelopmentTask[]
  ): Record<string, DevelopmentTask[]> {
    return tasks.reduce((groups, task) => {
      if (!groups[task.type]) {
        groups[task.type] = [];
      }
      groups[task.type].push(task);
      return groups;
    }, {} as Record<string, DevelopmentTask[]>);
  }

  /**
   * Get preferred tier for complexity
   */
  private getTierForComplexity(
    complexity: 'simple' | 'medium' | 'complex'
  ): 'haiku' | 'sonnet' | 'opus' {
    switch (complexity) {
      case 'complex': return 'opus';
      case 'medium': return 'sonnet';
      default: return 'haiku';
    }
  }

  /**
   * Get task execution order respecting dependencies
   */
  private getTaskExecutionOrder(tasks: DevelopmentTask[]): string[] {
    // Topological sort
    const result: string[] = [];
    const visited = new Set<string>();
    const taskMap = new Map(tasks.map(t => [t.taskId, t]));

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;

      const task = taskMap.get(taskId);
      if (!task) return;

      for (const depId of task.dependencies) {
        visit(depId);
      }

      visited.add(taskId);
      result.push(taskId);
    };

    // Sort by order first
    const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

    for (const task of sortedTasks) {
      visit(task.taskId);
    }

    return result;
  }

  /**
   * Build execution prompt for a task
   */
  private buildTaskPrompt(plan: DevelopmentPlan, task: DevelopmentTask): string {
    return `
Development Task: ${task.title}

Feature: ${plan.title}
Description: ${plan.description}

Task Details:
- Type: ${task.type}
- Description: ${task.description}
- Estimated Hours: ${task.estimatedHours}

Please complete this ${task.type} task for the feature. Provide comprehensive output.
    `.trim();
  }

  /**
   * Get orchestrator category for task type
   */
  private getCategoryForTaskType(type: string): string {
    const categoryMap: Record<string, string> = {
      design: 'ultrabrain-high',
      implementation: 'unspecified-high',
      testing: 'qa-testing',
      documentation: 'writing-medium',
      review: 'code-review',
    };
    return categoryMap[type] || 'unspecified-medium';
  }

  /**
   * Get skills for task type
   */
  private getSkillsForTaskType(type: string): string[] {
    const skillsMap: Record<string, string[]> = {
      design: ['architecture', 'planning'],
      implementation: ['coding', 'debugging'],
      testing: ['testing', 'qa'],
      documentation: ['writing', 'markdown'],
      review: ['code-review', 'best-practices'],
    };
    return skillsMap[type] || [];
  }

  /**
   * Create artifact for task output
   */
  private async createTaskArtifact(
    plan: DevelopmentPlan,
    task: DevelopmentTask,
    output: string
  ): Promise<string> {
    const artifact = await prisma.valueStreamArtifact.create({
      data: {
        organizationId: plan.organizationId,
        moduleId: 'development-pipeline',
        data: {
          planId: plan.planId,
          taskId: task.taskId,
          taskType: task.type,
          output,
        },
        tags: [plan.planId, task.type],
        status: 'draft',
        version: 1,
      },
    });

    return artifact.id;
  }

  /**
   * Generate result summary
   */
  private generateResultSummary(
    completed: number,
    failed: number,
    total: number,
    validated: boolean
  ): string {
    if (failed === 0 && validated) {
      return `Successfully completed all ${total} tasks with validation passed`;
    }
    if (failed === 0) {
      return `Completed all ${total} tasks but validation pending`;
    }
    return `Completed ${completed}/${total} tasks with ${failed} failures`;
  }

  /**
   * Store plan in database
   */
  private async storePlan(plan: DevelopmentPlan): Promise<void> {
    await prisma.aRDepartmentLog.create({
      data: {
        organizationId: plan.organizationId,
        action: 'development_plan_created',
        category: 'development',
        details: {
          planId: plan.planId,
          featureRequestId: plan.featureRequestId,
          title: plan.title,
          complexity: plan.complexity,
          estimatedHours: plan.estimatedHours,
          tasksCount: plan.tasks.length,
        },
        impact: plan.complexity === 'complex' ? 'high' : 'medium',
      },
    });
  }

  /**
   * Update stored plan
   */
  private async updateStoredPlan(plan: DevelopmentPlan): Promise<void> {
    await prisma.aRDepartmentLog.create({
      data: {
        organizationId: plan.organizationId,
        action: 'development_plan_updated',
        category: 'development',
        details: {
          planId: plan.planId,
          status: plan.status,
          progress: (plan.tasks.filter(t => t.status === 'completed').length / plan.tasks.length) * 100,
          assignedAgents: plan.assignedAgents.length,
        },
        impact: 'low',
      },
    });
  }

  /**
   * Load plan from database
   */
  private async loadPlan(planId: string): Promise<DevelopmentPlan | null> {
    // In a real implementation, this would load from a dedicated plans table
    // For now, we reconstruct from logs
    const logs = await prisma.aRDepartmentLog.findMany({
      where: {
        action: { in: ['development_plan_created', 'development_plan_updated'] },
        details: {
          path: ['planId'],
          equals: planId,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (logs.length === 0) {
      return null;
    }

    // This is a simplified version - in production, use a dedicated table
    const details = logs[0].details as Record<string, unknown>;
    return {
      planId: details.planId as string,
      featureRequestId: details.featureRequestId as string,
      organizationId: logs[0].organizationId,
      title: details.title as string,
      description: '',
      status: (details.status as DevelopmentPlanStatus) || 'draft',
      priority: 'medium',
      complexity: details.complexity as 'simple' | 'medium' | 'complex',
      estimatedHours: details.estimatedHours as number,
      tasks: [],
      dependencies: [],
      assignedAgents: [],
      approvalRequired: false,
      createdAt: logs[0].createdAt,
      updatedAt: logs[0].createdAt,
    };
  }
}

// Export singleton instance
export const developmentPipelineService = new DevelopmentPipelineService();
