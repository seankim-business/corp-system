/**
 * Stripe Integration Service (Stub)
 *
 * NOTE: Requires Stripe API keys and configuration (see .env.example)
 */

import { logger } from "../../utils/logger";
import { Subscription, SubscriptionStatus } from "./subscriptions";

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
}

interface StripeInvoice {
  id: string;
  customer: string;
  amount_due: number;
  currency: string;
  status: string;
  period_start: number;
  period_end: number;
  paid: boolean;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export async function createCustomer(
  _organizationId: string,
  _email: string,
  _name?: string,
): Promise<StripeCustomer | null> {
  logger.warn("createCustomer called (stub) - Stripe not configured");
  return null;
}

export async function getCustomer(_customerId: string): Promise<StripeCustomer | null> {
  logger.debug("getCustomer called (stub)");
  return null;
}

export async function createSubscription(
  _customerId: string,
  _priceId: string,
  _trialDays?: number,
): Promise<StripeSubscription | null> {
  logger.warn("createSubscription called (stub) - Stripe not configured");
  return null;
}

export async function updateSubscription(
  _subscriptionId: string,
  _updates: { priceId?: string; cancelAtPeriodEnd?: boolean },
): Promise<StripeSubscription | null> {
  logger.warn("updateSubscription called (stub)");
  return null;
}

export async function cancelSubscription(
  _subscriptionId: string,
  _cancelAtPeriodEnd?: boolean,
): Promise<StripeSubscription | null> {
  logger.warn("cancelSubscription called (stub)");
  return null;
}

export async function reactivateSubscription(
  _subscriptionId: string,
): Promise<StripeSubscription | null> {
  logger.warn("reactivateSubscription called (stub)");
  return null;
}

export async function getInvoices(
  _customerId: string,
  _limit?: number,
): Promise<StripeInvoice[]> {
  logger.debug("getInvoices called (stub)");
  return [];
}

export async function getUpcomingInvoice(_customerId: string): Promise<StripeInvoice | null> {
  logger.debug("getUpcomingInvoice called (stub)");
  return null;
}

export async function createPortalSession(
  _customerId: string,
  _returnUrl: string,
): Promise<string | null> {
  logger.warn("createPortalSession called (stub)");
  return null;
}

export async function createCheckoutSession(
  _customerId: string,
  _priceId: string,
  _successUrl: string,
  _cancelUrl: string,
): Promise<string | null> {
  logger.warn("createCheckoutSession called (stub)");
  return null;
}

export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const mapping: Record<string, SubscriptionStatus> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    paused: "paused",
  };
  return mapping[stripeStatus] || "active";
}

export async function handleWebhookEvent(
  _eventType: string,
  _eventData: unknown,
): Promise<void> {
  logger.debug("handleWebhookEvent called (stub)");
}

export function verifyWebhookSignature(
  _payload: string | Buffer,
  _signature: string,
  _secret: string,
): unknown {
  logger.warn("verifyWebhookSignature called (stub) - Stripe not configured");
  return null;
}

export function linkStripeIds(
  _organizationId: string,
  _customerId: string,
  _subscriptionId: string,
): Promise<void> {
  logger.debug("linkStripeIds called (stub)");
  return Promise.resolve();
}

export function updateSubscriptionFromStripe(
  _organizationId: string,
  _stripeSubscription: StripeSubscription,
): Promise<Subscription | null> {
  logger.debug("updateSubscriptionFromStripe called (stub)");
  return Promise.resolve(null);
}
