/**
 * SOP Executor Service - US-006
 *
 * Handles step-by-step SOP (Standard Operating Procedure) execution
 * Each step can be approved, modified, or skipped with full audit trail
 * Supports both database-stored SOPs and YAML-defined SOPs
 */

import { db as prisma } from "../db/client";
import { auditLogger } from "./audit-logger";
import { logger } from "../utils/logger";
import {
  getSOPById,
  getSOPByTrigger,
  convertSOPToExecutorFormat,
  SOPDefinition,
  SOPExceptionHandler,
} from "../config/sop-loader";
import { getMCPConnectionsByProvider, getAccessTokenFromConfig } from "./mcp-registry";
import { executeNotionTool } from "../mcp-servers/notion";
import { executeLinearTool } from "../mcp-servers/linear";
import { executeGitHubTool } from "../mcp-servers/github";
import { delegateTask } from "../orchestrator/delegate-task";

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
  sopDefinitionId?: string;
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

export interface ExceptionContext {
  executionId: string;
  stepIndex: number;
  step: SopStep;
  stepResult: StepResult;
  sopDefinition?: SOPDefinition;
  execution: any;
}

class SopExecutor {
  async startSOPFromYAML(
    sopId: string,
    organizationId: string,
    userId: string,
    inputData?: Record<string, unknown>,
  ): Promise<string> {
    const sopDefinition = getSOPById(sopId);
    if (!sopDefinition) {
      throw new Error(`SOP definition not found: ${sopId}`);
    }

    const steps = convertSOPToExecutorFormat(sopDefinition);

    const execution = await prisma.orchestratorExecution.create({
      data: {
        organizationId,
        userId,
        sessionId: `sop-${sopId}-${Date.now()}`,
        category: "sop",
        status: "pending",
        currentStep: 0,
        stepResults: [],
        metadata: {
          sopDefinitionId: sopId,
          sopVersion: sopDefinition.metadata.version,
          inputData: inputData ?? null,
        } as any,
      },
    });

    logger.info("Started SOP execution from YAML", {
      executionId: execution.id,
      sopId,
      stepsCount: steps.length,
    });

    return execution.id;
  }

  async startSOPFromTrigger(
    triggerText: string,
    organizationId: string,
    userId: string,
    inputData?: Record<string, unknown>,
  ): Promise<{ executionId: string; sopDefinition: SOPDefinition } | null> {
    const sopDefinition = getSOPByTrigger(triggerText);
    if (!sopDefinition) {
      return null;
    }

    const executionId = await this.startSOPFromYAML(
      sopDefinition.metadata.id,
      organizationId,
      userId,
      inputData,
    );

    return { executionId, sopDefinition };
  }

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
    const { sopSteps, sopDefinition } = await this.getSOPStepsForExecution(execution);

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}. Valid range: 0-${sopSteps.length - 1}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex);

    if (existingResult?.status === "completed") {
      throw new Error(`Step ${stepIndex} (${step.name}) already completed`);
    }

    const stepResult: StepResult = {
      stepIndex,
      stepId: step.id,
      status: "running",
      startedAt: new Date(),
    };

    await this.updateStepResult(executionId, stepIndex, stepResult);

    try {
      let result: Record<string, unknown> = {};

      switch (step.type) {
        case "manual":
          result = { message: "Manual step requires approval to complete" };
          stepResult.status = "pending";
          break;

        case "approval":
          result = { message: "Awaiting approval", requiredApprovers: step.requiredApprovers };
          stepResult.status = "pending";
          break;

        case "automated":
          result = await this.executeAutomatedStep(step, execution);
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
          break;

        case "mcp_call":
          result = await this.executeMCPCallStep(step, execution);
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
          break;

        default:
          result = { message: `Unknown step type: ${step.type}` };
          stepResult.status = "completed";
          stepResult.completedAt = new Date();
      }

      stepResult.result = result;
      await this.updateStepResult(executionId, stepIndex, stepResult);

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
          sopDefinitionId: sopDefinition?.metadata.id,
        },
        success: true,
      });

      if (stepResult.status === "completed" && stepIndex < sopSteps.length - 1) {
        await this.updateCurrentStep(executionId, stepIndex + 1);
      } else if (stepResult.status === "completed" && stepIndex === sopSteps.length - 1) {
        await this.completeExecution(executionId);
      }

      return stepResult;
    } catch (error: any) {
      stepResult.status = "failed";
      stepResult.error = error.message;
      stepResult.completedAt = new Date();

      await this.updateStepResult(executionId, stepIndex, stepResult);

      if (sopDefinition) {
        await this.handleException(
          "step.failed",
          { executionId, stepIndex, step, stepResult, sopDefinition, execution },
          sopDefinition.exception_handling,
        );
      }

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

    const { sopSteps } = await this.getSOPStepsForExecution(execution);

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];

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

    if (stepIndex < sopSteps.length - 1) {
      await this.updateCurrentStep(executionId, stepIndex + 1);
    } else {
      await this.completeExecution(executionId);
    }

    return stepResult;
  }

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
    const { sopSteps } = await this.getSOPStepsForExecution(execution);

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex);

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
    const { sopSteps } = await this.getSOPStepsForExecution(execution);

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex) || {
      stepIndex,
      stepId: step.id,
      status: "pending" as const,
    };

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

    if (stepIndex < sopSteps.length - 1) {
      await this.updateCurrentStep(executionId, stepIndex + 1);
    } else {
      await this.completeExecution(executionId);
    }

    return stepResult;
  }

  async rejectApproval(
    executionId: string,
    stepIndex: number,
    userId: string,
    reason: string,
  ): Promise<StepResult> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const { sopSteps, sopDefinition } = await this.getSOPStepsForExecution(execution);

    if (stepIndex < 0 || stepIndex >= sopSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = sopSteps[stepIndex];
    const existingResult = stepResults.find((r) => r.stepIndex === stepIndex) || {
      stepIndex,
      stepId: step.id,
      status: "pending" as const,
    };

    const stepResult: StepResult = {
      ...existingResult,
      status: "failed",
      completedAt: new Date(),
      result: {
        ...(existingResult.result || {}),
        rejectionReason: reason,
        rejectedBy: userId,
        approved: false,
      },
    };

    await this.updateStepResult(executionId, stepIndex, stepResult);

    if (sopDefinition) {
      await this.handleException(
        "approval.rejected",
        { executionId, stepIndex, step, stepResult, sopDefinition, execution },
        sopDefinition.exception_handling,
      );
    }

    await auditLogger.log({
      action: "workflow.execute",
      organizationId: execution.organizationId,
      userId,
      resourceType: "sop_step",
      resourceId: `${executionId}:${stepIndex}`,
      details: {
        stepName: step.name,
        action: "rejected",
        reason,
      },
      success: true,
    });

    return stepResult;
  }

  async getExecutionProgress(executionId: string): Promise<ExecutionProgress> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const stepResults = (execution.stepResults as unknown as StepResult[]) || [];
    const { sopSteps, sopDefinition, workflow } = await this.getSOPStepsForExecution(execution);

    const stepsWithResults = sopSteps.map((step, index) => ({
      ...step,
      result: stepResults.find((r) => r.stepIndex === index),
    }));

    const completedSteps = stepResults.filter((r) => r.status === "completed").length;
    const skippedSteps = stepResults.filter((r) => r.status === "skipped").length;
    const failedSteps = stepResults.filter((r) => r.status === "failed").length;
    const currentStep = execution.currentStep ?? 0;

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
      sopDefinitionId: sopDefinition?.metadata.id,
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

  private async getExecution(executionId: string) {
    return prisma.orchestratorExecution.findUnique({
      where: { id: executionId },
    });
  }

  private async getWorkflowForExecution(execution: any) {
    const workflowId = execution.metadata?.workflowId;
    if (workflowId) {
      return prisma.workflow.findUnique({
        where: { id: workflowId },
      });
    }
    return null;
  }

  private async getSOPStepsForExecution(execution: any): Promise<{
    sopSteps: SopStep[];
    sopDefinition?: SOPDefinition;
    workflow?: any;
  }> {
    const sopDefinitionId = execution.metadata?.sopDefinitionId;

    if (sopDefinitionId) {
      const sopDefinition = getSOPById(sopDefinitionId);
      if (sopDefinition) {
        return {
          sopSteps: convertSOPToExecutorFormat(sopDefinition),
          sopDefinition,
        };
      }
    }

    const workflow = await this.getWorkflowForExecution(execution);
    const sopSteps = (workflow?.sopSteps as unknown as SopStep[]) || [];

    return { sopSteps, workflow };
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
    execution: any,
  ): Promise<Record<string, unknown>> {
    const config = step.config || {};
    const inputData = execution.metadata?.inputData || {};
    const organizationId = execution.organizationId;

    logger.info("Executing automated step", {
      stepId: step.id,
      stepName: step.name,
      agent: config.agent,
      tool: config.tool,
    });

    const interpolatedInput = this.interpolateVariables(
      config.input as Record<string, unknown>,
      inputData,
    );

    if (config.agent && config.tool) {
      const sessionId = `sop-step-${execution.id}-${step.id}`;
      const delegationResult = await delegateTask({
        category: "quick",
        load_skills: [],
        prompt: `Execute step "${step.name}": ${step.description || ""}\nInput: ${JSON.stringify(interpolatedInput)}`,
        session_id: sessionId,
        organizationId,
        userId: execution.userId,
        context: {
          sopStepId: step.id,
          sopExecutionId: execution.id,
          availableMCPs: [],
        },
      });

      return {
        message: `Automated step "${step.name}" executed`,
        timestamp: new Date().toISOString(),
        agent: config.agent,
        tool: config.tool,
        input: interpolatedInput,
        output: delegationResult.output,
        status: delegationResult.status,
      };
    }

    return {
      message: `Automated step "${step.name}" executed (no agent configured)`,
      timestamp: new Date().toISOString(),
      agent: config.agent,
      tool: config.tool,
      input: interpolatedInput,
    };
  }

  private async executeMCPCallStep(
    step: SopStep,
    execution: any,
  ): Promise<Record<string, unknown>> {
    const config = step.config || {};
    const inputData = execution.metadata?.inputData || {};
    const organizationId = execution.organizationId;

    logger.info("Executing MCP call step", {
      stepId: step.id,
      stepName: step.name,
      agent: config.agent,
      tool: config.tool,
    });

    const interpolatedInput = this.interpolateVariables(
      config.input as Record<string, unknown>,
      inputData,
    );

    const provider = config.provider as string;
    const toolName = config.tool as string;

    if (!provider || !toolName) {
      return {
        message: `MCP call step "${step.name}" skipped - no provider or tool configured`,
        timestamp: new Date().toISOString(),
        input: interpolatedInput,
      };
    }

    const connections = await getMCPConnectionsByProvider(organizationId, provider);
    if (connections.length === 0) {
      throw new Error(`No ${provider} connection found for organization ${organizationId}`);
    }

    const connection = connections[0];
    const accessToken = getAccessTokenFromConfig(connection.config as any);

    if (!accessToken) {
      throw new Error(`No access token found for ${provider} connection`);
    }

    let result: any;

    switch (provider.toLowerCase()) {
      case "notion":
        result = await executeNotionTool(
          accessToken,
          toolName,
          interpolatedInput,
          organizationId,
          connection,
        );
        break;
      case "linear":
        result = await executeLinearTool(
          accessToken,
          toolName,
          interpolatedInput,
          organizationId,
          connection,
        );
        break;
      case "github":
        result = await executeGitHubTool(
          accessToken,
          toolName,
          interpolatedInput,
          organizationId,
          connection,
        );
        break;
      default:
        throw new Error(`Unsupported MCP provider: ${provider}`);
    }

    return {
      message: `MCP call step "${step.name}" executed successfully`,
      timestamp: new Date().toISOString(),
      provider,
      tool: toolName,
      input: interpolatedInput,
      result,
    };
  }

  private interpolateVariables(
    template: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!template) return {};

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === "string") {
        result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
          const keys = path.trim().split(".");
          let current: any = data;
          for (const k of keys) {
            current = current?.[k];
          }
          return current !== undefined ? String(current) : `{{${path}}}`;
        });
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.interpolateVariables(value as Record<string, unknown>, data);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private async handleException(
    condition: string,
    context: ExceptionContext,
    handlers?: SOPExceptionHandler[],
  ): Promise<void> {
    if (!handlers || handlers.length === 0) {
      logger.warn("No exception handlers defined", { condition, stepId: context.step.id });
      return;
    }

    const matchingHandler = handlers.find((h) => h.condition === condition);
    if (!matchingHandler) {
      logger.warn("No matching exception handler", { condition, stepId: context.step.id });
      return;
    }

    logger.info("Executing exception handler", {
      condition,
      action: matchingHandler.action,
      stepId: context.step.id,
    });

    const message = this.interpolateExceptionMessage(matchingHandler.message || "", context);

    switch (matchingHandler.action) {
      case "notify_owner":
        await this.notifyOwner(context, message);
        break;
      case "escalate":
        await this.escalate(context, matchingHandler.target || "", message);
        break;
      case "retry_with_modification":
        await this.scheduleRetry(context, matchingHandler.max_retries || 3);
        break;
      case "halt_and_escalate":
        await this.haltAndEscalate(context, matchingHandler.target || "", message);
        break;
      case "return_to_step":
        await this.returnToStep(context, matchingHandler.step || "");
        break;
      case "send_reminder":
        await this.sendReminder(context, matchingHandler.target || "", message);
        break;
      case "request_revision":
        await this.requestRevision(context, matchingHandler.notify || "", message);
        break;
      case "page_executive":
        await this.pageExecutive(context, matchingHandler.target || "", message);
        break;
      case "escalate_and_retry":
        await this.escalateAndRetry(context, matchingHandler.target || "", message);
        break;
      case "auto_update":
        await this.autoUpdate(context, message);
        break;
      default:
        logger.warn("Unknown exception action", { action: matchingHandler.action });
    }

    await auditLogger.log({
      action: "workflow.execute",
      organizationId: context.execution.organizationId,
      userId: context.execution.userId,
      resourceType: "sop_exception",
      resourceId: `${context.executionId}:${context.stepIndex}`,
      details: {
        type: "exception_handled",
        condition,
        handlerAction: matchingHandler.action,
        target: matchingHandler.target,
        message,
      },
      success: true,
    });
  }

  private interpolateExceptionMessage(template: string, context: ExceptionContext): string {
    return template
      .replace(/\{\{step\.name\}\}/g, context.step.name)
      .replace(/\{\{step\.id\}\}/g, context.step.id)
      .replace(/\{\{execution\.id\}\}/g, context.executionId);
  }

  private async notifyOwner(context: ExceptionContext, message: string): Promise<void> {
    const owner = context.sopDefinition?.metadata.owner;
    logger.info("Notifying owner", { owner, message, executionId: context.executionId });
  }

  private async escalate(
    context: ExceptionContext,
    target: string,
    message: string,
  ): Promise<void> {
    logger.info("Escalating", { target, message, executionId: context.executionId });
  }

  private async scheduleRetry(context: ExceptionContext, maxRetries: number): Promise<void> {
    logger.info("Scheduling retry", { maxRetries, executionId: context.executionId });
  }

  private async haltAndEscalate(
    context: ExceptionContext,
    target: string,
    message: string,
  ): Promise<void> {
    await prisma.orchestratorExecution.update({
      where: { id: context.executionId },
      data: { status: "failed" },
    });
    logger.info("Halted and escalated", { target, message, executionId: context.executionId });
  }

  private async returnToStep(context: ExceptionContext, stepId: string): Promise<void> {
    const { sopSteps } = await this.getSOPStepsForExecution(context.execution);
    const targetIndex = sopSteps.findIndex((s) => s.id === stepId);
    if (targetIndex >= 0) {
      await this.updateCurrentStep(context.executionId, targetIndex);
    }
    logger.info("Returned to step", { stepId, executionId: context.executionId });
  }

  private async sendReminder(
    context: ExceptionContext,
    target: string,
    message: string,
  ): Promise<void> {
    logger.info("Sending reminder", { target, message, executionId: context.executionId });
  }

  private async requestRevision(
    context: ExceptionContext,
    notify: string,
    message: string,
  ): Promise<void> {
    logger.info("Requesting revision", { notify, message, executionId: context.executionId });
  }

  private async pageExecutive(
    context: ExceptionContext,
    target: string,
    message: string,
  ): Promise<void> {
    logger.info("Paging executive", { target, message, executionId: context.executionId });
  }

  private async escalateAndRetry(
    context: ExceptionContext,
    target: string,
    message: string,
  ): Promise<void> {
    await this.escalate(context, target, message);
    await this.scheduleRetry(context, 3);
  }

  private async autoUpdate(context: ExceptionContext, message: string): Promise<void> {
    logger.info("Auto update", { message, executionId: context.executionId });
  }
}

export const sopExecutor = new SopExecutor();

export const startSOPFromYAML = sopExecutor.startSOPFromYAML.bind(sopExecutor);
export const startSOPFromTrigger = sopExecutor.startSOPFromTrigger.bind(sopExecutor);
export const executeSopStep = sopExecutor.executeSopStep.bind(sopExecutor);
export const skipStep = sopExecutor.skipStep.bind(sopExecutor);
export const modifyStep = sopExecutor.modifyStep.bind(sopExecutor);
export const approveStep = sopExecutor.approveStep.bind(sopExecutor);
export const rejectApproval = sopExecutor.rejectApproval.bind(sopExecutor);
export const getExecutionProgress = sopExecutor.getExecutionProgress.bind(sopExecutor);
