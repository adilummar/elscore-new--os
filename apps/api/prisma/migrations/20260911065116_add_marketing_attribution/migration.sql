-- CreateTable
CREATE TABLE "marketing_attributions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "channel" TEXT,
    "campaign" TEXT,
    "external_campaign_id" TEXT,
    "external_lead_id" TEXT,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_attributions_lead_id_key" ON "marketing_attributions"("lead_id");

-- AddForeignKey
ALTER TABLE "marketing_attributions" ADD CONSTRAINT "marketing_attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
