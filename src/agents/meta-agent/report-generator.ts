/**
 * Report Generator - Automated System Report Generation
 *
 * Generates daily, weekly, and monthly system reports with insights
 * and recommendations. Supports multiple output formats.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { healthMonitor } from "./health-monitor";
import { knowledgeAnalyzer, KnowledgeGap } from "./knowledge-analyzer";
import { agentAnalyzer, AgentPerformanceAnalysis } from "./agent-analyzer";
import { recommendationEngine, Recommendation } from "./recommendation-engine";

// ============================================================================
// Types
// ============================================================================

export interface AgentSummary {
  agentId: string;
  name: string;
  executionCount: number;
  successRate: number;
  status: "healthy" | "degraded" | "unhealthy";
}

export interface Issue {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedEntity?: string;
}

export interface AgentPerformanceSection {
  topPerformers: AgentSummary[];
  underperformers: AgentSummary[];
  mostActive: AgentSummary[];
  errorProne: AgentSummary[];
}

export interface WorkflowInsightsSection {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  topWorkflows: { name: string; executionCount: number; successRate: number }[];
  failedWorkflows: { name: string; failureCount: number; lastError?: string }[];
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: SlackBlock[];
  fields?: { type: string; text: string }[];
  accessory?: SlackBlock;
  block_id?: string;
}

export interface SystemReport {
  id?: string;
  period: "daily" | "weekly" | "monthly";
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;

  summary: {
    healthScore: number;
    healthStatus: string;
    totalExecutions: number;
    successRate: number;
    totalCostCents: number;
    topAgents: AgentSummary[];
    criticalIssues: Issue[];
    improvementFromLastPeriod?: number;
  };

  agentPerformance: AgentPerformanceSection;
  workflowInsights: WorkflowInsightsSection;
  knowledgeGaps: KnowledgeGap[];
  recommendations: Recommendation[];

  // Formatted outputs
  toMarkdown(): string;
  toSlackBlocks(): SlackBlock[];
  toHTML(): string;
}

// ============================================================================
// Report Implementation
// ============================================================================

class SystemReportImpl implements SystemReport {
  id?: string;
  period: "daily" | "weekly" | "monthly";
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  summary: SystemReport["summary"];
  agentPerformance: AgentPerformanceSection;
  workflowInsights: WorkflowInsightsSection;
  knowledgeGaps: KnowledgeGap[];
  recommendations: Recommendation[];

  constructor(data: Omit<SystemReport, "toMarkdown" | "toSlackBlocks" | "toHTML">) {
    this.id = data.id;
    this.period = data.period;
    this.periodStart = data.periodStart;
    this.periodEnd = data.periodEnd;
    this.generatedAt = data.generatedAt;
    this.summary = data.summary;
    this.agentPerformance = data.agentPerformance;
    this.workflowInsights = data.workflowInsights;
    this.knowledgeGaps = data.knowledgeGaps;
    this.recommendations = data.recommendations;
  }

  toMarkdown(): string {
    const lines: string[] = [];

    // Header
    lines.push(`# System Health Report - ${this.period.charAt(0).toUpperCase() + this.period.slice(1)}`);
    lines.push("");
    lines.push(`**Period:** ${this.formatDate(this.periodStart)} - ${this.formatDate(this.periodEnd)}`);
    lines.push(`**Generated:** ${this.formatDateTime(this.generatedAt)}`);
    lines.push("");

    // Executive Summary
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Health Score | ${this.getHealthEmoji(this.summary.healthScore)} ${this.summary.healthScore}/100 |`);
    lines.push(`| Status | ${this.summary.healthStatus} |`);
    lines.push(`| Total Executions | ${this.summary.totalExecutions.toLocaleString()} |`);
    lines.push(`| Success Rate | ${this.summary.successRate.toFixed(1)}% |`);
    lines.push(`| Total Cost | $${(this.summary.totalCostCents / 100).toFixed(2)} |`);
    lines.push("");

    // Critical Issues
    if (this.summary.criticalIssues.length > 0) {
      lines.push("### Critical Issues");
      lines.push("");
      for (const issue of this.summary.criticalIssues) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
      }
      lines.push("");
    }

    // Top Performing Agents
    lines.push("## Agent Performance");
    lines.push("");

    lines.push("### Top Performers");
    lines.push("");
    if (this.agentPerformance.topPerformers.length > 0) {
      lines.push("| Agent | Executions | Success Rate |");
      lines.push("|-------|------------|--------------|");
      for (const agent of this.agentPerformance.topPerformers.slice(0, 5)) {
        lines.push(`| ${agent.name} | ${agent.executionCount} | ${agent.successRate.toFixed(1)}% |`);
      }
    } else {
      lines.push("_No data available_");
    }
    lines.push("");

    // Agents Needing Attention
    if (this.agentPerformance.underperformers.length > 0) {
      lines.push("### Agents Needing Attention");
      lines.push("");
      lines.push("| Agent | Status | Issue |");
      lines.push("|-------|--------|-------|");
      for (const agent of this.agentPerformance.underperformers.slice(0, 5)) {
        lines.push(`| ${agent.name} | ${agent.status} | Low success rate (${agent.successRate.toFixed(1)}%) |`);
      }
      lines.push("");
    }

    // Workflow Insights
    lines.push("## Workflow Insights");
    lines.push("");
    lines.push(`- **Total Executions:** ${this.workflowInsights.totalExecutions}`);
    lines.push(`- **Overall Success Rate:** ${this.workflowInsights.successRate.toFixed(1)}%`);
    lines.push(`- **Average Duration:** ${(this.workflowInsights.avgDurationMs / 1000).toFixed(1)}s`);
    lines.push("");

    // Knowledge Gaps
    if (this.knowledgeGaps.length > 0) {
      lines.push("## Knowledge Gaps");
      lines.push("");
      for (const gap of this.knowledgeGaps.slice(0, 5)) {
        lines.push(`### ${gap.title}`);
        lines.push(`- **Type:** ${gap.type}`);
        lines.push(`- **Severity:** ${gap.severity}`);
        lines.push(`- **Action:** ${gap.suggestedAction}`);
        lines.push("");
      }
    }

    // Recommendations
    if (this.recommendations.length > 0) {
      lines.push("## Recommendations");
      lines.push("");
      for (const rec of this.recommendations.slice(0, 5)) {
        lines.push(`### ${rec.title}`);
        lines.push(`- **Priority:** ${rec.priority}`);
        lines.push(`- **Impact:** ${rec.impact}`);
        lines.push(`- **Action:** ${rec.suggestedAction}`);
        lines.push("");
      }
    }

    // Footer
    lines.push("---");
    lines.push(`_Generated by Meta Agent at ${this.formatDateTime(this.generatedAt)}_`);

    return lines.join("\n");
  }

  toSlackBlocks(): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `System Health Report - ${this.period.charAt(0).toUpperCase() + this.period.slice(1)}`,
        emoji: true,
      },
    });

    // Context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Period:* ${this.formatDate(this.periodStart)} - ${this.formatDate(this.periodEnd)}`,
          },
        },
      ],
    });

    blocks.push({ type: "divider" } as SlackBlock);

    // Summary Section
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Executive Summary*",
      },
    });

    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Health Score*\n${this.getHealthEmoji(this.summary.healthScore)} ${this.summary.healthScore}/100`,
        },
        {
          type: "mrkdwn",
          text: `*Status*\n${this.summary.healthStatus}`,
        },
        {
          type: "mrkdwn",
          text: `*Total Executions*\n${this.summary.totalExecutions.toLocaleString()}`,
        },
        {
          type: "mrkdwn",
          text: `*Success Rate*\n${this.summary.successRate.toFixed(1)}%`,
        },
      ],
    });

    // Critical Issues
    if (this.summary.criticalIssues.length > 0) {
      blocks.push({ type: "divider" } as SlackBlock);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Critical Issues*",
        },
      });

      for (const issue of this.summary.criticalIssues.slice(0, 3)) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${this.getSeverityEmoji(issue.severity)} *${issue.type}*: ${issue.description}`,
          },
        });
      }
    }

    // Top Agents
    if (this.summary.topAgents.length > 0) {
      blocks.push({ type: "divider" } as SlackBlock);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Top Performing Agents*",
        },
      });

      const topAgentsList = this.summary.topAgents
        .slice(0, 5)
        .map((a, i) => `${i + 1}. *${a.name}* - ${a.executionCount} executions, ${a.successRate.toFixed(1)}% success`)
        .join("\n");

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: topAgentsList,
        },
      });
    }

    // Recommendations Preview
    if (this.recommendations.length > 0) {
      blocks.push({ type: "divider" } as SlackBlock);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top Recommendations* (${this.recommendations.length} total)`,
        },
      });

      for (const rec of this.recommendations.slice(0, 2)) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${this.getPriorityEmoji(rec.priority)} *${rec.title}*\n${rec.suggestedAction}`,
          },
        });
      }
    }

    // Footer
    blocks.push({ type: "divider" } as SlackBlock);
    blocks.push({
      type: "context",
      elements: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Generated by Meta Agent at ${this.formatDateTime(this.generatedAt)}`,
          },
        },
      ],
    });

    return blocks;
  }

  toHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>System Health Report - ${this.period}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .metric-card { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 24px; font-weight: bold; color: #333; }
    .metric-label { font-size: 12px; color: #666; margin-top: 5px; }
    .health-good { color: #22c55e; }
    .health-warn { color: #f59e0b; }
    .health-bad { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f5f5f5; font-weight: 600; }
    .issue { padding: 10px; margin: 10px 0; border-radius: 5px; }
    .issue-critical { background: #fef2f2; border-left: 4px solid #ef4444; }
    .issue-high { background: #fff7ed; border-left: 4px solid #f97316; }
    .recommendation { padding: 15px; margin: 10px 0; background: #f0f9ff; border-radius: 5px; }
    .recommendation-title { font-weight: 600; color: #0369a1; }
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>System Health Report - ${this.period.charAt(0).toUpperCase() + this.period.slice(1)}</h1>
  <p><strong>Period:</strong> ${this.formatDate(this.periodStart)} - ${this.formatDate(this.periodEnd)}</p>

  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-value ${this.getHealthClass(this.summary.healthScore)}">${this.summary.healthScore}</div>
      <div class="metric-label">Health Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${this.summary.totalExecutions.toLocaleString()}</div>
      <div class="metric-label">Total Executions</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${this.summary.successRate.toFixed(1)}%</div>
      <div class="metric-label">Success Rate</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">$${(this.summary.totalCostCents / 100).toFixed(2)}</div>
      <div class="metric-label">Total Cost</div>
    </div>
  </div>

  ${this.summary.criticalIssues.length > 0 ? `
  <h2>Critical Issues</h2>
  ${this.summary.criticalIssues.map(issue => `
    <div class="issue issue-${issue.severity}">
      <strong>${issue.type}:</strong> ${issue.description}
    </div>
  `).join("")}
  ` : ""}

  <h2>Agent Performance</h2>
  <h3>Top Performers</h3>
  <table>
    <tr><th>Agent</th><th>Executions</th><th>Success Rate</th></tr>
    ${this.agentPerformance.topPerformers.slice(0, 5).map(a => `
      <tr><td>${a.name}</td><td>${a.executionCount}</td><td>${a.successRate.toFixed(1)}%</td></tr>
    `).join("")}
  </table>

  ${this.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  ${this.recommendations.slice(0, 5).map(rec => `
    <div class="recommendation">
      <div class="recommendation-title">${rec.title}</div>
      <p><strong>Priority:</strong> ${rec.priority} | <strong>Impact:</strong> ${rec.impact}</p>
      <p>${rec.suggestedAction}</p>
    </div>
  `).join("")}
  ` : ""}

  <footer>
    Generated by Meta Agent at ${this.formatDateTime(this.generatedAt)}
  </footer>
</body>
</html>`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private formatDateTime(date: Date): string {
    return date.toISOString().replace("T", " ").substring(0, 19);
  }

  private getHealthEmoji(score: number): string {
    if (score >= 80) return ":large_green_circle:";
    if (score >= 60) return ":large_yellow_circle:";
    if (score >= 40) return ":large_orange_circle:";
    return ":red_circle:";
  }

  private getHealthClass(score: number): string {
    if (score >= 80) return "health-good";
    if (score >= 60) return "health-warn";
    return "health-bad";
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case "critical": return ":rotating_light:";
      case "high": return ":warning:";
      case "medium": return ":large_orange_diamond:";
      default: return ":information_source:";
    }
  }

  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case "critical": return ":rotating_light:";
      case "high": return ":arrow_up:";
      case "medium": return ":arrow_right:";
      default: return ":arrow_down:";
    }
  }
}

// ============================================================================
// Report Generator Class
// ============================================================================

export class ReportGenerator {
  /**
   * Generate a daily report
   */
  async generateDailyReport(organizationId: string): Promise<SystemReport> {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setHours(23, 59, 59, 999);

    return this.generateReport(organizationId, "daily", periodStart, periodEnd);
  }

  /**
   * Generate a weekly report
   */
  async generateWeeklyReport(organizationId: string): Promise<SystemReport> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setHours(23, 59, 59, 999);

    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);

    return this.generateReport(organizationId, "weekly", periodStart, periodEnd);
  }

  /**
   * Generate a monthly report
   */
  async generateMonthlyReport(organizationId: string): Promise<SystemReport> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setHours(23, 59, 59, 999);

    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
    periodStart.setHours(0, 0, 0, 0);

    return this.generateReport(organizationId, "monthly", periodStart, periodEnd);
  }

  /**
   * Generate a report for a specific period
   */
  private async generateReport(
    organizationId: string,
    period: "daily" | "weekly" | "monthly",
    periodStart: Date,
    periodEnd: Date
  ): Promise<SystemReport> {
    logger.info("Generating system report", { organizationId, period });

    // Gather all data in parallel
    const [health, ecosystem, knowledgeGaps, recommendations] = await Promise.all([
      healthMonitor.checkHealth(organizationId),
      agentAnalyzer.analyzeEcosystem(organizationId),
      knowledgeAnalyzer.analyzeAll(organizationId),
      recommendationEngine.generateRecommendations(organizationId),
    ]);

    // Get workflow insights
    const workflowInsights = await this.getWorkflowInsights(organizationId, periodStart, periodEnd);

    // Get cost data
    const costData = await this.getCostData(organizationId, periodStart, periodEnd);

    // Build agent performance section
    const agentPerformance: AgentPerformanceSection = {
      topPerformers: ecosystem.topPerformers.map(a => ({
        agentId: a.agentId,
        name: a.name,
        executionCount: a.metrics.totalExecutions,
        successRate: a.metrics.successRate,
        status: this.mapPerformanceToStatus(a),
      })),
      underperformers: ecosystem.underperformers.map(a => ({
        agentId: a.agentId,
        name: a.name,
        executionCount: a.metrics.totalExecutions,
        successRate: a.metrics.successRate,
        status: this.mapPerformanceToStatus(a),
      })),
      mostActive: [...ecosystem.topPerformers]
        .sort((a, b) => b.metrics.totalExecutions - a.metrics.totalExecutions)
        .slice(0, 5)
        .map(a => ({
          agentId: a.agentId,
          name: a.name,
          executionCount: a.metrics.totalExecutions,
          successRate: a.metrics.successRate,
          status: this.mapPerformanceToStatus(a),
        })),
      errorProne: [...ecosystem.topPerformers, ...ecosystem.underperformers]
        .filter(a => a.metrics.errorRate > 5)
        .sort((a, b) => b.metrics.errorRate - a.metrics.errorRate)
        .slice(0, 5)
        .map(a => ({
          agentId: a.agentId,
          name: a.name,
          executionCount: a.metrics.totalExecutions,
          successRate: a.metrics.successRate,
          status: this.mapPerformanceToStatus(a),
        })),
    };

    // Build critical issues from anomalies
    const criticalIssues: Issue[] = health.anomalies
      .filter(a => a.severity === "critical" || a.severity === "high")
      .map(a => ({
        type: a.type,
        severity: a.severity,
        description: a.description,
        affectedEntity: a.affectedEntity,
      }));

    // Build report
    const report = new SystemReportImpl({
      period,
      periodStart,
      periodEnd,
      generatedAt: new Date(),
      summary: {
        healthScore: health.overallScore,
        healthStatus: health.status,
        totalExecutions: health.summary.totalExecutionsLast24h,
        successRate: health.summary.overallSuccessRate,
        totalCostCents: costData.totalCostCents,
        topAgents: agentPerformance.topPerformers.slice(0, 5),
        criticalIssues,
      },
      agentPerformance,
      workflowInsights,
      knowledgeGaps: knowledgeGaps.slice(0, 10),
      recommendations: recommendations.slice(0, 10),
    });

    // Save report to database
    await this.saveReport(organizationId, report);

    logger.info("System report generated", {
      organizationId,
      period,
      healthScore: report.summary.healthScore,
      recommendationCount: report.recommendations.length,
    });

    return report;
  }

  /**
   * Get workflow insights for the period
   */
  private async getWorkflowInsights(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<WorkflowInsightsSection> {
    const executions = await prisma.workflowExecution.findMany({
      where: {
        workflow: { organizationId },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        workflow: { select: { name: true } },
      },
    });

    const totalExecutions = executions.length;
    const successfulExecs = executions.filter(e => e.status === "completed");
    const successRate = totalExecutions > 0 ? (successfulExecs.length / totalExecutions) * 100 : 100;

    const durations = executions
      .filter(e => e.startedAt && e.completedAt)
      .map(e => e.completedAt!.getTime() - e.startedAt!.getTime());

    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // Group by workflow
    const workflowStats = new Map<string, { executions: number; successes: number; lastError?: string }>();

    for (const exec of executions) {
      const name = exec.workflow.name;
      if (!workflowStats.has(name)) {
        workflowStats.set(name, { executions: 0, successes: 0 });
      }
      const stats = workflowStats.get(name)!;
      stats.executions++;
      if (exec.status === "completed") {
        stats.successes++;
      }
      if (exec.errorMessage) {
        stats.lastError = exec.errorMessage;
      }
    }

    const topWorkflows = Array.from(workflowStats.entries())
      .sort((a, b) => b[1].executions - a[1].executions)
      .slice(0, 5)
      .map(([name, stats]) => ({
        name,
        executionCount: stats.executions,
        successRate: stats.executions > 0 ? (stats.successes / stats.executions) * 100 : 100,
      }));

    const failedWorkflows = Array.from(workflowStats.entries())
      .filter(([, stats]) => stats.executions > stats.successes)
      .sort((a, b) => (b[1].executions - b[1].successes) - (a[1].executions - a[1].successes))
      .slice(0, 5)
      .map(([name, stats]) => ({
        name,
        failureCount: stats.executions - stats.successes,
        lastError: stats.lastError,
      }));

    return {
      totalExecutions,
      successRate: Math.round(successRate * 100) / 100,
      avgDurationMs,
      topWorkflows,
      failedWorkflows,
    };
  }

  /**
   * Get cost data for the period
   */
  private async getCostData(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ totalCostCents: number }> {
    // TODO: agentCostRecord table doesn't exist yet - stub with empty array
    let costRecords: { costCents: number }[] = [];
    try {
      costRecords = await (prisma as any).agentCostRecord?.findMany({
        where: {
          organizationId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: { costCents: true },
      }) || [];
    } catch {
      // Table doesn't exist yet, use empty array
      logger.warn("agentCostRecord table not available", { organizationId });
    }

    const totalCostCents = costRecords.reduce((sum: number, r: { costCents: number }) => sum + r.costCents, 0);

    return { totalCostCents: Math.round(totalCostCents / 100) }; // Convert from internal precision
  }

  /**
   * Save report to database
   */
  private async saveReport(organizationId: string, report: SystemReport): Promise<void> {
    try {
      const saved = await (prisma as any).systemReport?.create({
        data: {
          organizationId,
          type: report.period,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          summary: report.summary as unknown as object,
          agentPerformance: report.agentPerformance as unknown as object,
          workflowInsights: report.workflowInsights as unknown as object,
          knowledgeGaps: report.knowledgeGaps as unknown as object,
          recommendations: report.recommendations as unknown as object,
          markdownContent: report.toMarkdown(),
        },
      });

      if (saved) {
        report.id = saved.id;
      }
    } catch (error) {
      logger.warn("Could not save report to database (table may not exist yet)", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }

  /**
   * Send report to Slack
   */
  async sendToSlack(
    organizationId: string,
    report: SystemReport,
    channel: string
  ): Promise<void> {
    try {
      // Get Slack integration
      const slackIntegration = await prisma.slackIntegration.findFirst({
        where: { organizationId, enabled: true },
      });

      if (!slackIntegration) {
        logger.warn("No Slack integration found for organization", { organizationId });
        return;
      }

      // TODO: Implement actual Slack message sending
      // This would use the Slack API with slackIntegration.botToken
      logger.info("Would send report to Slack", {
        organizationId,
        channel,
        reportId: report.id,
      });

      // Update report with Slack send time
      if (report.id) {
        try {
          await (prisma as any).systemReport?.update({
            where: { id: report.id },
            data: {
              slackSentAt: new Date(),
              slackChannel: channel,
            },
          });
        } catch {
          // Table may not exist yet
        }
      }
    } catch (error) {
      logger.error("Failed to send report to Slack", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        channel,
      });
    }
  }

  /**
   * Get a report by ID
   */
  async getReport(reportId: string): Promise<SystemReport | null> {
    try {
      const saved = await (prisma as any).systemReport?.findUnique({
        where: { id: reportId },
      });

      if (!saved) {
        return null;
      }

      return new SystemReportImpl({
        id: saved.id,
        period: saved.type as "daily" | "weekly" | "monthly",
        periodStart: saved.periodStart,
        periodEnd: saved.periodEnd,
        generatedAt: saved.createdAt,
        summary: saved.summary as unknown as SystemReport["summary"],
        agentPerformance: saved.agentPerformance as unknown as AgentPerformanceSection,
        workflowInsights: saved.workflowInsights as unknown as WorkflowInsightsSection,
        knowledgeGaps: (saved.knowledgeGaps as unknown as KnowledgeGap[]) || [],
        recommendations: (saved.recommendations as unknown as Recommendation[]) || [],
      });
    } catch {
      return null;
    }
  }

  /**
   * List reports for an organization
   */
  async listReports(
    organizationId: string,
    options?: { type?: string; limit?: number }
  ): Promise<{ id: string; type: string; periodStart: Date; periodEnd: Date; createdAt: Date }[]> {
    try {
      const reports = await (prisma as any).systemReport?.findMany({
        where: {
          organizationId,
          ...(options?.type && { type: options.type }),
        },
        select: {
          id: true,
          type: true,
          periodStart: true,
          periodEnd: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: options?.limit || 20,
      });

      return reports || [];
    } catch {
      return [];
    }
  }

  /**
   * Map agent performance to status
   */
  private mapPerformanceToStatus(agent: AgentPerformanceAnalysis): "healthy" | "degraded" | "unhealthy" {
    if (agent.performanceScore >= 70) return "healthy";
    if (agent.performanceScore >= 50) return "degraded";
    return "unhealthy";
  }
}

// Export singleton instance
export const reportGenerator = new ReportGenerator();
