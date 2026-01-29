/**
 * Subscription Management Service
 *
 * Manages organization subscriptions, plan changes, and cancellations.
 * Integrates with Stripe for payment processing.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { getPlan, Plan, PlanId } from "./plans";

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

function mapDbSubscription(dbSub: {
  id: string;
  organizationId: string;
  planId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: string;
  billingInterval: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  customLimits: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Subscription {
  return {
    id: dbSub.id,
    organizationId: dbSub.organizationId,
    planId: dbSub.planId,
    stripeSubscriptionId: dbSub.stripeSubscriptionId,
    stripeCustomerId: dbSub.stripeCustomerId,
    status: dbSub.status as SubscriptionStatus,
    billingInterval: dbSub.billingInterval as "monthly" | "yearly",
    currentPeriodStart: dbSub.currentPeriodStart,
    currentPeriodEnd: dbSub.currentPeriodEnd,
    trialStart: dbSub.trialStart,
    trialEnd: dbSub.trialEnd,
    cancelAtPeriodEnd: dbSub.cancelAtPeriodEnd,
    canceledAt: dbSub.canceledAt,
    customLimits: dbSub.customLimits as Record<string, number> | null,
    createdAt: dbSub.createdAt,
    updatedAt: dbSub.updatedAt,
  };
}

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "paused";

export interface CreateSubscriptionParams {
  organizationId: string;
  planId: PlanId;
  billingInterval: "monthly" | "yearly";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialDays?: number;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan;
}

/**
 * Get subscription for an organization
 */
export async function getSubscription(
  orgId: string,
): Promise<SubscriptionWithPlan | null> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });

    if (!subscription) {
      return null;
    }

    return {
      ...mapDbSubscription(subscription),
      plan: getPlan(subscription.planId),
    };
  } catch (error) {
    logger.error(
      "Failed to get subscription",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Get or create a free subscription for new organizations
 */
export async function getOrCreateSubscription(
  orgId: string,
): Promise<SubscriptionWithPlan> {
  let subscription = await getSubscription(orgId);

  if (!subscription) {
    // Create a free subscription
    subscription = await createSubscription({
      organizationId: orgId,
      planId: "free",
      billingInterval: "monthly",
    });
  }

  return subscription;
}

/**
 * Create a new subscription
 */
export async function createSubscription(
  params: CreateSubscriptionParams,
): Promise<SubscriptionWithPlan> {
  const now = new Date();
  const periodEnd = new Date(now);

  if (params.billingInterval === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  let trialEnd: Date | null = null;
  if (params.trialDays && params.trialDays > 0) {
    trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + params.trialDays);
  }

  try {
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: params.organizationId,
        planId: params.planId,
        billingInterval: params.billingInterval,
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
        status: trialEnd ? "trialing" : "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEnd,
      },
    });

    logger.info("Created subscription", {
      organizationId: params.organizationId,
      planId: params.planId,
      subscriptionId: subscription.id,
    });

    return {
      ...mapDbSubscription(subscription),
      plan: getPlan(subscription.planId),
    };
  } catch (error) {
    logger.error(
      "Failed to create subscription",
      { organizationId: params.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Update subscription from Stripe webhook
 */
export async function updateSubscriptionFromStripe(
  stripeSubscriptionId: string,
  data: {
    status?: string;
    planId?: string;
    billingInterval?: "monthly" | "yearly";
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
    trialEnd?: Date | null;
  },
): Promise<Subscription | null> {
  try {
    const subscription = await prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.planId && { planId: data.planId }),
        ...(data.billingInterval && { billingInterval: data.billingInterval }),
        ...(data.currentPeriodStart && { currentPeriodStart: data.currentPeriodStart }),
        ...(data.currentPeriodEnd && { currentPeriodEnd: data.currentPeriodEnd }),
        ...(data.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: data.cancelAtPeriodEnd }),
        ...(data.canceledAt !== undefined && { canceledAt: data.canceledAt }),
        ...(data.trialEnd !== undefined && { trialEnd: data.trialEnd }),
      },
    });

    logger.info("Updated subscription from Stripe", {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
    });

    return mapDbSubscription(subscription);
  } catch (error) {
    logger.error(
      "Failed to update subscription from Stripe",
      { stripeSubscriptionId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Change plan for an organization
 */
export async function changePlan(
  orgId: string,
  newPlanId: PlanId,
  billingInterval?: "monthly" | "yearly",
): Promise<Subscription> {
  const subscription = await getSubscription(orgId);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  // For Stripe-managed subscriptions, this should be done via Stripe
  if (subscription.stripeSubscriptionId) {
    throw new Error(
      "Use Stripe portal to change plan for Stripe-managed subscriptions",
    );
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      planId: newPlanId,
      ...(billingInterval && { billingInterval }),
    },
  });

  logger.info("Changed plan", {
    organizationId: orgId,
    oldPlanId: subscription.planId,
    newPlanId,
  });

  return {
    ...updated,
    billingInterval: updated.billingInterval as "monthly" | "yearly",
    status: updated.status as SubscriptionStatus,
    customLimits: updated.customLimits as Record<string, number> | null,
  };
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  orgId: string,
  immediately: boolean = false,
): Promise<Subscription> {
  const subscription = await getSubscription(orgId);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  // For Stripe-managed subscriptions, this should be done via Stripe
  if (subscription.stripeSubscriptionId) {
    throw new Error(
      "Use Stripe portal to cancel Stripe-managed subscriptions",
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    cancelAtPeriodEnd: !immediately,
    canceledAt: now,
  };

  if (immediately) {
    updateData.status = "canceled";
    updateData.planId = "free"; // Downgrade to free
    updateData.currentPeriodEnd = now;
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: orgId },
    data: updateData,
  });

  logger.info("Canceled subscription", {
    organizationId: orgId,
    immediately,
  });

  return {
    ...updated,
    billingInterval: updated.billingInterval as "monthly" | "yearly",
    status: updated.status as SubscriptionStatus,
    customLimits: updated.customLimits as Record<string, number> | null,
  };
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(
  orgId: string,
): Promise<Subscription> {
  const subscription = await getSubscription(orgId);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  if (!subscription.cancelAtPeriodEnd && subscription.status !== "canceled") {
    throw new Error("Subscription is not canceled");
  }

  // For Stripe-managed subscriptions, this should be done via Stripe
  if (subscription.stripeSubscriptionId) {
    throw new Error(
      "Use Stripe portal to reactivate Stripe-managed subscriptions",
    );
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      status: "active",
    },
  });

  logger.info("Reactivated subscription", { organizationId: orgId });

  return {
    ...updated,
    billingInterval: updated.billingInterval as "monthly" | "yearly",
    status: updated.status as SubscriptionStatus,
    customLimits: updated.customLimits as Record<string, number> | null,
  };
}

/**
 * Set custom limits for enterprise subscriptions
 */
export async function setCustomLimits(
  orgId: string,
  limits: Record<string, number>,
): Promise<Subscription> {
  const subscription = await getSubscription(orgId);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  if (subscription.planId !== "enterprise") {
    throw new Error("Custom limits are only available for enterprise plans");
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      customLimits: limits,
    },
  });

  logger.info("Set custom limits", {
    organizationId: orgId,
    limits,
  });

  return {
    ...updated,
    billingInterval: updated.billingInterval as "monthly" | "yearly",
    status: updated.status as SubscriptionStatus,
    customLimits: updated.customLimits as Record<string, number> | null,
  };
}

/**
 * Link Stripe customer and subscription IDs
 */
export async function linkStripeIds(
  orgId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
): Promise<Subscription> {
  const updated = await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      stripeCustomerId,
      stripeSubscriptionId,
    },
  });

  logger.info("Linked Stripe IDs", {
    organizationId: orgId,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  return {
    ...updated,
    billingInterval: updated.billingInterval as "monthly" | "yearly",
    status: updated.status as SubscriptionStatus,
    customLimits: updated.customLimits as Record<string, number> | null,
  };
}

/**
 * Check if subscription is active (including trialing)
 */
export function isSubscriptionActive(subscription: Subscription): boolean {
  return (
    subscription.status === "active" ||
    subscription.status === "trialing"
  );
}

/**
 * Check if subscription is in trial period
 */
export function isInTrial(subscription: Subscription): boolean {
  if (subscription.status !== "trialing" || !subscription.trialEnd) {
    return false;
  }
  return new Date() < subscription.trialEnd;
}

/**
 * Get days remaining in current period
 */
export function getDaysRemaining(subscription: Subscription): number {
  if (!subscription.currentPeriodEnd) {
    return 0;
  }
  const now = new Date();
  const end = new Date(subscription.currentPeriodEnd);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
