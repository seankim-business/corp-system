/**
 * Analytics MCP Provider
 *
 * Provides MCP tools for analytics and metrics.
 * Agents can retrieve performance metrics, trends, comparisons, and reports.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import {
  metricsAggregator,
  getDateRange,
  type OrgMetrics,
  type AgentMetrics,
  type DimensionMetrics,
} from "../../services/analytics/metrics-aggregator";
import {
  trendAnalyzer,
  type Trend,
  type Anomaly,
  type ForecastResult,
} from "../../services/analytics/trend-analyzer";
import {
  comparisonEngine,
  type ComparisonReport,
  type LeaderboardEntry,
} from "../../services/analytics/comparison-engine";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "analytics__summary",
    description: "Get organization-wide analytics overview including total executions, success rate, costs, and top agents",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "object" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__agent_performance",
    description: "Get detailed performance metrics for a specific agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The agent ID to get metrics for",
        },
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
      },
      required: ["agentId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        metrics: { type: "object" },
        trends: { type: "array" },
        anomalies: { type: "array" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__trends",
    description: "Get trend analysis for the organization including forecasts and anomaly detection",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
        forecastDays: {
          type: "number",
          description: "Number of days to forecast (default 7)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        trends: { type: "array" },
        anomalies: { type: "array" },
        forecast: { type: "object" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__leaderboard",
    description: "Get agent performance leaderboard/rankings",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of agents to return (default 10)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        leaderboard: { type: "array" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__compare_agents",
    description: "Compare multiple agents side by side",
    inputSchema: {
      type: "object",
      properties: {
        agentIds: {
          type: "array",
          items: { type: "string" },
          description: "List of agent IDs to compare (leave empty to compare all)",
        },
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        comparison: { type: "object" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__dimension",
    description: "Get metrics grouped by a specific dimension (agent, user, tool, or workflow)",
    inputSchema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          description: "Dimension to group by",
          enum: ["agent", "user", "tool", "workflow"],
        },
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
      },
      required: ["dimension"],
    },
    outputSchema: {
      type: "object",
      properties: {
        metrics: { type: "array" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "analytics__cost_summary",
    description: "Get cost summary for the organization",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Time period: day, week, month, or custom",
          enum: ["day", "week", "month", "custom"],
        },
        start: {
          type: "string",
          description: "Start date (ISO format, required for custom period)",
        },
        end: {
          type: "string",
          description: "End date (ISO format, optional)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        costs: { type: "object" },
      },
    },
    provider: "analytics",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
];

interface SummaryArgs {
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
}

interface AgentPerformanceArgs {
  agentId: string;
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
}

interface TrendsArgs {
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
  forecastDays?: number;
}

interface LeaderboardArgs {
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
  limit?: number;
}

interface CompareArgs {
  agentIds?: string[];
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
}

interface DimensionArgs {
  dimension: "agent" | "user" | "tool" | "workflow";
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
}

interface CostSummaryArgs {
  period?: "day" | "week" | "month" | "custom";
  start?: string;
  end?: string;
}

export function createAnalyticsProvider() {
  return {
    name: "analytics",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;
        const actualToolName = toolName.replace("analytics__", "");

        switch (actualToolName) {
          case "summary":
            result = await getSummary(args as any, context.organizationId);
            break;
          case "agent_performance":
            result = await getAgentPerformance(args as any, context.organizationId);
            break;
          case "trends":
            result = await getTrends(args as any, context.organizationId);
            break;
          case "leaderboard":
            result = await getLeaderboard(args as any, context.organizationId);
            break;
          case "compare_agents":
            result = await compareAgents(args as any, context.organizationId);
            break;
          case "dimension":
            result = await getDimensionMetrics(args as any, context.organizationId);
            break;
          case "cost_summary":
            result = await getCostSummary(args as any, context.organizationId);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Analytics tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

function parseDateRange(args: { period?: string; start?: string; end?: string }) {
  const period = (args.period || "month") as "day" | "week" | "month" | "custom";
  const start = args.start ? new Date(args.start) : undefined;
  const end = args.end ? new Date(args.end) : undefined;
  return getDateRange(period, start, end);
}

async function getSummary(
  args: SummaryArgs,
  organizationId: string,
): Promise<{
  summary: Omit<OrgMetrics, "period"> & {
    period: { start: string; end: string; type: string };
  };
}> {
  const dateRange = parseDateRange(args);

  const orgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

  // Extract period and override with string format
  const { period: _period, ...restMetrics } = orgMetrics;

  return {
    summary: {
      ...restMetrics,
      period: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
        type: args.period || "month",
      },
    },
  };
}

async function getAgentPerformance(
  args: AgentPerformanceArgs,
  organizationId: string,
): Promise<{
  metrics: AgentMetrics;
  trends: Trend[];
  anomalies: Anomaly[];
  rank: { rank: number; total: number; percentile: number };
}> {
  const { agentId } = args;
  const dateRange = parseDateRange(args);

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

  return { metrics: currentMetrics, trends, anomalies, rank };
}

async function getTrends(
  args: TrendsArgs,
  organizationId: string,
): Promise<{
  trends: Trend[];
  anomalies: Anomaly[];
  forecast: ForecastResult;
  dailyData: unknown[];
}> {
  const dateRange = parseDateRange(args);
  const forecastDays = args.forecastDays || 7;

  // Get current period org metrics
  const currentOrgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

  // Detect anomalies in daily trend
  const anomalies = trendAnalyzer.detectAnomalies(currentOrgMetrics.dailyTrend, 2);

  // Generate forecast
  const forecast: ForecastResult = trendAnalyzer.forecast(
    currentOrgMetrics.dailyTrend,
    forecastDays,
  );

  // Calculate overall metrics change
  let overallTrends: Trend[] = [];
  try {
    const periodDuration = dateRange.end.getTime() - dateRange.start.getTime();
    const previousRange = {
      start: new Date(dateRange.start.getTime() - periodDuration),
      end: dateRange.start,
    };

    const previousOrgMetrics = await metricsAggregator.getOrgMetrics(
      organizationId,
      previousRange,
    );

    // Create pseudo AgentMetrics for trend analysis
    const currentAsPseudo = createPseudoAgentMetrics(currentOrgMetrics, dateRange);
    const previousAsPseudo = createPseudoAgentMetrics(previousOrgMetrics, previousRange);

    overallTrends = trendAnalyzer.analyzeTrends(currentAsPseudo, previousAsPseudo);
  } catch {
    logger.debug("No previous period data for org trends");
  }

  return {
    trends: overallTrends,
    anomalies,
    forecast,
    dailyData: currentOrgMetrics.dailyTrend,
  };
}

async function getLeaderboard(
  args: LeaderboardArgs,
  organizationId: string,
): Promise<{ leaderboard: LeaderboardEntry[] }> {
  const dateRange = parseDateRange(args);
  const limit = Math.min(args.limit || 10, 100);

  const leaderboard = await comparisonEngine.getLeaderboard(organizationId, dateRange, limit);

  return { leaderboard };
}

async function compareAgents(
  args: CompareArgs,
  organizationId: string,
): Promise<{ comparison: ComparisonReport }> {
  const dateRange = parseDateRange(args);
  let agentIds = args.agentIds || [];

  // If no agent IDs specified, compare all active agents
  if (agentIds.length === 0) {
    const { db: prisma } = await import("../../db/client");
    const agents = await prisma.agent.findMany({
      where: { organizationId, status: "active" },
      select: { id: true },
      take: 50,
    });
    agentIds = agents.map((a) => a.id);
  }

  const comparison = await comparisonEngine.compareAgents(organizationId, agentIds, dateRange);

  return { comparison };
}

async function getDimensionMetrics(
  args: DimensionArgs,
  organizationId: string,
): Promise<{ dimension: string; metrics: DimensionMetrics[] }> {
  const { dimension } = args;
  const dateRange = parseDateRange(args);

  const metrics = await metricsAggregator.getMetricsByDimension(
    organizationId,
    dimension,
    dateRange,
  );

  return {
    dimension,
    metrics: metrics.sort((a, b) => b.executions - a.executions),
  };
}

async function getCostSummary(
  args: CostSummaryArgs,
  organizationId: string,
): Promise<{
  costs: {
    totalCostCents: number;
    avgCostPerExecution: number;
    totalExecutions: number;
    costByDay: Array<{ date: string; costCents: number }>;
    topCostAgents: Array<{ agentId: string; agentName?: string; costCents: number }>;
  };
}> {
  const dateRange = parseDateRange(args);

  const orgMetrics = await metricsAggregator.getOrgMetrics(organizationId, dateRange);

  // Calculate cost breakdown from daily trend
  const costByDay = orgMetrics.dailyTrend.map((d) => ({
    date: d.date,
    costCents: d.costCents,
  }));

  // Get top cost agents
  const topCostAgents = orgMetrics.topAgents
    .slice(0, 10)
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      costCents: 0, // Would need per-agent cost data
    }));

  return {
    costs: {
      totalCostCents: orgMetrics.totalCostCents,
      avgCostPerExecution:
        orgMetrics.totalExecutions > 0
          ? orgMetrics.totalCostCents / orgMetrics.totalExecutions
          : 0,
      totalExecutions: orgMetrics.totalExecutions,
      costByDay,
      topCostAgents,
    },
  };
}

// Helper to create pseudo AgentMetrics from OrgMetrics for trend analysis
function createPseudoAgentMetrics(
  orgMetrics: OrgMetrics,
  period: { start: Date; end: Date },
): AgentMetrics {
  return {
    agentId: "org",
    period,
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
    byDay: orgMetrics.dailyTrend,
    byUser: [],
    byTool: [],
  };
}
