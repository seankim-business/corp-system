import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";

const router = Router();

interface KeyResultBase {
  id: string;
  objectiveId: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ObjectiveBase {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  quarter: string;
  ownerId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface KeyResultWithProgress extends KeyResultBase {
  progress: number;
}

interface ObjectiveWithKeyResults extends ObjectiveBase {
  keyResults: KeyResultWithProgress[];
  progress: number;
}

function calculateKeyResultProgress(current: number, target: number): number {
  if (target === 0) return 0;
  const progress = (current / target) * 100;
  return Math.min(Math.round(progress), 100);
}

function calculateObjectiveProgress(keyResults: { current: number; target: number }[]): number {
  if (keyResults.length === 0) return 0;
  const totalProgress = keyResults.reduce((sum, kr) => {
    return sum + calculateKeyResultProgress(kr.current, kr.target);
  }, 0);
  return Math.round(totalProgress / keyResults.length);
}

function addProgressToKeyResult(kr: KeyResultBase): KeyResultWithProgress {
  return {
    ...kr,
    progress: calculateKeyResultProgress(kr.current, kr.target),
  };
}

function addProgressToObjective(
  obj: ObjectiveBase & { keyResults: KeyResultBase[] },
): ObjectiveWithKeyResults {
  return {
    ...obj,
    keyResults: obj.keyResults.map(addProgressToKeyResult),
    progress: calculateObjectiveProgress(obj.keyResults),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const { quarter } = req.query;

    const where: { organizationId: string; quarter?: string } = { organizationId };
    if (quarter && typeof quarter === "string") {
      where.quarter = quarter;
    }

    const objectives = await prisma.objective.findMany({
      where,
      include: {
        keyResults: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const objectivesWithProgress = objectives.map(addProgressToObjective);
    res.json({ objectives: objectivesWithProgress });
  } catch (error) {
    logger.error(
      "Failed to fetch objectives",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to fetch objectives",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);

    const objective = await prisma.objective.findFirst({
      where: { id, organizationId },
      include: {
        keyResults: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }

    res.json({ objective: addProgressToObjective(objective) });
  } catch (error) {
    logger.error(
      "Failed to fetch objective",
      { organizationId: req.user?.organizationId, objectiveId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to fetch objective",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const { title, description, quarter, ownerId, status } = req.body;

    if (!title || !quarter || !ownerId) {
      res.status(400).json({ error: "title, quarter, and ownerId are required" });
      return;
    }

    const objective = await prisma.objective.create({
      data: {
        organizationId,
        title,
        description: description || null,
        quarter,
        ownerId,
        status: status || "on_track",
      },
      include: {
        keyResults: true,
      },
    });

    logger.info("Objective created", {
      organizationId,
      objectiveId: objective.id,
      title,
    });

    res.status(201).json({
      objective: addProgressToObjective(objective),
    });
  } catch (error) {
    logger.error(
      "Failed to create objective",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to create objective",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);
    const { title, description, quarter, ownerId, status } = req.body;

    const existing = await prisma.objective.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }

    const objective = await prisma.objective.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(quarter !== undefined && { quarter }),
        ...(ownerId !== undefined && { ownerId }),
        ...(status !== undefined && { status }),
      },
      include: {
        keyResults: true,
      },
    });

    logger.info("Objective updated", {
      organizationId,
      objectiveId: id,
    });

    res.json({ objective: addProgressToObjective(objective) });
  } catch (error) {
    logger.error(
      "Failed to update objective",
      { organizationId: req.user?.organizationId, objectiveId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to update objective",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);

    const existing = await prisma.objective.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }

    await prisma.objective.delete({
      where: { id },
    });

    logger.info("Objective deleted", {
      organizationId,
      objectiveId: id,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete objective",
      { organizationId: req.user?.organizationId, objectiveId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to delete objective",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/:id/key-results", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const objectiveId = String(req.params.id);
    const { title, target, current, unit, ownerId } = req.body;

    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, organizationId },
    });

    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }

    if (!title || target === undefined || !unit) {
      res.status(400).json({ error: "title, target, and unit are required" });
      return;
    }

    const keyResult = await prisma.keyResult.create({
      data: {
        objectiveId,
        title,
        target: Number(target),
        current: current !== undefined ? Number(current) : 0,
        unit,
        ownerId: ownerId || null,
      },
    });

    logger.info("Key result created", {
      organizationId,
      objectiveId,
      keyResultId: keyResult.id,
    });

    res.status(201).json({
      keyResult: addProgressToKeyResult(keyResult),
    });
  } catch (error) {
    logger.error(
      "Failed to create key result",
      { organizationId: req.user?.organizationId, objectiveId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to create key result",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.put("/key-results/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);
    const { title, target, current, unit, ownerId } = req.body;

    const existing = await prisma.keyResult.findFirst({
      where: { id },
      include: {
        objective: true,
      },
    });

    if (!existing || existing.objective.organizationId !== organizationId) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }

    const keyResult = await prisma.keyResult.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(target !== undefined && { target: Number(target) }),
        ...(current !== undefined && { current: Number(current) }),
        ...(unit !== undefined && { unit }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
      },
    });

    logger.info("Key result updated", {
      organizationId,
      keyResultId: id,
      current: keyResult.current,
      target: keyResult.target,
    });

    res.json({
      keyResult: addProgressToKeyResult(keyResult),
    });
  } catch (error) {
    logger.error(
      "Failed to update key result",
      { organizationId: req.user?.organizationId, keyResultId: String(req.params.id) },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to update key result",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.delete(
  "/key-results/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const existing = await prisma.keyResult.findFirst({
        where: { id },
        include: {
          objective: true,
        },
      });

      if (!existing || existing.objective.organizationId !== organizationId) {
        res.status(404).json({ error: "Key result not found" });
        return;
      }

      await prisma.keyResult.delete({
        where: { id },
      });

      logger.info("Key result deleted", {
        organizationId,
        keyResultId: id,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error(
        "Failed to delete key result",
        { organizationId: req.user?.organizationId, keyResultId: String(req.params.id) },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to delete key result",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

router.get("/meta/quarters", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;

    const objectives = await prisma.objective.findMany({
      where: { organizationId },
      select: { quarter: true },
      distinct: ["quarter"],
      orderBy: { quarter: "desc" },
    });

    const quarters = objectives.map((obj: { quarter: string }) => obj.quarter);

    const now = new Date();
    const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
    if (!quarters.includes(currentQuarter)) {
      quarters.unshift(currentQuarter);
    }

    res.json({ quarters });
  } catch (error) {
    logger.error(
      "Failed to fetch quarters",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      error: "Failed to fetch quarters",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
