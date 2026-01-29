-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "scope_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "importance" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "source_type" VARCHAR(50) NOT NULL DEFAULT 'explicit',
    "source_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_memories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_name" VARCHAR(255) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_mentioned" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entity_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memories_organization_id_scope_scope_id_key_key" ON "memories"("organization_id", "scope", "scope_id", "key");

-- CreateIndex
CREATE INDEX "memories_organization_id_scope_scope_id_idx" ON "memories"("organization_id", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "memories_organization_id_type_idx" ON "memories"("organization_id", "type");

-- CreateIndex
CREATE INDEX "memories_last_accessed_at_idx" ON "memories"("last_accessed_at");

-- CreateIndex
CREATE INDEX "memories_expires_at_idx" ON "memories"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "entity_memories_organization_id_entity_type_entity_name_key" ON "entity_memories"("organization_id", "entity_type", "entity_name");

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_entity_type_idx" ON "entity_memories"("organization_id", "entity_type");

-- CreateIndex
CREATE INDEX "entity_memories_organization_id_last_mentioned_idx" ON "entity_memories"("organization_id", "last_mentioned" DESC);
