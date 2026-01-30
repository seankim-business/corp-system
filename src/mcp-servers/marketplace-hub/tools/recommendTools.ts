/**
 * Recommend Tools Tool
 *
 * AI-powered tool recommendations based on natural language request
 */

import { RecommendToolsInput, ToolRecommendationOutput } from "../types";
import { ToolRecommender } from "../../../marketplace/services/tool-recommender";
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";

export async function recommendToolsTool(
  input: RecommendToolsInput,
  organizationId: string,
): Promise<ToolRecommendationOutput> {
  const { request, context } = input;

  if (!request) {
    throw new Error("request is required");
  }

  try {
    // Get installed extensions for context
    const installations = await db.extensionInstallation.findMany({
      where: { organizationId },
      include: { extension: { select: { id: true } } },
    });

    const installedTools = installations.map((inst) => inst.extension.id);

    // Create recommender with API keys
    const recommender = new ToolRecommender(
      {
        smitheryApiKey: process.env.SMITHERY_API_KEY,
        civitaiApiKey: process.env.CIVITAI_API_KEY,
        langchainApiKey: process.env.LANGCHAIN_API_KEY,
      },
      process.env.ANTHROPIC_API_KEY,
    );

    // Get recommendations
    const recommendations = await recommender.recommendTools(request, {
      orgId: organizationId,
      installedTools,
      userPreferences: context,
    });

    logger.info("Tool recommendations generated via MCP tool", {
      organizationId,
      request,
      recommendationCount: recommendations.length,
    });

    return {
      recommendations,
    };
  } catch (error) {
    logger.error("Tool recommendation failed", { request }, error as Error);
    return {
      recommendations: [],
    };
  }
}
