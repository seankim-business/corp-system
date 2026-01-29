/**
 * V1 API - Workflow Endpoints
 *
 * Public API endpoints for workflow management.
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth } from "../middleware/api-key-auth";
import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { webhookService } from "../../../services/public-webhooks";

const router = Router();

/**
 * GET /workflows
 * List workflows
 */
router.get("/", apiKeyAuth(["workflows:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const { enabled, limit = "50", offset = "0" } = req.query;

    const where: any = { organizationId };
    if (enabled !== undefined) {
      where.enabled = enabled === "true";
    }

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(parseInt(limit as string, 10), 100),
        skip: parseInt(offset as string, 10),
      }),
      prisma.workflow.count({ where }),
    ]);

    return res.json({
      data: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        enabled: w.enabled,
        config: w.config,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      })),
      meta: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    logger.error("Failed to list workflows", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to list workflows",
    });
  }
});

/**
 * GET /workflows/:id
 * Get a specific workflow
 */
router.get("/:id", apiKeyAuth(["workflows:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const workflowId = String(req.params.id);

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({
        error: "not_found",
        message: "Workflow not found",
      });
    }

    return res.json({
      data: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        enabled: workflow.enabled,
        config: workflow.config,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
        recentExecutions: workflow.executions,
      },
    });
  } catch (error) {
    logger.error("Failed to get workflow", { error, workflowId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get workflow",
    });
  }
});

/**
 * POST /workflows
 * Create a new workflow
 */
router.post("/", apiKeyAuth(["workflows:write"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const { name, description, config, enabled = true } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({
        error: "validation_error",
        message: "name is required and must be a string",
      });
    }

    const workflow = await prisma.workflow.create({
      data: {
        organizationId,
        name,
        description: description || null,
        config: config || {},
        enabled,
      },
    });

    return res.status(201).json({
      data: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        enabled: workflow.enabled,
        config: workflow.config,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to create workflow", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to create workflow",
    });
  }
});

/**
 * PATCH /workflows/:id
 * Update a workflow
 */
router.patch("/:id", apiKeyAuth(["workflows:write"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const workflowId = String(req.params.id);
    const { name, description, config, enabled } = req.body;

    const existing = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Workflow not found",
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (config !== undefined) updateData.config = config;
    if (enabled !== undefined) updateData.enabled = enabled;

    const workflow = await prisma.workflow.update({
      where: { id: String(workflowId) },
      data: updateData,
    });

    return res.json({
      data: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        enabled: workflow.enabled,
        config: workflow.config,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to update workflow", { error, workflowId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to update workflow",
    });
  }
});

/**
 * DELETE /workflows/:id
 * Delete a workflow
 */
router.delete("/:id", apiKeyAuth(["workflows:write"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const workflowId = String(req.params.id);

    const existing = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
    });

    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Workflow not found",
      });
    }

    await prisma.workflow.delete({
      where: { id: String(workflowId) },
    });

    return res.status(204).send();
  } catch (error) {
    logger.error("Failed to delete workflow", { error, workflowId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to delete workflow",
    });
  }
});

/**
 * POST /workflows/:id/execute
 * Execute a workflow
 */
router.post(
  "/:id/execute",
  apiKeyAuth(["workflows:execute"]),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.apiOrganizationId!;
      const workflowId = String(req.params.id);
      const { inputData } = req.body;

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, organizationId, enabled: true },
      });

      if (!workflow) {
        return res.status(404).json({
          error: "not_found",
          message: "Workflow not found or disabled",
        });
      }

      // Create execution record
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          status: "pending",
          inputData: inputData || {},
          startedAt: new Date(),
        },
      });

      // Emit webhook for workflow start
      webhookService.emit(organizationId, "workflow.started", {
        workflowId,
        executionId: execution.id,
        apiKeyId: req.apiKey?.id,
      }).catch((err) => logger.error("Failed to emit webhook", { error: err }));

      // Start async execution (simplified for API)
      setImmediate(async () => {
        try {
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: { status: "running" },
          });

          // Simulate execution (actual implementation would use workflow engine)
          await new Promise((resolve) => setTimeout(resolve, 1000));

          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: "success",
              outputData: { message: "Workflow completed" },
              completedAt: new Date(),
            },
          });

          webhookService.emit(organizationId, "workflow.completed", {
            workflowId,
            executionId: execution.id,
          }).catch((err) => logger.error("Failed to emit webhook", { error: err }));
        } catch (error) {
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
              completedAt: new Date(),
            },
          });

          webhookService.emit(organizationId, "workflow.failed", {
            workflowId,
            executionId: execution.id,
            error: error instanceof Error ? error.message : "Unknown error",
          }).catch((err) => logger.error("Failed to emit webhook", { error: err }));
        }
      });

      return res.status(202).json({
        data: {
          id: execution.id,
          workflowId,
          status: "pending",
          createdAt: execution.createdAt.toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to execute workflow", { error, workflowId: req.params.id });
      return res.status(500).json({
        error: "execution_error",
        message: "Failed to execute workflow",
      });
    }
  },
);

export default router;
