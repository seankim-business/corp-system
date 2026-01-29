/**
 * Meta Agent API Routes
 *
 * Provides endpoints for system health monitoring, reports, and recommendations.
 *
 * Routes:
 * - GET /api/meta-agent/health - Get current system health
 * - GET /api/meta-agent/health/history - Get health history
 * - GET /api/meta-agent/agents/:id/health - Get agent health
 * - GET /api/meta-agent/knowledge/gaps - Get knowledge gaps
 * - GET /api/meta-agent/knowledge/coverage - Get coverage report
 * - GET /api/meta-agent/reports - List reports
 * - GET /api/meta-agent/reports/:id - Get specific report
 * - POST /api/meta-agent/reports/generate - Generate a report
 * - GET /api/meta-agent/recommendations - Get recommendations
 * - POST /api/meta-agent/recommendations/:id/accept - Accept recommendation
 * - POST /api/meta-agent/recommendations/:id/reject - Reject recommendation
 * - POST /api/meta-agent/recommendations/:id/implement - Mark as implemented
 * - POST /api/meta-agent/system-check - Run comprehensive system check
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { metaAgent } from "../agents/meta-agent";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/meta-agent/health
 * Get current system health
 */
router.get(
  "/health",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const health = await metaAgent.checkHealth(organizationId);

      return res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error("Failed to get system health", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to get system health",
      });
    }
  }
);

/**
 * GET /api/meta-agent/health/history
 * Get health history
 */
router.get(
  "/health/history",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const days = parseInt(req.query.days as string) || 7;

      const history = await metaAgent.getHealthHistory(organizationId, days);

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error("Failed to get health history", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to get health history",
      });
    }
  }
);

/**
 * GET /api/meta-agent/agents/:id/health
 * Get specific agent health
 */
router.get(
  "/agents/:id/health",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);

      const health = await metaAgent.getAgentHealth(organizationId, agentId);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      return res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error("Failed to get agent health", { error, agentId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to get agent health",
      });
    }
  }
);

/**
 * GET /api/meta-agent/agents/:id/analysis
 * Get agent performance analysis
 */
router.get(
  "/agents/:id/analysis",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = String(req.params.id);

      const analysis = await metaAgent.analyzeAgent(organizationId, agentId);

      if (!analysis) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      return res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error("Failed to analyze agent", { error, agentId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to analyze agent",
      });
    }
  }
);

/**
 * GET /api/meta-agent/ecosystem
 * Get agent ecosystem analysis
 */
router.get(
  "/ecosystem",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const ecosystem = await metaAgent.analyzeEcosystem(organizationId);

      return res.json({
        success: true,
        data: ecosystem,
      });
    } catch (error) {
      logger.error("Failed to analyze ecosystem", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to analyze ecosystem",
      });
    }
  }
);

/**
 * GET /api/meta-agent/knowledge/gaps
 * Get knowledge gaps
 */
router.get(
  "/knowledge/gaps",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const gaps = await metaAgent.analyzeKnowledge(organizationId);

      return res.json({
        success: true,
        data: gaps,
      });
    } catch (error) {
      logger.error("Failed to get knowledge gaps", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to get knowledge gaps",
      });
    }
  }
);

/**
 * GET /api/meta-agent/knowledge/coverage
 * Get documentation coverage report
 */
router.get(
  "/knowledge/coverage",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const coverage = await metaAgent.analyzeCoverage(organizationId);

      return res.json({
        success: true,
        data: coverage,
      });
    } catch (error) {
      logger.error("Failed to get coverage report", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to get coverage report",
      });
    }
  }
);

/**
 * GET /api/meta-agent/reports
 * List system reports
 */
router.get(
  "/reports",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;

      const reports = await metaAgent.listReports(organizationId, { type, limit });

      return res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      logger.error("Failed to list reports", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to list reports",
      });
    }
  }
);

/**
 * GET /api/meta-agent/reports/:id
 * Get specific report
 */
router.get(
  "/reports/:id",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const reportId = String(req.params.id);
      const format = req.query.format as string || "json";

      const report = await metaAgent.getReport(reportId);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: "Report not found",
        });
      }

      // Return in requested format
      if (format === "markdown") {
        res.setHeader("Content-Type", "text/markdown");
        return res.send(report.toMarkdown());
      } else if (format === "html") {
        res.setHeader("Content-Type", "text/html");
        return res.send(report.toHTML());
      } else if (format === "slack") {
        return res.json({
          success: true,
          data: report.toSlackBlocks(),
        });
      }

      return res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Failed to get report", { error, reportId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to get report",
      });
    }
  }
);

/**
 * POST /api/meta-agent/reports/generate
 * Generate a new report
 */
router.post(
  "/reports/generate",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { type = "daily", sendToSlack, slackChannel } = req.body;

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
        default:
          return res.status(400).json({
            success: false,
            error: "Invalid report type. Must be daily, weekly, or monthly.",
          });
      }

      // Optionally send to Slack
      if (sendToSlack && slackChannel) {
        await metaAgent.sendReportToSlack(organizationId, report, slackChannel);
      }

      return res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Failed to generate report", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to generate report",
      });
    }
  }
);

/**
 * GET /api/meta-agent/recommendations
 * Get recommendations
 */
router.get(
  "/recommendations",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const type = req.query.type as string | undefined;
      const priority = req.query.priority as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;

      const recommendations = await metaAgent.getPendingRecommendations(organizationId, {
        type,
        priority,
        limit,
      });

      return res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      logger.error("Failed to get recommendations", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to get recommendations",
      });
    }
  }
);

/**
 * POST /api/meta-agent/recommendations/generate
 * Generate new recommendations
 */
router.post(
  "/recommendations/generate",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const recommendations = await metaAgent.generateRecommendations(organizationId);

      return res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      logger.error("Failed to generate recommendations", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to generate recommendations",
      });
    }
  }
);

/**
 * POST /api/meta-agent/recommendations/:id/accept
 * Accept a recommendation
 */
router.post(
  "/recommendations/:id/accept",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const recommendationId = String(req.params.id);
      const userId = req.user!.id;

      await metaAgent.acceptRecommendation(recommendationId, userId);

      return res.json({
        success: true,
        message: "Recommendation accepted",
      });
    } catch (error) {
      logger.error("Failed to accept recommendation", { error, recommendationId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to accept recommendation",
      });
    }
  }
);

/**
 * POST /api/meta-agent/recommendations/:id/reject
 * Reject a recommendation
 */
router.post(
  "/recommendations/:id/reject",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const recommendationId = String(req.params.id);

      await metaAgent.rejectRecommendation(recommendationId);

      return res.json({
        success: true,
        message: "Recommendation rejected",
      });
    } catch (error) {
      logger.error("Failed to reject recommendation", { error, recommendationId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to reject recommendation",
      });
    }
  }
);

/**
 * POST /api/meta-agent/recommendations/:id/implement
 * Mark recommendation as implemented
 */
router.post(
  "/recommendations/:id/implement",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const recommendationId = String(req.params.id);

      await metaAgent.markRecommendationImplemented(recommendationId);

      return res.json({
        success: true,
        message: "Recommendation marked as implemented",
      });
    } catch (error) {
      logger.error("Failed to mark recommendation", { error, recommendationId: req.params.id });
      return res.status(500).json({
        success: false,
        error: "Failed to mark recommendation as implemented",
      });
    }
  }
);

/**
 * POST /api/meta-agent/system-check
 * Run comprehensive system check
 */
router.post(
  "/system-check",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const result = await metaAgent.runSystemCheck(organizationId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Failed to run system check", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to run system check",
      });
    }
  }
);

/**
 * GET /api/meta-agent/anomalies
 * Get detected anomalies
 */
router.get(
  "/anomalies",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const anomalies = await metaAgent.detectAnomalies(organizationId);

      return res.json({
        success: true,
        data: anomalies,
      });
    } catch (error) {
      logger.error("Failed to detect anomalies", { error });
      return res.status(500).json({
        success: false,
        error: "Failed to detect anomalies",
      });
    }
  }
);

export default router;
