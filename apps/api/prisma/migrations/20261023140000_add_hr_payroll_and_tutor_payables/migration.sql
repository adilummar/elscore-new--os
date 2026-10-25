-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateTable
CREATE TABLE "employee_payroll_runs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "total_gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "finalized_by_user_id" TEXT,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_items" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "compensation_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "base_salary" DECIMAL(12,2) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "payment_status" "PayrollPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "paid_by_user_id" TEXT,
    "payment_reference" TEXT,
    "payment_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_payable_runs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "class_count" INTEGER NOT NULL DEFAULT 0,
    "tutor_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "finalized_by_user_id" TEXT,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_payable_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_payable_items" (
    "id" TEXT NOT NULL,
    "payable_run_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "class_record_id" TEXT NOT NULL,
    "tutor_rate_id" TEXT,
    "class_date" TIMESTAMP(3) NOT NULL,
    "worked_minutes" INTEGER NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_status" "PayrollPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "paid_by_user_id" TEXT,
    "payment_reference" TEXT,
    "payment_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_payable_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_runs_business_id_key" ON "employee_payroll_runs"("business_id");
CREATE INDEX "employee_payroll_runs_status_period_start_period_end_idx" ON "employee_payroll_runs"("status", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_items_payroll_run_id_employee_id_key" ON "employee_payroll_items"("payroll_run_id", "employee_id");
CREATE INDEX "employee_payroll_items_employee_id_payment_status_idx" ON "employee_payroll_items"("employee_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_payable_runs_business_id_key" ON "tutor_payable_runs"("business_id");
CREATE INDEX "tutor_payable_runs_status_period_start_period_end_idx" ON "tutor_payable_runs"("status", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_payable_items_payable_run_id_class_record_id_key" ON "tutor_payable_items"("payable_run_id", "class_record_id");
CREATE INDEX "tutor_payable_items_tutor_id_payment_status_idx" ON "tutor_payable_items"("tutor_id", "payment_status");
CREATE INDEX "tutor_payable_items_class_record_id_idx" ON "tutor_payable_items"("class_record_id");

-- AddForeignKey
ALTER TABLE "employee_payroll_runs" ADD CONSTRAINT "employee_payroll_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_runs" ADD CONSTRAINT "employee_payroll_runs_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_items" ADD CONSTRAINT "employee_payroll_items_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "employee_payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_items" ADD CONSTRAINT "employee_payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_items" ADD CONSTRAINT "employee_payroll_items_compensation_id_fkey" FOREIGN KEY ("compensation_id") REFERENCES "employee_compensations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_items" ADD CONSTRAINT "employee_payroll_items_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_payable_runs" ADD CONSTRAINT "tutor_payable_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_runs" ADD CONSTRAINT "tutor_payable_runs_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_payable_run_id_fkey" FOREIGN KEY ("payable_run_id") REFERENCES "tutor_payable_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_class_record_id_fkey" FOREIGN KEY ("class_record_id") REFERENCES "tutor_class_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_tutor_rate_id_fkey" FOREIGN KEY ("tutor_rate_id") REFERENCES "tutor_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tutor_payable_items" ADD CONSTRAINT "tutor_payable_items_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: Partial unique indexes ensuring at most one finalized run per period in database
CREATE UNIQUE INDEX "employee_payroll_runs_finalized_period_unique" ON "employee_payroll_runs"("period_start", "period_end") WHERE "status" = 'FINALIZED';
CREATE UNIQUE INDEX "tutor_payable_runs_finalized_period_unique" ON "tutor_payable_runs"("period_start", "period_end") WHERE "status" = 'FINALIZED';
