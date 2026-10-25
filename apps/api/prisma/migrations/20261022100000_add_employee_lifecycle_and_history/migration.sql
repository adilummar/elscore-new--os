-- AlterEnum
ALTER TYPE "EmploymentStatus" ADD VALUE 'PROBATION';
ALTER TYPE "EmploymentStatus" ADD VALUE 'NOTICE_PERIOD';
ALTER TYPE "EmploymentStatus" ADD VALUE 'SUSPENDED';

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "address" TEXT,
ADD COLUMN     "confirmation_date" TEXT,
ADD COLUMN     "date_of_birth" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "emergency_contact_relation" TEXT,
ADD COLUMN     "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "last_working_date" TEXT,
ADD COLUMN     "notice_period_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "personal_email" TEXT,
ADD COLUMN     "probation_end_date" TEXT,
ADD COLUMN     "reporting_manager_id" TEXT,
ADD COLUMN     "resignation_date" TEXT;

-- CreateTable
CREATE TABLE "employee_status_history" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "previous_status" "EmploymentStatus" NOT NULL,
    "new_status" "EmploymentStatus" NOT NULL,
    "effective_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "access_restricted" BOOLEAN NOT NULL DEFAULT false,
    "authorized_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_reporting_manager_id_idx" ON "employees"("reporting_manager_id");

-- CreateIndex
CREATE INDEX "employee_status_history_employee_id_effective_date_idx" ON "employee_status_history"("employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "employee_status_history_authorized_by_user_id_idx" ON "employee_status_history"("authorized_by_user_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
