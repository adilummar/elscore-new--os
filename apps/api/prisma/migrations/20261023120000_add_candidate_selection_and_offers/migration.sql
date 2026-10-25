-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('LINKEDIN', 'JOB_PORTAL', 'REFERRAL', 'DIRECT_APPLICATION', 'AGENCY', 'CAREERS_PAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('SCREENING', 'INTERVIEW_ROUND_1', 'INTERVIEW_ROUND_2', 'MANAGEMENT_ROUND', 'OFFER_STAGE', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('SCREENING', 'TECHNICAL', 'MANAGEMENT', 'HR', 'FINAL');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'IN_PERSON', 'TELEPHONIC');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'DO_NOT_HIRE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'DIRECT_APPLICATION',
    "referral_details" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "vacancy_id" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'SCREENING',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "cover_letter" TEXT,
    "resume_url" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejection_reason" TEXT,
    "withdrawn_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_interviews" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "interview_type" "InterviewType" NOT NULL DEFAULT 'TECHNICAL',
    "interview_mode" "InterviewMode" NOT NULL DEFAULT 'ONLINE',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "interviewer_user_id" TEXT,
    "interviewer_name" TEXT,
    "location" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rating" INTEGER,
    "recommendation" "InterviewRecommendation",
    "feedback" TEXT,
    "feedback_submitted_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_stage" "ApplicationStage",
    "to_stage" "ApplicationStage" NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "notes" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "vacancy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "role_title" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "work_mode" "WorkMode" NOT NULL DEFAULT 'ON_SITE',
    "location" TEXT,
    "offered_salary" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "salary_period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "proposed_start_date" TEXT NOT NULL,
    "offer_expiry_date" TEXT NOT NULL,
    "notes" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "requested_by_id" TEXT NOT NULL,
    "last_modified_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "response_notes" TEXT,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offer_history" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL,
    "offered_salary" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "proposed_start_date" TEXT NOT NULL,
    "offer_expiry_date" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_offer_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_business_id_key" ON "candidates"("business_id");
CREATE INDEX "candidates_email_idx" ON "candidates"("email");
CREATE INDEX "candidates_created_by_id_idx" ON "candidates"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_business_id_key" ON "job_applications"("business_id");
CREATE UNIQUE INDEX "job_applications_vacancy_id_candidate_id_key" ON "job_applications"("vacancy_id", "candidate_id");
CREATE INDEX "job_applications_vacancy_id_status_idx" ON "job_applications"("vacancy_id", "status");
CREATE INDEX "job_applications_candidate_id_idx" ON "job_applications"("candidate_id");
CREATE INDEX "job_applications_stage_idx" ON "job_applications"("stage");

-- CreateIndex
CREATE INDEX "candidate_interviews_application_id_status_idx" ON "candidate_interviews"("application_id", "status");
CREATE INDEX "candidate_interviews_interviewer_user_id_idx" ON "candidate_interviews"("interviewer_user_id");

-- CreateIndex
CREATE INDEX "application_stage_history_application_id_idx" ON "application_stage_history"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_business_id_key" ON "job_offers"("business_id");
CREATE INDEX "job_offers_application_id_idx" ON "job_offers"("application_id");
CREATE INDEX "job_offers_vacancy_id_status_idx" ON "job_offers"("vacancy_id", "status");
CREATE INDEX "job_offers_status_idx" ON "job_offers"("status");

-- CreateIndex
CREATE INDEX "job_offer_history_offer_id_version_idx" ON "job_offer_history"("offer_id", "version");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_interviewer_user_id_fkey" FOREIGN KEY ("interviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_interviews" ADD CONSTRAINT "candidate_interviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_last_modified_by_id_fkey" FOREIGN KEY ("last_modified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offer_history" ADD CONSTRAINT "job_offer_history_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_offer_history" ADD CONSTRAINT "job_offer_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert Sequences for Candidate, Application, Offer Business IDs
INSERT INTO "sequences" ("entity_type", "next_number", "prefix", "padding")
VALUES 
  ('CAN', 1, 'CAN', 4),
  ('APP', 1, 'APP', 4),
  ('OFF', 1, 'OFF', 4)
ON CONFLICT ("entity_type") DO NOTHING;
