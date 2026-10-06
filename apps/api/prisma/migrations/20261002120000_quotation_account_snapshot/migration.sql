-- Additive: singleton FinanceSetting code + quotation-visible account details.
-- Snapshots the same account fields onto quotations for historical immutability.
-- Does not drop tables, reset sequences, or alter existing quotation totals.

ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT;
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "account_number" TEXT;
ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "iban" TEXT;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM "finance_settings"
  WHERE "code" IS NULL
)
UPDATE "finance_settings" AS fs
SET "code" = CASE WHEN ranked.rn = 1 THEN 'DEFAULT' ELSE 'LEGACY-' || fs.id END
FROM ranked
WHERE fs.id = ranked.id;

ALTER TABLE "finance_settings" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "finance_settings_code_key" ON "finance_settings"("code");

ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "account_number" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "iban" TEXT;
