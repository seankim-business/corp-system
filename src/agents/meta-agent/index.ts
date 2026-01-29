/**
 * Meta Agent - System Self-Management Agent
 *
 * Central entry point for the Meta Agent that monitors and manages
 * the entire agent ecosystem.
 *
 * Responsibilities:
 * - Health monitoring: Track all agents' performance, errors, latency
 * - Knowledge structuring: Find gaps in documentation, suggest improvements
 * - Agent management: Detect underutilized agents, suggest new agents
 * - System reports: Generate weekly/monthly system health reports
 */

import { logger } from "../../utils/logger";
import { HealthMonitor, healthMonitor, SystemHealth, AgentHealth, Anomaly } from "./health-monitor";
import { KnowledgeAnalyzer, knowledgeAnalyzer, KnowledgeGap, CoverageReport } from "./knowledge-analyzer";
import { AgentAnalyzer, agentAnalyzer, AgentPerformanceAnalysis, AgentEcosystemAnalysis } from "./agent-analyzer";
import { ReportGenerator, reportGenerator, SystemReport } from "./report-generator";
import { RecommendationEngine, recommendationEngine, Recommendation } from "./recommendation-engine";

// Re-export all types
export type {
  SystemHealth,
  AgentHealth,
  Anomaly,
  KnowledgeGap,
  CoverageReport,
  AgentPerformanceAnalysis,
  AgentEcosystemAnalysis,
  SystemReport,
  Recommendation,
};

// Re-export all classes
export {
  HealthMonitor,
  KnowledgeAnalyzer,
  AgentAnalyzer,
  ReportGenerator,
  RecommendationEngine,
};

// Re-export singleton instances
export {
  healthMonitor,
  knowledgeAnalyzer,
  agentAnalyzer,
  reportGenerator,
  recommendationEngine,
};

/**
 * MetaAgent - Unified interface for all Meta Agent capabilities
 */
export class MetaAgent {
  private healthMonitor: HealthMonitor;
  private knowledgeAnalyzer: KnowledgeAnalyzer;
  private agentAnalyzer: AgentAnalyzer;
  private reportGenerator: ReportGenerator;
  private recommendationEngine: RecommendationEngine;

  constructor() {
    this.healthMonitor = healthMonitor;
    this.knowledgeAnalyzer = knowledgeAnalyzer;
    this.agentAnalyzer = agentAnalyzer;
    this.reportGenerator = reportGenerator;
    this.recommendationEngine = recommendationEngine;
  }

  // =========================================================================
  // Health Monitoring
  // =========================================================================

  /**
   * Get overall system health
   */
  async checkHealth(organizationId: string): Promise<SystemHealth> {
    return this.healthMonitor.checkHealth(organizationId);
  }

  /**
   * Get health for a specific agent
   */
  async getAgentHealth(organizationId: string, agentId: string): Promise<AgentHealth | null> {
    return this.healthMonitor.getAgentHealth(organizationId, agentId);
  }

  /**
   * Detect anomalies in the system
   */
  async detectAnomalies(organizationId: string): Promise<Anomaly[]> {
    return this.healthMonitor.detectAnomalies(organizationId);
  }

  /**
   * Get health history
   */
  async getHealthHistory(organizationId: string, days?: number): Promise<SystemHealth[]> {
    return this.healthMonitor.getHealthHistory(organizationId, days);
  }

  /**
   * Save a health snapshot
   */
  async saveHealthSnapshot(organizationId: string, health: SystemHealth): Promise<void> {
    return this.healthMonitor.saveHealthSnapshot(organizationId, health);
  }

  // =========================================================================
  // Knowledge Analysis
  // =========================================================================

  /**
   * Find processes without SOPs
   */
  async findMissingSOPs(organizationId: string): Promise<KnowledgeGap[]> {
    return this.knowledgeAnalyzer.findMissingSOPs(organizationId);
  }

  /**
   * Find outdated documents
   */
  async findOutdatedDocs(organizationId: string): Promise<KnowledgeGap[]> {
    return this.knowledgeAnalyzer.findOutdatedDocs(organizationId);
  }

  /**
   * Find broken links
   */
  async findBrokenLinks(organizationId: string): Promise<KnowledgeGap[]> {
    return this.knowledgeAnalyzer.findBrokenLinks(organizationId);
  }

  /**
   * Analyze documentation coverage
   */
  async analyzeCoverage(organizationId: string): Promise<CoverageReport> {
    return this.knowledgeAnalyzer.analyzeCoverage(organizationId);
  }

  /**
   * Run full knowledge analysis
   */
  async analyzeKnowledge(organizationId: string): Promise<KnowledgeGap[]> {
    const gaps = await this.knowledgeAnalyzer.analyzeAll(organizationId);
    await this.knowledgeAnalyzer.saveKnowledgeGaps(organizationId, gaps);
    return gaps;
  }

  // =========================================================================
  // Agent Analysis
  // =========================================================================

  /**
   * Analyze a specific agent's performance
   */
  async analyzeAgent(organizationId: string, agentId: string): Promise<AgentPerformanceAnalysis | null> {
    return this.agentAnalyzer.analyzeAgent(organizationId, agentId);
  }

  /**
   * Analyze the entire agent ecosystem
   */
  async analyzeEcosystem(organizationId: string): Promise<AgentEcosystemAnalysis> {
    return this.agentAnalyzer.analyzeEcosystem(organizationId);
  }

  /**
   * Find capability gaps
   */
  async findCapabilityGaps(organizationId: string): Promise<any[]> {
    return this.agentAnalyzer.findCapabilityGaps(organizationId);
  }

  /**
   * Detect underutilized agents
   */
  async detectUnderutilizedAgents(organizationId: string): Promise<AgentPerformanceAnalysis[]> {
    return this.agentAnalyzer.detectUnderutilizedAgents(organizationId);
  }

  // =========================================================================
  // Report Generation
  // =========================================================================

  /**
   * Generate daily report
   */
  async generateDailyReport(organizationId: string): Promise<SystemReport> {
    return this.reportGenerator.generateDailyReport(organizationId);
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(organizationId: string): Promise<SystemReport> {
    return this.reportGenerator.generateWeeklyReport(organizationId);
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(organizationId: string): Promise<SystemReport> {
    return this.reportGenerator.generateMonthlyReport(organizationId);
  }

  /**
   * Send report to Slack
   */
  async sendReportToSlack(organizationId: string, report: SystemReport, channel: string): Promise<void> {
    return this.reportGenerator.sendToSlack(organizationId, report, channel);
  }

  /**
   * Get a report by ID
   */
  async getReport(reportId: string): Promise<SystemReport | null> {
    return this.reportGenerator.getReport(reportId);
  }

  /**
   * List reports
   */
  async listReports(organizationId: string, options?: { type?: string; limit?: number }): Promise<any[]> {
    return this.reportGenerator.listReports(organizationId, options);
  }

  // =========================================================================
  // Recommendations
  // =========================================================================

  /**
   * Generate recommendations
   */
  async generateRecommendations(organizationId: string): Promise<Recommendation[]> {
    return this.recommendationEngine.generateRecommendations(organizationId);
  }

  /**
   * Get pending recommendations
   */
  async getPendingRecommendations(organizationId: string, filters?: any): Promise<Recommendation[]> {
    return this.recommendationEngine.getPendingRecommendations(organizationId, filters);
  }

  /**
   * Accept a recommendation
   */
  async acceptRecommendation(recommendationId: string, userId: string): Promise<void> {
    return this.recommendationEngine.acceptRecommendation(recommendationId, userId);
  }

  /**
   * Reject a recommendation
   */
  async rejectRecommendation(recommendationId: string): Promise<void> {
    return this.recommendationEngine.rejectRecommendation(recommendationId);
  }

  /**
   * Mark recommendation as implemented
   */
  async markRecommendationImplemented(recommendationId: string): Promise<void> {
    return this.recommendationEngine.markImplemented(recommendationId);
  }

  // =========================================================================
  // Combined Operations
  // =========================================================================

  /**
   * Run a comprehensive system check
   */
  async runSystemCheck(organizationId: string): Promise<{
    health: SystemHealth;
    knowledgeGaps: KnowledgeGap[];
    recommendations: Recommendation[];
  }> {
    logger.info("Running comprehensive system check", { organizationId });

    const [health, knowledgeGaps, recommendations] = await Promise.all([
      this.checkHealth(organizationId),
      this.analyzeKnowledge(organizationId),
      this.generateRecommendations(organizationId),
    ]);

    // Save health snapshot if score is below threshold
    if (health.overallScore < 80) {
      await this.saveHealthSnapshot(organizationId, health);
    }

    logger.info("System check completed", {
      organizationId,
      healthScore: health.overallScore,
      knowledgeGapsCount: knowledgeGaps.length,
      recommendationsCount: recommendations.length,
    });

    return { health, knowledgeGaps, recommendations };
  }

  /**
   * Send an alert if health degrades below threshold
   */
  async sendHealthAlert(organizationId: string, threshold: number = 70): Promise<boolean> {
    const health = await this.checkHealth(organizationId);

    if (health.overallScore < threshold) {
      const report = await this.generateDailyReport(organizationId);

      // Send to Slack if configured
      await this.sendReportToSlack(organizationId, report, "#system-alerts");

      logger.warn("Health alert sent", {
        organizationId,
        healthScore: health.overallScore,
        threshold,
      });

      return true;
    }

    return false;
  }
}

// Export singleton instance
export const metaAgent = new MetaAgent();

// Default export
export default metaAgent;
