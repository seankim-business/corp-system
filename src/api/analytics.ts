// Analytics API Routes - Comprehensive agent performance analytics
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { logger } from "../utils/logger";
import {
  metricsAggregator,
  getDateRange,
  type AgentMetrics,
  type OrgMetrics,
  type DimensionMetrics,
} from "../services/analytics/metrics-aggregator";
import {
  trendAnalyzer,
  type Trend,
  type Anomaly,
  type ForecastResult,
} from "../services/analytics/trend-analyzer";
import {
  comparisonEngine,
  type ComparisonReport,
  type LeaderboardEntry,
} from "../services/analytics/comparison-engine";
import {
  reportBuilder,
  type AnalyticsReport,
  type ReportConfig,
} from "../services/analytics/report-builder";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const periodSchema = z.enum(["day", "week", "month", "custom"]).default("month");

const dateRangeSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  period: periodSchema,
});

const limitSchema = z.coerce.number().int().min(1).max(100).default(10);

const dimensionSchema = z.enum(["agent", "user", "tool", "workflow"]);

const reportSectionsSchema = z.array(
  z.enum(["overview", "agents", "trends", "anomalies", "leaderboard", "costs"]),
);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /analytics/overview
 * Get organization-wide analytics overview
 */
router.get(
  "/analytics/overview",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { period, start, end } = dateRangeSchema.parse(req.query);

      const dateRange = getDateRange(period, start, end);
      const orgMetrics: OrgMetrics = await metricsAggregator.getOrgMetrics(
        organizationId,
        dateRange,
      );

      logger.debug("Analytics overview retrieved", { organizationId, period });

      res.json({
        success: true,
        data: {
          ...orgMetrics,
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get analytics overview",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve analytics overview",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/agents
 * Get analytics for all agents in organization
 */
router.get(
  "/analytics/agents",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { period, start, end } = dateRangeSchema.parse(req.query);

      const dateRange = getDateRange(period, start, end);

      // Get org metrics which includes top agents
      const orgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

      // Get detailed metrics for top agents
      const agentMetrics: AgentMetrics[] = await Promise.all(
        orgMetrics.topAgents.slice(0, 20).map((agent) =>
          metricsAggregator.getAgentMetrics(organizationId, agent.agentId, dateRange),
        ),
      );

      res.json({
        success: true,
        data: {
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
          totalAgents: orgMetrics.totalAgents,
          agents: agentMetrics.map((m) => ({
            agentId: m.agentId,
            agentName: m.agentName,
            totalExecutions: m.totalExecutions,
            successRate: m.successRate,
            avgLatencyMs: m.avgLatencyMs,
            p95LatencyMs: m.p95LatencyMs,
            totalCostCents: m.totalCostCents,
            avgRating: m.avgRating,
            uniqueUsers: m.uniqueUsers,
          })),
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get agent analytics",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve agent analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/agents/:id
 * Get detailed analytics for a specific agent
 */
router.get(
  "/analytics/agents/:id",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const agentId = req.params.id as string;
      const { period, start, end } = dateRangeSchema.parse(req.query);

      const dateRange = getDateRange(period, start, end);

      // Get current period metrics
      const currentMetrics = await metricsAggregator.getAgentMetrics(
        organizationId,
        agentId,
        dateRange,
      );

      // Get previous period for trends
      const periodDuration = dateRange.end.getTime() - dateRange.start.getTime();
      const previousRange = {
        start: new Date(dateRange.start.getTime() - periodDuration),
        end: dateRange.start,
      };

      let trends: Trend[] = [];
      try {
        const previousMetrics = await metricsAggregator.getAgentMetrics(
          organizationId,
          agentId,
          previousRange,
        );
        trends = trendAnalyzer.analyzeTrends(currentMetrics, previousMetrics);
      } catch {
        logger.debug("No previous period data for trends", { agentId });
      }

      // Detect anomalies
      const anomalies: Anomaly[] = trendAnalyzer.detectAnomalies(currentMetrics.byDay, 2);

      // Get agent rank
      const rank = await comparisonEngine.getAgentRank(organizationId, agentId, dateRange);

      res.json({
        success: true,
        data: {
          metrics: currentMetrics,
          trends,
          anomalies,
          rank,
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get agent detail analytics",
        { organizationId: req.user?.organizationId, agentId: req.params.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve agent analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/trends
 * Get trend analysis for the organization
 */
router.get(
  "/analytics/trends",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { period, start, end } = dateRangeSchema.parse(req.query);

      const dateRange = getDateRange(period, start, end);

      // Get current period org metrics
      const currentOrgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

      // Get previous period for comparison
      const periodDuration = dateRange.end.getTime() - dateRange.start.getTime();
      const previousRange = {
        start: new Date(dateRange.start.getTime() - periodDuration),
        end: dateRange.start,
      };

      // Detect anomalies in daily trend
      const anomalies = trendAnalyzer.detectAnomalies(currentOrgMetrics.dailyTrend, 2);

      // Generate forecast
      const forecast: ForecastResult = trendAnalyzer.forecast(currentOrgMetrics.dailyTrend, 7);

      // Calculate overall metrics change
      let overallTrends: Trend[] = [];
      try {
        const previousOrgMetrics = await metricsAggregator.getOrgMetrics(
          organizationId,
          previousRange,
        );

        // Create pseudo AgentMetrics for trend analysis
        const currentAsPseudo = {
          agentId: "org",
          period: dateRange,
          totalExecutions: currentOrgMetrics.totalExecutions,
          uniqueUsers: currentOrgMetrics.uniqueUsers,
          successCount: Math.round(
            (currentOrgMetrics.overallSuccessRate / 100) * currentOrgMetrics.totalExecutions,
          ),
          failureCount: Math.round(
            ((100 - currentOrgMetrics.overallSuccessRate) / 100) * currentOrgMetrics.totalExecutions,
          ),
          successRate: currentOrgMetrics.overallSuccessRate,
          avgLatencyMs: currentOrgMetrics.avgLatencyMs,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          totalCostCents: currentOrgMetrics.totalCostCents,
          avgCostCents:
            currentOrgMetrics.totalExecutions > 0
              ? currentOrgMetrics.totalCostCents / currentOrgMetrics.totalExecutions
              : 0,
          avgRating: 0,
          feedbackCount: 0,
          positiveRate: 0,
          byHour: [],
          byDay: [],
          byUser: [],
          byTool: [],
        };

        const previousAsPseudo = {
          ...currentAsPseudo,
          period: previousRange,
          totalExecutions: previousOrgMetrics.totalExecutions,
          uniqueUsers: previousOrgMetrics.uniqueUsers,
          successCount: Math.round(
            (previousOrgMetrics.overallSuccessRate / 100) * previousOrgMetrics.totalExecutions,
          ),
          failureCount: Math.round(
            ((100 - previousOrgMetrics.overallSuccessRate) / 100) *
              previousOrgMetrics.totalExecutions,
          ),
          successRate: previousOrgMetrics.overallSuccessRate,
          avgLatencyMs: previousOrgMetrics.avgLatencyMs,
          totalCostCents: previousOrgMetrics.totalCostCents,
          avgCostCents:
            previousOrgMetrics.totalExecutions > 0
              ? previousOrgMetrics.totalCostCents / previousOrgMetrics.totalExecutions
              : 0,
        };

        overallTrends = trendAnalyzer.analyzeTrends(currentAsPseudo, previousAsPseudo);
      } catch {
        logger.debug("No previous period data for org trends");
      }

      res.json({
        success: true,
        data: {
          trends: overallTrends,
          anomalies,
          forecast,
          dailyData: currentOrgMetrics.dailyTrend,
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get trends",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve trends",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/comparison
 * Compare multiple agents
 */
router.get(
  "/analytics/comparison",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { period, start, end } = dateRangeSchema.parse(req.query);

      // Parse agent IDs from query
      const agentIdsParam = req.query.agentIds;
      let agentIds: string[] = [];
      if (typeof agentIdsParam === "string") {
        agentIds = agentIdsParam.split(",").filter((id) => id.trim());
      } else if (Array.isArray(agentIdsParam)) {
        agentIds = agentIdsParam.map(String).filter((id) => id.trim());
      }

      const dateRange = getDateRange(period, start, end);

      // If no agent IDs specified, compare all active agents
      if (agentIds.length === 0) {
        const { db: prisma } = await import("../db/client");
        const agents = await prisma.agent.findMany({
          where: { organizationId, status: "active" },
          select: { id: true },
          take: 50, // Limit to prevent performance issues
        });
        agentIds = agents.map((a) => a.id);
      }

      const comparison: ComparisonReport = await comparisonEngine.compareAgents(
        organizationId,
        agentIds,
        dateRange,
      );

      res.json({
        success: true,
        data: {
          ...comparison,
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      logger.error(
        "Failed to compare agents",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to compare agents",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/leaderboard
 * Get agent leaderboard
 */
router.get(
  "/analytics/leaderboard",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { period, start, end } = dateRangeSchema.parse(req.query);
      const limit = limitSchema.parse(req.query.limit);

      const dateRange = getDateRange(period, start, end);

      const leaderboard: LeaderboardEntry[] = await comparisonEngine.getLeaderboard(
        organizationId,
        dateRange,
        limit,
      );

      res.json({
        success: true,
        data: {
          leaderboard,
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get leaderboard",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve leaderboard",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /analytics/dimension/:dimension
 * Get metrics grouped by dimension
 */
router.get(
  "/analytics/dimension/:dimension",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const dimension = dimensionSchema.parse(req.params.dimension);
      const { period, start, end } = dateRangeSchema.parse(req.query);

      const dateRange = getDateRange(period, start, end);

      const metrics: DimensionMetrics[] = await metricsAggregator.getMetricsByDimension(
        organizationId,
        dimension,
        dateRange,
      );

      res.json({
        success: true,
        data: {
          dimension,
          metrics: metrics.sort((a, b) => b.executions - a.executions),
          period: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
            type: period,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid dimension",
          message: "Dimension must be one of: agent, user, tool, workflow",
        });
        return;
      }

      logger.error(
        "Failed to get dimension metrics",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve dimension metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * POST /analytics/report
 * Generate analytics report
 */
router.post(
  "/analytics/report",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;

      const bodySchema = z.object({
        title: z.string().default("Agent Performance Report"),
        sections: reportSectionsSchema.default(["overview", "agents", "leaderboard", "costs"]),
        format: z.enum(["json", "csv", "pdf"]).default("json"),
        period: periodSchema,
        start: z.coerce.date().optional(),
        end: z.coerce.date().optional(),
      });

      const { title, sections, format, period, start, end } = bodySchema.parse(req.body);
      const dateRange = getDateRange(period, start, end);

      // Gather data for requested sections
      const orgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

      // Get detailed metrics for all agents
      const agentMetrics = await Promise.all(
        orgMetrics.topAgents.map((a) =>
          metricsAggregator.getAgentMetrics(organizationId, a.agentId, dateRange),
        ),
      );

      const leaderboard = await comparisonEngine.getLeaderboard(organizationId, dateRange, 10);

      // Get trends if requested
      let trends: Trend[] = [];
      let anomalies: Anomaly[] = [];
      if (sections.includes("trends") || sections.includes("anomalies")) {
        anomalies = trendAnalyzer.detectAnomalies(orgMetrics.dailyTrend, 2);

        // Calculate trends
        const periodDuration = dateRange.end.getTime() - dateRange.start.getTime();
        const previousRange = {
          start: new Date(dateRange.start.getTime() - periodDuration),
          end: dateRange.start,
        };

        try {
          const previousOrgMetrics = await metricsAggregator.getOrgMetrics(
            organizationId,
            previousRange,
          );

          const currentAsPseudo = {
            agentId: "org",
            period: dateRange,
            totalExecutions: orgMetrics.totalExecutions,
            uniqueUsers: orgMetrics.uniqueUsers,
            successCount: Math.round(
              (orgMetrics.overallSuccessRate / 100) * orgMetrics.totalExecutions,
            ),
            failureCount: Math.round(
              ((100 - orgMetrics.overallSuccessRate) / 100) * orgMetrics.totalExecutions,
            ),
            successRate: orgMetrics.overallSuccessRate,
            avgLatencyMs: orgMetrics.avgLatencyMs,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            totalCostCents: orgMetrics.totalCostCents,
            avgCostCents:
              orgMetrics.totalExecutions > 0
                ? orgMetrics.totalCostCents / orgMetrics.totalExecutions
                : 0,
            avgRating: 0,
            feedbackCount: 0,
            positiveRate: 0,
            byHour: [],
            byDay: [],
            byUser: [],
            byTool: [],
          };

          const previousAsPseudo = {
            ...currentAsPseudo,
            period: previousRange,
            totalExecutions: previousOrgMetrics.totalExecutions,
            uniqueUsers: previousOrgMetrics.uniqueUsers,
            successCount: Math.round(
              (previousOrgMetrics.overallSuccessRate / 100) * previousOrgMetrics.totalExecutions,
            ),
            failureCount: Math.round(
              ((100 - previousOrgMetrics.overallSuccessRate) / 100) *
                previousOrgMetrics.totalExecutions,
            ),
            successRate: previousOrgMetrics.overallSuccessRate,
            avgLatencyMs: previousOrgMetrics.avgLatencyMs,
            totalCostCents: previousOrgMetrics.totalCostCents,
            avgCostCents:
              previousOrgMetrics.totalExecutions > 0
                ? previousOrgMetrics.totalCostCents / previousOrgMetrics.totalExecutions
                : 0,
          };

          trends = trendAnalyzer.analyzeTrends(currentAsPseudo, previousAsPseudo);
        } catch {
          logger.debug("No previous period data for report trends");
        }
      }

      const config: ReportConfig = { title, sections, format };
      const report: AnalyticsReport = reportBuilder.buildReport(config, {
        orgMetrics,
        agentMetrics,
        trends,
        anomalies,
        leaderboard,
      });

      if (format === "csv") {
        const csv = reportBuilder.exportToCSV(report);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="analytics-report-${new Date().toISOString().split("T")[0]}.csv"`,
        );
        res.send(csv);
        return;
      }

      if (format === "pdf") {
        const pdfHtml = reportBuilder.exportToPDF(report);
        res.setHeader("Content-Type", "text/html");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="analytics-report-${new Date().toISOString().split("T")[0]}.pdf.html"`,
        );
        res.send(pdfHtml);
        return;
      }

      res.json({
        success: true,
        data: report,
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
        "Failed to generate report",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to generate report",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default router;
