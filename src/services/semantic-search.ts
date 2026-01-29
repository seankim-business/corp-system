/**
 * Semantic Search Service
 *
 * Provides embedding-based semantic search using OpenAI embeddings
 * with Redis for temporary storage (until pgvector is implemented).
 */

import OpenAI from "openai";
import Redis from "ioredis";
import { logger } from "../utils/logger";

export interface IndexableDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    title: string;
    url: string;
    organizationId: string;
    [key: string]: unknown;
  };
}

export interface SemanticSearchResult {
  id: string;
  score: number;
  metadata: IndexableDocument["metadata"];
}

export interface SemanticSearchOptions {
  limit?: number;
  threshold?: number;
  sources?: string[];
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const REDIS_KEY_PREFIX = "nubabel:embeddings:";
const REDIS_INDEX_PREFIX = "nubabel:embedding_index:";

export class SemanticSearchService {
  private openai: OpenAI;
  private redis: Redis;
  private organizationId: string;

  constructor(config: { apiKey: string; redisUrl: string; organizationId: string }) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.redis = new Redis(config.redisUrl);
    this.organizationId = config.organizationId;
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Truncate text to fit embedding model limits (~8k tokens)
      const truncatedText = text.slice(0, 30000);

      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncatedText,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error("Failed to generate embedding", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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
   * Index a document for semantic search
   */
  async indexDocument(doc: IndexableDocument): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(doc.content);
      const key = `${REDIS_KEY_PREFIX}${this.organizationId}:${doc.id}`;

      // Store embedding and metadata
      await this.redis.set(
        key,
        JSON.stringify({
          embedding,
          metadata: doc.metadata,
          indexedAt: new Date().toISOString(),
        }),
        "EX",
        86400 * 7, // 7 day TTL
      );

      // Add to organization's document index
      const indexKey = `${REDIS_INDEX_PREFIX}${this.organizationId}`;
      await this.redis.sadd(indexKey, doc.id);

      logger.debug("Indexed document", { id: doc.id, source: doc.metadata.source });
    } catch (error) {
      logger.error("Failed to index document", {
        id: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Index multiple documents in batch
   */
  async indexDocuments(docs: IndexableDocument[]): Promise<{ indexed: number; failed: number }> {
    let indexed = 0;
    let failed = 0;

    // Process in batches of 10 to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((doc) => this.indexDocument(doc)),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          indexed++;
        } else {
          failed++;
        }
      }
    }

    return { indexed, failed };
  }

  /**
   * Perform semantic search using embeddings
   */
  async search(query: string, options: SemanticSearchOptions = {}): Promise<SemanticSearchResult[]> {
    const { limit = 10, threshold = 0.5, sources } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Get all document IDs for this organization
      const indexKey = `${REDIS_INDEX_PREFIX}${this.organizationId}`;
      const docIds = await this.redis.smembers(indexKey);

      if (docIds.length === 0) {
        return [];
      }

      // Retrieve all embeddings and calculate similarity
      const results: SemanticSearchResult[] = [];

      for (const docId of docIds) {
        const key = `${REDIS_KEY_PREFIX}${this.organizationId}:${docId}`;
        const data = await this.redis.get(key);

        if (!data) continue;

        const { embedding, metadata } = JSON.parse(data);

        // Filter by source if specified
        if (sources && !sources.includes(metadata.source)) {
          continue;
        }

        const score = this.cosineSimilarity(queryEmbedding, embedding);

        if (score >= threshold) {
          results.push({
            id: docId,
            score,
            metadata,
          });
        }
      }

      // Sort by score descending and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    } catch (error) {
      logger.error("Semantic search failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Remove a document from the index
   */
  async removeDocument(docId: string): Promise<void> {
    const key = `${REDIS_KEY_PREFIX}${this.organizationId}:${docId}`;
    const indexKey = `${REDIS_INDEX_PREFIX}${this.organizationId}`;

    await Promise.all([this.redis.del(key), this.redis.srem(indexKey, docId)]);
  }

  /**
   * Clear all indexed documents for the organization
   */
  async clearIndex(): Promise<void> {
    const indexKey = `${REDIS_INDEX_PREFIX}${this.organizationId}`;
    const docIds = await this.redis.smembers(indexKey);

    const pipeline = this.redis.pipeline();
    for (const docId of docIds) {
      pipeline.del(`${REDIS_KEY_PREFIX}${this.organizationId}:${docId}`);
    }
    pipeline.del(indexKey);

    await pipeline.exec();
  }

  /**
   * Get statistics about indexed documents
   */
  async getStats(): Promise<{ documentCount: number; sources: Record<string, number> }> {
    const indexKey = `${REDIS_INDEX_PREFIX}${this.organizationId}`;
    const docIds = await this.redis.smembers(indexKey);

    const sources: Record<string, number> = {};

    for (const docId of docIds) {
      const key = `${REDIS_KEY_PREFIX}${this.organizationId}:${docId}`;
      const data = await this.redis.get(key);
      if (data) {
        const { metadata } = JSON.parse(data);
        sources[metadata.source] = (sources[metadata.source] || 0) + 1;
      }
    }

    return {
      documentCount: docIds.length,
      sources,
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Factory function for creating semantic search with environment config
export function createSemanticSearchService(
  organizationId: string,
): SemanticSearchService | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const redisUrl = process.env.REDIS_URL;

  if (!apiKey || !redisUrl) {
    logger.warn("Missing OPENAI_API_KEY or REDIS_URL, semantic search disabled");
    return null;
  }

  return new SemanticSearchService({ apiKey, redisUrl, organizationId });
}
