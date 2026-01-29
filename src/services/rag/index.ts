/**
 * RAG (Retrieval Augmented Generation) Service
 * Main entry point for RAG functionality
 */

// Export all individual services
export {
  EmbeddingService,
  OpenAIEmbeddings,
  getEmbeddingService,
  createEmbeddingService,
} from './embeddings';

export {
  ChunkOptions,
  Chunk,
  ChunkSplitter,
  getChunkSplitter,
  createChunkSplitter,
} from './chunk-splitter';

export {
  IndexableDocument,
  IndexResult,
  IndexStats,
  DocumentIndexer,
  getDocumentIndexer,
  createDocumentIndexer,
} from './indexer';

export {
  RetrievalOptions,
  RetrievalResult,
  HybridSearchOptions,
  SearchFilters,
  SemanticRetriever,
  getSemanticRetriever,
  createSemanticRetriever,
} from './retriever';

export {
  RerankerOptions,
  Reranker,
  getReranker,
  createReranker,
} from './reranker';

export {
  ContextOptions,
  ContextWithSources,
  Source,
  ContextBuilder,
  getContextBuilder,
  createContextBuilder,
} from './context-builder';

import { logger } from '../../utils/logger';
import { getDocumentIndexer, DocumentIndexer, IndexableDocument, IndexResult, IndexStats } from './indexer';
import { getSemanticRetriever, SemanticRetriever, RetrievalResult, RetrievalOptions, SearchFilters } from './retriever';
import { getReranker, Reranker } from './reranker';
import { getContextBuilder, ContextBuilder, ContextWithSources } from './context-builder';

/**
 * Unified RAG Service
 * Provides a simplified interface for common RAG operations
 */
export class RAGService {
  private indexer: DocumentIndexer;
  private retriever: SemanticRetriever;
  private reranker: Reranker;
  private contextBuilder: ContextBuilder;

  constructor(options?: {
    indexer?: DocumentIndexer;
    retriever?: SemanticRetriever;
    reranker?: Reranker;
    contextBuilder?: ContextBuilder;
  }) {
    this.indexer = options?.indexer || getDocumentIndexer();
    this.retriever = options?.retriever || getSemanticRetriever();
    this.reranker = options?.reranker || getReranker();
    this.contextBuilder = options?.contextBuilder || getContextBuilder();
  }

  /**
   * Index a document for RAG retrieval
   */
  async indexDocument(
    organizationId: string,
    doc: IndexableDocument
  ): Promise<IndexResult> {
    return this.indexer.indexDocument(organizationId, doc);
  }

  /**
   * Index multiple documents
   */
  async indexDocuments(
    organizationId: string,
    docs: IndexableDocument[]
  ): Promise<IndexResult[]> {
    return this.indexer.indexBatch(organizationId, docs);
  }

  /**
   * Smart reindex - only reindex if content changed
   */
  async reindexIfChanged(
    organizationId: string,
    doc: IndexableDocument
  ): Promise<{ reindexed: boolean; result?: IndexResult }> {
    return this.indexer.reindexIfChanged(organizationId, doc);
  }

  /**
   * Remove a document from the index
   */
  async removeDocument(
    organizationId: string,
    sourceType: string,
    sourceId: string
  ): Promise<number> {
    return this.indexer.removeDocument(organizationId, sourceType, sourceId);
  }

  /**
   * Get index statistics
   */
  async getStats(organizationId: string): Promise<IndexStats> {
    return this.indexer.getStats(organizationId);
  }

  /**
   * Search and retrieve relevant documents
   */
  async search(
    organizationId: string,
    query: string,
    options?: Partial<RetrievalOptions>
  ): Promise<RetrievalResult[]> {
    return this.retriever.search(organizationId, query, options);
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  async hybridSearch(
    organizationId: string,
    query: string,
    options?: Partial<RetrievalOptions & { keywordWeight: number }>
  ): Promise<RetrievalResult[]> {
    return this.retriever.hybridSearch(organizationId, query, options);
  }

  /**
   * Search with filters
   */
  async searchWithFilters(
    organizationId: string,
    query: string,
    filters: SearchFilters,
    options?: Partial<RetrievalOptions>
  ): Promise<RetrievalResult[]> {
    return this.retriever.searchWithFilters(organizationId, query, filters, options);
  }

  /**
   * Complete RAG pipeline: search, rerank, build context
   */
  async getContext(
    organizationId: string,
    query: string,
    options?: {
      searchLimit?: number;
      rerankTopK?: number;
      minSimilarity?: number;
      sourceTypes?: string[];
      maxTokens?: number;
      includeSource?: boolean;
    }
  ): Promise<ContextWithSources> {
    const startTime = Date.now();

    try {
      // Step 1: Retrieve relevant documents
      const searchResults = await this.retriever.search(organizationId, query, {
        limit: options?.searchLimit || 10,
        minSimilarity: options?.minSimilarity || 0.7,
        sourceTypes: options?.sourceTypes,
      });

      if (searchResults.length === 0) {
        logger.info('No relevant documents found for RAG context', {
          organizationId,
          query: query.slice(0, 100),
        });
        return { context: '', sources: [] };
      }

      // Step 2: Rerank results
      const rerankedResults = await this.reranker.rerank(
        query,
        searchResults,
        options?.rerankTopK || 5
      );

      // Step 3: Build context
      const contextResult = this.contextBuilder.buildContextWithSources(
        rerankedResults,
        {
          maxTokens: options?.maxTokens || 2000,
          includeSource: options?.includeSource ?? true,
          format: 'markdown',
        }
      );

      const duration = Date.now() - startTime;
      logger.info('RAG context built successfully', {
        organizationId,
        query: query.slice(0, 100),
        documentsRetrieved: searchResults.length,
        documentsUsed: rerankedResults.length,
        sourcesIncluded: contextResult.sources.length,
        duration,
      });

      return contextResult;
    } catch (error) {
      logger.error('Failed to build RAG context', {
        organizationId,
        query: query.slice(0, 100),
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get context using hybrid search
   */
  async getHybridContext(
    organizationId: string,
    query: string,
    options?: {
      searchLimit?: number;
      rerankTopK?: number;
      minSimilarity?: number;
      keywordWeight?: number;
      sourceTypes?: string[];
      maxTokens?: number;
      includeSource?: boolean;
    }
  ): Promise<ContextWithSources> {
    const startTime = Date.now();

    try {
      // Step 1: Hybrid search
      const searchResults = await this.retriever.hybridSearch(organizationId, query, {
        limit: options?.searchLimit || 10,
        minSimilarity: options?.minSimilarity || 0.6, // Lower threshold for hybrid
        sourceTypes: options?.sourceTypes,
        keywordWeight: options?.keywordWeight || 0.3,
      });

      if (searchResults.length === 0) {
        return { context: '', sources: [] };
      }

      // Step 2: Rerank
      const rerankedResults = await this.reranker.rerank(
        query,
        searchResults,
        options?.rerankTopK || 5
      );

      // Step 3: Build context
      const contextResult = this.contextBuilder.buildContextWithSources(
        rerankedResults,
        {
          maxTokens: options?.maxTokens || 2000,
          includeSource: options?.includeSource ?? true,
          format: 'markdown',
        }
      );

      const duration = Date.now() - startTime;
      logger.info('Hybrid RAG context built', {
        organizationId,
        query: query.slice(0, 100),
        documentsUsed: rerankedResults.length,
        duration,
      });

      return contextResult;
    } catch (error) {
      logger.error('Failed to build hybrid RAG context', {
        organizationId,
        query: query.slice(0, 100),
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// Singleton instance
let ragService: RAGService | null = null;

export function getRAGService(): RAGService {
  if (!ragService) {
    ragService = new RAGService();
  }
  return ragService;
}

export function createRAGService(options?: {
  indexer?: DocumentIndexer;
  retriever?: SemanticRetriever;
  reranker?: Reranker;
  contextBuilder?: ContextBuilder;
}): RAGService {
  return new RAGService(options);
}
