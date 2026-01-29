/**
 * Limit Enforcement Service (Stub)
 *
 * TODO: Implement when billing tables are properly added to Prisma schema
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";
import { UsageMetric } from "./plans";

export class LimitExceededError extends Error {
  constructor(
    public readonly metric: UsageMetric,
    public readonly current: number,
    public readonly limit: number,
    public readonly planId: string,
  ) {
    super(`Limit exceeded for ${metric}: ${current}/${limit} on ${planId} plan`);
    this.name = "LimitExceededError";
  }
}

export class SubscriptionInactiveError extends Error {
  constructor(public readonly organizationId: string) {
    super(`Subscription is not active for organization ${organizationId}`);
    this.name = "SubscriptionInactiveError";
  }
}

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  message?: string;
}

export async function checkLimit(
  _organizationId: string,
  metric: UsageMetric,
  _increment?: number,
): Promise<LimitCheckResult> {
  logger.debug("checkLimit called (stub)", { metric });
  return {
    allowed: true,
    current: 0,
    limit: 999999,
    remaining: 999999,
    isUnlimited: true,
  };
}

export async function enforceLimit(
  _organizationId: string,
  metric: UsageMetric,
  _increment?: number,
): Promise<void> {
  logger.debug("enforceLimit called (stub)", { metric });
}

export async function getLimits(
  _organizationId: string,
): Promise<Record<UsageMetric, LimitCheckResult>> {
  logger.debug("getLimits called (stub)");
  const metrics: UsageMetric[] = [
    "agents",
    "workflows",
    "executions",
    "storage",
    "api_requests",
    "team_members",
    "extensions",
  ];

  const result: Record<string, LimitCheckResult> = {};
  for (const metric of metrics) {
    result[metric] = {
      allowed: true,
      current: 0,
      limit: 999999,
      remaining: 999999,
      isUnlimited: true,
    };
  }
  return result as Record<UsageMetric, LimitCheckResult>;
}

export function createLimitMiddleware(metric: UsageMetric, increment?: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = (req as { organizationId?: string }).organizationId;
      if (!organizationId) {
        return next();
      }

      await enforceLimit(organizationId, metric, increment);
      next();
    } catch (error) {
      if (error instanceof LimitExceededError) {
        return res.status(429).json({
          error: "Limit exceeded",
          metric: error.metric,
          current: error.current,
          limit: error.limit,
        });
      }
      if (error instanceof SubscriptionInactiveError) {
        return res.status(402).json({
          error: "Subscription inactive",
          message: "Please update your payment method",
        });
      }
      next(error);
    }
  };
}
