-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Stage 5, subject-wise Individual Learning Plan).

-- 1. The monthly review meeting. Written by the phase after the learning plan; the plan only reads its date.
CREATE TYPE "ReviewMeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "mentoring_review_meetings" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MONTHLY_REVIEW',
    "scheduled_for" DATE NOT NULL,
    "status" "ReviewMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "current_key" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_review_meetings_pkey" PRIMARY KEY ("id"),
    -- a live (SCHEDULED) meeting has a key, anything else does not
    CONSTRAINT "mentoring_review_meetings_key_check" CHECK (("status" = 'SCHEDULED') = ("current_key" IS NOT NULL))
);
CREATE UNIQUE INDEX "mentoring_review_meetings_current_key_key" ON "mentoring_review_meetings"("current_key");
CREATE INDEX "mentoring_review_meetings_activation_id_status_idx" ON "mentoring_review_meetings"("activation_id", "status");
ALTER TABLE "mentoring_review_meetings" ADD CONSTRAINT "mentoring_review_meetings_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. The overall learning plan of a student. One live plan per student.
CREATE TYPE "LearningPlanStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SUPERSEDED');

CREATE TABLE "mentoring_learning_plans" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "status" "LearningPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "current_key" TEXT,
    "review_meeting_id" TEXT,
    "ends_on" DATE,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "mentoring_learning_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_learning_plans_key_check" CHECK (("status" <> 'SUPERSEDED') = ("current_key" IS NOT NULL))
);
CREATE UNIQUE INDEX "mentoring_learning_plans_current_key_key" ON "mentoring_learning_plans"("current_key");
CREATE INDEX "mentoring_learning_plans_activation_id_status_idx" ON "mentoring_learning_plans"("activation_id", "status");
ALTER TABLE "mentoring_learning_plans" ADD CONSTRAINT "mentoring_learning_plans_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. The plan for one subject. One per subject per plan.
CREATE TABLE "mentoring_learning_plan_subjects" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" TEXT NOT NULL DEFAULT '',
    "topics" TEXT NOT NULL DEFAULT '',
    "outcomes" TEXT NOT NULL DEFAULT '',
    "starts_on" DATE,
    "ends_on" DATE,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_learning_plan_subjects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_learning_plan_subjects_dates_check" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on")
);
CREATE UNIQUE INDEX "mentoring_learning_plan_subjects_plan_id_subject_id_key" ON "mentoring_learning_plan_subjects"("plan_id", "subject_id");
ALTER TABLE "mentoring_learning_plan_subjects" ADD CONSTRAINT "mentoring_learning_plan_subjects_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "mentoring_learning_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Plan history: a snapshot per change, never updated or deleted by the application.
CREATE TABLE "mentoring_learning_plan_revisions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "changed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_learning_plan_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mentoring_learning_plan_revisions_plan_id_version_key" ON "mentoring_learning_plan_revisions"("plan_id", "version");
ALTER TABLE "mentoring_learning_plan_revisions" ADD CONSTRAINT "mentoring_learning_plan_revisions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "mentoring_learning_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
