-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review. Approved as a proposal in docs/operations/TUTOR_TIMETABLE_SCHEMA_PROPOSAL.md.
-- One deliberate difference from that proposal: overrides are keyed by assignment, date and the class's original start
-- time instead of a session row, because session rows are rewritten whenever a schedule changes and a cancellation
-- must not be lost that way.

-- 1. A start and end date for a tutor assignment. NULL keeps the earlier week-pattern behaviour.
ALTER TABLE "mentoring_tutor_assignments" ADD COLUMN "start_date" DATE;
ALTER TABLE "mentoring_tutor_assignments" ADD COLUMN "end_date" DATE;

-- 2. One occurrence of a recurring class cancelled or moved.
CREATE TYPE "TutorOccurrenceChange" AS ENUM ('CANCELLED', 'RESCHEDULED');

CREATE TABLE "mentoring_tutor_assignment_overrides" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "original_start_minute" INTEGER NOT NULL,
    "kind" "TutorOccurrenceChange" NOT NULL,
    "new_date" DATE,
    "new_start_minute" INTEGER,
    "new_end_minute" INTEGER,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_tutor_assignment_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_tutor_assignment_overrides_move_check" CHECK (
        ("kind" = 'CANCELLED' AND "new_date" IS NULL AND "new_start_minute" IS NULL AND "new_end_minute" IS NULL)
        OR ("kind" = 'RESCHEDULED' AND "new_date" IS NOT NULL AND "new_start_minute" >= 0 AND "new_end_minute" <= 1440 AND "new_end_minute" > "new_start_minute")
    )
);

CREATE UNIQUE INDEX "mentoring_tutor_assignment_overrides_assignment_id_date_original_start_minute_key"
    ON "mentoring_tutor_assignment_overrides"("assignment_id", "date", "original_start_minute");
CREATE INDEX "mentoring_tutor_assignment_overrides_assignment_id_idx" ON "mentoring_tutor_assignment_overrides"("assignment_id");

ALTER TABLE "mentoring_tutor_assignment_overrides"
    ADD CONSTRAINT "mentoring_tutor_assignment_overrides_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "mentoring_tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Dates that change a tutor's weekly pattern. tutor_profile_id NULL means the whole organisation (a public holiday).
CREATE TYPE "TutorExceptionKind" AS ENUM ('HOLIDAY', 'DAY_OFF', 'EXTRA_HOURS', 'BLOCKED');

CREATE TABLE "tutor_availability_exceptions" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT,
    "date" DATE NOT NULL,
    "kind" "TutorExceptionKind" NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "note" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "tutor_availability_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tutor_availability_exceptions_time_check" CHECK (
        ("start_minute" IS NULL AND "end_minute" IS NULL AND "kind" IN ('HOLIDAY', 'DAY_OFF'))
        OR ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute" AND "kind" IN ('EXTRA_HOURS', 'BLOCKED'))
    ),
    CONSTRAINT "tutor_availability_exceptions_scope_check" CHECK ("kind" <> 'HOLIDAY' OR "tutor_profile_id" IS NULL)
);

CREATE INDEX "tutor_availability_exceptions_tutor_profile_id_date_idx" ON "tutor_availability_exceptions"("tutor_profile_id", "date");
CREATE INDEX "tutor_availability_exceptions_date_idx" ON "tutor_availability_exceptions"("date");
