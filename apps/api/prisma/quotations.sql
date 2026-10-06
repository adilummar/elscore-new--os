-- CreateTable
CREATE TABLE IF NOT EXISTS "pricing_slabs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "grade_from" INTEGER NOT NULL,
    "grade_to" INTEGER NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    CONSTRAINT "pricing_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exceptional_subject_rates" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    CONSTRAINT "exceptional_subject_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "finance_settings" (
    "id" TEXT NOT NULL,
    "registration_fee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "quotations" (
    "id" TEXT NOT NULL,
    "quotation_number" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "quotation_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "student_name" TEXT NOT NULL,
    "curriculum_name" TEXT NOT NULL,
    "grade_name" TEXT NOT NULL,
    "normal_monthly_total" DECIMAL(10,2) NOT NULL,
    "offer_hourly_rate" DECIMAL(10,2),
    "offer_monthly_total" DECIMAL(10,2),
    "saving_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saving_percentage" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "registration_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount_due" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "quotation_line_items" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "monthly_hours" DECIMAL(10,2) NOT NULL,
    "original_hourly_rate" DECIMAL(10,2) NOT NULL,
    "applied_offer_hourly_rate" DECIMAL(10,2),
    "normal_monthly_amount" DECIMAL(10,2) NOT NULL,
    "offer_monthly_amount" DECIMAL(10,2),
    CONSTRAINT "quotation_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_slabs_business_id_key" ON "pricing_slabs"("business_id");
CREATE INDEX IF NOT EXISTS "pricing_slabs_curriculum_id_is_active_idx" ON "pricing_slabs"("curriculum_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "exceptional_subject_rates_business_id_key" ON "exceptional_subject_rates"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "exceptional_subject_rates_subject_id_key" ON "exceptional_subject_rates"("subject_id");
CREATE INDEX IF NOT EXISTS "exceptional_subject_rates_subject_id_is_active_idx" ON "exceptional_subject_rates"("subject_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_quotation_number_key" ON "quotations"("quotation_number");
CREATE INDEX IF NOT EXISTS "quotations_student_id_idx" ON "quotations"("student_id");
CREATE INDEX IF NOT EXISTS "quotations_lead_id_idx" ON "quotations"("lead_id");
CREATE INDEX IF NOT EXISTS "quotations_quotation_number_idx" ON "quotations"("quotation_number");
CREATE INDEX IF NOT EXISTS "quotation_line_items_quotation_id_idx" ON "quotation_line_items"("quotation_id");

-- AddForeignKey
ALTER TABLE "pricing_slabs" ADD CONSTRAINT "pricing_slabs_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exceptional_subject_rates" ADD CONSTRAINT "exceptional_subject_rates_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
