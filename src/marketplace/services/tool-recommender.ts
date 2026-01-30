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
   * Analyze a user request and recommend relevant tools
   *
   * @param request Natural language description of what the user needs
   * @param context Additional context for filtering and personalization
   * @returns Array of tool recommendations sorted by relevance
   */
  async recommendTools(
    request: string,
    context: RecommendationContext,
  ): Promise<ToolRecommendation[]> {
    logger.info("Starting tool recommendation", { request, orgId: context.orgId });

    // Step 1: Analyze request with AI to extract structured information
    const analysis = await this.analyzeRequest(request);
    logger.debug("Request analysis complete", analysis);

    // Step 2: Search across all sources in parallel
    const allItems = await this.searchAllSources(analysis);
    logger.debug(`Found ${allItems.length} items across all sources`);

    // Step 3: Filter out already installed tools
    const filteredItems = this.filterInstalledTools(allItems, context.installedTools);
    logger.debug(`${filteredItems.length} items after filtering installed tools`);

    // Step 4: Rank and score items based on relevance
    const scoredItems = this.rankItems(filteredItems, analysis);

    // Step 5: Convert top scored items to recommendations
    const recommendations = this.createRecommendations(scoredItems, analysis);

    logger.info(`Generated ${recommendations.length} recommendations`);
    return recommendations;
  }

  /**
   * Analyze user request using AI to extract structured information
   *
   * Uses Claude to understand what the user is asking for and extract:
   * - Search terms to use
   * - Preferred tool type
   * - Specific capabilities needed
   * - Urgency level
   *
   * @private
   */
  private async analyzeRequest(request: string): Promise<RequestAnalysis> {
    const systemPrompt = `You are an AI assistant that analyzes user requests for developer tools.
Extract the following information from the user's request:

1. searchQuery: Key search terms (2-5 words) to find relevant tools
2. preferredType: The type of tool they need (mcp_server, skill, extension, or null if unclear)
3. capabilities: List of specific capabilities they're looking for
4. urgency: How urgent this need is (high/medium/low)

Respond ONLY with valid JSON matching this schema:
{
  "searchQuery": "string",
  "preferredType": "mcp_server" | "skill" | "extension" | null,
  "capabilities": ["string"],
  "urgency": "high" | "medium" | "low"
}

Example:
Request: "I need a tool to integrate with Slack for our team"
Response: {"searchQuery":"slack integration","preferredType":"mcp_server","capabilities":["slack api","team communication","message sending"],"urgency":"medium"}`;

    const messages: Message[] = [
      {
        role: "user",
        content: request,
      },
    ];

    try {
      const response = await this.aiProvider.chat(messages, {
        systemPrompt,
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.3,
        maxTokens: 500,
      });

      // Parse JSON response
      const analysisText = response.content.trim();
      // Remove markdown code blocks if present
      const jsonText = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      const analysis = JSON.parse(jsonText) as RequestAnalysis;

      return analysis;
    } catch (error) {
      logger.error("Failed to analyze request with AI", { error, request });

      // Fallback: Simple keyword extraction
      return {
        searchQuery: request.slice(0, 100), // Use first 100 chars as search query
        preferredType: undefined,
        capabilities: [],
        urgency: "medium",
      };
    }
  }

  /**
   * Search across all external sources in parallel
   *
   * @private
   */
  private async searchAllSources(analysis: RequestAnalysis): Promise<ExternalSourceItem[]> {
    const searchPromises = this.sources.map(async (source) => {
      try {
        const result = await source.search({
          query: analysis.searchQuery,
          type: analysis.preferredType,
          limit: 20, // Get top 20 from each source
        });
        return result.items;
      } catch (error) {
        logger.warn(`Search failed for source ${source.sourceId}`, { error });
        return [];
      }
    });

    const resultsArrays = await Promise.all(searchPromises);
    // Flatten array of arrays into single array
    return resultsArrays.flat();
  }

  /**
   * Filter out tools that are already installed
   *
   * @private
   */
  private filterInstalledTools(
    items: ExternalSourceItem[],
    installedTools?: string[],
  ): ExternalSourceItem[] {
    if (!installedTools || installedTools.length === 0) {
      return items;
    }

    const installedSet = new Set(installedTools);
    return items.filter((item) => !installedSet.has(item.id));
  }

  /**
   * Rank and score items based on relevance to the analyzed request
   *
   * Scoring factors:
   * - Name/description match to query (0-40 points)
   * - Type match to preferred type (0-20 points)
   * - Popularity metrics (downloads/stars) (0-20 points)
   * - Capability match (0-20 points)
   *
   * @private
   */
  private rankItems(items: ExternalSourceItem[], analysis: RequestAnalysis): ScoredItem[] {
    const queryTerms = analysis.searchQuery.toLowerCase().split(/\s+/);

    const scoredItems: ScoredItem[] = items.map((item) => {
      let score = 0;
      const matchReasons: string[] = [];

      // 1. Name/description match (0-40 points)
      const nameMatch = this.calculateTextMatch(item.name.toLowerCase(), queryTerms);
      const descMatch = this.calculateTextMatch(item.description.toLowerCase(), queryTerms);
      const textScore = Math.max(nameMatch, descMatch) * 40;
      score += textScore;
      if (textScore > 20) {
        matchReasons.push("Strong text match");
      }

      // 2. Type match (0-20 points)
      if (analysis.preferredType && item.type === analysis.preferredType) {
        score += 20;
        matchReasons.push(`Matches preferred type: ${analysis.preferredType}`);
      }

      // 3. Popularity metrics (0-20 points)
      const popularityScore = this.calculatePopularityScore(item);
      score += popularityScore * 20;
      if (popularityScore > 0.7) {
        matchReasons.push("Highly popular");
      }

      // 4. Capability match (0-20 points)
      if (analysis.capabilities.length > 0) {
        const capabilityScore = this.calculateCapabilityMatch(item, analysis.capabilities);
        score += capabilityScore * 20;
        if (capabilityScore > 0.5) {
          matchReasons.push("Matches required capabilities");
        }
      }

      return { item, score, matchReasons };
    });

    // Sort by score descending
    return scoredItems.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate how well text matches query terms
   * Returns a score between 0 and 1
   *
   * @private
   */
  private calculateTextMatch(text: string, queryTerms: string[]): number {
    if (queryTerms.length === 0) return 0;

    let matchCount = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) {
        matchCount++;
      }
    }

    return matchCount / queryTerms.length;
  }

  /**
   * Calculate popularity score based on downloads and stars
   * Returns a normalized score between 0 and 1
   *
   * @private
   */
  private calculatePopularityScore(item: ExternalSourceItem): number {
    let score = 0;

    // Downloads score (0-0.5)
    if (item.downloads) {
      // Logarithmic scale: 1000 downloads = 0.25, 10000 = 0.4, 100000 = 0.5
      const downloadScore = Math.min(Math.log10(item.downloads + 1) / 5, 0.5);
      score += downloadScore;
    }

    // Stars score (0-0.5)
    if (item.stars) {
      // Linear scale: 100 stars = 0.25, 500+ = 0.5
      const starScore = Math.min(item.stars / 1000, 0.5);
      score += starScore;
    }

    // Rating boost (multiply by rating if available)
    if (item.rating) {
      score *= item.rating / 5;
    }

    return score;
  }

  /**
   * Calculate how well item matches required capabilities
   * Returns a score between 0 and 1
   *
   * @private
   */
  private calculateCapabilityMatch(
    item: ExternalSourceItem,
    capabilities: string[],
  ): number {
    if (capabilities.length === 0) return 0;

    const itemText = `${item.name} ${item.description} ${item.tags?.join(" ") || ""}`.toLowerCase();
    let matchCount = 0;

    for (const capability of capabilities) {
      const capabilityTerms = capability.toLowerCase().split(/\s+/);
      const matchesAll = capabilityTerms.every((term) => itemText.includes(term));
      if (matchesAll) {
        matchCount++;
      }
    }

    return matchCount / capabilities.length;
  }

  /**
   * Convert scored items to final recommendations with explanations
   *
   * @private
   */
  private createRecommendations(
    scoredItems: ScoredItem[],
    _analysis: RequestAnalysis,
  ): ToolRecommendation[] {
    // Take top 10 items
    const topItems = scoredItems.slice(0, 10);

    return topItems.map((scored) => {
      // Normalize score to 0-1 confidence
      const maxPossibleScore = 100;
      const confidence = Math.min(scored.score / maxPossibleScore, 1);

      // Build reason string
      let reason = scored.matchReasons.join("; ");
      if (!reason) {
        reason = "Matches your search query";
      }

      // Add source context
      reason += ` (from ${scored.item.source})`;

      return {
        item: scored.item,
        reason,
        confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
      };
    });
  }

  /**
   * Get a specific item by ID from any source
   *
   * @param itemId Full item ID (e.g., "smithery:@anthropic/slack-mcp")
   * @returns The item or null if not found
   */
  async getItemById(itemId: string): Promise<ExternalSourceItem | null> {
    // Extract source from ID (format: "source:id")
    const [sourceId, ...idParts] = itemId.split(":");
    const id = idParts.join(":"); // Re-join in case ID contains colons

    const source = this.sources.find((s) => s.sourceId === sourceId);
    if (!source) {
      logger.warn(`Unknown source in item ID: ${itemId}`);
      return null;
    }

    try {
      return await source.getById(id);
    } catch (error) {
      logger.error(`Failed to get item ${itemId}`, { error });
      return null;
    }
  }

  /**
   * Get list of all available sources
   */
  getAvailableSources(): Array<{
    id: string;
    name: string;
    supportedTypes: ExtensionType[];
  }> {
    return this.sources.map((source) => ({
      id: source.sourceId,
      name: source.displayName,
      supportedTypes: source.supportedTypes,
    }));
  }
}
