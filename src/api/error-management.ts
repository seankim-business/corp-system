/**
 * Error Management Admin API
 *
 * Provides endpoints for viewing and managing failed executions,
 * retrying failed jobs, and monitoring error statistics.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import {
  getFailedJobs,
  getFailedJobsByQueue,
  retryFailedJob,
  retryAllFailedJobs,
  deleteFailedJob,
  purgeFailedJobs,
  getDeadLetterStats,
  FailedJobInfo,
} from "../services/dead-letter-recovery";
import { checkpointManager } from "../orchestrator/checkpoint-manager";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const router = Router();

// ============== Validation Schemas ==============

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const queueFilterSchema = z.object({
  queue: z.string().optional(),
});

const jobIdParamSchema = z.object({
  id: z.string().min(1, "Job ID is required"),
});

const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

const retryAllQuerySchema = z.object({
  queue: z.string().optional(),
});

const purgeQuerySchema = z.object({
  queue: z.string().optional(),
  confirm: z.literal("true"),
});

// ============== Failed Jobs Routes ==============

/**
 * GET /failed-jobs - List failed jobs from dead letter queue
 */
router.get(
  "/failed-jobs",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ query: paginationSchema.merge(queueFilterSchema) }),
  async (req: Request, res: Response) => {
    try {
      const { limit, offset } = req.query as unknown as z.infer<typeof paginationSchema>;
      const { queue } = req.query as unknown as z.infer<typeof queueFilterSchema>;

      let jobs: FailedJobInfo[];
      if (queue) {
        jobs = await getFailedJobsByQueue(queue, limit + offset);
      } else {
        jobs = await getFailedJobs(limit + offset);
      }

      // Apply offset
      const paginatedJobs = jobs.slice(offset, offset + limit);

      // Enrich with additional context
      const enrichedJobs = paginatedJobs.map((job) => ({
        ...job,
        ageMs: Date.now() - job.timestamp,
        ageFormatted: formatAge(Date.now() - job.timestamp),
        canRetry: isRetryable(job.failedReason),
      }));

      logger.debug("Listed failed jobs", {
        total: jobs.length,
        returned: enrichedJobs.length,
        queue,
      });

      return res.json({
        jobs: enrichedJobs,
        total: jobs.length,
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Failed to list failed jobs", {}, error as Error);
      return res.status(500).json({ error: "Failed to list failed jobs" });
    }
  },
);

/**
 * GET /failed-jobs/:id - Get details of a specific failed job
 */
router.get(
  "/failed-jobs/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const jobs = await getFailedJobs(10000);
      const job = jobs.find((j) => j.id === id);

      if (!job) {
        return res.status(404).json({ error: "Failed job not found" });
      }

      // Get additional execution details from database if available
      let executionDetails = null;
      if (job.data?.sessionId) {
        executionDetails = await prisma.orchestratorExecution.findFirst({
          where: { sessionId: job.data.sessionId },
          orderBy: { createdAt: "desc" },
        });
      }

      return res.json({
        job: {
          ...job,
          ageMs: Date.now() - job.timestamp,
          ageFormatted: formatAge(Date.now() - job.timestamp),
          canRetry: isRetryable(job.failedReason),
        },
        executionDetails,
      });
    } catch (error) {
      logger.error("Failed to get failed job", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to get failed job" });
    }
  },
);

/**
 * POST /failed-jobs/:id/retry - Retry a specific failed job
 */
router.post(
  "/failed-jobs/:id/retry",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.id as string;

      logger.info("Retrying failed job", { jobId: id, userId });

      const result = await retryFailedJob(id);

      if (!result.success) {
        return res.status(400).json({
          error: result.error || "Failed to retry job",
        });
      }

      metrics.increment("error_management.job_retried", {
        userId,
      });

      return res.json({
        message: "Job queued for retry",
        newJobId: result.newJobId,
      });
    } catch (error) {
      logger.error("Failed to retry job", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to retry job" });
    }
  },
);

/**
 * POST /failed-jobs/retry-all - Retry all failed jobs (optionally filtered by queue)
 */
router.post(
  "/failed-jobs/retry-all",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ query: retryAllQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { queue } = req.query as unknown as z.infer<typeof retryAllQuerySchema>;
      const userId = req.user!.id;

      logger.info("Retrying all failed jobs", { queue, userId });

      const result = await retryAllFailedJobs(queue);

      metrics.increment("error_management.bulk_retry", {
        userId,
        total: String(result.total),
        succeeded: String(result.succeeded),
      });

      return res.json({
        message: `Retry completed: ${result.succeeded}/${result.total} jobs queued`,
        ...result,
      });
    } catch (error) {
      logger.error("Failed to retry all jobs", {}, error as Error);
      return res.status(500).json({ error: "Failed to retry all jobs" });
    }
  },
);

/**
 * DELETE /failed-jobs/:id - Delete a failed job from DLQ
 */
router.delete(
  "/failed-jobs/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.id as string;

      logger.info("Deleting failed job", { jobId: id, userId });

      const deleted = await deleteFailedJob(id);

      if (!deleted) {
        return res.status(404).json({ error: "Failed job not found" });
      }

      metrics.increment("error_management.job_deleted", {
        userId,
      });

      return res.json({ message: "Job deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete job", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to delete job" });
    }
  },
);

/**
 * DELETE /failed-jobs - Purge all failed jobs (requires confirmation)
 */
router.delete(
  "/failed-jobs",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ query: purgeQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { queue } = req.query as unknown as z.infer<typeof purgeQuerySchema>;
      const userId = req.user!.id;

      logger.warn("Purging failed jobs", { queue, userId });

      const deleted = await purgeFailedJobs(queue);

      metrics.increment("error_management.jobs_purged", {
        userId,
        count: String(deleted),
      });

      return res.json({
        message: `Purged ${deleted} failed jobs`,
        deleted,
      });
    } catch (error) {
      logger.error("Failed to purge jobs", {}, error as Error);
      return res.status(500).json({ error: "Failed to purge jobs" });
    }
  },
);

// ============== Statistics Routes ==============

/**
 * GET /stats - Get error statistics
 */
router.get(
  "/stats",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (_req: Request, res: Response) => {
    try {
      const dlqStats = await getDeadLetterStats();

      // Get recent execution failures from database
      const recentFailures = await prisma.orchestratorExecution.count({
        where: {
          status: "failed",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      const totalExecutions = await prisma.orchestratorExecution.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      return res.json({
        deadLetterQueue: {
          ...dlqStats,
          oldestAge: dlqStats.oldest ? formatAge(Date.now() - dlqStats.oldest) : null,
          newestAge: dlqStats.newest ? formatAge(Date.now() - dlqStats.newest) : null,
        },
        executions: {
          last24Hours: {
            total: totalExecutions,
            failed: recentFailures,
            failureRate:
              totalExecutions > 0
                ? ((recentFailures / totalExecutions) * 100).toFixed(2) + "%"
                : "0%",
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get error stats", {}, error as Error);
      return res.status(500).json({ error: "Failed to get error statistics" });
    }
  },
);

// ============== Checkpoint Routes ==============

/**
 * GET /checkpoints - List workflow checkpoints
 */
router.get(
  "/checkpoints",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ query: paginationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { limit } = req.query as unknown as z.infer<typeof paginationSchema>;

      const checkpoints = await checkpointManager.list(limit);

      const enrichedCheckpoints = checkpoints.map((cp) => ({
        ...cp,
        ageMs: Date.now() - cp.updatedAt.getTime(),
        ageFormatted: formatAge(Date.now() - cp.updatedAt.getTime()),
      }));

      return res.json({
        checkpoints: enrichedCheckpoints,
        total: enrichedCheckpoints.length,
      });
    } catch (error) {
      logger.error("Failed to list checkpoints", {}, error as Error);
      return res.status(500).json({ error: "Failed to list checkpoints" });
    }
  },
);

/**
 * GET /checkpoints/:sessionId - Get a specific checkpoint
 */
router.get(
  "/checkpoints/:sessionId",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;

      const checkpoint = await checkpointManager.load(sessionId);

      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      return res.json({
        checkpoint: {
          ...checkpoint,
          ageMs: Date.now() - checkpoint.updatedAt.getTime(),
          ageFormatted: formatAge(Date.now() - checkpoint.updatedAt.getTime()),
        },
      });
    } catch (error) {
      logger.error("Failed to get checkpoint", { sessionId: req.params.sessionId }, error as Error);
      return res.status(500).json({ error: "Failed to get checkpoint" });
    }
  },
);

/**
 * DELETE /checkpoints/:sessionId - Delete a checkpoint
 */
router.delete(
  "/checkpoints/:sessionId",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;
      const userId = req.user!.id as string;

      logger.info("Deleting checkpoint", { sessionId, userId });

      const deleted = await checkpointManager.delete(sessionId);

      if (!deleted) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      return res.json({ message: "Checkpoint deleted successfully" });
    } catch (error) {
      logger.error(
        "Failed to delete checkpoint",
        { sessionId: req.params.sessionId },
        error as Error,
      );
      return res.status(500).json({ error: "Failed to delete checkpoint" });
    }
  },
);

/**
 * POST /checkpoints/cleanup - Clean up old checkpoints
 */
router.post(
  "/checkpoints/cleanup",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const maxAgeDays = Number(req.query.maxAgeDays) || 7;
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      const deleted = await checkpointManager.cleanup(cutoff);

      logger.info("Checkpoint cleanup completed", {
        maxAgeDays,
        deleted,
        userId: req.user!.id,
      });

      return res.json({
        message: `Cleaned up ${deleted} checkpoints older than ${maxAgeDays} days`,
        deleted,
      });
    } catch (error) {
      logger.error("Failed to cleanup checkpoints", {}, error as Error);
      return res.status(500).json({ error: "Failed to cleanup checkpoints" });
    }
  },
);

// ============== Failed Executions Routes ==============

/**
 * GET /failed-executions - List failed orchestrator executions
 */
router.get(
  "/failed-executions",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ query: paginationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { limit, offset } = req.query as unknown as z.infer<typeof paginationSchema>;
      const { organizationId } = req.user!;

      const [executions, total] = await Promise.all([
        prisma.orchestratorExecution.findMany({
          where: {
            organizationId,
            status: "failed",
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.orchestratorExecution.count({
          where: {
            organizationId,
            status: "failed",
          },
        }),
      ]);

      return res.json({
        executions,
        total,
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Failed to list failed executions", {}, error as Error);
      return res.status(500).json({ error: "Failed to list failed executions" });
    }
  },
);

/**
 * GET /failed-executions/:id - Get details of a failed execution
 */
router.get(
  "/failed-executions/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { organizationId } = req.user!;

      const execution = await prisma.orchestratorExecution.findFirst({
        where: {
          id,
          organizationId,
        },
      });

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      return res.json({ execution });
    } catch (error) {
      logger.error("Failed to get execution", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to get execution" });
    }
  },
);

// ============== Helper Functions ==============

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function isRetryable(errorMessage: string): boolean {
  const nonRetryablePatterns = [
    /auth|unauthorized|403|401/i,
    /budget|quota|exceeded/i,
    /invalid|malformed|syntax/i,
    /permission.?denied/i,
  ];

  for (const pattern of nonRetryablePatterns) {
    if (pattern.test(errorMessage)) {
      return false;
    }
  }

  return true;
}

export default router;
