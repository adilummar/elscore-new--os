-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "employee_leave_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendance_leave_unlocks" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_request_id" TEXT NOT NULL,
    "calendar_date" TEXT NOT NULL,
    "unlocked_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attendance_leave_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_leave_requests_employee_id_status_idx" ON "employee_leave_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "employee_leave_requests_status_start_date_end_date_idx" ON "employee_leave_requests"("status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "employee_attendance_leave_unlocks_leave_request_id_idx" ON "employee_attendance_leave_unlocks"("leave_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_attendance_leave_unlocks_employee_id_calendar_date_leave_request_id_key" ON "employee_attendance_leave_unlocks"("employee_id", "calendar_date", "leave_request_id");

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_leave_unlocks" ADD CONSTRAINT "employee_attendance_leave_unlocks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_leave_unlocks" ADD CONSTRAINT "employee_attendance_leave_unlocks_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "employee_leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance_leave_unlocks" ADD CONSTRAINT "employee_attendance_leave_unlocks_unlocked_by_user_id_fkey" FOREIGN KEY ("unlocked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
