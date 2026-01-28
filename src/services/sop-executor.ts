/**
 * SOP Executor Service - US-006
 *
 * Handles step-by-step SOP (Standard Operating Procedure) execution
 * Each step can be approved, modified, or skipped with full audit trail
 */

import { db as prisma } from "../db/client";
import { auditLogger } from "./audit-logger";
import { logger } from "../utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface SopStep {
  id: string;
  name: string;
  description?: string;
  type: "manual" | "automated" | "approval" | "mcp_call";
  config?: Record<string, unknown>;
  requiredApprovers?: string[];
  timeoutMinutes?: number;
  skippable?: boolean;
}

export interface StepResult {
  stepIndex: number;
  stepId: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  result?: Record<string, unknown>;
  error?: string;
  skippedReason?: string;
  modifiedBy?: string;
  modifications?: Record<string, unknown>;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface ExecutionProgress {
  executionId: string;
  workflowId?: string;
  workflowName?: string;
  totalSteps: number;
  currentStep: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "paused";
  steps: Array<SopStep & { result?: StepResult }>;
  startedAt?: Date;
  estimatedCompletion?: Date;
}

export interface SopConfig {
  steps: SopStep[];
  allowSkip?: boolean;
  allowModify?: boolean;
  requireApprovalForAll?: boolean;
  timeoutMinutes?: number;
}

// ============================================================================
// SOP Executor Class
// ============================================================================

class SopExecutor {
  /**
   * Execute a specific SOP step
   */
  async executeSopStep(
    executionId: string,
    stepIndex: number,
    userId?: string,
  ): Promise<StepResult> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}. Valid range: 0-${sopSteps.length - 1}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex);

    // Check if step already completed
    if (existingResult?.status === "completed") {
      throw new Error(`Step ${stepIndex} (${step.name}) already completed`);
    }

    // Create/update step result
    const stepResult: StepResult = {
      stepIndex,
      stepId: step.id,
      status: "running",
      startedAt: new Date(),
    };

    // Update execution with running status
    await this.updateStepResult(executionId, stepIndex, stepResult);

    try {
      // Execute based on step type
      let result: Record<string, unknown> = {};

      switch (step.type) {
        case "manual":
          // Manual steps just need approval to proceed
          result = { message: "Manual step requires approval to complete" };
          stepResult.status = "pending";
          break;

        case "approval":
          // Approval steps wait for explicit approval
          result = { message: "Awaiting approval", requiredApprovers: step.requiredApprovers };
          stepResult.status = "pending";
          break;

        case "automated":
          // Automated steps execute immediately
          result = await this.executeAutomatedStep(step, execution);
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
          break;

        case "mcp_call":
          // MCP call steps execute tool calls
          result = { message: "MCP call step - delegated to workflow engine" };
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
          break;

        default:
          result = { message: `Unknown step type: ${step.type}` };
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
      }

      stepResult.result = result;

      // Update execution
      await this.updateStepResult(executionId, stepIndex, stepResult);

      // Audit log
      await auditLogger.log({
        action: "workflow.execute",
        organizationId: execution.organizationId,
        userId: userId || execution.userId,
        resourceType: "sop_step",
        resourceId: `${executionId}:${stepIndex}`,
        details: {
          stepName: step.name,
          stepType: step.type,
          status: stepResult.status,
        },
        success: true,
      });

      // Auto-advance to next step if completed and not last
      if (stepResult.status === "completed" && stepIndex < sopSteps.length - 1) {
        await this.updateCurrentStep(executionId, stepIndex + 1);
      } else if (stepResult.status === "completed" && stepIndex === sopSteps.length - 1) {
        // Mark execution as completed
        await this.completeExecution(executionId);
      }

      return stepResult;
    } catch (error: any) {
      stepResult.status = "failed";
      stepResult.error = error.message;
      stepResult.completedAt = new Date();

      await this.updateStepResult(executionId, stepIndex, stepResult);

      // Audit log failure
      await auditLogger.log({
        action: "workflow.execute",
        organizationId: execution.organizationId,
        userId: userId || execution.userId,
        resourceType: "sop_step",
        resourceId: `${executionId}:${stepIndex}`,
        details: {
          stepName: step.name,
          stepType: step.type,
          error: error.message,
        },
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * Skip a step with reason
   */
  async skipStep(
    executionId: string,
    stepIndex: number,
    reason: string,
    userId?: string,
  ): Promise<StepResult> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];

    // Check if step is skippable
    if (step.skippable === false) {
      throw new Error(`Step ${stepIndex} (${step.name}) cannot be skipped`);
    }

    const stepResult: StepResult = {
      stepIndex,
      stepId: step.id,
      status: "skipped",
      skippedReason: reason,
      modifiedBy: userId,
      completedAt: new Date(),
    };

    await this.updateStepResult(executionId, stepIndex, stepResult);

    // Audit log
    await auditLogger.log({
      action: "workflow.execute",
      organizationId: execution.organizationId,
      userId: userId || execution.userId,
      resourceType: "sop_step",
      resourceId: `${executionId}:${stepIndex}`,
      details: {
        stepName: step.name,
        action: "skipped",
        reason,
      },
      success: true,
    });

    // Advance to next step
    if (stepIndex < sopSteps.length - 1) {
      await this.updateCurrentStep(executionId, stepIndex + 1);
    } else {
      await this.completeExecution(executionId);
    }

    return stepResult;
  }

  /**
   * Modify a step before execution
   */
  async modifyStep(
    executionId: string,
    stepIndex: number,
    modifications: Record<string, unknown>,
    userId?: string,
  ): Promise<StepResult> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex);

    // Can only modify pending or not-yet-started steps
    if (existingResult?.status === "completed") {
      throw new Error(`Cannot modify completed step ${stepIndex}`);
    }

    const stepResult: StepResult = {
      ...(existingResult || {
        stepIndex,
        stepId: step.id,
        status: "pending",
      }),
      modifications,
      modifiedBy: userId,
    };

    await this.updateStepResult(executionId, stepIndex, stepResult);

    // Audit log
    await auditLogger.log({
      action: "workflow.execute",
      organizationId: execution.organizationId,
      userId: userId || execution.userId,
      resourceType: "sop_step",
      resourceId: `${executionId}:${stepIndex}`,
      details: {
        stepName: step.name,
        action: "modified",
        modifications,
      },
      success: true,
    });

    return stepResult;
  }

  /**
   * Approve current step and advance
   */
  async approveStep(
    executionId: string,
    stepIndex: number,
    userId: string,
    note?: string,
  ): Promise<StepResult> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex) || {
      stepIndex,
      stepId: step.id,
      status: "pending" as const,
    };

    // Update with approval
    const stepResult: StepResult = {
      ...existingResult,
      status: "completed",
      completedAt: new Date(),
      approvedBy: userId,
      approvedAt: new Date(),
      result: {
        ...(existingResult.result || {}),
        approvalNote: note,
        approved: true,
      },
    };

    await this.updateStepResult(executionId, stepIndex, stepResult);

    // Audit log
    await auditLogger.log({
      action: "workflow.execute",
      organizationId: execution.organizationId,
      userId,
      resourceType: "sop_step",
      resourceId: `${executionId}:${stepIndex}`,
      details: {
        stepName: step.name,
        action: "approved",
        note,
      },
      success: true,
    });

    // Advance to next step
    if (stepIndex < sopSteps.length - 1) {
      await this.updateCurrentStep(executionId, stepIndex + 1);
    } else {
      await this.completeExecution(executionId);
    }

    return stepResult;
  }

  /**
   * Get execution progress
   */
  async getExecutionProgress(executionId: string): Promise<ExecutionProgress> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    // Map steps with results
    const stepsWithResults = sopSteps.map((step, index) => ({
      ...step,
      result: stepResults.find((r) => r.stepIndex === index),
    }));

    // Calculate stats
    const completedSteps = stepResults.filter((r) => r.status === "completed").length;
    const skippedSteps = stepResults.filter((r) => r.status === "skipped").length;
    const failedSteps = stepResults.filter((r) => r.status === "failed").length;
    const currentStep = execution.currentStep ?? 0;

    // Determine overall status
    let status: ExecutionProgress["status"] = "pending";
    if (failedSteps > 0) {
      status = "failed";
    } else if (completedSteps + skippedSteps === sopSteps.length) {
      status = "completed";
    } else if (completedSteps > 0 || currentStep > 0) {
      status = "in_progress";
    } else if (stepResults.some((r) => r.status === "pending")) {
      status = "paused";
    }

    return {
      executionId,
      workflowId: workflow?.id,
      workflowName: workflow?.name,
      totalSteps: sopSteps.length,
      currentStep,
      completedSteps,
      skippedSteps,
      failedSteps,
      status,
      steps: stepsWithResults,
      startedAt: stepResults.find((r) => r.startedAt)?.startedAt,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async getExecution(executionId: string) {
    return prisma.orchestratorExecution.findUnique({
      where: { id: executionId },
    });
  }

  private async getWorkflowForExecution(execution: any) {
    // Get workflow from metadata if available
    const workflowId = execution.metadata?.workflowId;
    if (workflowId) {
      return prisma.workflow.findUnique({
        where: { id: workflowId },
      });
    }
    return null;
  }

  private async updateStepResult(executionId: string, stepIndex: number, stepResult: StepResult) {
    const execution = await this.getExecution(executionId);
    if (!execution) return;

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const existingIndex = stepResults.findIndex((r) => r.stepIndex === stepIndex);

    if (existingIndex >= 0) {
      stepResults[existingIndex] = stepResult;
    } else {
      stepResults.push(stepResult);
    }

    await prisma.orchestratorExecution.update({
      where: { id: executionId },
      data: {
        stepResults: stepResults as any,
        currentStep: stepIndex,
      },
    });
  }

  private async updateCurrentStep(executionId: string, stepIndex: number) {
    await prisma.orchestratorExecution.update({
      where: { id: executionId },
      data: {
        currentStep: stepIndex,
        status: "in_progress",
      },
    });
  }

  private async completeExecution(executionId: string) {
    await prisma.orchestratorExecution.update({
      where: { id: executionId },
      data: {
        status: "completed",
      },
    });

    logger.info("SOP execution completed", { executionId });
  }

  private async executeAutomatedStep(
    step: SopStep,
    _execution: any,
  ): Promise<Record<string, unknown>> {
    // Placeholder for automated step execution
    // In real implementation, this would execute the configured action
    logger.info("Executing automated step", { stepId: step.id, stepName: step.name });

    return {
      message: `Automated step "${step.name}" executed successfully`,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const sopExecutor = new SopExecutor();

// Re-export individual functions for convenience
export const executeSopStep = sopExecutor.executeSopStep.bind(sopExecutor);
export const skipStep = sopExecutor.skipStep.bind(sopExecutor);
export const modifyStep = sopExecutor.modifyStep.bind(sopExecutor);
export const approveStep = sopExecutor.approveStep.bind(sopExecutor);
export const getExecutionProgress = sopExecutor.getExecutionProgress.bind(sopExecutor);
