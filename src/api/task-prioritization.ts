/**
 * Task Prioritization API
 * Endpoints for AI-powered task prioritization and recommendations.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import {
  getPrioritizedTasks,
  suggestNextTask,
  calculateTaskPriority,
  getPrioritizedTaskList,
  getFocusRecommendation,
  generateRecommendation,
} from "../services/prioritization";

const router = Router();

// Schema for query parameters
const getPrioritizedTasksSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const getTaskPrioritySchema = z.object({
  taskId: z.string().uuid(),
});

const feedbackSchema = z.object({
  rating: z.enum(["helpful", "not_helpful", "neutral"]),
  reason: z.string().max(500).optional(),
  actualAction: z.enum(["do_now", "schedule", "delegate", "defer", "other"]).optional(),
});

/**
 * GET /tasks/prioritized
 * Get all tasks prioritized for the current user
 */
router.get(
  "/tasks/prioritized",
  requireAuth,
  validate({ query: getPrioritizedTasksSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;
      const validated = getPrioritizedTasksSchema.parse(req.query);
      const { projectId, limit } = validated;

      const priorities = await getPrioritizedTasks(userId, organizationId, {
        projectId,
        limit,
      });

      logger.info("Prioritized tasks fetched", {
        userId,
        organizationId,
        taskCount: priorities.length,
      });

      return res.json({
        tasks: priorities.map((p) => ({
          taskId: p.taskId,
          taskName: p.taskName,
          scores: {
            urgency: p.urgencyScore,
            importance: p.importanceScore,
            dependency: p.dependencyScore,
            pattern: p.patternScore,
            overall: p.overallScore,
          },
          recommendation: p.recommendation,
          reasoning: p.reasoning,
          urgencyTier: p.urgencyDetails.tier,
          importanceTier: p.importanceDetails.tier,
          criticalPath: p.dependencyDetails.criticalPathPosition,
          blockers: p.dependencyDetails.blockers.length,
          dependents: p.dependencyDetails.dependents.length,
        })),
        total: priorities.length,
      });
    } catch (error) {
      logger.error(
        "Get prioritized tasks error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get prioritized tasks" });
    }
  },
);

/**
 * GET /tasks/prioritized/list
 * Get tasks organized into mustDo, shouldDo, canDefer categories
 */
router.get("/tasks/prioritized/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId, organizationId } = req.user!;

    const taskList = await getPrioritizedTaskList(userId, organizationId);

    return res.json({
      mustDo: taskList.mustDo.map((t) => ({
        taskId: t.taskId,
        taskName: t.taskName,
        overallScore: t.overallScore,
        recommendation: t.recommendation,
        reasoning: t.reasoning,
      })),
      shouldDo: taskList.shouldDo.map((t) => ({
        taskId: t.taskId,
        taskName: t.taskName,
        overallScore: t.overallScore,
        recommendation: t.recommendation,
        reasoning: t.reasoning,
      })),
      canDefer: taskList.canDefer.map((t) => ({
        taskId: t.taskId,
        taskName: t.taskName,
        overallScore: t.overallScore,
        recommendation: t.recommendation,
        reasoning: t.reasoning,
      })),
      summary: {
        mustDoCount: taskList.mustDo.length,
        shouldDoCount: taskList.shouldDo.length,
        canDeferCount: taskList.canDefer.length,
        totalActive: taskList.mustDo.length + taskList.shouldDo.length + taskList.canDefer.length,
      },
    });
  } catch (error) {
    logger.error(
      "Get prioritized task list error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get prioritized task list" });
  }
});

/**
 * GET /tasks/next-recommendation
 * Get the recommended next task to work on
 */
router.get("/tasks/next-recommendation", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId, organizationId } = req.user!;

    const suggestion = await suggestNextTask(userId, organizationId);

    if (!suggestion) {
      return res.json({
        hasRecommendation: false,
        message: "No tasks found to recommend",
      });
    }

    const recommendation = generateRecommendation(suggestion.priority);

    return res.json({
      hasRecommendation: true,
      task: {
        id: suggestion.task.id,
        name: suggestion.task.name,
        status: suggestion.task.status,
        dueDate: suggestion.task.dueDate,
      },
      priority: {
        overallScore: suggestion.priority.overallScore,
        urgencyScore: suggestion.priority.urgencyScore,
        importanceScore: suggestion.priority.importanceScore,
        recommendation: suggestion.priority.recommendation,
      },
      reasoning: suggestion.reasoning,
      confidence: recommendation.confidence,
      alternativeActions: recommendation.alternativeActions,
      contextFactors: recommendation.contextFactors,
    });
  } catch (error) {
    logger.error(
      "Get next task recommendation error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get next task recommendation" });
  }
});

/**
 * GET /tasks/focus-recommendation
 * Get focus recommendation with next steps
 */
router.get("/tasks/focus-recommendation", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId, organizationId } = req.user!;

    const focus = await getFocusRecommendation(userId, organizationId);

    if (!focus) {
      return res.json({
        hasFocus: false,
        message: "No focus recommendation available",
      });
    }

    return res.json({
      hasFocus: true,
      task: focus.task,
      reasoning: focus.reasoning,
      estimatedTime: focus.estimatedTime,
      nextSteps: focus.nextSteps,
    });
  } catch (error) {
    logger.error(
      "Get focus recommendation error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get focus recommendation" });
  }
});

/**
 * GET /tasks/:taskId/priority
 * Get detailed priority information for a specific task
 */
router.get(
  "/tasks/:taskId/priority",
  requireAuth,
  validate({ params: getTaskPrioritySchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;
      const taskId = req.params.taskId as string;

      const priority = await calculateTaskPriority(taskId, userId, organizationId);

      if (!priority) {
        return res.status(404).json({ error: "Task not found" });
      }

      const recommendation = generateRecommendation(priority);

      return res.json({
        taskId: priority.taskId,
        taskName: priority.taskName,
        scores: {
          urgency: priority.urgencyScore,
          importance: priority.importanceScore,
          dependency: priority.dependencyScore,
          pattern: priority.patternScore,
          overall: priority.overallScore,
        },
        recommendation: priority.recommendation,
        reasoning: priority.reasoning,
        details: {
          urgency: {
            tier: priority.urgencyDetails.tier,
            daysUntilDue: priority.urgencyDetails.daysUntilDue,
            reasoning: priority.urgencyDetails.reasoning,
          },
          importance: {
            tier: priority.importanceDetails.tier,
            factors: priority.importanceDetails.factors,
            reasoning: priority.importanceDetails.reasoning,
          },
          dependency: {
            criticalPathPosition: priority.dependencyDetails.criticalPathPosition,
            blockers: priority.dependencyDetails.blockers,
            dependents: priority.dependencyDetails.dependents,
            reasoning: priority.dependencyDetails.reasoning,
          },
          pattern: {
            score: priority.patternDetails.score,
            patterns: priority.patternDetails.patterns,
            optimalSlot: priority.patternDetails.optimalSlot,
            reasoning: priority.patternDetails.reasoning,
          },
        },
        alternativeActions: recommendation.alternativeActions,
        contextFactors: recommendation.contextFactors,
        confidence: recommendation.confidence,
      });
    } catch (error) {
      logger.error(
        "Get task priority error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get task priority" });
    }
  },
);

/**
 * POST /tasks/:taskId/priority/feedback
 * Submit feedback on a priority recommendation
 */
router.post(
  "/tasks/:taskId/priority/feedback",
  requireAuth,
  validate({ params: getTaskPrioritySchema, body: feedbackSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;
      const taskId = req.params.taskId as string;
      const { rating, reason, actualAction } = req.body as z.infer<typeof feedbackSchema>;

      // Log feedback for future ML improvements
      logger.info("Priority recommendation feedback received", {
        userId,
        organizationId,
        taskId,
        rating,
        reason,
        actualAction,
      });

      // TODO: Store feedback in database for ML model training
      // For now, just acknowledge receipt

      return res.json({
        success: true,
        message: "Feedback recorded. Thank you for helping improve recommendations!",
      });
    } catch (error) {
      logger.error(
        "Submit priority feedback error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  },
);

export default router;
