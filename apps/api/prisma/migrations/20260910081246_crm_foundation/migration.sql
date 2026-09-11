-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('META_FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBSITE', 'REFERRAL', 'DIRECT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadCreationChannel" AS ENUM ('INTEGRATION', 'SALES_HEAD', 'SALES_COUNSELLOR');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'DEMO_BOOKED', 'DEMO_COMPLETED', 'NEGOTIATION', 'NURTURE', 'ENROLLED', 'PAID', 'NOT_INTERESTED', 'NO_RESPONSE', 'LOST', 'JUNK');

-- CreateEnum
CREATE TYPE "EnrollmentState" AS ENUM ('PENDING', 'ENROLLED', 'NOT_ENROLLING');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "primary_phone" TEXT NOT NULL,
    "alt_phone_1" TEXT,
    "alt_phone_2" TEXT,
    "source" "LeadSource" NOT NULL,
    "creation_channel" "LeadCreationChannel" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "archived_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "school_name" TEXT,
    "current_grade" TEXT,
    "city_location" TEXT,
    "notes" TEXT,
    "enrollment_state" "EnrollmentState" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "syllabus" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "old_status" "LeadStatus",
    "new_status" "LeadStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignment_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "old_owner_user_id" TEXT,
    "new_owner_user_id" TEXT,
    "reason" TEXT,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_notes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_business_id_key" ON "leads"("business_id");

-- CreateIndex
CREATE INDEX "leads_assigned_to_user_id_idx" ON "leads"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "leads_primary_phone_idx" ON "leads"("primary_phone");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_is_archived_idx" ON "leads"("is_archived");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_business_id_key" ON "students"("business_id");

-- CreateIndex
CREATE INDEX "students_lead_id_idx" ON "students"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_business_id_key" ON "requirements"("business_id");

-- CreateIndex
CREATE INDEX "requirements_student_id_idx" ON "requirements"("student_id");

-- CreateIndex
CREATE INDEX "lead_status_history_lead_id_changed_at_idx" ON "lead_status_history"("lead_id", "changed_at");

-- CreateIndex
CREATE INDEX "lead_assignment_history_lead_id_assigned_at_idx" ON "lead_assignment_history"("lead_id", "assigned_at");

-- CreateIndex
CREATE INDEX "sales_notes_lead_id_idx" ON "sales_notes"("lead_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_old_owner_user_id_fkey" FOREIGN KEY ("old_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_new_owner_user_id_fkey" FOREIGN KEY ("new_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_history" ADD CONSTRAINT "lead_assignment_history_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_notes" ADD CONSTRAINT "sales_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_notes" ADD CONSTRAINT "sales_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
