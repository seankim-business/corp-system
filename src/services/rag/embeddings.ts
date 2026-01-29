/**
 * RAG Embedding Service
 * Generates vector embeddings for text using OpenAI's embedding models
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger';

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100; // OpenAI limit
const MAX_INPUT_TOKENS = 8191; // Model limit

export interface EmbeddingService {
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Get embedding model info */
  getModelInfo(): { model: string; dimensions: number };
}

export class OpenAIEmbeddings implements EmbeddingService {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = EMBEDDING_MODEL;
    this.dimensions = EMBEDDING_DIMENSIONS;
  }

  getModelInfo(): { model: string; dimensions: number } {
    return {
      model: this.model,
      dimensions: this.dimensions,
    };
  }

  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    // Truncate if too long (rough estimate: 1 token ≈ 4 chars)
    const truncatedText = this.truncateText(text);

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: truncatedText,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', {
        textLength: text.length,
        model: this.model,
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Filter and truncate texts
    const processedTexts = texts
      .filter(t => t && t.trim().length > 0)
      .map(t => this.truncateText(t));

    if (processedTexts.length === 0) {
      return [];
    }

    // Process in batches
    const embeddings: number[][] = [];

    for (let i = 0; i < processedTexts.length; i += MAX_BATCH_SIZE) {
      const batch = processedTexts.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
        });

        // Sort by index to maintain order
        const sortedData = response.data.sort((a, b) => a.index - b.index);
        embeddings.push(...sortedData.map(d => d.embedding));

        logger.info('Generated batch embeddings', {
          batchSize: batch.length,
          totalProcessed: embeddings.length,
          totalRemaining: processedTexts.length - embeddings.length,
        });
      } catch (error) {
        logger.error('Failed to generate batch embeddings', {
          batchSize: batch.length,
          batchIndex: i,
        }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }

    return embeddings;
  }

  private truncateText(text: string): string {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = MAX_INPUT_TOKENS * 4;
    if (text.length <= maxChars) {
      return text;
    }

    logger.warn('Truncating text for embedding', {
      originalLength: text.length,
      truncatedLength: maxChars,
    });

    return text.slice(0, maxChars);
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new OpenAIEmbeddings();
  }
  return embeddingService;
}

export function createEmbeddingService(apiKey?: string): EmbeddingService {
  return new OpenAIEmbeddings(apiKey);
}
