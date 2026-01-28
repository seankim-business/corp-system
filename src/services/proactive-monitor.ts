import Redis from "ioredis";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { db as prisma } from "../db/client";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType =
  | "deadline_risk"
  | "blocker_detected"
  | "budget_warning"
  | "performance_degradation"
  | "task_overdue"
  | "approval_pending"
  | "integration_failure";

export interface ProactiveAlert {
  id: string;
  organizationId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  suggestedActions: string[];
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

interface MonitorConfig {
  enabled: boolean;
  checkIntervalMs: number;
  deadlineWarningHours: number;
  budgetWarningThreshold: number;
  overdueTaskThresholdHours: number;
  approvalPendingThresholdHours: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  enabled: true,
  checkIntervalMs: 5 * 60 * 1000,
  deadlineWarningHours: 24,
  budgetWarningThreshold: 0.2,
  overdueTaskThresholdHours: 4,
  approvalPendingThresholdHours: 8,
};

const ALERT_CACHE_PREFIX = "proactive_alert:";
const ALERT_CACHE_TTL = 3600;

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let config: MonitorConfig = DEFAULT_CONFIG;

export function configureMonitor(customConfig: Partial<MonitorConfig>): void {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  logger.info("Proactive monitor configured", { config });
}

export async function startMonitor(): Promise<void> {
  if (!config.enabled) {
    logger.info("Proactive monitor is disabled");
    return;
  }

  if (monitorInterval) {
    logger.warn("Proactive monitor already running");
    return;
  }

  logger.info("Starting proactive monitor", { intervalMs: config.checkIntervalMs });

  await runMonitorChecks();

  monitorInterval = setInterval(runMonitorChecks, config.checkIntervalMs);
}

export function stopMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("Proactive monitor stopped");
  }
}

async function runMonitorChecks(): Promise<void> {
  logger.debug("Running proactive monitor checks");

  try {
    const organizations = await getActiveOrganizations();

    const checkPromises = organizations.map(async (orgId) => {
      const alerts = await Promise.all([
        checkBudgetWarnings(orgId),
        checkOverdueTasks(orgId),
        checkPendingApprovals(orgId),
        checkIntegrationHealth(orgId),
      ]);

      const flatAlerts = alerts.flat().filter(Boolean) as ProactiveAlert[];

      for (const alert of flatAlerts) {
        await processAlert(alert);
      }

      return flatAlerts.length;
    });

    const alertCounts = await Promise.all(checkPromises);
    const totalAlerts = alertCounts.reduce((sum, count) => sum + count, 0);

    if (totalAlerts > 0) {
      logger.info("Proactive monitor completed", {
        organizationsChecked: organizations.length,
        alertsGenerated: totalAlerts,
      });
    }

    metrics.increment("proactive_monitor.checks_completed");
  } catch (error) {
    logger.error(
      "Proactive monitor check failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    metrics.increment("proactive_monitor.check_errors");
  }
}

async function getActiveOrganizations(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });
  return orgs.map((org: { id: string }) => org.id);
}

async function checkBudgetWarnings(organizationId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      monthlyBudgetCents: true,
      currentMonthSpendCents: true,
    },
  });

  if (!org) return alerts;

  const budgetCents = org.monthlyBudgetCents || 0;
  const spentCents = org.currentMonthSpendCents || 0;

  if (budgetCents > 0) {
    const remainingRatio = (budgetCents - spentCents) / budgetCents;

    if (remainingRatio <= config.budgetWarningThreshold) {
      const severity: AlertSeverity = remainingRatio <= 0.05 ? "critical" : "warning";
      const percentRemaining = Math.round(remainingRatio * 100);

      alerts.push({
        id: generateAlertId(),
        organizationId,
        type: "budget_warning",
        severity,
        title: `Budget running low for "${org.name}"`,
        description: `Only ${percentRemaining}% of AI budget remaining`,
        metadata: {
          budgetCents,
          spentCents,
          remainingCents: budgetCents - spentCents,
          percentRemaining,
        },
        suggestedActions: [
          "Review recent AI usage patterns",
          "Consider increasing budget allocation",
          "Optimize high-cost workflows",
        ],
        createdAt: new Date(),
      });
    }
  }

  return alerts;
}

async function checkOverdueTasks(organizationId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  const overdueThreshold = new Date();
  overdueThreshold.setHours(overdueThreshold.getHours() - config.overdueTaskThresholdHours);

  const overdueTasks = await prisma.task.findMany({
    where: {
      organizationId,
      status: { not: "5_Done" },
      dueDate: { lt: new Date() },
    },
    select: {
      id: true,
      name: true,
      dueDate: true,
      status: true,
    },
    take: 10,
  });

  if (overdueTasks.length > 0) {
    alerts.push({
      id: generateAlertId(),
      organizationId,
      type: "task_overdue",
      severity: overdueTasks.length > 5 ? "critical" : "warning",
      title: `${overdueTasks.length} overdue task(s) detected`,
      description: `Tasks past their due date`,
      metadata: {
        count: overdueTasks.length,
        tasks: overdueTasks.map(
          (t: { id: string; name: string; dueDate: Date | null; status: string }) => ({
            id: t.id,
            name: t.name,
            dueDate: t.dueDate,
            status: t.status,
          }),
        ),
      },
      suggestedActions: [
        "Review overdue tasks",
        "Update due dates if needed",
        "Assign additional resources",
      ],
      createdAt: new Date(),
    });
  }

  return alerts;
}

async function checkPendingApprovals(organizationId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  const approvalThreshold = new Date();
  approvalThreshold.setHours(approvalThreshold.getHours() - config.approvalPendingThresholdHours);

  const pendingApprovals = await prisma.approval.findMany({
    where: {
      organizationId,
      status: "pending",
      createdAt: { lt: approvalThreshold },
    },
    select: {
      id: true,
      title: true,
      type: true,
      createdAt: true,
    },
    take: 10,
  });

  if (pendingApprovals.length > 0) {
    alerts.push({
      id: generateAlertId(),
      organizationId,
      type: "approval_pending",
      severity: pendingApprovals.length > 3 ? "critical" : "warning",
      title: `${pendingApprovals.length} approval(s) awaiting response`,
      description: `Approvals pending for more than ${config.approvalPendingThresholdHours} hours`,
      metadata: {
        count: pendingApprovals.length,
        approvals: pendingApprovals.map(
          (a: { id: string; title: string; type: string; createdAt: Date }) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            createdAt: a.createdAt,
          }),
        ),
      },
      suggestedActions: [
        "Review pending approvals",
        "Send reminders to approvers",
        "Escalate if necessary",
      ],
      createdAt: new Date(),
    });
  }

  return alerts;
}

async function checkIntegrationHealth(organizationId: string): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];

  const recentFailures = await prisma.orchestratorExecution.findMany({
    where: {
      organizationId,
      status: "failed",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: {
      id: true,
      errorMessage: true,
      metadata: true,
    },
  });

  const failuresByType = new Map<string, number>();
  for (const failure of recentFailures) {
    const errorType = categorizeError(failure.errorMessage || "unknown");
    failuresByType.set(errorType, (failuresByType.get(errorType) || 0) + 1);
  }

  for (const [errorType, count] of failuresByType) {
    if (count >= 3) {
      alerts.push({
        id: generateAlertId(),
        organizationId,
        type: "integration_failure",
        severity: count >= 10 ? "critical" : "warning",
        title: `Repeated ${errorType} failures detected`,
        description: `${count} failures of type "${errorType}" in the last hour`,
        metadata: {
          errorType,
          failureCount: count,
          timeWindowMinutes: 60,
        },
        suggestedActions: [
          "Check integration credentials",
          "Verify external service status",
          "Review error logs for details",
        ],
        createdAt: new Date(),
      });
    }
  }

  return alerts;
}

function categorizeError(errorMessage: string): string {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes("timeout")) return "timeout";
  if (lowerError.includes("rate limit")) return "rate_limit";
  if (lowerError.includes("unauthorized") || lowerError.includes("401")) return "auth";
  if (lowerError.includes("forbidden") || lowerError.includes("403")) return "permission";
  if (lowerError.includes("not found") || lowerError.includes("404")) return "not_found";
  if (lowerError.includes("500") || lowerError.includes("server error")) return "server_error";
  if (lowerError.includes("network") || lowerError.includes("connection")) return "network";

  return "unknown";
}

async function processAlert(alert: ProactiveAlert): Promise<void> {
  const cacheKey = `${ALERT_CACHE_PREFIX}${alert.organizationId}:${alert.type}:${JSON.stringify(alert.metadata)}`;

  const existing = await redis.get(cacheKey);
  if (existing) {
    logger.debug("Alert already sent recently, skipping", { type: alert.type });
    return;
  }

  await storeAlert(alert);

  await redis.setex(cacheKey, ALERT_CACHE_TTL, JSON.stringify(alert));

  metrics.increment("proactive_alert.generated", {
    type: alert.type,
    severity: alert.severity,
  });

  logger.info("Proactive alert generated", {
    alertId: alert.id,
    organizationId: alert.organizationId,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
  });
}

async function storeAlert(alert: ProactiveAlert): Promise<void> {
  const listKey = `alerts:${alert.organizationId}`;

  await redis.lpush(listKey, JSON.stringify(alert));
  await redis.ltrim(listKey, 0, 99);
  await redis.expire(listKey, 7 * 24 * 60 * 60);
}

export async function getActiveAlerts(organizationId: string): Promise<ProactiveAlert[]> {
  const listKey = `alerts:${organizationId}`;

  const alertStrings = await redis.lrange(listKey, 0, -1);
  return alertStrings.map((s: string) => JSON.parse(s) as ProactiveAlert);
}

export async function acknowledgeAlert(organizationId: string, alertId: string): Promise<boolean> {
  const listKey = `alerts:${organizationId}`;

  const alerts = await getActiveAlerts(organizationId);
  const alertIndex = alerts.findIndex((a) => a.id === alertId);

  if (alertIndex === -1) {
    return false;
  }

  alerts[alertIndex].acknowledgedAt = new Date();

  await redis.del(listKey);
  for (const alert of alerts.reverse()) {
    await redis.lpush(listKey, JSON.stringify(alert));
  }
  await redis.expire(listKey, 7 * 24 * 60 * 60);

  logger.info("Alert acknowledged", { organizationId, alertId });
  return true;
}

function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function triggerManualCheck(organizationId: string): Promise<ProactiveAlert[]> {
  const alerts = await Promise.all([
    checkBudgetWarnings(organizationId),
    checkOverdueTasks(organizationId),
    checkPendingApprovals(organizationId),
    checkIntegrationHealth(organizationId),
  ]);

  return alerts.flat().filter(Boolean) as ProactiveAlert[];
}
