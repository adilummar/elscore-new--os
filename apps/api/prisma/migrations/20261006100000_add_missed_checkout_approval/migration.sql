-- Refuse to add one-session-per-day uniqueness while duplicate data exists.
-- Staging must adjudicate any rows reported by this check before applying.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "employee_attendance_sessions"
    GROUP BY "employee_id", "calendar_date"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate employee attendance sessions exist for the same employee and calendar date';
  END IF;
END $$;

CREATE TYPE "MissedCheckoutCaseStatus" AS ENUM (
  'REQUIRED',
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RESOLVED'
);

CREATE TABLE "employee_missed_checkout_cases" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "status" "MissedCheckoutCaseStatus" NOT NULL DEFAULT 'REQUIRED',
  "requested_at" TIMESTAMP(3),
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "resolved_by_user_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_missed_checkout_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_attendance_sessions_employee_id_calendar_date_key"
  ON "employee_attendance_sessions"("employee_id", "calendar_date");

CREATE UNIQUE INDEX "employee_missed_checkout_cases_session_id_key"
  ON "employee_missed_checkout_cases"("session_id");

CREATE INDEX "employee_missed_checkout_cases_employee_id_status_idx"
  ON "employee_missed_checkout_cases"("employee_id", "status");

CREATE INDEX "employee_missed_checkout_cases_status_requested_at_idx"
  ON "employee_missed_checkout_cases"("status", "requested_at");

ALTER TABLE "employee_missed_checkout_cases"
  ADD CONSTRAINT "employee_missed_checkout_cases_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "employee_attendance_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_missed_checkout_cases"
  ADD CONSTRAINT "employee_missed_checkout_cases_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_missed_checkout_cases"
  ADD CONSTRAINT "employee_missed_checkout_cases_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_missed_checkout_cases"
  ADD CONSTRAINT "employee_missed_checkout_cases_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
