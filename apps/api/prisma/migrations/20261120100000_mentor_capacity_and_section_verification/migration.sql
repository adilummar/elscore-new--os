-- Mentor monthly hour capacity and four-section activation verification. Additive only: no existing column is changed or dropped.
ALTER TABLE "mentoring_staff_profiles" ADD COLUMN "monthly_hour_limit" DECIMAL(10,2);
ALTER TABLE "mentoring_settings" ADD COLUMN "default_monthly_hour_limit" DECIMAL(10,2) NOT NULL DEFAULT 160;
ALTER TABLE "mentoring_settings" ADD COLUMN "capacity_warning_percent" INTEGER NOT NULL DEFAULT 80;

CREATE TABLE "mentor_capacity_changes" (
  "id" TEXT NOT NULL,
  "mentor_user_id" TEXT NOT NULL,
  "old_limit" DECIMAL(10,2),
  "new_limit" DECIMAL(10,2) NOT NULL,
  "changed_by_user_id" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentor_capacity_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentor_capacity_changes_mentor_user_id_created_at_idx" ON "mentor_capacity_changes"("mentor_user_id", "created_at");

CREATE TABLE "mentoring_capacity_exceptions" (
  "id" TEXT NOT NULL,
  "mentor_user_id" TEXT NOT NULL,
  "activation_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "student_hours" DECIMAL(10,2) NOT NULL,
  "allocated_before" DECIMAL(10,2) NOT NULL,
  "allocated_after" DECIMAL(10,2) NOT NULL,
  "limit_at_approval" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "approved_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentoring_capacity_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentoring_capacity_exceptions_mentor_user_id_created_at_idx" ON "mentoring_capacity_exceptions"("mentor_user_id", "created_at");
CREATE INDEX "mentoring_capacity_exceptions_activation_id_idx" ON "mentoring_capacity_exceptions"("activation_id");

CREATE TYPE "ActivationVerificationSection" AS ENUM ('STUDENT_PARENT_INFO', 'SUBJECTS_TUTORS_TIMETABLE', 'MARKS_EXAMINATIONS', 'EXPECTATIONS_ENGAGEMENT');

CREATE TABLE "activation_section_verifications" (
  "id" TEXT NOT NULL,
  "activation_id" TEXT NOT NULL,
  "section_id" "ActivationVerificationSection" NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "fingerprint" TEXT,
  "verified_by_user_id" TEXT,
  "verified_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activation_section_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activation_section_verifications_activation_id_section_id_key" ON "activation_section_verifications"("activation_id", "section_id");

CREATE TABLE "activation_section_verification_events" (
  "id" TEXT NOT NULL,
  "activation_id" TEXT NOT NULL,
  "section_id" "ActivationVerificationSection" NOT NULL,
  "status" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activation_section_verification_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activation_section_verification_events_activation_id_created_at_idx" ON "activation_section_verification_events"("activation_id", "created_at");
