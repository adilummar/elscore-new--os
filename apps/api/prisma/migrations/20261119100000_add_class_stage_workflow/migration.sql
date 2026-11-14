-- Class workflow: stage submissions, managed activity options, and the Mentor-corrected actual time.
-- Additive only. Nothing existing is changed or moved. The 13 activity options are the ones already used by tutor updates.

ALTER TABLE "mentoring_class_sessions"
  ADD COLUMN "mentor_actual_start_minute" INTEGER,
  ADD COLUMN "mentor_actual_end_minute" INTEGER,
  ADD COLUMN "mentor_actual_reason" TEXT,
  ADD COLUMN "mentor_actual_by_user_id" TEXT,
  ADD COLUMN "mentor_actual_at" TIMESTAMP(3),
  ADD CONSTRAINT "mentoring_class_sessions_mentor_actual_check" CHECK (
    (mentor_actual_start_minute IS NULL AND mentor_actual_end_minute IS NULL)
    OR (mentor_actual_start_minute IS NOT NULL AND mentor_actual_end_minute IS NOT NULL AND mentor_actual_end_minute > mentor_actual_start_minute
        AND mentor_actual_reason IS NOT NULL AND mentor_actual_by_user_id IS NOT NULL AND mentor_actual_at IS NOT NULL)
  );

CREATE TABLE "mentoring_class_stage_submissions" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "checklist" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "submitted_by_user_id" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mentoring_class_stage_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mentoring_class_stage_submissions_stage_check" CHECK (stage IN ('BEFORE', 'AFTER'))
);
CREATE UNIQUE INDEX "mentoring_class_stage_submissions_session_id_stage_key" ON "mentoring_class_stage_submissions"("session_id", "stage");
ALTER TABLE "mentoring_class_stage_submissions" ADD CONSTRAINT "mentoring_class_stage_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_activity_options" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "label_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mentoring_activity_options_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mentoring_activity_options_code_key" ON "mentoring_activity_options"("code");
CREATE UNIQUE INDEX "mentoring_activity_options_label_key_key" ON "mentoring_activity_options"("label_key");

INSERT INTO "mentoring_activity_options" ("id", "code", "label", "label_key", "is_active", "sort_order", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'EDUCATIONAL_GAMES', 'Educational games', 'educational games', true, 10, now(), now()),
  (gen_random_uuid()::text, 'WORKSHEET', 'Worksheet', 'worksheet', true, 20, now(), now()),
  (gen_random_uuid()::text, 'PRACTICE_QUESTIONS', 'Practice questions', 'practice questions', true, 30, now(), now()),
  (gen_random_uuid()::text, 'READING', 'Reading activity', 'reading activity', true, 40, now(), now()),
  (gen_random_uuid()::text, 'WRITING', 'Writing activity', 'writing activity', true, 50, now(), now()),
  (gen_random_uuid()::text, 'REVISION', 'Revision', 'revision', true, 60, now(), now()),
  (gen_random_uuid()::text, 'QUIZ', 'Quiz', 'quiz', true, 70, now(), now()),
  (gen_random_uuid()::text, 'PROBLEM_SOLVING', 'Problem solving', 'problem solving', true, 80, now(), now()),
  (gen_random_uuid()::text, 'GROUP_DISCUSSION', 'Group discussion', 'group discussion', true, 90, now(), now()),
  (gen_random_uuid()::text, 'PRACTICAL', 'Practical activity', 'practical activity', true, 100, now(), now()),
  (gen_random_uuid()::text, 'HOMEWORK', 'Homework', 'homework', true, 110, now(), now()),
  (gen_random_uuid()::text, 'PROJECT_WORK', 'Project work', 'project work', true, 120, now(), now()),
  (gen_random_uuid()::text, 'OTHER', 'Other', 'other', true, 130, now(), now());
