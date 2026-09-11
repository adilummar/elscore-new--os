-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "demos" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "tutor_id" TEXT,
    "status" "DemoStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "subject_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "booked_by_user_id" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_reschedule_history" (
    "id" TEXT NOT NULL,
    "demo_id" TEXT NOT NULL,
    "previous_scheduled_at" TIMESTAMP(3) NOT NULL,
    "new_scheduled_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "rescheduled_by_user_id" TEXT NOT NULL,
    "rescheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_reschedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_feedback" (
    "id" TEXT NOT NULL,
    "demo_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demos_business_id_key" ON "demos"("business_id");

-- CreateIndex
CREATE INDEX "demos_student_id_idx" ON "demos"("student_id");

-- CreateIndex
CREATE INDEX "demos_tutor_id_scheduled_at_idx" ON "demos"("tutor_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "demos_status_idx" ON "demos"("status");

-- CreateIndex
CREATE INDEX "demo_reschedule_history_demo_id_idx" ON "demo_reschedule_history"("demo_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_feedback_demo_id_key" ON "demo_feedback"("demo_id");

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_reschedule_history" ADD CONSTRAINT "demo_reschedule_history_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_reschedule_history" ADD CONSTRAINT "demo_reschedule_history_rescheduled_by_user_id_fkey" FOREIGN KEY ("rescheduled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_feedback" ADD CONSTRAINT "demo_feedback_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "demos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_feedback" ADD CONSTRAINT "demo_feedback_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
