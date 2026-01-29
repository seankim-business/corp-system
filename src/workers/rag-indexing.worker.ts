import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import {
  RAGIndexingData,
  RAGIndexingSingleData,
  RAGIndexingBatchData,
  RAGIndexingReindexIfChangedData,
  RAGIndexingRemoveData,
  RAGIndexingFullReindexData,
} from "../queue/rag-indexing.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { runWithContext } from "../utils/async-context";
import { emitOrgEvent } from "../services/sse-service";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { getDocumentIndexer } from "../services/rag/indexer";
import type { IndexableDocument, IndexResult } from "../services/rag/indexer";

export class RAGIndexingWorker extends BaseWorker<RAGIndexingData> {
  constructor() {
    super("rag-indexing", {
      concurrency: 5,
      lockDuration: 600000, // 10 minutes
      stalledInterval: 300000, // 5 minutes
      maxStalledCount: 2,
    });
  }

  async process(job: Job<RAGIndexingData>): Promise<void> {
    const { organizationId, userId } = job.data;

    return runWithContext({ organizationId, userId }, () => this.processWithContext(job));
  }

  private async processWithContext(job: Job<RAGIndexingData>): Promise<void> {
    const { jobType, organizationId, userId } = job.data;

    const startTime = Date.now();

    await job.updateProgress(PROGRESS_PERCENTAGES.STARTED);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.STARTED, PROGRESS_PERCENTAGES.STARTED, {
      jobType,
      organizationId,
    });

    logger.info("Processing RAG indexing job", {
      jobId: job.id,
      jobType,
      organizationId,
      userId,
    });

    try {
      await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.VALIDATED,
        PROGRESS_PERCENTAGES.VALIDATED,
        {
          jobType,
          action: "preparing_indexer",
        }
      );

      let result: any;

      switch (jobType) {
        case "index_single":
          result = await this.handleIndexSingle(job, job.data as RAGIndexingSingleData);
          break;

        case "index_batch":
          result = await this.handleIndexBatch(job, job.data as RAGIndexingBatchData);
          break;

        case "reindex_if_changed":
          result = await this.handleReindexIfChanged(
            job,
            job.data as RAGIndexingReindexIfChangedData
          );
          break;

        case "remove_document":
          result = await this.handleRemoveDocument(job, job.data as RAGIndexingRemoveData);
          break;

        case "full_reindex":
          result = await this.handleFullReindex(job, job.data as RAGIndexingFullReindexData);
          break;

        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      await job.updateProgress(PROGRESS_PERCENTAGES.FINALIZING);
      await emitJobProgress(
        job.id || "",
        PROGRESS_STAGES.FINALIZING,
        PROGRESS_PERCENTAGES.FINALIZING,
        {
          jobType,
          action: "emitting_events",
        }
      );

      const duration = Date.now() - startTime;

      metrics.increment("rag_indexing.completed", { jobType });
      metrics.histogram("rag_indexing.duration_ms", duration, { jobType });

      emitOrgEvent(organizationId, "rag_indexing.completed", {
        jobId: job.id,
        jobType,
        duration,
        result,
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);
      await emitJobProgress(job.id || "", PROGRESS_STAGES.COMPLETED, PROGRESS_PERCENTAGES.COMPLETED, {
        jobType,
        duration,
        status: "success",
        result,
      });

      logger.info("RAG indexing job completed", {
        jobId: job.id,
        jobType,
        duration,
        result,
      });
    } catch (error: any) {
      logger.error("RAG indexing job failed", {
        jobId: job.id,
        jobType,
        error: error.message,
      });

      await emitJobProgress(job.id || "", PROGRESS_STAGES.FAILED, 0, {
        jobType,
        error: error.message,
      });

      metrics.increment("rag_indexing.failed", { jobType });

      emitOrgEvent(organizationId, "rag_indexing.failed", {
        jobId: job.id,
        jobType,
        error: error.message,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "rag-indexing",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: error.message,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }

  private async handleIndexSingle(
    job: Job<RAGIndexingData>,
    data: RAGIndexingSingleData
  ): Promise<IndexResult> {
    const { organizationId, document } = data;
    const indexer = getDocumentIndexer();

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.PROCESSING, PROGRESS_PERCENTAGES.PROCESSING, {
      action: "indexing_document",
      sourceType: document.sourceType,
      sourceId: document.sourceId,
    });

    logger.debug("Indexing single document", {
      organizationId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      title: document.title,
    });

    const indexableDoc: IndexableDocument = {
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      sourceUrl: document.sourceUrl,
      title: document.title,
      content: document.content,
      metadata: document.metadata,
    };

    const result = await indexer.indexDocument(organizationId, indexableDoc);

    logger.info("Document indexed successfully", {
      organizationId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      chunksIndexed: result.chunksIndexed,
    });

    return result;
  }

  private async handleIndexBatch(
    job: Job<RAGIndexingData>,
    data: RAGIndexingBatchData
  ): Promise<IndexResult[]> {
    const { organizationId, documents, batchId } = data;
    const indexer = getDocumentIndexer();

    logger.info("Starting batch indexing", {
      organizationId,
      batchId,
      documentCount: documents.length,
    });

    const results: IndexResult[] = [];
    const totalDocs = documents.length;

    for (let i = 0; i < totalDocs; i++) {
      const doc = documents[i];
      const progressPercent =
        PROGRESS_PERCENTAGES.PROCESSING +
        ((PROGRESS_PERCENTAGES.FINALIZING - PROGRESS_PERCENTAGES.PROCESSING) * (i + 1)) / totalDocs;

      await job.updateProgress(progressPercent);
      await emitJobProgress(job.id || "", PROGRESS_STAGES.PROCESSING, progressPercent, {
        action: "indexing_batch",
        current: i + 1,
        total: totalDocs,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
      });

      logger.debug(`Indexing document ${i + 1}/${totalDocs}`, {
        organizationId,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
      });

      const indexableDoc: IndexableDocument = {
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        sourceUrl: doc.sourceUrl,
        title: doc.title,
        content: doc.content,
        metadata: doc.metadata,
      };

      const result = await indexer.indexDocument(organizationId, indexableDoc);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info("Batch indexing completed", {
      organizationId,
      batchId,
      total: totalDocs,
      successful,
      failed,
    });

    return results;
  }

  private async handleReindexIfChanged(
    job: Job<RAGIndexingData>,
    data: RAGIndexingReindexIfChangedData
  ): Promise<{ reindexed: boolean; result?: IndexResult }> {
    const { organizationId, document } = data;
    const indexer = getDocumentIndexer();

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.PROCESSING, PROGRESS_PERCENTAGES.PROCESSING, {
      action: "checking_changes",
      sourceType: document.sourceType,
      sourceId: document.sourceId,
    });

    logger.debug("Checking if document needs reindexing", {
      organizationId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
    });

    const indexableDoc: IndexableDocument = {
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      sourceUrl: document.sourceUrl,
      title: document.title,
      content: document.content,
      metadata: document.metadata,
    };

    const result = await indexer.reindexIfChanged(organizationId, indexableDoc);

    logger.info("Reindex check completed", {
      organizationId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      reindexed: result.reindexed,
    });

    return result;
  }

  private async handleRemoveDocument(
    job: Job<RAGIndexingData>,
    data: RAGIndexingRemoveData
  ): Promise<{ chunksRemoved: number }> {
    const { organizationId, sourceType, sourceId } = data;
    const indexer = getDocumentIndexer();

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.PROCESSING, PROGRESS_PERCENTAGES.PROCESSING, {
      action: "removing_document",
      sourceType,
      sourceId,
    });

    logger.debug("Removing document from index", {
      organizationId,
      sourceType,
      sourceId,
    });

    const chunksRemoved = await indexer.removeDocument(organizationId, sourceType, sourceId);

    logger.info("Document removed from index", {
      organizationId,
      sourceType,
      sourceId,
      chunksRemoved,
    });

    return { chunksRemoved };
  }

  private async handleFullReindex(
    job: Job<RAGIndexingData>,
    data: RAGIndexingFullReindexData
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: IndexResult[];
  }> {
    const { organizationId, documents } = data;
    const indexer = getDocumentIndexer();

    logger.warn("Starting FULL reindex - will clear all existing embeddings", {
      organizationId,
      documentCount: documents.length,
    });

    await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);
    await emitJobProgress(job.id || "", PROGRESS_STAGES.PROCESSING, PROGRESS_PERCENTAGES.PROCESSING, {
      action: "clearing_index",
      documentCount: documents.length,
    });

    const indexableDocs: IndexableDocument[] = documents.map((doc) => ({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      sourceUrl: doc.sourceUrl,
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata,
    }));

    const result = await indexer.fullReindex(organizationId, indexableDocs);

    logger.info("Full reindex completed", {
      organizationId,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
    });

    return result;
  }
}

export const ragIndexingWorker = new RAGIndexingWorker();
