/**
 * Knowledge Analyzer - Knowledge Gap Detection Service
 *
 * Analyzes documentation, SOPs, and knowledge base to detect gaps,
 * outdated content, and improvement opportunities.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { getAgentsMap, AgentConfig } from "../../config/agent-loader";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeGap {
  type: "missing_sop" | "outdated_doc" | "undocumented_process" | "broken_link" | "orphaned_document" | "coverage_gap";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  suggestedAction: string;
  relatedEntities: string[];
  metadata?: Record<string, unknown>;
}

export interface CoverageReport {
  totalAgents: number;
  agentsWithSOPs: number;
  agentsWithoutSOPs: number;
  totalSOPs: number;
  sopsByFunction: Record<string, number>;
  coveragePercent: number;
  gaps: KnowledgeGap[];
}

export interface DocumentHealth {
  documentId: string;
  title: string;
  source: string;
  lastUpdated: Date;
  daysSinceUpdate: number;
  accessCount?: number;
  status: "current" | "stale" | "outdated";
  suggestedAction?: string;
}

export interface LinkCheckResult {
  source: string;
  target: string;
  status: "valid" | "broken" | "redirect";
  error?: string;
}

// ============================================================================
// Knowledge Analyzer Class
// ============================================================================

export class KnowledgeAnalyzer {
  private readonly STALE_THRESHOLD_DAYS = 90;
  private readonly OUTDATED_THRESHOLD_DAYS = 180;
  private readonly PROJECT_ROOT: string;

  constructor(projectRoot?: string) {
    this.PROJECT_ROOT = projectRoot || process.cwd();
  }

  /**
   * Find processes without SOPs
   */
  async findMissingSOPs(organizationId: string): Promise<KnowledgeGap[]> {
    const gaps: KnowledgeGap[] = [];
    const agentsMap = getAgentsMap();

    // Get all workflows
    const workflows = await prisma.workflow.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        sopEnabled: true,
        sopSteps: true,
      },
    });

    // Check each agent for SOPs
    for (const [agentId, agentConfig] of Object.entries(agentsMap) as [string, AgentConfig][]) {
      const agentSOPs = (agentConfig as any).sops || [];

      if (agentSOPs.length === 0) {
        gaps.push({
          type: "missing_sop",
          title: `No SOPs defined for ${agentConfig.name}`,
          description: `Agent ${agentConfig.name} (${agentId}) has no SOPs defined in its configuration. SOPs help standardize agent behavior and improve reliability.`,
          severity: "medium",
          suggestedAction: `Create SOP files for ${agentConfig.name}'s common tasks and add them to config/agents/${agentId}.yaml`,
          relatedEntities: [agentId],
          metadata: {
            agentFunction: agentConfig.function,
            skills: agentConfig.skills,
          },
        });
      }
    }

    // Check for workflows without SOPs
    for (const workflow of workflows) {
      if (!workflow.sopEnabled || !workflow.sopSteps) {
        // Check execution frequency
        const executionCount = await prisma.workflowExecution.count({
          where: { workflowId: workflow.id },
        });

        if (executionCount >= 5) {
          gaps.push({
            type: "missing_sop",
            title: `Frequently used workflow without SOP: ${workflow.name}`,
            description: `Workflow "${workflow.name}" has been executed ${executionCount} times but has no SOP defined. Consider adding an SOP for consistency.`,
            severity: executionCount >= 20 ? "high" : "medium",
            suggestedAction: `Enable SOP mode for workflow "${workflow.name}" and define step procedures`,
            relatedEntities: [workflow.id, workflow.name],
            metadata: {
              executionCount,
              workflowId: workflow.id,
            },
          });
        }
      }
    }

    // Check for repetitive patterns that could become SOPs
    // NOTE: Requires DetectedPattern table in Prisma schema
    let patterns: { id: string; frequency: number; confidence: number; type: string }[] = [];
    try {
      patterns = await (prisma as any).detectedPattern?.findMany({
        where: {
          organizationId,
          status: "active",
          confidence: { gte: 0.7 },
        },
        orderBy: { frequency: "desc" },
        take: 10,
      }) || [];
    } catch {
      // Table doesn't exist yet, use empty array
      logger.warn("detectedPattern table not available", { organizationId });
    }

    for (const pattern of patterns) {
      gaps.push({
        type: "undocumented_process",
        title: `Detected pattern could become SOP`,
        description: `A repeating pattern with ${pattern.frequency} occurrences and ${(pattern.confidence * 100).toFixed(1)}% confidence was detected. Consider formalizing this as an SOP.`,
        severity: pattern.frequency >= 10 ? "high" : "medium",
        suggestedAction: `Review detected pattern ${pattern.id} and convert to SOP if appropriate`,
        relatedEntities: [pattern.id],
        metadata: {
          frequency: pattern.frequency,
          confidence: pattern.confidence,
          patternType: pattern.type,
        },
      });
    }

    return gaps;
  }

  /**
   * Find outdated documents
   */
  async findOutdatedDocs(_organizationId: string): Promise<KnowledgeGap[]> {
    const gaps: KnowledgeGap[] = [];
    const now = new Date();

    // Check document embeddings for staleness
    // Note: DocumentEmbedding model may not exist yet, skip if not available
    let documents: { id: string; title: string; sourceType: string; sourceUrl: string | null; updatedAt: Date; metadata: unknown }[] = [];
    try {
      documents = await (prisma as any).documentEmbedding?.findMany({
        where: { organizationId: _organizationId },
        select: {
          id: true,
          title: true,
          sourceType: true,
          sourceUrl: true,
          updatedAt: true,
          metadata: true,
        },
      }) || [];
    } catch {
      // DocumentEmbedding table may not exist, continue without it
    }

    for (const doc of documents) {
      const daysSinceUpdate = Math.floor((now.getTime() - doc.updatedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceUpdate >= this.OUTDATED_THRESHOLD_DAYS) {
        gaps.push({
          type: "outdated_doc",
          title: `Outdated document: ${doc.title}`,
          description: `Document "${doc.title}" from ${doc.sourceType} hasn't been updated in ${daysSinceUpdate} days.`,
          severity: daysSinceUpdate >= 365 ? "high" : "medium",
          suggestedAction: `Review and update "${doc.title}" or archive if no longer relevant`,
          relatedEntities: [doc.id, doc.sourceType],
          metadata: {
            daysSinceUpdate,
            sourceType: doc.sourceType,
            sourceUrl: doc.sourceUrl,
          },
        });
      } else if (daysSinceUpdate >= this.STALE_THRESHOLD_DAYS) {
        gaps.push({
          type: "outdated_doc",
          title: `Stale document: ${doc.title}`,
          description: `Document "${doc.title}" from ${doc.sourceType} is becoming stale (${daysSinceUpdate} days since last update).`,
          severity: "low",
          suggestedAction: `Consider reviewing "${doc.title}" to ensure information is current`,
          relatedEntities: [doc.id, doc.sourceType],
          metadata: {
            daysSinceUpdate,
            sourceType: doc.sourceType,
            sourceUrl: doc.sourceUrl,
          },
        });
      }
    }

    // Check local SOP files if they exist
    const sopsDir = path.join(this.PROJECT_ROOT, "sops");
    if (fs.existsSync(sopsDir)) {
      await this.checkDirectoryForStaleness(sopsDir, gaps);
    }

    // Check local docs directory
    const docsDir = path.join(this.PROJECT_ROOT, "docs");
    if (fs.existsSync(docsDir)) {
      await this.checkDirectoryForStaleness(docsDir, gaps);
    }

    return gaps;
  }

  /**
   * Check a directory for stale files
   */
  private async checkDirectoryForStaleness(dirPath: string, gaps: KnowledgeGap[]): Promise<void> {
    const now = new Date();

    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
          const stats = fs.statSync(fullPath);
          const daysSinceModified = Math.floor((now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24));
          const relativePath = path.relative(this.PROJECT_ROOT, fullPath);

          if (daysSinceModified >= this.OUTDATED_THRESHOLD_DAYS) {
            gaps.push({
              type: "outdated_doc",
              title: `Outdated local file: ${entry.name}`,
              description: `File "${relativePath}" hasn't been modified in ${daysSinceModified} days.`,
              severity: daysSinceModified >= 365 ? "medium" : "low",
              suggestedAction: `Review and update "${relativePath}" or remove if obsolete`,
              relatedEntities: [relativePath],
              metadata: {
                daysSinceModified,
                filePath: fullPath,
                fileSize: stats.size,
              },
            });
          }
        }
      }
    };

    try {
      scanDirectory(dirPath);
    } catch (error) {
      logger.warn("Failed to scan directory for staleness", {
        dir: dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find broken links between documents
   */
  async findBrokenLinks(_organizationId: string): Promise<KnowledgeGap[]> {
    const gaps: KnowledgeGap[] = [];

    // Check for broken SOP references in agent configs
    const agentsMap = getAgentsMap();

    for (const [agentId, agentConfig] of Object.entries(agentsMap) as [string, AgentConfig][]) {
      const sopPaths = (agentConfig as any).sops || [];

      for (const sopPath of sopPaths) {
        const fullPath = path.join(this.PROJECT_ROOT, sopPath.replace(/^\//, ""));

        if (!fs.existsSync(fullPath)) {
          gaps.push({
            type: "broken_link",
            title: `Broken SOP reference in ${agentConfig.name}`,
            description: `Agent ${agentConfig.name} references SOP "${sopPath}" which does not exist.`,
            severity: "high",
            suggestedAction: `Create the missing SOP file at "${sopPath}" or update the agent config to remove the reference`,
            relatedEntities: [agentId, sopPath],
            metadata: {
              agentId,
              sopPath,
              expectedLocation: fullPath,
            },
          });
        }
      }
    }

    // Check for broken links in markdown files
    const docsDir = path.join(this.PROJECT_ROOT, "docs");
    if (fs.existsSync(docsDir)) {
      await this.scanMarkdownForBrokenLinks(docsDir, gaps);
    }

    const planDir = path.join(this.PROJECT_ROOT, "plan");
    if (fs.existsSync(planDir)) {
      await this.scanMarkdownForBrokenLinks(planDir, gaps);
    }

    return gaps;
  }

  /**
   * Scan markdown files for broken local links
   */
  private async scanMarkdownForBrokenLinks(dirPath: string, gaps: KnowledgeGap[]): Promise<void> {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    const scanFile = (filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
          const [, linkText, linkTarget] = match;

          // Skip external links and anchors
          if (linkTarget.startsWith("http") || linkTarget.startsWith("#") || linkTarget.startsWith("mailto:")) {
            continue;
          }

          // Resolve relative path
          const targetPath = path.resolve(path.dirname(filePath), linkTarget.split("#")[0]);

          if (!fs.existsSync(targetPath)) {
            const relativePath = path.relative(this.PROJECT_ROOT, filePath);
            gaps.push({
              type: "broken_link",
              title: `Broken link in ${path.basename(filePath)}`,
              description: `Document "${relativePath}" contains a broken link to "${linkTarget}" (text: "${linkText}")`,
              severity: "medium",
              suggestedAction: `Fix or remove the broken link to "${linkTarget}" in "${relativePath}"`,
              relatedEntities: [relativePath, linkTarget],
              metadata: {
                sourceFile: filePath,
                linkText,
                linkTarget,
                expectedPath: targetPath,
              },
            });
          }
        }
      } catch (error) {
        logger.warn("Failed to scan file for broken links", {
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const scanDirectory = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            scanDirectory(fullPath);
          } else if (entry.name.endsWith(".md")) {
            scanFile(fullPath);
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    };

    scanDirectory(dirPath);
  }

  /**
   * Analyze documentation coverage by function/agent
   */
  async analyzeCoverage(organizationId: string): Promise<CoverageReport> {
    const agentsMap = getAgentsMap();
    const gaps: KnowledgeGap[] = [];
    const sopsByFunction: Record<string, number> = {};

    let agentsWithSOPs = 0;
    let totalSOPs = 0;

    for (const [agentId, agentConfig] of Object.entries(agentsMap) as [string, AgentConfig][]) {
      const agentSOPs = (agentConfig as any).sops || [];
      const functionName = agentConfig.function || "unknown";

      if (agentSOPs.length > 0) {
        agentsWithSOPs++;
        totalSOPs += agentSOPs.length;

        sopsByFunction[functionName] = (sopsByFunction[functionName] || 0) + agentSOPs.length;
      } else {
        // Check if agent has significant activity but no SOPs
        const execCount = await prisma.orchestratorExecution.count({
          where: {
            organizationId,
            category: agentId,
          },
        });

        if (execCount >= 10) {
          gaps.push({
            type: "coverage_gap",
            title: `Active agent without documentation: ${agentConfig.name}`,
            description: `Agent ${agentConfig.name} has ${execCount} executions but no SOPs defined. This indicates potential documentation debt.`,
            severity: execCount >= 50 ? "high" : "medium",
            suggestedAction: `Create SOPs for ${agentConfig.name} to document its standard processes`,
            relatedEntities: [agentId],
            metadata: {
              executionCount: execCount,
              agentFunction: functionName,
            },
          });
        }
      }
    }

    // Check for functions with low SOP coverage
    const functionAgentCounts: Record<string, { total: number; withSOPs: number }> = {};

    for (const [, agentConfig] of Object.entries(agentsMap) as [string, AgentConfig][]) {
      const functionName = agentConfig.function || "unknown";
      if (!functionAgentCounts[functionName]) {
        functionAgentCounts[functionName] = { total: 0, withSOPs: 0 };
      }
      functionAgentCounts[functionName].total++;
      if (((agentConfig as any).sops || []).length > 0) {
        functionAgentCounts[functionName].withSOPs++;
      }
    }

    for (const [functionName, counts] of Object.entries(functionAgentCounts)) {
      const coverage = (counts.withSOPs / counts.total) * 100;
      if (coverage < 50 && counts.total >= 2) {
        gaps.push({
          type: "coverage_gap",
          title: `Low SOP coverage for ${functionName}`,
          description: `Function "${functionName}" has only ${counts.withSOPs}/${counts.total} agents with SOPs (${coverage.toFixed(0)}% coverage).`,
          severity: coverage < 25 ? "high" : "medium",
          suggestedAction: `Improve SOP documentation for ${functionName} function agents`,
          relatedEntities: [functionName],
          metadata: {
            totalAgents: counts.total,
            agentsWithSOPs: counts.withSOPs,
            coveragePercent: coverage,
          },
        });
      }
    }

    const totalAgents = Object.keys(agentsMap).length;
    const coveragePercent = totalAgents > 0 ? (agentsWithSOPs / totalAgents) * 100 : 0;

    return {
      totalAgents,
      agentsWithSOPs,
      agentsWithoutSOPs: totalAgents - agentsWithSOPs,
      totalSOPs,
      sopsByFunction,
      coveragePercent: Math.round(coveragePercent * 100) / 100,
      gaps,
    };
  }

  /**
   * Run all knowledge analysis and return combined gaps
   */
  async analyzeAll(organizationId: string): Promise<KnowledgeGap[]> {
    const [missingSOPs, outdatedDocs, brokenLinks, coverage] = await Promise.all([
      this.findMissingSOPs(organizationId),
      this.findOutdatedDocs(organizationId),
      this.findBrokenLinks(organizationId),
      this.analyzeCoverage(organizationId),
    ]);

    const allGaps = [
      ...missingSOPs,
      ...outdatedDocs,
      ...brokenLinks,
      ...coverage.gaps,
    ];

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allGaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return allGaps;
  }

  /**
   * Save detected knowledge gaps to database
   */
  async saveKnowledgeGaps(organizationId: string, gaps: KnowledgeGap[]): Promise<void> {
    try {
      // Get existing open gaps to avoid duplicates
      const existingGaps = await (prisma as any).knowledgeGap?.findMany({
        where: {
          organizationId,
          status: { in: ["open", "acknowledged"] },
        },
        select: { title: true, type: true },
      }) || [];

      const existingKeys = new Set(existingGaps.map((g: { type: string; title: string }) => `${g.type}:${g.title}`));

      const newGaps = gaps.filter(g => !existingKeys.has(`${g.type}:${g.title}`));

      if (newGaps.length > 0) {
        await (prisma as any).knowledgeGap?.createMany({
          data: newGaps.map(gap => ({
            organizationId,
            type: gap.type,
            title: gap.title,
            description: gap.description,
            severity: gap.severity,
            suggestedAction: gap.suggestedAction,
            relatedEntities: gap.relatedEntities,
            detectedBy: "meta_agent",
            metadata: gap.metadata as object || {},
          })),
        });

        logger.info("Knowledge gaps saved", {
          organizationId,
          newGapsCount: newGaps.length,
          totalGapsCount: gaps.length,
        });
      }
    } catch (error) {
      // KnowledgeGap table may not exist yet
      logger.warn("Could not save knowledge gaps", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
    }
  }
}

// Export singleton instance
export const knowledgeAnalyzer = new KnowledgeAnalyzer();
