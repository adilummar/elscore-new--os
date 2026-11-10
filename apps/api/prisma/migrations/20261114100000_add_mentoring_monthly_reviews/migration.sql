-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring operations, increment 4: monthly parent review, goal evaluation, plan renewal).
-- Backward compatible: every new column on mentoring_review_meetings is nullable or has a default, so existing meetings are unchanged.

ALTER TABLE "mentoring_review_meetings"
    ADD COLUMN "plan_id" TEXT,
    ADD COLUMN "original_date" DATE,
    ADD COLUMN "scheduled_start_minute" INTEGER,
    ADD COLUMN "scheduled_end_minute" INTEGER,
    ADD COLUMN "conducted" BOOLEAN,
    ADD COLUMN "conducted_at" TIMESTAMP(3),
    ADD COLUMN "conducted_by_user_id" TEXT,
    ADD COLUMN "not_conducted_reason" TEXT,
    ADD COLUMN "actual_date" DATE,
    ADD COLUMN "actual_start_minute" INTEGER,
    ADD COLUMN "actual_end_minute" INTEGER,
    ADD COLUMN "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "parent_participation" TEXT,
    ADD COLUMN "parent_participation_note" TEXT,
    ADD COLUMN "exams_reviewed_at" TIMESTAMP(3),
    ADD COLUMN "exams_reviewed_by_user_id" TEXT,
    ADD COLUMN "exams_review_note" TEXT,
    ADD COLUMN "what_improved" TEXT,
    ADD COLUMN "exp_home_practice" TEXT,
    ADD COLUMN "exp_parent_involvement" TEXT,
    ADD COLUMN "exp_study_routine" TEXT,
    ADD COLUMN "exp_attendance_support" TEXT,
    ADD COLUMN "exp_other" TEXT,
    ADD COLUMN "mentor_observations" TEXT,
    ADD COLUMN "no_improvement_reason" TEXT,
    ADD COLUMN "parent_communicated" TEXT,
    ADD COLUMN "parent_concerns" TEXT,
    ADD COLUMN "parent_feedback" TEXT,
    ADD COLUMN "agreed_actions" TEXT,
    ADD COLUMN "additional_support" TEXT,
    ADD COLUMN "parent_commitments" TEXT,
    ADD COLUMN "follow_up" TEXT,
    ADD COLUMN "post_meeting_recorded_at" TIMESTAMP(3),
    ADD COLUMN "post_meeting_recorded_by_user_id" TEXT,
    ADD COLUMN "next_plan_approved_at" TIMESTAMP(3),
    ADD COLUMN "next_plan_approved_by_user_id" TEXT,
    ADD COLUMN "completed_at" TIMESTAMP(3),
    ADD COLUMN "completed_by_user_id" TEXT,
    ADD COLUMN "period_start" DATE,
    ADD COLUMN "period_end" DATE,
    ADD COLUMN "next_plan_id" TEXT;

ALTER TABLE "mentoring_review_meetings"
    ADD CONSTRAINT "mentoring_review_meetings_scheduled_times_check" CHECK (
        ("scheduled_start_minute" IS NULL AND "scheduled_end_minute" IS NULL)
        OR ("scheduled_start_minute" >= 0 AND "scheduled_end_minute" <= 1440 AND "scheduled_end_minute" > "scheduled_start_minute")
    ),
    ADD CONSTRAINT "mentoring_review_meetings_actual_times_check" CHECK (
        ("actual_start_minute" IS NULL AND "actual_end_minute" IS NULL)
        OR ("actual_start_minute" >= 0 AND "actual_end_minute" <= 1440 AND "actual_end_minute" > "actual_start_minute")
    ),
    ADD CONSTRAINT "mentoring_review_meetings_participation_check" CHECK ("parent_participation" IS NULL OR "parent_participation" IN ('FULL', 'PARTIAL', 'NONE')),
    -- a meeting recorded as not conducted always says why
    ADD CONSTRAINT "mentoring_review_meetings_notconducted_check" CHECK ("conducted" IS DISTINCT FROM false OR "not_conducted_reason" IS NOT NULL);

CREATE TABLE "mentoring_review_goals" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MENTOR',
    "position" INTEGER NOT NULL DEFAULT 0,
    "goal" TEXT NOT NULL,
    "expected_outcome" TEXT,
    "actual_progress" TEXT,
    "result" TEXT,
    "evidence" TEXT,
    "improvement_areas" TEXT,
    "remaining_gaps" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "evaluated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_review_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_review_goals_source_check" CHECK ("source" IN ('PLAN', 'MENTOR')),
    CONSTRAINT "mentoring_review_goals_result_check" CHECK ("result" IS NULL OR "result" IN ('YES', 'PARTIALLY', 'NO')),
    -- a goal with a result was evaluated by someone, at a time
    CONSTRAINT "mentoring_review_goals_evaluated_check" CHECK ("result" IS NULL OR ("evaluated_at" IS NOT NULL AND "evaluated_by_user_id" IS NOT NULL))
);
CREATE INDEX "mentoring_review_goals_meeting_id_subject_id_idx" ON "mentoring_review_goals"("meeting_id", "subject_id");
ALTER TABLE "mentoring_review_goals" ADD CONSTRAINT "mentoring_review_goals_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mentoring_review_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_review_improvement_areas" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "area" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_review_improvement_areas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentoring_review_improvement_areas_meeting_id_subject_id_idx" ON "mentoring_review_improvement_areas"("meeting_id", "subject_id");
ALTER TABLE "mentoring_review_improvement_areas" ADD CONSTRAINT "mentoring_review_improvement_areas_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mentoring_review_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_review_tutor_notes" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "tutor_user_id" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_review_tutor_notes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mentoring_review_tutor_notes_meeting_id_subject_id_key" ON "mentoring_review_tutor_notes"("meeting_id", "subject_id");
ALTER TABLE "mentoring_review_tutor_notes" ADD CONSTRAINT "mentoring_review_tutor_notes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mentoring_review_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_review_next_plans" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" TEXT NOT NULL DEFAULT '',
    "topics" TEXT NOT NULL DEFAULT '',
    "outcomes" TEXT NOT NULL DEFAULT '',
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_review_next_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_review_next_plans_kind_check" CHECK ("kind" IN ('NEW', 'CONTINUED', 'REVISED'))
);
CREATE UNIQUE INDEX "mentoring_review_next_plans_meeting_id_subject_id_key" ON "mentoring_review_next_plans"("meeting_id", "subject_id");
ALTER TABLE "mentoring_review_next_plans" ADD CONSTRAINT "mentoring_review_next_plans_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mentoring_review_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_review_events" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_review_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentoring_review_events_meeting_id_created_at_idx" ON "mentoring_review_events"("meeting_id", "created_at");
ALTER TABLE "mentoring_review_events" ADD CONSTRAINT "mentoring_review_events_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "mentoring_review_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
