-- CreateEnum
CREATE TYPE "CompensationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_salary" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "pan_number" TEXT,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensation_change_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "current_base_salary" DECIMAL(12,2),
    "requested_base_salary" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "pan_number" TEXT,
    "effective_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CompensationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "is_applied" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3),
    "requested_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensation_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_rate_change_requests" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "current_hourly_rate" DECIMAL(10,2),
    "requested_hourly_rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "effective_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CompensationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "is_applied" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3),
    "requested_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_rate_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_compensations_employee_id_is_active_idx" ON "employee_compensations"("employee_id", "is_active");
CREATE INDEX "employee_compensations_employee_id_effective_from_idx" ON "employee_compensations"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_compensation_change_requests_employee_id_status_idx" ON "employee_compensation_change_requests"("employee_id", "status");
CREATE INDEX "employee_compensation_change_requests_status_effective_date_idx" ON "employee_compensation_change_requests"("status", "effective_date");
CREATE INDEX "employee_compensation_change_requests_requested_by_user_id_idx" ON "employee_compensation_change_requests"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "tutor_rate_change_requests_tutor_profile_id_status_idx" ON "tutor_rate_change_requests"("tutor_profile_id", "status");
CREATE INDEX "tutor_rate_change_requests_status_effective_date_idx" ON "tutor_rate_change_requests"("status", "effective_date");
CREATE INDEX "tutor_rate_change_requests_requested_by_user_id_idx" ON "tutor_rate_change_requests"("requested_by_user_id");

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensation_change_requests" ADD CONSTRAINT "employee_compensation_change_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_compensation_change_requests" ADD CONSTRAINT "employee_compensation_change_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_compensation_change_requests" ADD CONSTRAINT "employee_compensation_change_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_rate_change_requests" ADD CONSTRAINT "tutor_rate_change_requests_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_rate_change_requests" ADD CONSTRAINT "tutor_rate_change_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_rate_change_requests" ADD CONSTRAINT "tutor_rate_change_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
