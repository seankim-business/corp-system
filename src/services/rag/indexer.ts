/**
 * RAG Document Indexer Service
 * Indexes documents into the vector database for semantic search
 */

// NOTE: Requires DocumentEmbedding table in Prisma schema (see prisma/schema.prisma)
// import crypto from 'crypto';
// import { db as prisma } from '../../db/client';
import { logger } from '../../utils/logger';
// NOTE: Uncomment when DocumentEmbedding table added to schema
// import { getEmbeddingService, EmbeddingService } from './embeddings';
// import { getChunkSplitter, ChunkSplitter, ChunkOptions } from './chunk-splitter';
import type { EmbeddingService } from './embeddings';
import type { ChunkSplitter, ChunkOptions } from './chunk-splitter';

export interface IndexableDocument {
  sourceType: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface IndexResult {
  documentId: string;
  sourceId: string;
  chunksIndexed: number;
  success: boolean;
  error?: string;
}

export interface IndexStats {
  totalDocuments: number;
  totalChunks: number;
  bySourceType: Record<string, number>;
  lastIndexedAt: Date | null;
}

// NOTE: Uncomment when DocumentEmbedding table added to schema
// const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
//   maxChunkSize: 1000,
//   overlapSize: 200,
//   splitOn: 'paragraph',
// };

export class DocumentIndexer {
  // NOTE: Uncomment when DocumentEmbedding table added to schema
  // private embeddingService: EmbeddingService;
  // private chunkSplitter: ChunkSplitter;
  // private chunkOptions: ChunkOptions;

  constructor(_options?: {
    embeddingService?: EmbeddingService;
    chunkSplitter?: ChunkSplitter;
    chunkOptions?: Partial<ChunkOptions>;
  }) {
    // NOTE: Initialize when DocumentEmbedding table added to schema
    // this.embeddingService = options?.embeddingService || getEmbeddingService();
    // this.chunkSplitter = options?.chunkSplitter || getChunkSplitter();
    // this.chunkOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options?.chunkOptions };
  }

  // NOTE: Uncomment when DocumentEmbedding table added to schema
  // /**
  //  * Calculate content hash for change detection
  //  */
  // private hashContent(content: string): string {
  //   return crypto.createHash('sha256').update(content).digest('hex');
  // }

  /**
   * Index a single document
   */
  async indexDocument(
    organizationId: string,
    doc: IndexableDocument
  ): Promise<IndexResult> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('indexDocument stubbed - documentEmbedding model not implemented', {
      organizationId,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
    });

    return {
      documentId: '',
      sourceId: doc.sourceId,
      chunksIndexed: 0,
      success: false,
      error: 'documentEmbedding model not implemented',
    };
  }

  /**
   * Index multiple documents in batch
   */
  async indexBatch(
    organizationId: string,
    docs: IndexableDocument[]
  ): Promise<IndexResult[]> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('indexBatch stubbed - documentEmbedding model not implemented', {
      organizationId,
      documentCount: docs.length,
    });

    return docs.map(doc => ({
      documentId: '',
      sourceId: doc.sourceId,
      chunksIndexed: 0,
      success: false,
      error: 'documentEmbedding model not implemented',
    }));
  }

  /**
   * Reindex document only if content has changed
   */
  async reindexIfChanged(
    organizationId: string,
    doc: IndexableDocument
  ): Promise<{ reindexed: boolean; result?: IndexResult }> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('reindexIfChanged stubbed - documentEmbedding model not implemented', {
      organizationId,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
    });

    return { reindexed: false };
  }

  /**
   * Remove document from index
   */
  async removeDocument(
    organizationId: string,
    sourceType: string,
    sourceId: string
  ): Promise<number> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('removeDocument stubbed - documentEmbedding model not implemented', {
      organizationId,
      sourceType,
      sourceId,
    });

    return 0;
  }

  /**
   * Full reindex for organization (use with caution)
   */
  async fullReindex(
    organizationId: string,
    documents: IndexableDocument[]
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: IndexResult[];
  }> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('fullReindex stubbed - documentEmbedding model not implemented', {
      organizationId,
      documentCount: documents.length,
    });

    const results: IndexResult[] = documents.map(doc => ({
      documentId: '',
      sourceId: doc.sourceId,
      chunksIndexed: 0,
      success: false,
      error: 'documentEmbedding model not implemented',
    }));

    return {
      total: documents.length,
      successful: 0,
      failed: documents.length,
      results,
    };
  }

  /**
   * Get index statistics for organization
   */
  async getStats(organizationId: string): Promise<IndexStats> {
    // NOTE: Stubbed - requires DocumentEmbedding model in prisma/schema.prisma
    logger.warn('getStats stubbed - documentEmbedding model not implemented', {
      organizationId,
    });

    return {
      totalDocuments: 0,
      totalChunks: 0,
      bySourceType: {},
      lastIndexedAt: null,
    };
  }
}

// Singleton instance
let documentIndexer: DocumentIndexer | null = null;

export function getDocumentIndexer(): DocumentIndexer {
  if (!documentIndexer) {
    documentIndexer = new DocumentIndexer();
  }
  return documentIndexer;
}

export function createDocumentIndexer(options?: {
  embeddingService?: EmbeddingService;
  chunkSplitter?: ChunkSplitter;
  chunkOptions?: Partial<ChunkOptions>;
}): DocumentIndexer {
  return new DocumentIndexer(options);
}
