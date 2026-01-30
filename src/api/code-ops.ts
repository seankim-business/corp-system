/**
 * Code Operations API
 *
 * REST endpoints for managing and monitoring code operations.
 */

import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * Helper to get start of today
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * GET /api/code-operations/stats
 * Returns operation statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const [active, queued, completedToday, failedToday] = await Promise.all([
      db.codeOperation.count({
        where: {
          organizationId: orgId,
          status: { in: ["analyzing", "executing", "testing", "committing"] },
        },
      }),
      db.codeOperation.count({
        where: { organizationId: orgId, status: "queued" },
      }),
      db.codeOperation.count({
        where: {
          organizationId: orgId,
          status: "completed",
          completedAt: { gte: startOfToday() },
        },
      }),
      db.codeOperation.count({
        where: {
          organizationId: orgId,
          status: "failed",
          completedAt: { gte: startOfToday() },
        },
      }),
    ]);

    res.json({ active, queued, completedToday, failedToday });
  } catch (error) {
    logger.error(
      "Failed to get code operation stats",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get operation stats" });
  }
});

/**
 * GET /api/code-operations/active
 * Returns currently active operations
 */
router.get("/active", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const operations = await db.codeOperation.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: ["completed", "failed", "cancelled"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(operations);
  } catch (error) {
    logger.error(
      "Failed to get active operations",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get active operations" });
  }
});

/**
 * GET /api/code-operations/pending-approval
 * Returns operations waiting for approval
 */
router.get("/pending-approval", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const operations = await db.codeOperation.findMany({
      where: {
        organizationId: orgId,
        status: "completed",
        approvalRequired: true,
        approvedAt: null,
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    });

    res.json(operations);
  } catch (error) {
    logger.error(
      "Failed to get pending approvals",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get pending approvals" });
  }
});

/**
 * GET /api/code-operations/history
 * Returns operation history
 */
router.get("/history", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100);
    const operations = await db.codeOperation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json(operations);
  } catch (error) {
    logger.error(
      "Failed to get operation history",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get operation history" });
  }
});

/**
 * GET /api/code-operations/:id
 * Get single operation details
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const operationId = req.params.id as string;
    const operation = await db.codeOperation.findFirst({
      where: {
        id: operationId,
        organizationId: orgId,
      },
    });

    if (!operation) {
      return res.status(404).json({ error: "Operation not found" });
    }

    return res.json(operation);
  } catch (error) {
    logger.error(
      "Failed to get operation details",
      { operationId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get operation details" });
  }
});

/**
 * POST /api/code-operations/:id/approve
 * Approve a pending operation
 */
router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const operationId = req.params.id as string;

    // Verify operation exists and belongs to org
    const existing = await db.codeOperation.findFirst({
      where: {
        id: operationId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Operation not found" });
    }

    const operation = await db.codeOperation.update({
      where: { id: operationId },
      data: {
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    logger.info("Code operation approved", {
      operationId: req.params.id,
      userId,
      orgId,
    });

    return res.json(operation);
  } catch (error) {
    logger.error(
      "Failed to approve operation",
      { operationId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to approve operation" });
  }
});

/**
 * POST /api/code-operations/:id/reject
 * Reject a pending operation
 */
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { reason } = req.body;
    const operationId = req.params.id as string;

    // Verify operation exists and belongs to org
    const existing = await db.codeOperation.findFirst({
      where: {
        id: operationId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Operation not found" });
    }

    const operation = await db.codeOperation.update({
      where: { id: operationId },
      data: {
        status: "cancelled",
        errorMessage: `Rejected: ${reason || "No reason provided"}`,
      },
    });

    logger.info("Code operation rejected", {
      operationId: req.params.id,
      reason,
      orgId,
    });

    return res.json(operation);
  } catch (error) {
    logger.error(
      "Failed to reject operation",
      { operationId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to reject operation" });
  }
});

/**
 * POST /api/code-operations/:id/cancel
 * Cancel a running operation
 */
router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const operationId = req.params.id as string;

    const operation = await db.codeOperation.findFirst({
      where: {
        id: operationId,
        organizationId: orgId,
      },
    });

    if (!operation) {
      return res.status(404).json({ error: "Operation not found" });
    }

    const updated = await db.codeOperation.update({
      where: { id: operationId },
      data: { status: "cancelled" },
    });

    logger.info("Code operation cancelled", {
      operationId: req.params.id,
      orgId,
    });

    return res.json(updated);
  } catch (error) {
    logger.error(
      "Failed to cancel operation",
      { operationId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to cancel operation" });
  }
});

export default router;
