import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { z } from "zod";
import { logger } from "../utils/logger";
import {
  getOrgCosts,
  getAgentCosts,
  getDailyTrend,
  checkBudget,
  setBudget,
  BudgetStatus,
  OrgCostSummary,
  AgentCostSummary,
  DailyTrend,
} from "../services/cost-tracker";
import { checkBudgetAlert, sendBudgetAlert } from "../services/budget-alerts";

const router = Router();

// Validation schemas
const periodSchema = z.enum(["day", "week", "month"]).default("month");
const setBudgetSchema = z.object({
  budgetCents: z.number().int().min(0).nullable(),
});
const daysSchema = z.coerce.number().int().min(1).max(365).default(30);

/**
 * GET /costs/summary
 * Get organization-wide cost summary with per-agent breakdown
 */
router.get("/costs/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const period = periodSchema.parse(req.query.period);

    const summary: OrgCostSummary = await getOrgCosts(organizationId, period);

    logger.debug("Cost summary retrieved", { organizationId, period });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error(
      "Failed to get cost summary",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to retrieve cost summary",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /costs/agents
 * Get per-agent cost breakdown
 */
router.get("/costs/agents", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const period = periodSchema.parse(req.query.period);

    const summary = await getOrgCosts(organizationId, period);

    res.json({
      success: true,
      data: {
        period,
        agents: summary.byAgent,
        totalCostCents: summary.totalCostCents,
        totalRequests: summary.byAgent.reduce((sum, a) => sum + a.requestCount, 0),
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get agent costs",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to retrieve agent costs",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /costs/agents/:agentId
 * Get cost details for a specific agent
 */
router.get(
  "/costs/agents/:agentId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const agentId = req.params.agentId as string;
      // TODO: Add period support to getAgentCosts
      periodSchema.parse(req.query.period); // Validate but ignore for now

      const agentCosts: AgentCostSummary = await getAgentCosts(organizationId, agentId);

      res.json({
        success: true,
        data: agentCosts,
      });
    } catch (error) {
      logger.error(
        "Failed to get agent cost details",
        { organizationId: req.user?.organizationId, agentId: req.params.agentId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve agent cost details",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /costs/daily
 * Get daily cost trend for the past N days
 */
router.get("/costs/daily", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;
    const days = daysSchema.parse(req.query.days);

    const dailyTrend: DailyTrend[] = await getDailyTrend(organizationId, days);

    res.json({
      success: true,
      data: {
        days,
        trend: dailyTrend,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get daily cost trend",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to retrieve daily cost trend",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /costs/budget
 * Get current budget status
 */
router.get("/costs/budget", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;

    const budgetStatus: BudgetStatus = await checkBudget(organizationId);

    res.json({
      success: true,
      data: budgetStatus,
    });
  } catch (error) {
    logger.error(
      "Failed to get budget status",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to retrieve budget status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * PUT /costs/budget
 * Set or update budget for the organization
 */
router.put("/costs/budget", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;

    // Check if user has admin/owner role
    const membership = req.membership;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only owners and admins can update the budget",
      });
      return;
    }

    const { budgetCents } = setBudgetSchema.parse(req.body);

    await setBudget(organizationId, budgetCents ?? 0);

    const budgetStatus = await checkBudget(organizationId);

    logger.info("Budget updated", {
      organizationId,
      budgetCents,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      message: "Budget updated successfully",
      data: budgetStatus,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
      return;
    }

    logger.error(
      "Failed to update budget",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to update budget",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /costs/check-alerts
 * Manually trigger budget alert check (useful for testing)
 */
router.post(
  "/costs/check-alerts",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;

      // Check if user has admin/owner role
      const membership = req.membership;
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Only owners and admins can trigger alert checks",
        });
        return;
      }

      const alertResult = await checkBudgetAlert(organizationId);

      if (alertResult.shouldAlert) {
        await sendBudgetAlert(organizationId, alertResult);
      }

      res.json({
        success: true,
        data: {
          budgetStatus: alertResult.budgetStatus,
          shouldAlert: alertResult.shouldAlert,
          alertType: alertResult.alertType,
          alertSent: alertResult.shouldAlert,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to check budget alerts",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to check budget alerts",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default router;
