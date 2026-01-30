/**
 * Feature Request Analyzer Service
 *
 * AI-powered analysis of feature requests including intent extraction,
 * module mapping, and priority calculation.
 */
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { getModuleRegistry } from "../module-registry";
import {
  FeatureAnalysis,
  ModuleMapping,
  PriorityCalculation,
  PriorityFactor,
  BusinessContext,
  FeatureRequestPriority,
  BusinessImpact,
  FeatureRequestPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from "./types";

/**
 * Prompt template for AI analysis
 */
const ANALYSIS_PROMPT = `Analyze this feature request and extract structured information:

Request: {{rawContent}}
User Role: {{requesterRole}}
Current Module Context: {{moduleContext}}
Available Modules: {{availableModules}}

Extract:
1. Core Intent: What does the user fundamentally want to achieve?
2. Specific Feature: What concrete functionality is being requested?
3. Problem Statement: What problem is the user trying to solve?
4. Success Criteria: How would the user know this feature works?
5. Affected Workflows: Which current workflows would change?
6. Related Modules: Which modules would be affected or enhanced?

Output ONLY valid JSON (no markdown, no explanation):
{
  "coreIntent": "string",
  "specificFeature": "string",
  "problemStatement": "string",
  "successCriteria": ["string"],
  "affectedWorkflows": ["string"],
  "relatedModules": ["module-id"],
  "confidence": 0-100,
  "suggestedTitle": "Concise feature title",
  "suggestedTags": ["string"]
}`;

export interface AnalyzeIntentOptions {
  rawContent: string;
  userRole?: string;
  moduleContext?: string;
  organizationId: string;
}

export interface AnalyzeIntentResult {
  analysis: FeatureAnalysis;
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

export class FeatureRequestAnalyzerService {
  private config: FeatureRequestPipelineConfig;

  constructor(config: Partial<FeatureRequestPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  /**
   * Analyze intent from raw feature request content
   */
  async analyzeIntent(options: AnalyzeIntentOptions): Promise<AnalyzeIntentResult> {
    const { rawContent, userRole, moduleContext, organizationId } = options;

    logger.info("Analyzing feature request intent", {
      organizationId,
      contentLength: rawContent.length,
      userRole,
    });

    try {
      // Get available modules for context
      const moduleRegistry = getModuleRegistry();
      const modules = await moduleRegistry.list(organizationId, { enabled: true });
      const availableModules = modules
        .map((m) => `${m.id}: ${m.name} - ${m.description || ""}`)
        .join("\n");

      // Build the prompt
      const prompt = ANALYSIS_PROMPT
        .replace("{{rawContent}}", rawContent)
        .replace("{{requesterRole}}", userRole || "unknown")
        .replace("{{moduleContext}}", moduleContext || "none")
        .replace("{{availableModules}}", availableModules || "none");

      // Call AI for analysis
      const analysis = await this.callAI(prompt, organizationId);

      // Check if confidence is below threshold
      const needsClarification = analysis.confidence < this.config.analysisConfidenceThreshold;
      let clarificationQuestions: string[] | undefined;

      if (needsClarification) {
        clarificationQuestions = this.generateClarificationQuestions(analysis);
      }

      logger.info("Feature request analysis complete", {
        organizationId,
        confidence: analysis.confidence,
        needsClarification,
        relatedModules: analysis.relatedModules,
      });

      return {
        analysis,
        needsClarification,
        clarificationQuestions,
      };
    } catch (error) {
      logger.error(
        "Failed to analyze feature request intent",
        { organizationId },
        error instanceof Error ? error : new Error(String(error))
      );

      // Return a low-confidence fallback analysis
      return {
        analysis: {
          coreIntent: rawContent.slice(0, 200),
          specificFeature: "Unable to determine",
          problemStatement: "Analysis failed - manual review required",
          successCriteria: [],
          affectedWorkflows: [],
          relatedModules: [],
          confidence: 0,
        },
        needsClarification: true,
        clarificationQuestions: [
          "Could you describe the specific feature you need?",
          "What problem are you trying to solve?",
          "Which part of the system does this relate to?",
        ],
      };
    }
  }

  /**
   * Map analyzed request to related modules
   */
  async mapToModules(
    analysis: FeatureAnalysis,
    organizationId: string
  ): Promise<ModuleMapping[]> {
    logger.info("Mapping feature request to modules", {
      organizationId,
      analysisIntent: analysis.coreIntent.slice(0, 50),
    });

    const moduleRegistry = getModuleRegistry();
    const modules = await moduleRegistry.list(organizationId, { enabled: true });

    if (modules.length === 0) {
      logger.warn("No modules found for mapping", { organizationId });
      return [];
    }

    const mappings: ModuleMapping[] = [];

    for (const module of modules) {
      // Calculate keyword score
      const keywordScore = this.calculateKeywordOverlap(
        `${analysis.specificFeature} ${analysis.problemStatement}`,
        [module.id, module.name, module.description || ""]
      );

      // Check if module is explicitly mentioned in analysis
      const explicitlyMentioned = analysis.relatedModules.includes(module.id);

      // Calculate workflow score
      const workflowScore = analysis.affectedWorkflows.length > 0
        ? this.calculateWorkflowOverlap(analysis.affectedWorkflows, module)
        : 0;

      // Calculate semantic score (simplified - just checking word overlap)
      const semanticScore = this.calculateSemanticScore(
        analysis.coreIntent,
        module.description || module.name
      );

      // Combined score with explicit mention bonus
      const explicitBonus = explicitlyMentioned ? 0.3 : 0;
      const totalScore = Math.min(
        1,
        (keywordScore * 0.25) + (workflowScore * 0.25) + (semanticScore * 0.3) + explicitBonus + 0.2
      );

      if (totalScore > 0.3 || explicitlyMentioned) {
        mappings.push({
          moduleId: module.id,
          moduleName: module.name,
          confidence: totalScore,
          matchReasons: {
            keywords: keywordScore > 0.3,
            workflows: workflowScore > 0.3,
            semantic: semanticScore > 0.3 || explicitlyMentioned,
          },
        });
      }
    }

    // Sort by confidence descending
    const sortedMappings = mappings.sort((a, b) => b.confidence - a.confidence);

    logger.info("Module mapping complete", {
      organizationId,
      mappedModules: sortedMappings.map((m) => m.moduleId),
    });

    return sortedMappings;
  }

  /**
   * Calculate priority based on business context and request analysis
   */
  async calculatePriority(
    requestId: string,
    analysis: FeatureAnalysis,
    context: BusinessContext
  ): Promise<PriorityCalculation> {
    logger.info("Calculating priority for feature request", {
      requestId,
      organizationId: context.organizationId,
    });

    const factors: PriorityFactor[] = [];

    // Factor 1: Request frequency (from existing duplicate count)
    const request = await db.featureRequest.findUnique({
      where: { id: requestId },
    });
    const requestCount = request?.requestCount || 1;
    const frequencyFactor = this.calculateFrequencyFactor(requestCount);
    factors.push(frequencyFactor);

    // Factor 2: Strategic alignment
    const alignmentFactor = this.calculateAlignmentFactor(
      analysis,
      context.currentQuarterPriorities || [],
      context.strategicGoals || []
    );
    factors.push(alignmentFactor);

    // Factor 3: Module coverage (more modules = potentially higher impact)
    const coverageFactor = this.calculateCoverageFactor(
      analysis.relatedModules.length,
      context.activeModules?.length || 1
    );
    factors.push(coverageFactor);

    // Factor 4: User influence (based on requester metadata)
    const influenceFactor = this.calculateInfluenceFactor(context.requesterMetadata);
    factors.push(influenceFactor);

    // Factor 5: Analysis confidence (low confidence = lower priority)
    const confidenceFactor: PriorityFactor = {
      name: "Analysis Confidence",
      weight: 0.1,
      value: analysis.confidence / 100,
      contribution: 0.1 * (analysis.confidence / 100),
      reason: analysis.confidence < 50 ? "Low confidence analysis" : undefined,
    };
    factors.push(confidenceFactor);

    // Calculate total score
    const totalScore = factors.reduce((sum, f) => sum + f.contribution, 0);

    // Map score to priority
    const priority = this.scoreToPriority(totalScore);
    const businessImpact = this.scoreToBusinessImpact(totalScore);

    logger.info("Priority calculation complete", {
      requestId,
      priority,
      businessImpact,
      totalScore,
    });

    return {
      priority,
      businessImpact,
      score: totalScore,
      factors,
    };
  }

  /**
   * Update a feature request with analysis results
   */
  async updateRequestWithAnalysis(
    requestId: string,
    analysis: FeatureAnalysis,
    priority: PriorityCalculation
  ): Promise<void> {
    logger.info("Updating feature request with analysis", { requestId });

    await db.featureRequest.update({
      where: { id: requestId },
      data: {
        analyzedIntent: JSON.stringify({
          coreIntent: analysis.coreIntent,
          specificFeature: analysis.specificFeature,
          problemStatement: analysis.problemStatement,
          successCriteria: analysis.successCriteria,
          affectedWorkflows: analysis.affectedWorkflows,
          confidence: analysis.confidence,
          suggestedTitle: analysis.suggestedTitle,
        }),
        relatedModules: analysis.relatedModules,
        tags: analysis.suggestedTags || [],
        priority: priority.priority,
        businessImpact: priority.businessImpact,
        status: this.config.autoStatusTransitions ? "analyzing" : "new",
      },
    });

    logger.info("Feature request updated with analysis", {
      requestId,
      relatedModules: analysis.relatedModules,
      priority: priority.priority,
    });
  }

  /**
   * Call AI service for analysis (placeholder - implement with actual AI service)
   */
  private async callAI(prompt: string, organizationId: string): Promise<FeatureAnalysis> {
    // TODO: Integrate with actual AI service (Claude, OpenAI, etc.)
    // For now, return a structured analysis based on keyword extraction

    logger.debug("AI analysis requested", {
      organizationId,
      promptLength: prompt.length,
    });

    // Extract the raw content from prompt
    const rawContentMatch = prompt.match(/Request: ([\s\S]*?)User Role:/);
    const rawContent = rawContentMatch ? rawContentMatch[1].trim() : prompt;

    // Simple keyword-based analysis as placeholder
    const words = rawContent.toLowerCase().split(/\s+/);
    const moduleKeywords = ["research", "planning", "design", "production", "sourcing", "cost"];
    const relatedModules = moduleKeywords.filter((keyword) =>
      words.some((w) => w.includes(keyword))
    );

    // Extract potential tags
    const tagPatterns = [
      /feature/i, /bug/i, /improvement/i, /enhancement/i,
      /ux/i, /ui/i, /api/i, /performance/i, /security/i,
    ];
    const suggestedTags = tagPatterns
      .filter((pattern) => pattern.test(rawContent))
      .map((pattern) => pattern.source.replace(/\\/g, "").toLowerCase());

    return {
      coreIntent: rawContent.split("\n")[0].slice(0, 200),
      specificFeature: this.extractSpecificFeature(rawContent),
      problemStatement: this.extractProblemStatement(rawContent),
      successCriteria: this.extractSuccessCriteria(rawContent),
      affectedWorkflows: [],
      relatedModules,
      confidence: relatedModules.length > 0 ? 65 : 40,
      suggestedTitle: this.generateTitle(rawContent),
      suggestedTags,
    };
  }

  private extractSpecificFeature(content: string): string {
    // Simple extraction - first sentence or first 100 chars
    const firstSentence = content.split(/[.!?]/)[0];
    return firstSentence.slice(0, 150);
  }

  private extractProblemStatement(content: string): string {
    // Look for problem indicators
    const problemIndicators = ["problem", "issue", "difficult", "can't", "cannot", "need"];
    const sentences = content.split(/[.!?]/);

    for (const sentence of sentences) {
      if (problemIndicators.some((ind) => sentence.toLowerCase().includes(ind))) {
        return sentence.trim().slice(0, 200);
      }
    }

    return "Unable to extract specific problem statement";
  }

  private extractSuccessCriteria(content: string): string[] {
    // Look for success indicators
    const criteria: string[] = [];
    const successIndicators = ["should", "would be able to", "expect", "want to"];

    const sentences = content.split(/[.!?]/);
    for (const sentence of sentences) {
      if (successIndicators.some((ind) => sentence.toLowerCase().includes(ind))) {
        criteria.push(sentence.trim());
      }
    }

    return criteria.slice(0, 5);
  }

  private generateTitle(content: string): string {
    // Generate concise title from first line or key phrase
    const firstLine = content.split("\n")[0];
    if (firstLine.length <= 60) {
      return firstLine;
    }
    return firstLine.slice(0, 57) + "...";
  }

  private generateClarificationQuestions(
    analysis: FeatureAnalysis
  ): string[] {
    const questions: string[] = [];

    if (!analysis.specificFeature || analysis.specificFeature.includes("Unable")) {
      questions.push("Could you describe the specific feature you need in more detail?");
    }

    if (analysis.relatedModules.length === 0) {
      questions.push("Which part of the system does this feature relate to?");
    }

    if (analysis.successCriteria.length === 0) {
      questions.push("How would you know this feature is working correctly?");
    }

    if (analysis.problemStatement.includes("Unable")) {
      questions.push("What problem are you currently facing that this would solve?");
    }

    return questions;
  }

  private calculateKeywordOverlap(text: string, keywords: string[]): number {
    const textWords = new Set(text.toLowerCase().split(/\s+/));
    let matches = 0;
    let total = 0;

    for (const keyword of keywords) {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      for (const word of keywordWords) {
        if (word.length > 2) {
          total++;
          if (textWords.has(word) || [...textWords].some((t) => t.includes(word))) {
            matches++;
          }
        }
      }
    }

    return total > 0 ? matches / total : 0;
  }

  private calculateWorkflowOverlap(
    workflows: string[],
    _module: { id: string; name: string }
  ): number {
    // Simplified workflow matching
    // In production, this would match against module's defined workflows
    return workflows.length > 0 ? 0.5 : 0;
  }

  private calculateSemanticScore(intent: string, description: string): number {
    // Simplified semantic similarity using word overlap
    const intentWords = new Set(intent.toLowerCase().split(/\s+/));
    const descWords = description.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of descWords) {
      if (word.length > 3 && intentWords.has(word)) {
        matches++;
      }
    }

    return Math.min(1, matches / 5);
  }

  private calculateFrequencyFactor(requestCount: number): PriorityFactor {
    // More requests = higher priority
    let value: number;
    let reason: string | undefined;

    if (requestCount >= 10) {
      value = 1.0;
      reason = "Very high demand (10+ requests)";
    } else if (requestCount >= 5) {
      value = 0.8;
      reason = "High demand (5-9 requests)";
    } else if (requestCount >= 3) {
      value = 0.6;
    } else if (requestCount >= 2) {
      value = 0.4;
    } else {
      value = 0.2;
    }

    return {
      name: "Request Frequency",
      weight: 0.3,
      value,
      contribution: 0.3 * value,
      reason,
    };
  }

  private calculateAlignmentFactor(
    analysis: FeatureAnalysis,
    quarterPriorities: string[],
    strategicGoals: string[]
  ): PriorityFactor {
    const allPriorities = [...quarterPriorities, ...strategicGoals];
    if (allPriorities.length === 0) {
      return {
        name: "Strategic Alignment",
        weight: 0.25,
        value: 0.5, // Neutral if no priorities defined
        contribution: 0.125,
      };
    }

    const analysisText = `${analysis.coreIntent} ${analysis.specificFeature}`.toLowerCase();
    const matches = allPriorities.filter((p) =>
      analysisText.includes(p.toLowerCase())
    ).length;

    const value = Math.min(1, matches / Math.max(allPriorities.length, 3));

    return {
      name: "Strategic Alignment",
      weight: 0.25,
      value,
      contribution: 0.25 * value,
      reason: matches > 0 ? `Aligns with ${matches} strategic priorities` : undefined,
    };
  }

  private calculateCoverageFactor(
    affectedModules: number,
    totalModules: number
  ): PriorityFactor {
    // Balance: affecting more modules could mean more impact but also more complexity
    const ratio = affectedModules / Math.max(totalModules, 1);

    let value: number;
    let reason: string | undefined;

    if (ratio > 0.5) {
      value = 0.7; // High coverage - impactful but complex
      reason = "Affects many modules - high impact but complex";
    } else if (ratio > 0.2) {
      value = 0.9; // Moderate coverage - good balance
    } else if (affectedModules >= 1) {
      value = 0.8; // Single module - focused
    } else {
      value = 0.4; // No clear module - unclear scope
      reason = "No clear module mapping";
    }

    return {
      name: "Module Coverage",
      weight: 0.2,
      value,
      contribution: 0.2 * value,
      reason,
    };
  }

  private calculateInfluenceFactor(
    metadata?: { role?: string; previousRequestCount?: number; previousRequestSuccessRate?: number }
  ): PriorityFactor {
    if (!metadata) {
      return {
        name: "User Influence",
        weight: 0.15,
        value: 0.5,
        contribution: 0.075,
      };
    }

    let value = 0.5;
    let reason: string | undefined;

    // Role-based influence
    const highInfluenceRoles = ["director", "manager", "lead", "head"];
    if (metadata.role && highInfluenceRoles.some((r) => metadata.role!.toLowerCase().includes(r))) {
      value += 0.3;
      reason = `Request from ${metadata.role}`;
    }

    // Track record
    if (metadata.previousRequestSuccessRate && metadata.previousRequestSuccessRate > 0.8) {
      value += 0.2;
    }

    value = Math.min(1, value);

    return {
      name: "User Influence",
      weight: 0.15,
      value,
      contribution: 0.15 * value,
      reason,
    };
  }

  private scoreToPriority(score: number): FeatureRequestPriority {
    if (score >= 0.8) return 0; // Critical
    if (score >= 0.6) return 1; // High
    if (score >= 0.4) return 2; // Medium
    return 3; // Low
  }

  private scoreToBusinessImpact(score: number): BusinessImpact {
    if (score >= 0.8) return "critical";
    if (score >= 0.6) return "high";
    if (score >= 0.4) return "medium";
    if (score >= 0.2) return "low";
    return "unknown";
  }
}

// Singleton instance
let analyzerServiceInstance: FeatureRequestAnalyzerService | null = null;

export function getAnalyzerService(
  config?: Partial<FeatureRequestPipelineConfig>
): FeatureRequestAnalyzerService {
  if (!analyzerServiceInstance) {
    analyzerServiceInstance = new FeatureRequestAnalyzerService(config);
  }
  return analyzerServiceInstance;
}
