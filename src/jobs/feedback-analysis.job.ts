/**
 * Feedback Analysis Job
 *
 * Weekly job that analyzes user corrections from FeedbackCapture
 * to detect patterns and generate prompt improvement suggestions.
 */

import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import {
  analyzeCorrections,
  generatePromptSuggestion,
  storePromptSuggestion,
} from "../services/prompt-improvement.service";

// Job configuration
const LOOKBACK_DAYS = 7; // Analyze past week
const MIN_CORRECTIONS_FOR_PATTERN = 2;
const MIN_CONFIDENCE_FOR_SUGGESTION = 0.7;

/**
 * Run feedback analysis for all organizations
 */
export async function runFeedbackAnalysis(): Promise<{
  organizationsProcessed: number;
  totalFeedbacks: number;
  patternsDetected: number;
  suggestionsGenerated: number;
  duration: number;
}> {
  const startTime = Date.now();

  logger.info("Starting weekly feedback analysis job");

  try {
    // Get all active organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
    });

    logger.info(`Processing ${organizations.length} organizations`);

    let totalFeedbacks = 0;
    let totalPatterns = 0;
    let totalSuggestions = 0;

    for (const org of organizations) {
      try {
        logger.debug(`Analyzing feedback for organization: ${org.name}`, {
          organizationId: org.id,
        });

        const result = await analyzeFeedbackForOrg(org.id);

        totalFeedbacks += result.feedbackCount;
        totalPatterns += result.patternsDetected;
        totalSuggestions += result.suggestionsGenerated;

        logger.debug(`Completed analysis for ${org.name}`, {
          organizationId: org.id,
          feedbackCount: result.feedbackCount,
          patternsDetected: result.patternsDetected,
          suggestionsGenerated: result.suggestionsGenerated,
        });
      } catch (error) {
        logger.error(
          `Failed to analyze feedback for organization: ${org.name}`,
          { organizationId: org.id },
          error instanceof Error ? error : new Error(String(error)),
        );
        // Continue with other organizations
      }
    }

    const duration = Date.now() - startTime;

    logger.info("Completed weekly feedback analysis job", {
      duration,
      organizationsProcessed: organizations.length,
      totalFeedbacks,
      totalPatterns,
      totalSuggestions,
    });

    return {
      organizationsProcessed: organizations.length,
      totalFeedbacks,
      patternsDetected: totalPatterns,
      suggestionsGenerated: totalSuggestions,
      duration,
    };
  } catch (error) {
    logger.error(
      "Feedback analysis job failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Analyze feedback for a single organization
 */
async function analyzeFeedbackForOrg(
  organizationId: string,
): Promise<{
  feedbackCount: number;
  patternsDetected: number;
  suggestionsGenerated: number;
}> {
  // Query corrections from the past week
  const cutoffDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const feedbacks = await prisma.$queryRaw<
    Array<{
      id: string;
      organizationId: string;
      executionId: string | null;
      originalMessage: string;
      correction: string;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>
  >`
    SELECT
      id,
      organization_id as "organizationId",
      execution_id as "executionId",
      original_message as "originalMessage",
      correction,
      metadata,
      created_at as "createdAt"
    FROM feedback_captures
    WHERE organization_id = ${organizationId}::uuid
      AND feedback_type = 'correction'
      AND correction IS NOT NULL
      AND correction != ''
      AND created_at >= ${cutoffDate}
    ORDER BY created_at DESC
  `;

  if (feedbacks.length < MIN_CORRECTIONS_FOR_PATTERN) {
    logger.debug("Insufficient corrections for pattern detection", {
      organizationId,
      count: feedbacks.length,
      required: MIN_CORRECTIONS_FOR_PATTERN,
    });
    return {
      feedbackCount: feedbacks.length,
      patternsDetected: 0,
      suggestionsGenerated: 0,
    };
  }

  // Analyze corrections to detect patterns
  const patterns = await analyzeCorrections(feedbacks);

  if (patterns.length === 0) {
    logger.debug("No patterns detected in corrections", {
      organizationId,
      feedbackCount: feedbacks.length,
    });
    return {
      feedbackCount: feedbacks.length,
      patternsDetected: 0,
      suggestionsGenerated: 0,
    };
  }

  // Generate suggestions for high-confidence patterns
  let suggestionsGenerated = 0;

  for (const pattern of patterns) {
    if (pattern.confidence >= MIN_CONFIDENCE_FOR_SUGGESTION) {
      try {
        // Generate improvement suggestion
        const suggestedPrompt = await generatePromptSuggestion(pattern);

        // Get current prompt if available (from AgentActivity metadata or prompt_variants)
        const currentPrompt = await getCurrentPromptForAgent(organizationId, pattern.agentType);

        // Store suggestion
        await storePromptSuggestion({
          organizationId,
          agentType: pattern.agentType,
          patternId: pattern.id,
          currentPrompt,
          suggestedPrompt,
          reason: pattern.description,
          confidence: pattern.confidence,
          status: "pending",
          approvedBy: null,
        });

        suggestionsGenerated++;

        logger.info("Generated prompt suggestion from pattern", {
          organizationId,
          patternId: pattern.id,
          patternType: pattern.patternType,
          agentType: pattern.agentType,
          confidence: pattern.confidence,
        });
      } catch (error) {
        logger.warn("Failed to generate suggestion for pattern", {
          organizationId,
          patternId: pattern.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Send notification if suggestions were generated
  if (suggestionsGenerated > 0) {
    await notifyAdminOfSuggestions(organizationId, suggestionsGenerated);
  }

  return {
    feedbackCount: feedbacks.length,
    patternsDetected: patterns.length,
    suggestionsGenerated,
  };
}

/**
 * Get current prompt for an agent type (if available)
 */
async function getCurrentPromptForAgent(
  organizationId: string,
  agentType: string | null,
): Promise<string | null> {
  if (!agentType) return null;

  try {
    // Try to get from prompt_variants table (if it exists)
    const result = await prisma.$queryRaw<Array<{ systemPrompt: string }>>`
      SELECT system_prompt as "systemPrompt"
      FROM prompt_variants
      WHERE organization_id = ${organizationId}::uuid
        AND agent_id = ${agentType}
        AND is_active = true
      LIMIT 1
    `;

    return result.length > 0 ? result[0].systemPrompt : null;
  } catch (error) {
    // Table might not exist yet or query failed
    logger.debug("Could not fetch current prompt", {
      organizationId,
      agentType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Notify admin about new prompt suggestions
 */
async function notifyAdminOfSuggestions(
  organizationId: string,
  count: number,
): Promise<void> {
  try {
    // Get admin email from organization memberships
    const adminMembership = await prisma.membership.findFirst({
      where: {
        organizationId,
        role: { in: ["owner", "admin"] },
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    if (!adminMembership) {
      logger.warn("No admin found for organization", { organizationId });
      return;
    }

    // TODO: Send Slack notification if Slack integration exists
    // const slackIntegration = await prisma.slackIntegration.findFirst({
    //   where: { organizationId },
    //   select: { botToken: true },
    // });
    //
    // if (slackIntegration?.botToken) {
    //   // Send notification via Slack API
    // }

    // TODO: Add email notification here if needed
    logger.info("Admin notified of prompt suggestions", {
      organizationId,
      count,
      adminEmail: adminMembership.user.email,
    });
  } catch (error) {
    logger.error(
      "Failed to notify admin of suggestions",
      { organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Run feedback analysis for a single organization (for manual trigger)
 */
export async function runFeedbackAnalysisForOrg(
  organizationId: string,
): Promise<{
  feedbackCount: number;
  patternsDetected: number;
  suggestionsGenerated: number;
  duration: number;
}> {
  const startTime = Date.now();

  logger.info("Running on-demand feedback analysis", { organizationId });

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true },
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  const result = await analyzeFeedbackForOrg(organizationId);

  const duration = Date.now() - startTime;

  return {
    ...result,
    duration,
  };
}
