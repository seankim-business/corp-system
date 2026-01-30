/**
 * Feature Request Analyzer Agent
 *
 * AI-powered agent that:
 * 1. Extracts intent from raw feature requests
 * 2. Maps requests to relevant MegaApp modules
 * 3. Detects duplicates and related requests
 * 4. Assesses priority based on business impact
 */

import { db } from '../../../db/client';
import { logger } from '../../../utils/logger';
import { executeWithAI } from '../../../orchestrator/ai-executor';
import type {
  ModuleMapping,
  PriorityCalculation,
  BusinessImpact,
  FeatureRequestPriority,
  RequesterMetadata,
} from './types';

export interface FeatureAnalysisInput {
  rawContent: string;
  source: string;
  requesterId?: string;
  organizationId: string;
  moduleContext?: string; // Current module user was using
  sourceMetadata?: Record<string, unknown>; // Additional context (Slack thread, etc.)
}

export interface FeatureAnalysisOutput {
  coreIntent: string;
  specificFeature: string;
  problemStatement: string;
  successCriteria: string[];
  affectedWorkflows: string[];
  relatedModules: string[];
  suggestedPriority: FeatureRequestPriority; // 0=Critical, 1=High, 2=Medium, 3=Low
  confidence: number; // 0-100
  clarificationNeeded: boolean;
  clarificationQuestions?: string[];
  suggestedTitle?: string;
  suggestedTags?: string[];
}

export class FeatureAnalyzerAgent {
  constructor(private organizationId: string) {}

  /**
   * Analyze a feature request and extract structured information
   */
  async analyze(input: FeatureAnalysisInput): Promise<FeatureAnalysisOutput> {
    const startTime = Date.now();

    try {
      logger.info('Starting feature request analysis', {
        organizationId: this.organizationId,
        source: input.source,
        hasRequester: !!input.requesterId,
        contentLength: input.rawContent.length,
      });

      // Load organization's modules for context
      const modules = await db.megaAppModule.findMany({
        where: { organizationId: this.organizationId },
        select: {
          id: true,
          name: true,
          description: true,
        },
      });

      // Load requester context if available
      let requesterContext: RequesterMetadata | undefined;
      if (input.requesterId) {
        requesterContext = await this.getRequesterMetadata(input.requesterId);
      }

      // Build AI prompt with context
      const prompt = this.buildAnalysisPrompt(input, modules, requesterContext);

      // Execute AI analysis
      const result = await executeWithAI({
        category: 'ultrabrain', // Complex reasoning task
        skills: ['feature-analysis'],
        prompt,
        sessionId: `feature-analysis-${Date.now()}`,
        organizationId: this.organizationId,
        userId: input.requesterId || 'system',
        context: {
          agentType: 'feature-analyzer',
          enablePatternOptimization: true,
        },
      });

      if (result.status !== 'success') {
        throw new Error(`AI analysis failed: ${result.metadata.error}`);
      }

      // Parse structured response
      const analysis = this.parseAnalysisResponse(result.output);

      logger.info('Feature request analysis completed', {
        organizationId: this.organizationId,
        confidence: analysis.confidence,
        relatedModules: analysis.relatedModules,
        suggestedPriority: analysis.suggestedPriority,
        clarificationNeeded: analysis.clarificationNeeded,
        duration: Date.now() - startTime,
      });

      return analysis;
    } catch (error) {
      logger.error('Feature request analysis failed', {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Map analyzed request to MegaApp modules with confidence scores
   */
  async mapToModules(analysis: Partial<FeatureAnalysisOutput>): Promise<ModuleMapping[]> {
    try {
      // Get all modules for this org
      const modules = await db.megaAppModule.findMany({
        where: { organizationId: this.organizationId },
        select: {
          id: true,
          name: true,
          description: true,
        },
      });

      if (modules.length === 0) {
        logger.warn('No modules found for organization', {
          organizationId: this.organizationId,
        });
        return [];
      }

      const mappings: ModuleMapping[] = [];

      for (const module of modules) {
        const confidence = this.calculateModuleRelevance(analysis, module);

        if (confidence > 0.3) {
          // Only include modules with >30% confidence
          mappings.push({
            moduleId: module.id,
            moduleName: module.name,
            confidence,
            matchReasons: this.getMatchReasons(analysis, module, confidence),
          });
        }
      }

      // Sort by confidence descending
      mappings.sort((a, b) => b.confidence - a.confidence);

      logger.info('Module mapping completed', {
        organizationId: this.organizationId,
        totalModules: modules.length,
        matchedModules: mappings.length,
        topModule: mappings[0]?.moduleId,
        topConfidence: mappings[0]?.confidence,
      });

      return mappings;
    } catch (error) {
      logger.error('Module mapping failed', {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Assess priority based on various factors
   */
  async assessPriority(
    analysis: FeatureAnalysisOutput,
    requestCount: number,
    requesterRole?: string,
  ): Promise<PriorityCalculation> {
    try {
      const factors = [];

      // Factor 1: Request frequency (40% weight)
      const frequencyScore = Math.min(requestCount / 10, 1); // Cap at 10 requests
      factors.push({
        name: 'request_frequency',
        weight: 0.4,
        value: frequencyScore,
        contribution: frequencyScore * 0.4,
        reason: `${requestCount} duplicate request(s) received`,
      });

      // Factor 2: Requester role importance (20% weight)
      const roleScore = this.getRoleImportanceScore(requesterRole);
      factors.push({
        name: 'requester_role',
        weight: 0.2,
        value: roleScore,
        contribution: roleScore * 0.2,
        reason: `Requester role: ${requesterRole || 'unknown'}`,
      });

      // Factor 3: Business impact keywords (20% weight)
      const keywordScore = this.analyzeBusinessImpactKeywords(
        analysis.coreIntent,
        analysis.problemStatement,
      );
      factors.push({
        name: 'business_impact_keywords',
        weight: 0.2,
        value: keywordScore,
        contribution: keywordScore * 0.2,
        reason: this.getKeywordReason(keywordScore),
      });

      // Factor 4: Blocking nature (20% weight)
      const blockingScore = this.analyzeBlockingNature(
        analysis.problemStatement,
        analysis.affectedWorkflows,
      );
      factors.push({
        name: 'blocking_impact',
        weight: 0.2,
        value: blockingScore,
        contribution: blockingScore * 0.2,
        reason: this.getBlockingReason(blockingScore),
      });

      // Calculate total weighted score (0-1 range)
      const totalScore = factors.reduce((sum, f) => sum + f.contribution, 0);

      // Map score to priority level (0-3)
      let priority: FeatureRequestPriority;
      let businessImpact: BusinessImpact;

      if (totalScore >= 0.8) {
        priority = 0; // Critical
        businessImpact = 'critical';
      } else if (totalScore >= 0.6) {
        priority = 1; // High
        businessImpact = 'high';
      } else if (totalScore >= 0.4) {
        priority = 2; // Medium
        businessImpact = 'medium';
      } else {
        priority = 3; // Low
        businessImpact = 'low';
      }

      logger.info('Priority assessment completed', {
        organizationId: this.organizationId,
        priority,
        businessImpact,
        totalScore,
        requestCount,
        requesterRole,
      });

      return {
        priority,
        businessImpact,
        score: totalScore,
        factors,
      };
    } catch (error) {
      logger.error('Priority assessment failed', {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate clarification questions for low-confidence analysis
   */
  generateClarificationQuestions(analysis: FeatureAnalysisOutput): string[] {
    const questions: string[] = [];

    // Low confidence overall
    if (analysis.confidence < 50) {
      questions.push('Could you provide more details about what you\'re trying to achieve?');
    }

    // Missing specific feature
    if (!analysis.specificFeature || analysis.specificFeature.length < 10) {
      questions.push('What specific feature or functionality would you like to see?');
    }

    // Unclear problem statement
    if (!analysis.problemStatement || analysis.problemStatement.length < 20) {
      questions.push('What problem are you currently facing that this feature would solve?');
    }

    // No success criteria
    if (!analysis.successCriteria || analysis.successCriteria.length === 0) {
      questions.push('How would you know if this feature is successful?');
    }

    // No related modules
    if (!analysis.relatedModules || analysis.relatedModules.length === 0) {
      questions.push('Which part of the system should this feature be added to?');
    }

    // Unclear workflows
    if (!analysis.affectedWorkflows || analysis.affectedWorkflows.length === 0) {
      questions.push('Which workflows or processes would this feature affect?');
    }

    return questions;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private buildAnalysisPrompt(
    input: FeatureAnalysisInput,
    modules: Array<{ id: string; name: string; description: string | null }>,
    requesterContext?: RequesterMetadata,
  ): string {
    const modulesList = modules
      .map((m) => `- ${m.id}: ${m.name}${m.description ? ' - ' + m.description : ''}`)
      .join('\n');

    return `You are a Feature Request Analyzer for a Fashion Value Stream platform.

Analyze this feature request and extract structured information in JSON format.

**Feature Request:**
Source: ${input.source}
${input.moduleContext ? `Current Module: ${input.moduleContext}\n` : ''}Content:
${input.rawContent}

**Available Modules:**
${modulesList || '(No modules configured yet)'}

${requesterContext ? `**Requester Context:**
Role: ${requesterContext.role || 'unknown'}
Previous Requests: ${requesterContext.previousRequestCount || 0}
Success Rate: ${requesterContext.previousRequestSuccessRate ? (requesterContext.previousRequestSuccessRate * 100).toFixed(0) + '%' : 'N/A'}
` : ''}
**Your Task:**
Extract the following information and respond with ONLY a valid JSON object (no markdown, no additional text):

{
  "coreIntent": "What is the user fundamentally trying to accomplish?",
  "specificFeature": "What specific feature are they requesting?",
  "problemStatement": "What problem does this solve?",
  "successCriteria": ["How would we know this feature is successful?"],
  "affectedWorkflows": ["Which workflows would this impact?"],
  "relatedModules": ["IDs of relevant modules from the list above"],
  "suggestedPriority": 0-3,  // 0=Critical, 1=High, 2=Medium, 3=Low
  "confidence": 0-100,  // How confident are you in this analysis?
  "clarificationNeeded": true/false,
  "clarificationQuestions": ["Questions if clarification needed"],
  "suggestedTitle": "A clear, concise title for this request",
  "suggestedTags": ["relevant", "tags"]
}

**Guidelines:**
- Be precise and concise
- Focus on user intent, not implementation details
- Map to existing modules when possible
- Set clarificationNeeded=true if confidence < 70
- Generate 2-4 clarification questions if needed
- Suggest priority based on business impact and urgency`;
  }

  private parseAnalysisResponse(aiOutput: string): FeatureAnalysisOutput {
    try {
      // Remove markdown code blocks if present
      let jsonStr = aiOutput.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and normalize
      return {
        coreIntent: parsed.coreIntent || '',
        specificFeature: parsed.specificFeature || '',
        problemStatement: parsed.problemStatement || '',
        successCriteria: Array.isArray(parsed.successCriteria) ? parsed.successCriteria : [],
        affectedWorkflows: Array.isArray(parsed.affectedWorkflows) ? parsed.affectedWorkflows : [],
        relatedModules: Array.isArray(parsed.relatedModules) ? parsed.relatedModules : [],
        suggestedPriority: this.normalizePriority(parsed.suggestedPriority),
        confidence: Math.max(0, Math.min(100, parsed.confidence || 0)),
        clarificationNeeded: parsed.clarificationNeeded === true,
        clarificationQuestions: Array.isArray(parsed.clarificationQuestions)
          ? parsed.clarificationQuestions
          : undefined,
        suggestedTitle: parsed.suggestedTitle || undefined,
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : undefined,
      };
    } catch (error) {
      logger.error('Failed to parse AI analysis response', {
        error: error instanceof Error ? error.message : String(error),
        aiOutput: aiOutput.substring(0, 500), // Log first 500 chars for debugging
      });

      // Return low-confidence fallback
      return {
        coreIntent: aiOutput.substring(0, 200), // Use first part as intent
        specificFeature: 'Unable to parse feature details',
        problemStatement: 'Analysis failed - manual review needed',
        successCriteria: [],
        affectedWorkflows: [],
        relatedModules: [],
        suggestedPriority: 3, // Low priority for failed analysis
        confidence: 0,
        clarificationNeeded: true,
        clarificationQuestions: ['Could you rephrase your request with more specific details?'],
      };
    }
  }

  private normalizePriority(value: any): FeatureRequestPriority {
    const num = Number(value);
    if (num >= 0 && num <= 3 && Number.isInteger(num)) {
      return num as FeatureRequestPriority;
    }
    return 3; // Default to Low if invalid
  }

  private calculateModuleRelevance(
    analysis: Partial<FeatureAnalysisOutput>,
    module: { id: string; name: string; description: string | null },
  ): number {
    let score = 0;

    // Check if module is in relatedModules (AI suggested)
    if (analysis.relatedModules?.includes(module.id)) {
      score += 0.5; // 50% base confidence if AI suggested it
    }

    // Keyword matching in module name/description
    const keywords = [
      ...(analysis.coreIntent?.toLowerCase().split(/\s+/) || []),
      ...(analysis.specificFeature?.toLowerCase().split(/\s+/) || []),
    ];

    const moduleText = `${module.name} ${module.description || ''}`.toLowerCase();

    let keywordMatches = 0;
    for (const keyword of keywords) {
      if (keyword.length > 3 && moduleText.includes(keyword)) {
        keywordMatches++;
      }
    }

    // Add up to 0.3 for keyword matches
    score += Math.min(keywordMatches * 0.1, 0.3);

    // Workflow overlap
    if (analysis.affectedWorkflows) {
      const workflowText = analysis.affectedWorkflows.join(' ').toLowerCase();
      if (moduleText.includes(workflowText.substring(0, 20))) {
        score += 0.2;
      }
    }

    return Math.min(score, 1); // Cap at 1.0
  }

  private getMatchReasons(
    analysis: Partial<FeatureAnalysisOutput>,
    module: { id: string; name: string; description: string | null },
    confidence: number,
  ): ModuleMapping['matchReasons'] {
    return {
      keywords: confidence >= 0.3,
      workflows: (analysis.affectedWorkflows?.length || 0) > 0,
      semantic: analysis.relatedModules?.includes(module.id) || false,
    };
  }

  private async getRequesterMetadata(requesterId: string): Promise<RequesterMetadata> {
    try {
      // Count previous requests
      const previousRequests = await db.featureRequest.count({
        where: {
          requesterId,
          organizationId: this.organizationId,
        },
      });

      // Calculate success rate (requests that were released)
      const releasedRequests = await db.featureRequest.count({
        where: {
          requesterId,
          organizationId: this.organizationId,
          status: 'released',
        },
      });

      const successRate = previousRequests > 0 ? releasedRequests / previousRequests : 0;

      return {
        userId: requesterId,
        role: undefined, // Could be enhanced with role lookup from membership
        previousRequestCount: previousRequests,
        previousRequestSuccessRate: successRate,
      };
    } catch (error) {
      logger.warn('Failed to load requester metadata', {
        requesterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        userId: requesterId,
      };
    }
  }

  private getRoleImportanceScore(role?: string): number {
    if (!role) return 0.5; // Neutral score for unknown role

    const roleLower = role.toLowerCase();

    // MD / Founders / CXO
    if (roleLower.includes('md') || roleLower.includes('ceo') || roleLower.includes('founder')) {
      return 1.0;
    }

    // Directors / Heads
    if (roleLower.includes('director') || roleLower.includes('head')) {
      return 0.8;
    }

    // Managers / Leads
    if (roleLower.includes('manager') || roleLower.includes('lead')) {
      return 0.6;
    }

    // Individual contributors
    return 0.4;
  }

  private analyzeBusinessImpactKeywords(coreIntent: string, problemStatement: string): number {
    const text = `${coreIntent} ${problemStatement}`.toLowerCase();

    const criticalKeywords = ['urgent', 'critical', 'blocker', 'emergency', 'asap', 'immediately'];
    const highKeywords = ['important', 'needed', 'required', 'must have', 'essential'];
    const mediumKeywords = ['helpful', 'useful', 'beneficial', 'improve'];

    let score = 0.2; // Base score

    for (const keyword of criticalKeywords) {
      if (text.includes(keyword)) {
        score = Math.max(score, 1.0);
      }
    }

    for (const keyword of highKeywords) {
      if (text.includes(keyword)) {
        score = Math.max(score, 0.7);
      }
    }

    for (const keyword of mediumKeywords) {
      if (text.includes(keyword)) {
        score = Math.max(score, 0.5);
      }
    }

    return score;
  }

  private analyzeBlockingNature(problemStatement: string, affectedWorkflows: string[]): number {
    const text = `${problemStatement} ${affectedWorkflows.join(' ')}`.toLowerCase();

    const blockingKeywords = [
      'blocking',
      'blocked',
      'cannot',
      "can't",
      'unable',
      'broken',
      'failing',
      'not working',
      'stuck',
    ];

    for (const keyword of blockingKeywords) {
      if (text.includes(keyword)) {
        return 1.0; // Blocking issues get max score
      }
    }

    // Check if multiple workflows affected (indicates broader impact)
    if (affectedWorkflows.length >= 3) {
      return 0.8;
    }

    if (affectedWorkflows.length >= 2) {
      return 0.6;
    }

    return 0.3; // Not blocking, single workflow
  }

  private getKeywordReason(score: number): string {
    if (score >= 0.9) return 'Contains critical urgency indicators';
    if (score >= 0.6) return 'Contains high priority keywords';
    if (score >= 0.4) return 'Contains medium priority keywords';
    return 'No strong priority indicators';
  }

  private getBlockingReason(score: number): string {
    if (score >= 0.9) return 'Blocking current workflows';
    if (score >= 0.7) return 'Impacts multiple workflows';
    if (score >= 0.5) return 'Impacts multiple areas';
    return 'Single workflow impact';
  }
}
