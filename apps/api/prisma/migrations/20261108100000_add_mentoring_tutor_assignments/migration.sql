-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review.

-- Status of a subject's tutor assignment.
CREATE TYPE "MentoringTutorAssignmentStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'ENDED');

-- Which tutor teaches which subject of a student's learning schedule. One current row per student and subject;
-- earlier tutors stay as ENDED rows. current_key is "<activation_id>:<subject_id>" while the row is not ENDED and
-- NULL afterwards, so the unique index allows exactly one current tutor per student subject.
CREATE TABLE "mentoring_tutor_assignments" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "status" "MentoringTutorAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_key" TEXT,
    "review_detail" JSONB,
    "schedule_snapshot" JSONB NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_user_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "end_reason" TEXT,

    CONSTRAINT "mentoring_tutor_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mentoring_tutor_assignments_current_key_key" ON "mentoring_tutor_assignments"("current_key");
CREATE INDEX "mentoring_tutor_assignments_activation_id_subject_id_idx" ON "mentoring_tutor_assignments"("activation_id", "subject_id");
CREATE INDEX "mentoring_tutor_assignments_tutor_profile_id_status_idx" ON "mentoring_tutor_assignments"("tutor_profile_id", "status");

ALTER TABLE "mentoring_tutor_assignments"
    ADD CONSTRAINT "mentoring_tutor_assignments_activation_id_fkey"
    FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One recurring class of an assignment. tutor_profile_id is repeated so every booking of a tutor can be read in one
-- query, across students. Rows are removed when the assignment ends; the history keeps the schedule snapshot.
CREATE TABLE "mentoring_tutor_assignment_sessions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "week" INTEGER,
    "occurrences" TEXT[],
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "mentoring_tutor_assignment_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_tutor_assignment_sessions_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
    CONSTRAINT "mentoring_tutor_assignment_sessions_time_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute")
);

CREATE INDEX "mentoring_tutor_assignment_sessions_tutor_profile_id_day_of_week_idx" ON "mentoring_tutor_assignment_sessions"("tutor_profile_id", "day_of_week");
CREATE INDEX "mentoring_tutor_assignment_sessions_assignment_id_idx" ON "mentoring_tutor_assignment_sessions"("assignment_id");

ALTER TABLE "mentoring_tutor_assignment_sessions"
    ADD CONSTRAINT "mentoring_tutor_assignment_sessions_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "mentoring_tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
