/**
 * Agent Metrics API Routes
 *
 * Provides endpoints for agent monitoring and observability:
 * - GET /api/metrics/agents - Agent performance summary
 * - GET /api/metrics/agents/:id - Single agent metrics
 * - GET /api/metrics/workflows - Workflow metrics
 * - GET /api/metrics/tools - Tool usage metrics
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { metricsCollector, getAllAgentSessions, getAgentLastError } from "../services/metrics";
import { agentRegistry } from "../orchestrator/agent-registry";
import { logger } from "../utils/logger";

const router = Router();

export interface AgentMetricsSummary {
  agentId: string;
  name: string;
  description: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  p95Duration: number;
  topTools: { name: string; count: number }[];
  errorRate: number;
  activeSessions: number;
  lastError?: { message: string; timestamp: Date };
}

export interface WorkflowMetricsSummary {
  workflowId: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  p95Duration: number;
  stepMetrics: Array<{
    stepId: string;
    stepType: string;
    avgDuration: number;
    executionCount: number;
  }>;
}

export interface ToolMetricsSummary {
  toolName: string;
  totalCalls: number;
  successRate: number;
  agentUsage: Array<{
    agentId: string;
    callCount: number;
  }>;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getAgentExecutionMetrics(agentId?: string): {
  executions: number;
  successes: number;
  failures: number;
  durations: number[];
} {
  const counterValues = metricsCollector.getCounterValues("agent_execution_duration_seconds");
  const histogramValues = metricsCollector.getHistogramValues("agent_execution_duration_seconds");

  let executions = 0;
  let successes = 0;
  let failures = 0;

  for (const { labels, value } of counterValues) {
    if (agentId && labels.agent_id !== agentId) continue;
    executions += value;
    if (labels.status === "success") {
      successes += value;
    } else {
      failures += value;
    }
  }

  return {
    executions,
    successes,
    failures,
    durations: histogramValues,
  };
}

function getToolMetrics(
  agentId?: string,
  toolName?: string,
): Map<string, { total: number; success: number }> {
  const toolMetrics = new Map<string, { total: number; success: number }>();
  const counterValues = metricsCollector.getCounterValues("agent_tool_calls_total");

  for (const { labels, value } of counterValues) {
    if (agentId && labels.agent_id !== agentId) continue;
    if (toolName && labels.tool_name !== toolName) continue;

    const key = labels.tool_name || "unknown";
    const existing = toolMetrics.get(key) || { total: 0, success: 0 };
    existing.total += value;
    if (labels.status === "success") {
      existing.success += value;
    }
    toolMetrics.set(key, existing);
  }

  return toolMetrics;
}

function getAgentErrorMetrics(agentId?: string): Map<string, number> {
  const errorMetrics = new Map<string, number>();
  const counterValues = metricsCollector.getCounterValues("agent_errors_total");

  for (const { labels, value } of counterValues) {
    if (agentId && labels.agent_id !== agentId) continue;

    const key = labels.error_type || "unknown";
    const existing = errorMetrics.get(key) || 0;
    errorMetrics.set(key, existing + value);
  }

  return errorMetrics;
}

/**
 * GET /api/metrics/agents
 * Returns performance summary for all agents
 */
router.get(
  "/metrics/agents",
  requireAuth,
  requirePermission(Permission.DASHBOARD_READ),
  async (_req: Request, res: Response) => {
    try {
      const agents = agentRegistry.getAllAgents();
      const activeSessions = getAllAgentSessions();
      const summaries: AgentMetricsSummary[] = [];

      for (const agent of agents) {
        const execMetrics = getAgentExecutionMetrics(agent.id);
        const toolMetrics = getToolMetrics(agent.id);
        const errorMetrics = getAgentErrorMetrics(agent.id);
        const lastError = getAgentLastError(agent.id);

        const totalErrors = Array.from(errorMetrics.values()).reduce((a, b) => a + b, 0);
        const topTools = Array.from(toolMetrics.entries())
          .map(([name, stats]) => ({ name, count: stats.total }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const successRate =
          execMetrics.executions > 0 ? (execMetrics.successes / execMetrics.executions) * 100 : 0;

        const errorRate =
          execMetrics.executions > 0 ? (totalErrors / execMetrics.executions) * 100 : 0;

        summaries.push({
          agentId: agent.id,
          name: agent.name,
          description: agent.description,
          totalExecutions: execMetrics.executions,
          successRate: Math.round(successRate * 100) / 100,
          avgDuration:
            execMetrics.durations.length > 0
              ? Math.round(
                  (execMetrics.durations.reduce((a, b) => a + b, 0) /
                    execMetrics.durations.length) *
                    1000,
                ) / 1000
              : 0,
          p95Duration:
            execMetrics.durations.length > 0
              ? Math.round(percentile(execMetrics.durations, 0.95) * 1000) / 1000
              : 0,
          topTools,
          errorRate: Math.round(errorRate * 100) / 100,
          activeSessions: activeSessions.get(agent.id) || 0,
          lastError,
        });
      }

      return res.json({
        agents: summaries,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch agent metrics", { error });
      return res.status(500).json({ error: "Failed to fetch agent metrics" });
    }
  },
);

/**
 * GET /api/metrics/agents/:id
 * Returns detailed metrics for a single agent
 */
router.get(
  "/metrics/agents/:id",
  requireAuth,
  requirePermission(Permission.DASHBOARD_READ),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.id as string;
      const agent = agentRegistry.getAgent(agentId as any);

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const execMetrics = getAgentExecutionMetrics(agentId);
      const toolMetrics = getToolMetrics(agentId);
      const errorMetrics = getAgentErrorMetrics(agentId);
      const activeSessions = getAllAgentSessions();
      const lastError = getAgentLastError(agentId);

      const totalErrors = Array.from(errorMetrics.values()).reduce((a, b) => a + b, 0);
      const tools = Array.from(toolMetrics.entries()).map(([name, stats]) => ({
        name,
        totalCalls: stats.total,
        successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
      }));

      const errors = Array.from(errorMetrics.entries()).map(([type, count]) => ({
        type,
        count,
      }));

      const successRate =
        execMetrics.executions > 0 ? (execMetrics.successes / execMetrics.executions) * 100 : 0;

      return res.json({
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          emoji: agent.emoji,
          category: agent.category,
          capabilities: agent.capabilities.map((c) => c.name),
        },
        metrics: {
          totalExecutions: execMetrics.executions,
          successfulExecutions: execMetrics.successes,
          failedExecutions: execMetrics.failures,
          successRate: Math.round(successRate * 100) / 100,
          avgDuration:
            execMetrics.durations.length > 0
              ? Math.round(
                  (execMetrics.durations.reduce((a, b) => a + b, 0) /
                    execMetrics.durations.length) *
                    1000,
                ) / 1000
              : 0,
          p50Duration:
            execMetrics.durations.length > 0
              ? Math.round(percentile(execMetrics.durations, 0.5) * 1000) / 1000
              : 0,
          p95Duration:
            execMetrics.durations.length > 0
              ? Math.round(percentile(execMetrics.durations, 0.95) * 1000) / 1000
              : 0,
          p99Duration:
            execMetrics.durations.length > 0
              ? Math.round(percentile(execMetrics.durations, 0.99) * 1000) / 1000
              : 0,
          totalErrors,
          activeSessions: activeSessions.get(agentId) || 0,
        },
        tools,
        errors,
        lastError,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch agent metrics", { error, agentId: req.params.id });
      return res.status(500).json({ error: "Failed to fetch agent metrics" });
    }
  },
);

/**
 * GET /api/metrics/workflows
 * Returns workflow execution metrics
 */
router.get(
  "/metrics/workflows",
  requireAuth,
  requirePermission(Permission.DASHBOARD_READ),
  async (_req: Request, res: Response) => {
    try {
      const histogramValues = metricsCollector.getHistogramValues("workflow_step_duration_seconds");
      const counterValues = metricsCollector.getCounterValues("workflow_step_duration_seconds");

      const workflowMetrics = new Map<
        string,
        {
          executions: number;
          durations: number[];
          steps: Map<string, { type: string; durations: number[]; count: number }>;
        }
      >();

      for (const { labels, value } of counterValues) {
        const workflowId = labels.workflow_id || "unknown";
        const stepId = labels.step_id || "unknown";
        const stepType = labels.step_type || "unknown";

        if (!workflowMetrics.has(workflowId)) {
          workflowMetrics.set(workflowId, {
            executions: 0,
            durations: [],
            steps: new Map(),
          });
        }

        const wf = workflowMetrics.get(workflowId)!;
        wf.executions += value;

        if (!wf.steps.has(stepId)) {
          wf.steps.set(stepId, { type: stepType, durations: [], count: 0 });
        }
        const step = wf.steps.get(stepId)!;
        step.count += value;
      }

      const summaries: WorkflowMetricsSummary[] = [];

      for (const [workflowId, data] of workflowMetrics) {
        const stepMetrics = Array.from(data.steps.entries()).map(([stepId, step]) => ({
          stepId,
          stepType: step.type,
          avgDuration:
            step.durations.length > 0
              ? Math.round(
                  (step.durations.reduce((a, b) => a + b, 0) / step.durations.length) * 1000,
                ) / 1000
              : 0,
          executionCount: step.count,
        }));

        summaries.push({
          workflowId,
          totalExecutions: data.executions,
          successRate: 100, // Would need success/failure tracking
          avgDuration:
            data.durations.length > 0
              ? Math.round(
                  (data.durations.reduce((a, b) => a + b, 0) / data.durations.length) * 1000,
                ) / 1000
              : 0,
          p95Duration:
            data.durations.length > 0
              ? Math.round(percentile(data.durations, 0.95) * 1000) / 1000
              : 0,
          stepMetrics,
        });
      }

      return res.json({
        workflows: summaries,
        globalDurations: {
          avg:
            histogramValues.length > 0
              ? Math.round(
                  (histogramValues.reduce((a, b) => a + b, 0) / histogramValues.length) * 1000,
                ) / 1000
              : 0,
          p95:
            histogramValues.length > 0
              ? Math.round(percentile(histogramValues, 0.95) * 1000) / 1000
              : 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch workflow metrics", { error });
      return res.status(500).json({ error: "Failed to fetch workflow metrics" });
    }
  },
);

/**
 * GET /api/metrics/tools
 * Returns tool usage metrics across all agents
 */
router.get(
  "/metrics/tools",
  requireAuth,
  requirePermission(Permission.DASHBOARD_READ),
  async (_req: Request, res: Response) => {
    try {
      const counterValues = metricsCollector.getCounterValues("agent_tool_calls_total");

      const toolMetrics = new Map<
        string,
        {
          total: number;
          success: number;
          agentUsage: Map<string, number>;
        }
      >();

      for (const { labels, value } of counterValues) {
        const toolName = labels.tool_name || "unknown";
        const agentId = labels.agent_id || "unknown";
        const isSuccess = labels.status === "success";

        if (!toolMetrics.has(toolName)) {
          toolMetrics.set(toolName, {
            total: 0,
            success: 0,
            agentUsage: new Map(),
          });
        }

        const tool = toolMetrics.get(toolName)!;
        tool.total += value;
        if (isSuccess) {
          tool.success += value;
        }

        const currentAgentCount = tool.agentUsage.get(agentId) || 0;
        tool.agentUsage.set(agentId, currentAgentCount + value);
      }

      const summaries: ToolMetricsSummary[] = [];

      for (const [toolName, data] of toolMetrics) {
        const agentUsage = Array.from(data.agentUsage.entries())
          .map(([agentId, callCount]) => ({ agentId, callCount }))
          .sort((a, b) => b.callCount - a.callCount);

        summaries.push({
          toolName,
          totalCalls: data.total,
          successRate: data.total > 0 ? Math.round((data.success / data.total) * 10000) / 100 : 0,
          agentUsage,
        });
      }

      // Sort by total calls descending
      summaries.sort((a, b) => b.totalCalls - a.totalCalls);

      return res.json({
        tools: summaries,
        totalToolCalls: summaries.reduce((sum, t) => sum + t.totalCalls, 0),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch tool metrics", { error });
      return res.status(500).json({ error: "Failed to fetch tool metrics" });
    }
  },
);

/**
 * GET /api/metrics/delegations
 * Returns agent delegation metrics
 */
router.get(
  "/metrics/delegations",
  requireAuth,
  requirePermission(Permission.DASHBOARD_READ),
  async (_req: Request, res: Response) => {
    try {
      const counterValues = metricsCollector.getCounterValues("agent_delegations_total");

      const delegationMetrics = new Map<
        string,
        {
          total: number;
          success: number;
          targets: Map<string, { total: number; success: number }>;
        }
      >();

      for (const { labels, value } of counterValues) {
        const fromAgent = labels.from_agent || "unknown";
        const toAgent = labels.to_agent || "unknown";
        const isSuccess = labels.status === "success";

        if (!delegationMetrics.has(fromAgent)) {
          delegationMetrics.set(fromAgent, {
            total: 0,
            success: 0,
            targets: new Map(),
          });
        }

        const source = delegationMetrics.get(fromAgent)!;
        source.total += value;
        if (isSuccess) {
          source.success += value;
        }

        if (!source.targets.has(toAgent)) {
          source.targets.set(toAgent, { total: 0, success: 0 });
        }
        const target = source.targets.get(toAgent)!;
        target.total += value;
        if (isSuccess) {
          target.success += value;
        }
      }

      const summaries = Array.from(delegationMetrics.entries()).map(([fromAgent, data]) => ({
        fromAgent,
        totalDelegations: data.total,
        successRate: data.total > 0 ? Math.round((data.success / data.total) * 10000) / 100 : 0,
        targets: Array.from(data.targets.entries()).map(([toAgent, stats]) => ({
          toAgent,
          count: stats.total,
          successRate:
            stats.total > 0 ? Math.round((stats.success / stats.total) * 10000) / 100 : 0,
        })),
      }));

      return res.json({
        delegations: summaries,
        totalDelegations: summaries.reduce((sum, d) => sum + d.totalDelegations, 0),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch delegation metrics", { error });
      return res.status(500).json({ error: "Failed to fetch delegation metrics" });
    }
  },
);

export default router;
