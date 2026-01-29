/**
 * RAG Reranker Service
 * Reranks retrieval results for improved relevance
 */

import { logger } from '../../utils/logger';

// Import the RetrievalResult type from retriever
export interface RetrievalResult {
  documentId: string;
  sourceType: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface RerankerOptions {
  /** Use LLM for cross-encoder scoring (more accurate but slower) */
  useLLMScoring: boolean;
  /** Boost factor for recency (0 = no boost, 1 = strong boost) */
  recencyBoost: number;
  /** Boost factor for title matches */
  titleMatchBoost: number;
}

const DEFAULT_OPTIONS: RerankerOptions = {
  useLLMScoring: false,
  recencyBoost: 0,
  titleMatchBoost: 0.1,
};

export class Reranker {
  private options: RerankerOptions;

  constructor(options?: Partial<RerankerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Rerank results using multiple scoring factors
   */
  async rerank(
    query: string,
    results: RetrievalResult[],
    topK: number,
    options?: Partial<RerankerOptions>
  ): Promise<RetrievalResult[]> {
    const opts = { ...this.options, ...options };

    if (results.length === 0) {
      return [];
    }

    if (results.length <= topK) {
      // No need to rerank if we have fewer results than requested
      return this.applyBoosts(query, results, opts);
    }

    const startTime = Date.now();

    try {
      let scoredResults: Array<RetrievalResult & { rerankedScore: number }>;

      if (opts.useLLMScoring) {
        scoredResults = await this.scoreWithLLM(query, results);
      } else {
        scoredResults = this.scoreWithHeuristics(query, results, opts);
      }

      // Sort by reranked score and take top K
      const reranked = scoredResults
        .sort((a, b) => b.rerankedScore - a.rerankedScore)
        .slice(0, topK)
        .map(({ rerankedScore, ...result }) => ({
          ...result,
          similarity: rerankedScore, // Update similarity with reranked score
        }));

      const duration = Date.now() - startTime;
      logger.info('Reranking completed', {
        inputCount: results.length,
        outputCount: reranked.length,
        usedLLM: opts.useLLMScoring,
        duration,
      });

      return reranked;
    } catch (error) {
      logger.error('Reranking failed, returning original results', {
        query: query.slice(0, 100),
        resultCount: results.length,
      }, error instanceof Error ? error : new Error(String(error)));

      // Fall back to original results on error
      return results.slice(0, topK);
    }
  }

  /**
   * Rerank with recency boost
   */
  async rerankWithRecency(
    query: string,
    results: RetrievalResult[],
    topK: number,
    recencyWeight: number = 0.2
  ): Promise<RetrievalResult[]> {
    return this.rerank(query, results, topK, { recencyBoost: recencyWeight });
  }

  /**
   * Apply boosts to results without full reranking
   */
  private applyBoosts(
    query: string,
    results: RetrievalResult[],
    opts: RerankerOptions
  ): RetrievalResult[] {
    const queryTerms = this.extractTerms(query);

    return results.map(result => {
      let score = result.similarity;

      // Title match boost
      if (opts.titleMatchBoost > 0) {
        const titleScore = this.calculateTermOverlap(queryTerms, this.extractTerms(result.title));
        score += titleScore * opts.titleMatchBoost;
      }

      // Recency boost
      if (opts.recencyBoost > 0) {
        const recencyScore = this.calculateRecencyScore(result.metadata);
        score += recencyScore * opts.recencyBoost;
      }

      return { ...result, similarity: Math.min(score, 1) };
    });
  }

  /**
   * Score using heuristic methods (fast)
   */
  private scoreWithHeuristics(
    query: string,
    results: RetrievalResult[],
    opts: RerankerOptions
  ): Array<RetrievalResult & { rerankedScore: number }> {
    const queryTerms = this.extractTerms(query);

    return results.map(result => {
      // Base score from vector similarity
      let score = result.similarity;

      // Title relevance boost
      const titleTerms = this.extractTerms(result.title);
      const titleOverlap = this.calculateTermOverlap(queryTerms, titleTerms);
      score += titleOverlap * opts.titleMatchBoost;

      // Content term frequency boost
      const contentTerms = this.extractTerms(result.content);
      const contentOverlap = this.calculateTermOverlap(queryTerms, contentTerms);
      score += contentOverlap * 0.05; // Small boost for content matches

      // Recency boost
      if (opts.recencyBoost > 0) {
        const recencyScore = this.calculateRecencyScore(result.metadata);
        score += recencyScore * opts.recencyBoost;
      }

      // Chunk position penalty (prefer earlier chunks)
      if (result.chunkIndex > 0) {
        score -= result.chunkIndex * 0.01;
      }

      // Normalize score
      score = Math.max(0, Math.min(1, score));

      return { ...result, rerankedScore: score };
    });
  }

  /**
   * Score using LLM cross-encoder (accurate but slow)
   */
  private async scoreWithLLM(
    query: string,
    results: RetrievalResult[]
  ): Promise<Array<RetrievalResult & { rerankedScore: number }>> {
    // For now, fall back to heuristics
    // TODO: Implement LLM-based cross-encoder scoring
    // This would use the AI provider to score query-document pairs
    logger.warn('LLM scoring not yet implemented, using heuristics');
    return this.scoreWithHeuristics(query, results, this.options);
  }

  /**
   * Extract normalized terms from text
   */
  private extractTerms(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(term => term.length > 2)
    );
  }

  /**
   * Calculate overlap between two term sets
   */
  private calculateTermOverlap(queryTerms: Set<string>, docTerms: Set<string>): number {
    if (queryTerms.size === 0) return 0;

    let matches = 0;
    for (const term of queryTerms) {
      if (docTerms.has(term)) {
        matches++;
      }
    }

    return matches / queryTerms.size;
  }

  /**
   * Calculate recency score from metadata
   */
  private calculateRecencyScore(metadata: Record<string, unknown>): number {
    // Look for date fields in metadata
    const dateFields = ['updatedAt', 'createdAt', 'lastModified', 'date'];

    for (const field of dateFields) {
      const value = metadata[field];
      if (value) {
        try {
          const date = new Date(value as string);
          if (!isNaN(date.getTime())) {
            // Score based on age (newer = higher score)
            const ageMs = Date.now() - date.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);

            // Decay function: 1.0 for today, 0.5 for 30 days ago, approaching 0 for older
            return Math.exp(-ageDays / 30);
          }
        } catch {
          // Invalid date, continue to next field
        }
      }
    }

    // No date found, return neutral score
    return 0.5;
  }
}

// Singleton instance
let reranker: Reranker | null = null;

export function getReranker(options?: Partial<RerankerOptions>): Reranker {
  if (!reranker || options) {
    reranker = new Reranker(options);
  }
  return reranker;
}

export function createReranker(options?: Partial<RerankerOptions>): Reranker {
  return new Reranker(options);
}
