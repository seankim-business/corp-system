import { auditLogger } from "../services/audit-logger";
import { logger } from "./logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;

export function startScheduledTasks() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  scheduleAuditLogCleanup();
  logger.info("Scheduled tasks started");
}

export function stopScheduledTasks() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
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
