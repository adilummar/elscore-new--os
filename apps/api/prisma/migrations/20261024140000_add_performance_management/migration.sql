-- CreateEnum
CREATE TYPE "PerformanceReviewType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'PROBATIONARY');

-- CreateEnum
CREATE TYPE "PerformanceCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'ACHIEVED', 'NOT_ACHIEVED');

-- CreateEnum
CREATE TYPE "GoalCategory" AS ENUM ('SALES', 'RECRUITMENT', 'OPERATIONS', 'QUALITY', 'DEVELOPMENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "GoalMeasurementMethod" AS ENUM ('NUMERICAL', 'MILESTONE', 'QUALITATIVE');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SELF_REVIEW', 'MANAGER_REVIEW', 'IN_DISCUSSION', 'COMPLETED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "ReviewAcknowledgementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'REFUSED');

-- CreateEnum
CREATE TYPE "PipStatus" AS ENUM ('DRAFT', 'ACTIVE', 'MONITORING', 'EXTENDED', 'IMPROVEMENT_ACHIEVED', 'NOT_ACHIEVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PipObjectiveStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'MET', 'UNMET');

-- CreateTable
CREATE TABLE "performance_cycles" (
    "id" TEXT NOT NULL,
    "cycle_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "review_type" "PerformanceReviewType" NOT NULL DEFAULT 'MONTHLY',
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "status" "PerformanceCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "department_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_goals" (
    "id" TEXT NOT NULL,
    "goal_code" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "reviewer_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "GoalCategory" NOT NULL DEFAULT 'GENERAL',
    "measurement_method" "GoalMeasurementMethod" NOT NULL DEFAULT 'NUMERICAL',
    "target" TEXT NOT NULL,
    "actual_result" TEXT,
    "measurement_period" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "evidence" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "review_code" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "period" TEXT NOT NULL,
    "review_type" "PerformanceReviewType" NOT NULL DEFAULT 'MONTHLY',
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "rating" INTEGER,
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "quality_assessment" TEXT,
    "competency_assessment" TEXT,
    "manager_feedback" TEXT,
    "confidential_notes" TEXT,
    "employee_comments" TEXT,
    "recommended_training" TEXT,
    "pip_recommended" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgement_status" "ReviewAcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledged_at" TIMESTAMP(3),
    "employee_comments_on_acknowledgement" TEXT,
    "submitted_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "finalized_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review_amendments" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "previous_rating" INTEGER,
    "new_rating" INTEGER,
    "reason" TEXT NOT NULL,
    "changes" JSONB,
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_review_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_improvement_plans" (
    "id" TEXT NOT NULL,
    "pip_code" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "review_id" TEXT,
    "reason" TEXT NOT NULL,
    "performance_gap" TEXT NOT NULL,
    "expected_standard" TEXT NOT NULL,
    "support_provided" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "target_completion_date" TEXT NOT NULL,
    "review_date" TEXT,
    "progress_updates" TEXT,
    "final_assessment" TEXT,
    "employee_comments" TEXT,
    "closure_reason" TEXT,
    "status" "PipStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_improvement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_objectives" (
    "id" TEXT NOT NULL,
    "pip_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "success_criteria" TEXT NOT NULL,
    "target_date" TEXT NOT NULL,
    "status" "PipObjectiveStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "performance_cycles_cycle_code_key" ON "performance_cycles"("cycle_code");

-- CreateIndex
CREATE INDEX "performance_cycles_status_idx" ON "performance_cycles"("status");

-- CreateIndex
CREATE INDEX "performance_cycles_start_date_end_date_idx" ON "performance_cycles"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_goals_goal_code_key" ON "employee_goals"("goal_code");

-- CreateIndex
CREATE INDEX "employee_goals_employee_id_idx" ON "employee_goals"("employee_id");

-- CreateIndex
CREATE INDEX "employee_goals_cycle_id_idx" ON "employee_goals"("cycle_id");

-- CreateIndex
CREATE INDEX "employee_goals_status_idx" ON "employee_goals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_review_code_key" ON "performance_reviews"("review_code");

-- CreateIndex
CREATE INDEX "performance_reviews_employee_id_idx" ON "performance_reviews"("employee_id");

-- CreateIndex
CREATE INDEX "performance_reviews_reviewer_id_idx" ON "performance_reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "performance_reviews_cycle_id_idx" ON "performance_reviews"("cycle_id");

-- CreateIndex
CREATE INDEX "performance_reviews_period_idx" ON "performance_reviews"("period");

-- CreateIndex
CREATE INDEX "performance_reviews_status_idx" ON "performance_reviews"("status");

-- CreateIndex
CREATE INDEX "performance_review_amendments_review_id_idx" ON "performance_review_amendments"("review_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_improvement_plans_pip_code_key" ON "performance_improvement_plans"("pip_code");

-- CreateIndex
CREATE INDEX "performance_improvement_plans_employee_id_idx" ON "performance_improvement_plans"("employee_id");

-- CreateIndex
CREATE INDEX "performance_improvement_plans_manager_id_idx" ON "performance_improvement_plans"("manager_id");

-- CreateIndex
CREATE INDEX "performance_improvement_plans_status_idx" ON "performance_improvement_plans"("status");

-- CreateIndex
CREATE INDEX "pip_objectives_pip_id_idx" ON "pip_objectives"("pip_id");

-- AddForeignKey
ALTER TABLE "performance_cycles" ADD CONSTRAINT "performance_cycles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_cycles" ADD CONSTRAINT "performance_cycles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_amendments" ADD CONSTRAINT "performance_review_amendments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_amendments" ADD CONSTRAINT "performance_review_amendments_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "performance_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_objectives" ADD CONSTRAINT "pip_objectives_pip_id_fkey" FOREIGN KEY ("pip_id") REFERENCES "performance_improvement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert Sequences
INSERT INTO "sequences" ("entity_type", "next_number", "prefix", "padding")
VALUES
  ('CYC', 1, 'CYC', 4),
  ('GOL', 1, 'GOL', 4),
  ('REV', 1, 'REV', 4),
  ('PIP', 1, 'PIP', 4)
ON CONFLICT ("entity_type") DO NOTHING;
