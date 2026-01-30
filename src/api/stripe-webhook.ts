/**
 * Stripe Webhook API Routes (Stub)
 *
 * NOTE: Requires Stripe API keys and webhook configuration (see .env.example)
 */

import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";

const router = Router();

// POST /api/webhooks/stripe
router.post("/", async (_req: Request, res: Response) => {
  logger.warn("Stripe webhook received but service not yet implemented");

  // Always return 200 to acknowledge receipt
  // This prevents Stripe from retrying the webhook
  res.status(200).json({
    received: true,
    message: "Webhook handler not yet implemented",
  });
});

export default router;
