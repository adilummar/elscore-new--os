-- CreateEnum
CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "TutorClassRecordStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'CORRECTION_REQUESTED');

-- CreateEnum
CREATE TYPE "SessionCancellationReason" AS ENUM ('NOT_CANCELLED', 'ACADEMY_CANCELLED', 'TUTOR_CANCELLED', 'STUDENT_CANCELLED', 'TUTOR_NO_SHOW');

-- CreateTable
CREATE TABLE "student_attendances" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tutor_class_record_id" TEXT,
    "status" "StudentAttendanceStatus" NOT NULL,
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "marked_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "correction_reason" TEXT,
    "corrected_by_user_id" TEXT,
    "corrected_at" TIMESTAMP(3),

    CONSTRAINT "student_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_class_records" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "status" "TutorClassRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "cancellation" "SessionCancellationReason" NOT NULL DEFAULT 'NOT_CANCELLED',
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "worked_minutes" INTEGER,
    "applied_rate" DECIMAL(10,2),
    "currency" TEXT,
    "rate_grade" TEXT,
    "rate_subject" TEXT,
    "submitted_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "is_payroll_ready" BOOLEAN NOT NULL DEFAULT false,
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "correction_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_class_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_attendances_business_id_key" ON "student_attendances"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendances_session_id_student_id_key" ON "student_attendances"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_class_records_business_id_key" ON "tutor_class_records"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_class_records_session_id_tutor_id_key" ON "tutor_class_records"("session_id", "tutor_id");

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_tutor_class_record_id_fkey" FOREIGN KEY ("tutor_class_record_id") REFERENCES "tutor_class_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_class_records" ADD CONSTRAINT "tutor_class_records_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
