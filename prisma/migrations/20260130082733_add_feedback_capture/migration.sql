/*
  Warnings:

  - You are about to drop the column `is_active` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `rate_limit_tier` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the `extension_reviews` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `feedback_captures` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `marketplace_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `publisher_payouts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `review_helpful_votes` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `created_by` to the `api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "feedback_captures" DROP CONSTRAINT "feedback_captures_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "feedback_captures" DROP CONSTRAINT "feedback_captures_user_id_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_categories" DROP CONSTRAINT "marketplace_categories_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "publisher_payouts" DROP CONSTRAINT "publisher_payouts_publisher_id_fkey";

-- DropForeignKey
ALTER TABLE "review_helpful_votes" DROP CONSTRAINT "review_helpful_votes_review_id_fkey";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "is_active",
DROP COLUMN "rate_limit_tier",
DROP COLUMN "user_id",
ADD COLUMN     "created_by" UUID NOT NULL,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rate_limit" INTEGER NOT NULL DEFAULT 1000;

-- DropTable
DROP TABLE "extension_reviews";

-- DropTable
DROP TABLE "feedback_captures";

-- DropTable
DROP TABLE "marketplace_categories";

-- DropTable
DROP TABLE "publisher_payouts";

-- DropTable
DROP TABLE "review_helpful_votes";
