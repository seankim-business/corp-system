/**
 * Agent Analyzer - Agent Performance Analysis Service
 *
 * Analyzes agent performance patterns, detects underutilized agents,
 * identifies missing capabilities, and suggests improvements.
 */

import { db as prisma } from "../../db/client";
import { getAgentsMap } from "../../config/agent-loader";
import { logger } from "../../utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface AgentPerformanceAnalysis {
  agentId: string;
  name: string;
  function: string;
  utilizationLevel: "high" | "medium" | "low" | "inactive";
  performanceScore: number; // 0-100
  metrics: {
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    errorRate: number;
    costCents: number;
    delegationsReceived: number;
    delegationsSent: number;
  };
  insights: AgentInsight[];
  recommendations: AgentRecommendation[];
}

export interface AgentInsight {
  type: "performance" | "utilization" | "cost" | "reliability" | "capability";
  title: string;
  description: string;
  severity: "info" | "warning" | "action_required";
  data?: Record<string, unknown>;
}

export interface AgentRecommendation {
  type: "optimize" | "expand" | "retire" | "create" | "merge" | "split";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedImpact: string;
  suggestedAction: string;
}

export interface CapabilityGap {
  requestedCapability: string;
  frequency: number;
  examples: string[];
  suggestedAgent?: string;
  suggestedSkills?: string[];
}

export interface AgentEcosystemAnalysis {
  totalAgents: number;
  activeAgents: number;
  inactiveAgents: number;
  performanceDistribution: {
    high: number;
    medium: number;
    low: number;
    inactive: number;
  };
  topPerformers: AgentPerformanceAnalysis[];
  underperformers: AgentPerformanceAnalysis[];
  capabilityGaps: CapabilityGap[];
  ecosystemRecommendations: AgentRecommendation[];
}

// ============================================================================
// Agent Analyzer Class
// ============================================================================

export class AgentAnalyzer {
  private readonly LOW_UTILIZATION_THRESHOLD = 10; // executions per month
  private readonly HIGH_UTILIZATION_THRESHOLD = 100; // executions per month

  /**
   * Analyze a specific agent's performance
   */
  async analyzeAgent(organizationId: string, agentId: string): Promise<AgentPerformanceAnalysis | null> {
    const agentsMap = getAgentsMap();
    const agentConfig = agentsMap[agentId];

    if (!agentConfig) {
      return null;
    }

    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get execution data
    const executions = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        category: agentId,
        createdAt: { gte: last30Days },
      },
      select: {
        id: true,
        status: true,
        duration: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    // Get cost data
    // TODO: agentCostRecord table doesn't exist yet - stub with empty array
    const costRecords: { costCents: number }[] = [];
    try {
      const records = await (prisma as any).agentCostRecord?.findMany({
        where: {
          organizationId,
          agentId,
          createdAt: { gte: last30Days },
        },
        select: {
          costCents: true,
        },
      });
      costRecords.push(...(records || []));
    } catch {
      // Table doesn't exist yet, use empty array
      logger.warn("agentCostRecord table not available", { agentId });
    }

    const totalExecutions = executions.length;
    const successfulExecs = executions.filter(e => e.status === "completed" || e.status === "success");
    const failedExecs = executions.filter(e => e.status === "failed" || e.status === "error");

    const successRate = totalExecutions > 0 ? (successfulExecs.length / totalExecutions) * 100 : 100;
    const errorRate = totalExecutions > 0 ? (failedExecs.length / totalExecutions) * 100 : 0;

    const durations = executions.map(e => e.duration).filter(d => d > 0);
    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    const totalCostCents = costRecords.reduce((sum: number, r: { costCents: number }) => sum + r.costCents, 0);

    // Determine utilization level
    let utilizationLevel: "high" | "medium" | "low" | "inactive";
    if (totalExecutions === 0) {
      utilizationLevel = "inactive";
    } else if (totalExecutions < this.LOW_UTILIZATION_THRESHOLD) {
      utilizationLevel = "low";
    } else if (totalExecutions >= this.HIGH_UTILIZATION_THRESHOLD) {
      utilizationLevel = "high";
    } else {
      utilizationLevel = "medium";
    }

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(
      successRate,
      errorRate,
      avgDurationMs,
      totalExecutions
    );

    // Generate insights
    const insights = this.generateInsights(
      agentId,
      agentConfig.name,
      totalExecutions,
      successRate,
      errorRate,
      avgDurationMs,
      totalCostCents,
      utilizationLevel
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      agentId,
      agentConfig.name,
      utilizationLevel,
      performanceScore,
      insights
    );

    return {
      agentId,
      name: agentConfig.name,
      function: agentConfig.function || "unknown",
      utilizationLevel,
      performanceScore,
      metrics: {
        totalExecutions,
        successRate: Math.round(successRate * 100) / 100,
        avgDurationMs,
        errorRate: Math.round(errorRate * 100) / 100,
        costCents: Math.round(totalCostCents / 100), // Convert from internal precision
        delegationsReceived: 0, // Would need additional tracking
        delegationsSent: 0,
      },
      insights,
      recommendations,
    };
  }

  /**
   * Analyze the entire agent ecosystem
   */
  async analyzeEcosystem(organizationId: string): Promise<AgentEcosystemAnalysis> {
    const agentsMap = getAgentsMap();
    const analyses: AgentPerformanceAnalysis[] = [];

    // Analyze all agents
    for (const agentId of Object.keys(agentsMap)) {
      const analysis = await this.analyzeAgent(organizationId, agentId);
      if (analysis) {
        analyses.push(analysis);
      }
    }

    // Calculate distribution
    const performanceDistribution = {
      high: analyses.filter(a => a.utilizationLevel === "high").length,
      medium: analyses.filter(a => a.utilizationLevel === "medium").length,
      low: analyses.filter(a => a.utilizationLevel === "low").length,
      inactive: analyses.filter(a => a.utilizationLevel === "inactive").length,
    };

    // Sort by performance score
    const sortedByPerformance = [...analyses].sort((a, b) => b.performanceScore - a.performanceScore);

    const topPerformers = sortedByPerformance
      .filter(a => a.utilizationLevel !== "inactive")
      .slice(0, 5);

    const underperformers = sortedByPerformance
      .filter(a => a.performanceScore < 60 && a.utilizationLevel !== "inactive")
      .slice(-5)
      .reverse();

    // Find capability gaps
    const capabilityGaps = await this.findCapabilityGaps(organizationId);

    // Generate ecosystem-level recommendations
    const ecosystemRecommendations = this.generateEcosystemRecommendations(
      analyses,
      capabilityGaps,
      performanceDistribution
    );

    return {
      totalAgents: analyses.length,
      activeAgents: analyses.filter(a => a.utilizationLevel !== "inactive").length,
      inactiveAgents: performanceDistribution.inactive,
      performanceDistribution,
      topPerformers,
      underperformers,
      capabilityGaps,
      ecosystemRecommendations,
    };
  }

  /**
   * Find capability gaps based on unhandled requests
   */
  async findCapabilityGaps(organizationId: string): Promise<CapabilityGap[]> {
    const gaps: CapabilityGap[] = [];
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Find executions with errors or no agent match
    const failedRoutings = await prisma.orchestratorExecution.findMany({
      where: {
        organizationId,
        createdAt: { gte: last90Days },
        OR: [
          { status: "failed" },
          { errorMessage: { contains: "no agent" } },
          { errorMessage: { contains: "unhandled" } },
          { category: "unknown" },
        ],
      },
      select: {
        inputData: true,
        errorMessage: true,
      },
      take: 100,
    });

    // Analyze patterns in failed requests
    const capabilityPatterns = new Map<string, { count: number; examples: string[] }>();

    for (const exec of failedRoutings) {
      const input = exec.inputData as { request?: string; query?: string } | null;
      const requestText = input?.request || input?.query || "";

      // Extract potential capability from request
      const keywords = this.extractCapabilityKeywords(requestText);

      for (const keyword of keywords) {
        if (!capabilityPatterns.has(keyword)) {
          capabilityPatterns.set(keyword, { count: 0, examples: [] });
        }
        const pattern = capabilityPatterns.get(keyword)!;
        pattern.count++;
        if (pattern.examples.length < 3) {
          pattern.examples.push(requestText.substring(0, 200));
        }
      }
    }

    // Convert to gaps (threshold: at least 3 occurrences)
    for (const [capability, data] of capabilityPatterns) {
      if (data.count >= 3) {
        gaps.push({
          requestedCapability: capability,
          frequency: data.count,
          examples: data.examples,
          suggestedAgent: this.suggestAgentForCapability(capability),
          suggestedSkills: this.suggestSkillsForCapability(capability),
        });
      }
    }

    // Sort by frequency
    gaps.sort((a, b) => b.frequency - a.frequency);

    return gaps.slice(0, 10); // Top 10 gaps
  }

  /**
   * Detect underutilized agents
   */
  async detectUnderutilizedAgents(organizationId: string): Promise<AgentPerformanceAnalysis[]> {
    const ecosystem = await this.analyzeEcosystem(organizationId);

    return ecosystem.underperformers.filter(a =>
      a.utilizationLevel === "low" || a.utilizationLevel === "inactive"
    );
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(
    successRate: number,
    errorRate: number,
    avgDurationMs: number,
    _totalExecutions: number
  ): number {
    let score = 50; // Base score

    // Success rate impact (up to +30 or -30)
    score += (successRate - 80) * 0.75;

    // Error rate impact (up to -20)
    score -= errorRate * 0.5;

    // Latency impact (penalize if > 10s)
    if (avgDurationMs > 10000) {
      score -= Math.min(10, (avgDurationMs - 10000) / 5000);
    }

    // Activity bonus (up to +10)
    if (_totalExecutions > 0) {
      score += Math.min(10, Math.log10(_totalExecutions + 1) * 5);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate insights for an agent
   */
  private generateInsights(
    _agentId: string,
    agentName: string,
    totalExecutions: number,
    _successRate: number,
    errorRate: number,
    avgDurationMs: number,
    totalCostCents: number,
    utilizationLevel: string
  ): AgentInsight[] {
    const insights: AgentInsight[] = [];

    // Utilization insights
    if (utilizationLevel === "inactive") {
      insights.push({
        type: "utilization",
        title: "Agent is inactive",
        description: `${agentName} has had no executions in the past 30 days. Consider reviewing if this agent is still needed.`,
        severity: "warning",
        data: { daysSinceLastExecution: 30 },
      });
    } else if (utilizationLevel === "low") {
      insights.push({
        type: "utilization",
        title: "Low utilization",
        description: `${agentName} has only ${totalExecutions} executions in the past 30 days. This may indicate low demand or routing issues.`,
        severity: "info",
        data: { executionCount: totalExecutions },
      });
    } else if (utilizationLevel === "high") {
      insights.push({
        type: "utilization",
        title: "High demand agent",
        description: `${agentName} is heavily utilized with ${totalExecutions} executions. Consider optimizing for better performance.`,
        severity: "info",
        data: { executionCount: totalExecutions },
      });
    }

    // Performance insights
    if (errorRate > 15) {
      insights.push({
        type: "reliability",
        title: "High error rate",
        description: `${agentName} has a ${errorRate.toFixed(1)}% error rate. Investigation and fixes are recommended.`,
        severity: "action_required",
        data: { errorRate },
      });
    } else if (errorRate > 5) {
      insights.push({
        type: "reliability",
        title: "Elevated error rate",
        description: `${agentName} has a ${errorRate.toFixed(1)}% error rate, which is above optimal levels.`,
        severity: "warning",
        data: { errorRate },
      });
    }

    if (avgDurationMs > 15000) {
      insights.push({
        type: "performance",
        title: "Slow response time",
        description: `${agentName} has an average response time of ${(avgDurationMs / 1000).toFixed(1)}s. Consider optimizing prompts or model selection.`,
        severity: avgDurationMs > 30000 ? "action_required" : "warning",
        data: { avgDurationMs },
      });
    }

    // Cost insights
    const costPerExec = totalExecutions > 0 ? totalCostCents / totalExecutions : 0;
    if (costPerExec > 50) { // More than $0.50 per execution
      insights.push({
        type: "cost",
        title: "High cost per execution",
        description: `${agentName} costs an average of $${(costPerExec / 100).toFixed(2)} per execution. Consider using a lighter model for simpler tasks.`,
        severity: "warning",
        data: { costPerExec, totalCostCents },
      });
    }

    return insights;
  }

  /**
   * Generate recommendations for an agent
   */
  private generateRecommendations(
    _agentId: string,
    agentName: string,
    utilizationLevel: string,
    performanceScore: number,
    insights: AgentInsight[]
  ): AgentRecommendation[] {
    const recommendations: AgentRecommendation[] = [];

    // Based on utilization
    if (utilizationLevel === "inactive") {
      recommendations.push({
        type: "retire",
        title: `Consider retiring ${agentName}`,
        description: "This agent has been inactive for 30+ days. Evaluate if it should be retired or merged with another agent.",
        priority: "medium",
        estimatedImpact: "Reduce maintenance overhead and simplify agent ecosystem",
        suggestedAction: `Review ${agentName}'s purpose and either improve routing to it or remove it from the system`,
      });
    }

    // Based on performance
    if (performanceScore < 50 && utilizationLevel !== "inactive") {
      recommendations.push({
        type: "optimize",
        title: `Optimize ${agentName}`,
        description: "This agent has poor performance metrics and needs optimization.",
        priority: "high",
        estimatedImpact: "Improve success rate and reduce errors",
        suggestedAction: "Review recent failures, update prompts, and consider adding error handling",
      });
    }

    // Based on insights
    const hasHighErrors = insights.some(i => i.type === "reliability" && i.severity === "action_required");
    if (hasHighErrors) {
      recommendations.push({
        type: "optimize",
        title: `Fix error handling for ${agentName}`,
        description: "High error rate requires immediate attention.",
        priority: "high",
        estimatedImpact: "Reduce errors by 50%+",
        suggestedAction: "Analyze error logs, improve prompts, add validation, and implement fallbacks",
      });
    }

    const hasSlowResponse = insights.some(i => i.type === "performance" && i.title.includes("Slow"));
    if (hasSlowResponse) {
      recommendations.push({
        type: "optimize",
        title: `Improve response time for ${agentName}`,
        description: "Slow response times impact user experience.",
        priority: "medium",
        estimatedImpact: "Reduce latency by 30-50%",
        suggestedAction: "Consider using a faster model (e.g., Haiku) for simpler tasks, optimize prompts, or implement caching",
      });
    }

    return recommendations;
  }

  /**
   * Generate ecosystem-level recommendations
   */
  private generateEcosystemRecommendations(
    analyses: AgentPerformanceAnalysis[],
    capabilityGaps: CapabilityGap[],
    distribution: { high: number; medium: number; low: number; inactive: number }
  ): AgentRecommendation[] {
    const recommendations: AgentRecommendation[] = [];

    // Too many inactive agents
    if (distribution.inactive > analyses.length * 0.3) {
      recommendations.push({
        type: "retire",
        title: "Consolidate inactive agents",
        description: `${distribution.inactive} agents (${((distribution.inactive / analyses.length) * 100).toFixed(0)}%) are inactive. Consider consolidating or removing them.`,
        priority: "medium",
        estimatedImpact: "Simplify ecosystem and reduce maintenance",
        suggestedAction: "Review inactive agents and either improve routing to them or archive them",
      });
    }

    // Capability gaps
    for (const gap of capabilityGaps.slice(0, 3)) {
      if (gap.frequency >= 5) {
        recommendations.push({
          type: "create",
          title: `Create agent for "${gap.requestedCapability}"`,
          description: `${gap.frequency} requests for "${gap.requestedCapability}" capability were unhandled.`,
          priority: gap.frequency >= 10 ? "high" : "medium",
          estimatedImpact: `Handle ${gap.frequency}+ monthly requests`,
          suggestedAction: gap.suggestedAgent
            ? `Add "${gap.requestedCapability}" capability to ${gap.suggestedAgent}`
            : `Create a new agent with skills: ${gap.suggestedSkills?.join(", ") || "TBD"}`,
        });
      }
    }

    // Load balancing
    if (distribution.high > 0 && distribution.low > distribution.high * 2) {
      recommendations.push({
        type: "optimize",
        title: "Improve load distribution",
        description: "Some agents are overloaded while others are underutilized.",
        priority: "medium",
        estimatedImpact: "Better resource utilization and response times",
        suggestedAction: "Review routing rules to distribute load more evenly across agents",
      });
    }

    return recommendations;
  }

  /**
   * Extract capability keywords from request text
   */
  private extractCapabilityKeywords(text: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();

    // Common capability patterns
    const patterns = [
      { pattern: /report|reporting|analytics/i, keyword: "reporting" },
      { pattern: /email|mail|smtp/i, keyword: "email" },
      { pattern: /calendar|schedule|meeting/i, keyword: "scheduling" },
      { pattern: /translation|translate/i, keyword: "translation" },
      { pattern: /image|photo|visual/i, keyword: "image-processing" },
      { pattern: /pdf|document|doc/i, keyword: "document-processing" },
      { pattern: /database|sql|query/i, keyword: "database" },
      { pattern: /api|integration|connect/i, keyword: "api-integration" },
      { pattern: /payment|invoice|billing/i, keyword: "billing" },
      { pattern: /customer|support|ticket/i, keyword: "customer-support" },
    ];

    for (const { pattern, keyword } of patterns) {
      if (pattern.test(lowerText)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  /**
   * Suggest an agent for a capability
   */
  private suggestAgentForCapability(capability: string): string | undefined {
    const suggestions: Record<string, string> = {
      "reporting": "data-agent",
      "email": "ops-agent",
      "scheduling": "ops-agent",
      "translation": "general-agent",
      "billing": "finance-agent",
      "customer-support": "cs-agent",
    };

    return suggestions[capability];
  }

  /**
   * Suggest skills for a capability
   */
  private suggestSkillsForCapability(capability: string): string[] {
    const skillSuggestions: Record<string, string[]> = {
      "reporting": ["data-analysis", "chart-generation", "export"],
      "email": ["email-composition", "email-sending", "template-management"],
      "scheduling": ["calendar-management", "availability-check", "meeting-setup"],
      "translation": ["multi-language", "localization"],
      "image-processing": ["image-analysis", "image-editing"],
      "document-processing": ["pdf-parsing", "document-generation"],
      "billing": ["invoice-generation", "payment-processing"],
      "customer-support": ["ticket-management", "customer-communication"],
    };

    return skillSuggestions[capability] || [];
  }
}

// Export singleton instance
export const agentAnalyzer = new AgentAnalyzer();
