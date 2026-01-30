-- Add megaAppConfig field to MarketplaceExtension for MegaApp module integration
ALTER TABLE "marketplace_extensions" ADD COLUMN "mega_app_config" JSONB;

-- Add index for efficient querying of MegaApp modules
CREATE INDEX "marketplace_extensions_mega_app_config_idx" ON "marketplace_extensions"("mega_app_config") WHERE "mega_app_config" IS NOT NULL;

-- Add comment documenting the field
COMMENT ON COLUMN "marketplace_extensions"."mega_app_config" IS 'MegaApp module configuration including moduleId, schemas, executorType, and UI components';
