-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "document_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" VARCHAR(255) NOT NULL,
    "source_url" TEXT,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id")
);

-- Add vector column for pgvector (separate from Float[] for Prisma compatibility)
ALTER TABLE "document_embeddings" ADD COLUMN "embedding_vector" vector(1536);

-- CreateIndex for organization and source type filtering
CREATE INDEX "document_embeddings_organization_id_source_type_idx" ON "document_embeddings"("organization_id", "source_type");

-- CreateIndex for content hash (change detection)
CREATE INDEX "document_embeddings_content_hash_idx" ON "document_embeddings"("content_hash");

-- CreateIndex for organization and time-based queries
CREATE INDEX "document_embeddings_organization_id_created_at_idx" ON "document_embeddings"("organization_id", "created_at" DESC);

-- CreateIndex for vector similarity search using IVFFlat
-- Note: This index should be created AFTER inserting initial data for best performance
-- lists = sqrt(number_of_rows) is a good starting point, we use 100 as default
CREATE INDEX "document_embeddings_embedding_vector_idx" ON "document_embeddings"
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create function to sync embedding array to vector column
CREATE OR REPLACE FUNCTION sync_embedding_to_vector()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.embedding IS NOT NULL AND array_length(NEW.embedding, 1) = 1536 THEN
        NEW.embedding_vector := NEW.embedding::vector(1536);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-sync embedding on insert/update
CREATE TRIGGER sync_embedding_vector_trigger
    BEFORE INSERT OR UPDATE OF embedding ON document_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION sync_embedding_to_vector();
