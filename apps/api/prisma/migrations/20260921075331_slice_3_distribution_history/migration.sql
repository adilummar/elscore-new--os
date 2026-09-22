-- CreateEnum
CREATE TYPE "LeadDistributionMethod" AS ENUM ('ROUND_ROBIN', 'SALES_HEAD_MANUAL', 'COUNSELLOR_SELF_ASSIGNED', 'REFERRAL_SELF_ASSIGNED', 'ROUND_ROBIN_PAUSED', 'REASSIGNMENT');

-- CreateTable
CREATE TABLE "lead_distribution_events" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "previous_owner_user_id" TEXT,
    "new_owner_user_id" TEXT,
    "assignment_method" "LeadDistributionMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL,
    "assignment_latency_ms" INTEGER NOT NULL,
    "event_date" DATE NOT NULL,
    "rr_sequence" INTEGER,
    "rr_position" INTEGER,
    "eligible_member_ids" JSONB,
    "selected_member_id" TEXT,
    "rr_queue_before" JSONB,
    "rr_queue_after" JSONB,
    "assigned_by_user_id" TEXT,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_distribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_distribution_events_lead_id_idx" ON "lead_distribution_events"("lead_id");

-- CreateIndex
CREATE INDEX "lead_distribution_events_event_date_idx" ON "lead_distribution_events"("event_date");

-- CreateIndex
CREATE INDEX "lead_distribution_events_assigned_by_user_id_idx" ON "lead_distribution_events"("assigned_by_user_id");

-- CreateIndex
CREATE INDEX "lead_distribution_events_new_owner_user_id_idx" ON "lead_distribution_events"("new_owner_user_id");

-- CreateIndex
CREATE INDEX "lead_distribution_events_assignment_method_idx" ON "lead_distribution_events"("assignment_method");

-- CreateIndex
CREATE INDEX "lead_distribution_events_created_at_idx" ON "lead_distribution_events"("created_at");

-- AddForeignKey
ALTER TABLE "lead_distribution_events" ADD CONSTRAINT "lead_distribution_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_distribution_events" ADD CONSTRAINT "lead_distribution_events_previous_owner_user_id_fkey" FOREIGN KEY ("previous_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_distribution_events" ADD CONSTRAINT "lead_distribution_events_new_owner_user_id_fkey" FOREIGN KEY ("new_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_distribution_events" ADD CONSTRAINT "lead_distribution_events_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
