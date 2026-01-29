/**
 * Billing API Routes
 *
 * Handles subscription management, usage tracking, and Stripe integration.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../utils/logger";
import {
  getOrCreateSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
} from "../services/billing/subscriptions";
import {
  getCurrentUsage,
  getHistory,
  syncCountMetrics,
} from "../services/billing/usage";
import {
  limitEnforcer,
} from "../services/billing/limits";
import {
  getPublicPlans,
  formatPrice,
  getYearlySavingsPercent,
  PlanId,
} from "../services/billing/plans";
import {
  createCheckoutSession,
  createBillingPortalSession,
  isStripeConfigured,
} from "../services/billing/stripe";
import {
  getInvoicesForOrganization,
  getInvoiceStats,
  getUpcomingInvoicePreview,
  syncInvoicesFromStripe,
} from "../services/billing/invoices";

const router = Router();

// Request type with organizationId - use type assertion when accessing
type AuthenticatedRequest = Request & {
  organizationId?: string;
  user?: {
    id: string;
    email: string;
  };
};

/**
 * GET /api/billing/plans
 * Get available subscription plans
 */
router.get("/plans", async (_req: Request, res: Response) => {
  try {
    const plans = getPublicPlans().map((plan) => ({
      id: plan.id,
      name: plan.name,
      nameKo: plan.nameKo,
      description: plan.description,
      descriptionKo: plan.descriptionKo,
      pricing: {
        monthly: formatPrice(plan.pricing.monthly),
        yearly: formatPrice(plan.pricing.yearly),
        monthlyRaw: plan.pricing.monthly,
        yearlyRaw: plan.pricing.yearly,
        currency: plan.pricing.currency,
        yearlySavingsPercent: getYearlySavingsPercent(plan.id),
      },
      limits: plan.limits,
      features: plan.features,
      popular: plan.popular || false,
    }));

    res.json({ plans });
  } catch (error) {
    logger.error(
      "Failed to get plans",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get plans" });
  }
});

/**
 * GET /api/billing/subscription
 * Get current subscription for organization
 */
router.get("/subscription", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const subscription = await getOrCreateSubscription(organizationId);

    res.json({
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          nameKo: subscription.plan.nameKo,
        },
        status: subscription.status,
        billingInterval: subscription.billingInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEnd: subscription.trialEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        hasStripeSubscription: !!subscription.stripeSubscriptionId,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get subscription",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get subscription" });
  }
});

/**
 * GET /api/billing/usage
 * Get current usage for organization
 */
router.get("/usage", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    // Sync count metrics first
    await syncCountMetrics(organizationId);

    const usage = await getCurrentUsage(organizationId);
    const limits = await limitEnforcer.getLimits(organizationId);

    res.json({
      usage,
      limits: limits.limits,
      percentages: limits.percentages,
      planId: limits.planId,
    });
  } catch (error) {
    logger.error(
      "Failed to get usage",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get usage" });
  }
});

/**
 * GET /api/billing/usage/history
 * Get usage history for organization
 */
router.get("/usage/history", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const months = parseInt(req.query.months as string) || 6;
    const history = await getHistory(organizationId, Math.min(months, 12));

    res.json({ history });
  } catch (error) {
    logger.error(
      "Failed to get usage history",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get usage history" });
  }
});

/**
 * POST /api/billing/change-plan
 * Change subscription plan (for non-Stripe managed subscriptions)
 */
const changePlanSchema = z.object({
  planId: z.enum(["free", "pro", "business", "enterprise"]),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
});

router.post("/change-plan", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const validation = changePlanSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: "Invalid request", details: validation.error.errors });
      return;
    }

    const { planId, billingInterval } = validation.data;

    const subscription = await changePlan(
      organizationId,
      planId as PlanId,
      billingInterval,
    );

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        status: subscription.status,
        billingInterval: subscription.billingInterval,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Stripe")) {
      res.status(400).json({
        error: "Stripe managed subscription",
        message: error.message,
      });
      return;
    }

    logger.error(
      "Failed to change plan",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to change plan" });
  }
});

/**
 * POST /api/billing/cancel
 * Cancel subscription
 */
const cancelSchema = z.object({
  immediately: z.boolean().optional().default(false),
});

router.post("/cancel", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const validation = cancelSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: "Invalid request", details: validation.error.errors });
      return;
    }

    const { immediately } = validation.data;

    const subscription = await cancelSubscription(organizationId, immediately);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Stripe")) {
      res.status(400).json({
        error: "Stripe managed subscription",
        message: error.message,
      });
      return;
    }

    logger.error(
      "Failed to cancel subscription",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * POST /api/billing/reactivate
 * Reactivate canceled subscription
 */
router.post("/reactivate", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const subscription = await reactivateSubscription(organizationId);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Stripe")) {
      res.status(400).json({
        error: "Stripe managed subscription",
        message: error.message,
      });
      return;
    }

    logger.error(
      "Failed to reactivate subscription",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to reactivate subscription" });
  }
});

/**
 * POST /api/billing/checkout
 * Create Stripe checkout session
 */
const checkoutSchema = z.object({
  planId: z.enum(["pro", "business"]),
  billingInterval: z.enum(["monthly", "yearly"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req as AuthenticatedRequest;

    if (!organizationId || !user?.email) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not configured" });
      return;
    }

    const validation = checkoutSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: "Invalid request", details: validation.error.errors });
      return;
    }

    const { planId, billingInterval, successUrl, cancelUrl } = validation.data;

    const session = await createCheckoutSession(
      organizationId,
      planId,
      billingInterval,
      user.email,
      successUrl,
      cancelUrl,
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error(
      "Failed to create checkout session",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

/**
 * POST /api/billing/portal
 * Create Stripe billing portal session
 */
router.post("/portal", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not configured" });
      return;
    }

    const returnUrl = req.body.returnUrl as string | undefined;

    const session = await createBillingPortalSession(organizationId, returnUrl);

    res.json({
      url: session.url,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No Stripe customer")) {
      res.status(400).json({
        error: "No billing history",
        message: "You don't have any billing history yet.",
      });
      return;
    }

    logger.error(
      "Failed to create portal session",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

/**
 * GET /api/billing/invoices
 * Get invoices for organization
 */
router.get("/invoices", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    // Sync invoices from Stripe first
    await syncInvoicesFromStripe(organizationId);

    const { invoices, total } = await getInvoicesForOrganization(
      organizationId,
      Math.min(limit, 50),
      offset,
    );

    res.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        amount: inv.amount,
        amountFormatted: formatPrice(inv.amount, inv.currency),
        currency: inv.currency,
        status: inv.status,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        paidAt: inv.paidAt,
        hostedInvoiceUrl: inv.hostedInvoiceUrl,
        invoicePdfUrl: inv.invoicePdfUrl,
        createdAt: inv.createdAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error(
      "Failed to get invoices",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get invoices" });
  }
});

/**
 * GET /api/billing/invoices/stats
 * Get invoice statistics
 */
router.get("/invoices/stats", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const stats = await getInvoiceStats(organizationId);

    res.json({
      totalPaid: stats.totalPaid,
      totalPaidFormatted: formatPrice(stats.totalPaid, stats.currency),
      totalPending: stats.totalPending,
      totalPendingFormatted: formatPrice(stats.totalPending, stats.currency),
      invoiceCount: stats.invoiceCount,
      currency: stats.currency,
    });
  } catch (error) {
    logger.error(
      "Failed to get invoice stats",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get invoice stats" });
  }
});

/**
 * GET /api/billing/invoices/upcoming
 * Get upcoming invoice preview
 */
router.get("/invoices/upcoming", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req as AuthenticatedRequest;

    if (!organizationId) {
      res.status(401).json({ error: "Organization not identified" });
      return;
    }

    const upcoming = await getUpcomingInvoicePreview(organizationId);

    if (!upcoming) {
      res.json({ upcoming: null });
      return;
    }

    res.json({
      upcoming: {
        amount: upcoming.amount,
        amountFormatted: formatPrice(upcoming.amount, upcoming.currency),
        currency: upcoming.currency,
        periodStart: upcoming.periodStart,
        periodEnd: upcoming.periodEnd,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get upcoming invoice",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Failed to get upcoming invoice" });
  }
});

export default router;
