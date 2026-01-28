import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import {
  validate,
  uuidParamSchema,
  configureSopSchema,
  skipStepSchema,
  modifyStepSchema,
  approveStepSchema,
  stepIndexParamSchema,
  ConfigureSopInput,
  SkipStepInput,
  ModifyStepInput,
  ApproveStepInput,
} from "../middleware/validation.middleware";
import {
  executeSopStep,
  skipStep,
  modifyStep,
  approveStep,
  getExecutionProgress,
} from "../services/sop-executor";
import { logger } from "../utils/logger";

const router = Router();

router.put(
  "/workflows/:id/sop",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({ params: uuidParamSchema, body: configureSopSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const { sopEnabled, sopSteps } = req.body as ConfigureSopInput;

      const workflow = await prisma.workflow.findFirst({
        where: { id, organizationId },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const updatedWorkflow = await prisma.workflow.update({
        where: { id },
        data: {
          sopEnabled,
          ...(sopSteps !== undefined && { sopSteps: sopSteps as object }),
        },
      });

      return res.json({
        workflow: updatedWorkflow,
        message: sopEnabled ? "SOP enabled for workflow" : "SOP disabled for workflow",
      });
    } catch (error) {
      logger.error(
        "Configure SOP error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to configure SOP" });
    }
  },
);

router.get(
  "/executions/:id/sop-progress",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const execution = await prisma.orchestratorExecution.findFirst({
        where: { id, organizationId },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      const progress = await getExecutionProgress(id);

      return res.json({ progress });
    } catch (error) {
      logger.error(
        "Get SOP progress error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get SOP progress" });
    }
  },
);

router.post(
  "/executions/:id/sop/execute/:stepIndex",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: stepIndexParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const executionId = String(req.params.id);
      const stepIndex = Number(req.params.stepIndex);

      const execution = await prisma.orchestratorExecution.findFirst({
        where: { id: executionId, organizationId },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      const result = await executeSopStep(executionId, stepIndex, userId);

      return res.json({ result });
    } catch (error) {
      logger.error(
        "Execute SOP step error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to execute step",
      });
    }
  },
);

router.post(
  "/executions/:id/sop/approve",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema, body: approveStepSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const executionId = String(req.params.id);
      const { note } = req.body as ApproveStepInput;

      const execution = await prisma.orchestratorExecution.findFirst({
        where: { id: executionId, organizationId },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      const currentStep = execution.currentStep ?? 0;
      const result = await approveStep(executionId, currentStep, userId, note);
      const progress = await getExecutionProgress(executionId);

      return res.json({ result, progress });
    } catch (error) {
      logger.error(
        "Approve SOP step error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to approve step",
      });
    }
  },
);

router.post(
  "/executions/:id/sop/skip",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema, body: skipStepSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const executionId = String(req.params.id);
      const { reason } = req.body as SkipStepInput;

      const execution = await prisma.orchestratorExecution.findFirst({
        where: { id: executionId, organizationId },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      const currentStep = execution.currentStep ?? 0;
      const result = await skipStep(executionId, currentStep, reason, userId);
      const progress = await getExecutionProgress(executionId);

      return res.json({ result, progress });
    } catch (error) {
      logger.error(
        "Skip SOP step error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to skip step",
      });
    }
  },
);

router.post(
  "/executions/:id/sop/modify",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema, body: modifyStepSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const executionId = String(req.params.id);
      const { modifications } = req.body as ModifyStepInput;

      const execution = await prisma.orchestratorExecution.findFirst({
        where: { id: executionId, organizationId },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      const currentStep = execution.currentStep ?? 0;
      const result = await modifyStep(executionId, currentStep, modifications, userId);
      const progress = await getExecutionProgress(executionId);

      return res.json({ result, progress });
    } catch (error) {
      logger.error(
        "Modify SOP step error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to modify step",
      });
    }
  },
);

export default router;
