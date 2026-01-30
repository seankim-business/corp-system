/**
 * AR Analytics API Routes
 *
 * Provides analytics, reporting, and meta-agent endpoints:
 * - Performance analytics
 * - Ops reports
 * - Development plans and coaching
 * - Recommendations
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../../utils/logger";
import { createARAnalyst } from "../meta-agents/ar-analyst.agent";
import { createAROpsManager } from "../meta-agents/ar-ops-manager.agent";
import { createARCoach } from "../meta-agents/ar-coach.agent";
import { recommendationEngineService } from "../templates/recommendation-engine.service";
import { requireOrganization } from "../../middleware/auth.middleware";
import { IndustryType, CompanySize, GrowthStage } from "../types";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const developmentPlanSchema = z.object({
  agentId: z.string().uuid(),
});

const coachingSessionSchema = z.object({
  agentId: z.string().uuid(),
  type: z.enum(['performance_review', 'skill_development', 'career_planning', 'goal_setting']),
  topics: z.array(z.string()).min(1),
});

const updateGoalSchema = z.object({
  agentId: z.string().uuid(),
  goalId: z.string(),
  progress: z.number().min(0).max(100),
  completedMilestones: z.array(z.number()).optional(),
});

const recommendationContextSchema = z.object({
  industry: z.enum(['technology', 'fashion', 'ecommerce', 'manufacturing', 'finance', 'healthcare']).optional(),
  companySize: z.enum(['startup', 'smb', 'enterprise']).optional(),
  growthStage: z.enum(['seed', 'growth', 'mature']).optional(),
  goals: z.array(z.string()).optional(),
  currentChallenges: z.array(z.string()).optional(),
});

// =============================================================================
// ANALYTICS ROUTES
// =============================================================================

/**
 * GET /ar/analytics/report
 * Generate comprehensive analytics report
 */
router.get(
  "/report",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const periodDays = parseInt(req.query.periodDays as string) || 30;
      const analyst = createARAnalyst(orgId);
      const report = await analyst.generateAnalyticsReport(periodDays);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /ar/analytics/metric/:metric
 * Get specific metric report
 */
router.get(
  "/metric/:metric",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const metric = req.params.metric as 'workload' | 'performance' | 'cost' | 'completion';
      if (!['workload', 'performance', 'cost', 'completion'].includes(metric)) {
        res.status(400).json({ error: "Invalid metric type" });
        return;
      }

      const analyst = createARAnalyst(orgId);
      const report = await analyst.getMetricReport(metric);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// OPS MANAGER ROUTES
// =============================================================================

/**
 * GET /ar/analytics/ops/daily
 * Run daily ops check
 */
router.get(
  "/ops/daily",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const opsManager = createAROpsManager(orgId);
      const report = await opsManager.runDailyCheck();

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /ar/analytics/ops/health
 * Run health checks on all agents
 */
router.get(
  "/ops/health",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const opsManager = createAROpsManager(orgId);
      const healthChecks = await opsManager.runHealthChecks();

      const summary = {
        total: healthChecks.length,
        healthy: healthChecks.filter(h => h.status === 'healthy').length,
        warning: healthChecks.filter(h => h.status === 'warning').length,
        critical: healthChecks.filter(h => h.status === 'critical').length,
      };

      res.json({
        success: true,
        data: {
          summary,
          agents: healthChecks,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/ops/execute-actions
 * Execute pending ops actions
 */
router.post(
  "/ops/execute-actions",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const opsManager = createAROpsManager(orgId);

      // First run daily check to populate action queue
      await opsManager.runDailyCheck();

      // Then execute pending actions
      const result = await opsManager.executePendingActions();

      logger.info("Ops actions executed via API", {
        organizationId: orgId,
        executed: result.executed,
        failed: result.failed,
      });

      res.json({
        success: result.failed === 0,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// COACHING ROUTES
// =============================================================================

/**
 * GET /ar/analytics/coaching/plan/:agentId
 * Get development plan for an agent
 */
router.get(
  "/coaching/plan/:agentId",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const agentId = req.params.agentId as string;
      const coach = createARCoach(orgId);

      // Try to get cached plan first
      let plan = await coach.getDevelopmentPlan(agentId);

      // Generate new plan if not cached
      if (!plan) {
        plan = await coach.generateDevelopmentPlan(agentId);
      }

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/coaching/plan
 * Generate new development plan for an agent
 */
router.post(
  "/coaching/plan",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = developmentPlanSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const coach = createARCoach(orgId);
      const plan = await coach.generateDevelopmentPlan(validation.data.agentId);

      logger.info("Development plan generated via API", {
        organizationId: orgId,
        agentId: validation.data.agentId,
      });

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/coaching/session
 * Schedule a coaching session
 */
router.post(
  "/coaching/session",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = coachingSessionSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const coach = createARCoach(orgId);
      const session = await coach.scheduleCoachingSession(
        validation.data.agentId,
        validation.data.type,
        validation.data.topics
      );

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /ar/analytics/coaching/goal
 * Update goal progress
 */
router.put(
  "/coaching/goal",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = updateGoalSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const coach = createARCoach(orgId);
      const plan = await coach.updateGoalProgress(
        validation.data.agentId,
        validation.data.goalId,
        validation.data.progress,
        validation.data.completedMilestones
      );

      if (!plan) {
        res.status(404).json({ error: "Plan or goal not found" });
        return;
      }

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /ar/analytics/coaching/needs
 * Get organization-wide coaching needs assessment
 */
router.get(
  "/coaching/needs",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const coach = createARCoach(orgId);
      const needs = await coach.getOrganizationCoachingNeeds();

      res.json({
        success: true,
        data: needs,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// RECOMMENDATIONS ROUTES
// =============================================================================

/**
 * GET /ar/analytics/recommendations
 * Get recommendations for organization
 */
router.get(
  "/recommendations",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const result = await recommendationEngineService.generateRecommendations({
        organizationId: orgId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/recommendations
 * Generate recommendations with specific context
 */
router.post(
  "/recommendations",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = recommendationContextSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const context = {
        organizationId: orgId,
        industry: validation.data.industry as IndustryType | undefined,
        companySize: validation.data.companySize as CompanySize | undefined,
        growthStage: validation.data.growthStage as GrowthStage | undefined,
        goals: validation.data.goals,
        currentChallenges: validation.data.currentChallenges,
      };

      const result = await recommendationEngineService.generateRecommendations(context);

      logger.info("Recommendations generated via API", {
        organizationId: orgId,
        total: result.recommendations.length,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /ar/analytics/recommendations/:type
 * Get recommendations by type
 */
router.get(
  "/recommendations/:type",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const type = req.params.type as any;
      const validTypes = ['template', 'team_composition', 'position', 'skill_development', 'resource_allocation', 'structure_optimization'];

      if (!validTypes.includes(type)) {
        res.status(400).json({ error: "Invalid recommendation type" });
        return;
      }

      const recommendations = await recommendationEngineService.getRecommendationsByType(
        orgId,
        type
      );

      res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/recommendations/:id/apply
 * Apply a recommendation action
 */
router.post(
  "/recommendations/:id/apply",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const id = req.params.id as string;
      const { actionIndex } = req.body;

      if (actionIndex === undefined || typeof actionIndex !== 'number') {
        res.status(400).json({ error: "actionIndex is required" });
        return;
      }

      const result = await recommendationEngineService.applyRecommendation(
        orgId,
        id,
        actionIndex
      );

      res.json({
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/analytics/recommendations/:id/dismiss
 * Dismiss a recommendation
 */
router.post(
  "/recommendations/:id/dismiss",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const id = req.params.id as string;
      await recommendationEngineService.dismissRecommendation(orgId, id);

      res.json({
        success: true,
        message: "Recommendation dismissed",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
