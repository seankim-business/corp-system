-- CreateTable: API Keys
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "scopes" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "rate_limit_tier" VARCHAR(20) NOT NULL DEFAULT 'free',
    "requests_per_minute" INTEGER NOT NULL DEFAULT 60,
    "requests_per_day" INTEGER NOT NULL DEFAULT 1000,
    "last_used_at" TIMESTAMPTZ(6),
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Public Webhooks
CREATE TABLE "public_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "secret" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure" TIMESTAMPTZ(6),
    "last_success" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Webhook Deliveries
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "webhook_id" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "response_status" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: API Keys
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
CREATE INDEX "api_keys_status_idx" ON "api_keys"("status");
CREATE INDEX "api_keys_created_at_idx" ON "api_keys"("created_at" DESC);

-- CreateIndex: Public Webhooks
CREATE INDEX "public_webhooks_organization_id_idx" ON "public_webhooks"("organization_id");
CREATE INDEX "public_webhooks_status_idx" ON "public_webhooks"("status");
CREATE INDEX "public_webhooks_organization_id_status_idx" ON "public_webhooks"("organization_id", "status");

-- CreateIndex: Webhook Deliveries
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");
CREATE INDEX "webhook_deliveries_created_at_idx" ON "webhook_deliveries"("created_at" DESC);

-- AddForeignKey: Webhook Deliveries -> Public Webhooks
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
