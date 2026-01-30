-- Add API key columns to OrganizationMarketplaceSettings
ALTER TABLE "organization_marketplace_settings" 
ADD COLUMN IF NOT EXISTS "smithery_api_key" TEXT,
ADD COLUMN IF NOT EXISTS "civitai_api_key" TEXT,
ADD COLUMN IF NOT EXISTS "langchain_api_key" TEXT;
