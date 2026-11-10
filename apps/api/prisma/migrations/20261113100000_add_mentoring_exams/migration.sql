-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring operations, increment 3: weekly exams, re-exams, marks).
-- Backward compatible: no existing table or column changes.

CREATE TABLE "mentoring_exams" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXAM',
    "original_exam_id" TEXT,
    "title" TEXT NOT NULL,
    "chapters" TEXT[],
    "portion" TEXT,
    "date" DATE NOT NULL,
    "original_date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "responsible_type" TEXT NOT NULL,
    "responsible_user_id" TEXT,
    "responsible_name" TEXT,
    "tutor_user_id" TEXT,
    "instructions" TEXT,
    "date_key" TEXT,
    "conducted" BOOLEAN,
    "conducted_at" TIMESTAMP(3),
    "conducted_by_user_id" TEXT,
    "not_conducted_reason" TEXT,
    "informed_at" TIMESTAMP(3),
    "informed_by_user_id" TEXT,
    "informed_note" TEXT,
    "re_exam_required" BOOLEAN NOT NULL DEFAULT false,
    "re_exam_reason" TEXT,
    "marks_obtained" DECIMAL(8,2),
    "max_marks" DECIMAL(8,2),
    "percentage" DECIMAL(5,2),
    "evaluating_tutor_user_id" TEXT,
    "evaluation_date" DATE,
    "marks_recorded_at" TIMESTAMP(3),
    "marks_recorded_by_user_id" TEXT,
    "weaknesses" TEXT,
    "topics_to_improve" TEXT,
    "tutor_suggestions" TEXT,
    "mentor_remarks" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_exams_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_exams_kind_check" CHECK ("kind" IN ('EXAM', 'RE_EXAM')),
    CONSTRAINT "mentoring_exams_responsible_check" CHECK ("responsible_type" IN ('TUTOR', 'PARENT', 'OTHER')),
    CONSTRAINT "mentoring_exams_times_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute"),
    -- a re-exam repeats an exam; an exam repeats nothing
    CONSTRAINT "mentoring_exams_reexam_check" CHECK (("kind" = 'RE_EXAM') = ("original_exam_id" IS NOT NULL)),
    -- marks: both or neither; never negative; never above the maximum; the maximum is above zero
    CONSTRAINT "mentoring_exams_marks_check" CHECK (
        ("marks_obtained" IS NULL AND "max_marks" IS NULL AND "percentage" IS NULL)
        OR ("marks_obtained" IS NOT NULL AND "max_marks" IS NOT NULL AND "percentage" IS NOT NULL AND "marks_obtained" >= 0 AND "max_marks" > 0 AND "marks_obtained" <= "max_marks")
    ),
    CONSTRAINT "mentoring_exams_notconducted_check" CHECK ("conducted" IS DISTINCT FROM false OR "not_conducted_reason" IS NOT NULL)
);
-- The database itself refuses a second live exam for a student on one date.
CREATE UNIQUE INDEX "mentoring_exams_date_key_key" ON "mentoring_exams"("date_key");
CREATE INDEX "mentoring_exams_activation_id_date_idx" ON "mentoring_exams"("activation_id", "date");
CREATE INDEX "mentoring_exams_tutor_user_id_date_idx" ON "mentoring_exams"("tutor_user_id", "date");
CREATE INDEX "mentoring_exams_original_exam_id_idx" ON "mentoring_exams"("original_exam_id");
ALTER TABLE "mentoring_exams" ADD CONSTRAINT "mentoring_exams_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mentoring_exam_items" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responsible" TEXT,
    "remarks" TEXT,
    "evidence_ref" TEXT,
    "updated_by_user_id" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_exam_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_exam_items_list_check" CHECK ("list" IN ('POST_EXAM', 'RE_EXAM')),
    CONSTRAINT "mentoring_exam_items_status_check" CHECK ("status" IN ('PENDING', 'DONE', 'NOT_APPLICABLE')),
    -- an item that is not pending was decided by someone, at a time; a pending one has neither
    CONSTRAINT "mentoring_exam_items_decided_check" CHECK (("status" = 'PENDING') = ("done_at" IS NULL AND "updated_by_user_id" IS NULL) OR "status" = 'PENDING'),
    CONSTRAINT "mentoring_exam_items_na_check" CHECK ("status" <> 'NOT_APPLICABLE' OR "remarks" IS NOT NULL)
);
CREATE UNIQUE INDEX "mentoring_exam_items_exam_id_kind_key" ON "mentoring_exam_items"("exam_id", "kind");
ALTER TABLE "mentoring_exam_items" ADD CONSTRAINT "mentoring_exam_items_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "mentoring_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_exam_events" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_exam_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentoring_exam_events_exam_id_created_at_idx" ON "mentoring_exam_events"("exam_id", "created_at");
ALTER TABLE "mentoring_exam_events" ADD CONSTRAINT "mentoring_exam_events_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "mentoring_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
