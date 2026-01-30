/**
 * Auto-Developer Service
 *
 * Automatically develops features from approved requests:
 * 1. Generate development plan from feature analysis
 * 2. Assign tasks to appropriate agents via AR
 * 3. Execute implementation with orchestrator
 * 4. Run QA validation
 * 5. Request AR approval for release
 */

import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import { delegateTask } from "../../../orchestrator/delegate-task";
import { arApprovalService } from "../../../ar/approval/ar-approval.service";
import { TaskGeneratorService } from "./task-generator.service";
import {
  DevelopmentPlan,
  DevelopmentTask,
  DevelopmentResult,
  QAResult,
  DevelopmentArtifacts,
  TaskGenerationContext,
  ReleaseResult,
  QAError,
  BreakingChange,
  CriteriaValidation,
} from "./types";
import { v4 as uuidv4 } from "uuid";
import { FeatureAnalysis } from "../feature-request-pipeline/types";

export class AutoDeveloperService {
  private taskGenerator: TaskGeneratorService;

  constructor(private organizationId: string) {
    this.taskGenerator = new TaskGeneratorService();
  }

  /**
   * Generate development plan from feature request
   */
  async createPlan(featureRequestId: string): Promise<DevelopmentPlan> {
    const startTime = Date.now();

    try {
      logger.info("Creating development plan", {
        featureRequestId,
        organizationId: this.organizationId,
      });

      // 1. Get feature request with analysis
      const featureRequest = await db.featureRequest.findUnique({
        where: { id: featureRequestId },
      });

      if (!featureRequest) {
        throw new Error(`Feature request ${featureRequestId} not found`);
      }

      if (featureRequest.status !== "planning" && featureRequest.status !== "backlog") {
        throw new Error(
          `Feature request must be in planning or backlog status (current: ${featureRequest.status})`
        );
      }

      // 2. Extract analysis data from analyzedIntent
      if (!featureRequest.analyzedIntent) {
        throw new Error("Feature request has not been analyzed yet");
      }

      // Parse analyzed intent (stored as JSON string)
      const analysis: FeatureAnalysis = JSON.parse(featureRequest.analyzedIntent);

      // 3. Determine target module(s)
      const targetModuleId = await this.determineTargetModule(
        analysis.relatedModules,
        analysis.coreIntent
      );

      const moduleInfo = await this.getModuleInfo(targetModuleId);

      // 4. Build task generation context
      const context: TaskGenerationContext = {
        featureAnalysis: {
          coreIntent: analysis.coreIntent,
          specificFeature: analysis.specificFeature,
          problemStatement: analysis.problemStatement,
          successCriteria: analysis.successCriteria,
          affectedWorkflows: analysis.affectedWorkflows,
          relatedModules: analysis.relatedModules,
        },
        moduleInfo: {
          id: moduleInfo.id,
          name: moduleInfo.name,
          type: moduleInfo.type,
          currentVersion: moduleInfo.version || "0.0.0",
          existingFiles: moduleInfo.files || [],
          dependencies: moduleInfo.dependencies || [],
        },
        organizationContext: {
          organizationId: this.organizationId,
          codingStandards: [],
          testingRequirements: [],
        },
      };

      // 5. Generate tasks
      const tasks = await this.taskGenerator.generateTasks(context);

      // 6. Calculate estimates and risks
      const estimatedEffort = this.calculateEffort(tasks);
      const dependencies = this.identifyDependencies(tasks, moduleInfo);
      const riskAssessment = await this.assessRisks(context, tasks);

      // 7. Create plan record
      const planId = uuidv4();
      const plan: DevelopmentPlan = {
        id: planId,
        featureRequestId,
        moduleId: targetModuleId,
        tasks,
        estimatedEffort,
        dependencies,
        riskAssessment,
        status: "draft",
        createdAt: new Date(),
      };

      // Store plan in database (we'll store planId in analyzedIntent for now)
      // In production, you'd want a separate DevelopmentPlan table
      const updatedAnalysis = {
        ...analysis,
        developmentPlanId: planId,
      };

      await db.featureRequest.update({
        where: { id: featureRequestId },
        data: {
          status: "planning",
          analyzedIntent: JSON.stringify(updatedAnalysis),
        },
      });

      metrics.histogram("development.plan_creation_duration", Date.now() - startTime);
      metrics.increment("development.plans_created");

      logger.info("Development plan created", {
        planId,
        taskCount: tasks.length,
        estimatedEffort,
      });

      return plan;
    } catch (error) {
      logger.error(
        "Failed to create development plan",
        { featureRequestId },
        error instanceof Error ? error : new Error(String(error))
      );
      metrics.increment("development.plan_creation_errors");
      throw error;
    }
  }

  /**
   * Execute development plan
   */
  async execute(plan: DevelopmentPlan): Promise<DevelopmentResult> {
    const startTime = Date.now();

    try {
      logger.info("Executing development plan", {
        planId: plan.id,
        taskCount: plan.tasks.length,
      });

      // Update plan status
      await this.updatePlanStatus(plan.id, "in_progress");

      const artifacts: DevelopmentArtifacts = {
        filesCreated: [],
        filesModified: [],
        testsAdded: [],
        skillsCreated: [],
        agentsConfigured: [],
      };

      const errors: string[] = [];
      const sessionId = `dev-${plan.id}`;

      // Execute tasks in dependency order
      const taskExecutionOrder = this.sortTasksByDependencies(plan.tasks);

      for (const task of taskExecutionOrder) {
        try {
          logger.info("Executing task", {
            taskId: task.id,
            type: task.type,
            description: task.description,
          });

          // Update task status
          task.status = "in_progress";
          await this.updateProgress(plan.id, task);

          // Request agent assignment from AR if needed
          const agentId = await this.requestAgentAssignment(task);

          // Execute task via orchestrator
          const result = await delegateTask({
            category: task.category,
            load_skills: this.determineSkillsForTask(task),
            prompt: this.buildTaskPrompt(task, plan),
            session_id: sessionId,
            organizationId: this.organizationId,
            context: {
              taskId: task.id,
              planId: plan.id,
              agentId,
              targetFiles: task.targetFiles,
              metadata: task.metadata,
            },
          });

          if (result.status === "failed") {
            throw new Error(result.metadata.error || "Task execution failed");
          }

          // Update task status and collect artifacts
          task.status = "done";
          this.collectArtifacts(task, artifacts);

          logger.info("Task completed", {
            taskId: task.id,
            duration: result.metadata.duration,
          });
        } catch (error) {
          task.status = "failed";
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Task ${task.id} failed: ${errorMsg}`);

          logger.error(
            "Task execution failed",
            { taskId: task.id },
            error instanceof Error ? error : new Error(String(error))
          );

          // Continue with other tasks unless critical
          if (task.type === "code" && task.dependencies.length === 0) {
            // Critical base task failed
            break;
          }
        }
      }

      // Run QA validation
      const qaResult = await this.runQA(plan.id, artifacts);

      // Determine overall success
      const success = errors.length === 0 && qaResult.success;

      // Update plan status
      await this.updatePlanStatus(plan.id, success ? "completed" : "failed");

      // Request release approval if successful
      let approvalStatus: "pending" | "approved" | "rejected" = "pending";
      if (success) {
        approvalStatus = await this.requestRelease(plan.id, artifacts, qaResult);
      }

      const result: DevelopmentResult = {
        planId: plan.id,
        success,
        artifacts,
        qaResult,
        approvalStatus,
        createdAt: plan.createdAt,
        completedAt: new Date(),
        errors: errors.length > 0 ? errors : undefined,
      };

      metrics.histogram("development.execution_duration", Date.now() - startTime);
      metrics.increment("development.executions_completed", {
        success: success ? "true" : "false",
      });

      logger.info("Development plan execution completed", {
        planId: plan.id,
        success,
        tasksCompleted: plan.tasks.filter(t => t.status === "done").length,
        tasksFailed: plan.tasks.filter(t => t.status === "failed").length,
      });

      return result;
    } catch (error) {
      await this.updatePlanStatus(plan.id, "failed");

      logger.error(
        "Development plan execution failed",
        { planId: plan.id },
        error instanceof Error ? error : new Error(String(error))
      );
      metrics.increment("development.execution_errors");
      throw error;
    }
  }

  /**
   * Run QA validation on implementation
   */
  async runQA(planId: string, artifacts: DevelopmentArtifacts): Promise<QAResult> {
    logger.info("Running QA validation", { planId });

    const errors: QAError[] = [];
    const breakingChanges: BreakingChange[] = [];

    // 1. Type check
    let typeCheckPassed = true;
    try {
      const typeCheckResult = await delegateTask({
        category: "quick",
        load_skills: [],
        prompt: "Run TypeScript type check: npm run typecheck",
        session_id: `qa-${planId}-typecheck`,
        organizationId: this.organizationId,
      });

      if (typeCheckResult.status === "failed") {
        typeCheckPassed = false;
        errors.push({
          type: "type",
          message: "Type check failed",
          severity: "error",
        });
      }
    } catch (error) {
      typeCheckPassed = false;
      errors.push({
        type: "type",
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }

    // 2. Run tests
    let testsPassed = true;
    try {
      const testResult = await delegateTask({
        category: "quick",
        load_skills: [],
        prompt: `Run tests for modified files: ${artifacts.testsAdded.join(", ")}`,
        session_id: `qa-${planId}-tests`,
        organizationId: this.organizationId,
      });

      if (testResult.status === "failed") {
        testsPassed = false;
        errors.push({
          type: "test",
          message: "Test suite failed",
          severity: "error",
        });
      }
    } catch (error) {
      testsPassed = false;
      errors.push({
        type: "test",
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }

    // 3. Check for breaking changes
    breakingChanges.push(...(await this.detectBreakingChanges(artifacts)));

    // 4. Validate success criteria
    const criteriaValidation: CriteriaValidation[] = [];
    // TODO: Implement success criteria validation

    const qaResult: QAResult = {
      planId,
      success: typeCheckPassed && testsPassed && breakingChanges.length === 0,
      typeCheckPassed,
      testsPassed,
      breakingChanges,
      successCriteriaValidation: criteriaValidation,
      timestamp: new Date(),
      errors: errors.length > 0 ? errors : undefined,
    };

    metrics.increment("development.qa_completed", {
      passed: qaResult.success ? "true" : "false",
    });

    logger.info("QA validation completed", {
      planId,
      success: qaResult.success,
      typeCheckPassed,
      testsPassed,
      breakingChangesCount: breakingChanges.length,
    });

    return qaResult;
  }

  /**
   * Request release approval from AR
   */
  async requestRelease(
    planId: string,
    artifacts: DevelopmentArtifacts,
    qaResult: QAResult
  ): Promise<"pending" | "approved" | "rejected"> {
    try {
      logger.info("Requesting release approval", { planId });

      // Get plan and feature request by searching analyzedIntent
      const allRequests = await db.featureRequest.findMany({
        where: {
          organizationId: this.organizationId,
          status: "planning",
        },
      });

      const featureRequest = allRequests.find(req => {
        if (!req.analyzedIntent) return false;
        try {
          const analysis = JSON.parse(req.analyzedIntent);
          return analysis.developmentPlanId === planId;
        } catch {
          return false;
        }
      });

      if (!featureRequest) {
        throw new Error(`Feature request for plan ${planId} not found`);
      }

      // Create approval request
      const approvalRequest = await arApprovalService.createRequest({
        organizationId: this.organizationId,
        requestType: "task",
        level: 2, // PROCESS level for code releases
        title: `Release: Feature Request ${featureRequest.id.slice(0, 8)}`,
        description: this.buildReleaseDescription(artifacts, qaResult),
        context: {
          planId,
          featureRequestId: featureRequest.id,
          artifacts,
          qaResult,
        },
        impactScope: "team",
        requesterType: "agent",
        requesterId: "auto-developer",
      });

      logger.info("Release approval requested", {
        planId,
        approvalRequestId: approvalRequest.id,
      });

      // Check if auto-approved
      return approvalRequest.status === "approved" ? "approved" : "pending";
    } catch (error) {
      logger.error(
        "Failed to request release approval",
        { planId },
        error instanceof Error ? error : new Error(String(error))
      );
      return "pending";
    }
  }

  /**
   * Complete release after approval
   */
  async release(planId: string): Promise<ReleaseResult> {
    try {
      logger.info("Completing release", { planId });

      // Get plan - search through analyzedIntent
      const allRequests = await db.featureRequest.findMany({
        where: {
          organizationId: this.organizationId,
        },
      });

      const featureRequest = allRequests.find(req => {
        if (!req.analyzedIntent) return false;
        try {
          const analysis = JSON.parse(req.analyzedIntent);
          return analysis.developmentPlanId === planId;
        } catch {
          return false;
        }
      });

      if (!featureRequest) {
        throw new Error(`Feature request for plan ${planId} not found`);
      }

      const analysis = JSON.parse(featureRequest.analyzedIntent!);
      const plan: DevelopmentPlan = analysis.developmentPlan || { moduleId: "" };

      // Update module version
      await db.megaAppModule.update({
        where: { id: plan.moduleId },
        data: {
          version: this.incrementVersion((await db.megaAppModule.findUnique({
            where: { id: plan.moduleId },
          }))?.version || "0.0.0"),
        },
      });

      // Update feature request status
      await db.featureRequest.update({
        where: { id: featureRequest.id },
        data: {
          status: "released",
        },
      });

      const result: ReleaseResult = {
        success: true,
        releaseId: `release-${Date.now()}`,
        moduleVersion: "updated",
        deployedAt: new Date(),
      };

      metrics.increment("development.releases_completed");

      logger.info("Release completed", {
        planId,
        featureRequestId: featureRequest.id,
      });

      return result;
    } catch (error) {
      logger.error(
        "Failed to complete release",
        { planId },
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        success: false,
        moduleVersion: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private async determineTargetModule(
    relatedModules: string[],
    _coreIntent: string
  ): Promise<string> {
    if (relatedModules.length === 1) {
      return relatedModules[0];
    }

    // Find best matching module
    const modules = await db.megaAppModule.findMany({
      where: {
        organizationId: this.organizationId,
        OR: relatedModules.map(name => ({ name })),
      },
    });

    if (modules.length === 0) {
      throw new Error("No matching module found");
    }

    // TODO: Implement smart module selection based on intent
    return modules[0].id;
  }

  private async getModuleInfo(moduleId: string) {
    const module = await db.megaAppModule.findUnique({
      where: { id: moduleId },
    });

    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    return {
      id: module.id,
      name: module.name,
      type: module.executorType, // Use executorType as type
      version: module.version,
      files: [], // Would need to be tracked separately
      dependencies: [], // Would need to be tracked separately
    };
  }

  private calculateEffort(tasks: DevelopmentTask[]): string {
    const totalTokens = tasks.reduce((sum, t) => sum + (t.estimatedTokens || 0), 0);
    const hours = Math.ceil(totalTokens / 10000); // Rough estimate: 10k tokens = 1 hour

    if (hours < 4) return "Small (< 4 hours)";
    if (hours < 16) return "Medium (4-16 hours)";
    if (hours < 40) return "Large (16-40 hours)";
    return "X-Large (> 40 hours)";
  }

  private identifyDependencies(tasks: DevelopmentTask[], moduleInfo: any): string[] {
    const deps = new Set<string>(moduleInfo.dependencies);

    for (const task of tasks) {
      if (task.type === "code" && task.metadata?.requiresDatabase) {
        deps.add("@prisma/client");
      }
    }

    return Array.from(deps);
  }

  private async assessRisks(
    context: TaskGenerationContext,
    tasks: DevelopmentTask[]
  ): Promise<string> {
    const risks: string[] = [];

    if (tasks.some(t => t.metadata?.requiresMigration)) {
      risks.push("Database migration required");
    }

    if (context.featureAnalysis.relatedModules.length > 2) {
      risks.push("Affects multiple modules");
    }

    if (tasks.filter(t => t.type === "code").length > 5) {
      risks.push("Large code change");
    }

    return risks.length > 0 ? risks.join("; ") : "Low risk";
  }

  private sortTasksByDependencies(tasks: DevelopmentTask[]): DevelopmentTask[] {
    const sorted: DevelopmentTask[] = [];
    const remaining = [...tasks];
    const completed = new Set<string>();

    while (remaining.length > 0) {
      const ready = remaining.filter(t =>
        t.dependencies.every(dep => completed.has(dep))
      );

      if (ready.length === 0) {
        // Circular dependency or missing dependency
        sorted.push(...remaining);
        break;
      }

      sorted.push(...ready);
      ready.forEach(t => {
        completed.add(t.id);
        const idx = remaining.indexOf(t);
        remaining.splice(idx, 1);
      });
    }

    return sorted;
  }

  private async requestAgentAssignment(_task: DevelopmentTask): Promise<string | undefined> {
    // For now, return undefined - AR assignment is optional
    // TODO: Implement actual AR agent request when agents are available
    return undefined;
  }

  private determineSkillsForTask(task: DevelopmentTask): string[] {
    const skills: string[] = [];

    switch (task.type) {
      case "code":
        skills.push("code-generation");
        break;
      case "test":
        skills.push("test-generation");
        break;
      case "skill":
        skills.push("skill-creation");
        break;
      case "agent":
        skills.push("agent-configuration");
        break;
    }

    return skills;
  }

  private buildTaskPrompt(task: DevelopmentTask, plan: DevelopmentPlan): string {
    return `
Execute development task:

Task ID: ${task.id}
Type: ${task.type}
Description: ${task.description}

Target Files:
${task.targetFiles.map(f => `- ${f}`).join("\n")}

${task.metadata ? `Metadata:\n${JSON.stringify(task.metadata, null, 2)}\n` : ""}

Requirements:
1. Implement according to the description
2. Follow coding standards
3. Add appropriate error handling
4. Include JSDoc comments
5. Ensure type safety

Plan Context:
- Module ID: ${plan.moduleId}
- Feature Request ID: ${plan.featureRequestId}
`.trim();
  }

  private collectArtifacts(task: DevelopmentTask, artifacts: DevelopmentArtifacts): void {
    for (const file of task.targetFiles) {
      if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) {
        artifacts.testsAdded.push(file);
      } else if (task.type === "skill") {
        artifacts.skillsCreated?.push(file);
      } else if (task.type === "agent") {
        artifacts.agentsConfigured?.push(file);
      } else if (file.includes("TBD")) {
        // Skip placeholder files
      } else {
        // Assume modification for existing, creation for new
        artifacts.filesModified.push(file);
      }
    }
  }

  private async detectBreakingChanges(artifacts: DevelopmentArtifacts): Promise<BreakingChange[]> {
    const changes: BreakingChange[] = [];

    // Check if API files were modified
    const apiFiles = artifacts.filesModified.filter(f => f.includes("src/api/"));
    if (apiFiles.length > 0) {
      changes.push({
        type: "api",
        description: "API endpoints modified",
        affectedModules: apiFiles,
        severity: "medium",
      });
    }

    // Check if schema was modified
    if (artifacts.filesModified.some(f => f.includes("schema.prisma"))) {
      changes.push({
        type: "schema",
        description: "Database schema modified",
        affectedModules: ["database"],
        severity: "high",
      });
    }

    return changes;
  }

  private buildReleaseDescription(artifacts: DevelopmentArtifacts, qaResult: QAResult): string {
    return `
## Development Summary

### Files Changed
- Created: ${artifacts.filesCreated.length}
- Modified: ${artifacts.filesModified.length}
- Tests Added: ${artifacts.testsAdded.length}

### QA Results
- Type Check: ${qaResult.typeCheckPassed ? "✓ Passed" : "✗ Failed"}
- Tests: ${qaResult.testsPassed ? "✓ Passed" : "✗ Failed"}
- Breaking Changes: ${qaResult.breakingChanges.length}

### Details
${artifacts.filesModified.slice(0, 10).map(f => `- ${f}`).join("\n")}
${artifacts.filesModified.length > 10 ? `... and ${artifacts.filesModified.length - 10} more` : ""}
`.trim();
  }

  private incrementVersion(version: string): string {
    const parts = version.split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1; // Increment patch version
    return parts.join(".");
  }

  private async updatePlanStatus(planId: string, status: DevelopmentPlan["status"]): Promise<void> {
    // Find feature request with this plan ID
    const allRequests = await db.featureRequest.findMany({
      where: {
        organizationId: this.organizationId,
      },
    });

    const featureRequest = allRequests.find(req => {
      if (!req.analyzedIntent) return false;
      try {
        const analysis = JSON.parse(req.analyzedIntent);
        return analysis.developmentPlanId === planId;
      } catch {
        return false;
      }
    });

    if (featureRequest) {
      // Update status in feature request
      await db.featureRequest.update({
        where: { id: featureRequest.id },
        data: {
          status: status === "completed" ? "released" : status === "in_progress" ? "developing" : "planning",
        },
      });
    }
  }

  private async updateProgress(planId: string, currentTask: DevelopmentTask): Promise<void> {
    // Emit progress event (could be sent to queue for real-time updates)
    logger.debug("Development progress", {
      planId,
      taskId: currentTask.id,
      status: currentTask.status,
    });
  }
}
