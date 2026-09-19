-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('ACTIVE', 'ON_BREAK', 'COMPLETED', 'AUTO_CHECKED_OUT');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT', 'AUTO_CHECK_OUT', 'AUTO_BREAK_END');

-- CreateTable
CREATE TABLE "global_working_schedules" (
    "id" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "global_working_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendance_sessions" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "calendar_date" TEXT NOT NULL,
    "schedule_snapshot" JSONB NOT NULL,
    "status" "AttendanceSessionStatus" NOT NULL,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "gross_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "break_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "net_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendance_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "AttendanceEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "is_invalidated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendance_corrections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "original_event_id" TEXT NOT NULL,
    "new_event_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "corrected_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_working_schedules_effective_from_idx" ON "global_working_schedules"("effective_from" DESC);

-- CreateIndex
CREATE INDEX "employee_attendance_sessions_employee_id_calendar_date_idx" ON "employee_attendance_sessions"("employee_id", "calendar_date");

-- CreateIndex
CREATE INDEX "employee_attendance_sessions_status_idx" ON "employee_attendance_sessions"("status");

-- CreateIndex
CREATE INDEX "employee_attendance_events_session_id_idx" ON "employee_attendance_events"("session_id");

-- CreateIndex
CREATE INDEX "employee_attendance_events_timestamp_idx" ON "employee_attendance_events"("timestamp");

-- CreateIndex
CREATE INDEX "employee_attendance_corrections_session_id_idx" ON "employee_attendance_corrections"("session_id");

-- AddForeignKey
ALTER TABLE "employee_attendance_sessions" ADD CONSTRAINT "employee_attendance_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_events" ADD CONSTRAINT "employee_attendance_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "employee_attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_corrections" ADD CONSTRAINT "employee_attendance_corrections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "employee_attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_corrections" ADD CONSTRAINT "employee_attendance_corrections_original_event_id_fkey" FOREIGN KEY ("original_event_id") REFERENCES "employee_attendance_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_corrections" ADD CONSTRAINT "employee_attendance_corrections_new_event_id_fkey" FOREIGN KEY ("new_event_id") REFERENCES "employee_attendance_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_corrections" ADD CONSTRAINT "employee_attendance_corrections_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
