/**
 * RAG Semantic Retriever Service
 * Performs vector similarity search for document retrieval
 */

import { db as prisma } from '../../db/client';
import { logger } from '../../utils/logger';
import { getEmbeddingService, EmbeddingService } from './embeddings';

export interface RetrievalOptions {
  /** Maximum number of results */
  limit: number;
  /** Minimum similarity score (0-1) */
  minSimilarity: number;
  /** Filter by source types */
  sourceTypes?: string[];
  /** Include metadata in results */
  includeMetadata?: boolean;
}

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

export interface HybridSearchOptions extends RetrievalOptions {
  /** Weight for keyword search (0-1), semantic weight = 1 - keywordWeight */
  keywordWeight: number;
}

export interface SearchFilters {
  sourceTypes?: string[];
  dateRange?: { start: Date; end: Date };
  authors?: string[];
}

const DEFAULT_OPTIONS: RetrievalOptions = {
  limit: 10,
  minSimilarity: 0.7,
  includeMetadata: true,
};

export class SemanticRetriever {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || getEmbeddingService();
  }

  /**
   * Semantic search using vector similarity
   */
  async search(
    organizationId: string,
    query: string,
    options?: Partial<RetrievalOptions>
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embed(query);

      // Build source type filter
      const sourceTypeFilter = opts.sourceTypes?.length
        ? `AND source_type = ANY($4::varchar[])`
        : '';

      // Execute vector similarity search using pgvector
      // Using cosine distance: 1 - (embedding_vector <=> query_vector)
      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        source_type: string;
        source_id: string;
        source_url: string | null;
        title: string;
        content: string;
        chunk_index: number;
        metadata: Record<string, unknown>;
        similarity: number;
      }>>(
        `
        SELECT
          id,
          source_type,
          source_id,
          source_url,
          title,
          content,
          chunk_index,
          metadata,
          1 - (embedding_vector <=> $1::vector) as similarity
        FROM document_embeddings
        WHERE organization_id = $2::uuid
          AND embedding_vector IS NOT NULL
          AND 1 - (embedding_vector <=> $1::vector) >= $3
          ${sourceTypeFilter}
        ORDER BY embedding_vector <=> $1::vector
        LIMIT $${opts.sourceTypes?.length ? '5' : '4'}
        `,
        `[${queryEmbedding.join(',')}]`,
        organizationId,
        opts.minSimilarity,
        ...(opts.sourceTypes?.length ? [opts.sourceTypes, opts.limit] : [opts.limit])
      );

      const duration = Date.now() - startTime;
      logger.info('Semantic search completed', {
        organizationId,
        query: query.slice(0, 100),
        resultsCount: results.length,
        duration,
      });

      return results.map(r => ({
        documentId: r.id,
        sourceType: r.source_type,
        sourceId: r.source_id,
        sourceUrl: r.source_url || undefined,
        title: r.title,
        content: r.content,
        similarity: r.similarity,
        chunkIndex: r.chunk_index,
        metadata: opts.includeMetadata ? r.metadata : {},
      }));
    } catch (error) {
      logger.error('Semantic search failed', {
        organizationId,
        query: query.slice(0, 100),
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  async hybridSearch(
    organizationId: string,
    query: string,
    options?: Partial<HybridSearchOptions>
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_OPTIONS, keywordWeight: 0.3, ...options };
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embed(query);

      // Prepare search terms for keyword matching
      const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const tsQuery = searchTerms.join(' | ');

      // Build source type filter
      const sourceTypeFilter = opts.sourceTypes?.length
        ? `AND source_type = ANY($6::varchar[])`
        : '';

      // Combined scoring: (1 - keywordWeight) * semantic + keywordWeight * keyword
      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        source_type: string;
        source_id: string;
        source_url: string | null;
        title: string;
        content: string;
        chunk_index: number;
        metadata: Record<string, unknown>;
        semantic_score: number;
        keyword_score: number;
        combined_score: number;
      }>>(
        `
        WITH semantic_results AS (
          SELECT
            id,
            source_type,
            source_id,
            source_url,
            title,
            content,
            chunk_index,
            metadata,
            1 - (embedding_vector <=> $1::vector) as semantic_score,
            ts_rank_cd(
              to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
              to_tsquery('english', $2)
            ) as keyword_score
          FROM document_embeddings
          WHERE organization_id = $3::uuid
            AND embedding_vector IS NOT NULL
            ${sourceTypeFilter}
        )
        SELECT
          *,
          (1 - $4) * semantic_score + $4 * LEAST(keyword_score, 1) as combined_score
        FROM semantic_results
        WHERE semantic_score >= $5 OR keyword_score > 0
        ORDER BY combined_score DESC
        LIMIT $${opts.sourceTypes?.length ? '7' : '6'}
        `,
        `[${queryEmbedding.join(',')}]`,
        tsQuery || 'empty',
        organizationId,
        opts.keywordWeight,
        opts.minSimilarity,
        ...(opts.sourceTypes?.length ? [opts.sourceTypes, opts.limit] : [opts.limit])
      );

      const duration = Date.now() - startTime;
      logger.info('Hybrid search completed', {
        organizationId,
        query: query.slice(0, 100),
        resultsCount: results.length,
        keywordWeight: opts.keywordWeight,
        duration,
      });

      return results.map(r => ({
        documentId: r.id,
        sourceType: r.source_type,
        sourceId: r.source_id,
        sourceUrl: r.source_url || undefined,
        title: r.title,
        content: r.content,
        similarity: r.combined_score,
        chunkIndex: r.chunk_index,
        metadata: opts.includeMetadata ? r.metadata : {},
      }));
    } catch (error) {
      logger.error('Hybrid search failed', {
        organizationId,
        query: query.slice(0, 100),
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search with additional filters
   */
  async searchWithFilters(
    organizationId: string,
    query: string,
    filters: SearchFilters,
    options?: Partial<RetrievalOptions>
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      const queryEmbedding = await this.embeddingService.embed(query);

      // Build dynamic filter conditions
      const conditions: string[] = [
        'organization_id = $2::uuid',
        'embedding_vector IS NOT NULL',
        '1 - (embedding_vector <=> $1::vector) >= $3',
      ];
      const params: unknown[] = [
        `[${queryEmbedding.join(',')}]`,
        organizationId,
        opts.minSimilarity,
      ];
      let paramIndex = 4;

      if (filters.sourceTypes?.length) {
        conditions.push(`source_type = ANY($${paramIndex}::varchar[])`);
        params.push(filters.sourceTypes);
        paramIndex++;
      }

      if (filters.dateRange?.start) {
        conditions.push(`created_at >= $${paramIndex}::timestamptz`);
        params.push(filters.dateRange.start.toISOString());
        paramIndex++;
      }

      if (filters.dateRange?.end) {
        conditions.push(`created_at <= $${paramIndex}::timestamptz`);
        params.push(filters.dateRange.end.toISOString());
        paramIndex++;
      }

      if (filters.authors?.length) {
        conditions.push(`metadata->>'author' = ANY($${paramIndex}::varchar[])`);
        params.push(filters.authors);
        paramIndex++;
      }

      params.push(opts.limit);

      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        source_type: string;
        source_id: string;
        source_url: string | null;
        title: string;
        content: string;
        chunk_index: number;
        metadata: Record<string, unknown>;
        similarity: number;
      }>>(
        `
        SELECT
          id,
          source_type,
          source_id,
          source_url,
          title,
          content,
          chunk_index,
          metadata,
          1 - (embedding_vector <=> $1::vector) as similarity
        FROM document_embeddings
        WHERE ${conditions.join(' AND ')}
        ORDER BY embedding_vector <=> $1::vector
        LIMIT $${paramIndex}
        `,
        ...params
      );

      const duration = Date.now() - startTime;
      logger.info('Filtered search completed', {
        organizationId,
        query: query.slice(0, 100),
        filters,
        resultsCount: results.length,
        duration,
      });

      return results.map(r => ({
        documentId: r.id,
        sourceType: r.source_type,
        sourceId: r.source_id,
        sourceUrl: r.source_url || undefined,
        title: r.title,
        content: r.content,
        similarity: r.similarity,
        chunkIndex: r.chunk_index,
        metadata: opts.includeMetadata ? r.metadata : {},
      }));
    } catch (error) {
      logger.error('Filtered search failed', {
        organizationId,
        query: query.slice(0, 100),
        filters,
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// Singleton instance
let semanticRetriever: SemanticRetriever | null = null;

export function getSemanticRetriever(): SemanticRetriever {
  if (!semanticRetriever) {
    semanticRetriever = new SemanticRetriever();
  }
  return semanticRetriever;
}

export function createSemanticRetriever(embeddingService?: EmbeddingService): SemanticRetriever {
  return new SemanticRetriever(embeddingService);
}
