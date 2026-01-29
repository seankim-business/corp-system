/**
 * Limit Enforcement Service
 *
 * Enforces plan limits before actions are taken.
 * Integrates with usage tracking and subscription management.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";
import { getSubscription, isSubscriptionActive } from "./subscriptions";
import { getUsage, UsageMetric } from "./usage";
import { getLimit, getLimitKeyForMetric, PlanLimits } from "./plans";

export class LimitExceededError extends Error {
  constructor(
    public readonly metric: UsageMetric,
    public readonly current: number,
    public readonly limit: number,
    public readonly planId: string,
  ) {
    super(
      `Limit exceeded for ${metric}: ${current}/${limit} on ${planId} plan`,
    );
    this.name = "LimitExceededError";
  }
}

export class SubscriptionInactiveError extends Error {
  constructor(public readonly organizationId: string) {
    super(`Subscription is not active for organization ${organizationId}`);
    this.name = "SubscriptionInactiveError";
  }
}

/**
 * LimitEnforcer class for checking and enforcing plan limits
 */
export class LimitEnforcer {
  /**
   * Check if an action would exceed the limit
   */
  async checkLimit(
    orgId: string,
    metric: UsageMetric,
    amount: number = 1,
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
  }> {
    const subscription = await getSubscription(orgId);

    if (!subscription) {
      // No subscription means free plan limits
      const limit = getLimit("free", this.getLimitKey(metric));
      const current = await getUsage(orgId, metric);
      const remaining = limit === -1 ? Infinity : Math.max(0, limit - current);

      return {
        allowed: limit === -1 || current + amount <= limit,
        current,
        limit,
        remaining,
      };
    }

    // Check if subscription is active
    if (!isSubscriptionActive(subscription)) {
      return {
        allowed: false,
        current: await getUsage(orgId, metric),
        limit: 0,
        remaining: 0,
      };
    }

    // Check custom limits first (for enterprise)
    let limit: number;
    const limitKey = this.getLimitKey(metric);

    if (subscription.customLimits && limitKey in subscription.customLimits) {
      limit = subscription.customLimits[limitKey];
    } else {
      limit = getLimit(subscription.planId, limitKey);
    }

    const current = await getUsage(orgId, metric);
    const remaining = limit === -1 ? Infinity : Math.max(0, limit - current);

    return {
      allowed: limit === -1 || current + amount <= limit,
      current,
      limit,
      remaining,
    };
  }

  /**
   * Enforce a limit, throwing if exceeded
   */
  async enforceLimit(
    orgId: string,
    metric: UsageMetric,
    amount: number = 1,
  ): Promise<void> {
    const subscription = await getSubscription(orgId);
    const planId = subscription?.planId ?? "free";

    // Check subscription status
    if (subscription && !isSubscriptionActive(subscription)) {
      throw new SubscriptionInactiveError(orgId);
    }

    const { allowed, current, limit } = await this.checkLimit(
      orgId,
      metric,
      amount,
    );

    if (!allowed) {
      logger.warn("Limit exceeded", {
        organizationId: orgId,
        metric,
        current,
        limit,
        planId,
      });
      throw new LimitExceededError(metric, current, limit, planId);
    }
  }

  /**
   * Get all limits for an organization
   */
  async getLimits(orgId: string): Promise<{
    planId: string;
    limits: PlanLimits;
    usage: Record<UsageMetric, number>;
    percentages: Record<UsageMetric, number>;
  }> {
    const subscription = await getSubscription(orgId);
    const planId = subscription?.planId ?? "free";

    const metrics: UsageMetric[] = [
      "executions",
      "api_requests",
      "storage_bytes",
      "team_members",
      "agents",
      "workflows",
    ];

    const usage: Record<string, number> = {};
    const percentages: Record<string, number> = {};

    for (const metric of metrics) {
      const { current, limit } = await this.checkLimit(orgId, metric);
      usage[metric] = current;
      percentages[metric] = limit === -1 ? 0 : Math.min((current / limit) * 100, 100);
    }

    // Build limits object
    const limits: PlanLimits = {
      agents: subscription?.customLimits?.agents ?? getLimit(planId, "agents"),
      workflows:
        subscription?.customLimits?.workflows ?? getLimit(planId, "workflows"),
      executionsPerMonth:
        subscription?.customLimits?.executionsPerMonth ??
        getLimit(planId, "executionsPerMonth"),
      teamMembers:
        subscription?.customLimits?.teamMembers ??
        getLimit(planId, "teamMembers"),
      storageGb:
        subscription?.customLimits?.storageGb ?? getLimit(planId, "storageGb"),
      apiRequestsPerDay:
        subscription?.customLimits?.apiRequestsPerDay ??
        getLimit(planId, "apiRequestsPerDay"),
      extensions:
        subscription?.customLimits?.extensions ?? getLimit(planId, "extensions"),
    };

    return {
      planId,
      limits,
      usage: usage as Record<UsageMetric, number>,
      percentages: percentages as Record<UsageMetric, number>,
    };
  }

  /**
   * Express middleware for enforcing limits
   */
  limitMiddleware(metric: UsageMetric, amount: number = 1) {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const orgId = (req as Request & { organizationId?: string }).organizationId;

        if (!orgId) {
          res.status(401).json({ error: "Organization not identified" });
          return;
        }

        await this.enforceLimit(orgId, metric, amount);
        next();
      } catch (error) {
        if (error instanceof LimitExceededError) {
          res.status(429).json({
            error: "Limit exceeded",
            code: "LIMIT_EXCEEDED",
            metric: error.metric,
            current: error.current,
            limit: error.limit,
            planId: error.planId,
            message: `You have reached your ${error.metric} limit. Please upgrade your plan.`,
          });
          return;
        }

        if (error instanceof SubscriptionInactiveError) {
          res.status(402).json({
            error: "Subscription inactive",
            code: "SUBSCRIPTION_INACTIVE",
            message:
              "Your subscription is not active. Please update your payment method.",
          });
          return;
        }

        logger.error(
          "Error in limit middleware",
          { metric },
          error instanceof Error ? error : new Error(String(error)),
        );
        next(error);
      }
    };
  }

  /**
   * Convert usage metric to plan limit key
   */
  private getLimitKey(metric: UsageMetric): keyof PlanLimits {
    const key = getLimitKeyForMetric(metric);
    if (!key) {
      throw new Error(`Unknown metric: ${metric}`);
    }
    return key;
  }
}

// Singleton instance
export const limitEnforcer = new LimitEnforcer();

/**
 * Convenience function for checking limits
 */
export async function checkLimit(
  orgId: string,
  metric: UsageMetric,
  amount: number = 1,
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}> {
  return limitEnforcer.checkLimit(orgId, metric, amount);
}

/**
 * Convenience function for enforcing limits
 */
export async function enforceLimit(
  orgId: string,
  metric: UsageMetric,
  amount: number = 1,
): Promise<void> {
  return limitEnforcer.enforceLimit(orgId, metric, amount);
}

/**
 * Middleware factory for common limit checks
 */
export const limitMiddleware = {
  executions: (amount: number = 1) =>
    limitEnforcer.limitMiddleware("executions", amount),
  apiRequests: (amount: number = 1) =>
    limitEnforcer.limitMiddleware("api_requests", amount),
  agents: (amount: number = 1) =>
    limitEnforcer.limitMiddleware("agents", amount),
  workflows: (amount: number = 1) =>
    limitEnforcer.limitMiddleware("workflows", amount),
  teamMembers: (amount: number = 1) =>
    limitEnforcer.limitMiddleware("team_members", amount),
};
