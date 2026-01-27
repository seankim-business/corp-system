-- Add organization budget tracking fields
-- Rollback:
--   ALTER TABLE "organizations" DROP COLUMN "budget_reset_at";
--   ALTER TABLE "organizations" DROP COLUMN "current_month_spend_cents";
--   ALTER TABLE "organizations" DROP COLUMN "monthly_budget_cents";

ALTER TABLE "organizations"
  ADD COLUMN "monthly_budget_cents" INTEGER,
  ADD COLUMN "current_month_spend_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budget_reset_at" TIMESTAMPTZ(6);
