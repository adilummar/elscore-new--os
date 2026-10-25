-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "VacancyPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vacancies" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "role_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "work_mode" "WorkMode" NOT NULL DEFAULT 'ON_SITE',
    "location" TEXT,
    "target_headcount" INTEGER NOT NULL DEFAULT 1,
    "filled_headcount" INTEGER NOT NULL DEFAULT 0,
    "priority" "VacancyPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "VacancyStatus" NOT NULL DEFAULT 'DRAFT',
    "justification" TEXT NOT NULL,
    "target_start_date" TEXT,
    "target_closure_date" TEXT,
    "budget_min" DECIMAL(12,2),
    "budget_max" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vacancies_business_id_key" ON "vacancies"("business_id");
CREATE INDEX "vacancies_department_id_status_idx" ON "vacancies"("department_id", "status");
CREATE INDEX "vacancies_status_priority_idx" ON "vacancies"("status", "priority");
CREATE INDEX "vacancies_requested_by_user_id_idx" ON "vacancies"("requested_by_user_id");

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert Sequence for Vacancy Business ID
INSERT INTO "sequences" ("entity_type", "next_number", "prefix", "padding")
VALUES ('VAC', 1, 'VAC', 4)
ON CONFLICT ("entity_type") DO NOTHING;

