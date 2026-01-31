-- CreateTable: Search Analytics
-- Tracks search queries, results, and user feedback

CREATE TABLE "search_analytics" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_result" TEXT,
    "clicked_source" TEXT,
    "ai_answer_useful" BOOLEAN,
    "ai_answer_generated" BOOLEAN NOT NULL DEFAULT false,
    "response_time_ms" INTEGER,
    "sources_searched" TEXT[],
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_analytics_organization_id_idx" ON "search_analytics"("organization_id");
CREATE INDEX "search_analytics_user_id_idx" ON "search_analytics"("user_id");
CREATE INDEX "search_analytics_created_at_idx" ON "search_analytics"("created_at");
CREATE INDEX "search_analytics_query_idx" ON "search_analytics"("query");

-- AddForeignKey
ALTER TABLE "search_analytics" ADD CONSTRAINT "search_analytics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_analytics" ADD CONSTRAINT "search_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
