/**
 * Feature Request Deduplication Service
 *
 * Detects and handles duplicate or similar feature requests using
 * text similarity algorithms. Supports auto-merge, suggested merge,
 * and relationship linking.
 */
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";
import {
  SimilarRequest,
  DeduplicationResult,
  MergeResult,
  FeatureRequestStatus,
  LinkType,
  FeatureRequestPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from "./types";
import { getEmbeddingService } from "./embedding.service";

export class FeatureRequestDeduplicationService {
  private config: FeatureRequestPipelineConfig;
  private embeddingService = getEmbeddingService();

  constructor(config: Partial<FeatureRequestPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  /**
   * Find similar requests using vector embeddings (primary method)
   */
  async findSimilarByEmbedding(
    organizationId: string,
    rawContent: string,
    excludeRequestId?: string
  ): Promise<SimilarRequest[]> {
    if (!this.embeddingService.isAvailable()) {
      logger.debug("Embedding service not available, falling back to text similarity");
      return this.findSimilarByText(organizationId, rawContent, excludeRequestId);
    }

    logger.info("Finding similar feature requests using embeddings", {
      organizationId,
      contentLength: rawContent.length,
      excludeRequestId,
    });

    try {
      // Get all non-closed requests for the organization
      const existingRequests = await db.featureRequest.findMany({
        where: {
          organizationId,
          status: {
            notIn: ["released", "rejected", "merged"],
          },
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100, // Limit to most recent 100 for performance
      });

      if (existingRequests.length === 0) {
        logger.debug("No existing requests to compare against", { organizationId });
        return [];
      }

      // Generate embedding for new request
      const newEmbedding = await this.embeddingService.generateEmbedding(rawContent);

      // Get or generate embeddings for existing requests
      const embeddingsMap = await this.embeddingService.batchGenerateEmbeddings(
        existingRequests.map((req) => ({
          id: req.id,
          content: req.rawContent,
        }))
      );

      // Calculate similarity for each existing request
      const similarRequests: SimilarRequest[] = [];

      for (const existing of existingRequests) {
        const existingEmbedding = embeddingsMap.get(existing.id);
        if (!existingEmbedding) continue;

        const similarity = this.embeddingService.cosineSimilarity(
          newEmbedding,
          existingEmbedding
        );

        if (similarity >= this.config.relatedThreshold) {
          similarRequests.push({
            requestId: existing.id,
            similarity,
            status: existing.status as FeatureRequestStatus,
            rawContent: existing.rawContent,
            analyzedIntent: existing.analyzedIntent || undefined,
            createdAt: existing.createdAt,
            requestCount: existing.requestCount,
          });
        }
      }

      // Sort by similarity descending
      const sorted = similarRequests.sort((a, b) => b.similarity - a.similarity);

      logger.info("Similar requests found using embeddings", {
        organizationId,
        similarCount: sorted.length,
        topSimilarity: sorted[0]?.similarity,
      });

      return sorted;
    } catch (error) {
      logger.error(
        "Embedding-based similarity failed, falling back to text similarity",
        { organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return this.findSimilarByText(organizationId, rawContent, excludeRequestId);
    }
  }

  /**
   * Find similar requests using text-based methods (fallback)
   */
  async findSimilarByText(
    organizationId: string,
    rawContent: string,
    excludeRequestId?: string
  ): Promise<SimilarRequest[]> {
    logger.info("Finding similar feature requests using text similarity", {
      organizationId,
      contentLength: rawContent.length,
      excludeRequestId,
    });

    // Get all non-closed requests for the organization
    const existingRequests = await db.featureRequest.findMany({
      where: {
        organizationId,
        status: {
          notIn: ["released", "rejected", "merged"],
        },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100, // Limit to most recent 100 for performance
    });

    if (existingRequests.length === 0) {
      logger.debug("No existing requests to compare against", { organizationId });
      return [];
    }

    // Calculate similarity for each existing request
    const similarRequests: SimilarRequest[] = [];
    const normalizedNewContent = this.normalizeText(rawContent);

    for (const existing of existingRequests) {
      const normalizedExisting = this.normalizeText(existing.rawContent);
      const similarity = this.calculateSimilarity(normalizedNewContent, normalizedExisting);

      if (similarity >= this.config.relatedThreshold) {
        similarRequests.push({
          requestId: existing.id,
          similarity,
          status: existing.status as FeatureRequestStatus,
          rawContent: existing.rawContent,
          analyzedIntent: existing.analyzedIntent || undefined,
          createdAt: existing.createdAt,
          requestCount: existing.requestCount,
        });
      }
    }

    // Sort by similarity descending
    const sorted = similarRequests.sort((a, b) => b.similarity - a.similarity);

    logger.info("Similar requests found using text similarity", {
      organizationId,
      similarCount: sorted.length,
      topSimilarity: sorted[0]?.similarity,
    });

    return sorted;
  }

  /**
   * Find similar requests (uses embedding by default, falls back to text)
   */
  async findSimilarRequests(
    organizationId: string,
    rawContent: string,
    excludeRequestId?: string
  ): Promise<SimilarRequest[]> {
    return this.findSimilarByEmbedding(organizationId, rawContent, excludeRequestId);
  }

  /**
   * Determine deduplication action for a new request
   */
  async checkForDuplicates(
    organizationId: string,
    requestId: string,
    rawContent: string
  ): Promise<DeduplicationResult> {
    logger.info("Checking for duplicate requests", {
      organizationId,
      requestId,
    });

    const similarRequests = await this.findSimilarRequests(
      organizationId,
      rawContent,
      requestId
    );

    if (similarRequests.length === 0) {
      return {
        action: "no-action",
        similarRequests: [],
        reason: "No similar requests found",
      };
    }

    const topMatch = similarRequests[0];

    // Check for auto-merge threshold
    if (topMatch.similarity >= this.config.autoMergeThreshold) {
      return {
        action: "auto-merge",
        primaryRequestId: topMatch.requestId,
        similarRequests,
        reason: `Very high similarity (${(topMatch.similarity * 100).toFixed(1)}%) - auto-merge recommended`,
      };
    }

    // Check for suggested merge threshold
    if (topMatch.similarity >= this.config.suggestMergeThreshold) {
      return {
        action: "suggest-merge",
        primaryRequestId: topMatch.requestId,
        similarRequests,
        reason: `High similarity (${(topMatch.similarity * 100).toFixed(1)}%) - merge suggested for review`,
      };
    }

    // Link as related
    return {
      action: "link-related",
      similarRequests,
      reason: `Moderate similarity (${(topMatch.similarity * 100).toFixed(1)}%) - linking as related`,
    };
  }

  /**
   * Merge duplicate requests into a primary request
   */
  async mergeRequests(
    primaryId: string,
    duplicateIds: string[]
  ): Promise<MergeResult> {
    logger.info("Merging feature requests", {
      primaryId,
      duplicateIds,
      duplicateCount: duplicateIds.length,
    });

    try {
      // Get primary request
      const primary = await db.featureRequest.findUnique({
        where: { id: primaryId },
      });

      if (!primary) {
        throw new Error(`Primary request not found: ${primaryId}`);
      }

      // Get duplicate requests
      const duplicates = await db.featureRequest.findMany({
        where: {
          id: { in: duplicateIds },
        },
      });

      if (duplicates.length === 0) {
        throw new Error("No duplicate requests found to merge");
      }

      // Calculate new request count
      const additionalCount = duplicates.reduce(
        (sum, dup) => sum + dup.requestCount,
        0
      );

      // Note: In production, store merged metadata in a proper field or table
      // For now, metadata is preserved via the tags and relatedModules merging

      // Update primary request
      await db.featureRequest.update({
        where: { id: primaryId },
        data: {
          requestCount: primary.requestCount + additionalCount,
          // Merge tags from duplicates
          tags: [
            ...new Set([
              ...primary.tags,
              ...duplicates.flatMap((d) => d.tags),
            ]),
          ],
          // Merge related modules
          relatedModules: [
            ...new Set([
              ...primary.relatedModules,
              ...duplicates.flatMap((d) => d.relatedModules),
            ]),
          ],
        },
      });

      // Update duplicate requests to merged status
      await db.featureRequest.updateMany({
        where: {
          id: { in: duplicateIds },
        },
        data: {
          status: "merged",
          parentRequestId: primaryId,
        },
      });

      const newRequestCount = primary.requestCount + additionalCount;

      logger.info("Feature requests merged successfully", {
        primaryId,
        mergedCount: duplicates.length,
        newRequestCount,
      });

      return {
        success: true,
        primaryRequestId: primaryId,
        mergedRequestIds: duplicateIds,
        newRequestCount,
      };
    } catch (error) {
      logger.error(
        "Failed to merge feature requests",
        { primaryId, duplicateIds },
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        success: false,
        primaryRequestId: primaryId,
        mergedRequestIds: [],
        newRequestCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a link between related requests
   */
  async linkRequests(
    sourceId: string,
    targetId: string,
    linkType: LinkType
  ): Promise<void> {
    logger.info("Linking feature requests", {
      sourceId,
      targetId,
      linkType,
    });

    // Note: This assumes a FeatureRequestLink model exists in Prisma schema
    // If not, we can store links in metadata or a separate table

    try {
      // Check if link already exists
      const existingLink = await this.findExistingLink(sourceId, targetId);
      if (existingLink) {
        logger.debug("Link already exists between requests", {
          sourceId,
          targetId,
          existingType: existingLink,
        });
        return;
      }

      // For now, store link in both requests' metadata
      // In production, use a proper link table
      await this.storeLink(sourceId, targetId, linkType);

      logger.info("Feature requests linked", {
        sourceId,
        targetId,
        linkType,
      });
    } catch (error) {
      logger.error(
        "Failed to link feature requests",
        { sourceId, targetId, linkType },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Auto-link similar requests based on deduplication result
   */
  async autoLinkSimilarRequests(
    requestId: string,
    similarRequests: SimilarRequest[]
  ): Promise<void> {
    logger.info("Auto-linking similar requests", {
      requestId,
      similarCount: similarRequests.length,
    });

    for (const similar of similarRequests) {
      const linkType = this.determineLinkType(similar.similarity);
      if (linkType) {
        await this.linkRequests(requestId, similar.requestId, linkType);
      }
    }
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  /**
   * Calculate similarity between two texts using multiple methods
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Use a combination of methods for better accuracy

    // 1. Jaccard similarity on words
    const words1 = new Set(text1.split(" ").filter((w) => w.length > 2));
    const words2 = new Set(text2.split(" ").filter((w) => w.length > 2));
    const jaccardSim = this.jaccardSimilarity(words1, words2);

    // 2. Bigram similarity
    const bigrams1 = this.getBigrams(text1);
    const bigrams2 = this.getBigrams(text2);
    const bigramSim = this.jaccardSimilarity(bigrams1, bigrams2);

    // 3. Levenshtein-based similarity (capped for performance)
    const shortText1 = text1.slice(0, 500);
    const shortText2 = text2.slice(0, 500);
    const levenshteinSim = this.levenshteinSimilarity(shortText1, shortText2);

    // Weighted average
    const weightedSim =
      jaccardSim * 0.3 +
      bigramSim * 0.4 +
      levenshteinSim * 0.3;

    return weightedSim;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    if (set1.size === 0 || set2.size === 0) return 0;

    let intersection = 0;
    for (const item of set1) {
      if (set2.has(item)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return intersection / union;
  }

  /**
   * Get character bigrams from text
   */
  private getBigrams(text: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < text.length - 1; i++) {
      bigrams.add(text.slice(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Calculate Levenshtein-based similarity
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Use two rows instead of full matrix for memory efficiency
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    // Initialize first row
    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1, // deletion
          currRow[j - 1] + 1, // insertion
          prevRow[j - 1] + cost // substitution
        );
      }

      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  /**
   * Determine link type based on similarity score
   */
  private determineLinkType(similarity: number): LinkType | null {
    if (similarity >= this.config.autoMergeThreshold) {
      return "duplicate";
    }
    if (similarity >= this.config.suggestMergeThreshold) {
      return "related";
    }
    if (similarity >= this.config.relatedThreshold) {
      return "related";
    }
    return null;
  }

  /**
   * Find existing link between two requests
   */
  private async findExistingLink(
    sourceId: string,
    _targetId: string
  ): Promise<LinkType | null> {
    // Check both directions
    const source = await db.featureRequest.findUnique({
      where: { id: sourceId },
    });

    if (!source) return null;

    // Check in metadata (simplified approach)
    // In production, use a proper link table
    return null;
  }

  /**
   * Store link between requests (simplified - stores in metadata)
   */
  private async storeLink(
    sourceId: string,
    targetId: string,
    linkType: LinkType
  ): Promise<void> {
    // In production, this would create a FeatureRequestLink record
    // For now, we'll log the link action
    logger.info("Link created (metadata storage)", {
      sourceId,
      targetId,
      linkType,
    });

    // Update source request's tags to indicate link
    const source = await db.featureRequest.findUnique({
      where: { id: sourceId },
    });

    if (source) {
      const linkTag = `linked:${linkType}:${targetId}`;
      if (!source.tags.includes(linkTag)) {
        await db.featureRequest.update({
          where: { id: sourceId },
          data: {
            tags: [...source.tags, linkTag],
          },
        });
      }
    }
  }
}

// Singleton instance
let deduplicationServiceInstance: FeatureRequestDeduplicationService | null = null;

export function getDeduplicationService(
  config?: Partial<FeatureRequestPipelineConfig>
): FeatureRequestDeduplicationService {
  if (!deduplicationServiceInstance) {
    deduplicationServiceInstance = new FeatureRequestDeduplicationService(config);
  }
  return deduplicationServiceInstance;
}
