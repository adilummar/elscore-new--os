-- PROPOSED, NOT APPLIED. Tutor Management Training (Step 2). Run only after tutor_hiring_phase_a.sql.
-- Additive only: five new tables and one enum; no existing table or column is changed.
-- Generated with `prisma migrate diff` from the Step 1 schema to the Step 2 schema.

-- CreateEnum
CREATE TYPE "TutorTrainingAttendance" AS ENUM ('ATTENDED', 'NOT_ATTENDED', 'ATTENDED_NOT_COMPLETED');

-- CreateTable
CREATE TABLE "tutor_training_sessions" (
    "id" TEXT NOT NULL,
    "session_number" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "conductor_user_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_training_session_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "previous_scheduled_at" TIMESTAMP(3) NOT NULL,
    "new_scheduled_at" TIMESTAMP(3) NOT NULL,
    "previous_conductor_user_id" TEXT NOT NULL,
    "new_conductor_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_training_session_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_training_enrolments" (
    "id" TEXT NOT NULL,
    "tutor_lead_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by_user_id" TEXT NOT NULL,
    "session1_passed_at" TIMESTAMP(3),
    "session2_passed_at" TIMESTAMP(3),

    CONSTRAINT "tutor_training_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_training_attempts" (
    "id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "session_number" INTEGER NOT NULL,
    "attendance" "TutorTrainingAttendance",
    "task_completed" BOOLEAN,
    "remarks" TEXT,
    "added_by_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" TEXT,
    "recorded_at" TIMESTAMP(3),

    CONSTRAINT "tutor_training_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_training_attempt_corrections" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "previous_attendance" "TutorTrainingAttendance" NOT NULL,
    "previous_task_completed" BOOLEAN NOT NULL,
    "previous_remarks" TEXT,
    "new_attendance" "TutorTrainingAttendance" NOT NULL,
    "new_task_completed" BOOLEAN NOT NULL,
    "new_remarks" TEXT,
    "reason" TEXT NOT NULL,
    "corrected_by_user_id" TEXT NOT NULL,
    "corrected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_training_attempt_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_training_sessions_scheduled_at_idx" ON "tutor_training_sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "tutor_training_sessions_conductor_user_id_scheduled_at_idx" ON "tutor_training_sessions"("conductor_user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "tutor_training_session_history_session_id_idx" ON "tutor_training_session_history"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_training_enrolments_tutor_lead_id_key" ON "tutor_training_enrolments"("tutor_lead_id");

-- CreateIndex
CREATE INDEX "tutor_training_enrolments_session2_passed_at_idx" ON "tutor_training_enrolments"("session2_passed_at");

-- CreateIndex
CREATE INDEX "tutor_training_attempts_enrolment_id_session_number_idx" ON "tutor_training_attempts"("enrolment_id", "session_number");

-- CreateIndex
CREATE INDEX "tutor_training_attempts_session_id_idx" ON "tutor_training_attempts"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_training_attempts_enrolment_id_session_id_key" ON "tutor_training_attempts"("enrolment_id", "session_id");

-- CreateIndex
CREATE INDEX "tutor_training_attempt_corrections_attempt_id_idx" ON "tutor_training_attempt_corrections"("attempt_id");

-- AddForeignKey
ALTER TABLE "tutor_training_sessions" ADD CONSTRAINT "tutor_training_sessions_conductor_user_id_fkey" FOREIGN KEY ("conductor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_sessions" ADD CONSTRAINT "tutor_training_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_session_history" ADD CONSTRAINT "tutor_training_session_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tutor_training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_session_history" ADD CONSTRAINT "tutor_training_session_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_enrolments" ADD CONSTRAINT "tutor_training_enrolments_tutor_lead_id_fkey" FOREIGN KEY ("tutor_lead_id") REFERENCES "tutor_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_enrolments" ADD CONSTRAINT "tutor_training_enrolments_enrolled_by_user_id_fkey" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempts" ADD CONSTRAINT "tutor_training_attempts_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "tutor_training_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempts" ADD CONSTRAINT "tutor_training_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tutor_training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempts" ADD CONSTRAINT "tutor_training_attempts_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempts" ADD CONSTRAINT "tutor_training_attempts_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempt_corrections" ADD CONSTRAINT "tutor_training_attempt_corrections_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "tutor_training_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_training_attempt_corrections" ADD CONSTRAINT "tutor_training_attempt_corrections_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

