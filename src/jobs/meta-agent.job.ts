/**
 * Meta Agent Scheduled Jobs
 *
 * Interval-based scheduled tasks for the Meta Agent:
 * - Daily health check (06:00 local time)
 * - Weekly report (Monday 09:00 local time)
 * - Knowledge scan (Sunday 03:00 local time)
 * - Hourly metrics collection
 */

import { db as prisma } from "../db/client";
import { metaAgent } from "../agents/meta-agent";
import { logger } from "../utils/logger";

const ONE_MINUTE_MS = 60 * 1000;

let metricsTimer: NodeJS.Timeout | null = null;
let lastHealthCheckDate: string | null = null;
let lastWeeklyReportDate: string | null = null;
let lastKnowledgeScanDate: string | null = null;

/**
 * Start Meta Agent scheduled jobs
 */
export function startMetaAgentJobs(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  // Check every minute for scheduled tasks
  metricsTimer = setInterval(async () => {
    await processMetaAgentTasks();
  }, ONE_MINUTE_MS);

  metricsTimer.unref?.();
  logger.info("Meta Agent scheduled jobs started");

  // Run initial check
  processMetaAgentTasks().catch((error) => {
    logger.error("Initial Meta Agent task check failed", { error });
  });
}

/**
 * Stop Meta Agent scheduled jobs
 */
export function stopMetaAgentJobs(): void {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
    logger.info("Meta Agent scheduled jobs stopped");
  }
}

/**
 * Process Meta Agent scheduled tasks based on time
 */
async function processMetaAgentTasks(): Promise<void> {
  const now = new Date();
  const dateString = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Get all active organizations
  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });

  for (const org of organizations) {
    try {
      // Daily health check at 06:00
      if (hour === 6 && minute === 0 && lastHealthCheckDate !== dateString) {
        await runDailyHealthCheck(org.id);
        lastHealthCheckDate = dateString;
      }

      // Weekly report on Monday at 09:00
      if (dayOfWeek === 1 && hour === 9 && minute === 0 && lastWeeklyReportDate !== dateString) {
        await runWeeklyReport(org.id);
        lastWeeklyReportDate = dateString;
      }

      // Knowledge scan on Sunday at 03:00
      if (dayOfWeek === 0 && hour === 3 && minute === 0 && lastKnowledgeScanDate !== dateString) {
        await runKnowledgeScan(org.id);
        lastKnowledgeScanDate = dateString;
      }

      // Hourly metrics collection during business hours (09:00-18:00)
      if (minute === 0 && hour >= 9 && hour <= 18) {
        await collectHourlyMetrics(org.id);
      }
    } catch (error) {
      logger.error("Error processing Meta Agent tasks for organization", {
        organizationId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Run daily health check
 */
async function runDailyHealthCheck(organizationId: string): Promise<void> {
  logger.info("Running daily health check", { organizationId });

  const health = await metaAgent.checkHealth(organizationId);

  // Save snapshot if health is below threshold
  if (health.overallScore < 80) {
    await metaAgent.saveHealthSnapshot(organizationId, health);

    // Send alert if critically low
    if (health.overallScore < 70) {
      await metaAgent.sendHealthAlert(organizationId, 70);
    }
  }

  logger.info("Daily health check completed", {
    organizationId,
    healthScore: health.overallScore,
  });
}

/**
 * Run weekly report generation
 */
async function runWeeklyReport(organizationId: string): Promise<void> {
  logger.info("Generating weekly report", { organizationId });

  const report = await metaAgent.generateWeeklyReport(organizationId);

  // Send to Slack
  await metaAgent.sendReportToSlack(organizationId, report, "#system-reports");

  logger.info("Weekly report generated and sent", {
    organizationId,
    reportId: report.id,
  });
}

/**
 * Run knowledge scan
 */
async function runKnowledgeScan(organizationId: string): Promise<void> {
  logger.info("Running knowledge scan", { organizationId });

  const gaps = await metaAgent.analyzeKnowledge(organizationId);

  logger.info("Knowledge scan completed", {
    organizationId,
    gapsFound: gaps.length,
  });
}

/**
 * Collect hourly metrics
 */
async function collectHourlyMetrics(organizationId: string): Promise<void> {
  const health = await metaAgent.checkHealth(organizationId);
  await metaAgent.saveHealthSnapshot(organizationId, health);

  logger.debug("Hourly metrics collected", {
    organizationId,
    healthScore: health.overallScore,
  });
}

/**
 * Run a one-off health check for an organization
 */
export async function runHealthCheck(organizationId: string): Promise<void> {
  logger.info("Running one-off health check", { organizationId });

  const health = await metaAgent.checkHealth(organizationId);

  // Always save snapshot for one-off checks
  await metaAgent.saveHealthSnapshot(organizationId, health);

  // Send alert if below threshold
  if (health.overallScore < 70) {
    await metaAgent.sendHealthAlert(organizationId, 70);
  }

  logger.info("One-off health check completed", {
    organizationId,
    healthScore: health.overallScore,
  });
}

/**
 * Run a one-off report generation
 */
export async function runReportGeneration(
  organizationId: string,
  type: "daily" | "weekly" | "monthly",
  sendToSlack: boolean = false,
  slackChannel: string = "#system-reports"
): Promise<void> {
  logger.info("Running one-off report generation", { organizationId, type });

  let report;
  switch (type) {
    case "daily":
      report = await metaAgent.generateDailyReport(organizationId);
      break;
    case "weekly":
      report = await metaAgent.generateWeeklyReport(organizationId);
      break;
    case "monthly":
      report = await metaAgent.generateMonthlyReport(organizationId);
      break;
  }

  if (sendToSlack) {
    await metaAgent.sendReportToSlack(organizationId, report, slackChannel);
  }

  logger.info("One-off report generation completed", {
    organizationId,
    type,
    reportId: report.id,
  });
}

/**
 * Run a one-off knowledge scan
 */
export async function runKnowledgeScanOneOff(organizationId: string): Promise<void> {
  logger.info("Running one-off knowledge scan", { organizationId });

  const gaps = await metaAgent.analyzeKnowledge(organizationId);

  logger.info("One-off knowledge scan completed", {
    organizationId,
    gapsFound: gaps.length,
  });
}

// Default export for convenient imports
export default {
  startMetaAgentJobs,
  stopMetaAgentJobs,
  runHealthCheck,
  runReportGeneration,
  runKnowledgeScan: runKnowledgeScanOneOff,
};
