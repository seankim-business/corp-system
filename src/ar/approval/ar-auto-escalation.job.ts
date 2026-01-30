/**
 * AR Auto-Escalation Job
 *
 * Periodically checks for pending approval requests that have passed their
 * escalation timeout and automatically escalates them to the next level.
 *
 * Also handles expired requests that have passed their expiration time.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";
import { arApprovalService } from "./ar-approval.service";
import { arSlackNotifier } from "../notifications/ar-slack-notifier.service";
import { arAuditService } from "../audit/ar-audit.service";

// =============================================================================
// TYPES
// =============================================================================

export interface AutoEscalationResult {
  escalated: number;
  expired: number;
  errors: number;
  details: Array<{
    requestId: string;
    action: 'escalated' | 'expired' | 'error';
    fromLevel?: number;
    toLevel?: number;
    error?: string;
  }>;
}

export interface EscalationConfig {
  enabled: boolean;
  checkIntervalMinutes: number;
  maxEscalationLevel: number;
  notifyOnEscalation: boolean;
  notifyOnExpiration: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: EscalationConfig = {
  enabled: true,
  checkIntervalMinutes: 5,
  maxEscalationLevel: 5,
  notifyOnEscalation: true,
  notifyOnExpiration: true,
};

// =============================================================================
// AUTO-ESCALATION JOB CLASS
// =============================================================================

export class ARAutoEscalationJob {
  private config: EscalationConfig;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: Partial<EscalationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the auto-escalation job
   */
  start(): void {
    if (this.intervalHandle) {
      logger.warn("Auto-escalation job already running");
      return;
    }

    if (!this.config.enabled) {
      logger.info("Auto-escalation job disabled");
      return;
    }

    logger.info("Starting AR auto-escalation job", {
      checkIntervalMinutes: this.config.checkIntervalMinutes,
    });

    // Run immediately on start
    this.runCheck().catch((error) => {
      logger.error("Initial escalation check failed", {}, error);
    });

    // Schedule periodic checks
    this.intervalHandle = setInterval(
      () => this.runCheck().catch((error) => {
        logger.error("Scheduled escalation check failed", {}, error);
      }),
      this.config.checkIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the auto-escalation job
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("AR auto-escalation job stopped");
    }
  }

  /**
   * Run a single escalation check cycle
   */
  async runCheck(): Promise<AutoEscalationResult> {
    if (this.isRunning) {
      logger.warn("Escalation check already in progress, skipping");
      return {
        escalated: 0,
        expired: 0,
        errors: 0,
        details: [],
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("Running AR auto-escalation check");

      const result: AutoEscalationResult = {
        escalated: 0,
        expired: 0,
        errors: 0,
        details: [],
      };

      // Find all pending requests
      const pendingRequests = await prisma.aRApprovalRequest.findMany({
        where: {
          status: "pending",
        },
      });

      const now = new Date();

      for (const request of pendingRequests) {
        try {
          // Check for expiration first
          if (request.expiresAt && new Date(request.expiresAt) < now) {
            await this.handleExpiration(request, result);
          }
          // Then check for escalation
          else if (request.escalationAt && new Date(request.escalationAt) < now) {
            await this.handleEscalation(request, result);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to process request for escalation", {
            requestId: request.id,
            error: errorMessage,
          });
          result.errors++;
          result.details.push({
            requestId: request.id,
            action: 'error',
            error: errorMessage,
          });
        }
      }

      // Log metrics
      const duration = Date.now() - startTime;
      metrics.histogram("ar_auto_escalation.check_duration", duration);
      // Record counts using gauge (as increment is for single events)
      metrics.gauge("ar_auto_escalation.escalated", result.escalated);
      metrics.gauge("ar_auto_escalation.expired", result.expired);
      metrics.gauge("ar_auto_escalation.errors", result.errors);

      logger.info("AR auto-escalation check complete", {
        escalated: result.escalated,
        expired: result.expired,
        errors: result.errors,
        durationMs: duration,
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle escalation for a specific request
   */
  private async handleEscalation(
    request: any,
    result: AutoEscalationResult
  ): Promise<void> {
    const chain = request.approverChain as Array<{ level: number; approverId: string }>;
    const currentLevel = request.currentLevel;
    const maxLevel = Math.min(this.config.maxEscalationLevel, chain.length);

    // Check if we can escalate to next level
    if (currentLevel >= maxLevel) {
      // Cannot escalate further - mark as expired
      logger.info("Request at max level, marking as expired", {
        requestId: request.id,
        currentLevel,
      });
      await this.handleExpiration(request, result);
      return;
    }

    // Escalate to next level
    const newLevel = currentLevel + 1;

    await arApprovalService.escalate(request.id, "Auto-escalated due to timeout");

    // Audit log
    await arAuditService.logApprovalAction(
      request.organizationId,
      'escalate',
      'system',
      'system',
      'Auto-Escalation System',
      request.id,
      request.title,
      {
        fromLevel: currentLevel,
        toLevel: newLevel,
        reason: 'timeout',
        escalationAt: request.escalationAt,
      }
    );

    // Send notification if configured
    if (this.config.notifyOnEscalation) {
      await this.sendEscalationNotification(request, currentLevel, newLevel);
    }

    result.escalated++;
    result.details.push({
      requestId: request.id,
      action: 'escalated',
      fromLevel: currentLevel,
      toLevel: newLevel,
    });

    logger.info("Request auto-escalated", {
      requestId: request.id,
      fromLevel: currentLevel,
      toLevel: newLevel,
    });
  }

  /**
   * Handle expiration for a specific request
   */
  private async handleExpiration(
    request: any,
    result: AutoEscalationResult
  ): Promise<void> {
    await arApprovalService.expire(request.id);

    // Audit log
    await arAuditService.logApprovalAction(
      request.organizationId,
      'timeout',
      'system',
      'system',
      'Auto-Escalation System',
      request.id,
      request.title,
      {
        currentLevel: request.currentLevel,
        expiresAt: request.expiresAt,
      }
    );

    // Send notification if configured
    if (this.config.notifyOnExpiration) {
      await this.sendExpirationNotification(request);
    }

    result.expired++;
    result.details.push({
      requestId: request.id,
      action: 'expired',
    });

    logger.info("Request auto-expired", {
      requestId: request.id,
      currentLevel: request.currentLevel,
    });
  }

  /**
   * Send Slack notification for escalation
   */
  private async sendEscalationNotification(
    request: any,
    fromLevel: number,
    toLevel: number
  ): Promise<void> {
    try {
      await arSlackNotifier.sendNotification({
        type: 'approval_escalated',
        organizationId: request.organizationId,
        data: {
          title: request.title,
          fromLevel,
          toLevel,
          reason: 'Automatically escalated due to no response within timeout period',
          requestId: request.id,
        },
      });
    } catch (error) {
      logger.error("Failed to send escalation notification", {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send Slack notification for expiration
   */
  private async sendExpirationNotification(request: any): Promise<void> {
    try {
      await arSlackNotifier.sendNotification({
        type: 'approval_decided',
        organizationId: request.organizationId,
        data: {
          title: request.title,
          decision: 'expired',
          approverName: 'System',
          note: 'Request expired due to no response within timeout period',
          requestId: request.id,
        },
      });
    } catch (error) {
      logger.error("Failed to send expiration notification", {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): EscalationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect for interval)
   */
  updateConfig(newConfig: Partial<EscalationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info("Auto-escalation config updated", { config: this.config });
  }

  /**
   * Check if job is currently running
   */
  isJobRunning(): boolean {
    return this.intervalHandle !== null;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const arAutoEscalationJob = new ARAutoEscalationJob();

// =============================================================================
// MANUAL ESCALATION CHECK FUNCTION
// =============================================================================

/**
 * Run a manual escalation check (for testing or one-off runs)
 */
export async function runEscalationCheck(): Promise<AutoEscalationResult> {
  const job = new ARAutoEscalationJob({ enabled: true });
  return job.runCheck();
}

// =============================================================================
// ORGANIZATION-SPECIFIC ESCALATION CHECK
// =============================================================================

/**
 * Run escalation check for a specific organization
 */
export async function runOrganizationEscalationCheck(
  organizationId: string
): Promise<AutoEscalationResult> {
  logger.info("Running organization-specific escalation check", { organizationId });

  const result: AutoEscalationResult = {
    escalated: 0,
    expired: 0,
    errors: 0,
    details: [],
  };

  const pendingRequests = await prisma.aRApprovalRequest.findMany({
    where: {
      organizationId,
      status: "pending",
    },
  });

  const now = new Date();
  const job = new ARAutoEscalationJob({ enabled: true });

  for (const request of pendingRequests) {
    try {
      if (request.expiresAt && new Date(request.expiresAt) < now) {
        await (job as any).handleExpiration(request, result);
      } else if (request.escalationAt && new Date(request.escalationAt) < now) {
        await (job as any).handleEscalation(request, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors++;
      result.details.push({
        requestId: request.id,
        action: 'error',
        error: errorMessage,
      });
    }
  }

  return result;
}
