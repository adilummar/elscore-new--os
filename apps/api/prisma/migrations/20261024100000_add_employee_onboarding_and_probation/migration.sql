-- CreateEnum
CREATE TYPE "OnboardingCaseStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY_FOR_FINALIZATION', 'COMPLETED', 'WITHDRAWN', 'NO_SHOW', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnboardingDocumentType" AS ENUM ('PASSPORT', 'NATIONAL_ID', 'DEGREE_CERTIFICATE', 'EXPERIENCE_LETTER', 'PAYSLIP', 'SIGNED_OFFER_LETTER', 'BACKGROUND_CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnboardingTaskCategory" AS ENUM ('DOCUMENTATION', 'IT_SETUP', 'WORKSPACE', 'ORIENTATION', 'TRAINING', 'HR_FORMALITIES');

-- CreateEnum
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ProbationReviewOutcome" AS ENUM ('CONFIRMED', 'EXTENDED', 'TERMINATED');

-- CreateTable
CREATE TABLE "onboarding_cases" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "status" "OnboardingCaseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "target_joining_date" TEXT NOT NULL,
    "confirmed_joining_date" TEXT,
    "probation_duration_months" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "cancellation_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "finalized_by_id" TEXT,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "document_type" "OnboardingDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "status" "DocumentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "verification_notes" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "OnboardingTaskCategory" NOT NULL,
    "assigned_to_user_id" TEXT,
    "due_date" TEXT,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_probation_reviews" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "review_date" TEXT NOT NULL,
    "outcome" "ProbationReviewOutcome" NOT NULL,
    "extended_end_date" TEXT,
    "notes" TEXT NOT NULL,
    "reviewed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_probation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_cases_business_id_key" ON "onboarding_cases"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_cases_application_id_key" ON "onboarding_cases"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_cases_offer_id_key" ON "onboarding_cases"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_cases_employee_id_key" ON "onboarding_cases"("employee_id");

-- CreateIndex
CREATE INDEX "onboarding_cases_status_idx" ON "onboarding_cases"("status");

-- CreateIndex
CREATE INDEX "onboarding_cases_created_by_id_idx" ON "onboarding_cases"("created_by_id");

-- CreateIndex
CREATE INDEX "onboarding_documents_case_id_status_idx" ON "onboarding_documents"("case_id", "status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_case_id_status_idx" ON "onboarding_tasks"("case_id", "status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_assigned_to_user_id_idx" ON "onboarding_tasks"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "employee_probation_reviews_employee_id_idx" ON "employee_probation_reviews"("employee_id");

-- CreateIndex
CREATE INDEX "employee_probation_reviews_review_date_idx" ON "employee_probation_reviews"("review_date");

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "job_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "onboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "onboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_probation_reviews" ADD CONSTRAINT "employee_probation_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_probation_reviews" ADD CONSTRAINT "employee_probation_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert Sequences for Onboarding Business IDs
INSERT INTO "sequences" ("entity_type", "next_number", "prefix", "padding")
VALUES 
  ('ONB', 1, 'ONB', 4)
ON CONFLICT ("entity_type") DO NOTHING;
