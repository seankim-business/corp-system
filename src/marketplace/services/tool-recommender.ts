/**
 * Tool Recommender Service
 *
 * Uses AI to analyze user requests and recommend relevant tools from external sources.
 * Searches across multiple marketplaces (Smithery, MCP Registry, Glama, etc.) and
 * ranks results based on relevance, popularity, and type matching.
 *
 * @module marketplace/services/tool-recommender
 */

import { ExtensionType } from "@prisma/client";
import { logger } from "../../utils/logger";
import {
  BaseExternalSource,
  ExternalSourceItem,
  createAllSources,
  SourceConfig,
} from "./sources/external";
import { AnthropicProvider } from "../../providers/anthropic-provider";
import { Message } from "../../providers/ai-provider";

/**
 * Context information for generating tool recommendations
 */
export interface RecommendationContext {
  /** Organization ID requesting recommendations */
  orgId: string;
  /** List of already installed tool IDs (to avoid duplicates) */
  installedTools?: string[];
  /** User preferences for filtering or weighting results */
  userPreferences?: Record<string, unknown>;
}

/**
 * A recommended tool with explanation and confidence score
 */
export interface ToolRecommendation {
  /** The external source item being recommended */
  item: ExternalSourceItem;
  /** Human-readable explanation of why this tool was recommended */
  reason: string;
  /** Confidence score (0-1) indicating how well this matches the request */
  confidence: number;
}

/**
 * Analysis result from AI processing of user request
 */
interface RequestAnalysis {
  /** Search query terms to use across sources */
  searchQuery: string;
  /** Preferred type of tool to prioritize */
  preferredType?: ExtensionType;
  /** List of capabilities the user is looking for */
  capabilities: string[];
  /** How urgent/important is this request */
  urgency: "high" | "medium" | "low";
}

/**
 * Scored item during ranking process
 */
interface ScoredItem {
  item: ExternalSourceItem;
  score: number;
  matchReasons: string[];
}

/**
 * Tool Recommender Service
 *
 * Main service for analyzing user requests and recommending tools from external marketplaces.
 */
export class ToolRecommender {
  private sources: BaseExternalSource[];
  private aiProvider: AnthropicProvider;

  /**
   * Create a new ToolRecommender instance
   * @param sourceConfig Optional API keys for external sources
   * @param anthropicApiKey Anthropic API key for AI analysis (defaults to env var)
   */
  constructor(sourceConfig?: SourceConfig, anthropicApiKey?: string) {
    // Initialize all external sources
    this.sources = createAllSources(sourceConfig);

    // Initialize Anthropic provider for AI analysis
    const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for ToolRecommender");
    }
    this.aiProvider = new AnthropicProvider({ apiKey });

    logger.info("ToolRecommender initialized", {
      sources: this.sources.map((s) => s.sourceId),
    });
  }

  /**
   * Recommend tools based on user request
   *
   * Flow:
   * 1. Analyze request with AI to extract search terms and preferred types
   * 2. Search across all sources in parallel
   * 3. Filter out already installed tools
   * 4. Rank results by relevance
   * 5. Return top 5 recommendations with reasons
   *
   * @param {string} request - User's natural language request
   * @param {RecommendationContext} context - Context for filtering and personalization
   * @returns {Promise<ToolRecommendation[]>} Top 5 recommendations
   *
   * @example
   * const recommendations = await recommender.recommendTools(
   *   "I need to integrate with Slack and send messages",
   *   { orgId: "org-123", installedTools: [] }
   * );
   */
  async recommendTools(
    request: string,
    context: RecommendationContext,
  ): Promise<ToolRecommendation[]> {
    logger.info("Starting tool recommendation", {
      request,
      orgId: context.orgId,
      installedCount: context.installedTools?.length || 0,
    });

    try {
      const analysis = await this.analyzeRequest(request);
      logger.debug("Request analysis completed", analysis);
      const searchPromises = this.sources.map(async (source) => {
        try {
          const result = await source.search({
            query: analysis.searchQuery,
            limit: 20,
          });
          logger.debug("Source search completed", {
            source: source.sourceId,
            found: result.items.length,
          });
          return result.items;
        } catch (error) {
          logger.error("Source search failed", {
            source: source.sourceId,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      });

      const searchResults = await Promise.all(searchPromises);
      const allItems = searchResults.flat();

      logger.info("All sources searched", {
        totalItems: allItems.length,
        sourceResults: searchResults.map((items, i) => ({
          source: this.sources[i].sourceId,
          count: items.length,
        })),
      });

      const installedSet = new Set(context.installedTools || []);
      const uninstalledItems = allItems.filter((item) => !installedSet.has(item.id));

      logger.debug("Filtered installed tools", {
        before: allItems.length,
        after: uninstalledItems.length,
        filtered: allItems.length - uninstalledItems.length,
      });

      const rankedItems = this.rankItems(uninstalledItems, analysis, request);
      const topRecommendations = rankedItems.slice(0, 5).map((item, index) => ({
        item,
        reason: this.generateReason(item, analysis, request),
        confidence: this.calculateConfidence(item, analysis, request),
        priority: index + 1,
      }));

      logger.info("Recommendations generated", {
        total: topRecommendations.length,
        topItem: topRecommendations[0]?.item.name,
      });

      return topRecommendations;
    } catch (error) {
      logger.error("Tool recommendation failed", {
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyze user request to extract search parameters
   *
   * Uses AI if available, otherwise falls back to simple keyword extraction.
   *
   * @param {string} request - User's natural language request
   * @returns {Promise<RequestAnalysis>} Analysis results
   *
   * @example
   * const analysis = await recommender.analyzeRequest("I need to integrate with Slack");
   * // Returns: { searchQuery: "slack integration", preferredType: "mcp_server", ... }
   */
  async analyzeRequest(request: string): Promise<RequestAnalysis> {
    if (this.aiProvider) {
      return this.analyzeWithAI(request);
    } else {
      return this.analyzeWithKeywords(request);
    }
  }

  /**
   * Analyze request using AI
   *
   * @private
   * @param {string} request - User's request
   * @returns {Promise<RequestAnalysis>} Analysis results
   */
  private async analyzeWithAI(request: string): Promise<RequestAnalysis> {
    const systemPrompt = `You are a tool recommendation assistant. Analyze user requests and extract:
1. Search query: Optimized keywords for finding relevant tools
2. Preferred type: What kind of tool they need (mcp_server, skill, extension, workflow)
3. Capabilities: List of required features/capabilities
4. Urgency: How urgent is this need (low, medium, high)

Respond in JSON format:
{
  "searchQuery": "optimized search terms",
  "preferredType": "mcp_server|skill|extension|workflow",
  "capabilities": ["capability1", "capability2"],
  "urgency": "low|medium|high"
}`;

    const messages: Message[] = [
      {
        role: "user",
        content: `Analyze this request: "${request}"`,
      },
    ];

    try {
      const response = await this.aiProvider!.chat(messages, {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 500,
      });

      logger.debug("AI analysis completed", {
        usage: response.usage,
        model: response.model,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI response did not contain valid JSON");
      }

      const analysis = JSON.parse(jsonMatch[0]) as RequestAnalysis;
      return analysis;
    } catch (error) {
      logger.warn("AI analysis failed, falling back to keyword extraction", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.analyzeWithKeywords(request);
    }
  }

  /**
   * Analyze request using simple keyword matching (fallback)
   *
   * @private
   * @param {string} request - User's request
   * @returns {RequestAnalysis} Analysis results
   */
  private analyzeWithKeywords(request: string): RequestAnalysis {
    const lowerRequest = request.toLowerCase();

    const stopWords = new Set([
      "i",
      "need",
      "to",
      "want",
      "a",
      "an",
      "the",
      "for",
      "with",
      "how",
      "can",
    ]);
    const searchQuery = request
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => !stopWords.has(word))
      .join(" ");

    let preferredType = "mcp_server";
    if (lowerRequest.includes("workflow") || lowerRequest.includes("automation")) {
      preferredType = "workflow";
    } else if (lowerRequest.includes("skill") || lowerRequest.includes("capability")) {
      preferredType = "skill";
    } else if (lowerRequest.includes("extension") || lowerRequest.includes("plugin")) {
      preferredType = "extension";
    }

    const capabilities: string[] = [];
    const capabilityKeywords = [
      "integration",
      "communication",
      "data",
      "analytics",
      "automation",
      "ai",
      "search",
      "storage",
    ];
    for (const keyword of capabilityKeywords) {
      if (lowerRequest.includes(keyword)) {
        capabilities.push(keyword);
      }
    }

    let urgency = "medium";
    if (
      lowerRequest.includes("urgent") ||
      lowerRequest.includes("asap") ||
      lowerRequest.includes("immediately")
    ) {
      urgency = "high";
    } else if (lowerRequest.includes("eventually") || lowerRequest.includes("someday")) {
      urgency = "low";
    }

    return {
      searchQuery,
      preferredType,
      capabilities,
      urgency,
    };
  }

  /**
   * Rank items by relevance to the request
   *
   * Ranking factors:
   * - Match with request keywords
   * - Popularity (downloads, stars)
   * - Verified sources
   * - Type match
   *
   * @private
   * @param {ExternalSourceItem[]} items - Items to rank
   * @param {RequestAnalysis} analysis - Request analysis
   * @param {string} request - Original request
   * @returns {ExternalSourceItem[]} Ranked items
   */
  private rankItems(
    items: ExternalSourceItem[],
    analysis: RequestAnalysis,
    request: string,
  ): ExternalSourceItem[] {
    const requestKeywords = new Set(
      request
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    return items
      .map((item) => {
        let score = 0;

        const itemText = `${item.name} ${item.description} ${item.tags?.join(" ")}`.toLowerCase();
        const matchedKeywords = Array.from(requestKeywords).filter((keyword) =>
          itemText.includes(keyword),
        );
        score += (matchedKeywords.length / requestKeywords.size) * 100;

        if (item.type === analysis.preferredType) {
          score += 50;
        }

        const downloads = item.downloads || 0;
        const stars = item.stars || 0;
        const popularityScore = Math.min(50, Math.log10(downloads + stars + 1) * 10);
        score += popularityScore;

        const verifiedSources = new Set(["smithery", "mcp-registry"]);
        if (verifiedSources.has(item.source)) {
          score += 20;
        }

        if (item.rating) {
          score += (item.rating / 5) * 25;
        }

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  /**
   * Generate human-readable reason for recommendation
   *
   * @private
   * @param {ExternalSourceItem} item - Recommended item
   * @param {RequestAnalysis} analysis - Request analysis
   * @param {string} request - Original request
   * @returns {string} Reason text
   */
  private generateReason(
    item: ExternalSourceItem,
    analysis: RequestAnalysis,
    _request: string,
  ): string {
    const reasons: string[] = [];

    if (item.type === analysis.preferredType) {
      reasons.push(`Matches your need for a ${analysis.preferredType}`);
    }

    if (item.downloads && item.downloads > 1000) {
      reasons.push(`Popular tool with ${item.downloads.toLocaleString()} downloads`);
    }

    if (item.rating && item.rating >= 4.0) {
      reasons.push(`Highly rated (${item.rating.toFixed(1)}/5.0)`);
    }

    const matchedCapabilities = analysis.capabilities.filter((cap) =>
      item.description.toLowerCase().includes(cap),
    );
    if (matchedCapabilities.length > 0) {
      reasons.push(`Provides ${matchedCapabilities.join(", ")} capabilities`);
    }

    if (reasons.length === 0) {
      reasons.push("Relevant to your request");
    }

    return reasons.join(". ");
  }

  /**
   * Calculate confidence score for recommendation
   *
   * @private
   * @param {ExternalSourceItem} item - Recommended item
   * @param {RequestAnalysis} analysis - Request analysis
   * @param {string} request - Original request
   * @returns {number} Confidence score (0-1)
   */
  private calculateConfidence(
    item: ExternalSourceItem,
    analysis: RequestAnalysis,
    request: string,
  ): number {
    let confidence = 0.5;

    if (item.type === analysis.preferredType) {
      confidence += 0.2;
    }

    if (item.rating && item.rating >= 4.5) {
      confidence += 0.15;
    }

    if (item.downloads && item.downloads > 5000) {
      confidence += 0.1;
    }

    const requestKeywords = new Set(
      request
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const itemText = `${item.name} ${item.description}`.toLowerCase();
    const matchedKeywords = Array.from(requestKeywords).filter((keyword) =>
      itemText.includes(keyword),
    );
    confidence += (matchedKeywords.length / requestKeywords.size) * 0.15;

    return Math.min(1.0, confidence);
  }
}
