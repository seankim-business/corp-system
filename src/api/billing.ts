/**
 * Billing API Routes (Stub)
 *
 * NOTE: Requires billing tables in Prisma schema (Subscription, Invoice, etc.)
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getPublicPlans } from "../services/billing/plans";

const router = Router();

// GET /api/billing/subscription
router.get("/subscription", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    subscription: null,
    message: "Billing service not yet implemented",
  });
});

// GET /api/billing/plans
router.get("/plans", async (_req: Request, res: Response) => {
  res.json({
    plans: getPublicPlans(),
  });
});

// GET /api/billing/usage
router.get("/usage", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    usage: {},
    period: new Date().toISOString().slice(0, 7),
  });
});

// GET /api/billing/invoices
router.get("/invoices", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    invoices: [],
  });
});

// GET /api/billing/limits
router.get("/limits", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    limits: {},
    message: "Billing limits not yet implemented",
  });
});

// POST /api/billing/change-plan
router.post("/change-plan", requireAuth, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: "Billing service not yet implemented",
  });
});

// POST /api/billing/cancel
router.post("/cancel", requireAuth, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: "Billing service not yet implemented",
  });
});

// POST /api/billing/portal
router.post("/portal", requireAuth, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: "Stripe portal not yet configured",
  });
});

export default router;
