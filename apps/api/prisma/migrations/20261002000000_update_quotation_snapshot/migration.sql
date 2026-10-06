-- AlterTable
ALTER TABLE "quotations" ADD COLUMN "parent_name" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "parent_phone" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "parent_email" TEXT,
ADD COLUMN "quotation_notes" TEXT;

-- AlterTable
ALTER TABLE "quotation_line_items" ADD COLUMN "curriculum_name" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "grade_name" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "pricing_source" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable (remove default after adding)
ALTER TABLE "quotations" ALTER COLUMN "parent_name" DROP DEFAULT,
ALTER COLUMN "parent_phone" DROP DEFAULT;

ALTER TABLE "quotation_line_items" ALTER COLUMN "curriculum_name" DROP DEFAULT,
ALTER COLUMN "grade_name" DROP DEFAULT,
ALTER COLUMN "pricing_source" DROP DEFAULT;
