-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring operations, increment 2: daily classes, Mentor verification, tutor pay).
-- Backward compatible: no existing table or column changes. The existing tutor class record and payroll tables are only
-- READ and later WRITTEN by the new code, through their existing columns, so the current payroll flow keeps working.

CREATE TYPE "MentoringClassStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'AWAITING_MENTOR_VERIFICATION', 'RETURNED_FOR_CORRECTION', 'VERIFIED', 'NOT_CONDUCTED');

CREATE TABLE "mentoring_class_sessions" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "tutor_user_id" TEXT NOT NULL,
    "original_date" DATE NOT NULL,
    "original_start_minute" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "status" "MentoringClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "conducted" BOOLEAN,
    "actual_start_minute" INTEGER,
    "actual_end_minute" INTEGER,
    "actual_minutes" INTEGER,
    "subject_covered" TEXT,
    "topics_covered" TEXT,
    "attendance" TEXT,
    "participation" TEXT,
    "class_notes" TEXT,
    "not_conducted_reason" TEXT,
    "activities" TEXT[],
    "other_activity" TEXT,
    "evaluation_remarks" TEXT,
    "covered_remarks" TEXT,
    "voice_sent_at" TIMESTAMP(3),
    "voice_received_at" TIMESTAMP(3),
    "voice_received_by_user_id" TEXT,
    "voice_remarks" TEXT,
    "tutor_submitted_at" TIMESTAMP(3),
    "tutor_submitted_by_user_id" TEXT,
    "mentor_remarks" TEXT,
    "returned_reason" TEXT,
    "returned_kind" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "verified_minutes" INTEGER,
    "tutor_class_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_class_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_class_sessions_times_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute"),
    CONSTRAINT "mentoring_class_sessions_actual_check" CHECK ("actual_start_minute" IS NULL OR ("actual_end_minute" IS NOT NULL AND "actual_end_minute" > "actual_start_minute" AND "actual_start_minute" >= 0 AND "actual_end_minute" <= 1440)),
    CONSTRAINT "mentoring_class_sessions_attendance_check" CHECK ("attendance" IS NULL OR "attendance" IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')),
    CONSTRAINT "mentoring_class_sessions_participation_check" CHECK ("participation" IS NULL OR "participation" IN ('EXCELLENT', 'GOOD', 'FAIR', 'POOR')),
    -- a class is verified only with a Mentor, a time and the minutes confirmed; a verified class has a decision on record
    CONSTRAINT "mentoring_class_sessions_verified_check" CHECK (("status" = 'VERIFIED') = ("verified_at" IS NOT NULL AND "verified_by_user_id" IS NOT NULL AND "verified_minutes" IS NOT NULL) OR "status" = 'NOT_CONDUCTED'),
    CONSTRAINT "mentoring_class_sessions_minutes_check" CHECK ("verified_minutes" IS NULL OR "verified_minutes" >= 0)
);
CREATE UNIQUE INDEX "mentoring_class_sessions_assignment_id_original_date_original_start_minute_key" ON "mentoring_class_sessions"("assignment_id", "original_date", "original_start_minute");
CREATE INDEX "mentoring_class_sessions_activation_id_date_idx" ON "mentoring_class_sessions"("activation_id", "date");
CREATE INDEX "mentoring_class_sessions_tutor_user_id_date_idx" ON "mentoring_class_sessions"("tutor_user_id", "date");
CREATE INDEX "mentoring_class_sessions_status_date_idx" ON "mentoring_class_sessions"("status", "date");
ALTER TABLE "mentoring_class_sessions" ADD CONSTRAINT "mentoring_class_sessions_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mentoring_class_session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_class_session_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentoring_class_session_events_session_id_created_at_idx" ON "mentoring_class_session_events"("session_id", "created_at");
ALTER TABLE "mentoring_class_session_events" ADD CONSTRAINT "mentoring_class_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_class_compensation_adjustments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "class_record_id" TEXT,
    "previous_minutes" INTEGER NOT NULL,
    "new_minutes" INTEGER NOT NULL,
    "delta_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_to_record" BOOLEAN NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_class_compensation_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_class_compensation_adjustments_delta_check" CHECK ("delta_minutes" = "new_minutes" - "previous_minutes" AND "new_minutes" >= 0 AND "previous_minutes" >= 0)
);
CREATE INDEX "mentoring_class_compensation_adjustments_session_id_idx" ON "mentoring_class_compensation_adjustments"("session_id");
ALTER TABLE "mentoring_class_compensation_adjustments" ADD CONSTRAINT "mentoring_class_compensation_adjustments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
