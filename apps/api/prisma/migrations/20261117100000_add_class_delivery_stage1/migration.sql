-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Phase 2 Stage 1: class update fields and versions, activity grade level and option
-- groups, covered portions, and the source link of follow-up tasks).
-- Backward compatible: new nullable columns, one column with a default, one new table. Existing rows are unchanged and stay valid.
-- Old code keeps working against this schema (it ignores the new columns and table).

ALTER TABLE "mentoring_class_sessions"
    ADD COLUMN "homework" TEXT,
    ADD COLUMN "portions_completed" TEXT,
    ADD COLUMN "update_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "mentoring_class_sessions"
    ADD CONSTRAINT "mentoring_class_sessions_update_version_check" CHECK ("update_version" >= 0);

ALTER TABLE "mentoring_class_activities"
    ADD COLUMN "grade_id" TEXT,
    ADD COLUMN "learning_level" TEXT,
    ADD COLUMN "suitability_note" TEXT,
    ADD COLUMN "option_group_key" TEXT,
    ADD COLUMN "option_label" TEXT;

ALTER TABLE "mentoring_class_activities"
    ADD CONSTRAINT "mentoring_class_activities_learning_level_check" CHECK ("learning_level" IS NULL OR "learning_level" IN ('BELOW_GRADE', 'ON_GRADE', 'ABOVE_GRADE')),
    -- an option has a group and a label together, or neither
    ADD CONSTRAINT "mentoring_class_activities_option_check" CHECK (("option_group_key" IS NULL) = ("option_label" IS NULL));

CREATE TABLE "mentoring_class_portions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "portion_note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'TYPED',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_class_portions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_class_portions_source_check" CHECK ("source" IN ('TYPED', 'PLAN')),
    CONSTRAINT "mentoring_class_portions_chapter_check" CHECK (length(btrim("chapter")) > 0)
);
CREATE UNIQUE INDEX "mentoring_class_portions_session_id_chapter_key" ON "mentoring_class_portions"("session_id", "chapter");
CREATE INDEX "mentoring_class_portions_subject_id_idx" ON "mentoring_class_portions"("subject_id");
ALTER TABLE "mentoring_class_portions" ADD CONSTRAINT "mentoring_class_portions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentoring_tasks"
    ADD COLUMN "source_type" TEXT,
    ADD COLUMN "source_id" TEXT;

ALTER TABLE "mentoring_tasks"
    ADD CONSTRAINT "mentoring_tasks_source_type_check" CHECK ("source_type" IS NULL OR "source_type" IN ('CLASS', 'EXAM', 'MEETING')),
    -- a task follows up a record (type and id together), or it follows up nothing
    ADD CONSTRAINT "mentoring_tasks_source_check" CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

CREATE INDEX "mentoring_tasks_source_type_source_id_idx" ON "mentoring_tasks"("source_type", "source_id");
