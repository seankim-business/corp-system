import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { BaseQueue } from "../queue/base.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { getFailedJobs, retryFailedJob, FailedJobInfo } from "../services/dead-letter-recovery";
import { AgentErrorType } from "../orchestrator/error-handler";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { notificationQueue } from "../queue/notification.queue";

export interface DLQRecoveryData {
  action: "process_batch" | "process_single" | "cleanup";
  dlqJobId?: string;
  batchSize?: number;
  maxAge?: number; // hours
}

interface RecoveryAttempt {
  jobId: string;
  originalQueue: string;
  success: boolean;
  action: "retried" | "skipped" | "notified";
  reason?: string;
}

const RETRYABLE_ERROR_PATTERNS: Array<{ pattern: RegExp; type: AgentErrorType }> = [
  { pattern: /timeout|ETIMEDOUT/i, type: "timeout" },
  { pattern: /rate.?limit|429/i, type: "rate_limit" },
  { pattern: /ECONNREFUSED|ENOTFOUND|network/i, type: "network_error" },
  { pattern: /temporary|transient/i, type: "tool_failure" },
];

const NON_RETRYABLE_ERROR_PATTERNS = [
  /auth|unauthorized|403|401/i,
  /budget|quota|exceeded/i,
  /invalid|malformed|syntax/i,
  /permission.?denied/i,
  /not.?found|404/i,
];

export class DLQRecoveryQueue extends BaseQueue<DLQRecoveryData> {
  constructor() {
    super({
      name: "dlq-recovery",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 1, // Don't retry recovery jobs
      },
    });
  }

  async scheduleRecoveryBatch(batchSize: number = 50): Promise<void> {
    await this.add("process-batch", {
      action: "process_batch",
      batchSize,
    });
  }

  async scheduleSingleRecovery(dlqJobId: string): Promise<void> {
    await this.add("process-single", {
      action: "process_single",
      dlqJobId,
    });
  }

  async scheduleCleanup(maxAgeHours: number = 168): Promise<void> {
    // 168 hours = 7 days
    await this.add("cleanup", {
      action: "cleanup",
      maxAge: maxAgeHours,
    });
  }
}

export class DLQRecoveryWorker extends BaseWorker<DLQRecoveryData> {
  private adminNotificationChannel: string;

  constructor() {
    super("dlq-recovery", {
      concurrency: 1,
      lockDuration: 300000,
      stalledInterval: 180000,
      maxStalledCount: 2,
    });

    this.adminNotificationChannel = process.env.ADMIN_SLACK_CHANNEL || "#alerts";
  }

  async process(job: Job<DLQRecoveryData>): Promise<void> {
    const { action, dlqJobId, batchSize, maxAge } = job.data;

    logger.info("DLQ recovery job started", { action, dlqJobId, batchSize });

    switch (action) {
      case "process_batch":
        await this.processBatch(batchSize || 50);
        break;
      case "process_single":
        if (dlqJobId) {
          await this.processSingleJob(dlqJobId);
        }
        break;
      case "cleanup":
        await this.cleanupOldJobs(maxAge || 168);
        break;
      default:
        logger.warn("Unknown DLQ recovery action", { action });
    }
  }

  private async processBatch(batchSize: number): Promise<void> {
    const startTime = Date.now();
    const failedJobs = await getFailedJobs(batchSize);

    if (failedJobs.length === 0) {
      logger.info("No failed jobs to process");
      return;
    }

    logger.info("Processing DLQ batch", { count: failedJobs.length });

    const results: RecoveryAttempt[] = [];

    for (const failedJob of failedJobs) {
      const result = await this.attemptRecovery(failedJob);
      results.push(result);

      // Add small delay between jobs to avoid overwhelming queues
      await this.sleep(100);
    }

    const stats = this.calculateStats(results);
    const duration = Date.now() - startTime;

    logger.info("DLQ batch processing complete", {
      ...stats,
      duration,
    });

    metrics.increment("dlq_recovery.batch_completed", {
      retried: String(stats.retried),
      skipped: String(stats.skipped),
      notified: String(stats.notified),
    });

    // Notify admin if there are non-recoverable jobs
    if (stats.notified > 0) {
      await this.notifyAdminOfFailures(results.filter((r) => r.action === "notified"));
    }
  }

  private async processSingleJob(dlqJobId: string): Promise<void> {
    const failedJobs = await getFailedJobs(1000);
    const job = failedJobs.find((j) => j.id === dlqJobId);

    if (!job) {
      logger.warn("DLQ job not found", { dlqJobId });
      return;
    }

    const result = await this.attemptRecovery(job);

    logger.info("Single job recovery attempted", {
      dlqJobId,
      action: result.action,
      success: result.success,
      reason: result.reason,
    });

    metrics.increment("dlq_recovery.single_processed", {
      action: result.action,
      success: String(result.success),
    });
  }

  private async attemptRecovery(job: FailedJobInfo): Promise<RecoveryAttempt> {
    const { id, originalQueue, failedReason, attempts } = job;

    // Check if error is potentially recoverable
    const isRetryable = this.isRetryableError(failedReason);
    const hasReasonableAttempts = attempts < 5; // Don't retry if already tried many times

    if (isRetryable && hasReasonableAttempts) {
      // Check if enough time has passed (backoff)
      const timeSinceFailure = Date.now() - job.timestamp;
      const minWaitTime = this.calculateMinWaitTime(attempts);

      if (timeSinceFailure < minWaitTime) {
        logger.debug("Skipping job - not enough time has passed", {
          jobId: id,
          timeSinceFailure,
          minWaitTime,
        });
        return {
          jobId: id,
          originalQueue,
          success: false,
          action: "skipped",
          reason: "backoff_not_expired",
        };
      }

      // Attempt retry
      const retryResult = await retryFailedJob(id);

      if (retryResult.success) {
        logger.info("DLQ job retried successfully", {
          jobId: id,
          newJobId: retryResult.newJobId,
          originalQueue,
        });
        return {
          jobId: id,
          originalQueue,
          success: true,
          action: "retried",
        };
      } else {
        logger.warn("DLQ job retry failed", {
          jobId: id,
          error: retryResult.error,
        });
        return {
          jobId: id,
          originalQueue,
          success: false,
          action: "notified",
          reason: retryResult.error,
        };
      }
    }

    // Non-retryable error - mark for admin notification
    logger.info("Non-retryable DLQ job", {
      jobId: id,
      originalQueue,
      failedReason: failedReason.substring(0, 200),
      isRetryable,
      attempts,
    });

    return {
      jobId: id,
      originalQueue,
      success: false,
      action: "notified",
      reason: this.getNonRetryableReason(failedReason),
    };
  }

  private isRetryableError(errorMessage: string): boolean {
    // Check if matches any retryable pattern
    for (const { pattern } of RETRYABLE_ERROR_PATTERNS) {
      if (pattern.test(errorMessage)) {
        // Make sure it's not explicitly non-retryable
        for (const nonRetryable of NON_RETRYABLE_ERROR_PATTERNS) {
          if (nonRetryable.test(errorMessage)) {
            return false;
          }
        }
        return true;
      }
    }

    return false;
  }

  private getNonRetryableReason(errorMessage: string): string {
    for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
      if (pattern.test(errorMessage)) {
        if (/auth|unauthorized|401|403/i.test(errorMessage)) return "authentication_error";
        if (/budget|quota/i.test(errorMessage)) return "budget_exceeded";
        if (/invalid|malformed|syntax/i.test(errorMessage)) return "invalid_input";
        if (/permission/i.test(errorMessage)) return "permission_denied";
        if (/not.?found|404/i.test(errorMessage)) return "resource_not_found";
      }
    }
    return "unknown_permanent_failure";
  }

  private calculateMinWaitTime(attempts: number): number {
    // Exponential backoff: 5min, 15min, 45min, 2h, 6h
    const baseWait = 5 * 60 * 1000; // 5 minutes
    return Math.min(baseWait * Math.pow(3, attempts), 6 * 60 * 60 * 1000);
  }

  private calculateStats(results: RecoveryAttempt[]): {
    retried: number;
    skipped: number;
    notified: number;
    total: number;
  } {
    return {
      retried: results.filter((r) => r.action === "retried").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      notified: results.filter((r) => r.action === "notified").length,
      total: results.length,
    };
  }

  private async notifyAdminOfFailures(failures: RecoveryAttempt[]): Promise<void> {
    if (failures.length === 0) return;

    const byQueue = failures.reduce(
      (acc, f) => {
        acc[f.originalQueue] = (acc[f.originalQueue] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byReason = failures.reduce(
      (acc, f) => {
        const reason = f.reason || "unknown";
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const message = [
      "*DLQ Recovery Report*",
      `Total non-recoverable jobs: ${failures.length}`,
      "",
      "*By Queue:*",
      ...Object.entries(byQueue).map(([q, c]) => `• ${q}: ${c}`),
      "",
      "*By Reason:*",
      ...Object.entries(byReason).map(([r, c]) => `• ${r}: ${c}`),
      "",
      "Review at: /admin/error-management",
    ].join("\n");

    try {
      // Get admin organization ID from env or use default
      const adminOrgId = process.env.ADMIN_ORGANIZATION_ID || "system";

      await notificationQueue.enqueueNotification({
        channel: this.adminNotificationChannel,
        text: message,
        organizationId: adminOrgId,
        userId: "system",
        eventId: `dlq-recovery-${Date.now()}`,
      });

      logger.info("Admin notification sent for DLQ failures", {
        failureCount: failures.length,
      });
    } catch (error) {
      logger.error("Failed to send admin notification", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cleanupOldJobs(maxAgeHours: number): Promise<void> {
    try {
      const result = await deadLetterQueue.cleanupOldJobs();

      logger.info("DLQ cleanup completed", {
        maxAgeHours,
        completedRemoved: result.completed,
        failedRemoved: result.failed,
      });

      metrics.increment("dlq_recovery.cleanup_completed", {
        completed: String(result.completed),
        failed: String(result.failed),
      });
    } catch (error) {
      logger.error("DLQ cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const dlqRecoveryQueue = new DLQRecoveryQueue();
export const dlqRecoveryWorker = new DLQRecoveryWorker();
