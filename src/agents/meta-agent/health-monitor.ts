/**
 * Health Monitor - System Health Monitoring Service
 *
 * Monitors and tracks the health of all agents and infrastructure components.
 * Provides real-time health scores, anomaly detection, and historical trends.
 */

import { db as prisma } from "../../db/client";
import { redis, getQueueConnection, releaseQueueConnection } from "../../db/redis";
import { logger } from "../../utils/logger";
import { getAllAgentSessions, getAgentLastError } from "../../services/metrics";
import { getAgentsMap, AgentConfig } from "../../config/agent-loader";

// ============================================================================
// Types
// ============================================================================

export interface AgentHealth {
  agentId: string;
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  metrics: {
    totalExecutions: number;
    successRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    activeSessions: number;
    lastActivityAt?: Date;
  };
  trends: {
    executionsTrend: "up" | "down" | "stable";
    latencyTrend: "up" | "down" | "stable";
    errorTrend: "up" | "down" | "stable";
  };
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface WorkflowHealth {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  pendingCount: number;
  failedInLast24h: number;
}

export interface InfraHealth {
  database: {
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs: number;
  };
  redis: {
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs: number;
    memoryUsedMb: number;
  };
  integrations: {
    slack: "healthy" | "degraded" | "unhealthy" | "not_configured";
    notion: "healthy" | "degraded" | "unhealthy" | "not_configured";
    github: "healthy" | "degraded" | "unhealthy" | "not_configured";
  };
}

export interface Anomaly {
  type: "high_error_rate" | "high_latency" | "low_activity" | "budget_warning" | "integration_failure";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedEntity: string;
  detectedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  timestamp: Date;
  overallScore: number; // 0-100
  status: "healthy" | "degraded" | "unhealthy" | "critical";
  agents: AgentHealth[];
  workflows: WorkflowHealth;
  infrastructure: InfraHealth;
  anomalies: Anomaly[];
  summary: {
    totalAgents: number;
    healthyAgents: number;
    degradedAgents: number;
    unhealthyAgents: number;
    totalExecutionsLast24h: number;
    overallSuccessRate: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateTrend(current: number, previous: number): "up" | "down" | "stable" {
  const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  if (changePercent > 10) return "up";
  if (changePercent < -10) return "down";
  return "stable";
}

function determineAgentStatus(successRate: number, errorRate: number, latencyMs: number): "healthy" | "degraded" | "unhealthy" {
  if (errorRate > 20 || successRate < 70 || latencyMs > 30000) {
    return "unhealthy";
  }
  if (errorRate > 10 || successRate < 85 || latencyMs > 15000) {
    return "degraded";
  }
  return "healthy";
}

function calculateOverallScore(agents: AgentHealth[], workflows: WorkflowHealth, infra: InfraHealth, anomalies: Anomaly[]): number {
  let score = 100;

  // Agent health impact (40% weight)
  const unhealthyAgents = agents.filter(a => a.status === "unhealthy").length;
  const degradedAgents = agents.filter(a => a.status === "degraded").length;
  score -= unhealthyAgents * 10;
  score -= degradedAgents * 5;

  // Workflow health impact (20% weight)
  if (workflows.successRate < 90) {
    score -= (90 - workflows.successRate) * 0.2;
  }
  if (workflows.failedInLast24h > 10) {
    score -= Math.min(10, workflows.failedInLast24h - 10);
  }

  // Infrastructure health impact (25% weight)
  if (infra.database.status === "unhealthy") score -= 15;
  else if (infra.database.status === "degraded") score -= 5;

  if (infra.redis.status === "unhealthy") score -= 10;
  else if (infra.redis.status === "degraded") score -= 3;

  // Anomaly impact (15% weight)
  for (const anomaly of anomalies) {
    switch (anomaly.severity) {
      case "critical": score -= 10; break;
      case "high": score -= 5; break;
      case "medium": score -= 2; break;
      case "low": score -= 1; break;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================================
// Health Monitor Class
// ============================================================================

export class HealthMonitor {
  private readonly HEALTH_CACHE_KEY = "meta_agent:health";
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

  /**
   * Check overall system health
   */
  async checkHealth(organizationId: string): Promise<SystemHealth> {
    const timestamp = new Date();

    // Check cache first
    const cached = await this.getCachedHealth(organizationId);
    if (cached) {
      return cached;
    }

    // Collect all health data in parallel
    const [agents, workflows, infrastructure, anomalies] = await Promise.all([
      this.getAgentHealthList(organizationId),
      this.getWorkflowHealth(organizationId),
      this.getInfraHealth(organizationId),
      this.detectAnomalies(organizationId),
    ]);

    const overallScore = calculateOverallScore(agents, workflows, infrastructure, anomalies);

    const health: SystemHealth = {
      timestamp,
      overallScore,
      status: overallScore >= 80 ? "healthy" : overallScore >= 60 ? "degraded" : overallScore >= 40 ? "unhealthy" : "critical",
      agents,
      workflows,
      infrastructure,
      anomalies,
      summary: {
        totalAgents: agents.length,
        healthyAgents: agents.filter(a => a.status === "healthy").length,
        degradedAgents: agents.filter(a => a.status === "degraded").length,
        unhealthyAgents: agents.filter(a => a.status === "unhealthy").length,
        totalExecutionsLast24h: agents.reduce((sum, a) => sum + a.metrics.totalExecutions, 0),
        overallSuccessRate: agents.length > 0
          ? Math.round(agents.reduce((sum, a) => sum + a.metrics.successRate, 0) / agents.length * 100) / 100
          : 0,
      },
    };

    // Cache the result
    await this.cacheHealth(organizationId, health);

    return health;
  }

  /**
   * Get health for a specific agent
   */
  async getAgentHealth(organizationId: string, agentId: string): Promise<AgentHealth | null> {
    const agents = await this.getAgentHealthList(organizationId);
    return agents.find(a => a.agentId === agentId) || null;
  }

  /**
   * Get health for all agents
   */
  private async getAgentHealthList(organizationId: string): Promise<AgentHealth[]> {
    const agentsMap = getAgentsMap();
    const activeSessions = getAllAgentSessions();
    const results: AgentHealth[] = [];

    // Get execution data from the last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: last24h },
      },
      select: {
        id: true,
        status: true,
        duration: true,
        category: true,
        errorMessage: true,
        createdAt: true,
        metadata: true,
      },
    });

    // Get previous 24h data for trend calculation
    const prev24hStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const prevExecutions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: prev24hStart, lt: last24h },
      },
      select: {
        status: true,
        duration: true,
      },
    });

    // Group executions by agent (using category as agent identifier)
    const agentExecutions = new Map<string, typeof executions>();
    const prevAgentExecutions = new Map<string, typeof prevExecutions>();

    for (const exec of executions) {
      const agentId = exec.category || "unknown";
      if (!agentExecutions.has(agentId)) {
        agentExecutions.set(agentId, []);
      }
      agentExecutions.get(agentId)!.push(exec);
    }

    for (const exec of prevExecutions) {
      const agentId = "unknown"; // Would need metadata to determine agent
      if (!prevAgentExecutions.has(agentId)) {
        prevAgentExecutions.set(agentId, []);
      }
      prevAgentExecutions.get(agentId)!.push(exec);
    }

    // Build health data for each configured agent
    for (const [agentId, agentConfig] of Object.entries(agentsMap) as [string, AgentConfig][]) {
      const agentExecs = agentExecutions.get(agentId) || [];
      const prevAgentExecs = prevAgentExecutions.get(agentId) || [];

      const totalExecutions = agentExecs.length;
      const successfulExecs = agentExecs.filter(e => e.status === "completed" || e.status === "success");
      const failedExecs = agentExecs.filter(e => e.status === "failed" || e.status === "error");
      const successRate = totalExecutions > 0 ? (successfulExecs.length / totalExecutions) * 100 : 100;
      const errorRate = totalExecutions > 0 ? (failedExecs.length / totalExecutions) * 100 : 0;

      const durations = agentExecs.map(e => e.duration).filter(d => d > 0);
      const avgLatencyMs = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      const p95LatencyMs = percentile(durations, 0.95);

      // Calculate trends
      const prevTotalExecs = prevAgentExecs.length;
      const prevDurations = prevAgentExecs.map(e => e.duration).filter(d => d > 0);
      const prevAvgLatency = prevDurations.length > 0
        ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length
        : 0;
      const prevErrorRate = prevTotalExecs > 0
        ? (prevAgentExecs.filter(e => e.status === "failed" || e.status === "error").length / prevTotalExecs) * 100
        : 0;

      const lastError = getAgentLastError(agentId);
      const lastActivity = agentExecs.length > 0
        ? agentExecs.reduce((latest, e) => e.createdAt > latest ? e.createdAt : latest, agentExecs[0].createdAt)
        : undefined;

      results.push({
        agentId,
        name: agentConfig.name,
        status: determineAgentStatus(successRate, errorRate, avgLatencyMs),
        metrics: {
          totalExecutions,
          successRate: Math.round(successRate * 100) / 100,
          avgLatencyMs,
          p95LatencyMs,
          errorRate: Math.round(errorRate * 100) / 100,
          activeSessions: activeSessions.get(agentId) || 0,
          lastActivityAt: lastActivity,
        },
        trends: {
          executionsTrend: calculateTrend(totalExecutions, prevTotalExecs),
          latencyTrend: calculateTrend(avgLatencyMs, prevAvgLatency),
          errorTrend: calculateTrend(errorRate, prevErrorRate),
        },
        lastError,
      });
    }

    return results;
  }

  /**
   * Get workflow health metrics
   */
  private async getWorkflowHealth(organizationId: string): Promise<WorkflowHealth> {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [executions, pendingCount] = await Promise.all([
      prisma.workflowExecution.findMany({
        where: {
          workflow: { organizationId },
          createdAt: { gte: last24h },
        },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          status: "pending",
        },
      }),
    ]);

    const totalExecutions = executions.length;
    const completedExecs = executions.filter(e => e.status === "completed");
    const failedExecs = executions.filter(e => e.status === "failed");

    const durations = executions
      .filter(e => e.startedAt && e.completedAt)
      .map(e => e.completedAt!.getTime() - e.startedAt!.getTime());

    return {
      totalExecutions,
      successRate: totalExecutions > 0
        ? Math.round((completedExecs.length / totalExecutions) * 10000) / 100
        : 100,
      avgDurationMs: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      pendingCount,
      failedInLast24h: failedExecs.length,
    };
  }

  /**
   * Get infrastructure health
   */
  private async getInfraHealth(organizationId: string): Promise<InfraHealth> {
    // Check database health
    const dbStart = Date.now();
    let dbStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;
      if (dbLatency > 1000) dbStatus = "degraded";
    } catch {
      dbStatus = "unhealthy";
    }

    // Check Redis health
    const redisStart = Date.now();
    let redisStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    let redisMemory = 0;
    const redisConn = await getQueueConnection();
    try {
      await redisConn.ping();
      const redisLatency = Date.now() - redisStart;
      if (redisLatency > 500) redisStatus = "degraded";

      // Get memory usage
      const info = await redisConn.info("memory");
      const memoryMatch = info.match(/used_memory:(\d+)/);
      if (memoryMatch) {
        redisMemory = Math.round(parseInt(memoryMatch[1], 10) / 1024 / 1024);
      }
    } catch {
      redisStatus = "unhealthy";
    } finally {
      releaseQueueConnection(redisConn);
    }

    // Check integrations
    const [slackIntegration, notionConnection] = await Promise.all([
      prisma.slackIntegration.findFirst({
        where: { organizationId, enabled: true },
        select: { healthStatus: true },
      }),
      prisma.notionConnection.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
    ]);

    return {
      database: {
        status: dbStatus,
        latencyMs: Date.now() - dbStart,
      },
      redis: {
        status: redisStatus,
        latencyMs: Date.now() - redisStart,
        memoryUsedMb: redisMemory,
      },
      integrations: {
        slack: slackIntegration
          ? (slackIntegration.healthStatus as "healthy" | "degraded" | "unhealthy")
          : "not_configured",
        notion: notionConnection ? "healthy" : "not_configured",
        github: "not_configured", // Would need GitHub connection check
      },
    };
  }

  /**
   * Detect anomalies in the system
   */
  async detectAnomalies(organizationId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const now = new Date();

    // Check for high error rates
    const agents = await this.getAgentHealthList(organizationId);
    for (const agent of agents) {
      if (agent.metrics.errorRate > 20) {
        anomalies.push({
          type: "high_error_rate",
          severity: agent.metrics.errorRate > 50 ? "critical" : "high",
          description: `Agent ${agent.name} has error rate of ${agent.metrics.errorRate}%`,
          affectedEntity: agent.agentId,
          detectedAt: now,
          metadata: { errorRate: agent.metrics.errorRate },
        });
      }

      if (agent.metrics.avgLatencyMs > 15000) {
        anomalies.push({
          type: "high_latency",
          severity: agent.metrics.avgLatencyMs > 30000 ? "high" : "medium",
          description: `Agent ${agent.name} has high average latency of ${agent.metrics.avgLatencyMs}ms`,
          affectedEntity: agent.agentId,
          detectedAt: now,
          metadata: { latencyMs: agent.metrics.avgLatencyMs },
        });
      }

      // Check for low activity (no executions in 7+ days for active agents)
      if (agent.metrics.totalExecutions === 0 && agent.metrics.lastActivityAt) {
        const daysSinceActivity = (now.getTime() - agent.metrics.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceActivity > 7) {
          anomalies.push({
            type: "low_activity",
            severity: "low",
            description: `Agent ${agent.name} has no activity in ${Math.round(daysSinceActivity)} days`,
            affectedEntity: agent.agentId,
            detectedAt: now,
            metadata: { daysSinceActivity: Math.round(daysSinceActivity) },
          });
        }
      }
    }

    // Check budget status
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { monthlyBudgetCents: true, currentMonthSpendCents: true },
    });

    if (org?.monthlyBudgetCents) {
      const usagePercent = (org.currentMonthSpendCents / org.monthlyBudgetCents) * 100;
      if (usagePercent >= 100) {
        anomalies.push({
          type: "budget_warning",
          severity: "critical",
          description: `Budget exceeded: ${usagePercent.toFixed(1)}% of monthly budget used`,
          affectedEntity: organizationId,
          detectedAt: now,
          metadata: { usagePercent, budgetCents: org.monthlyBudgetCents, spentCents: org.currentMonthSpendCents },
        });
      } else if (usagePercent >= 80) {
        anomalies.push({
          type: "budget_warning",
          severity: usagePercent >= 90 ? "high" : "medium",
          description: `Budget warning: ${usagePercent.toFixed(1)}% of monthly budget used`,
          affectedEntity: organizationId,
          detectedAt: now,
          metadata: { usagePercent, budgetCents: org.monthlyBudgetCents, spentCents: org.currentMonthSpendCents },
        });
      }
    }

    return anomalies;
  }

  /**
   * Get health history for the past N days
   */
  async getHealthHistory(organizationId: string, days: number = 7): Promise<SystemHealth[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Cast to any since Prisma client may not have been regenerated yet
    const snapshots = await (prisma as any).systemHealthSnapshot?.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "asc" },
    }) || [];

    return snapshots.map((s: any) => ({
      timestamp: s.createdAt,
      overallScore: s.overallScore,
      status: s.overallScore >= 80 ? "healthy" : s.overallScore >= 60 ? "degraded" : s.overallScore >= 40 ? "unhealthy" : "critical",
      agents: (s.agentMetrics as unknown as AgentHealth[]) || [],
      workflows: (s.workflowMetrics as unknown as WorkflowHealth) || { totalExecutions: 0, successRate: 100, avgDurationMs: 0, pendingCount: 0, failedInLast24h: 0 },
      infrastructure: (s.infraMetrics as unknown as InfraHealth) || { database: { status: "healthy", latencyMs: 0 }, redis: { status: "healthy", latencyMs: 0, memoryUsedMb: 0 }, integrations: { slack: "not_configured", notion: "not_configured", github: "not_configured" } },
      anomalies: (s.anomalies as unknown as Anomaly[]) || [],
      summary: {
        totalAgents: 0,
        healthyAgents: 0,
        degradedAgents: 0,
        unhealthyAgents: 0,
        totalExecutionsLast24h: 0,
        overallSuccessRate: 0,
      },
    }));
  }

  /**
   * Save a health snapshot to the database
   */
  async saveHealthSnapshot(organizationId: string, health: SystemHealth): Promise<void> {
    try {
      // Cast to any since Prisma client may not have been regenerated yet
      await (prisma as any).systemHealthSnapshot?.create({
        data: {
          organizationId,
          overallScore: health.overallScore,
          agentMetrics: health.agents as unknown as object,
          workflowMetrics: health.workflows as unknown as object,
          infraMetrics: health.infrastructure as unknown as object,
          anomalies: health.anomalies as unknown as object,
          metadata: {
            summary: health.summary,
            status: health.status,
          },
        },
      });

      logger.info("Health snapshot saved", { organizationId, score: health.overallScore });
    } catch (error) {
      logger.error("Failed to save health snapshot", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }

  /**
   * Cache health data in Redis
   */
  private async cacheHealth(organizationId: string, health: SystemHealth): Promise<void> {
    try {
      const key = `${this.HEALTH_CACHE_KEY}:${organizationId}`;
      await redis.setex(key, this.CACHE_TTL_SECONDS, JSON.stringify(health));
    } catch (error) {
      logger.warn("Failed to cache health data", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached health data
   */
  private async getCachedHealth(organizationId: string): Promise<SystemHealth | null> {
    try {
      const key = `${this.HEALTH_CACHE_KEY}:${organizationId}`;
      const cached = await redis.get(key);
      if (cached) {
        const health = JSON.parse(cached) as SystemHealth;
        health.timestamp = new Date(health.timestamp);
        return health;
      }
    } catch (error) {
      logger.warn("Failed to get cached health data", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  /**
   * Invalidate cached health data
   */
  async invalidateCache(organizationId: string): Promise<void> {
    try {
      const key = `${this.HEALTH_CACHE_KEY}:${organizationId}`;
      await redis.del(key);
    } catch (error) {
      logger.warn("Failed to invalidate health cache", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor();
