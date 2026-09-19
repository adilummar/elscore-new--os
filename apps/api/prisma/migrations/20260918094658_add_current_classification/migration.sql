-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "current_classification" "ContactClassification";

-- CreateIndex
CREATE INDEX "leads_current_classification_idx" ON "leads"("current_classification");
