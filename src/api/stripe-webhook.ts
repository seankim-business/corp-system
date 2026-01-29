/**
 * Stripe Webhook Handler
 *
 * Handles incoming webhook events from Stripe for payment processing.
 * This endpoint should be mounted separately without JSON body parsing.
 */

import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import {
  verifyWebhookSignature,
} from "../services/billing/stripe";
// TODO: Uncomment when subscription/invoice functionality is implemented
// import {
//   createInvoice,
//   updateInvoiceFromStripe,
//   getInvoiceByStripeId,
// } from "../services/billing/invoices";
import {
  updateSubscriptionFromStripe,
  linkStripeIds,
} from "../services/billing/subscriptions";
// TODO: Uncomment when subscription table is added to Prisma schema
// import { db as prisma } from "../db/client";

const router = Router();

// Stripe event types we handle
type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.created"
  | "invoice.finalized"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.payment_action_required"
  | "customer.created"
  | "customer.updated"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed";

interface StripeEvent {
  id: string;
  type: StripeEventType;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 *
 * IMPORTANT: This endpoint must receive raw body, not JSON parsed.
 * Mount this before express.json() middleware or use express.raw().
 */
router.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    logger.warn("Stripe webhook missing signature");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  // Get raw body
  const rawBody =
    typeof req.body === "string"
      ? req.body
      : req.body instanceof Buffer
        ? req.body.toString()
        : JSON.stringify(req.body);

  // Verify signature in production
  if (process.env.NODE_ENV === "production") {
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn("Stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }
  }

  let event: StripeEvent;

  try {
    event =
      typeof req.body === "string" || req.body instanceof Buffer
        ? JSON.parse(rawBody)
        : req.body;
  } catch (error) {
    logger.error(
      "Failed to parse Stripe webhook",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  logger.info("Received Stripe webhook", {
    type: event.type,
    eventId: event.id,
    livemode: event.livemode,
  });

  try {
    // Process event based on type
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.created":
      case "invoice.finalized":
        await handleInvoiceCreated(event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "invoice.payment_action_required":
        await handlePaymentActionRequired(event.data.object);
        break;

      default:
        logger.debug("Unhandled Stripe event type", { type: event.type });
    }

    // Acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    logger.error(
      "Failed to process Stripe webhook",
      { type: event.type, eventId: event.id },
      error instanceof Error ? error : new Error(String(error)),
    );

    // Still return 200 to prevent retries for processing errors
    // Stripe will retry on 4xx/5xx responses
    res.json({ received: true, error: "Processing error" });
  }
});

/**
 * Handle checkout.session.completed
 */
async function handleCheckoutCompleted(
  session: Record<string, unknown>,
): Promise<void> {
  const metadata = session.metadata as Record<string, string> | undefined;
  const organizationId = metadata?.organizationId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!organizationId) {
    logger.warn("Checkout session missing organizationId", {
      sessionId: session.id,
    });
    return;
  }

  if (customerId && subscriptionId) {
    await linkStripeIds(organizationId, customerId, subscriptionId);

    logger.info("Linked Stripe IDs from checkout", {
      organizationId,
      customerId,
      subscriptionId,
    });
  }
}

/**
 * Handle customer.subscription.created/updated
 */
async function handleSubscriptionUpdated(
  subscription: Record<string, unknown>,
): Promise<void> {
  const stripeSubscriptionId = subscription.id as string;
  const status = subscription.status as string;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end as boolean;
  const canceledAt = subscription.canceled_at as number | null;
  const trialEnd = subscription.trial_end as number | null;
  const currentPeriodStart = subscription.current_period_start as number;
  const currentPeriodEnd = subscription.current_period_end as number;

  const items = subscription.items as { data: Array<{ price: { id: string; recurring?: { interval: string } } }> };
  const priceId = items?.data?.[0]?.price?.id;
  const interval = items?.data?.[0]?.price?.recurring?.interval;

  // Map price ID to plan ID
  const planId = mapPriceIdToPlanId(priceId);
  const billingInterval = interval === "year" ? "yearly" : "monthly";

  await updateSubscriptionFromStripe(stripeSubscriptionId, {
    status: mapStripeStatus(status),
    planId,
    billingInterval: billingInterval as "monthly" | "yearly",
    currentPeriodStart: new Date(currentPeriodStart * 1000),
    currentPeriodEnd: new Date(currentPeriodEnd * 1000),
    cancelAtPeriodEnd,
    canceledAt: canceledAt ? new Date(canceledAt * 1000) : null,
    trialEnd: trialEnd ? new Date(trialEnd * 1000) : null,
  });

  logger.info("Updated subscription from Stripe webhook", {
    stripeSubscriptionId,
    status,
    planId,
  });
}

/**
 * Handle customer.subscription.deleted
 */
async function handleSubscriptionDeleted(
  subscription: Record<string, unknown>,
): Promise<void> {
  const stripeSubscriptionId = subscription.id as string;

  await updateSubscriptionFromStripe(stripeSubscriptionId, {
    status: "canceled",
    canceledAt: new Date(),
  });

  logger.info("Subscription deleted from Stripe webhook", {
    stripeSubscriptionId,
  });
}

/**
 * Handle invoice.created/finalized
 */
async function handleInvoiceCreated(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeInvoiceId = invoice.id as string;
  const customerId = invoice.customer as string;

  // TODO: Implement subscription table in Prisma schema to track Stripe subscriptions
  // Temporary: Log and return until subscription table is implemented
  logger.warn("Subscription table not yet implemented - skipping invoice creation", {
    stripeInvoiceId,
    customerId,
  });
  return;

  // TODO: Uncomment when subscription table is implemented
  // const amountDue = invoice.amount_due as number;
  // const currency = (invoice.currency as string).toUpperCase();
  // const status = invoice.status as string;
  // const periodStart = invoice.period_start as number;
  // const periodEnd = invoice.period_end as number;
  // const hostedInvoiceUrl = invoice.hosted_invoice_url as string | null;
  // const invoicePdf = invoice.invoice_pdf as string | null;
  //
  // // Find organization by Stripe customer ID
  // const subscription = await prisma.subscription.findUnique({
  //   where: { stripeCustomerId: customerId },
  // });
  //
  // if (!subscription) {
  //   logger.warn("No subscription found for Stripe customer", { customerId });
  //   return;
  // }

  // TODO: Uncomment when subscription table is implemented
  // Check if invoice already exists
  // const existingInvoice = await getInvoiceByStripeId(stripeInvoiceId);
  //
  // if (existingInvoice) {
  //   await updateInvoiceFromStripe(stripeInvoiceId, {
  //     status: mapInvoiceStatus(status),
  //     amount: amountDue,
  //     hostedInvoiceUrl,
  //     invoicePdfUrl: invoicePdf,
  //   });
  // } else {
  //   await createInvoice({
  //     organizationId: subscription.organizationId,
  //     stripeInvoiceId,
  //     subscriptionId: subscription.id,
  //     amount: amountDue,
  //     currency,
  //     status: mapInvoiceStatus(status),
  //     periodStart: new Date(periodStart * 1000),
  //     periodEnd: new Date(periodEnd * 1000),
  //     hostedInvoiceUrl: hostedInvoiceUrl || undefined,
  //     invoicePdfUrl: invoicePdf || undefined,
  //   });
  // }
  //
  // logger.info("Invoice created/updated from Stripe webhook", {
  //   stripeInvoiceId,
  //   organizationId: subscription.organizationId,
  // });
}

/**
 * Handle invoice.paid
 */
async function handleInvoicePaid(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeInvoiceId = invoice.id as string;

  // TODO: Implement subscription table in Prisma schema
  logger.warn("Subscription table not yet implemented - skipping invoice paid handling", {
    stripeInvoiceId,
  });
  return;

  // TODO: Uncomment when subscription table is implemented
  // const amountPaid = invoice.amount_paid as number;
  // const hostedInvoiceUrl = invoice.hosted_invoice_url as string | null;
  // const invoicePdf = invoice.invoice_pdf as string | null;
  //
  // await updateInvoiceFromStripe(stripeInvoiceId, {
  //   status: "paid",
  //   amount: amountPaid,
  //   paidAt: new Date(),
  //   hostedInvoiceUrl,
  //   invoicePdfUrl: invoicePdf,
  // });
  //
  // logger.info("Invoice paid from Stripe webhook", { stripeInvoiceId });
  //
  // // Could trigger email notification here
}

/**
 * Handle invoice.payment_failed
 */
async function handleInvoicePaymentFailed(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeInvoiceId = invoice.id as string;
  const customerId = invoice.customer as string;

  // TODO: Implement subscription table in Prisma schema
  logger.warn("Subscription table not yet implemented - skipping invoice payment failed handling", {
    stripeInvoiceId,
    customerId,
  });
  return;

  // TODO: Uncomment when subscription table is implemented
  // await updateInvoiceFromStripe(stripeInvoiceId, {
  //   status: "open",
  // });
  //
  // // Find organization to send notification
  // const subscription = await prisma.subscription.findUnique({
  //   where: { stripeCustomerId: customerId },
  // });
  //
  // if (subscription) {
  //   // Update subscription status to past_due
  //   await updateSubscriptionFromStripe(subscription.stripeSubscriptionId!, {
  //     status: "past_due",
  //   });
  //
  //   logger.warn("Invoice payment failed", {
  //     stripeInvoiceId,
  //     organizationId: subscription.organizationId,
  //   });
  //
  //   // Could trigger email notification here
  // }
}

/**
 * Handle invoice.payment_action_required
 */
async function handlePaymentActionRequired(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeInvoiceId = invoice.id as string;
  const customerId = invoice.customer as string;

  // TODO: Implement subscription table in Prisma schema
  logger.warn("Subscription table not yet implemented - skipping payment action required handling", {
    stripeInvoiceId,
    customerId,
  });
  return;

  // TODO: Uncomment when subscription table is implemented
  // const subscription = await prisma.subscription.findUnique({
  //   where: { stripeCustomerId: customerId },
  // });
  //
  // if (subscription) {
  //   logger.warn("Payment action required", {
  //     stripeInvoiceId,
  //     organizationId: subscription.organizationId,
  //   });
  //
  //   // Could trigger email notification here
  // }
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus: string): string {
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    trialing: "trialing",
    paused: "paused",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    unpaid: "past_due",
  };

  return statusMap[stripeStatus] || "active";
}

/**
 * Map Stripe invoice status to our status
 * TODO: Will be used when subscription table is implemented
 */
// function mapInvoiceStatus(
//   stripeStatus: string,
// ): "draft" | "open" | "paid" | "void" | "uncollectible" {
//   const statusMap: Record<string, "draft" | "open" | "paid" | "void" | "uncollectible"> = {
//     draft: "draft",
//     open: "open",
//     paid: "paid",
//     void: "void",
//     uncollectible: "uncollectible",
//   };
//
//   return statusMap[stripeStatus] || "draft";
// }

/**
 * Map Stripe price ID to plan ID
 */
function mapPriceIdToPlanId(priceId: string | undefined): string {
  if (!priceId) return "free";

  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID || ""]: "pro",
    [process.env.STRIPE_PRO_YEARLY_PRICE_ID || ""]: "pro",
    [process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || ""]: "business",
    [process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || ""]: "business",
  };

  return priceMap[priceId] || "free";
}

export default router;
