/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for semantic search and document indexing
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { logger } from '../utils/logger';
import { getRAGService } from '../services/rag';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).default(10),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  sourceTypes: z.array(z.string()).optional(),
  useHybrid: z.boolean().default(false),
  keywordWeight: z.number().min(0).max(1).default(0.3),
});

const ContextRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  searchLimit: z.number().int().min(1).max(50).default(10),
  rerankTopK: z.number().int().min(1).max(20).default(5),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  sourceTypes: z.array(z.string()).optional(),
  maxTokens: z.number().int().min(100).max(8000).default(2000),
  includeSource: z.boolean().default(true),
});

const IndexRequestSchema = z.object({
  sourceType: z.string().min(1).max(50),
  sourceId: z.string().min(1).max(255),
  sourceUrl: z.string().url().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

const BatchIndexRequestSchema = z.object({
  documents: z.array(IndexRequestSchema).min(1).max(100),
});

const RemoveDocumentSchema = z.object({
  sourceType: z.string().min(1).max(50),
  sourceId: z.string().min(1).max(255),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/rag/search
 * Semantic search for relevant documents
 */
router.post(
  '/search',
  requireAuth,
  validate({ body: SearchRequestSchema }),
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { query, limit, minSimilarity, sourceTypes, useHybrid, keywordWeight } = req.body;
    const startTime = Date.now();

    try {
      const ragService = getRAGService();

      let results;
      if (useHybrid) {
        results = await ragService.hybridSearch(organizationId, query, {
          limit,
          minSimilarity,
          sourceTypes,
          keywordWeight,
        });
      } else {
        results = await ragService.search(organizationId, query, {
          limit,
          minSimilarity,
          sourceTypes,
        });
      }

      const duration = Date.now() - startTime;
      logger.info('RAG search completed', {
        organizationId,
        userId: req.user!.id,
        query: query.slice(0, 100),
        resultCount: results.length,
        useHybrid,
        duration,
      });

      return res.json({
        results,
        metadata: {
          query,
          totalResults: results.length,
          searchType: useHybrid ? 'hybrid' : 'semantic',
          duration,
        },
      });
    } catch (error) {
      logger.error(
        'RAG search failed',
        {
          organizationId,
          userId: req.user!.id,
          query: query.slice(0, 100),
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/rag/context
 * Get RAG context for a query (full pipeline: search, rerank, build context)
 */
router.post(
  '/context',
  requireAuth,
  validate({ body: ContextRequestSchema }),
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { query, searchLimit, rerankTopK, minSimilarity, sourceTypes, maxTokens, includeSource } = req.body;

    try {
      const ragService = getRAGService();

      const contextResult = await ragService.getContext(organizationId, query, {
        searchLimit,
        rerankTopK,
        minSimilarity,
        sourceTypes,
        maxTokens,
        includeSource,
      });

      return res.json({
        context: contextResult.context,
        sources: contextResult.sources,
        metadata: {
          query,
          sourcesCount: contextResult.sources.length,
        },
      });
    } catch (error) {
      logger.error(
        'RAG context generation failed',
        {
          organizationId,
          userId: req.user!.id,
          query: query.slice(0, 100),
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Context generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/rag/index
 * Index a single document
 */
router.post(
  '/index',
  requireAuth,
  validate({ body: IndexRequestSchema }),
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const doc = req.body;

    try {
      const ragService = getRAGService();
      const result = await ragService.indexDocument(organizationId, doc);

      logger.info('Document indexed via API', {
        organizationId,
        userId: req.user!.id,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        success: result.success,
      });

      if (!result.success) {
        return res.status(400).json({
          error: 'Indexing failed',
          message: result.error,
        });
      }

      return res.json({
        success: true,
        documentId: result.documentId,
        chunksIndexed: result.chunksIndexed,
      });
    } catch (error) {
      logger.error(
        'Document indexing failed',
        {
          organizationId,
          userId: req.user!.id,
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Indexing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/rag/index/batch
 * Index multiple documents
 */
router.post(
  '/index/batch',
  requireAuth,
  validate({ body: BatchIndexRequestSchema }),
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { documents } = req.body;

    try {
      const ragService = getRAGService();
      const results = await ragService.indexDocuments(organizationId, documents);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.info('Batch indexing completed', {
        organizationId,
        userId: req.user!.id,
        total: documents.length,
        successful,
        failed,
      });

      return res.json({
        total: documents.length,
        successful,
        failed,
        results,
      });
    } catch (error) {
      logger.error(
        'Batch indexing failed',
        {
          organizationId,
          userId: req.user!.id,
          documentCount: documents.length,
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Batch indexing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/rag/stats
 * Get index statistics for the organization
 */
router.get(
  '/stats',
  requireAuth,
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;

    try {
      const ragService = getRAGService();
      const stats = await ragService.getStats(organizationId);

      return res.json(stats);
    } catch (error) {
      logger.error(
        'Failed to get RAG stats',
        {
          organizationId,
          userId: req.user!.id,
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Failed to get statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/rag/index/:sourceType/:sourceId
 * Remove a document from the index
 */
router.delete(
  '/index/:sourceType/:sourceId',
  requireAuth,
  validate({ params: RemoveDocumentSchema }),
  async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const sourceType = req.params.sourceType as string;
    const sourceId = req.params.sourceId as string;

    try {
      const ragService = getRAGService();
      const deletedCount = await ragService.removeDocument(organizationId, sourceType, sourceId);

      logger.info('Document removed from index', {
        organizationId,
        userId: req.user!.id,
        sourceType,
        sourceId,
        deletedCount,
      });

      return res.json({
        success: true,
        deletedChunks: deletedCount,
      });
    } catch (error) {
      logger.error(
        'Failed to remove document',
        {
          organizationId,
          userId: req.user!.id,
          sourceType,
          sourceId,
        },
        error instanceof Error ? error : new Error(String(error))
      );

      return res.status(500).json({
        error: 'Failed to remove document',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
