/*
  Warnings:

  - You are about to drop the column `created_by` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `enabled` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `rate_limit` on the `api_keys` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "created_by",
DROP COLUMN "enabled",
DROP COLUMN "rate_limit",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rate_limit_tier" VARCHAR(50) NOT NULL DEFAULT 'standard',
ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "marketplace_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(100),
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marketplace_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_reviews" (
    "id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "content" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "unhelpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extension_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_helpful_votes" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_helpful" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_payouts" (
    "id" UUID NOT NULL,
    "publisher_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'usd',
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "payment_method" VARCHAR(50),
    "transaction_id" VARCHAR(255),
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "publisher_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_captures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "execution_id" UUID,
    "slack_workspace_id" VARCHAR(50),
    "slack_channel_id" VARCHAR(50),
    "slack_thread_ts" VARCHAR(50),
    "slack_message_ts" VARCHAR(50) NOT NULL,
    "feedback_type" VARCHAR(50) NOT NULL,
    "reaction" VARCHAR(50),
    "original_message" TEXT NOT NULL,
    "correction" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_captures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_categories_slug_key" ON "marketplace_categories"("slug");

-- CreateIndex
CREATE INDEX "marketplace_categories_parent_id_idx" ON "marketplace_categories"("parent_id");

-- CreateIndex
CREATE INDEX "marketplace_categories_sort_order_idx" ON "marketplace_categories"("sort_order");

-- CreateIndex
CREATE INDEX "extension_reviews_extension_id_idx" ON "extension_reviews"("extension_id");

-- CreateIndex
CREATE INDEX "extension_reviews_user_id_idx" ON "extension_reviews"("user_id");

-- CreateIndex
CREATE INDEX "extension_reviews_rating_idx" ON "extension_reviews"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "extension_reviews_extension_id_user_id_key" ON "extension_reviews"("extension_id", "user_id");

-- CreateIndex
CREATE INDEX "review_helpful_votes_review_id_idx" ON "review_helpful_votes"("review_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_review_id_user_id_key" ON "review_helpful_votes"("review_id", "user_id");

-- CreateIndex
CREATE INDEX "publisher_payouts_publisher_id_idx" ON "publisher_payouts"("publisher_id");

-- CreateIndex
CREATE INDEX "publisher_payouts_status_idx" ON "publisher_payouts"("status");

-- CreateIndex
CREATE INDEX "publisher_payouts_processed_at_idx" ON "publisher_payouts"("processed_at");

-- CreateIndex
CREATE INDEX "feedback_captures_organization_id_created_at_idx" ON "feedback_captures"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feedback_captures_execution_id_idx" ON "feedback_captures"("execution_id");

-- CreateIndex
CREATE INDEX "feedback_captures_slack_workspace_id_slack_message_ts_idx" ON "feedback_captures"("slack_workspace_id", "slack_message_ts");

-- CreateIndex
CREATE INDEX "feedback_captures_feedback_type_idx" ON "feedback_captures"("feedback_type");

-- CreateIndex
CREATE INDEX "feedback_captures_user_id_idx" ON "feedback_captures"("user_id");

-- AddForeignKey
ALTER TABLE "marketplace_categories" ADD CONSTRAINT "marketplace_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "marketplace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "extension_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_payouts" ADD CONSTRAINT "publisher_payouts_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "extension_publishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_captures" ADD CONSTRAINT "feedback_captures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_captures" ADD CONSTRAINT "feedback_captures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
