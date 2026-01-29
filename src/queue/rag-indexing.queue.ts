import { BaseQueue } from "./base.queue";

export type RAGIndexingJobType =
  | "index_single"
  | "index_batch"
  | "reindex_if_changed"
  | "remove_document"
  | "full_reindex";

export interface RAGDocument {
  sourceType: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RAGIndexingSingleData {
  jobType: "index_single";
  organizationId: string;
  document: RAGDocument;
  userId: string;
}

export interface RAGIndexingBatchData {
  jobType: "index_batch";
  organizationId: string;
  documents: RAGDocument[];
  userId: string;
  batchId?: string;
}

export interface RAGIndexingReindexIfChangedData {
  jobType: "reindex_if_changed";
  organizationId: string;
  document: RAGDocument;
  userId: string;
}

export interface RAGIndexingRemoveData {
  jobType: "remove_document";
  organizationId: string;
  sourceType: string;
  sourceId: string;
  userId: string;
}

export interface RAGIndexingFullReindexData {
  jobType: "full_reindex";
  organizationId: string;
  documents: RAGDocument[];
  userId: string;
}

export type RAGIndexingData =
  | RAGIndexingSingleData
  | RAGIndexingBatchData
  | RAGIndexingReindexIfChangedData
  | RAGIndexingRemoveData
  | RAGIndexingFullReindexData;

export class RAGIndexingQueue extends BaseQueue<RAGIndexingData> {
  constructor() {
    super({
      name: "rag-indexing",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
      rateLimiter: {
        max: 30,
        duration: 60000,
      },
    });
  }

  async indexDocument(
    organizationId: string,
    document: RAGDocument,
    userId: string
  ): Promise<string> {
    const job = await this.add("index-document", {
      jobType: "index_single",
      organizationId,
      document,
      userId,
    });
    return job.id || "";
  }

  async indexBatch(
    organizationId: string,
    documents: RAGDocument[],
    userId: string,
    batchId?: string
  ): Promise<string> {
    const job = await this.add("index-batch", {
      jobType: "index_batch",
      organizationId,
      documents,
      userId,
      batchId,
    });
    return job.id || "";
  }

  async reindexIfChanged(
    organizationId: string,
    document: RAGDocument,
    userId: string
  ): Promise<string> {
    const job = await this.add("reindex-if-changed", {
      jobType: "reindex_if_changed",
      organizationId,
      document,
      userId,
    });
    return job.id || "";
  }

  async removeDocument(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    userId: string
  ): Promise<string> {
    const job = await this.add("remove-document", {
      jobType: "remove_document",
      organizationId,
      sourceType,
      sourceId,
      userId,
    });
    return job.id || "";
  }

  async fullReindex(
    organizationId: string,
    documents: RAGDocument[],
    userId: string
  ): Promise<string> {
    const job = await this.add(
      "full-reindex",
      {
        jobType: "full_reindex",
        organizationId,
        documents,
        userId,
      },
      {
        attempts: 2,
        timeout: 3600000, // 1 hour timeout for full reindex
      }
    );
    return job.id || "";
  }
}

export const ragIndexingQueue = new RAGIndexingQueue();
