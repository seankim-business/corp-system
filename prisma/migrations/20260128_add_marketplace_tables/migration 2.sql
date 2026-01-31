-- CreateTable
CREATE TABLE "publishers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "stripe_account_id" VARCHAR(255),
    "payout_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_extensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "long_description" TEXT NOT NULL,
    "publisher_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricing" VARCHAR(50) NOT NULL DEFAULT 'free',
    "price_amount" INTEGER,
    "price_currency" VARCHAR(10),
    "price_interval" VARCHAR(20),
    "icon" TEXT,
    "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demo_url" TEXT,
    "repository_url" TEXT,
    "documentation_url" TEXT,
    "nubabel_version" VARCHAR(50) NOT NULL DEFAULT '>=1.0.0',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "active_installs" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featured_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "marketplace_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extension_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "changelog" TEXT,
    "package_url" TEXT NOT NULL,
    "package_size" INTEGER,
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "checksum" VARCHAR(128),
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extension_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" VARCHAR(255) NOT NULL,
    "organization_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "moderated_at" TIMESTAMPTZ(6),
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "publisher_response" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_helpful_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_installs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extension_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "installed_by" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "uninstalled_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "extension_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extension_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchased_by" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "payment_type" VARCHAR(50) NOT NULL,
    "stripe_payment_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "extension_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publisher_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "stripe_transfer_id" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "publisher_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "marketplace_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publishers_user_id_key" ON "publishers"("user_id");
CREATE UNIQUE INDEX "publishers_slug_key" ON "publishers"("slug");
CREATE INDEX "publishers_verified_idx" ON "publishers"("verified");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_extensions_slug_key" ON "marketplace_extensions"("slug");
CREATE INDEX "marketplace_extensions_publisher_id_idx" ON "marketplace_extensions"("publisher_id");
CREATE INDEX "marketplace_extensions_category_idx" ON "marketplace_extensions"("category");
CREATE INDEX "marketplace_extensions_status_idx" ON "marketplace_extensions"("status");
CREATE INDEX "marketplace_extensions_pricing_idx" ON "marketplace_extensions"("pricing");
CREATE INDEX "marketplace_extensions_featured_idx" ON "marketplace_extensions"("featured") WHERE featured = true;
CREATE INDEX "marketplace_extensions_downloads_idx" ON "marketplace_extensions"("downloads" DESC);
CREATE INDEX "marketplace_extensions_rating_idx" ON "marketplace_extensions"("rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "extension_versions_extension_id_version_key" ON "extension_versions"("extension_id", "version");
CREATE INDEX "extension_versions_extension_id_idx" ON "extension_versions"("extension_id");
CREATE INDEX "extension_versions_status_idx" ON "extension_versions"("status");

-- CreateIndex
CREATE INDEX "extension_reviews_extension_id_status_idx" ON "extension_reviews"("extension_id", "status");
CREATE INDEX "extension_reviews_user_id_idx" ON "extension_reviews"("user_id");
CREATE INDEX "extension_reviews_rating_idx" ON "extension_reviews"("rating");
CREATE UNIQUE INDEX "extension_reviews_extension_id_user_id_key" ON "extension_reviews"("extension_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_review_id_user_id_key" ON "review_helpful_votes"("review_id", "user_id");

-- CreateIndex
CREATE INDEX "extension_installs_extension_id_idx" ON "extension_installs"("extension_id");
CREATE INDEX "extension_installs_organization_id_idx" ON "extension_installs"("organization_id");
CREATE INDEX "extension_installs_status_idx" ON "extension_installs"("status");
CREATE UNIQUE INDEX "extension_installs_extension_id_organization_id_key" ON "extension_installs"("extension_id", "organization_id") WHERE status = 'active';

-- CreateIndex
CREATE INDEX "extension_purchases_extension_id_idx" ON "extension_purchases"("extension_id");
CREATE INDEX "extension_purchases_organization_id_idx" ON "extension_purchases"("organization_id");
CREATE INDEX "extension_purchases_status_idx" ON "extension_purchases"("status");

-- CreateIndex
CREATE INDEX "publisher_payouts_publisher_id_idx" ON "publisher_payouts"("publisher_id");
CREATE INDEX "publisher_payouts_status_idx" ON "publisher_payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_categories_slug_key" ON "marketplace_categories"("slug");

-- AddForeignKey
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_extensions" ADD CONSTRAINT "marketplace_extensions_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_versions" ADD CONSTRAINT "extension_versions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_reviews" ADD CONSTRAINT "extension_reviews_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_reviews" ADD CONSTRAINT "extension_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_reviews" ADD CONSTRAINT "extension_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "extension_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installs" ADD CONSTRAINT "extension_installs_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installs" ADD CONSTRAINT "extension_installs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "extension_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installs" ADD CONSTRAINT "extension_installs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_installs" ADD CONSTRAINT "extension_installs_installed_by_fkey" FOREIGN KEY ("installed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_purchases" ADD CONSTRAINT "extension_purchases_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "marketplace_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_purchases" ADD CONSTRAINT "extension_purchases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_purchases" ADD CONSTRAINT "extension_purchases_purchased_by_fkey" FOREIGN KEY ("purchased_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_payouts" ADD CONSTRAINT "publisher_payouts_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default categories
INSERT INTO "marketplace_categories" (slug, name, description, icon, sort_order) VALUES
('productivity', 'Productivity', 'Extensions that boost team productivity', 'zap', 1),
('integrations', 'Integrations', 'Connect with external services', 'plug', 2),
('analytics', 'Analytics', 'Data analysis and reporting tools', 'bar-chart', 3),
('automation', 'Automation', 'Workflow automation and scripting', 'cpu', 4),
('communication', 'Communication', 'Team communication and notifications', 'message-circle', 5),
('security', 'Security', 'Security and compliance tools', 'shield', 6),
('ai-ml', 'AI & ML', 'Artificial intelligence and machine learning', 'brain', 7),
('developer-tools', 'Developer Tools', 'Tools for developers', 'code', 8);
