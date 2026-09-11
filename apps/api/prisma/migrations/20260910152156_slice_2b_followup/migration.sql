-- CreateEnum
CREATE TYPE "ContactClassification" AS ENUM ('QUALIFIED', 'NON_QUALIFIED', 'NO_RESPONSE', 'JUNK');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'OVERDUE', 'COMPLETED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "whatsapp_number" TEXT;

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "classification" "ContactClassification",
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "remarks" TEXT,
    "reminder_job_id" TEXT,
    "overdue_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_reschedule_history" (
    "id" TEXT NOT NULL,
    "follow_up_id" TEXT NOT NULL,
    "previous_scheduled_at" TIMESTAMP(3) NOT NULL,
    "new_scheduled_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "rescheduled_by_user_id" TEXT NOT NULL,
    "rescheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_reschedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_business_id_key" ON "follow_ups"("business_id");

-- CreateIndex
CREATE INDEX "follow_ups_lead_id_status_idx" ON "follow_ups"("lead_id", "status");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_at_status_idx" ON "follow_ups"("scheduled_at", "status");

-- CreateIndex
CREATE INDEX "follow_ups_created_by_user_id_status_idx" ON "follow_ups"("created_by_user_id", "status");

-- CreateIndex
CREATE INDEX "follow_up_reschedule_history_follow_up_id_idx" ON "follow_up_reschedule_history"("follow_up_id");

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reschedule_history" ADD CONSTRAINT "follow_up_reschedule_history_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reschedule_history" ADD CONSTRAINT "follow_up_reschedule_history_rescheduled_by_user_id_fkey" FOREIGN KEY ("rescheduled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
