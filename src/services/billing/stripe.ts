/**
 * Stripe Integration Service
 *
 * Handles Stripe payment processing, customer management,
 * and subscription lifecycle operations.
 */

import { logger } from "../../utils/logger";
import { getPlan, PlanId } from "./plans";
import {
  linkStripeIds,
  updateSubscriptionFromStripe,
  getSubscription,
} from "./subscriptions";

// Stripe types (minimal definitions to avoid requiring stripe package)
interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, string>;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_end: number | null;
  items: {
    data: Array<{
      price: {
        id: string;
        recurring: {
          interval: "month" | "year";
        } | null;
      };
    }>;
  };
}

interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string;
  subscription: string | null;
}

interface StripeBillingPortalSession {
  id: string;
  url: string;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created: number;
  period_start: number;
  period_end: number;
}

// Environment configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY;
}

/**
 * Make a Stripe API request
 */
async function stripeRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }

  const { method = "GET", body } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const requestOptions: RequestInit = {
    method,
    headers,
  };

  if (body && method !== "GET") {
    requestOptions.body = new URLSearchParams(
      flattenObject(body) as Record<string, string>,
    ).toString();
  }

  const response = await fetch(
    `https://api.stripe.com/v1${endpoint}`,
    requestOptions,
  );

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    logger.error("Stripe API error", { endpoint, error: errorData });
    throw new Error(errorData.error?.message || "Stripe API error");
  }

  return response.json() as Promise<T>;
}

/**
 * Flatten nested object for URL encoding
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, newKey),
      );
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object") {
          Object.assign(
            result,
            flattenObject(item as Record<string, unknown>, `${newKey}[${index}]`),
          );
        } else {
          result[`${newKey}[${index}]`] = String(item);
        }
      });
    } else {
      result[newKey] = String(value);
    }
  }

  return result;
}

/**
 * Create or retrieve a Stripe customer
 */
export async function getOrCreateCustomer(
  orgId: string,
  email: string,
  name?: string,
): Promise<StripeCustomer> {
  // Check if we already have a customer ID
  const subscription = await getSubscription(orgId);
  if (subscription?.stripeCustomerId) {
    try {
      const customer = await stripeRequest<StripeCustomer>(
        `/customers/${subscription.stripeCustomerId}`,
      );
      return customer;
    } catch {
      // Customer might have been deleted, create new one
      logger.warn("Stripe customer not found, creating new one", {
        organizationId: orgId,
      });
    }
  }

  // Create new customer
  const customer = await stripeRequest<StripeCustomer>("/customers", {
    method: "POST",
    body: {
      email,
      name: name || undefined,
      metadata: {
        organizationId: orgId,
      },
    },
  });

  logger.info("Created Stripe customer", {
    organizationId: orgId,
    customerId: customer.id,
  });

  return customer;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  orgId: string,
  planId: PlanId,
  billingInterval: "monthly" | "yearly",
  email: string,
  successUrl?: string,
  cancelUrl?: string,
): Promise<StripeCheckoutSession> {
  const plan = getPlan(planId);
  const priceId =
    billingInterval === "yearly"
      ? plan.stripePriceId.yearly
      : plan.stripePriceId.monthly;

  if (!priceId) {
    throw new Error(`No Stripe price ID configured for ${planId} ${billingInterval}`);
  }

  // Get or create customer
  const customer = await getOrCreateCustomer(orgId, email);

  const session = await stripeRequest<StripeCheckoutSession>(
    "/checkout/sessions",
    {
      method: "POST",
      body: {
        customer: customer.id,
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl || `${APP_URL}/billing?success=true`,
        cancel_url: cancelUrl || `${APP_URL}/billing?canceled=true`,
        metadata: {
          organizationId: orgId,
          planId,
        },
        subscription_data: {
          metadata: {
            organizationId: orgId,
            planId,
          },
        },
      },
    },
  );

  logger.info("Created checkout session", {
    organizationId: orgId,
    sessionId: session.id,
    planId,
  });

  return session;
}

/**
 * Create a billing portal session
 */
export async function createBillingPortalSession(
  orgId: string,
  returnUrl?: string,
): Promise<StripeBillingPortalSession> {
  const subscription = await getSubscription(orgId);

  if (!subscription?.stripeCustomerId) {
    throw new Error("No Stripe customer found for this organization");
  }

  const session = await stripeRequest<StripeBillingPortalSession>(
    "/billing_portal/sessions",
    {
      method: "POST",
      body: {
        customer: subscription.stripeCustomerId,
        return_url: returnUrl || `${APP_URL}/billing`,
      },
    },
  );

  logger.info("Created billing portal session", {
    organizationId: orgId,
    sessionId: session.id,
  });

  return session;
}

/**
 * Get subscription from Stripe
 */
export async function getStripeSubscription(
  stripeSubscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/subscriptions/${stripeSubscriptionId}`,
  );
}

/**
 * Cancel a Stripe subscription
 */
export async function cancelStripeSubscription(
  stripeSubscriptionId: string,
  immediately: boolean = false,
): Promise<StripeSubscription> {
  if (immediately) {
    return stripeRequest<StripeSubscription>(
      `/subscriptions/${stripeSubscriptionId}`,
      {
        method: "DELETE",
      },
    );
  }

  return stripeRequest<StripeSubscription>(
    `/subscriptions/${stripeSubscriptionId}`,
    {
      method: "POST",
      body: {
        cancel_at_period_end: true,
      },
    },
  );
}

/**
 * Reactivate a canceled Stripe subscription
 */
export async function reactivateStripeSubscription(
  stripeSubscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/subscriptions/${stripeSubscriptionId}`,
    {
      method: "POST",
      body: {
        cancel_at_period_end: false,
      },
    },
  );
}

/**
 * Get invoices for a customer
 */
export async function getInvoices(
  stripeCustomerId: string,
  limit: number = 10,
): Promise<{ data: StripeInvoice[] }> {
  return stripeRequest<{ data: StripeInvoice[] }>(
    `/invoices?customer=${stripeCustomerId}&limit=${limit}`,
  );
}

/**
 * Get upcoming invoice
 */
export async function getUpcomingInvoice(
  stripeCustomerId: string,
): Promise<StripeInvoice | null> {
  try {
    return await stripeRequest<StripeInvoice>(
      `/invoices/upcoming?customer=${stripeCustomerId}`,
    );
  } catch {
    return null;
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
): boolean {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn("Stripe webhook secret not configured");
    return false;
  }

  // Simple signature verification
  // In production, use Stripe's official SDK for proper verification
  const crypto = require("crypto");
  const elements = signature.split(",");
  const signatureMap: Record<string, string> = {};

  for (const element of elements) {
    const [key, value] = element.split("=");
    signatureMap[key] = value;
  }

  const timestamp = signatureMap["t"];
  const expectedSignature = signatureMap["v1"];

  if (!timestamp || !expectedSignature) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const computedSignature = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(computedSignature),
  );
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  const { type, data } = event;

  logger.info("Processing Stripe webhook", { type });

  switch (type) {
    case "checkout.session.completed": {
      const session = data.object as unknown as StripeCheckoutSession;
      const orgId = (session as unknown as { metadata: { organizationId: string } })
        .metadata?.organizationId;

      if (orgId && session.customer && session.subscription) {
        await linkStripeIds(
          orgId,
          session.customer,
          session.subscription,
        );
        logger.info("Linked Stripe IDs after checkout", {
          organizationId: orgId,
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = data.object as unknown as StripeSubscription;
      await syncSubscriptionFromStripe(subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = data.object as unknown as StripeSubscription;
      await updateSubscriptionFromStripe(subscription.id, {
        status: "canceled",
        canceledAt: new Date(),
      });
      break;
    }

    case "invoice.paid": {
      const invoice = data.object as unknown as StripeInvoice;
      logger.info("Invoice paid", {
        invoiceId: invoice.id,
        customerId: invoice.customer,
      });
      // Could trigger email notification here
      break;
    }

    case "invoice.payment_failed": {
      const invoice = data.object as unknown as StripeInvoice;
      logger.warn("Invoice payment failed", {
        invoiceId: invoice.id,
        customerId: invoice.customer,
      });
      // Could trigger email notification here
      break;
    }

    default:
      logger.debug("Unhandled webhook event", { type });
  }
}

/**
 * Sync subscription data from Stripe
 */
async function syncSubscriptionFromStripe(
  stripeSubscription: StripeSubscription,
): Promise<void> {
  const priceId = stripeSubscription.items.data[0]?.price.id;
  const interval = stripeSubscription.items.data[0]?.price.recurring?.interval;

  // Map price ID to plan ID
  const planId = mapPriceIdToPlanId(priceId);

  await updateSubscriptionFromStripe(stripeSubscription.id, {
    status: mapStripeStatus(stripeSubscription.status),
    planId,
    billingInterval: interval === "year" ? "yearly" : "monthly",
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    canceledAt: stripeSubscription.canceled_at
      ? new Date(stripeSubscription.canceled_at * 1000)
      : null,
    trialEnd: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
  });
}

/**
 * Map Stripe price ID to plan ID
 */
function mapPriceIdToPlanId(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID || ""]: "pro",
    [process.env.STRIPE_PRO_YEARLY_PRICE_ID || ""]: "pro",
    [process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || ""]: "business",
    [process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || ""]: "business",
  };

  return priceMap[priceId] || "free";
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
