/**
 * Subscription Management Service (Stub)
 *
 * NOTE: Requires billing tables in Prisma schema (Subscription, Plan, etc.)
 */

import { logger } from "../../utils/logger";

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: SubscriptionStatus;
  billingInterval: "monthly" | "yearly";
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  customLimits: Record<string, number> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export async function getSubscription(_organizationId: string): Promise<Subscription | null> {
  logger.debug("getSubscription called (stub)");
  return null;
}

export async function getOrCreateSubscription(organizationId: string): Promise<Subscription> {
  logger.debug("getOrCreateSubscription called (stub)");
  return createDefaultSubscription(organizationId);
}

export async function updateSubscription(
  _organizationId: string,
  _updates: Partial<Subscription>,
): Promise<Subscription | null> {
  logger.warn("updateSubscription called (stub) - update not persisted");
  return null;
}

export async function cancelSubscription(
  _organizationId: string,
  _cancelAtPeriodEnd?: boolean,
): Promise<Subscription | null> {
  logger.warn("cancelSubscription called (stub)");
  return null;
}

export async function reactivateSubscription(_organizationId: string): Promise<Subscription | null> {
  logger.warn("reactivateSubscription called (stub)");
  return null;
}

export async function changePlan(
  organizationId: string,
  _newPlanId: string,
  _billingInterval?: "monthly" | "yearly",
): Promise<Subscription> {
  logger.warn("changePlan called (stub)");
  return createDefaultSubscription(organizationId);
}

export async function createTrialSubscription(
  organizationId: string,
  _planId?: string,
  _trialDays?: number,
): Promise<Subscription> {
  logger.warn("createTrialSubscription called (stub)");
  return createDefaultSubscription(organizationId, "trialing");
}

export function isSubscriptionActive(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  return ["trialing", "active"].includes(subscription.status);
}

export function getEffectiveLimit(
  _subscription: Subscription | null,
  _limitName: string,
  _defaultValue: number,
): number {
  return 0;
}

export async function linkStripeIds(
  _organizationId: string,
  _customerId: string,
  _subscriptionId: string,
): Promise<void> {
  logger.debug("linkStripeIds called (stub)");
}

export async function updateSubscriptionFromStripe(
  _organizationId: string,
  _stripeData: unknown,
): Promise<Subscription | null> {
  logger.debug("updateSubscriptionFromStripe called (stub)");
  return null;
}

function createDefaultSubscription(organizationId: string, status: SubscriptionStatus = "active"): Subscription {
  const now = new Date();
  return {
    id: `stub-${Date.now()}`,
    organizationId,
    planId: "free",
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status,
    billingInterval: "monthly",
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    customLimits: null,
    createdAt: now,
    updatedAt: now,
  };
}
