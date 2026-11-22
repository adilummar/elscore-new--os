-- CreateEnum
CREATE TYPE "TutorHiringStage" AS ENUM ('LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW', 'TRAINING');

-- CreateEnum
CREATE TYPE "TutorLeadStatus" AS ENUM ('PROCESSING', 'REJECTED', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "TutorHiringDecision" AS ENUM ('ACCEPTED', 'HIRED', 'REJECTED', 'NOT_INTERESTED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "TutorCallStatus" AS ENUM ('ATTENDED', 'BUSY_CALL_LATER', 'NOT_ATTENDED');

-- CreateEnum
CREATE TYPE "TutorDemoStatus" AS ENUM ('BOOKED', 'ATTENDED', 'RESCHEDULE', 'NOT_ATTENDED');

-- AlterTable
ALTER TABLE "tutor_leads" ADD COLUMN     "additional_phone" TEXT,
ADD COLUMN     "cv_received_at" TIMESTAMP(3),
ADD COLUMN     "decision" "TutorHiringDecision",
ADD COLUMN     "decision_at" TIMESTAMP(3),
ADD COLUMN     "details_description" TEXT,
ADD COLUMN     "details_responded_at" TIMESTAMP(3),
ADD COLUMN     "hiring_stage" "TutorHiringStage",
ADD COLUMN     "lead_status" "TutorLeadStatus" NOT NULL DEFAULT 'PROCESSING',
ADD COLUMN     "lead_status_changed_at" TIMESTAMP(3),
ADD COLUMN     "lead_status_changed_by_id" TEXT,
ADD COLUMN     "lead_status_remarks" TEXT,
ADD COLUMN     "online_teaching_experience" INTEGER,
ADD COLUMN     "phone_country_code" TEXT,
ADD COLUMN     "phone_normalized" TEXT;

-- AlterTable
ALTER TABLE "tutor_lead_calls" ADD COLUMN     "follow_up_at" TIMESTAMP(3),
ADD COLUMN     "status" "TutorCallStatus";

-- CreateTable
CREATE TABLE "tutor_lead_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_lead_enquiries" (
    "id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "enquiry_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_lead_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_lead_curricula" (
    "tutor_lead_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,

    CONSTRAINT "tutor_lead_curricula_pkey" PRIMARY KEY ("tutor_lead_id","curriculum_id")
);

-- CreateTable
CREATE TABLE "tutor_lead_decision_history" (
    "id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "previous_decision" "TutorHiringDecision",
    "new_decision" "TutorHiringDecision" NOT NULL,
    "remarks" TEXT,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_lead_decision_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_lead_status_history" (
    "id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "previous_status" "TutorLeadStatus",
    "new_status" "TutorLeadStatus" NOT NULL,
    "remarks" TEXT,
    "source" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_demo_bookings" (
    "id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "TutorDemoStatus" NOT NULL DEFAULT 'BOOKED',
    "booked_by_user_id" TEXT NOT NULL,
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_to_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "evaluation_due_at" TIMESTAMP(3),
    "reschedule_reason" TEXT,
    "rescheduled_from_id" TEXT,

    CONSTRAINT "tutor_demo_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_demo_assignment_history" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_demo_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_demo_evaluations" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "evaluated_by_user_id" TEXT NOT NULL,
    "teaching_methods" TEXT NOT NULL,
    "technical_skills" TEXT NOT NULL,
    "english_rating" INTEGER NOT NULL,
    "salary_slab_id" TEXT,
    "remarks" TEXT,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_demo_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_evaluation_escalations" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "recipient_kind" TEXT NOT NULL,
    "escalated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification_id" TEXT,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "tutor_evaluation_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_hiring_schedules" (
    "id" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "working_days" INTEGER[],
    "timezone" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_hiring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_ad_spend" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "entered_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_ad_spend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_lead_sources_name_key" ON "tutor_lead_sources"("name");

-- CreateIndex
CREATE INDEX "tutor_lead_enquiries_tutor_lead_id_idx" ON "tutor_lead_enquiries"("tutor_lead_id");

-- CreateIndex
CREATE INDEX "tutor_lead_enquiries_source_id_enquiry_date_idx" ON "tutor_lead_enquiries"("source_id", "enquiry_date");

-- CreateIndex
CREATE INDEX "tutor_lead_decision_history_tutor_lead_id_idx" ON "tutor_lead_decision_history"("tutor_lead_id");

-- CreateIndex
CREATE INDEX "tutor_lead_status_history_tutor_lead_id_idx" ON "tutor_lead_status_history"("tutor_lead_id");

-- CreateIndex
CREATE INDEX "tutor_leads_lead_status_idx" ON "tutor_leads"("lead_status");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_demo_bookings_rescheduled_from_id_key" ON "tutor_demo_bookings"("rescheduled_from_id");

-- CreateIndex
CREATE INDEX "tutor_demo_bookings_assigned_to_user_id_scheduled_at_idx" ON "tutor_demo_bookings"("assigned_to_user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "tutor_demo_bookings_tutor_lead_id_idx" ON "tutor_demo_bookings"("tutor_lead_id");

-- CreateIndex
CREATE INDEX "tutor_demo_bookings_status_evaluation_due_at_idx" ON "tutor_demo_bookings"("status", "evaluation_due_at");

-- CreateIndex
CREATE INDEX "tutor_demo_assignment_history_booking_id_idx" ON "tutor_demo_assignment_history"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_demo_evaluations_booking_id_key" ON "tutor_demo_evaluations"("booking_id");

-- CreateIndex
CREATE INDEX "tutor_demo_evaluations_tutor_lead_id_idx" ON "tutor_demo_evaluations"("tutor_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_evaluation_escalations_booking_id_recipient_user_id_key" ON "tutor_evaluation_escalations"("booking_id", "recipient_user_id");

-- CreateIndex
CREATE INDEX "tutor_hiring_schedules_effective_from_idx" ON "tutor_hiring_schedules"("effective_from" DESC);

-- CreateIndex
CREATE INDEX "tutor_ad_spend_source_id_period_start_idx" ON "tutor_ad_spend"("source_id", "period_start");

-- CreateIndex
CREATE INDEX "tutor_leads_hiring_stage_decision_idx" ON "tutor_leads"("hiring_stage", "decision");

-- CreateIndex
CREATE INDEX "tutor_leads_phone_normalized_idx" ON "tutor_leads"("phone_normalized");

-- AddForeignKey
ALTER TABLE "tutor_lead_enquiries" ADD CONSTRAINT "tutor_lead_enquiries_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_enquiries" ADD CONSTRAINT "tutor_lead_enquiries_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "tutor_lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_enquiries" ADD CONSTRAINT "tutor_lead_enquiries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_curricula" ADD CONSTRAINT "tutor_lead_curricula_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_curricula" ADD CONSTRAINT "tutor_lead_curricula_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_decision_history" ADD CONSTRAINT "tutor_lead_decision_history_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_decision_history" ADD CONSTRAINT "tutor_lead_decision_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_status_history" ADD CONSTRAINT "tutor_lead_status_history_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_lead_status_history" ADD CONSTRAINT "tutor_lead_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_bookings" ADD CONSTRAINT "tutor_demo_bookings_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_bookings" ADD CONSTRAINT "tutor_demo_bookings_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_bookings" ADD CONSTRAINT "tutor_demo_bookings_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_bookings" ADD CONSTRAINT "tutor_demo_bookings_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "tutor_demo_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_assignment_history" ADD CONSTRAINT "tutor_demo_assignment_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tutor_demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_assignment_history" ADD CONSTRAINT "tutor_demo_assignment_history_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_assignment_history" ADD CONSTRAINT "tutor_demo_assignment_history_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_assignment_history" ADD CONSTRAINT "tutor_demo_assignment_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_evaluations" ADD CONSTRAINT "tutor_demo_evaluations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tutor_demo_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_evaluations" ADD CONSTRAINT "tutor_demo_evaluations_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_evaluations" ADD CONSTRAINT "tutor_demo_evaluations_evaluated_by_user_id_fkey" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_demo_evaluations" ADD CONSTRAINT "tutor_demo_evaluations_salary_slab_id_fkey" FOREIGN KEY ("salary_slab_id") REFERENCES "tutor_salary_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_evaluation_escalations" ADD CONSTRAINT "tutor_evaluation_escalations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tutor_demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_evaluation_escalations" ADD CONSTRAINT "tutor_evaluation_escalations_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_ad_spend" ADD CONSTRAINT "tutor_ad_spend_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "tutor_lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_ad_spend" ADD CONSTRAINT "tutor_ad_spend_entered_by_user_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

