import { auditLogger, createAuditLog } from "../services/audit-logger";
import { db as prisma } from "../db/client";
import { logger } from "./logger";
import { startDailyBriefingJob, stopDailyBriefingJob } from "../jobs/daily-briefing.job";
import { runFeedbackAnalysis } from "../jobs/feedback-analysis.job";
import { arAutoEscalationJob } from "../ar/approval/ar-auto-escalation.job";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;
let approvalExpirationTimer: NodeJS.Timeout | null = null;
let feedbackAnalysisTimer: NodeJS.Timeout | null = null;

export function startScheduledTasks() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  scheduleAuditLogCleanup();
  scheduleApprovalExpiration();
  startDailyBriefingJob();
  scheduleFeedbackAnalysis();
  arAutoEscalationJob.start();
  logger.info("Scheduled tasks started");
}

export function stopScheduledTasks() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (approvalExpirationTimer) {
    clearInterval(approvalExpirationTimer);
    approvalExpirationTimer = null;
  }
  if (feedbackAnalysisTimer) {
    clearInterval(feedbackAnalysisTimer);
    feedbackAnalysisTimer = null;
  }
  stopDailyBriefingJob();
  arAutoEscalationJob.stop();
  logger.info("Scheduled tasks stopped");
}

function scheduleAuditLogCleanup() {
  cleanupTimer = setInterval(async () => {
    try {
      const deleted = await auditLogger.cleanup();
      logger.info("Scheduled audit log cleanup completed", { deleted });
    } catch (error) {
      logger.error("Scheduled audit log cleanup failed", { error });
    }
  }, ONE_DAY_MS);

  cleanupTimer.unref?.();
}

async function expireApprovals(): Promise<number> {
  const now = new Date();

  const expiredApprovals = await prisma.approval.findMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
  });

  if (expiredApprovals.length === 0) {
    return 0;
  }

  await prisma.approval.updateMany({
    where: {
      id: { in: expiredApprovals.map((a: { id: string }) => a.id) },
      status: "pending",
    },
    data: { status: "expired" },
  });

  for (const approval of expiredApprovals) {
    await createAuditLog({
      organizationId: approval.organizationId,
      action: "approval.expired",
      resourceType: "Approval",
      resourceId: approval.id,
      details: {
        type: approval.type,
        title: approval.title,
        requesterId: approval.requesterId,
        approverId: approval.approverId,
      },
    });
  }

  return expiredApprovals.length;
}

function scheduleApprovalExpiration() {
  approvalExpirationTimer = setInterval(async () => {
    try {
      const expired = await expireApprovals();
      if (expired > 0) {
        logger.info("Approval expiration job completed", { expired });
      }
    } catch (error) {
      logger.error("Approval expiration job failed", { error });
    }
  }, FIVE_MINUTES_MS);

  approvalExpirationTimer.unref?.();

  expireApprovals().catch((error) => {
    logger.error("Initial approval expiration check failed", { error });
  });
}

function scheduleFeedbackAnalysis() {
  // Calculate time until next Sunday at midnight UTC
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7));
  nextSunday.setUTCHours(0, 0, 0, 0);

  const msUntilNextSunday = nextSunday.getTime() - now.getTime();

  // Schedule first run
  setTimeout(async () => {
    await runFeedbackAnalysisJob();

    // Then schedule weekly runs
    feedbackAnalysisTimer = setInterval(async () => {
      await runFeedbackAnalysisJob();
    }, ONE_WEEK_MS);

    feedbackAnalysisTimer.unref?.();
  }, msUntilNextSunday);

  logger.info("Feedback analysis scheduled", {
    nextRun: nextSunday.toISOString(),
    msUntilNextRun: msUntilNextSunday,
  });
}

async function runFeedbackAnalysisJob() {
  try {
    const result = await runFeedbackAnalysis();
    logger.info("Weekly feedback analysis completed", result);
  } catch (error) {
    logger.error("Weekly feedback analysis failed", { error });
  }
}
