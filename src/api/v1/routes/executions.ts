/**
 * V1 API - Execution Endpoints
 *
 * Public API endpoints for workflow execution management.
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth } from "../middleware/api-key-auth";
import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";

const router = Router();

/**
 * GET /executions
 * List workflow executions
 */
router.get("/", apiKeyAuth(["executions:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const { workflowId, status, limit = "50", offset = "0" } = req.query;

    const where: any = {
      workflow: { organizationId },
    };

    if (workflowId) {
      where.workflowId = workflowId as string;
    }

    if (status) {
      where.status = status as string;
    }

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where,
        include: {
          workflow: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(parseInt(limit as string, 10), 100),
        skip: parseInt(offset as string, 10),
      }),
      prisma.workflowExecution.count({ where }),
    ]);

    return res.json({
      data: executions.map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflow.name,
        status: e.status,
        inputData: e.inputData,
        outputData: e.outputData,
        errorMessage: e.errorMessage,
        startedAt: e.startedAt?.toISOString(),
        completedAt: e.completedAt?.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
      meta: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    logger.error("Failed to list executions", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to list executions",
    });
  }
});

/**
 * GET /executions/:id
 * Get a specific execution
 */
router.get("/:id", apiKeyAuth(["executions:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const executionId = req.params.id;

    const execution = await prisma.workflowExecution.findFirst({
      where: {
        id: String(executionId),
        workflow: { organizationId },
      },
      include: {
        workflow: {
          select: { id: true, name: true, description: true },
        },
      },
    });

    if (!execution) {
      return res.status(404).json({
        error: "not_found",
        message: "Execution not found",
      });
    }

    return res.json({
      data: {
        id: execution.id,
        workflowId: execution.workflowId,
        workflow: {
          id: execution.workflow.id,
          name: execution.workflow.name,
          description: execution.workflow.description,
        },
        status: execution.status,
        inputData: execution.inputData,
        outputData: execution.outputData,
        errorMessage: execution.errorMessage,
        startedAt: execution.startedAt?.toISOString(),
        completedAt: execution.completedAt?.toISOString(),
        createdAt: execution.createdAt.toISOString(),
        duration: execution.startedAt && execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null,
      },
    });
  } catch (error) {
    logger.error("Failed to get execution", { error, executionId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get execution",
    });
  }
});

/**
 * POST /executions/:id/cancel
 * Cancel a running execution
 */
router.post(
  "/:id/cancel",
  apiKeyAuth(["executions:read"]),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.apiOrganizationId!;
      const executionId = req.params.id;

      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: String(executionId),
          workflow: { organizationId },
        },
      });

      if (!execution) {
        return res.status(404).json({
          error: "not_found",
          message: "Execution not found",
        });
      }

      if (!["pending", "running"].includes(execution.status)) {
        return res.status(400).json({
          error: "invalid_state",
          message: `Cannot cancel execution with status '${execution.status}'`,
        });
      }

      await prisma.workflowExecution.update({
        where: { id: String(executionId) },
        data: {
          status: "failed",
          errorMessage: "Cancelled via API",
          completedAt: new Date(),
        },
      });

      return res.json({
        data: {
          id: executionId,
          status: "cancelled",
          message: "Execution cancelled successfully",
        },
      });
    } catch (error) {
      logger.error("Failed to cancel execution", { error, executionId: req.params.id });
      return res.status(500).json({
        error: "internal_error",
        message: "Failed to cancel execution",
      });
    }
  },
);

/**
 * GET /executions/stats
 * Get execution statistics
 */
router.get("/stats/summary", apiKeyAuth(["executions:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const { period = "24h" } = req.query;

    // Calculate time range
    let startDate: Date;
    switch (period) {
      case "1h":
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case "24h":
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const [total, success, failed, pending, running] = await Promise.all([
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: startDate },
        },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: startDate },
          status: "success",
        },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: startDate },
          status: "failed",
        },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: startDate },
          status: "pending",
        },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: startDate },
          status: "running",
        },
      }),
    ]);

    const successRate = total > 0 ? (success / total) * 100 : 0;

    return res.json({
      data: {
        period,
        startDate: startDate.toISOString(),
        total,
        success,
        failed,
        pending,
        running,
        successRate: Math.round(successRate * 100) / 100,
      },
    });
  } catch (error) {
    logger.error("Failed to get execution stats", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get execution statistics",
    });
  }
});

export default router;
