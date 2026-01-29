import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
// db import removed - userFeedback/feedbackAction tables not yet implemented
import { logger } from "../utils/logger";
import {
  collectFeedback,
  collectRating,
  collectCorrection,
} from "../services/feedback/collector";
import {
  processFeedback,
  batchProcess,
  identifyPatterns,
} from "../services/feedback/processor";
import {
  recommendActions,
  saveRecommendedActions,
} from "../services/feedback/action-recommender";
import {
  applyAutoImprovements,
  // rollbackIfNeeded - not used until feedbackAction table is implemented
  getImprovementStats,
} from "../services/feedback/auto-improver";

const router = Router();

// Validation schemas
const submitFeedbackBodySchema = z.object({
  executionId: z.string().uuid(),
  agentId: z.string().uuid(),
  type: z.enum(["rating", "reaction", "correction", "comment"]),
  rating: z.number().min(1).max(5).optional(),
  reaction: z.enum(["positive", "negative"]).optional(),
  correction: z.object({
    original: z.string(),
    corrected: z.string(),
    field: z.string(),
  }).optional(),
  comment: z.string().optional(),
  originalRequest: z.string(),
  agentResponse: z.string(),
});

const submitRatingBodySchema = z.object({
  executionId: z.string().uuid(),
  agentId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  originalRequest: z.string(),
  agentResponse: z.string(),
});

const submitCorrectionBodySchema = z.object({
  executionId: z.string().uuid(),
  agentId: z.string().uuid(),
  original: z.string(),
  corrected: z.string(),
  field: z.string(),
  originalRequest: z.string(),
  agentResponse: z.string(),
});

const patternsQuerySchema = z.object({
  agentId: z.string().uuid(),
  days: z.coerce.number().min(1).max(90).default(30),
});

// Submit general feedback
router.post(
  "/feedback",
  requireAuth,
  validate({ body: submitFeedbackBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const {
        executionId,
        agentId,
        type,
        rating,
        reaction,
        correction,
        comment,
        originalRequest,
        agentResponse,
      } = req.body;

      const feedbackId = await collectFeedback({
        organizationId,
        userId,
        executionId,
        agentId,
        type,
        rating,
        reaction,
        correction,
        comment,
        originalRequest,
        agentResponse,
      });

      // Process feedback asynchronously
      processFeedback(feedbackId).catch((err) => {
        logger.error("Background feedback processing failed", { feedbackId }, err);
      });

      return res.status(201).json({ feedbackId });
    } catch (error) {
      logger.error("Submit feedback error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  }
);

// Submit rating
router.post(
  "/feedback/rating",
  requireAuth,
  validate({ body: submitRatingBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { executionId, agentId, rating, originalRequest, agentResponse } = req.body;

      const feedbackId = await collectRating(
        executionId,
        organizationId,
        userId,
        agentId,
        rating,
        originalRequest,
        agentResponse
      );

      return res.status(201).json({ feedbackId });
    } catch (error) {
      logger.error("Submit rating error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to submit rating" });
    }
  }
);

// Submit correction
router.post(
  "/feedback/correction",
  requireAuth,
  validate({ body: submitCorrectionBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { executionId, agentId, original, corrected, field, originalRequest, agentResponse } = req.body;

      const feedbackId = await collectCorrection(
        executionId,
        organizationId,
        userId,
        agentId,
        { original, corrected, field },
        originalRequest,
        agentResponse
      );

      return res.status(201).json({ feedbackId });
    } catch (error) {
      logger.error("Submit correction error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to submit correction" });
    }
  }
);

// Get feedback analysis
router.get(
  "/feedback/analysis",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const days = parseInt(req.query.days as string) || 30;
      const since = new Date();
      since.setDate(since.getDate() - days);

      // TODO: Implement UserFeedback Prisma model and migration
      // The userFeedback table does not exist yet in the schema
      logger.warn("UserFeedback feature not yet implemented - returning mock data", { organizationId });

      const feedback: any[] = [];
      const totalCount = 0;
      const sentimentCounts: Array<{ sentiment?: string | null; _count: number }> = [];
      const categoryCounts: Array<{ category?: string | null; _count: number }> = [];

      const sentimentDistribution = sentimentCounts.reduce<Record<string, number>>((acc: Record<string, number>, item: { sentiment?: string | null; _count: number }) => {
        if (item.sentiment) acc[item.sentiment] = item._count;
        return acc;
      }, {});

      const categoryDistribution = categoryCounts.reduce<Record<string, number>>((acc: Record<string, number>, item: { category?: string | null; _count: number }) => {
        if (item.category) acc[item.category] = item._count;
        return acc;
      }, {});

      return res.json({
        totalCount,
        sentimentDistribution,
        categoryDistribution,
        recentFeedback: feedback,
        period: { days, since: since.toISOString() },
      });
    } catch (error) {
      logger.error("Get feedback analysis error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get feedback analysis" });
    }
  }
);

// Get feedback patterns for an agent
router.get(
  "/feedback/patterns",
  requireAuth,
  validate({ query: patternsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { agentId, days } = req.query as { agentId: string; days: string };

      const patterns = await identifyPatterns(
        organizationId,
        agentId,
        parseInt(days)
      );

      return res.json({ patterns });
    } catch (error) {
      logger.error("Get feedback patterns error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get feedback patterns" });
    }
  }
);

// Get recommended actions
router.get(
  "/feedback/actions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const status = (req.query.status as string) || "pending";

      // TODO: Implement FeedbackAction Prisma model and migration
      // The feedbackAction table does not exist yet in the schema
      logger.warn("FeedbackAction feature not yet implemented - returning mock data", { organizationId, status });

      const actions: any[] = [];
      const stats = await getImprovementStats(organizationId);

      return res.json({ actions, stats });
    } catch (error) {
      logger.error("Get recommended actions error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get recommended actions" });
    }
  }
);

// Apply an action
router.post(
  "/feedback/actions/:id/apply",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const actionId = Array.isArray(id) ? id[0] : id;

      // TODO: Implement FeedbackAction Prisma model and migration
      // The feedbackAction table does not exist yet in the schema
      logger.warn("FeedbackAction feature not yet implemented - cannot apply action", { actionId, organizationId });

      return res.status(501).json({ error: "FeedbackAction feature not yet implemented" });

    } catch (error) {
      logger.error("Apply action error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to apply action" });
    }
  }
);

// Dismiss an action
router.post(
  "/feedback/actions/:id/dismiss",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const actionId = Array.isArray(id) ? id[0] : id;

      // TODO: Implement FeedbackAction Prisma model and migration
      // The feedbackAction table does not exist yet in the schema
      logger.warn("FeedbackAction feature not yet implemented - cannot dismiss action", { actionId, organizationId });

      return res.status(501).json({ error: "FeedbackAction feature not yet implemented" });

    } catch (error) {
      logger.error("Dismiss action error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to dismiss action" });
    }
  }
);

// Rollback an action
router.post(
  "/feedback/actions/:id/rollback",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const actionId = Array.isArray(id) ? id[0] : id;
      const { reason } = req.body as { reason?: string };

      // TODO: Implement FeedbackAction Prisma model and migration
      // The feedbackAction table does not exist yet in the schema
      logger.warn("FeedbackAction feature not yet implemented - cannot rollback action", { actionId, organizationId, reason });

      return res.status(501).json({ error: "FeedbackAction feature not yet implemented" });

    } catch (error) {
      logger.error("Rollback action error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to rollback action" });
    }
  }
);

// Process pending feedback (admin)
router.post(
  "/feedback/process",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const processed = await batchProcess(organizationId);

      // Generate new actions from processed feedback
      if (processed.length > 0) {
        const actions = await recommendActions(processed);
        await saveRecommendedActions(organizationId, actions);
      }

      return res.json({
        processedCount: processed.length,
        actionsGenerated: processed.length > 0,
      });
    } catch (error) {
      logger.error("Process feedback error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to process feedback" });
    }
  }
);

// Auto-apply safe improvements (admin)
router.post(
  "/feedback/auto-improve",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const results = await applyAutoImprovements(organizationId);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return res.json({
        total: results.length,
        successful,
        failed,
        results,
      });
    } catch (error) {
      logger.error("Auto-improve error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to apply auto-improvements" });
    }
  }
);

export default router;
