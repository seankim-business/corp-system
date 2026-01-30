/**
 * Recommendation Engine - System Improvement Suggestions
 *
 * Analyzes system health, knowledge gaps, and agent performance
 * to generate actionable recommendations for improvement.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { healthMonitor, Anomaly, SystemHealth } from "./health-monitor";
import { knowledgeAnalyzer, KnowledgeGap } from "./knowledge-analyzer";
import { agentAnalyzer, AgentEcosystemAnalysis } from "./agent-analyzer";

// ============================================================================
// Types
// ============================================================================

export interface Recommendation {
  id?: string;
  type: "performance" | "cost" | "knowledge" | "agent" | "workflow" | "security" | "infrastructure";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  suggestedAction: string;
  impact: string;
  effort: "low" | "medium" | "high";
  category: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface RecommendationFilters {
  type?: Recommendation["type"];
  priority?: Recommendation["priority"];
  effort?: Recommendation["effort"];
  limit?: number;
}

// ============================================================================
// Recommendation Engine Class
// ============================================================================

export class RecommendationEngine {
  /**
   * Generate all recommendations for an organization
   */
  async generateRecommendations(
    organizationId: string,
    filters?: RecommendationFilters
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Gather data from all sources in parallel
    const [health, ecosystem, knowledgeGaps] = await Promise.all([
      healthMonitor.checkHealth(organizationId),
      agentAnalyzer.analyzeEcosystem(organizationId),
      knowledgeAnalyzer.analyzeAll(organizationId),
    ]);

    // Generate recommendations from each source
    recommendations.push(
      ...this.generateHealthRecommendations(health),
      ...this.generateAgentRecommendations(ecosystem),
      ...this.generateKnowledgeRecommendations(knowledgeGaps),
      ...await this.generateCostRecommendations(organizationId),
      ...await this.generateWorkflowRecommendations(organizationId),
    );

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Apply filters
    let filtered = recommendations;

    if (filters?.type) {
      filtered = filtered.filter(r => r.type === filters.type);
    }
    if (filters?.priority) {
      filtered = filtered.filter(r => r.priority === filters.priority);
    }
    if (filters?.effort) {
      filtered = filtered.filter(r => r.effort === filters.effort);
    }

    // Apply limit
    const limit = filters?.limit || 20;
    filtered = filtered.slice(0, limit);

    // Save to database
    await this.saveRecommendations(organizationId, filtered);

    return filtered;
  }

  /**
   * Generate recommendations from health data
   */
  private generateHealthRecommendations(health: SystemHealth): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Overall health recommendations
    if (health.overallScore < 60) {
      recommendations.push({
        type: "infrastructure",
        priority: "high",
        title: "System health is degraded",
        description: `System health score is ${health.overallScore}/100, indicating significant issues that need attention.`,
        suggestedAction: "Review the anomalies and critical issues list, and address high-priority items first.",
        impact: "Improve overall system reliability and user experience",
        effort: "high",
        category: "health",
        metadata: { healthScore: health.overallScore, status: health.status },
      });
    }

    // Infrastructure recommendations
    if (health.infrastructure.database.status === "degraded") {
      recommendations.push({
        type: "infrastructure",
        priority: "high",
        title: "Database performance degraded",
        description: `Database latency is ${health.infrastructure.database.latencyMs}ms, which is above optimal levels.`,
        suggestedAction: "Review database queries, add indexes, or consider scaling database resources.",
        impact: "Improve response times across all operations",
        effort: "medium",
        category: "database",
        metadata: { latencyMs: health.infrastructure.database.latencyMs },
      });
    }

    if (health.infrastructure.redis.status === "degraded") {
      recommendations.push({
        type: "infrastructure",
        priority: "medium",
        title: "Redis performance degraded",
        description: `Redis is using ${health.infrastructure.redis.memoryUsedMb}MB and showing degraded performance.`,
        suggestedAction: "Review Redis memory usage, clear stale keys, or increase memory allocation.",
        impact: "Improve caching performance and reduce latency",
        effort: "low",
        category: "redis",
        metadata: {
          memoryMb: health.infrastructure.redis.memoryUsedMb,
          latencyMs: health.infrastructure.redis.latencyMs,
        },
      });
    }

    // Anomaly-based recommendations
    for (const anomaly of health.anomalies) {
      recommendations.push(this.anomalyToRecommendation(anomaly));
    }

    return recommendations;
  }

  /**
   * Generate recommendations from agent ecosystem analysis
   */
  private generateAgentRecommendations(ecosystem: AgentEcosystemAnalysis): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Inactive agents
    if (ecosystem.inactiveAgents > ecosystem.totalAgents * 0.3) {
      recommendations.push({
        type: "agent",
        priority: "medium",
        title: "Review inactive agents",
        description: `${ecosystem.inactiveAgents} of ${ecosystem.totalAgents} agents (${((ecosystem.inactiveAgents / ecosystem.totalAgents) * 100).toFixed(0)}%) are inactive.`,
        suggestedAction: "Audit inactive agents and either improve routing to them, merge with active agents, or archive them.",
        impact: "Simplify agent ecosystem and reduce maintenance overhead",
        effort: "medium",
        category: "agent-management",
        metadata: {
          inactiveCount: ecosystem.inactiveAgents,
          totalCount: ecosystem.totalAgents,
        },
      });
    }

    // Underperforming agents
    for (const agent of ecosystem.underperformers.slice(0, 3)) {
      if (agent.performanceScore < 50) {
        recommendations.push({
          type: "agent",
          priority: agent.performanceScore < 30 ? "high" : "medium",
          title: `Improve ${agent.name} performance`,
          description: `${agent.name} has a performance score of ${agent.performanceScore}/100 with ${agent.metrics.errorRate.toFixed(1)}% error rate.`,
          suggestedAction: "Review agent configuration, update prompts, add error handling, and analyze failed executions.",
          impact: "Reduce errors and improve user experience for this agent's tasks",
          effort: "medium",
          category: "agent-performance",
          sourceId: agent.agentId,
          metadata: {
            performanceScore: agent.performanceScore,
            errorRate: agent.metrics.errorRate,
            successRate: agent.metrics.successRate,
          },
        });
      }
    }

    // Capability gaps
    for (const gap of ecosystem.capabilityGaps.slice(0, 3)) {
      recommendations.push({
        type: "agent",
        priority: gap.frequency >= 10 ? "high" : "medium",
        title: `Add capability for "${gap.requestedCapability}"`,
        description: `${gap.frequency} requests for "${gap.requestedCapability}" were unhandled in the past 90 days.`,
        suggestedAction: gap.suggestedAgent
          ? `Add "${gap.requestedCapability}" skills to ${gap.suggestedAgent}`
          : `Create a new agent with skills: ${gap.suggestedSkills?.join(", ") || "TBD"}`,
        impact: `Handle ${gap.frequency}+ monthly requests that are currently failing`,
        effort: gap.suggestedAgent ? "low" : "high",
        category: "capability-gap",
        metadata: {
          capability: gap.requestedCapability,
          frequency: gap.frequency,
          examples: gap.examples,
        },
      });
    }

    // Add ecosystem-level recommendations
    for (const rec of ecosystem.ecosystemRecommendations.slice(0, 3)) {
      recommendations.push({
        type: "agent",
        priority: rec.priority,
        title: rec.title,
        description: rec.description,
        suggestedAction: rec.suggestedAction,
        impact: rec.estimatedImpact,
        effort: "medium",
        category: "ecosystem",
      });
    }

    return recommendations;
  }

  /**
   * Generate recommendations from knowledge gaps
   */
  private generateKnowledgeRecommendations(gaps: KnowledgeGap[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Group gaps by type for summary recommendations
    const gapsByType = new Map<string, KnowledgeGap[]>();
    for (const gap of gaps) {
      if (!gapsByType.has(gap.type)) {
        gapsByType.set(gap.type, []);
      }
      gapsByType.get(gap.type)!.push(gap);
    }

    // Generate type-level recommendations
    for (const [type, typeGaps] of gapsByType) {
      if (typeGaps.length >= 3) {
        const highSeverityCount = typeGaps.filter(g => g.severity === "high" || g.severity === "critical").length;

        recommendations.push({
          type: "knowledge",
          priority: highSeverityCount > 0 ? "high" : "medium",
          title: `Address ${typeGaps.length} ${type.replace(/_/g, " ")} issues`,
          description: `Found ${typeGaps.length} ${type.replace(/_/g, " ")} issues, ${highSeverityCount} of which are high severity.`,
          suggestedAction: `Review and address the ${type.replace(/_/g, " ")} issues. Start with: "${typeGaps[0].title}"`,
          impact: "Improve documentation quality and system reliability",
          effort: typeGaps.length > 5 ? "high" : "medium",
          category: type,
          metadata: {
            gapCount: typeGaps.length,
            highSeverityCount,
            examples: typeGaps.slice(0, 3).map(g => g.title),
          },
        });
      }
    }

    // Individual high-severity gaps
    for (const gap of gaps.filter(g => g.severity === "critical" || g.severity === "high").slice(0, 5)) {
      recommendations.push({
        type: "knowledge",
        priority: gap.severity === "critical" ? "critical" : "high",
        title: gap.title,
        description: gap.description,
        suggestedAction: gap.suggestedAction,
        impact: "Improve documentation coverage and reduce operational risks",
        effort: gap.type === "broken_link" ? "low" : "medium",
        category: gap.type,
        metadata: {
          gapType: gap.type,
          relatedEntities: gap.relatedEntities,
        },
      });
    }

    return recommendations;
  }

  /**
   * Generate cost-related recommendations
   */
  private async generateCostRecommendations(organizationId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get organization budget info
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        monthlyBudgetCents: true,
        currentMonthSpendCents: true,
      },
    });

    if (org?.monthlyBudgetCents) {
      const usagePercent = (org.currentMonthSpendCents / org.monthlyBudgetCents) * 100;

      if (usagePercent >= 90) {
        recommendations.push({
          type: "cost",
          priority: usagePercent >= 100 ? "critical" : "high",
          title: "Budget threshold exceeded",
          description: `Current spending is at ${usagePercent.toFixed(1)}% of the monthly budget.`,
          suggestedAction: "Review high-cost operations, optimize model usage, or increase budget allocation.",
          impact: "Prevent service disruption due to budget exhaustion",
          effort: "medium",
          category: "budget",
          metadata: {
            usagePercent,
            budgetCents: org.monthlyBudgetCents,
            spentCents: org.currentMonthSpendCents,
          },
        });
      }
    }

    // Analyze cost by agent
    // NOTE: Requires AgentCostRecord table in Prisma schema
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let costByAgent: { agentId: string; _sum: { costCents: number | null }; _count: number }[] = [];
    try {
      costByAgent = await (prisma as any).agentCostRecord?.groupBy({
        by: ["agentId"],
        where: {
          organizationId,
          createdAt: { gte: last30Days },
        },
        _sum: { costCents: true },
        _count: true,
      }) || [];
    } catch {
      // Table doesn't exist yet, use empty array
      logger.warn("agentCostRecord table not available", { organizationId });
    }

    // Find expensive agents
    for (const agent of costByAgent) {
      const totalCost = agent._sum.costCents || 0;
      const avgCostPerExec = totalCost / (agent._count || 1);

      if (avgCostPerExec > 5000) { // > $0.50 per execution (stored as cents * 100)
        recommendations.push({
          type: "cost",
          priority: "medium",
          title: `Optimize costs for agent ${agent.agentId}`,
          description: `Agent ${agent.agentId} costs an average of $${(avgCostPerExec / 10000).toFixed(2)} per execution.`,
          suggestedAction: "Consider using a lighter model (e.g., Haiku) for simpler tasks, or optimize prompts to reduce token usage.",
          impact: `Potential 30-50% cost reduction for this agent`,
          effort: "medium",
          category: "agent-cost",
          sourceId: agent.agentId,
          metadata: {
            totalCostCents: Math.round(totalCost / 100),
            avgCostPerExec: Math.round(avgCostPerExec / 100),
            executionCount: agent._count,
          },
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate workflow-related recommendations
   */
  private async generateWorkflowRecommendations(organizationId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Find workflows with high failure rates
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const workflows = await prisma.workflow.findMany({
      where: { organizationId, enabled: true },
      include: {
        executions: {
          where: { createdAt: { gte: last7Days } },
          select: { status: true },
        },
      },
    });

    for (const workflow of workflows) {
      const execCount = workflow.executions.length;
      const failCount = workflow.executions.filter(e => e.status === "failed").length;

      if (execCount >= 5 && failCount / execCount > 0.2) {
        const failRate = (failCount / execCount) * 100;
        recommendations.push({
          type: "workflow",
          priority: failRate > 50 ? "high" : "medium",
          title: `Fix failing workflow: ${workflow.name}`,
          description: `Workflow "${workflow.name}" has a ${failRate.toFixed(1)}% failure rate (${failCount}/${execCount} failures in 7 days).`,
          suggestedAction: "Review execution logs, fix error conditions, and add better error handling.",
          impact: "Improve workflow reliability and reduce manual intervention",
          effort: "medium",
          category: "workflow-reliability",
          sourceId: workflow.id,
          metadata: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            failRate,
            failCount,
            execCount,
          },
        });
      }

      // Suggest SOP for frequently used workflows without one
      if (!workflow.sopEnabled && execCount >= 10) {
        recommendations.push({
          type: "workflow",
          priority: "low",
          title: `Add SOP to workflow: ${workflow.name}`,
          description: `Workflow "${workflow.name}" runs frequently (${execCount} times/week) but has no SOP defined.`,
          suggestedAction: "Define an SOP to standardize execution steps and improve consistency.",
          impact: "Improve workflow consistency and documentation",
          effort: "low",
          category: "workflow-sop",
          sourceId: workflow.id,
          metadata: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            weeklyExecutions: execCount,
          },
        });
      }
    }

    return recommendations;
  }

  /**
   * Convert an anomaly to a recommendation
   */
  private anomalyToRecommendation(anomaly: Anomaly): Recommendation {
    const typeMap: Record<string, Recommendation["type"]> = {
      high_error_rate: "performance",
      high_latency: "performance",
      low_activity: "agent",
      budget_warning: "cost",
      integration_failure: "infrastructure",
    };

    const actionMap: Record<string, string> = {
      high_error_rate: "Review error logs, improve error handling, and add validation",
      high_latency: "Optimize prompts, consider lighter models, or add caching",
      low_activity: "Review if agent is still needed or improve routing",
      budget_warning: "Review spending patterns and optimize high-cost operations",
      integration_failure: "Check integration credentials and reconnect if needed",
    };

    return {
      type: typeMap[anomaly.type] || "infrastructure",
      priority: anomaly.severity,
      title: `${anomaly.type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} detected`,
      description: anomaly.description,
      suggestedAction: actionMap[anomaly.type] || "Investigate and address the issue",
      impact: "Improve system stability and reliability",
      effort: "medium",
      category: anomaly.type,
      sourceType: "anomaly",
      metadata: anomaly.metadata,
    };
  }

  /**
   * Save recommendations to database
   */
  private async saveRecommendations(
    organizationId: string,
    recommendations: Recommendation[]
  ): Promise<void> {
    try {
      // Get existing pending recommendations to avoid duplicates
      const existing = await (prisma as any).metaAgentRecommendation?.findMany({
        where: {
          organizationId,
          status: { in: ["pending", "accepted"] },
        },
        select: { title: true, type: true },
      }) || [];

      const existingKeys = new Set(existing.map((r: { type: string; title: string }) => `${r.type}:${r.title}`));

      const newRecommendations = recommendations.filter(
        r => !existingKeys.has(`${r.type}:${r.title}`)
      );

      if (newRecommendations.length > 0) {
        await (prisma as any).metaAgentRecommendation?.createMany({
          data: newRecommendations.map(rec => ({
            organizationId,
            type: rec.type,
            priority: rec.priority,
            title: rec.title,
            description: rec.description,
            suggestedAction: rec.suggestedAction,
            impact: rec.impact,
            effort: rec.effort,
            sourceType: rec.sourceType || rec.category,
            sourceId: rec.sourceId,
            metadata: (rec.metadata as object) || {},
          })),
        });

        logger.info("Recommendations saved", {
          organizationId,
          newCount: newRecommendations.length,
          totalCount: recommendations.length,
        });
      }
    } catch (error) {
      logger.warn("Could not save recommendations (table may not exist yet)", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }

  /**
   * Get pending recommendations from database
   */
  async getPendingRecommendations(
    organizationId: string,
    filters?: RecommendationFilters
  ): Promise<Recommendation[]> {
    try {
      const recs = await (prisma as any).metaAgentRecommendation?.findMany({
        where: {
          organizationId,
          status: "pending",
          ...(filters?.type && { type: filters.type }),
          ...(filters?.priority && { priority: filters.priority }),
          ...(filters?.effort && { effort: filters.effort }),
        },
        orderBy: [
          { priority: "asc" },
          { createdAt: "desc" },
        ],
        take: filters?.limit || 20,
      }) || [];

      return recs.map((r: any) => ({
        id: r.id,
        type: r.type as Recommendation["type"],
        priority: r.priority as Recommendation["priority"],
        title: r.title,
        description: r.description,
        suggestedAction: r.suggestedAction,
        impact: r.impact || "",
        effort: (r.effort || "medium") as Recommendation["effort"],
        category: r.sourceType || r.type,
        sourceType: r.sourceType || undefined,
        sourceId: r.sourceId || undefined,
        metadata: (r.metadata as Record<string, unknown>) || undefined,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Accept a recommendation
   */
  async acceptRecommendation(recommendationId: string, userId: string): Promise<void> {
    try {
      await (prisma as any).metaAgentRecommendation?.update({
        where: { id: recommendationId },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: userId,
        },
      });
    } catch {
      // Table may not exist yet
    }
  }

  /**
   * Reject a recommendation
   */
  async rejectRecommendation(recommendationId: string): Promise<void> {
    try {
      await (prisma as any).metaAgentRecommendation?.update({
        where: { id: recommendationId },
        data: { status: "rejected" },
      });
    } catch {
      // Table may not exist yet
    }
  }

  /**
   * Mark a recommendation as implemented
   */
  async markImplemented(recommendationId: string): Promise<void> {
    try {
      await (prisma as any).metaAgentRecommendation?.update({
        where: { id: recommendationId },
        data: {
          status: "implemented",
          implementedAt: new Date(),
        },
      });
    } catch {
      // Table may not exist yet
    }
  }
}

// Export singleton instance
export const recommendationEngine = new RecommendationEngine();
