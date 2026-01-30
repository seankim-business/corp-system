/**
 * Onboarding API Routes (Stub)
 *
 * NOTE: Requires onboarding tables in Prisma schema (OnboardingStep, Checklist, etc.)
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// GET /api/onboarding/state
router.get("/onboarding/state", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    state: null,
    message: "Onboarding service not yet implemented",
  });
});

// GET /api/onboarding/checklist
router.get("/onboarding/checklist", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    items: [],
    progress: { completed: 0, total: 0, percentage: 0 },
  });
});

// GET /api/onboarding/templates
router.get("/onboarding/templates", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    templates: [],
  });
});

export default router;
