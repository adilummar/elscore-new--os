-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_interactions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_lead_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "campaign_name" TEXT,
    "adset_id" TEXT,
    "adset_name" TEXT,
    "ad_id" TEXT,
    "ad_name" TEXT,
    "is_original" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_provider_key" ON "integration_credentials"("provider");

-- CreateIndex
CREATE INDEX "marketing_interactions_lead_id_idx" ON "marketing_interactions"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_interactions_provider_external_lead_id_key" ON "marketing_interactions"("provider", "external_lead_id");

-- AddForeignKey
ALTER TABLE "marketing_interactions" ADD CONSTRAINT "marketing_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
