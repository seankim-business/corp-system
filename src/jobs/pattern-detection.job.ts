/**
 * Pattern Detection Job
 * Functions to analyze patterns and generate SOP drafts
 * Can be called from scheduled tasks or manually
 */

import { db } from "../db/client";
import { patternDetector } from "../services/pattern-detector";
import { logger } from "../utils/logger";
import { runWithoutRLS } from "../utils/async-context";

// Job configuration
const LOOKBACK_DAYS = 30;
const MIN_SUPPORT = 3;
const MIN_CONFIDENCE_FOR_DRAFT = 0.8;

/**
 * Run pattern detection for all active organizations
 */
export async function runPatternDetection(): Promise<{
  organizationsProcessed: number;
  totalPatterns: number;
  totalDrafts: number;
  duration: number;
}> {
  const startTime = Date.now();

  logger.info("Starting scheduled pattern detection job");

  try {
    // Get all active organizations - bypass RLS since this is a system job
    const organizations = await runWithoutRLS(() =>
      db.organization.findMany({
        select: { id: true, name: true },
      })
    );

    logger.info(`Processing ${organizations.length} organizations`);

    let totalPatterns = 0;
    let totalDrafts = 0;

    for (const org of organizations) {
      try {
        logger.debug(`Analyzing patterns for organization: ${org.name}`, {
          organizationId: org.id,
        });

        // Run pattern analysis
        const result = await patternDetector.analyze(org.id, {
          lookbackDays: LOOKBACK_DAYS,
          minSupport: MIN_SUPPORT,
          generateDrafts: false, // We'll generate drafts manually for high-confidence patterns
        });

        // Count patterns
        totalPatterns += result.sopCandidates.length;

        // Generate drafts only for high-confidence patterns
        const highConfidencePatterns = result.sopCandidates.filter(
          (p) => p.confidence >= MIN_CONFIDENCE_FOR_DRAFT,
        );

        for (const pattern of highConfidencePatterns) {
          try {
            await patternDetector.generateSOPFromPattern(pattern.id, org.id);
            totalDrafts++;

            logger.info("Generated SOP draft from high-confidence pattern", {
              patternId: pattern.id,
              organizationId: org.id,
              confidence: pattern.confidence,
            });
          } catch (error) {
            logger.warn("Failed to generate SOP draft", {
              patternId: pattern.id,
              organizationId: org.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        logger.debug(`Completed analysis for ${org.name}`, {
          organizationId: org.id,
          patternsFound: result.sopCandidates.length,
          draftsGenerated: highConfidencePatterns.length,
        });
      } catch (error) {
        logger.error(
          `Failed to analyze patterns for organization: ${org.name}`,
          { organizationId: org.id },
          error instanceof Error ? error : new Error(String(error)),
        );
        // Continue with other organizations
      }
    }

    const duration = Date.now() - startTime;

    logger.info("Completed scheduled pattern detection job", {
      duration,
      organizationsProcessed: organizations.length,
      totalPatterns,
      totalDrafts,
    });

    return {
      organizationsProcessed: organizations.length,
      totalPatterns,
      totalDrafts,
      duration,
    };
  } catch (error) {
    logger.error(
      "Pattern detection job failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Run pattern detection for a single organization (for manual trigger)
 */
export async function runPatternDetectionForOrg(
  organizationId: string,
  options?: {
    lookbackDays?: number;
    minSupport?: number;
    generateDrafts?: boolean;
  },
): Promise<{
  patternsFound: number;
  draftsGenerated: number;
  duration: number;
}> {
  const startTime = Date.now();

  logger.info("Running on-demand pattern detection", { organizationId });

  const result = await patternDetector.analyze(organizationId, {
    lookbackDays: options?.lookbackDays ?? LOOKBACK_DAYS,
    minSupport: options?.minSupport ?? MIN_SUPPORT,
    generateDrafts: options?.generateDrafts ?? true,
  });

  const duration = Date.now() - startTime;

  return {
    patternsFound: result.sopCandidates.length,
    draftsGenerated: options?.generateDrafts
      ? result.sopCandidates.filter((p) => p.confidence >= MIN_CONFIDENCE_FOR_DRAFT).length
      : 0,
    duration,
  };
}
