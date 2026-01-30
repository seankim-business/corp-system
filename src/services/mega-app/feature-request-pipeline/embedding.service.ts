/**
 * Feature Request Embedding Service
 *
 * Provides vector embedding generation using OpenAI for semantic similarity
 * in feature request deduplication.
 */

import OpenAI from "openai";
import { logger } from "../../../utils/logger";
import { db } from "../../../db/client";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CACHE_TTL_HOURS = 24 * 7; // 7 days

export interface EmbeddingCacheEntry {
  featureRequestId: string;
  embedding: number[];
  contentHash: string;
  generatedAt: Date;
}

export class FeatureRequestEmbeddingService {
  private openai: OpenAI | null = null;
  private embeddingCache = new Map<string, EmbeddingCacheEntry>();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      logger.warn("OPENAI_API_KEY not set, embedding-based deduplication disabled");
    }
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized - check OPENAI_API_KEY");
    }

    try {
      // Truncate text to fit embedding model limits (~8k tokens, ~30k chars)
      const truncatedText = text.slice(0, 30000);

      logger.debug("Generating embedding", {
        textLength: truncatedText.length,
        model: EMBEDDING_MODEL,
      });

      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncatedText,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const embedding = response.data[0].embedding;

      logger.debug("Embedding generated", {
        dimensions: embedding.length,
      });

      return embedding;
    } catch (error) {
      logger.error(
        "Failed to generate embedding",
        { textLength: text.length },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      logger.warn("Embedding dimension mismatch", {
        aLength: a.length,
        bLength: b.length,
      });
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get or generate embedding for a feature request with caching
   */
  async getOrGenerateEmbedding(
    featureRequestId: string,
    content: string
  ): Promise<number[]> {
    // Check in-memory cache first
    const cached = this.embeddingCache.get(featureRequestId);
    const contentHash = this.hashContent(content);

    if (cached && cached.contentHash === contentHash) {
      const ageHours = (Date.now() - cached.generatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < CACHE_TTL_HOURS) {
        logger.debug("Using cached embedding", { featureRequestId });
        return cached.embedding;
      }
    }

    // Check database for stored embedding
    const storedEmbedding = await this.loadEmbeddingFromDB(featureRequestId);
    if (storedEmbedding && storedEmbedding.contentHash === contentHash) {
      // Cache in memory for faster access
      this.embeddingCache.set(featureRequestId, storedEmbedding);
      logger.debug("Loaded embedding from database", { featureRequestId });
      return storedEmbedding.embedding;
    }

    // Generate new embedding
    logger.debug("Generating new embedding", { featureRequestId });
    const embedding = await this.generateEmbedding(content);

    // Cache in memory and database
    const cacheEntry: EmbeddingCacheEntry = {
      featureRequestId,
      embedding,
      contentHash,
      generatedAt: new Date(),
    };

    this.embeddingCache.set(featureRequestId, cacheEntry);
    await this.saveEmbeddingToDB(cacheEntry);

    return embedding;
  }

  /**
   * Generate embeddings for multiple feature requests in batch
   */
  async batchGenerateEmbeddings(
    requests: Array<{ id: string; content: string }>
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();
    const batchSize = 10; // Process in batches to avoid rate limits

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((req) => this.getOrGenerateEmbedding(req.id, req.content))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const request = batch[j];

        if (result.status === "fulfilled") {
          embeddings.set(request.id, result.value);
        } else {
          logger.error(
            "Failed to generate embedding in batch",
            { requestId: request.id },
            result.reason
          );
        }
      }
    }

    return embeddings;
  }

  /**
   * Simple hash function for content change detection
   */
  private hashContent(content: string): string {
    // Simple hash - in production, consider using crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Load embedding from database
   */
  private async loadEmbeddingFromDB(
    featureRequestId: string
  ): Promise<EmbeddingCacheEntry | null> {
    try {
      const embedding = await db.featureRequestEmbedding.findUnique({
        where: { featureRequestId },
      });

      if (!embedding) return null;

      return {
        featureRequestId,
        embedding: embedding.embedding as number[],
        contentHash: embedding.contentHash,
        generatedAt: embedding.generatedAt,
      };
    } catch (error) {
      logger.error(
        "Failed to load embedding from database",
        { featureRequestId },
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * Save embedding to database
   */
  private async saveEmbeddingToDB(entry: EmbeddingCacheEntry): Promise<void> {
    try {
      await db.featureRequestEmbedding.upsert({
        where: { featureRequestId: entry.featureRequestId },
        create: {
          featureRequestId: entry.featureRequestId,
          embedding: entry.embedding,
          contentHash: entry.contentHash,
          generatedAt: entry.generatedAt,
        },
        update: {
          embedding: entry.embedding,
          contentHash: entry.contentHash,
          generatedAt: entry.generatedAt,
        },
      });

      logger.debug("Saved embedding to database", {
        featureRequestId: entry.featureRequestId,
      });
    } catch (error) {
      logger.error(
        "Failed to save embedding to database",
        { featureRequestId: entry.featureRequestId },
        error instanceof Error ? error : new Error(String(error))
      );
      // Don't throw - embedding can still work from cache
    }
  }

  /**
   * Clear in-memory cache (for testing or memory management)
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.debug("Embedding cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.embeddingCache.size,
      entries: Array.from(this.embeddingCache.keys()),
    };
  }
}

// Singleton instance
let embeddingServiceInstance: FeatureRequestEmbeddingService | null = null;

export function getEmbeddingService(): FeatureRequestEmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new FeatureRequestEmbeddingService();
  }
  return embeddingServiceInstance;
}
