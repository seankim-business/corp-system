/**
 * Usage Tracking Service (Stub)
 *
 * TODO: Implement when usage tables are properly added to Prisma schema
 */

import { logger } from "../../utils/logger";

export interface UsageMetric {
  metric: string;
  value: number;
  period: string;
  organizationId: string;
  updatedAt: Date;
}

export interface UsageSummary {
  organizationId: string;
  period: string;
  metrics: Record<string, number>;
  totalCost: number;
}

export async function trackUsage(
  _organizationId: string,
  _metric: string,
  _value: number,
  _period?: string,
): Promise<void> {
  logger.debug("trackUsage called (stub)");
}

export async function incrementUsage(
  _organizationId: string,
  _metric: string,
  _amount?: number,
): Promise<number> {
  logger.debug("incrementUsage called (stub)");
  return 0;
}

export async function getUsage(
  _organizationId: string,
  _metric: string,
  _period?: string,
): Promise<number> {
  logger.debug("getUsage called (stub)");
  return 0;
}

export async function getUsageSummary(
  _organizationId: string,
  _period?: string,
): Promise<UsageSummary> {
  logger.debug("getUsageSummary called (stub)");
  return {
    organizationId: _organizationId,
    period: _period || new Date().toISOString().slice(0, 7),
    metrics: {},
    totalCost: 0,
  };
}

export async function getUsageHistory(
  _organizationId: string,
  _metric?: string,
  _startDate?: Date,
  _endDate?: Date,
): Promise<UsageMetric[]> {
  logger.debug("getUsageHistory called (stub)");
  return [];
}

export async function resetUsage(
  _organizationId: string,
  _metric?: string,
): Promise<void> {
  logger.debug("resetUsage called (stub)");
}

export function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}
